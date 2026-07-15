import type {
  ClinicalToolsResponse,
  DoseDrug,
  EquianalgesicOpioid,
  ScoringSystem,
  VitalsBand,
} from './clinical-tools.types';

const DOSE_DRUGS: DoseDrug[] = [
  {
    id: 'paracetamol',
    name: 'Paracetamol (oral)',
    indication: 'Fever / mild-to-moderate pain',
    mgPerKgPerDose: 15,
    maxMgPerDose: 1000,
    maxMgPerKgPerDay: 60,
    frequency: 'every 4–6 h',
    route: 'PO',
    notes: 'WHO / BNFc: 10–15 mg/kg/dose, max 4 doses in 24 h. Avoid in hepatic failure.',
  },
  {
    id: 'ibuprofen',
    name: 'Ibuprofen (oral)',
    indication: 'Fever / pain (>3 months)',
    mgPerKgPerDose: 10,
    maxMgPerDose: 400,
    maxMgPerKgPerDay: 40,
    frequency: 'every 6–8 h',
    route: 'PO',
    minAgeMonths: 3,
    notes:
      'BNFc: 5–10 mg/kg/dose; avoid in dehydration, asthma with sensitivity, renal impairment.',
  },
  {
    id: 'amoxicillin',
    name: 'Amoxicillin (oral)',
    indication: 'Community-acquired infection',
    mgPerKgPerDose: 25,
    maxMgPerDose: 500,
    maxMgPerKgPerDay: 90,
    frequency: 'every 8 h',
    route: 'PO',
    notes:
      'WHO IMCI / BNFc: standard 25 mg/kg/dose tds; up to 30 mg/kg/dose in severe pneumonia.',
  },
  {
    id: 'cotrimoxazole',
    name: 'Co-trimoxazole (oral)',
    indication: 'PCP / UTI / IMCI dysentery',
    mgPerKgPerDose: 4,
    maxMgPerDose: 160,
    frequency: 'every 12 h',
    route: 'PO',
    notes: 'Dose expressed as trimethoprim. Standard 4 mg/kg/dose bd.',
  },
  {
    id: 'zinc',
    name: 'Zinc sulphate',
    indication: 'Acute diarrhoea (IMCI)',
    mgPerKgPerDose: 20,
    maxMgPerDose: 20,
    frequency: 'once daily × 10–14 days',
    route: 'PO',
    notes: 'WHO IMCI: 20 mg daily ≥ 6 months; 10 mg daily 2–6 months.',
  },
  {
    id: 'ors',
    name: 'ORS (oral rehydration salts)',
    indication: 'Diarrhoea, mild dehydration (Plan A)',
    mgPerKgPerDose: 75,
    frequency: 'over 4 hours',
    route: 'PO',
    notes: 'Plan B: 75 mL/kg over 4 h. The calculator returns mL — not mg.',
  },
  {
    id: 'salbutamol',
    name: 'Salbutamol nebulised',
    indication: 'Acute wheeze / asthma',
    mgPerKgPerDose: 0.15,
    maxMgPerDose: 5,
    frequency: 'every 20 min × 3 then PRN',
    route: 'NEB',
    notes: 'BNFc: 0.15 mg/kg/dose (min 2.5 mg, max 5 mg).',
  },
  {
    id: 'prednisolone',
    name: 'Prednisolone (oral)',
    indication: 'Acute asthma / croup',
    mgPerKgPerDose: 1,
    maxMgPerDose: 40,
    maxMgPerKgPerDay: 2,
    frequency: 'once daily × 3 days',
    route: 'PO',
    notes: 'BNFc / GINA: 1–2 mg/kg once daily for short-course asthma exacerbation.',
  },
  {
    id: 'ceftriaxone',
    name: 'Ceftriaxone IV/IM',
    indication: 'Severe sepsis / meningitis',
    mgPerKgPerDose: 80,
    maxMgPerDose: 4000,
    frequency: 'once daily (bd for meningitis)',
    route: 'IV / IM',
    notes: 'Severe sepsis: 80–100 mg/kg/day. Meningitis: 100 mg/kg/day divided 12-hourly.',
  },
  {
    id: 'adrenaline-im-anaphylaxis',
    name: 'Adrenaline (epinephrine) IM — anaphylaxis',
    indication: 'Anaphylaxis',
    mgPerKgPerDose: 0.01,
    maxMgPerDose: 0.5,
    frequency: 'repeat every 5 min PRN',
    route: 'IM (anterolateral thigh)',
    notes:
      'WAO / Resus Council: 10 micrograms/kg IM (max 500 µg = 0.5 mL of 1:1000). Use 1 mg/mL strength.',
  },
  {
    id: 'diazepam-pr',
    name: 'Diazepam — rectal',
    indication: 'Status epilepticus / prolonged seizure',
    mgPerKgPerDose: 0.5,
    maxMgPerDose: 10,
    frequency: 'single dose; repeat once after 10 min if needed',
    route: 'PR',
    notes:
      'BNFc / APLS: 0.5 mg/kg PR (max 10 mg in child >1 y). Use only if IV access not immediately available.',
  },
  {
    id: 'midazolam-buccal',
    name: 'Midazolam — buccal',
    indication: 'Status epilepticus / prolonged seizure',
    mgPerKgPerDose: 0.3,
    maxMgPerDose: 10,
    frequency: 'single dose; second dose after 10 min if needed',
    route: 'Buccal',
    notes:
      'BNFc / APLS: 0.3 mg/kg buccal (max 10 mg). Preferred prehospital benzodiazepine for paediatric seizures.',
  },
  {
    id: 'dexamethasone-croup',
    name: 'Dexamethasone (oral) — croup',
    indication: 'Croup (laryngotracheobronchitis)',
    mgPerKgPerDose: 0.15,
    maxMgPerDose: 12,
    frequency: 'single dose',
    route: 'PO',
    notes:
      'BNFc: 0.15–0.6 mg/kg single dose (commonly 0.15 mg/kg for mild–moderate, 0.6 mg/kg for severe).',
  },
  {
    id: 'artesunate-iv',
    name: 'Artesunate IV — severe malaria',
    indication: 'Severe falciparum malaria',
    mgPerKgPerDose: 3,
    frequency: 'at 0, 12, 24 h then daily',
    route: 'IV / IM',
    notes:
      'WHO Guidelines for malaria 2023: 3 mg/kg/dose in children < 20 kg; 2.4 mg/kg/dose in patients ≥ 20 kg.',
  },
  {
    id: 'vancomycin-paeds',
    name: 'Vancomycin IV (paediatric)',
    indication: 'MRSA / serious gram-positive infection',
    mgPerKgPerDose: 15,
    maxMgPerDose: 1000,
    maxMgPerKgPerDay: 60,
    frequency: 'every 6 h (TDM-guided)',
    route: 'IV',
    notes:
      'BNFc: 15 mg/kg/dose IV q6h, max 1 g/dose. Adjust to trough level per IDSA / BSAC TDM guidance.',
  },
  {
    id: 'meropenem-paeds',
    name: 'Meropenem IV (paediatric)',
    indication: 'Severe sepsis / meningitis (broad-spectrum)',
    mgPerKgPerDose: 20,
    maxMgPerDose: 2000,
    frequency: 'every 8 h (40 mg/kg/dose for meningitis)',
    route: 'IV',
    notes:
      'BNFc: 20 mg/kg/dose q8h for sepsis; 40 mg/kg/dose q8h for meningitis. Max 2 g/dose.',
  },
  {
    id: 'gentamicin-paeds',
    name: 'Gentamicin IV (paediatric, once daily)',
    indication: 'Gram-negative sepsis (adjunct)',
    mgPerKgPerDose: 7,
    maxMgPerDose: 360,
    frequency: 'once daily (extended-interval)',
    route: 'IV',
    notes:
      'BNFc: 7 mg/kg once daily in children ≥ 1 month (TDM-guided). Neonatal regimens differ — use neonatal protocol.',
  },
  {
    id: 'glucose-10-bolus',
    name: 'Glucose 10% — bolus (neonatal hypoglycaemia)',
    indication: 'Symptomatic hypoglycaemia (neonate)',
    mgPerKgPerDose: 500,
    frequency: 'single bolus; repeat per glucose response',
    route: 'IV',
    notes:
      'WHO Pocket Book: 2 mL/kg of glucose 10% (=200 mg glucose/kg) bolus, then infusion. The 500 mg/kg here uses the higher-end "5 mL/kg" regimen in some protocols — confirm against local neonatal guideline.',
  },
  {
    id: 'ondansetron-paeds',
    name: 'Ondansetron (oral / IV) — paediatric',
    indication: 'Vomiting in gastroenteritis (single dose)',
    mgPerKgPerDose: 0.15,
    maxMgPerDose: 8,
    frequency: 'single dose (or every 8 h)',
    route: 'PO / IV',
    notes:
      'BNFc: 0.1–0.15 mg/kg/dose, max 8 mg. Use cautiously; single PO dose reduces need for IV rehydration per Cochrane.',
  },
  {
    id: 'azithromycin-paeds',
    name: 'Azithromycin (oral) — paediatric',
    indication: 'Atypical CAP / pertussis / trachoma',
    mgPerKgPerDose: 10,
    maxMgPerDose: 500,
    frequency: 'once daily × 3 days',
    route: 'PO',
    notes:
      'BNFc: 10 mg/kg once daily × 3 days for community-acquired pneumonia and pertussis (max 500 mg/day).',
  },
  {
    id: 'lorazepam-iv-status',
    name: 'Lorazepam IV — status epilepticus',
    indication: 'Convulsive status epilepticus (first-line benzodiazepine)',
    mgPerKgPerDose: 0.1,
    maxMgPerDose: 4,
    frequency: 'once; repeat after 10 min if seizing',
    route: 'IV/IO',
    notes:
      'APLS / BNFc: 0.1 mg/kg IV or IO, max 4 mg/dose; if no IV access use buccal midazolam first.',
  },
  {
    id: 'phenytoin-iv-status',
    name: 'Phenytoin IV — status epilepticus (2nd line)',
    indication: 'Convulsive status not controlled after benzodiazepines',
    mgPerKgPerDose: 20,
    maxMgPerDose: 1500,
    frequency: 'load over 20 min',
    route: 'IV',
    notes:
      'APLS / BNFc: 20 mg/kg loading dose IV over 20 min (max 1 g, up to 1.5 g in heavier patients); cardiac-monitored, NOT in saline with high glucose. Levetiracetam 60 mg/kg (max 4.5 g) is an alternative second-line per ESETT.',
  },
  {
    id: 'levetiracetam-iv-status',
    name: 'Levetiracetam IV — status epilepticus (2nd line)',
    indication: 'Alternative to phenytoin in established status',
    mgPerKgPerDose: 60,
    maxMgPerDose: 4500,
    frequency: 'load over 5 min',
    route: 'IV',
    notes:
      'ESETT (NEJM 2019) and the BNFc both support 60 mg/kg IV (max 4.5 g) over 5 min for established status; non-inferior to phenytoin and fosphenytoin.',
  },
  {
    id: 'magnesium-iv-asthma',
    name: 'Magnesium sulphate IV — severe asthma',
    indication: 'Acute severe asthma not responsive to nebulised therapy',
    mgPerKgPerDose: 40,
    maxMgPerDose: 2000,
    frequency: 'single dose over 20 min',
    route: 'IV',
    notes:
      'BNFc / BTS: 40 mg/kg over 20 min (max 2 g); monitor BP — vasodilatation common. Continue salbutamol-O₂ alongside.',
  },
  {
    id: 'morphine-iv-paeds',
    name: 'Morphine IV — paediatric analgesia',
    indication: 'Moderate-to-severe acute pain',
    mgPerKgPerDose: 0.1,
    maxMgPerDose: 10,
    frequency: 'every 4 h or PRN',
    route: 'IV',
    notes:
      'BNFc (1 month–12 years): 0.05–0.1 mg/kg/dose IV titrated to effect; halve dose in renal impairment, neonates, and frail patients. Reverse with naloxone.',
    minAgeMonths: 1,
  },
  {
    id: 'naloxone-paeds',
    name: 'Naloxone IV/IM — paediatric opioid reversal',
    indication: 'Opioid-induced respiratory depression',
    mgPerKgPerDose: 0.01,
    maxMgPerDose: 0.4,
    frequency: 'titrate to respiration; repeat every 2–3 min',
    route: 'IV/IM/IO',
    notes:
      'BNFc: 10 micrograms/kg IV (max 400 micrograms); repeat doses commonly required because naloxone half-life is shorter than most opioids. Consider infusion for long-acting opioid overdose.',
  },
  {
    id: 'adrenaline-neb-croup',
    name: 'Adrenaline 1:1000 nebulised — severe croup',
    indication: 'Severe croup with stridor at rest',
    mgPerKgPerDose: 0.5,
    maxMgPerDose: 5,
    frequency: 'single neb; observe for 2–4 h after',
    route: 'NEB',
    notes:
      'APLS: 0.5 mg/kg (= 0.5 mL/kg of 1:1000) nebulised, max 5 mg (= 5 mL). Give with oral dexamethasone 0.15–0.6 mg/kg.',
  },
  {
    id: 'furosemide-iv-paeds',
    name: 'Furosemide IV — paediatric',
    indication: 'Pulmonary oedema / fluid overload',
    mgPerKgPerDose: 1,
    maxMgPerDose: 40,
    frequency: 'every 6–8 h',
    route: 'IV',
    notes:
      'BNFc: 0.5–1 mg/kg/dose IV (slow injection); monitor electrolytes and hydration. Ototoxic in rapid infusion at high doses.',
  },
  {
    id: 'atropine-iv-paeds',
    name: 'Atropine IV — paediatric',
    indication: 'Symptomatic bradycardia / premedication / organophosphate poisoning',
    mgPerKgPerDose: 0.02,
    maxMgPerDose: 0.5,
    frequency: 'as required',
    route: 'IV/IO',
    notes:
      'APLS: 20 micrograms/kg IV (min 100 micrograms, max 500 micrograms); for organophosphate poisoning much higher repeated doses are required — refer toxicology.',
  },
  {
    id: 'cefotaxime-paeds',
    name: 'Cefotaxime IV — paediatric / neonatal',
    indication: 'Neonatal sepsis / meningitis (ceftriaxone alternative)',
    mgPerKgPerDose: 50,
    maxMgPerDose: 2000,
    frequency: 'every 6–8 h (age-dependent)',
    route: 'IV',
    notes:
      'BNFc: 50 mg/kg/dose IV q6–8h; preferred over ceftriaxone in neonates (< 28 days) to avoid bilirubin displacement / calcium precipitation.',
  },
  {
    id: 'metronidazole-paeds',
    name: 'Metronidazole IV/PO — paediatric',
    indication: 'Anaerobic infection / amoebiasis / giardiasis',
    mgPerKgPerDose: 7.5,
    maxMgPerDose: 500,
    frequency: 'every 8 h',
    route: 'IV/PO',
    notes:
      'BNFc: 7.5 mg/kg/dose IV/PO q8h (max 500 mg/dose); 30 mg/kg/day total. Disulfiram-like reaction with alcohol.',
  },
  // ---- Endocrine / electrolyte emergencies ----
  {
    id: 'hydrocortisone-iv-paeds',
    name: 'Hydrocortisone IV — paediatric',
    indication: 'Adrenal crisis / severe asthma / anaphylaxis adjunct',
    mgPerKgPerDose: 4,
    maxMgPerDose: 100,
    frequency: 'every 6 h',
    route: 'IV/IM',
    notes:
      'BNFc / APLS: 4 mg/kg/dose IV q6h (max 100 mg/dose for asthma; up to 100 mg/dose for adrenal crisis regardless of weight in older children).',
  },
  {
    id: 'calcium-gluconate-iv-paeds',
    name: 'Calcium gluconate 10% IV — paediatric',
    indication: 'Symptomatic hypocalcaemia / hyperkalaemia cardiac protection',
    mgPerKgPerDose: 50,
    maxMgPerDose: 2000,
    frequency: 'every 6 h',
    route: 'slow IV',
    notes:
      'APLS / BNFc: 0.5 mL/kg of 10% (= 50 mg/kg) slow IV over 5–10 min; cardiac monitoring; max single dose 20 mL (2 g). Extravasation causes severe tissue necrosis — use central line where possible.',
  },
  // NB: sodium bicarbonate (mmol/kg), 3% NaCl (mL/kg), mannitol (g/kg),
  // insulin DKA (units/kg/hr), vitamin K (flat 1 mg IM), mebendazole /
  // albendazole (fixed PO dose), ORS (mL/kg) are intentionally NOT in
  // this mg-per-kg table — their native units don't map to mg without
  // a unit-mismatch hazard. They live under /app/antidotes and the
  // condition-level protocols instead, where the right units are shown.
  // ---- Antimicrobials (paediatric extension) ----
  {
    id: 'flucloxacillin-paeds',
    name: 'Flucloxacillin IV/PO — paediatric',
    indication: 'Staphylococcal skin / soft-tissue / bone infection',
    mgPerKgPerDose: 25,
    maxMgPerDose: 1000,
    maxMgPerKgPerDay: 100,
    frequency: 'every 6 h',
    route: 'IV/PO',
    notes:
      'BNFc: 12.5–25 mg/kg/dose q6h IV/PO; 50 mg/kg/dose for severe sepsis (max 2 g/dose). Hepatotoxicity rare but reported — monitor LFTs >14d.',
  },
  {
    id: 'cloxacillin-paeds',
    name: 'Cloxacillin IV — paediatric (Kenya EML)',
    indication: 'Staphylococcal infection (Kenya / WHO EML alternative to flucloxacillin)',
    mgPerKgPerDose: 50,
    maxMgPerDose: 2000,
    maxMgPerKgPerDay: 200,
    frequency: 'every 6 h',
    route: 'IV',
    notes:
      'WHO EML / Kenya MoH: 50 mg/kg/dose IV q6h for severe staphylococcal infection (max 2 g/dose).',
  },
  {
    id: 'erythromycin-paeds',
    name: 'Erythromycin PO — paediatric',
    indication: 'Pertussis / chlamydia / penicillin-allergic alternative',
    mgPerKgPerDose: 12.5,
    maxMgPerDose: 500,
    maxMgPerKgPerDay: 50,
    frequency: 'every 6 h',
    route: 'PO',
    notes:
      'BNFc: 12.5 mg/kg/dose q6h (40–50 mg/kg/day); avoid in infants <2 weeks (pyloric stenosis risk).',
  },
  {
    id: 'fluconazole-paeds',
    name: 'Fluconazole PO/IV — paediatric',
    indication: 'Oral / oesophageal candidiasis; cryptococcal step-down',
    mgPerKgPerDose: 6,
    maxMgPerDose: 400,
    maxMgPerKgPerDay: 12,
    frequency: 'once daily',
    route: 'PO/IV',
    notes:
      'BNFc / WHO HIV: 6 mg/kg loading then 3–6 mg/kg once daily (max 400 mg). QT-prolonging — co-medication check.',
    minAgeMonths: 0,
  },
  {
    id: 'acyclovir-iv-paeds',
    name: 'Acyclovir IV — paediatric',
    indication: 'Neonatal HSV / VZV encephalitis',
    mgPerKgPerDose: 20,
    maxMgPerDose: 1000,
    maxMgPerKgPerDay: 60,
    frequency: 'every 8 h',
    route: 'slow IV over 1 h',
    notes:
      'BNFc: 20 mg/kg/dose q8h IV for HSV/VZV CNS disease; infuse over 1 h to limit nephrotoxicity (crystalluria). Hydrate well; monitor renal function.',
  },
  {
    id: 'ciprofloxacin-paeds',
    name: 'Ciprofloxacin PO — paediatric',
    indication: 'Severe typhoid / Pseudomonas / complicated UTI (use sparingly)',
    mgPerKgPerDose: 15,
    maxMgPerDose: 750,
    maxMgPerKgPerDay: 30,
    frequency: 'every 12 h',
    route: 'PO',
    notes:
      'BNFc / WHO: 15 mg/kg/dose bd (max 750 mg) when no alternative; cartilage warning historically theoretical. Avoid with dairy / antacids within 2 h.',
  },
  {
    id: 'ferrous-sulphate-paeds',
    name: 'Ferrous sulphate PO — paediatric',
    indication: 'Iron-deficiency anaemia treatment',
    mgPerKgPerDose: 3, // 3 mg elemental iron/kg/dose
    maxMgPerDose: 65,
    maxMgPerKgPerDay: 6,
    frequency: 'every 12 h',
    route: 'PO',
    notes:
      'WHO / BNFc: 3 mg/kg/dose elemental iron bd (or 6 mg/kg once daily). 200 mg ferrous sulphate ≈ 65 mg elemental iron. Take 1 h before food; black stools expected.',
  },
];

