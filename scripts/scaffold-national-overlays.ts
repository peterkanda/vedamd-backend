#!/usr/bin/env ts-node
/**
 * Scaffold the factual national-divergent overlays (routine immunization
 * schedule + immediately-notifiable disease list) for an expansion country.
 *
 *   npm run overlays:scaffold -- ET NG GH ZA ZM MW
 *
 * Emits content/overlays/<CC>/records/{immunization-schedule,notifiable-diseases}.json
 * as DRAFT, jurisdiction-tagged, cited to the national MoH — the same shape a
 * clinician then verifies against the national source and signs off. It does
 * NOT author dosing/first-line regimens (those are clinically-divergent and
 * authored separately). Per-country nuances (schedule timing, surveillance
 * framework, country-specific notifiable diseases) live in COUNTRY_PARAMS so
 * the output is honest per country rather than a blind copy.
 *
 * After scaffolding, run `npm run content:ingest -- <CC>` so overlay.json picks
 * up the authored domains, then `npm run overlays:validate`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface VaccineParam {
  slug: string;
  vaccine: string;
  abbrev: string;
  targetDisease: string[];
  domains: string[];
  doses: Array<{ dose: string; timing: string; route?: string }>;
  note?: string;
  population?: { sex?: string; notes?: string };
}

interface NotifiableParam {
  slug: string;
  disease: string;
  domains: string[];
  note?: string;
}

interface CountryParam {
  code: string;
  name: string;
  mohUrl: string;
  /** Citation label for the immunization (EPI) source. */
  epiSource: string;
  /** Citation label for the surveillance/notifiable source. */
  survSource: string;
  /** Primary-series timing for penta/PCV/(OPV 1-3). */
  primarySeries: string;
  /** MCV/MR dose timings. */
  measles: { slug: string; vaccine: string; abbrev: string; mcv1: string; mcv2: string; note?: string };
  /** HPV timing note. */
  hpvTiming: string;
  hpvNote?: string;
  /** Extra, country-specific immediately-notifiable diseases. */
  notifiableExtra?: NotifiableParam[];
  /** Verify note appended to every record (e.g. distinct national schedule). */
  scheduleNote?: string;
  /** Citation label for the national treatment guideline (conditions overlay). */
  natlGuideline: string;
}

const moh = (c: CountryParam, label: string) => ({
  label,
  url: c.mohUrl,
  strength: 'A' as const,
  sourceType: 'guideline' as const,
  licence: 'moh-restricted' as const,
  accessedDate: '2026-06-11',
});

const META = {
  ruleVersion: '0.1.0-draft',
  reviewStatus: 'draft' as const,
  evidenceLevel: 'A' as const,
  verifyBeforeApproval: true,
};

function immunization(c: CountryParam) {
  const extra = c.scheduleNote ? ` ${c.scheduleNote}` : '';
  const cite = moh(c, c.epiSource);
  const vaccines: VaccineParam[] = [
    {
      slug: 'bcg', vaccine: 'BCG (Bacille Calmette-Guérin) vaccine', abbrev: 'BCG',
      targetDisease: ['Tuberculosis (severe paediatric forms)'], domains: ['vaccine-preventable', 'child-health', 'tb'],
      doses: [{ dose: 'Single dose', timing: 'At birth', route: 'intradermal' }],
      population: { notes: `${c.name} routine childhood schedule.` },
    },
    {
      slug: 'opv', vaccine: 'Oral polio vaccine (+ IPV)', abbrev: 'OPV/IPV',
      targetDisease: ['Poliomyelitis'], domains: ['vaccine-preventable', 'child-health'],
      doses: [
        { dose: 'OPV-0', timing: 'At birth', route: 'oral' },
        { dose: 'OPV 1–3', timing: c.primarySeries, route: 'oral' },
        { dose: 'IPV', timing: 'per national schedule', route: 'intramuscular' },
      ],
      note: 'Confirm IPV dose count/timing against the current national schedule.',
    },
    {
      slug: 'pentavalent', vaccine: 'Pentavalent (DPT-HepB-Hib) vaccine', abbrev: 'Penta',
      targetDisease: ['Diphtheria', 'Pertussis', 'Tetanus', 'Hepatitis B', 'Haemophilus influenzae type b'],
      domains: ['vaccine-preventable', 'child-health'],
      doses: [{ dose: 'Dose 1–3', timing: c.primarySeries, route: 'intramuscular' }],
    },
    {
      slug: 'pcv', vaccine: 'Pneumococcal conjugate vaccine', abbrev: 'PCV',
      targetDisease: ['Streptococcus pneumoniae disease'], domains: ['vaccine-preventable', 'child-health'],
      doses: [{ dose: 'Dose 1–3', timing: c.primarySeries, route: 'intramuscular' }],
    },
    {
      slug: 'rotavirus', vaccine: 'Rotavirus vaccine', abbrev: 'Rota',
      targetDisease: ['Rotavirus gastroenteritis'], domains: ['vaccine-preventable', 'child-health'],
      doses: [{ dose: 'Primary series', timing: 'per national schedule', route: 'oral' }],
      note: 'Confirm number of doses/age limits against the current national schedule.',
    },
    {
      slug: c.measles.slug, vaccine: c.measles.vaccine, abbrev: c.measles.abbrev,
      targetDisease: c.measles.slug === 'measles-rubella' ? ['Measles', 'Rubella'] : ['Measles'],
      domains: ['vaccine-preventable', 'child-health'],
      doses: [
        { dose: `${c.measles.abbrev}1`, timing: c.measles.mcv1, route: 'subcutaneous' },
        { dose: `${c.measles.abbrev}2`, timing: c.measles.mcv2, route: 'subcutaneous' },
      ],
      note: c.measles.note,
    },
    {
      slug: 'hpv', vaccine: 'Human papillomavirus vaccine', abbrev: 'HPV',
      targetDisease: ['HPV-related cervical cancer'], domains: ['vaccine-preventable', 'adolescent-health', 'cancer-prevention'],
      doses: [{ dose: 'Per national schedule', timing: c.hpvTiming, route: 'intramuscular' }],
      population: { sex: 'female', notes: c.hpvNote ?? 'Adolescent girls per national HPV programme.' },
    },
  ];

  return vaccines.map((v) => ({
    slug: v.slug,
    vaccine: v.vaccine,
    abbrev: v.abbrev,
    vaccineDrugSlug: null,
    targetDisease: v.targetDisease,
    domains: v.domains,
    jurisdiction: c.code,
    doses: v.doses,
    population: v.population ?? { notes: `${c.name} routine childhood schedule.` },
    catchUp: null,
    notes: `${c.name} national immunization schedule. DRAFT — ${v.note ? v.note + ' ' : ''}verify against the current national schedule before approval.${extra}`,
    references: [cite],
    ...META,
  }));
}

