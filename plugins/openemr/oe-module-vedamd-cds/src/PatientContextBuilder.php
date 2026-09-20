<?php

namespace VedaMD\CDS;

/**
 * Builds a VedaMD CDS Hooks context from OpenEMR's own tables.
 *
 * OpenEMR is not a FHIR server internally, so translating rows into
 * FHIR resources only to have VedaMD translate them back would add a
 * lossy hop for nothing. We emit VedaMD's flat dialect directly.
 *
 * UNIT HANDLING — read before changing anything here.
 * OpenEMR stores vitals in US customary units regardless of the
 * `units_of_measurement` display setting: `form_vitals.weight` is in
 * POUNDS, `height` in INCHES, `temperature` in FAHRENHEIT (see
 * C_FormVitals.class.php, which declares 'unit' => 'lbs' with 'kg'
 * only as the metric display conversion).
 *
 * VedaMD's context is metric and unit-suffixed. Getting this backwards
 * is not a cosmetic bug: a 70 kg adult sent as 70 lbs (31.8 kg) halves
 * every weight-based paediatric dose the engine computes.
 */
class PatientContextBuilder
{
    private const LBS_TO_KG = 0.45359237;
    private const INCHES_TO_CM = 2.54;

    /** @var callable */
    private $query;

    /**
     * @param callable|null $query fn(string $sql, array $binds): iterable
     *                             Defaults to OpenEMR's sqlStatement().
     */
    public function __construct(?callable $query = null)
    {
        $this->query = $query ?? function (string $sql, array $binds) {
            $result = sqlStatement($sql, $binds);
            $rows = [];
            while ($row = sqlFetchArray($result)) {
                $rows[] = $row;
            }
            return $rows;
        };
    }

    public function build(int $pid): array
    {
        $context = [];

        $this->addDemographics($pid, $context);
        $this->addMedications($pid, $context);
        $this->addProblems($pid, $context);
        $this->addAllergies($pid, $context);
        $this->addVitals($pid, $context);

        return $context;
    }

    private function addDemographics(int $pid, array &$context): void
    {
        $rows = ($this->query)(
            'SELECT DOB, sex FROM patient_data WHERE pid = ? LIMIT 1',
            [$pid]
        );
        if (empty($rows)) {
            return;
        }
        $row = $rows[0];

        if (!empty($row['DOB']) && $row['DOB'] !== '0000-00-00') {
            $dob = \DateTimeImmutable::createFromFormat('Y-m-d', substr((string) $row['DOB'], 0, 10));
            if ($dob instanceof \DateTimeImmutable) {
                $diff = $dob->diff(new \DateTimeImmutable('today'));
                if ($diff->invert === 0) {
                    $context['ageYears'] = $diff->y;
                    if ($diff->y < 5) {
                        $context['ageMonths'] = ($diff->y * 12) + $diff->m;
                    }
                    if ($diff->y === 0 && $diff->m < 2) {
                        $context['ageDays'] = (int) $diff->days;
                    }
                }
            }
        }

        $sex = strtolower(trim((string) ($row['sex'] ?? '')));
        if ($sex === 'male' || $sex === 'female') {
            $context['sex'] = $sex;
        }
    }

    private function addMedications(int $pid, array &$context): void
    {
        // Active prescriptions, plus medications recorded on the problem
        // list — sites use one, the other, or both, and a safety check
        // that silently ignores half the med list is worse than none.
        $prescriptions = ($this->query)(
            "SELECT drug, rxnorm_drugcode FROM prescriptions
              WHERE patient_id = ? AND active = 1
                AND (end_date IS NULL OR end_date = '0000-00-00' OR end_date >= CURDATE())",
            [$pid]
        );

        $listed = ($this->query)(
            "SELECT title FROM lists
              WHERE pid = ? AND type = 'medication' AND activity = 1
                AND (enddate IS NULL OR enddate = '0000-00-00' OR enddate >= CURDATE())",
            [$pid]
        );

        $medications = [];
        foreach ($prescriptions as $row) {
            // RxNorm when the site records it — an exact code beats a
            // dispensing label such as "Amoxil 500mg cap" every time.
            $code = trim((string) ($row['rxnorm_drugcode'] ?? ''));
            $name = trim((string) ($row['drug'] ?? ''));
            if ($code !== '') {
                $medications[] = ['code' => $code, 'system' => 'rxnorm', 'name' => $name];
            } elseif ($name !== '') {
                $medications[] = $name;
            }
        }
        foreach ($listed as $row) {
            $name = trim((string) ($row['title'] ?? ''));
            if ($name !== '') {
                $medications[] = $name;
            }
        }

        if ($medications !== []) {
            // VedaMD accepts plain names and {code,system,name} objects in
            // the same list; it resolves each independently.
            $context['medications'] = array_values($medications);
        }
    }