const VITALS: VitalsBand[] = [
  { band: 'Preterm (<37 wk PMA)', hr: '120–170', rr: '40–70', sysBp: '50–70', spo2: '90–95 (per PMA target)' },
  { band: 'Neonate (0–28 d)', hr: '120–160', rr: '30–60', sysBp: '60–80', spo2: '≥ 95' },
  { band: 'Infant 1–3 mo', hr: '110–160', rr: '30–55', sysBp: '70–90', spo2: '≥ 95' },
  { band: 'Infant 3–12 mo', hr: '100–150', rr: '25–45', sysBp: '75–95', spo2: '≥ 95' },
  { band: 'Toddler (1–3 y)', hr: '90–150', rr: '20–40', sysBp: '80–100', spo2: '≥ 95' },
  { band: 'Pre-school (3–5 y)', hr: '80–140', rr: '20–30', sysBp: '85–105', spo2: '≥ 95' },
  { band: 'School (5–8 y)', hr: '75–130', rr: '18–28', sysBp: '90–110', spo2: '≥ 95' },
  { band: 'School (8–12 y)', hr: '70–120', rr: '16–25', sysBp: '95–115', spo2: '≥ 95' },
  { band: 'Adolescent (12–15 y)', hr: '60–110', rr: '14–22', sysBp: '100–125', spo2: '≥ 95' },
  { band: 'Adolescent (≥15 y)', hr: '60–100', rr: '12–20', sysBp: '100–130', spo2: '≥ 95' },
  { band: 'Adult', hr: '60–100', rr: '12–20', sysBp: '100–140', spo2: '≥ 95' },
  { band: 'Older adult (≥75 y)', hr: '60–100', rr: '12–20', sysBp: '110–150', spo2: '≥ 94' },
];

