import type { DrugInteraction, DrugRecord } from './drugs.types';

/**
 * v0.1 placeholder content. NOT a clinical formulary — six records to
 * exercise the schema. Real content flows through the Knowledge Content
 * Service under multi-reviewer approval and cryptographic signing
 * (FR-024, FR-025). Every record is marked review_status='draft'.
 */
export const SEED_DRUGS: DrugRecord[] = [
  {
    slug: 'paracetamol',
    inn: 'paracetamol',
    tradeNames: ['Panadol', 'Calpol'],
    rxnorm: '161',
    atc: ['N02BE01'],
    drugClass: 'Non-opioid analgesic / antipyretic',
    kemlLevel: 1,
    whoEml: true,
    awareCategory: undefined,
    indications: [
      { icd10: 'R50', text: 'Fever' },
      { icd10: 'R52', text: 'Mild to moderate pain' },
    ],
    mechanism:
      'Central inhibition of prostaglandin synthesis; mechanism incompletely understood.',
    pharmacokinetics: {
      halfLifeHours: 2,
      metabolism: 'Hepatic — glucuronidation and sulfation; minor CYP2E1 to NAPQI.',
      excretion: 'Renal (metabolites).',
    },
    dosing: {
      adult: [
        { route: 'oral', regimen: '500–1000 mg every 4–6 hours; max 4 g/24 h' },
      ],
      paediatric: {
        mgPerKgPerDose: 15,
        maxMgPerKgPerDay: 60,
        maxMgPerDose: 1000,
        route: 'oral',
        frequency: 'every 4–6 hours, max 4 doses/24 h',
        notes: 'Use weight-based dosing; do not exceed 60 mg/kg/24 h.',
      },
      hepatic: 'Avoid or reduce dose in severe hepatic impairment.',
    },
    pregnancy: {
      notes: 'Preferred analgesic across pregnancy at lowest effective dose, shortest duration.',
    },
    lactation: 'Compatible with breastfeeding.',
    contraindications: ['Severe hepatic impairment.'],
    warnings: [
      'Hepatotoxicity in overdose or with chronic high doses.',
      'Use caution with concomitant alcohol use.',
    ],
    adverseEffects: [
      { frequency: 'rare', effect: 'Skin rash' },
      { frequency: 'serious', effect: 'Hepatotoxicity (overdose)' },
    ],
    monitoring: ['INR if on chronic warfarin therapy at high paracetamol doses.'],
    references: [
      { label: 'WHO Model Formulary' },
      { label: 'Kenya Essential Medicines List (KEML) 2023' },
    ],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
  {
    slug: 'amoxicillin',
    inn: 'amoxicillin',
    tradeNames: ['Amoxil'],
    rxnorm: '723',
    atc: ['J01CA04'],
    drugClass: 'Aminopenicillin antibacterial',
    kemlLevel: 1,
    whoEml: true,
    awareCategory: 'Access',
    indications: [
      { icd10: 'J18', text: 'Community-acquired pneumonia' },
      { icd10: 'H66', text: 'Acute otitis media' },
      { icd10: 'J03', text: 'Streptococcal tonsillopharyngitis' },
    ],
    mechanism: 'Inhibits bacterial cell wall synthesis via PBP binding.',
    pharmacokinetics: {
      halfLifeHours: 1,
      metabolism: 'Minimal; largely unchanged.',
      excretion: 'Renal.',
    },
    dosing: {
      adult: [
        { route: 'oral', regimen: '500 mg every 8 hours, or 875 mg every 12 hours' },
      ],
      paediatric: {
        mgPerKgPerDose: 25,
        maxMgPerKgPerDay: 90,
        maxMgPerDose: 1000,
        route: 'oral',
        frequency: 'every 8 hours',
        notes: 'High-dose 90 mg/kg/day in two divided doses for acute otitis media.',
      },
      renal: [
        { crClMinMlMin: 10, crClMaxMlMin: 30, adjustment: 'Extend interval to every 12 hours.' },
        { crClMaxMlMin: 10, adjustment: 'Extend interval to every 24 hours.' },
      ],
    },
    pregnancy: { notes: 'Generally considered safe across pregnancy.' },
    lactation: 'Compatible.',
    contraindications: ['History of severe penicillin hypersensitivity.'],
    warnings: [
      'Avoid empiric prescribing for viral upper respiratory illness — AWaRe stewardship.',
    ],
    adverseEffects: [
      { frequency: 'common', effect: 'Diarrhoea, nausea' },
      { frequency: 'uncommon', effect: 'Maculopapular rash' },
      { frequency: 'serious', effect: 'Anaphylaxis' },
    ],
    monitoring: [],
    references: [
      { label: 'WHO AWaRe Classification 2023' },
      { label: 'Kenya Clinical Guidelines 2018' },
    ],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
  {
    slug: 'artemether-lumefantrine',
    inn: 'artemether + lumefantrine',
    tradeNames: ['Coartem'],
    atc: ['P01BF01'],
    drugClass: 'Artemisinin-based combination therapy (ACT)',
    kemlLevel: 1,
    whoEml: true,
    awareCategory: undefined,
    indications: [
      { icd10: 'B54', text: 'Uncomplicated malaria (any species except severe P. falciparum)' },
    ],
    mechanism:
      'Artemether: generates reactive oxygen species in parasite. Lumefantrine: inhibits haem polymerisation.',
    pharmacokinetics: {
      halfLifeHours: 4,
      notes: 'Lumefantrine absorption greatly increased by fat-containing meal.',
    },
    dosing: {
      adult: [
        {
          route: 'oral',
          regimen:
            'Six-dose regimen over 3 days: 4 tabs (20/120 mg) at 0, 8, 24, 36, 48, 60 hours.',
          notes: 'Take with food/fat to improve lumefantrine absorption.',
        },
      ],
      paediatric: {
        route: 'oral',
        frequency: 'six-dose regimen (0, 8, 24, 36, 48, 60 h)',
        minWeightKg: 5,
        notes:
          'Weight-banded tablet counts: 5–14 kg → 1 tab/dose; 15–24 kg → 2 tabs; 25–34 kg → 3 tabs; ≥35 kg → 4 tabs.',
      },
    },
    pregnancy: {
      notes:
        'Avoid in first trimester unless no suitable alternative; safe in second and third trimesters.',
    },
    lactation: 'Compatible.',
    contraindications: [
      'First trimester pregnancy where quinine is available.',
      'Known QT prolongation.',
    ],
    warnings: ['QT prolongation; avoid concomitant QT-prolonging agents.'],
    adverseEffects: [
      { frequency: 'common', effect: 'Headache, dizziness, anorexia' },
      { frequency: 'rare', effect: 'QT prolongation' },
    ],
    monitoring: ['Parasitological response on day 3 in suspected treatment failure.'],
    references: [
      { label: 'WHO Guidelines for the Treatment of Malaria' },
      { label: 'Kenya National Malaria Treatment Guidelines' },
    ],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
  {
    slug: 'amlodipine',
    inn: 'amlodipine',
    tradeNames: ['Norvasc'],
    rxnorm: '17767',
    atc: ['C08CA01'],
    drugClass: 'Dihydropyridine calcium channel blocker',
    kemlLevel: 2,
    whoEml: true,
    indications: [{ icd10: 'I10', text: 'Hypertension' }],
    mechanism: 'Selective L-type calcium channel blockade in vascular smooth muscle.',
    pharmacokinetics: {
      halfLifeHours: 40,
      metabolism: 'Hepatic CYP3A4.',
      excretion: 'Renal (metabolites).',
    },
    dosing: {
      adult: [
        {
          route: 'oral',
          regimen: 'Start 5 mg once daily; titrate to 10 mg once daily as tolerated.',
        },
      ],
      hepatic: 'Start at 2.5 mg daily in moderate-to-severe impairment.',
    },
    pregnancy: { notes: 'Limited human data; consider methyldopa or labetalol first-line.' },
    lactation: 'Compatible (limited data).',
    contraindications: ['Severe aortic stenosis.', 'Cardiogenic shock.'],
    warnings: ['Peripheral oedema is dose-related.'],
    adverseEffects: [
      { frequency: 'common', effect: 'Ankle oedema, flushing, headache' },
      { frequency: 'uncommon', effect: 'Palpitations' },
    ],
    monitoring: ['Office BP at 4-week intervals during titration.'],
    references: [{ label: 'WHO PEN protocol — Hypertension' }],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
  {
    slug: 'metformin',
    inn: 'metformin',
    tradeNames: ['Glucophage'],
    rxnorm: '6809',
    atc: ['A10BA02'],
    drugClass: 'Biguanide antihyperglycaemic',
    kemlLevel: 2,
    whoEml: true,
    indications: [{ icd10: 'E11', text: 'Type 2 diabetes mellitus' }],
    mechanism:
      'Decreases hepatic gluconeogenesis and intestinal glucose absorption; increases peripheral insulin sensitivity.',
    pharmacokinetics: {
      halfLifeHours: 6,
      metabolism: 'Not metabolised.',
      excretion: 'Renal (unchanged).',
    },
    dosing: {
      adult: [
        {
          route: 'oral',
          regimen: 'Start 500 mg once daily with food; titrate to 1 g twice daily as tolerated.',
        },
      ],
      renal: [
        {
          crClMinMlMin: 30,
          crClMaxMlMin: 45,
          adjustment: 'Use with caution; consider 50% dose reduction.',
        },
        {
          crClMaxMlMin: 30,
          adjustment: 'Contraindicated — risk of lactic acidosis.',
        },
      ],
    },
    pregnancy: {
      notes: 'Considered safe; transition to insulin per local guideline if not at target.',
    },
    lactation: 'Compatible.',
    contraindications: [
      'eGFR < 30 mL/min/1.73 m².',
      'Acute or decompensated heart failure.',
      'Active hepatic disease.',
    ],
    warnings: [
      'Hold around iodinated contrast in patients with eGFR < 60.',
      'Risk of lactic acidosis in dehydration, sepsis, hypoxia.',
    ],
    adverseEffects: [
      { frequency: 'common', effect: 'GI upset (often improves with titration and food)' },
      { frequency: 'uncommon', effect: 'Vitamin B12 deficiency on chronic therapy' },
      { frequency: 'serious', effect: 'Lactic acidosis' },
    ],
    monitoring: [
      'eGFR at baseline and at least annually.',
      'HbA1c at 3-monthly intervals during titration.',
      'Vitamin B12 annually on chronic therapy.',
    ],
    references: [{ label: 'WHO PEN protocol — Diabetes' }],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
  {
    slug: 'warfarin',
    inn: 'warfarin',
    tradeNames: ['Coumadin'],
    rxnorm: '11289',
    atc: ['B01AA03'],
    drugClass: 'Vitamin K antagonist anticoagulant',
    kemlLevel: 2,
    whoEml: true,
    indications: [
      { icd10: 'I48', text: 'Atrial fibrillation (stroke prevention)' },
      { icd10: 'I26', text: 'Pulmonary embolism' },
      { icd10: 'I82', text: 'Deep vein thrombosis' },
    ],
    mechanism: 'Inhibits vitamin K epoxide reductase, depleting active factors II, VII, IX, X.',
    pharmacokinetics: {
      halfLifeHours: 40,
      metabolism: 'Hepatic CYP2C9 (S-isomer), CYP1A2/3A4 (R-isomer).',
      excretion: 'Renal (metabolites).',
    },
    dosing: {
      adult: [
        {
          route: 'oral',
          regimen:
            'Start 5 mg daily; titrate to target INR per indication (typically 2.0–3.0).',
          notes: 'Highly individual; many interactions; use slower start in elderly/frail.',
        },
      ],
      hepatic: 'Reduce starting dose; titrate slowly and monitor INR.',
    },
    pregnancy: {
      notes:
        'Avoid — teratogenic in first trimester; switch to LMWH preconception or on confirmation.',
    },
    lactation: 'Compatible.',
    contraindications: [
      'Pregnancy.',
      'Active bleeding.',
      'Severe uncontrolled hypertension.',
    ],
    warnings: [
      'Narrow therapeutic index — frequent INR monitoring required.',
      'Extensive interaction profile (antibiotics, antifungals, paracetamol high-dose, NSAIDs).',
    ],
    adverseEffects: [
      { frequency: 'common', effect: 'Bruising, minor bleeding' },
      { frequency: 'serious', effect: 'Major haemorrhage, including intracranial' },
    ],
    monitoring: [
      'INR at least weekly during induction, then 4-weekly when stable.',
      'Re-check INR after any new co-prescription or dietary change.',
    ],
    references: [{ label: 'WHO Model Formulary' }],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
];

export const SEED_INTERACTIONS: DrugInteraction[] = [
  {
    slugA: 'paracetamol',
    slugB: 'warfarin',
    severity: 'moderate',
    mechanism:
      'Chronic high-dose paracetamol (> 2 g/day for several days) potentiates the anticoagulant effect of warfarin via CYP2C9 and vitamin K cycle effects.',
    management:
      'Single occasional doses are acceptable. For chronic or high-dose paracetamol, check INR within 3–5 days and adjust warfarin as needed.',
    references: [{ label: 'WHO Model Formulary — interaction monograph' }],
    ruleVersion: '0.1.0-placeholder',
    reviewStatus: 'draft',
    evidenceLevel: 'expert-consensus',
  },
];