function notifiable(c: CountryParam) {
  const cite = moh(c, c.survSource);
  const base: NotifiableParam[] = [
    { slug: 'acute-flaccid-paralysis', disease: 'Acute flaccid paralysis (suspected poliomyelitis)', domains: ['infectious-disease', 'outbreak', 'surveillance'] },
    { slug: 'cholera', disease: 'Cholera', domains: ['infectious-disease', 'outbreak', 'surveillance'] },
    { slug: 'measles', disease: 'Measles', domains: ['infectious-disease', 'outbreak', 'surveillance', 'vaccine-preventable'] },
    { slug: 'viral-haemorrhagic-fever', disease: 'Viral haemorrhagic fever (incl. Ebola, Marburg)', domains: ['infectious-disease', 'outbreak', 'surveillance', 'emergency'] },
    { slug: 'neonatal-tetanus', disease: 'Neonatal tetanus', domains: ['infectious-disease', 'surveillance', 'maternal-newborn'] },
  ];
  return [...base, ...(c.notifiableExtra ?? [])].map((n) => ({
    slug: n.slug,
    disease: n.disease,
    conditionSlug: null,
    level: 'national-immediate' as const,
    timeframe: 'Immediate (within 24 hours)',
    domains: n.domains,
    jurisdiction: c.code,
    notes: `${c.name} immediately-notifiable priority disease. ${n.note ? n.note + ' ' : ''}DRAFT — verify against the current national surveillance list before approval.`,
    references: [cite],
    ...META,
  }));
}

/**
 * Conditions overlay — reference + WHO-aligned management PRINCIPLES for the top
 * primary-care/endemic conditions. States the national FIRST-LINE CHOICE as a
 * cited fact but NO specific mg/kg doses (those defer to the national
 * weight-based charts + the runtime dose-guardrail). The clinical content is
 * standard/WHO; the national citation + jurisdiction are per-country.
 */