const SCORING: ScoringSystem[] = [
  {
    id: 'news2',
    name: 'NEWS2',
    citation: 'Royal College of Physicians 2017. Adult inpatients (≥16y), not pregnant.',
    type: 'band',
    axes: [
      {
        id: 'rr',
        label: 'Respiratory rate (/min)',
        options: [
          { label: '≤ 8', score: 3 },
          { label: '9–11', score: 1 },
          { label: '12–20', score: 0 },
          { label: '21–24', score: 2 },
          { label: '≥ 25', score: 3 },
        ],
      },
      {
        id: 'spo2',
        label: 'SpO₂ scale 1 (%)',
        options: [
          { label: '≤ 91', score: 3 },
          { label: '92–93', score: 2 },
          { label: '94–95', score: 1 },
          { label: '≥ 96', score: 0 },
        ],
      },
      {
        id: 'air',
        label: 'Supplemental O₂',
        options: [
          { label: 'Air', score: 0 },
          { label: 'Oxygen', score: 2 },
        ],
      },
      {
        id: 'temp',
        label: 'Temperature (°C)',
        options: [
          { label: '≤ 35.0', score: 3 },
          { label: '35.1–36.0', score: 1 },
          { label: '36.1–38.0', score: 0 },
          { label: '38.1–39.0', score: 1 },
          { label: '≥ 39.1', score: 2 },
        ],
      },
      {
        id: 'sbp',
        label: 'Systolic BP (mmHg)',
        options: [
          { label: '≤ 90', score: 3 },
          { label: '91–100', score: 2 },
          { label: '101–110', score: 1 },
          { label: '111–219', score: 0 },
          { label: '≥ 220', score: 3 },
        ],
      },
      {
        id: 'hr',
        label: 'Heart rate (/min)',
        options: [
          { label: '≤ 40', score: 3 },
          { label: '41–50', score: 1 },
          { label: '51–90', score: 0 },
          { label: '91–110', score: 1 },
          { label: '111–130', score: 2 },
          { label: '≥ 131', score: 3 },
        ],
      },
      {
        id: 'avpu',
        label: 'Consciousness (ACVPU)',
        options: [
          { label: 'Alert', score: 0 },
          { label: 'New confusion', score: 3 },
          { label: 'V', score: 3 },
          { label: 'P', score: 3 },
          { label: 'U', score: 3 },
        ],
      },
    ],
  },
  {
    id: 'qsofa',
    name: 'qSOFA',
    citation: 'Singer JAMA 2016 / Sepsis-3. Outside ICU. ≥ 2 = increased mortality risk.',
    type: 'toggle',
    axes: [
      { id: 'resp', label: 'Respiratory rate ≥ 22/min', points: 1 },
      { id: 'sbp', label: 'Systolic BP ≤ 100 mmHg', points: 1 },
      { id: 'ams', label: 'Altered mental status (GCS < 15)', points: 1 },
    ],
  },
  {
    id: 'wells-pe',
    name: 'Wells PE',
    citation: 'Modified Wells (1998). Combine with age-adjusted D-dimer + CTPA per ESC 2019.',
    type: 'toggle',
    axes: [
      { id: 'dvt', label: 'Clinical signs/symptoms of DVT', points: 3 },
      { id: 'alt', label: 'PE is #1 diagnosis OR equally likely', points: 3 },
      { id: 'hr', label: 'Heart rate > 100/min', points: 1.5 },
      { id: 'immob', label: 'Immobilisation ≥ 3 d OR surgery in past 4 wk', points: 1.5 },
      { id: 'prior', label: 'Previous DVT/PE', points: 1.5 },
      { id: 'haemo', label: 'Haemoptysis', points: 1 },
      { id: 'malig', label: 'Malignancy (treatment in 6 mo or palliative)', points: 1 },
    ],
  },
  {
    id: 'cha2ds2-vasc',
    name: 'CHA₂DS₂-VASc',
    citation: 'ESC 2024 + ACC/AHA/HRS 2023. Non-valvular AF stroke risk.',
    type: 'toggle',
    axes: [
      { id: 'chf', label: 'Congestive heart failure / LV dysfunction', points: 1 },
      { id: 'htn', label: 'Hypertension', points: 1 },
      { id: 'age75', label: 'Age ≥ 75', points: 2 },
      { id: 'dm', label: 'Diabetes mellitus', points: 1 },
      { id: 'stroke', label: 'Prior stroke / TIA / thromboembolism', points: 2 },
      { id: 'vasc', label: 'Vascular disease (MI / PAD / aortic plaque)', points: 1 },
      { id: 'age65', label: 'Age 65–74', points: 1 },
      { id: 'sex', label: 'Sex category female', points: 1 },
    ],
  },
  {
    id: 'heart',
    name: 'HEART score',
    citation: 'Six AJ et al, Neth Heart J 2008. ED chest pain risk-stratification.',
    type: 'band',
    axes: [
      {
        id: 'history',
        label: 'History',
        options: [
          { label: 'Slightly suspicious', score: 0 },
          { label: 'Moderately suspicious', score: 1 },
          { label: 'Highly suspicious', score: 2 },
        ],
      },
      {
        id: 'ecg',
        label: 'ECG',
        options: [
          { label: 'Normal', score: 0 },
          { label: 'Non-specific repolarisation disturbance', score: 1 },
          { label: 'Significant ST deviation', score: 2 },
        ],
      },
      {
        id: 'age',
        label: 'Age (years)',
        options: [
          { label: '< 45', score: 0 },
          { label: '45–64', score: 1 },
          { label: '≥ 65', score: 2 },
        ],
      },
      {
        id: 'risk',
        label: 'Risk factors (HTN, ↑chol, DM, smoking, FHx, obesity)',
        options: [
          { label: 'No known risk factors', score: 0 },
          { label: '1–2 risk factors', score: 1 },
          { label: '≥ 3 risk factors OR known atherosclerosis', score: 2 },
        ],
      },
      {
        id: 'troponin',
        label: 'Initial troponin',
        options: [
          { label: '≤ normal limit', score: 0 },
          { label: '1–3 × normal limit', score: 1 },
          { label: '> 3 × normal limit', score: 2 },
        ],
      },
    ],
  },
  {
    id: 'curb-65',
    name: 'CURB-65',
    citation: 'Lim WS et al, Thorax 2003. Community-acquired pneumonia severity (adults).',
    type: 'toggle',
    axes: [
      { id: 'confusion', label: 'Confusion (new disorientation in person/place/time)', points: 1 },
      { id: 'urea', label: 'Urea > 7 mmol/L (BUN > 19 mg/dL)', points: 1 },
      { id: 'rr', label: 'Respiratory rate ≥ 30/min', points: 1 },
      { id: 'bp', label: 'Systolic BP < 90 OR diastolic ≤ 60 mmHg', points: 1 },
      { id: 'age', label: 'Age ≥ 65 years', points: 1 },
    ],
  },
  {
    id: 'gcs',
    name: 'Glasgow Coma Scale',
    citation: 'Teasdale & Jennett, Lancet 1974. Adult coma assessment (E + V + M).',
    type: 'band',
    axes: [
      {
        id: 'eye',
        label: 'Eye opening',
        options: [
          { label: 'None', score: 1 },
          { label: 'To pain', score: 2 },
          { label: 'To voice', score: 3 },
          { label: 'Spontaneous', score: 4 },
        ],
      },
      {
        id: 'verbal',
        label: 'Verbal response',
        options: [
          { label: 'None', score: 1 },
          { label: 'Incomprehensible sounds', score: 2 },
          { label: 'Inappropriate words', score: 3 },
          { label: 'Confused', score: 4 },
          { label: 'Oriented', score: 5 },
        ],
      },
      {
        id: 'motor',
        label: 'Motor response',
        options: [
          { label: 'None', score: 1 },
          { label: 'Extension to pain', score: 2 },
          { label: 'Abnormal flexion', score: 3 },
          { label: 'Withdraws from pain', score: 4 },
          { label: 'Localises pain', score: 5 },
          { label: 'Obeys commands', score: 6 },
        ],
      },
    ],
  },
  {
    id: 'centor-mcisaac',
    name: 'Centor / McIsaac criteria',
    citation: 'McIsaac WJ et al, JAMA 2004. Group A strep pharyngitis pre-test probability.',
    type: 'toggle',
    axes: [
      { id: 'tonsillar', label: 'Tonsillar exudate / swelling', points: 1 },
      { id: 'nodes', label: 'Tender anterior cervical lymphadenopathy', points: 1 },
      { id: 'fever', label: 'History of fever > 38 °C', points: 1 },
      { id: 'cough', label: 'Absence of cough', points: 1 },
      { id: 'age3-14', label: 'Age 3–14 years', points: 1 },
      { id: 'age45plus', label: 'Age ≥ 45 years', points: -1 },
    ],
  },
  {
    id: 'wells-dvt',
    name: 'Wells DVT score',
    citation: 'Wells PS et al, Lancet 1997. Deep vein thrombosis pre-test probability.',
    type: 'toggle',
    axes: [
      { id: 'cancer', label: 'Active cancer (treatment within 6 mo or palliative)', points: 1 },
      { id: 'paralysis', label: 'Paralysis, paresis OR recent plaster immobilisation', points: 1 },
      { id: 'bedrest', label: 'Bedridden ≥ 3 d OR major surgery within 12 wk', points: 1 },
      { id: 'tender', label: 'Localised tenderness along deep venous system', points: 1 },
      { id: 'swelling', label: 'Entire leg swollen', points: 1 },
      { id: 'calf', label: 'Calf swelling > 3 cm vs asymptomatic leg', points: 1 },
      { id: 'pitting', label: 'Pitting oedema confined to symptomatic leg', points: 1 },
      { id: 'collateral', label: 'Collateral superficial (non-varicose) veins', points: 1 },
      { id: 'priordvt', label: 'Previously documented DVT', points: 1 },
      { id: 'altdx', label: 'Alternative diagnosis at least as likely as DVT', points: -2 },
    ],
  },
  {
    id: 'abcd2',
    name: 'ABCD² score',
    citation: 'Johnston SC et al, Lancet 2007. Early stroke risk after TIA.',
    type: 'band',
    axes: [
      {
        id: 'age',
        label: 'Age',
        options: [
          { label: '< 60', score: 0 },
          { label: '≥ 60', score: 1 },
        ],
      },
      {
        id: 'bp',
        label: 'Blood pressure at presentation',
        options: [
          { label: 'SBP < 140 AND DBP < 90', score: 0 },
          { label: 'SBP ≥ 140 OR DBP ≥ 90', score: 1 },
        ],
      },
      {
        id: 'clinical',
        label: 'Clinical features',
        options: [
          { label: 'Other symptoms', score: 0 },
          { label: 'Speech disturbance without weakness', score: 1 },
          { label: 'Unilateral weakness', score: 2 },
        ],
      },
      {
        id: 'duration',
        label: 'Duration of symptoms',
        options: [
          { label: '< 10 min', score: 0 },
          { label: '10–59 min', score: 1 },
          { label: '≥ 60 min', score: 2 },
        ],
      },
      {
        id: 'dm',
        label: 'Diabetes',
        options: [
          { label: 'No', score: 0 },
          { label: 'Yes', score: 1 },
        ],
      },
    ],
  },
  {
    id: 'has-bled',
    name: 'HAS-BLED',
    citation: 'Pisters R et al, Chest 2010. Bleeding risk on oral anticoagulation in AF.',
    type: 'toggle',
    axes: [
      { id: 'htn', label: 'Hypertension (uncontrolled, SBP > 160 mmHg)', points: 1 },
      { id: 'abnRenal', label: 'Abnormal renal function (Cr > 200 µmol/L or dialysis / transplant)', points: 1 },
      { id: 'abnLiver', label: 'Abnormal liver function (cirrhosis or bilirubin > 2× ULN with ALT > 3× ULN)', points: 1 },
      { id: 'stroke', label: 'Prior stroke', points: 1 },
      { id: 'bleed', label: 'Bleeding history or predisposition', points: 1 },
      { id: 'labileInr', label: 'Labile INR (< 60% TTR on warfarin)', points: 1 },
      { id: 'elderly', label: 'Elderly (age > 65)', points: 1 },
      { id: 'drugs', label: 'Drugs predisposing to bleeding (antiplatelet, NSAID)', points: 1 },
      { id: 'alcohol', label: 'Alcohol use ≥ 8 units/week', points: 1 },
    ],
  },
  {
    id: '4ts-hit',
    name: '4Ts score (heparin-induced thrombocytopenia)',
    citation: 'Lo GK et al, J Thromb Haemost 2006. HIT clinical pre-test probability.',
    type: 'band',
    axes: [
      {
        id: 'thrombocytopenia',
        label: 'Thrombocytopenia (magnitude of platelet fall)',
        options: [
          { label: 'Fall < 30% OR nadir < 10 ×10⁹/L', score: 0 },
          { label: 'Fall 30–50% OR nadir 10–19 ×10⁹/L', score: 1 },
          { label: 'Fall > 50% AND nadir ≥ 20 ×10⁹/L', score: 2 },
        ],
      },
      {
        id: 'timing',
        label: 'Timing of platelet fall from heparin exposure',
        options: [
          { label: 'Fall < 4 days, no prior heparin', score: 0 },
          { label: 'Consistent with day 5–10 but unclear OR fall ≤ 1 day with heparin in last 30–100 d', score: 1 },
          { label: 'Clear onset days 5–10, OR ≤ 1 day with heparin in last 30 d', score: 2 },
        ],
      },
      {
        id: 'thrombosis',
        label: 'Thrombosis or other sequelae',
        options: [
          { label: 'None', score: 0 },
          { label: 'Progressive/recurrent thrombosis OR erythematous skin lesions OR suspected but not proven', score: 1 },
          { label: 'New thrombosis, skin necrosis, OR post-bolus acute systemic reaction', score: 2 },
        ],
      },
      {
        id: 'otherCauses',
        label: 'Other causes of thrombocytopenia',
        options: [
          { label: 'Definite alternative cause', score: 0 },
          { label: 'Possible alternative cause', score: 1 },
          { label: 'None apparent', score: 2 },
        ],
      },
    ],
  },
  {
    id: 'perc',
    name: 'PERC rule (PE rule-out)',
    citation: 'Kline JA et al, J Thromb Haemost 2008. Use only when clinical gestalt is low pre-test probability.',
    type: 'toggle',
    axes: [
      { id: 'age50', label: 'Age ≥ 50', points: 1 },
      { id: 'hr100', label: 'Heart rate ≥ 100/min', points: 1 },
      { id: 'spo295', label: 'SaO₂ < 95% on room air', points: 1 },
      { id: 'haemoptysis', label: 'Haemoptysis', points: 1 },
      { id: 'estrogen', label: 'Oestrogen use', points: 1 },
      { id: 'priorVte', label: 'Prior DVT or PE', points: 1 },
      { id: 'surgeryTrauma', label: 'Surgery or trauma in past 4 wk (requiring GA)', points: 1 },
      { id: 'unilateral', label: 'Unilateral leg swelling', points: 1 },
    ],
  },
  {
    id: 'sofa',
    name: 'SOFA (Sequential Organ Failure Assessment)',
    citation: 'Vincent JL et al, Intensive Care Med 1996. ICU organ-failure score; rise ≥ 2 = sepsis per Sepsis-3.',
    type: 'band',
    axes: [
      {
        id: 'respiration',
        label: 'Respiration — PaO₂/FiO₂ (kPa)',
        options: [
          { label: '≥ 53.3 (≥ 400 mmHg)', score: 0 },
          { label: '< 53.3', score: 1 },
          { label: '< 39.9', score: 2 },
          { label: '< 26.6 with respiratory support', score: 3 },
          { label: '< 13.3 with respiratory support', score: 4 },
        ],
      },
      {
        id: 'coagulation',
        label: 'Coagulation — Platelets (×10³/µL)',
        options: [
          { label: '≥ 150', score: 0 },
          { label: '< 150', score: 1 },
          { label: '< 100', score: 2 },
          { label: '< 50', score: 3 },
          { label: '< 20', score: 4 },
        ],
      },
      {
        id: 'liver',
        label: 'Liver — Bilirubin (µmol/L)',
        options: [
          { label: '< 20', score: 0 },
          { label: '20–32', score: 1 },
          { label: '33–101', score: 2 },
          { label: '102–204', score: 3 },
          { label: '> 204', score: 4 },
        ],
      },
      {
        id: 'cardiovascular',
        label: 'Cardiovascular',
        options: [
          { label: 'MAP ≥ 70 mmHg', score: 0 },
          { label: 'MAP < 70 mmHg', score: 1 },
          { label: 'Dop ≤ 5 OR any dobutamine', score: 2 },
          { label: 'Dop > 5 OR epi/norepi ≤ 0.1 µg/kg/min', score: 3 },
          { label: 'Dop > 15 OR epi/norepi > 0.1 µg/kg/min', score: 4 },
        ],
      },
      {
        id: 'cns',
        label: 'Central nervous system (GCS)',
        options: [
          { label: '15', score: 0 },
          { label: '13–14', score: 1 },
          { label: '10–12', score: 2 },
          { label: '6–9', score: 3 },
          { label: '< 6', score: 4 },
        ],
      },
      {
        id: 'renal',
        label: 'Renal — Creatinine (µmol/L) OR urine output',
        options: [
          { label: '< 110', score: 0 },
          { label: '110–170', score: 1 },
          { label: '171–299', score: 2 },
          { label: '300–440 OR UO < 500 mL/d', score: 3 },
          { label: '> 440 OR UO < 200 mL/d', score: 4 },
        ],
      },
    ],
  },
];

