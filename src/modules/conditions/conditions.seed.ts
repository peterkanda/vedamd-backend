import type { ConditionGuidance } from './conditions.types';

/**
 * v0.1 placeholder content. NOT clinical guidance — these records exist
 * solely to exercise the schema and the API surface end-to-end. Real
 * content lands via the Knowledge Content Service (SRS §6.3.2) under
 * multi-reviewer approval and cryptographic signing (FR-024, FR-025).
 */
export const SEED_CONDITIONS: ConditionGuidance[] = [
  {
    slug: 'malaria-uncomplicated-adult',
    title: 'Uncomplicated malaria (adult)',
    icd10: ['B54', 'B50', 'B51'],
    domains: ['infectious-disease', 'tropical'],
    population: { minAgeYears: 12, sex: 'any', pregnancyApplicable: false },
    presentation: [
      'Fever or history of fever in the last 48 hours.',
      'Chills, rigors, headache, myalgia.',
      'Recent travel to or residence in a malaria-endemic area.',
    ],
    redFlags: [
      'Altered consciousness, convulsions, prostration.',
      'Respiratory distress, jaundice.',
      'Repeated vomiting, inability to tolerate oral medication.',
      'Severe anaemia or signs of shock.',
    ],
    diagnostics: [
      { test: 'Malaria RDT (HRP-2/pLDH)', rationale: 'Rapid bedside confirmation before treatment.' },
      { test: 'Thick and thin blood smear', rationale: 'Species identification and parasite density.' },
    ],
    management: [
      {
        step: 'Confirm parasitological diagnosis',
        detail: 'Do not treat empirically; treat only after a positive RDT or microscopy.',
      },
      {
        step: 'First-line: artemether-lumefantrine (AL)',
        detail: 'Six-dose regimen over three days, weight-banded; reinforce dosing with food.',
      },
      {
        step: 'Counselling',
        detail: 'Return immediately if fever persists or red flags appear.',
      },
    ],
    references: [
      { label: 'WHO Guidelines for the treatment of malaria' },
      { label: 'Kenya National Malaria Treatment Guidelines' },
    ],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
  {
    slug: 'hypertension-stage-1-adult',
    title: 'Hypertension, stage 1 (adult, non-emergent)',
    icd10: ['I10'],
    domains: ['ncd', 'cardiovascular'],
    population: { minAgeYears: 18, sex: 'any', pregnancyApplicable: false },
    presentation: [
      'Office BP 140–159 / 90–99 mmHg on two separate occasions.',
      'Often asymptomatic; may report headache, nocturia, palpitations.',
    ],
    redFlags: [
      'BP ≥ 180/120 with end-organ symptoms (chest pain, neurological deficit, dyspnoea) — hypertensive emergency.',
      'Pregnancy with new-onset hypertension.',
    ],
    diagnostics: [
      { test: 'Repeat BP measurement', rationale: 'Confirm sustained elevation off-stress.' },
      { test: 'Urinalysis + serum creatinine + fasting glucose + lipids', rationale: 'Screen for end-organ damage and concomitant risk factors.' },
      { test: 'ECG', rationale: 'Baseline LVH assessment when available.' },
    ],
    management: [
      { step: 'Lifestyle counselling', detail: 'Salt reduction, weight management, physical activity, smoking cessation.' },
      { step: 'Initiate single-agent pharmacotherapy', detail: 'Per local formulary (e.g., amlodipine or hydrochlorothiazide); re-check in 4 weeks.' },
      { step: 'Follow-up cadence', detail: 'Monthly until controlled, then 3-monthly.' },
    ],
    references: [
      { label: 'WHO PEN protocol — Hypertension' },
      { label: 'Kenya Clinical Guidelines 2018 — Hypertension chapter' },
    ],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
  {
    slug: 'type-2-diabetes-new-diagnosis-adult',
    title: 'Type 2 diabetes, new diagnosis (adult)',
    icd10: ['E11'],
    domains: ['ncd', 'endocrine'],
    population: { minAgeYears: 18, sex: 'any', pregnancyApplicable: false },
    presentation: [
      'Polyuria, polydipsia, unintentional weight loss, fatigue.',
      'Often detected on opportunistic screening.',
    ],
    redFlags: [
      'Diabetic ketoacidosis symptoms (Kussmaul breathing, vomiting, abdominal pain).',
      'Hyperosmolar hyperglycaemic state — altered mental status with severe hyperglycaemia.',
    ],
    diagnostics: [
      { test: 'Fasting plasma glucose', rationale: '≥ 7.0 mmol/L on two occasions confirms diagnosis.' },
      { test: 'HbA1c', rationale: '≥ 6.5% supports diagnosis and sets a baseline target.' },
      { test: 'Urinalysis + creatinine + lipids', rationale: 'Screen for nephropathy and lipid co-management.' },
    ],
    management: [
      { step: 'Patient education', detail: 'Self-monitoring, hypoglycaemia recognition, foot care, dietary counselling.' },
      { step: 'First-line pharmacotherapy', detail: 'Metformin titrated from 500 mg daily, target 1 g BD as tolerated; re-check HbA1c at 3 months.' },
      { step: 'Cardiovascular risk reduction', detail: 'Blood pressure target < 140/90, statin if 10-year CV risk elevated.' },
    ],
    references: [
      { label: 'WHO PEN protocol — Diabetes' },
      { label: 'Kenya Clinical Guidelines 2018 — Diabetes chapter' },
    ],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
];