function conditions(c: CountryParam) {
  const natl = moh(c, c.natlGuideline);
  const who = (label: string, url: string, year: number) => ({
    label, url, strength: 'A' as const, sourceType: 'guideline' as const, licence: 'cc-by-nc-sa' as const, year, accessedDate: '2026-06-11',
  });
  const whoMalaria = who('WHO Guidelines for malaria', 'https://www.who.int/publications/i/item/guidelines-for-malaria', 2023);
  const whoPocket = who('WHO Pocket book of hospital care for children, 2nd ed', 'https://www.who.int/publications/i/item/978-92-4-154837-3', 2013);
  const whoTb = who('WHO consolidated guidelines on tuberculosis', 'https://www.who.int/teams/global-tuberculosis-programme/tb-reports', 2022);
  const whoHiv = who('WHO consolidated guidelines on HIV, 2021', 'https://www.who.int/publications/i/item/9789240031593', 2021);
  const base = (slug: string, title: string, icd10: string[], domains: string[], extra: Record<string, unknown>, refs: object[]) => ({
    slug, title: `${title} — ${c.name}`, icd10, domains: [...domains, 'national-first-line'], jurisdiction: c.code,
    ...extra, references: [natl, ...refs], ...META,
  });
  return [
    base('malaria-uncomplicated-adult', 'Uncomplicated malaria (adult)', ['B54', 'B50', 'B51'], ['infectious-disease', 'tropical'], {
      population: { minAgeYears: 12, sex: 'any', pregnancyApplicable: false },
      presentation: ['Fever or history of fever, chills, headache, myalgia.', 'Residence in / travel to a malaria-endemic area.'],
      redFlags: ['Impaired consciousness, convulsions, prostration.', 'Respiratory distress, jaundice, dark urine, severe anaemia, shock.', 'Inability to tolerate orals or repeated vomiting.'],
      diagnostics: [{ test: 'Malaria RDT or microscopy', rationale: 'Confirm parasitologically before treatment — do not treat on clinical suspicion alone.' }],
      management: [
        { step: 'Confirm before treating', detail: 'Treat only after a positive RDT or microscopy.' },
        { step: 'National first-line: artemether-lumefantrine (AL)', detail: `AL is the first-line ACT for uncomplicated falciparum malaria per the ${c.natlGuideline}. Dosing is weight-banded — use the national weight-based dosing chart; do not estimate. Take with fatty food.` },
        { step: 'Counsel + follow up', detail: 'Return immediately if fever persists or any red flag appears.' },
      ],
    }, [whoMalaria]),
    base('malaria-severe', 'Severe malaria', ['B50.0', 'B50.8'], ['infectious-disease', 'tropical', 'emergency'], {
      population: { sex: 'any', pregnancyApplicable: true },
      presentation: ['Confirmed/suspected malaria PLUS any danger sign (coma, convulsions, respiratory distress, shock, severe anaemia, jaundice, hypoglycaemia, inability to tolerate orals).'],
      redFlags: ['Any feature of severe malaria is itself an emergency — treat and refer.'],
      diagnostics: [{ test: 'RDT/microscopy + blood glucose', rationale: 'Confirm parasitaemia; exclude/treat hypoglycaemia.' }],
      management: [
        { step: 'National first-line: parenteral artesunate', detail: 'IV/IM artesunate is the treatment of choice for severe malaria. Dose is weight-based — use the national chart; do not estimate.' },
        { step: 'Pre-referral (children, if referral delayed)', detail: 'Give pre-referral rectal artesunate where injectable treatment/transport is delayed.' },
        { step: 'Complete with an ACT', detail: 'After ≥24h parenteral therapy and able to tolerate orals, complete a full oral ACT course.' },
        { step: 'Manage complications + refer', detail: 'Treat hypoglycaemia, seizures, severe anaemia; refer urgently.' },
      ],
    }, [whoMalaria]),
    base('pneumonia-childhood', 'Childhood pneumonia (under-5)', ['J18', 'J15'], ['respiratory', 'child-health', 'imci'], {
      population: { maxAgeYears: 5, sex: 'any' },
      presentation: ['Cough or difficult breathing with fast breathing for age (IMCI).'],
      redFlags: ['General danger signs: unable to drink/breastfeed, vomiting everything, convulsions, lethargic/unconscious.', 'Chest indrawing, stridor in a calm child, central cyanosis — severe pneumonia, refer.'],
      diagnostics: [{ test: 'Respiratory rate + danger-sign assessment (IMCI); pulse oximetry if available', rationale: 'Classify non-severe vs severe to decide oral vs referral.' }],
      management: [
        { step: 'Non-severe pneumonia: oral amoxicillin (first-line)', detail: 'Per IMCI/national guidance, treat fast-breathing pneumonia with oral amoxicillin. Dose is weight/age-banded — use the national dosing chart; do not estimate.' },
        { step: 'Severe pneumonia: refer', detail: 'Give a first dose of an appropriate antibiotic and oxygen if available, then refer urgently.' },
        { step: 'Supportive care + follow-up', detail: 'Continue feeding/fluids; review in 3 days or sooner if worse.' },
      ],
    }, [whoPocket]),
    base('diarrhoea-acute-childhood', 'Acute diarrhoea + dehydration (under-5)', ['A09', 'A00'], ['gastrointestinal', 'child-health', 'imci'], {
      population: { maxAgeYears: 5, sex: 'any' },
      presentation: ['Loose/watery stools; assess hydration status (IMCI).'],
      redFlags: ['Severe dehydration (lethargy, sunken eyes, very slow skin pinch), blood in stool, persistent diarrhoea, severe malnutrition — refer/escalate.'],
      diagnostics: [{ test: 'IMCI hydration assessment', rationale: 'Classify no/some/severe dehydration to select Plan A/B/C.' }],
      management: [
        { step: 'Rehydration (ORS) + zinc', detail: 'Low-osmolarity ORS per IMCI plan (A/B/C) plus zinc for 10–14 days. Use the national age/weight-based amounts; do not estimate.' },
        { step: 'Continue feeding', detail: 'Continue breastfeeding/feeding throughout.' },
        { step: 'Antibiotics only when indicated', detail: 'Antibiotics only for dysentery (bloody stool) or cholera per national guidance — not for routine watery diarrhoea.' },
        { step: 'Severe dehydration: IV + refer', detail: 'Plan C IV rehydration and refer if not improving.' },
      ],
    }, [whoPocket]),
    base('tuberculosis-pulmonary', 'Pulmonary tuberculosis', ['A15', 'A16'], ['infectious-disease', 'respiratory'], {
      population: { sex: 'any' },
      presentation: ['Cough ≥2 weeks, fever, night sweats, weight loss; or any duration in a person living with HIV / close contact.'],
      redFlags: ['Haemoptysis, respiratory distress, suspected TB meningitis or miliary TB — escalate.'],
      diagnostics: [
        { test: 'Rapid molecular test (Xpert MTB/RIF Ultra)', rationale: 'WHO-recommended initial test, incl. rifampicin resistance.' },
        { test: 'HIV test', rationale: 'Test all people with TB for HIV.' },
      ],
      management: [
        { step: 'National first-line regimen: 2HRZE / 4HR', detail: `Drug-susceptible pulmonary TB: 2 months HRZE then 4 months HR, per the national TB programme. Use weight-band fixed-dose combinations from the national chart; do not estimate.` },
        { step: 'TB/HIV co-management', detail: 'Start ART in all TB/HIV patients; give cotrimoxazole preventive therapy.' },
        { step: 'Adherence + DR-TB pathway', detail: 'Support adherence; refer rifampicin-resistant/MDR-TB to the programme pathway.' },
      ],
    }, [whoTb]),
    base('hiv-art-first-line', 'HIV — first-line ART', ['B20', 'Z21'], ['infectious-disease', 'hiv'], {
      population: { sex: 'any', pregnancyApplicable: true },
      presentation: ['Confirmed HIV (national testing algorithm). Assess for TB, cryptococcal disease and other OIs at diagnosis.'],
      redFlags: ['Advanced HIV disease with new headache/fever/neurology — assess for cryptococcal/TB meningitis and refer.'],
      diagnostics: [{ test: 'Confirmatory HIV testing + baseline CD4 + viral load', rationale: 'Confirm diagnosis; assess advanced disease; establish monitoring baseline.' }],
      management: [
        { step: 'Test and treat', detail: 'Offer ART to all people living with HIV regardless of CD4; rapid initiation once ready.' },
        { step: 'National first-line: TLD (TDF + 3TC + DTG)', detail: 'Dolutegravir-based TLD is the preferred first-line regimen. Use the national fixed-dose formulation; paediatric regimens per national weight bands — do not estimate.' },
        { step: 'Prophylaxis + monitoring', detail: 'Cotrimoxazole and TPT where indicated; viral load at 6 and 12 months then annually (target <1000 copies/mL).' },
        { step: 'Prevention', detail: 'PrEP for substantial risk; PEP within 72h; lifelong ART in pregnancy/breastfeeding (PMTCT).' },
      ],
    }, [whoHiv]),
  ];
}