/**
 * Equianalgesic opioid table. Values are the dose of THIS drug-route that
 * is equivalent to 30 mg oral morphine — the AAHPM 2023 reference dose.
 * Conservatively chosen at the high (least potent) end of published
 * ranges where ranges exist; safer to underestimate the new opioid than
 * to over-shoot. Methadone is intentionally NOT in this table — methadone
 * rotation requires specialist input (non-linear, dose-dependent ratios).
 */
const EQUIANALGESIC_OPIOIDS: EquianalgesicOpioid[] = [
  {
    id: 'morphine-po',
    name: 'Morphine PO',
    route: 'PO',
    doseEquivalentTo30mgOralMorphine: 30,
    defaultDurationHours: 4,
    notes:
      'Reference standard. Immediate-release every 4 h or modified-release every 12 h. Renal impairment: active metabolite M6G accumulates; reduce dose or switch to fentanyl/oxycodone if eGFR <30.',
  },
  {
    id: 'morphine-iv',
    name: 'Morphine IV / SC',
    route: 'IV',
    doseEquivalentTo30mgOralMorphine: 10,
    defaultDurationHours: 4,
    notes:
      'IV:PO ratio 1:3 (parenteral 10 mg ≡ oral 30 mg). Onset 5–10 min; peak 15–20 min IV. Same renal cautions as PO.',
  },
  {
    id: 'oxycodone-po',
    name: 'Oxycodone PO',
    route: 'PO',
    doseEquivalentTo30mgOralMorphine: 20,
    defaultDurationHours: 4,
    notes:
      'Roughly 1.5× as potent as oral morphine. Preferred alternative in mild–moderate renal impairment (no active morphine-like metabolites). Modified-release q12h.',
  },
  {
    id: 'oxycodone-iv',
    name: 'Oxycodone IV',
    route: 'IV',
    doseEquivalentTo30mgOralMorphine: 10,
    defaultDurationHours: 4,
    notes:
      'IV:PO ratio 1:2. Useful peri-operative when switching off PCA — convert IV oxycodone × 2 for the PO equivalent.',
  },
  {
    id: 'hydromorphone-po',
    name: 'Hydromorphone PO',
    route: 'PO',
    doseEquivalentTo30mgOralMorphine: 6,
    defaultDurationHours: 4,
    notes:
      'About 5× as potent as oral morphine. Preferred in moderate-to-severe renal impairment; minimal active metabolites (H3G is neuroexcitatory but not opioid).',
  },
  {
    id: 'hydromorphone-iv',
    name: 'Hydromorphone IV',
    route: 'IV',
    doseEquivalentTo30mgOralMorphine: 1.5,
    defaultDurationHours: 3,
    notes:
      'IV:PO ratio 1:4 for hydromorphone. Very small volumes — beware decimal-point error (the most common fatal hydromorphone mistake).',
  },
  {
    id: 'fentanyl-iv',
    name: 'Fentanyl IV',
    route: 'IV',
    // 30 mg oral morphine ≈ 10 mg IV morphine ≈ 100 mcg (0.1 mg) IV fentanyl.
    // Was 0.3 — a ~3× value that produced a fentanyl overdose on rotation.
    doseEquivalentTo30mgOralMorphine: 0.1,
    defaultDurationHours: 1,
    notes:
      'Onset 1–2 min; duration 30–60 min. Preferred in renal failure (no active metabolites) and end-of-life dyspnoea. Short half-life means PCA / infusion, not q4h dosing.',
  },
  {
    id: 'fentanyl-transdermal',
    name: 'Fentanyl transdermal patch',
    route: 'transdermal',
    // 25 mcg/h patch ≈ 60 mg/d oral morphine ≡ 2.5 mg/h ≈ 30 mg oral morphine per 12 h.
    // Computed differently: per-30-mg-OME 'dose' is the daily mcg, so 25 mcg/h = 600 mcg/d.
    doseEquivalentTo30mgOralMorphine: 12.5, // mcg/h that ≈ 30 mg/24h oral morphine
    defaultDurationHours: 72,
    notes:
      'CAUTION: patch strength is mcg/HOUR, not per patch. 25 mcg/h ≈ 60 mg oral morphine/day. Reservoir effect — peak plasma 24–48 h after start; fever increases absorption. Opioid-naïve = NOT for first opioid. Take this row as mcg/h equivalence; computed dose is mcg/h, not mg.',
  },
  {
    id: 'codeine-po',
    name: 'Codeine PO',
    route: 'PO',
    doseEquivalentTo30mgOralMorphine: 200,
    defaultDurationHours: 4,
    notes:
      'About 1/7 as potent as oral morphine. Pro-drug; CYP2D6 variability — ultra-rapid metabolisers risk fatal toxicity; poor metabolisers get no effect. Avoid in children <12 y; avoid in breastfeeding.',
  },
  {
    id: 'tramadol-po',
    name: 'Tramadol PO',
    route: 'PO',
    doseEquivalentTo30mgOralMorphine: 150,
    defaultDurationHours: 4,
    notes:
      'About 1/5 of oral morphine. Dual SNRI + weak μ-agonist — serotonin-syndrome risk with SSRIs / MAOIs / linezolid. Ceiling 400 mg/day (300 mg in >75 y). CYP2D6 variability.',
  },
  {
    id: 'tapentadol-po',
    name: 'Tapentadol PO',
    route: 'PO',
    doseEquivalentTo30mgOralMorphine: 100,
    defaultDurationHours: 4,
    notes:
      'Roughly 1/3 of oral morphine. Combined μ-agonist + NRI. Lower GI side-effects than morphine; not available everywhere.',
  },
  {
    id: 'buprenorphine-sublingual',
    name: 'Buprenorphine sublingual',
    route: 'sublingual',
    doseEquivalentTo30mgOralMorphine: 0.4,
    defaultDurationHours: 8,
    notes:
      'About 75× as potent as oral morphine on a milligram basis (analgesic dosing). Partial agonist with ceiling for respiratory depression — safer in elderly / renal disease. Caution when switching FROM full agonist: may precipitate withdrawal.',
  },
  {
    id: 'pethidine-iv',
    name: 'Pethidine (meperidine) IM/IV',
    route: 'IM',
    doseEquivalentTo30mgOralMorphine: 75,
    defaultDurationHours: 3,
    notes:
      'AVOID for routine analgesia. Active metabolite norpethidine is neurotoxic (seizures), accumulates in renal impairment, and is not naloxone-reversible. Single-dose obstetric / shivering indications only.',
  },
];

export const CLINICAL_TOOLS_DATA: ClinicalToolsResponse = {
  doseDrugs: DOSE_DRUGS,
  vitals: VITALS,
  scoringSystems: SCORING,
  equianalgesicOpioids: EQUIANALGESIC_OPIOIDS,
};
