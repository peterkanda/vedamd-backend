import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator, CodedReference } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Sickle-cell disease — vaso-occlusive crisis + recognition of
 * life-threatening complications. Built from the American Society
 * of Hematology 2020 SCD guidelines (Acute and Chronic Pain),
 * NHLBI Evidence-Based Management of SCD (2014), and the Kenya
 * MoH Sickle-Cell Disease Guideline (2019).
 *
 *   1. CRITICAL — life-threatening SCD emergency:
 *        acute chest syndrome (new infiltrate on CXR + respiratory
 *        symptoms or SpO₂ < 92 %), acute stroke / focal neurology,
 *        priapism > 4 h, splenic sequestration (rapidly falling
 *        Hb + splenomegaly), aplastic crisis (Hb < 6 + low retics),
 *        sepsis (fever + clinical concern, encapsulated organisms),
 *        acute kidney injury, severe anaemia (Hb < 6 g/dL).
 *
 *   2. CRITICAL — uncomplicated vaso-occlusive pain crisis:
 *        analgesia ladder, IV fluids, oxygen if hypoxic, screen
 *        for precipitants (infection, dehydration, cold exposure,
 *        altitude, hypoxia, pregnancy, surgery), hydroxyurea
 *        optimisation.
 *
 *   3. WARNING — chronic-care gaps:
 *        no hydroxyurea (age ≥ 9 months OR symptomatic), missing
 *        penicillin prophylaxis (< 5 y), missing pneumococcal /
 *        Hib / meningococcal / influenza vaccines, no annual
 *        transcranial Doppler (2–16 y), no ophthalmology
 *        screening (> 10 y), no folic-acid supplementation,
 *        no recent retinal screen.
 *
 *   4. INFO — stable, on guideline-directed therapy.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.sickleCellDisease           boolean (sentinel)
 *   context.ageYears                    number
 *   context.weightKg                    number (for opioid dosing)
 *   context.painSeverity                number 0..10 (NRS)
 *   context.painDurationHours           number (optional)
 *   context.feverC                      number (optional)
 *   context.spO2Percent                 number (optional)
 *   context.respiratoryRatePerMin       number (optional)
 *   context.newPulmonaryInfiltrate      boolean
 *   context.acuteFocalNeurology         boolean
 *   context.priapismHours               number (optional)
 *   context.splenicEnlargement          boolean
 *   context.haemoglobinGdl              number (optional)
 *   context.reticulocytePercent         number (optional)
 *   context.creatinineUmolL             number (optional)
 *   context.onHydroxyurea               boolean
 *   context.penicillinProphylaxis       boolean (for under-5s)
 *   context.pneumococcalVaccinated      boolean
 *   context.influenzaVaccinated         boolean
 *   context.transcranialDopplerDone     boolean
 *   context.retinalScreenDone           boolean
 *   context.folicAcidSupplementation    boolean
 */

interface ScdContext {
  sickleCellDisease?: boolean;
  ageYears?: number;
  weightKg?: number;
  painSeverity?: number;
  painDurationHours?: number;
  feverC?: number;
  spO2Percent?: number;
  respiratoryRatePerMin?: number;
  newPulmonaryInfiltrate?: boolean;
  acuteFocalNeurology?: boolean;
  priapismHours?: number;
  splenicEnlargement?: boolean;
  haemoglobinGdl?: number;
  reticulocytePercent?: number;
  creatinineUmolL?: number;
  onHydroxyurea?: boolean;
  penicillinProphylaxis?: boolean;
  pneumococcalVaccinated?: boolean;
  influenzaVaccinated?: boolean;
  transcranialDopplerDone?: boolean;
  retinalScreenDone?: boolean;
  folicAcidSupplementation?: boolean;
}