/**
 * Essential-medicines (EML) reference overlay — a curated list of core
 * primary-care medicines a country's Essential Medicines List carries. These
 * countries adopt the WHO Model List with national adaptations, so the core is
 * shared; per-country it's cited to the national EML + WHO Model EML. Reference
 * only: drug + class + AWaRe tier (antibiotics) + WHO EML section. NO doses
 * (deferred to weight-based charts + the guardrail).
 */
type Eml = [drug: string, drugClass: string, section: string, aware?: 'Access' | 'Watch' | 'Reserve'];
const EML_CORE: Eml[] = [
  ['Amoxicillin', 'Beta-lactam (penicillin)', 'Antibacterials', 'Access'],
  ['Amoxicillin + clavulanic acid', 'Beta-lactam + beta-lactamase inhibitor', 'Antibacterials', 'Access'],
  ['Benzylpenicillin', 'Beta-lactam (penicillin)', 'Antibacterials', 'Access'],
  ['Cloxacillin', 'Beta-lactam (anti-staphylococcal penicillin)', 'Antibacterials', 'Access'],
  ['Ceftriaxone', 'Third-generation cephalosporin', 'Antibacterials', 'Watch'],
  ['Ciprofloxacin', 'Fluoroquinolone', 'Antibacterials', 'Watch'],
  ['Azithromycin', 'Macrolide', 'Antibacterials', 'Watch'],
  ['Metronidazole', 'Nitroimidazole', 'Antibacterials', 'Access'],
  ['Sulfamethoxazole + trimethoprim (co-trimoxazole)', 'Folate-pathway inhibitor', 'Antibacterials', 'Access'],
  ['Doxycycline', 'Tetracycline', 'Antibacterials', 'Access'],
  ['Gentamicin', 'Aminoglycoside', 'Antibacterials', 'Access'],
  ['Nitrofurantoin', 'Nitrofuran (urinary)', 'Antibacterials', 'Access'],
  ['Artemether + lumefantrine', 'Artemisinin-based combination therapy', 'Antimalarials'],
  ['Artesunate (injection)', 'Artemisinin derivative', 'Antimalarials'],
  ['Sulfadoxine + pyrimethamine', 'Antifolate antimalarial (IPTp)', 'Antimalarials'],
  ['Isoniazid + rifampicin + pyrazinamide + ethambutol (FDC)', 'First-line anti-TB fixed-dose combination', 'Antituberculosis'],
  ['Tenofovir + lamivudine + dolutegravir (TLD)', 'First-line antiretroviral FDC', 'Antiretrovirals'],
  ['Paracetamol', 'Non-opioid analgesic / antipyretic', 'Analgesics & palliative care'],
  ['Ibuprofen', 'NSAID', 'Analgesics & palliative care'],
  ['Acetylsalicylic acid (aspirin)', 'Antiplatelet / analgesic', 'Analgesics & palliative care'],
  ['Morphine', 'Opioid analgesic (controlled)', 'Analgesics & palliative care'],
  ['Amlodipine', 'Calcium-channel blocker', 'Cardiovascular'],
  ['Hydrochlorothiazide', 'Thiazide diuretic', 'Cardiovascular'],
  ['Enalapril', 'ACE inhibitor', 'Cardiovascular'],
  ['Atenolol', 'Beta-blocker', 'Cardiovascular'],
  ['Simvastatin', 'Statin', 'Cardiovascular'],
  ['Metformin', 'Biguanide', 'Endocrine (diabetes)'],
  ['Glibenclamide', 'Sulfonylurea', 'Endocrine (diabetes)'],
  ['Insulin (soluble / regular)', 'Short-acting insulin', 'Endocrine (diabetes)'],
  ['Insulin (intermediate / NPH)', 'Intermediate-acting insulin', 'Endocrine (diabetes)'],
  ['Salbutamol (inhaler)', 'Short-acting beta-2 agonist', 'Respiratory'],
  ['Beclometasone (inhaler)', 'Inhaled corticosteroid', 'Respiratory'],
  ['Prednisolone', 'Oral corticosteroid', 'Respiratory'],
  ['Oral rehydration salts (ORS)', 'Oral rehydration', 'Gastrointestinal'],
  ['Zinc sulfate', 'Zinc supplement (diarrhoea)', 'Gastrointestinal'],
  ['Omeprazole', 'Proton-pump inhibitor', 'Gastrointestinal'],
  ['Oxytocin', 'Uterotonic', 'Maternal & emergency'],
  ['Magnesium sulfate', 'Anticonvulsant (eclampsia)', 'Maternal & emergency'],
  ['Adrenaline (epinephrine)', 'Sympathomimetic (anaphylaxis/arrest)', 'Maternal & emergency'],
  ['Diazepam', 'Benzodiazepine (seizures)', 'Maternal & emergency'],
  ['Ferrous salt + folic acid', 'Haematinic', 'Blood & nutrition'],
  ['Vitamin A', 'Micronutrient', 'Blood & nutrition'],
];