    private function addProblems(int $pid, array &$context): void
    {
        $rows = ($this->query)(
            "SELECT title, diagnosis FROM lists
              WHERE pid = ? AND type = 'medical_problem' AND activity = 1
                AND (enddate IS NULL OR enddate = '0000-00-00' OR enddate >= CURDATE())",
            [$pid]
        );

        $diagnoses = [];
        foreach ($rows as $row) {
            $title = trim((string) ($row['title'] ?? ''));
            if ($title !== '') {
                $diagnoses[] = strtolower($title);
            }
            // `diagnosis` holds coded values as "ICD10:E11.9;SNOMED:44054006".
            foreach (explode(';', (string) ($row['diagnosis'] ?? '')) as $coded) {
                $coded = trim($coded);
                if ($coded !== '') {
                    $diagnoses[] = $coded;
                }
            }
        }

        if ($diagnoses !== []) {
            $context['diagnoses'] = array_values(array_unique($diagnoses));
        }
    }

    private function addAllergies(int $pid, array &$context): void
    {
        $rows = ($this->query)(
            "SELECT title FROM lists
              WHERE pid = ? AND type = 'allergy' AND activity = 1
                AND (enddate IS NULL OR enddate = '0000-00-00' OR enddate >= CURDATE())",
            [$pid]
        );

        $allergies = [];
        foreach ($rows as $row) {
            $title = trim((string) ($row['title'] ?? ''));
            if ($title !== '') {
                $allergies[] = $title;
            }
        }

        if ($allergies !== []) {
            $context['allergies'] = array_values(array_unique($allergies));
        }
    }

    private function addVitals(int $pid, array &$context): void
    {
        $rows = ($this->query)(
            'SELECT bps, bpd, weight, height, temperature, pulse, respiration, oxygen_saturation
               FROM form_vitals
              WHERE pid = ? AND activity = 1
              ORDER BY date DESC
              LIMIT 1',
            [$pid]
        );
        if (empty($rows)) {
            return;
        }
        $v = $rows[0];

        // Systolic and diastolic are already mmHg.
        $this->setNumeric($context, 'systolicMmHg', $v['bps'] ?? null, 40, 300);
        $this->setNumeric($context, 'diastolicMmHg', $v['bpd'] ?? null, 10, 200);
        $this->setNumeric($context, 'heartRatePerMin', $v['pulse'] ?? null, 20, 300);
        $this->setNumeric($context, 'respiratoryRatePerMin', $v['respiration'] ?? null, 4, 120);
        $this->setNumeric($context, 'oxygenSatPercent', $v['oxygen_saturation'] ?? null, 20, 100);

        // Stored US customary — convert before sending. See class docblock.
        $weightLbs = $this->numeric($v['weight'] ?? null);
        if ($weightLbs !== null) {
            $this->setNumeric($context, 'weightKg', $weightLbs * self::LBS_TO_KG, 0.3, 400);
        }

        $heightInches = $this->numeric($v['height'] ?? null);
        if ($heightInches !== null) {
            $this->setNumeric($context, 'heightCm', $heightInches * self::INCHES_TO_CM, 20, 260);
        }

        $tempF = $this->numeric($v['temperature'] ?? null);
        if ($tempF !== null) {
            $this->setNumeric($context, 'bodyTempC', ($tempF - 32) * 5 / 9, 25, 45);
        }
    }

    /**
     * Writes a numeric field only when it is present and physiologically
     * plausible. OpenEMR stores 0 for "not recorded" on every vitals
     * column, and a blood pressure of 0 would read as profound shock.
     */
    private function setNumeric(array &$context, string $field, $value, float $min, float $max): void
    {
        $number = $this->numeric($value);
        if ($number === null || $number < $min || $number > $max) {
            return;
        }
        $context[$field] = round($number, 2);
    }

    private function numeric($value): ?float
    {
        if ($value === null || $value === '' || !is_numeric($value)) {
            return null;
        }
        $number = (float) $value;
        return $number == 0.0 ? null : $number;
    }
}
