import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator, CodedReference } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Heat stroke / heat-related illness.
 *
 *   Built from: CDC Heat-Related Illness (NIOSH) clinical guidance,
 *   WHO Heat and Health technical brief, Korey-Stringer Institute
 *   Exertional Heat Stroke Consensus, NEJM Heat-Related Illnesses
 *   (2019) review.
 *
 *   Heat-related illness is an escalating SSA priority — climate
 *   change has increased the frequency of extreme heat events,
 *   particularly in the Sahel and the Horn of Africa, with high
 *   occupational risk (farmers, manual workers) and household
 *   risk (elderly, infants, chronically ill).
 *
 *   Ladder:
 *     1. CRITICAL — heat stroke: core temperature ≥ 40 °C (104 °F)
 *        OR ≥ 39 °C in the presence of CNS dysfunction (confusion,
 *        ataxia, seizures, coma). Two subtypes:
 *          • Classic / non-exertional — older adults / chronically
 *            ill / heat-wave exposure; typically anhidrotic (dry
 *            skin).
 *          • Exertional — military, athletes, manual labourers;
 *            often sweating, frequently with rhabdomyolysis,
 *            disseminated intravascular coagulation and acute
 *            kidney injury.
 *        Bundle: rapid cooling (target rectal < 39 °C within 30
 *        min) + airway / breathing support + IV fluids + treat
 *        complications.
 *
 *     2. CRITICAL — severe heat exhaustion with red-flag features
 *        (SBP < 90, repeated vomiting, sodium ≤ 130 or ≥ 150,
 *        creatinine > 200, dark urine suggestive of rhabdomyolysis,
 *        creatine kinase > 5 × ULN). Admit for IV fluids + close
 *        monitoring + escalation if progresses.
 *
 *     3. WARNING — heat exhaustion: heat exposure + symptoms
 *        (headache, dizziness, nausea, profuse sweating, fatigue,
 *        tachycardia, mild orthostasis) with core temp < 40 °C and
 *        no CNS dysfunction. Move to cool environment, oral / IV
 *        rehydration, rest, observe.
 *
 *     4. INFO — heat-exposure risk: counsel hydration, work-rest
 *        cycles, cool environments, recognise warning signs.
 *
 *   Anonymous context:
 *     suspectedHeatIllness        boolean (sentinel)
 *     ageYears                    number
 *     weightKg                    number (paediatric fluids)
 *     coreTemperatureC            number (rectal preferred for heat
 *                                  stroke — tympanic / oral
 *                                  unreliable in shock)
 *     ambientHeatExposure         boolean (heat-wave / occupational /
 *                                  exertional context)
 *     cnsDysfunction              boolean (confusion, ataxia, seizure,
 *                                  coma)
 *     exertional                  boolean (vs classic)
 *     anhidrosis                  boolean (dry skin, classic)
 *     persistentVomiting          boolean
 *     systolicMmHg                number (optional)
 *     heartRatePerMin             number (optional)
 *     respiratoryRatePerMin       number (optional)
 *     darkUrine                   boolean (rhabdomyolysis flag)
 *     creatineKinaseIuL           number (optional)
 *     creatinineUmolL             number (optional)
 *     sodiumMmolL                 number (optional)
 *     potassiumMmolL              number (optional)
 *     glucoseMmolL                number (optional)
 *     pregnant                    boolean
 *     chronicCardiopulmonary      boolean (high-risk overlay)
 *     onAnticholinergic           boolean (drug overlay)
 */

const HEAT_STROKE_TEMP = 40;
const HEAT_STROKE_TEMP_WITH_CNS = 39;
const SHOCK_SBP = 90;

interface HeatContext {
  suspectedHeatIllness?: boolean;
  ageYears?: number;
  weightKg?: number;
  coreTemperatureC?: number;
  ambientHeatExposure?: boolean;
  cnsDysfunction?: boolean;
  exertional?: boolean;
  anhidrosis?: boolean;
  persistentVomiting?: boolean;
  systolicMmHg?: number;
  heartRatePerMin?: number;
  respiratoryRatePerMin?: number;
  darkUrine?: boolean;
  creatineKinaseIuL?: number;
  creatinineUmolL?: number;
  sodiumMmolL?: number;
  potassiumMmolL?: number;
  glucoseMmolL?: number;
  pregnant?: boolean;
  chronicCardiopulmonary?: boolean;
  onAnticholinergic?: boolean;
}