function essentialMedicines(c: CountryParam) {
  const natl = moh(c, `${c.name} Essential Medicines List, Ministry of Health`);
  const whoEml = {
    label: 'WHO Model List of Essential Medicines',
    url: 'https://www.who.int/publications/i/item/WHO-MHP-HPS-EML-2023.02',
    strength: 'A' as const, sourceType: 'guideline' as const, licence: 'cc-by-nc-sa' as const, year: 2023, accessedDate: '2026-06-14',
  };
  const slugify = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return EML_CORE.map(([drug, drugClass, section, aware]) => ({
    slug: `eml-${slugify(drug)}`,
    drug,
    drugClass,
    section,
    ...(aware ? { awareTier: aware } : {}),
    jurisdiction: c.code,
    notes: `Listed on the ${c.name} Essential Medicines List (national adaptation of the WHO Model List). Reference only — no doses; use the national weight-based dosing chart. DRAFT — verify national listing/level-of-care before approval.`,
    references: [natl, whoEml],
    ...META,
  }));
}

/**
 * Preventive-care reference overlay — national screening / antenatal / growth /
 * family-planning recommendations at the PRINCIPLE level (no doses), WHO-aligned
 * (which these countries adopt), cited to the national programme + WHO.
 */
function preventiveCare(c: CountryParam) {
  const natl = moh(c, `${c.name} national preventive & reproductive health guidelines, Ministry of Health`);
  const who = (label: string, url: string, year: number) => ({
    label, url, strength: 'A' as const, sourceType: 'guideline' as const, licence: 'cc-by-nc-sa' as const, year, accessedDate: '2026-06-14',
  });
  const card = (slug: string, title: string, domains: string[], recommendations: string[], whoRef: object) => ({
    slug, title: `${title} — ${c.name}`, domain: 'preventive-care', domains, jurisdiction: c.code,
    recommendations,
    notes: `${c.name} preventive-care reference. DRAFT — verify against the current national programme guidance before approval.`,
    references: [natl, whoRef], ...META,
  });
  return [
    card('antenatal-care', 'Antenatal care', ['maternal-newborn', 'preventive'], [
      'A minimum of eight ANC contacts (WHO 2016 model).',
      'Iron and folic acid supplementation throughout pregnancy.',
      'Intermittent preventive treatment in pregnancy (IPTp-SP) in malaria-transmission areas.',
      'Tetanus-diphtheria (Td) vaccination per schedule.',
      'HIV and syphilis testing; PMTCT for HIV-positive women.',
      'Blood pressure and proteinuria check each visit (pre-eclampsia screening).',
    ], who('WHO recommendations on antenatal care for a positive pregnancy experience', 'https://www.who.int/publications/i/item/9789241549912', 2016)),
    card('cervical-cancer-screening', 'Cervical cancer screening', ['cancer-prevention', 'women-health', 'preventive'], [
      'Screen with HPV DNA testing where available (or VIA per national programme).',
      'HPV vaccination of adolescent girls (see immunization overlay).',
      'Screen women living with HIV earlier and more frequently.',
      'Treat screen-positive lesions (thermal ablation / referral) per national pathway.',
    ], who('WHO guideline for screening and treatment of cervical pre-cancer lesions', 'https://www.who.int/publications/i/item/9789240030824', 2021)),
    card('hiv-testing-prevention', 'HIV testing & prevention', ['hiv', 'preventive'], [
      'Provider-initiated HIV testing and counselling (PITC) at clinical contacts.',
      'PrEP for people at substantial risk of HIV.',
      'PEP started as soon as possible, within 72 hours of exposure.',
      'Condom promotion and STI screening/treatment.',
    ], who('WHO consolidated guidelines on HIV testing services', 'https://www.who.int/publications/i/item/9789240031593', 2021)),
    card('tb-screening', 'TB screening', ['tb', 'preventive'], [
      'Screen for TB symptoms (cough, fever, night sweats, weight loss) at every contact for people living with HIV and household contacts.',
      'TB preventive treatment (TPT) for eligible contacts and PLHIV.',
      'Refer presumptive TB for a rapid molecular test (see TB condition overlay).',
    ], who('WHO consolidated guidelines on tuberculosis (screening)', 'https://www.who.int/teams/global-tuberculosis-programme/tb-reports', 2021)),
    card('growth-monitoring', 'Child growth monitoring & nutrition', ['child-health', 'nutrition', 'preventive'], [
      'Routine weight and length/height monitoring on the national growth chart.',
      'MUAC and oedema check to screen for acute malnutrition; refer severe acute malnutrition.',
      'Vitamin A supplementation and deworming per national schedule.',
      'Promote exclusive breastfeeding to 6 months, then continued breastfeeding with complementary feeding.',
    ], who('WHO child growth standards', 'https://www.who.int/tools/child-growth-standards', 2006)),
    card('ncd-screening', 'NCD risk screening', ['ncd', 'preventive'], [
      'Opportunistic blood-pressure measurement in adults (hypertension screening).',
      'Blood glucose screening in at-risk adults (diabetes).',
      'Total cardiovascular-risk assessment per WHO PEN/HEARTS.',
      'Tobacco and harmful-alcohol screening with brief advice.',
    ], who('WHO Package of Essential NCD interventions (PEN)', 'https://www.who.int/publications/i/item/9789240009226', 2020)),
    card('family-planning', 'Family planning provision', ['reproductive-health', 'preventive'], [
      'Offer the full method mix; select methods using the WHO Medical Eligibility Criteria (see FP-MEC baseline).',
      'Counsel on effectiveness, dual protection (STI/HIV) and side effects; support informed choice.',
      'Provide post-partum and post-abortion family planning.',
    ], who('WHO Medical eligibility criteria for contraceptive use, 5th edition', 'https://www.who.int/publications/i/item/9789241549158', 2015)),
  ];
}

