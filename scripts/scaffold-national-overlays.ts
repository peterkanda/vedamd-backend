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

const COUNTRY_PARAMS: Record<string, CountryParam> = {
  ET: {
    code: 'ET', name: 'Ethiopia', mohUrl: 'https://www.moh.gov.et/',
    epiSource: 'Ethiopia national immunization (EPI) schedule, Ministry of Health / Ethiopian Public Health Institute',
    survSource: 'Ethiopia Public Health Emergency Management (PHEM) / IDSR guidelines, Ministry of Health',
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-Rubella vaccine', abbrev: 'MR', mcv1: '9 months', mcv2: '15 months', note: 'Confirm rubella inclusion and MR2 timing against the current national schedule.' },
    hpvTiming: 'Adolescent girls (~14 years)',
  },
  NG: {
    code: 'NG', name: 'Nigeria', mohUrl: 'https://www.health.gov.ng/',
    epiSource: 'Nigeria routine immunization schedule, National Primary Health Care Development Agency (NPHCDA)',
    survSource: 'Nigeria IDSR / Nigeria Centre for Disease Control (NCDC) priority diseases',
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
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-Rubella vaccine', abbrev: 'MR', mcv1: '9 months', mcv2: '18 months' },
    hpvTiming: 'Adolescent girls per national programme',
  },
  MW: {
    code: 'MW', name: 'Malawi', mohUrl: 'https://www.health.gov.mw/',
    epiSource: 'Malawi Expanded Programme on Immunization (EPI) schedule, Ministry of Health',
    survSource: 'Malawi IDSR technical guidelines, Ministry of Health',
    primarySeries: '6, 10 and 14 weeks',
    measles: { slug: 'measles-rubella', vaccine: 'Measles-Rubella vaccine', abbrev: 'MR', mcv1: '9 months', mcv2: '15 months' },
    hpvTiming: 'Adolescent girls per national programme',
  },
};

const OVERLAYS = resolve(process.cwd(), 'content/overlays');

function run() {
  const codes = process.argv.slice(2).map((a) => a.toUpperCase()).filter((a) => !a.startsWith('-'));
  const targets = codes.length ? codes : Object.keys(COUNTRY_PARAMS);
  for (const code of targets) {
    const c = COUNTRY_PARAMS[code];
    if (!c) {
      console.error(`No params for ${code} — add it to COUNTRY_PARAMS.`);
      process.exit(1);
    }
    const dir = resolve(OVERLAYS, code, 'records');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'immunization-schedule.json'), `${JSON.stringify(immunization(c), null, 2)}\n`);
    writeFileSync(resolve(dir, 'notifiable-diseases.json'), `${JSON.stringify(notifiable(c), null, 2)}\n`);
    console.log(`✓ ${code} (${c.name}): immunization + notifiable overlays scaffolded`);
  }
}

run();