const CODINGS_HEAT: CodedReference[] = [
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'T67.0',
    display: 'Heatstroke and sunstroke',
    kind: 'diagnosis',
  },
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'T67.5',
    display: 'Heat exhaustion, unspecified',
    kind: 'diagnosis',
  },
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'T67.4',
    display: 'Heat exhaustion due to salt depletion',
    kind: 'diagnosis',
  },
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'T67.9',
    display: 'Effect of heat and light, unspecified',
    kind: 'diagnosis',
  },
  {
    system: 'http://id.who.int/icd/release/11/mms',
    code: 'NF01.0',
    display: 'Heatstroke and sunstroke',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '20262006',
    display: 'Heatstroke (disorder)',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '410022004',
    display: 'Exertional heat stroke (disorder)',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '237886009',
    display: 'Heat exhaustion (disorder)',
    kind: 'diagnosis',
  },
  { system: 'http://loinc.org', code: '8310-5', display: 'Body temperature', kind: 'lab' },
];

@Injectable()
export class HeatStrokeStrategy implements CdsRuleStrategy {
  readonly type = 'heat-stroke';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as HeatContext;
    if (ctx.suspectedHeatIllness !== true) return [];

    const temp = ctx.coreTemperatureC;
    const heatStrokeByTemp = typeof temp === 'number' && temp >= HEAT_STROKE_TEMP;
    const heatStrokeByCnsAndTemp =
      typeof temp === 'number' && temp >= HEAT_STROKE_TEMP_WITH_CNS && ctx.cnsDysfunction === true;

    if (heatStrokeByTemp || heatStrokeByCnsAndTemp) {
      return [this.heatStrokeCard(rule, req, ctx)];
    }

    // Severe heat exhaustion with red flags.
    const severeReasons: string[] = [];
    if (typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg < SHOCK_SBP) {
      severeReasons.push(`SBP ${ctx.systolicMmHg} mmHg (< ${SHOCK_SBP})`);
    }
    if (ctx.persistentVomiting === true) severeReasons.push('persistent vomiting');
    if (typeof ctx.sodiumMmolL === 'number' && (ctx.sodiumMmolL <= 130 || ctx.sodiumMmolL >= 150)) {
      severeReasons.push(`Na⁺ ${ctx.sodiumMmolL} mmol/L (≤ 130 or ≥ 150)`);
    }
    if (typeof ctx.creatinineUmolL === 'number' && ctx.creatinineUmolL > 200) {
      severeReasons.push(`creatinine ${ctx.creatinineUmolL} µmol/L (AKI)`);
    }
    if (ctx.darkUrine === true) severeReasons.push('dark urine (suspected rhabdomyolysis)');
    if (typeof ctx.creatineKinaseIuL === 'number' && ctx.creatineKinaseIuL > 1000) {
      severeReasons.push(`CK ${ctx.creatineKinaseIuL} IU/L (> 5× ULN — rhabdomyolysis)`);
    }
    if (severeReasons.length > 0) {
      return [this.severeExhaustionCard(rule, req, ctx, severeReasons)];
    }

    if (
      ctx.ambientHeatExposure === true ||
      (typeof temp === 'number' && temp >= 37.5) ||
      typeof ctx.systolicMmHg === 'number'
    ) {
      return [this.exhaustionCard(rule, req, ctx)];
    }