const COUNTRY_PARAMS: Record<string, CountryParam> = {
  UG: {
    code: 'UG', name: 'Uganda', mohUrl: 'https://www.health.go.ug/',
    epiSource: 'Uganda National Expanded Programme on Immunisation (UNEPI) schedule, Ministry of Health',
    survSource: 'Uganda Integrated Disease Surveillance and Response (IDSR) technical guidelines, Ministry of Health',
    natlGuideline: 'Uganda Clinical Guidelines, Ministry of Health',
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-Rubella vaccine', abbrev: 'MR', mcv1: '9 months', mcv2: '18 months' },
    hpvTiming: 'Adolescent girls (~10 years)',
  },
  TZ: {
    code: 'TZ', name: 'Tanzania', mohUrl: 'https://www.moh.go.tz/',
    epiSource: 'Tanzania Immunization and Vaccine Development (IVD) national immunization schedule, Ministry of Health',
    survSource: 'Tanzania Integrated Disease Surveillance and Response (IDSR) guidelines, Ministry of Health',
    natlGuideline: 'Tanzania Standard Treatment Guidelines (STG) & National Essential Medicines List, Ministry of Health',
    primarySeries: '4, 8 and 12 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-Rubella vaccine', abbrev: 'MR', mcv1: '9 months', mcv2: '18 months' },
    hpvTiming: 'Adolescent girls (~14 years)',
    scheduleNote: 'NOTE: Tanzania has historically used a 4/8/12-week primary series — verify timing against the current schedule.',
    notifiableExtra: [
      { slug: 'plague', disease: 'Plague', domains: ['infectious-disease', 'outbreak', 'surveillance'], note: 'Endemic foci exist; immediately notifiable.' },
    ],
  },
  RW: {
    code: 'RW', name: 'Rwanda', mohUrl: 'https://www.moh.gov.rw/',
    epiSource: 'Rwanda national immunization (EPI) schedule, Ministry of Health / Rwanda Biomedical Centre',
    survSource: 'Rwanda Integrated Disease Surveillance and Response (IDSR) guidelines, Ministry of Health',
    natlGuideline: 'Rwanda clinical treatment guidelines, Ministry of Health',
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-Rubella vaccine', abbrev: 'MR', mcv1: '9 months', mcv2: '15–18 months' },
    hpvTiming: 'Adolescent girls (~12 years, school-based)',
    hpvNote: 'Rwanda was an early national HPV-programme adopter (school-based, girls).',
  },
  ET: {
    code: 'ET', name: 'Ethiopia', mohUrl: 'https://www.moh.gov.et/',
    epiSource: 'Ethiopia national immunization (EPI) schedule, Ministry of Health / Ethiopian Public Health Institute',
    survSource: 'Ethiopia Public Health Emergency Management (PHEM) / IDSR guidelines, Ministry of Health',
    natlGuideline: 'Ethiopia Standard Treatment Guidelines, Ministry of Health / EFDA',
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-Rubella vaccine', abbrev: 'MR', mcv1: '9 months', mcv2: '15 months', note: 'Confirm rubella inclusion and MR2 timing against the current national schedule.' },
    hpvTiming: 'Adolescent girls (~14 years)',
  },
  NG: {
    code: 'NG', name: 'Nigeria', mohUrl: 'https://www.health.gov.ng/',
    epiSource: 'Nigeria routine immunization schedule, National Primary Health Care Development Agency (NPHCDA)',
    survSource: 'Nigeria IDSR / Nigeria Centre for Disease Control (NCDC) priority diseases',
    natlGuideline: 'Nigeria Standard Treatment Guidelines, Federal Ministry of Health',
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-containing vaccine', abbrev: 'MCV', mcv1: '9 months', mcv2: '15 months', note: 'Confirm measles/MR antigen and second-dose timing against the current national schedule.' },
    hpvTiming: 'Girls 9–14 years',
    hpvNote: 'HPV introduced nationally for girls 9–14; confirm cohort and dose count.',
    notifiableExtra: [
      { slug: 'yellow-fever', disease: 'Yellow fever', domains: ['infectious-disease', 'outbreak', 'surveillance', 'vaccine-preventable'], note: 'Endemic; immediately notifiable.' },
      { slug: 'lassa-fever', disease: 'Lassa fever', domains: ['infectious-disease', 'outbreak', 'surveillance', 'emergency'], note: 'Nigeria-specific endemic viral haemorrhagic fever; immediately notifiable to NCDC.' },
      { slug: 'cerebrospinal-meningitis', disease: 'Cerebrospinal meningitis (meningococcal)', domains: ['infectious-disease', 'outbreak', 'surveillance'], note: 'Meningitis-belt epidemic-prone disease.' },
    ],
  },
  GH: {
    code: 'GH', name: 'Ghana', mohUrl: 'https://www.moh.gov.gh/',
    epiSource: 'Ghana Expanded Programme on Immunization (EPI) schedule, Ghana Health Service',
    survSource: 'Ghana IDSR technical guidelines, Ghana Health Service',
    natlGuideline: 'Ghana Standard Treatment Guidelines, Ghana Health Service',
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-Rubella vaccine', abbrev: 'MR', mcv1: '9 months', mcv2: '18 months' },
    hpvTiming: 'Adolescent girls per national programme',
    notifiableExtra: [
      { slug: 'yellow-fever', disease: 'Yellow fever', domains: ['infectious-disease', 'outbreak', 'surveillance', 'vaccine-preventable'], note: 'Endemic; immediately notifiable.' },
      { slug: 'cerebrospinal-meningitis', disease: 'Cerebrospinal meningitis (meningococcal)', domains: ['infectious-disease', 'outbreak', 'surveillance'], note: 'Northern meningitis-belt epidemic-prone disease.' },
    ],
  },
  ZA: {
    code: 'ZA', name: 'South Africa', mohUrl: 'https://www.health.gov.za/',
    epiSource: 'Expanded Programme on Immunisation (EPI-SA) schedule, National Department of Health',
    survSource: 'South Africa Notifiable Medical Conditions (NMC) surveillance system, NICD / National Department of Health',
    natlGuideline: 'South Africa Standard Treatment Guidelines & EML (Primary Healthcare), National Department of Health',
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-containing vaccine', abbrev: 'Measles', mcv1: '6 months', mcv2: '12 months', note: 'EPI-SA gives measles at 6 and 12 months; confirm rubella inclusion/timing.' },
    hpvTiming: 'School-based, Grade 5 girls (~9–10 years)',
    scheduleNote: 'NOTE: EPI-SA uses a distinct, more expanded schedule (incl. hexavalent and additional visits at 6/9/12/18 months and 6/12 years) — verify the full schedule carefully against the current EPI-SA document.',
    notifiableExtra: [
      { slug: 'rabies', disease: 'Rabies', domains: ['infectious-disease', 'surveillance'], note: 'NMC Category 1 (immediate).' },
    ],
  },
  ZM: {
    code: 'ZM', name: 'Zambia', mohUrl: 'https://www.moh.gov.zm/',
    epiSource: 'Zambia Expanded Programme on Immunization (EPI) schedule, Ministry of Health',
    survSource: 'Zambia IDSR technical guidelines, Ministry of Health',
    natlGuideline: 'Zambia Standard Treatment Guidelines, Ministry of Health',
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-Rubella vaccine', abbrev: 'MR', mcv1: '9 months', mcv2: '18 months' },
    hpvTiming: 'Adolescent girls per national programme',
  },
  MW: {
    code: 'MW', name: 'Malawi', mohUrl: 'https://www.health.gov.mw/',
    epiSource: 'Malawi Expanded Programme on Immunization (EPI) schedule, Ministry of Health',
    survSource: 'Malawi IDSR technical guidelines, Ministry of Health',
    natlGuideline: 'Malawi Standard Treatment Guidelines, Ministry of Health',
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-Rubella vaccine', abbrev: 'MR', mcv1: '9 months', mcv2: '15 months' },
    hpvTiming: 'Adolescent girls per national programme',
  },
};