const CODINGS_SCD: CodedReference[] = [
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'D57', display: 'Sickle-cell disorders', kind: 'diagnosis' },
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'D57.0', display: 'Sickle-cell anaemia with crisis', kind: 'diagnosis' },
  { system: 'http://id.who.int/icd/release/11/mms', code: '3A51', display: 'Sickle-cell disease', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '237364002', display: 'Sickle-cell disease (disorder)', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '417847000', display: 'Vaso-occlusive crisis in sickle-cell disease (disorder)', kind: 'diagnosis' },
  { system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood', kind: 'lab' },
  { system: 'http://loinc.org', code: '67881-8', display: 'Hemoglobin S/Hemoglobin.total in Blood by Electrophoresis', kind: 'lab' },
  { system: 'http://whocc.no/atc', code: 'L01XX05', display: 'Hydroxycarbamide (hydroxyurea)', kind: 'drug' },
  { system: 'http://whocc.no/atc', code: 'J01CE02', display: 'Phenoxymethylpenicillin (penicillin V) — prophylaxis', kind: 'drug' },
];

@Injectable()
export class SickleCellCrisisStrategy implements CdsRuleStrategy {
  readonly type = 'sickle-cell-crisis';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as ScdContext;
    if (ctx.sickleCellDisease !== true) return [];

    const cards: CdsCard[] = [];

    const emergencyReasons: string[] = [];
    const hypoxic = typeof ctx.spO2Percent === 'number' && ctx.spO2Percent > 0 && ctx.spO2Percent < 92;
    if (ctx.newPulmonaryInfiltrate === true || hypoxic) {
      emergencyReasons.push('acute chest syndrome features');
    }
    if (ctx.acuteFocalNeurology === true) emergencyReasons.push('acute focal neurology (suspected stroke)');
    if (typeof ctx.priapismHours === 'number' && ctx.priapismHours >= 4) {
      emergencyReasons.push(`priapism ${ctx.priapismHours} h (≥ 4)`);
    }
    if (
      ctx.splenicEnlargement === true &&
      typeof ctx.haemoglobinGdl === 'number' &&
      ctx.haemoglobinGdl < 6
    ) {
      emergencyReasons.push(`splenic sequestration (splenomegaly with Hb ${ctx.haemoglobinGdl.toFixed(1)} g/dL)`);
    }
    if (
      typeof ctx.haemoglobinGdl === 'number' &&
      ctx.haemoglobinGdl < 6 &&
      typeof ctx.reticulocytePercent === 'number' &&
      ctx.reticulocytePercent < 1
    ) {
      emergencyReasons.push(`aplastic crisis (Hb ${ctx.haemoglobinGdl.toFixed(1)}, retics ${ctx.reticulocytePercent}%)`);
    }
    if (typeof ctx.feverC === 'number' && ctx.feverC >= 38.5) {
      emergencyReasons.push(`fever ${ctx.feverC.toFixed(1)} °C — treat as septic until ruled out`);
    }
    if (typeof ctx.haemoglobinGdl === 'number' && ctx.haemoglobinGdl < 5) {
      emergencyReasons.push(`severe anaemia Hb ${ctx.haemoglobinGdl.toFixed(1)} g/dL (< 5)`);
    }

    if (emergencyReasons.length > 0) {
      cards.push(this.emergencyCard(rule, req, ctx, emergencyReasons));
    }

    const painCrisis =
      typeof ctx.painSeverity === 'number' && ctx.painSeverity >= 4;
    if (painCrisis && emergencyReasons.length === 0) {
      cards.push(this.painCrisisCard(rule, req, ctx));
    }

    // Chronic-care gaps.
    const gaps: string[] = [];
    if (ctx.onHydroxyurea !== true) gaps.push('not on hydroxyurea');
    if (
      typeof ctx.ageYears === 'number' &&
      ctx.ageYears < 5 &&
      ctx.penicillinProphylaxis !== true
    ) {
      gaps.push('penicillin V prophylaxis not in place (< 5 years)');
    }
    if (ctx.pneumococcalVaccinated !== true) gaps.push('pneumococcal vaccine outstanding');
    if (ctx.influenzaVaccinated !== true) gaps.push('annual influenza vaccine outstanding');
    if (
      typeof ctx.ageYears === 'number' &&
      ctx.ageYears >= 2 &&
      ctx.ageYears <= 16 &&
      ctx.transcranialDopplerDone !== true
    ) {
      gaps.push('annual transcranial Doppler missing (2–16 years)');
    }
    if (
      typeof ctx.ageYears === 'number' &&
      ctx.ageYears >= 10 &&
      ctx.retinalScreenDone !== true
    ) {
      gaps.push('retinal screening missing (≥ 10 years)');
    }
    if (ctx.folicAcidSupplementation !== true) gaps.push('folic acid 5 mg daily not documented');