    return [this.infoCard(rule, req)];
  }

  private heatStrokeCard(rule: CdsRule, req: CdsHookRequest, ctx: HeatContext): CdsCard {
    const wt = ctx.weightKg;
    const fluidLine =
      typeof wt === 'number'
        ? `IV 0.9 % NaCl ${(20 * wt).toFixed(0)} mL bolus, reassess and titrate to maintain SBP ≥ 90 and urine output ≥ 0.5–1 mL/kg/h`
        : 'IV 0.9 % NaCl 20 mL/kg bolus, reassess and titrate to maintain SBP ≥ 90 and urine output ≥ 0.5–1 mL/kg/h';
    const exertionalLine =
      ctx.exertional === true
        ? ' Exertional heat stroke — COLD-WATER IMMERSION (head out of water, monitored) is the first-line cooling method when ' +
          'available (target rectal temp ≤ 39 °C within 30 minutes). Where immersion is not available, use cold water dousing + ' +
          'continuous fanning + ice packs to neck, axillae, groin. Stop cooling at 39 °C to avoid overshoot hypothermia.'
        : ' Classic heat stroke — evaporative cooling: continuous fanning of a wet, undressed patient (with rectal temperature ' +
          'monitoring). Cold-water immersion is also effective; ice packs to neck, axillae, groin help. Avoid antipyretics ' +
          '(paracetamol / aspirin) — they do NOT lower hyperthermic body temperature and may worsen liver / kidney injury.';
    const rhabdoLine =
      ctx.darkUrine === true ||
      (typeof ctx.creatineKinaseIuL === 'number' && ctx.creatineKinaseIuL > 1000)
        ? ' Rhabdomyolysis flag — aggressive IV fluids (target urine output 2 mL/kg/h, ~200 mL/h adult); avoid potassium-containing ' +
          'fluids in oliguria; consider urinary alkalinisation (sodium bicarbonate IV) for severe rhabdomyolysis; recheck CK / K⁺ / ' +
          'creatinine every 6 hours. Risk of DIC and acute hepatic failure — anticipate.'
        : '';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Heat stroke — rapid cooling within 30 minutes is the primary intervention',
      'Heat stroke (core temperature ≥ 40 °C or ≥ 39 °C with CNS dysfunction). Survival is determined by how fast the core temperature ' +
        'is brought below 39 °C — cool FIRST, transport SECOND. (1) ABC — protect airway, oxygen, IV access × 2 large-bore. (2) ' +
        'Remove clothing and move to the coolest environment available. (3) Cooling: {{exertional}} Use rectal thermometry for ' +
        'monitoring (oral and tympanic are unreliable in heat illness). (4) {{fluids}}. Avoid over-resuscitation in classic heat ' +
        'stroke with cardiac history — these patients are often euvolaemic. (5) Glucose — give IV 50 mL of 50 % dextrose (adult) ' +
        'or 2 mL/kg of 10 % dextrose (child) if < 3 mmol/L. (6) Seizures — IV / IM lorazepam 0.1 mg/kg (max 4 mg) or midazolam ' +
        '10 mg IM. (7) Investigate complications: full blood count + film, U&E, glucose, calcium, magnesium, phosphate, LFTs, CK, ' +
        'lactate, coagulation, urinalysis, ECG, CXR. {{rhabdo}} (8) Admit to ICU / HDU. Multi-organ failure is the rule; cardiac ' +
        'monitoring + serial lactate + urine output essential. (9) Notify the local heat-health emergency contact / surveillance ' +
        'authority where heat-wave plans exist.',
      { fluids: fluidLine, exertional: exertionalLine, rhabdo: rhabdoLine },
      CODINGS_HEAT,
    );
  }

  private severeExhaustionCard(
    rule: CdsRule,
    req: CdsHookRequest,
    ctx: HeatContext,
    reasons: string[],
  ): CdsCard {
    const wt = ctx.weightKg;
    const fluidLine =
      typeof wt === 'number'
        ? `IV 0.9 % NaCl ${(20 * wt).toFixed(0)} mL bolus (20 mL/kg) then maintenance, target urine output ≥ 0.5–1 mL/kg/h.`
        : 'IV 0.9 % NaCl 20 mL/kg bolus then maintenance, target urine output ≥ 0.5–1 mL/kg/h.';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Severe heat exhaustion with red-flag feature(s) — admit + IV fluids + monitor for heat stroke progression',
      'Red flag(s): {{reasons}}. Heat exhaustion can progress to heat stroke within minutes — admit. (1) Move to the coolest ' +
        'environment available. (2) Remove restrictive clothing, fan, and start active cooling (cool, damp cloths to neck / axillae / ' +
        'groin) — cooling is appropriate even in heat exhaustion. (3) {{fluids}} Replace electrolytes per measured U&E (sodium ' +
        'correction rate < 10 mmol/L/24 h to avoid central pontine myelinolysis; potassium replacement only with normal urine ' +
        'output). (4) Antiemetic if persistent vomiting (ondansetron 4–8 mg IV). (5) Reassess core temperature, GCS, urine output ' +
        'and CK every hour. (6) Send labs: U&E, glucose, CK, LFTs, urinalysis, coagulation if rhabdomyolysis. (7) Escalate to ' +
        'heat-stroke pathway IMMEDIATELY if core temperature reaches 40 °C OR ANY new CNS dysfunction develops.',
      { reasons: reasons.join('; '), fluids: fluidLine },
      CODINGS_HEAT,
    );
  }

  private exhaustionCard(rule: CdsRule, req: CdsHookRequest, _ctx: HeatContext): CdsCard {
    return this.buildCard(
      rule,
      req,
      'warning',
      'Heat exhaustion — move to a cool area + rehydrate + observe',
      'Heat exhaustion (heat-exposure symptoms with core temperature < 40 °C and no CNS dysfunction). (1) Move to the coolest ' +
        'environment available — preferably air-conditioned or well-ventilated shade. (2) Remove restrictive clothing, fan, apply ' +
        'cool damp cloths to the skin. (3) Oral rehydration: oral rehydration solution (ORS) 1–1.5 L over 1 hour, then continue 200 ' +
        'mL every 15–20 minutes until urine is pale yellow; in vulnerable groups (elderly, chronic disease) or if oral fluids are ' +
        'not tolerated, give IV 0.9 % NaCl 1 L over 1 hour. (4) Rest in a cool place for at least 30 minutes after symptoms resolve; ' +
        'do not return to heat exposure for the rest of the day. (5) Recheck temperature, pulse and orthostatic BP every 15 minutes ' +
        'for the first hour — escalate to severe-exhaustion or heat-stroke pathway if temperature climbs, vomiting persists, urine ' +
        'output is poor, or any CNS symptoms develop. (6) Counsel: prevention — drink water before thirst (~ 200 mL every 20 min ' +
        'during heat exposure), work-rest cycles, light-coloured loose clothing, avoid high-physical-exertion outdoor work between ' +
        '11 am and 4 pm, never leave infants or pets in parked vehicles.',
      {},
      CODINGS_HEAT,
    );
  }

  private infoCard(rule: CdsRule, req: CdsHookRequest): CdsCard {
    return this.buildCard(
      rule,
      req,
      'info',
      'Heat-exposure risk — counsel prevention',
      'No active heat illness. Counsel (WHO heat-health technical brief): drink water regularly — about 200 mL every 20 minutes ' +
        'during heat exposure; consume oral rehydration solution if working hard or sweating heavily. Work-rest cycles in the ' +
        'shade. Wear light-coloured, loose, breathable clothing and a wide-brimmed hat. Avoid heavy physical work between 11 am ' +
        'and 4 pm where possible. Identify household members at high risk (elderly, infants, pregnant women, chronic illness, ' +
        'mental illness, anticholinergic medications) and check on them at least twice daily during heat waves. NEVER leave ' +
        'infants, children, or pets in a parked vehicle. Warning signs to seek care: severe headache, confusion, fast heartbeat, ' +
        'dizziness, faintness, repeated vomiting, hot dry skin, very dark urine or no urine output.',
      {},
      CODINGS_HEAT,
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
      label:
        'CDC NIOSH — Heat-related illness clinical guidance + WHO Heat and Health technical brief',
      url: 'https://www.cdc.gov/niosh/topics/heatstress/heatrelillness.html',
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