const OVERLAYS = resolve(process.cwd(), 'content/overlays');

function run() {
  const args = process.argv.slice(2);
  const conditionsOnly = args.includes('--conditions-only');
  const emlOnly = args.includes('--eml-only');
  const preventiveOnly = args.includes('--preventive-only');
  const codes = args.map((a) => a.toUpperCase()).filter((a) => !a.startsWith('-'));
  const targets = codes.length ? codes : Object.keys(COUNTRY_PARAMS);
  for (const code of targets) {
    const c = COUNTRY_PARAMS[code];
    if (!c) {
      console.error(`No params for ${code} — add it to COUNTRY_PARAMS.`);
      process.exit(1);
    }
    const dir = resolve(OVERLAYS, code, 'records');
    mkdirSync(dir, { recursive: true });
    let wrote;
    if (preventiveOnly) {
      writeFileSync(resolve(dir, 'preventive-care.json'), `${JSON.stringify(preventiveCare(c), null, 2)}\n`);
      wrote = 'preventive-care';
    } else if (emlOnly) {
      writeFileSync(resolve(dir, 'essential-medicines.json'), `${JSON.stringify(essentialMedicines(c), null, 2)}\n`);
      wrote = 'essential-medicines';
    } else if (conditionsOnly) {
      writeFileSync(resolve(dir, 'conditions.json'), `${JSON.stringify(conditions(c), null, 2)}\n`);
      wrote = 'conditions';
    } else {
      writeFileSync(resolve(dir, 'immunization-schedule.json'), `${JSON.stringify(immunization(c), null, 2)}\n`);
      writeFileSync(resolve(dir, 'notifiable-diseases.json'), `${JSON.stringify(notifiable(c), null, 2)}\n`);
      writeFileSync(resolve(dir, 'conditions.json'), `${JSON.stringify(conditions(c), null, 2)}\n`);
      writeFileSync(resolve(dir, 'essential-medicines.json'), `${JSON.stringify(essentialMedicines(c), null, 2)}\n`);
      writeFileSync(resolve(dir, 'preventive-care.json'), `${JSON.stringify(preventiveCare(c), null, 2)}\n`);
      wrote = 'immunization + notifiable + conditions + essential-medicines + preventive-care';
    }
    console.log(`✓ ${code} (${c.name}): ${wrote} overlay(s) scaffolded`);
  }
}

run();