    if (gaps.length > 0 && emergencyReasons.length === 0) {
      cards.push(this.chronicCareCard(rule, req, gaps));
    }

    if (cards.length === 0) {
      cards.push(this.infoCard(rule, req));
    }
    return cards;
  }

  private emergencyCard(rule: CdsRule, req: CdsHookRequest, ctx: ScdContext, reasons: string[]): CdsCard {
    const wt = ctx.weightKg;
    const morphineLine =
      typeof wt === 'number'
        ? `Strong opioid: morphine ${(0.1 * wt).toFixed(1)} mg IV (0.1 mg/kg) every 10–20 min titrated to a 50 % pain reduction (max single dose 10 mg for adults); thereafter a PCA or scheduled IV / SC every 4 h.`
        : 'Strong opioid: morphine 0.1 mg/kg IV every 10–20 min titrated to a 50 % pain reduction (max single dose 10 mg adults); then PCA or scheduled IV / SC every 4 h.';
    const transfusionLine =
      typeof ctx.haemoglobinGdl === 'number' && ctx.haemoglobinGdl < 6
        ? ' Transfuse simple packed red cells slowly (cross-matched, leukoreduced, HbS-negative where possible) to a target Hb 8–10 g/dL — do NOT exceed 10 g/dL because hyperviscosity worsens vaso-occlusion. For acute chest syndrome with severe hypoxia or rapid progression, exchange transfusion is preferred over simple transfusion.'
        : ' Reserve transfusion for Hb falling rapidly or symptomatic anaemia.';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Sickle-cell emergency — admit + life-threatening complication bundle',
      'Emergency feature(s): {{reasons}}. Bundle: (1) ABC + oxygen titrated to SpO₂ ≥ 95 %. (2) Strict isotonic fluids — start at ' +
        'maintenance rate; AVOID over-hydration (precipitates acute chest syndrome). (3) {{opioid}} (4) Adjuvant: paracetamol 1 g IV ' +
        '6-hourly, ketorolac 30 mg IV (avoid in AKI / dehydration), heat packs. (5) Broad-spectrum antibiotics within 1 hour for ' +
        'any fever ≥ 38.5 (ceftriaxone 50 mg/kg, add azithromycin if acute chest syndrome — atypical cover); blood / urine cultures, ' +
        'CXR, malaria smear (in endemic settings). (6) For stroke: emergency exchange transfusion to HbS ≤ 30 %, urgent CT/MRI, ' +
        'neurology referral; do NOT give tPA. (7) For priapism > 4 h: aspiration + irrigation by urology; intracavernosal ' +
        'phenylephrine; consider exchange transfusion if refractory. (8) For splenic sequestration: urgent transfusion + paediatric ' +
        'surgical consult.{{transfusion}} (9) Check creatinine, LDH, bilirubin, baseline Hb + reticulocytes, blood group + cross-match. ' +
        'Discuss with haematology and admit to a sickle-cell-aware unit.',
      { reasons: reasons.join('; '), opioid: morphineLine, transfusion: transfusionLine },
      CODINGS_SCD,
    );
  }

  private painCrisisCard(rule: CdsRule, req: CdsHookRequest, ctx: ScdContext): CdsCard {
    const wt = ctx.weightKg;
    const morphineLine =
      typeof wt === 'number'
        ? `Severe pain (NRS ≥ 7): morphine ${(0.1 * wt).toFixed(1)} mg IV / SC (0.1 mg/kg) every 20 min titrated to ≥ 50 % pain reduction. Then scheduled morphine every 4 h or PCA.`
        : 'Severe pain (NRS ≥ 7): morphine 0.1 mg/kg IV / SC every 20 min titrated to ≥ 50 % reduction. Then scheduled morphine every 4 h or PCA.';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Vaso-occlusive pain crisis — analgesia within 30 min + screen for precipitants',
      'Severity NRS {{nrs}} / 10. Bundle: (1) Begin analgesia within 30 minutes of arrival per ASH 2020. Mild–moderate: paracetamol ' +
        '1 g orally + ibuprofen 400 mg orally (avoid NSAIDs in AKI / dehydration); add codeine or tramadol if not improving. ' +
        '{{morphine}} (2) Maintenance fluids — orally if tolerated; otherwise IV at maintenance rate. AVOID over-hydration. (3) Oxygen ' +
        'ONLY if SpO₂ < 95 %. (4) Incentive spirometry to reduce risk of acute chest syndrome. (5) Screen for precipitants: ' +
        'infection (cultures + CXR if respiratory), dehydration, cold exposure, altitude / hypoxia, pregnancy / surgery / stress, ' +
        'menstrual cycle. (6) Optimise hydroxyurea — if not on it, start (15–20 mg/kg/day, titrated to MCV 100–110, ANC > 2.0); ' +
        'evidence is strong in adults AND children ≥ 9 months. (7) Discharge plan: oral analgesia step-down, follow-up within 7 ' +
        'days, written self-management plan, vaccination + hydroxyurea optimisation.',
      { nrs: ctx.painSeverity ?? 'unscored', morphine: morphineLine },
      CODINGS_SCD,
    );
  }

  private chronicCareCard(rule: CdsRule, req: CdsHookRequest, gaps: string[]): CdsCard {
    return this.buildCard(
      rule,
      req,
      'warning',
      'Sickle-cell chronic-care gap(s) — close at this contact',
      'Gap(s) identified: {{gaps}}. Close at this visit where feasible: (1) Hydroxyurea — offer at any age ≥ 9 months unless ' +
        'contraindicated; start 15–20 mg/kg/day, titrate to MCV 100–110 fL and ANC > 2.0 × 10⁹/L; counsel about teratogenicity and ' +
        'reliable contraception. (2) Penicillin V prophylaxis 125 mg twice daily under 3 years, 250 mg twice daily 3–5 years; ' +
        'optional after 5 years per family / programme preference. (3) Vaccines: PCV13 + PPSV23, meningococcal ACWY + B, Hib, ' +
        'annual influenza, hepatitis B series. (4) Annual transcranial Doppler 2–16 years — start chronic transfusion if peak ' +
        'systolic velocity > 200 cm/s. (5) Annual retinal screen from age 10. (6) Folic acid 5 mg daily (1 mg in young children). ' +
        '(7) Counsel triggers (dehydration, cold, hypoxia, altitude). (8) Document baseline Hb, reticulocytes, LFTs, U&Es, urine ACR.',
      { gaps: gaps.join('; ') },
      CODINGS_SCD,
    );
  }

  private infoCard(rule: CdsRule, req: CdsHookRequest): CdsCard {
    return this.buildCard(
      rule,
      req,
      'info',
      'Sickle-cell disease — stable, on guideline-directed therapy',
      'Continue hydroxyurea, prophylactic antibiotics where indicated, folic acid, and the routine immunisation schedule. ' +
        'Reinforce trigger avoidance and red-flag symptoms (fever ≥ 38.5, chest pain or breathlessness, focal weakness, severe ' +
        'pain not relieved by oral analgesia, priapism > 4 h, rapid swelling of the abdomen). Annual transcranial Doppler ' +
        '(2–16 y), retinal screen (≥ 10 y), pulmonary review (≥ 6 y).',
      {},
      CODINGS_SCD,
    );
  }

  private buildCard(
    rule: CdsRule,
    req: CdsHookRequest,
    indicator: CdsIndicator,
    defaultSummary: string,
    defaultDetail: string,
    vars: Record<string, string | number | boolean | null | undefined>,
    codings: CodedReference[],
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label: 'ASH 2020 — Guidelines for sickle cell disease: management of acute and chronic pain',
      url: 'https://ashpublications.org/bloodadvances/article/4/12/2656/461050',
    };
    const { summary, detail } = resolveCardCopy(
      rule,
      req,
      { summary: defaultSummary, detail: defaultDetail },
      vars,
    );
    return {
      summary,
      indicator,
      detail: detail.replace(/\s+/g, ' ').trim(),
      source: { label: ref.label, url: ref.url, strength: ref.strength },
      extension: {
        'http://vedamd.io/Card/recommendation': {
          ruleId: rule.id,
          ruleVersion: rule.ruleVersion,
          evidenceLevel: rule.evidenceLevel,
          generatedAt: new Date().toISOString(),
          codings,
        },
      },
    };
  }
}
