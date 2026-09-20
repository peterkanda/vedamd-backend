# VedaMD Clinical Decision Support for GNU Health

A Tryton module that evaluates prescription safety when a
`gnuhealth.prescription.order` is created.

Written against **GNU Health 5.0** (the `health` Tryton module).

## Install from the downloaded package

```bash
cd /path/to/trytond/modules
unzip /path/to/vedamd-gnu-health-<version>.zip   # creates vedamd_cds/ — keep the name
trytond-admin -c /path/to/trytond.conf -d <database> -u vedamd_cds --activate-dependencies
```

Then restart `trytond`.

## Configure

**Health → Configuration → VedaMD Configuration**. The access rules
restrict this record, including the API key, to `health.group_health_admin`.

| Field | Default |
|---|---|
| Enabled | yes |
| VedaMD base URL | `https://api.vedamd.io` |
| API key | — required |
| CDS service id | `vedamd-order-select` |
| Timeout (seconds) | 4 |

## What gets sent

Field names verified against GNU Health 5.0.6 `health.py`:

| GNU Health | VedaMD context |
|---|---|
| `patient.dob` | `ageYears`, `ageMonths` (under-fives) |
| `patient.gender` (`m` / `f`) | `sex` — `nb` and `other` are omitted, not guessed |
| `prescription_line.medicament.active_component` (else `rec_name`) | `draftMedications` |
| `patient.medications` where `is_active` | `medications` |
| `patient.diseases` where `is_active` → `pathology.code`, `.name` | `diagnoses` (`ICD10:` code plus label) |

Weight is **not** sent: `gnuhealth.patient` has no weight field in 5.0 —
it lives on patient evaluations — and a stale value would be worse than
none. Healed diseases and discontinued medications are excluded, because
sending them as current would fire rules for things the patient no
longer has.

## Behaviour

Cards are appended to the prescription's **Notes** and logged.
Prescribing is never blocked: a failed or slow VedaMD call logs its
failure class and returns nothing.

For an interrupting dialog instead, call `vedamd_evaluate` from a wizard
on the prescription form, where raising `UserWarning` is appropriate.
Doing it inside `create` would abort the transaction and lose the
prescription.

## Tests

```bash
python3 -m unittest discover -s tests
```

Tryton is stubbed, so the model mapping is tested without a running pool.

## Status

Field and XML ids (`health.gnuhealth_conf_menu`,
`health.group_health_admin`) are verified against GNU Health 5.0.6. The
module has **not** been loaded into a live GNU Health instance — install
it on a test database first.
