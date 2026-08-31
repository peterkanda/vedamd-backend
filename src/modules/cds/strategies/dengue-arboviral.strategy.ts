import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator, CodedReference } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Dengue / chikungunya / Zika — arboviral febrile illness.
 *
 *   Built from: WHO Dengue Guidelines for Diagnosis, Treatment,
 *   Prevention and Control (2009 + 2024 update); WHO Handbook for
 *   Clinical Management of Dengue (2012); CDC Dengue: Clinical
 *   Guidance; PAHO Guidelines for the clinical diagnosis and
 *   treatment of dengue, chikungunya, and Zika (2022).
 *
 * Anonymous-by-design. The integrator confirms acute febrile
 * illness consistent with arboviral infection
 * (`suspectedArboviralFever`) in a person with epidemiological
 * exposure (recent travel or residence in a dengue-endemic area
 * within 14 days). The strategy returns:
 *
 *   1. CRITICAL — severe dengue (Group C, WHO 2009):
 *        severe plasma leakage with shock OR fluid accumulation +
 *        respiratory distress, severe bleeding (clinical), severe
 *        organ involvement (AST/ALT ≥ 1000, impaired consciousness,
 *        AKI, myocarditis).
 *
 *   2. CRITICAL — warning signs (Group B): abdominal pain or
 *        tenderness, persistent vomiting (≥ 3 in 24 h), clinical
 *        fluid accumulation (ascites, pleural effusion), mucosal
 *        bleeding, lethargy or restlessness, hepatomegaly > 2 cm,
 *        rising haematocrit with rapid drop in platelets.
 *
 *   3. WARNING — uncomplicated dengue / arboviral fever
 *        (Group A): supportive care, paracetamol ONLY (no NSAIDs,
 *        no aspirin), oral fluids, daily review during the
 *        critical phase (days 3–7).
 *
 *   4. INFO — exposure but no fever: counsel mosquito-bite
 *        prevention, return-immediately signs.
 *
 *   Differential overlay:
 *     • Chikungunya: marked polyarthralgia (small joints, often
 *       symmetrical, persists weeks–months) more than dengue;
 *       saddleback fever curve uncommon.
 *     • Zika: maculopapular rash + conjunctivitis + low-grade
 *       fever; arthralgia milder. Pregnancy → urgent referral
 *       (congenital Zika syndrome risk).
 *
 *   Anonymous context:
 *     suspectedArboviralFever      boolean (sentinel)
 *     ageYears                     number
 *     daysOfFever                  number
 *     pregnant                     boolean
 *     endemicExposureLast14d       boolean
 *     rashPresent                  boolean
 *     polyarthralgia               boolean (chikungunya pattern)
 *     conjunctivitis               boolean (Zika pattern)
 *     abdominalPainOrTenderness    boolean
 *     persistentVomiting           boolean (≥ 3 episodes / 24 h)
 *     clinicalFluidAccumulation    boolean (ascites, pleural effusion)
 *     mucosalBleeding              boolean
 *     lethargyOrRestlessness       boolean
 *     hepatomegalyGreaterThan2cm   boolean
 *     plateletCount                number (×10⁹/L, optional)
 *     priorPlateletCount           number (optional)
 *     haematocritPercent           number (optional)
 *     baselineHaematocritPercent   number (optional)
 *     systolicMmHg                 number
 *     diastolicMmHg                number
 *     altIuL                       number (optional)
 *     astIuL                       number (optional)
 *     gcs                          number (optional)
 *     creatinineUmolL              number (optional)
 *     suspectedChikungunya         boolean
 *     suspectedZika                boolean
 *     weightKg                     number (optional, paediatric fluid)
 */

const PLATELET_LOW = 100;
const PLATELET_VERY_LOW = 20;

interface ArbovirContext {
  suspectedArboviralFever?: boolean;
  ageYears?: number;
  daysOfFever?: number;
  pregnant?: boolean;
  endemicExposureLast14d?: boolean;
  rashPresent?: boolean;
  polyarthralgia?: boolean;
  conjunctivitis?: boolean;
  abdominalPainOrTenderness?: boolean;
  persistentVomiting?: boolean;
  clinicalFluidAccumulation?: boolean;
  mucosalBleeding?: boolean;
  lethargyOrRestlessness?: boolean;
  hepatomegalyGreaterThan2cm?: boolean;
  plateletCount?: number;
  priorPlateletCount?: number;
  haematocritPercent?: number;
  baselineHaematocritPercent?: number;
  systolicMmHg?: number;
  diastolicMmHg?: number;
  altIuL?: number;
  astIuL?: number;
  gcs?: number;
  creatinineUmolL?: number;
  suspectedChikungunya?: boolean;
  suspectedZika?: boolean;
  weightKg?: number;
}

const CODINGS_DENGUE: CodedReference[] = [
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'A90',
    display: 'Dengue fever (classical dengue)',
    kind: 'diagnosis',
  },
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'A91',
    display: 'Dengue haemorrhagic fever',
    kind: 'diagnosis',
  },
  {
    system: 'http://id.who.int/icd/release/11/mms',
    code: '1D2Z',
    display: 'Dengue, unspecified',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '38362002',
    display: 'Dengue fever (disorder)',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '409708006',
    display: 'Severe dengue (disorder)',
    kind: 'diagnosis',
  },
];

const CODINGS_CHIK: CodedReference[] = [
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'A92.0',
    display: 'Chikungunya virus disease',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '111872004',
    display: 'Chikungunya fever (disorder)',
    kind: 'diagnosis',
  },
];

const CODINGS_ZIKA: CodedReference[] = [
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'A92.5',
    display: 'Zika virus disease',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '3928002',
    display: 'Zika virus disease (disorder)',
    kind: 'diagnosis',
  },
];

function codingsForCtx(ctx: ArbovirContext): CodedReference[] {
  const c: CodedReference[] = [...CODINGS_DENGUE];
  if (ctx.suspectedChikungunya === true) c.push(...CODINGS_CHIK);
  if (ctx.suspectedZika === true) c.push(...CODINGS_ZIKA);
  return c;
}

@Injectable()
export class DengueArboviralStrategy implements CdsRuleStrategy {
  readonly type = 'dengue-arboviral';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as ArbovirContext;
    if (ctx.suspectedArboviralFever !== true) return [];

    // Severe dengue (Group C).
    const severeReasons: string[] = [];
    if (
      typeof ctx.systolicMmHg === 'number' &&
      typeof ctx.diastolicMmHg === 'number' &&
      ctx.systolicMmHg - ctx.diastolicMmHg <= 20
    ) {
      severeReasons.push(`narrow pulse pressure (${ctx.systolicMmHg - ctx.diastolicMmHg} mmHg)`);
    }
    if (typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg < 90) {
      severeReasons.push(`SBP ${ctx.systolicMmHg} mmHg (< 90 — shock)`);
    }
    if (typeof ctx.altIuL === 'number' && ctx.altIuL >= 1000) {
      severeReasons.push(`ALT ${ctx.altIuL} (≥ 1000 — severe hepatic involvement)`);
    }
    if (typeof ctx.astIuL === 'number' && ctx.astIuL >= 1000) {
      severeReasons.push(`AST ${ctx.astIuL} (≥ 1000 — severe hepatic involvement)`);
    }
    if (typeof ctx.gcs === 'number' && ctx.gcs <= 13) {
      severeReasons.push(`GCS ${ctx.gcs} (≤ 13 — CNS involvement)`);
    }
    if (typeof ctx.creatinineUmolL === 'number' && ctx.creatinineUmolL > 200) {
      severeReasons.push(`creatinine ${ctx.creatinineUmolL} µmol/L (acute kidney injury)`);
    }
    if (
      ctx.mucosalBleeding === true &&
      typeof ctx.plateletCount === 'number' &&
      ctx.plateletCount < PLATELET_VERY_LOW
    ) {
      severeReasons.push('clinically significant mucosal bleeding with platelets < 20');
    }

    if (severeReasons.length > 0) {
      return [this.severeCard(rule, req, ctx, severeReasons)];
    }

    // Warning signs (Group B).
    const warningSigns: string[] = [];
    if (ctx.abdominalPainOrTenderness === true) warningSigns.push('abdominal pain / tenderness');
    if (ctx.persistentVomiting === true) warningSigns.push('persistent vomiting');
    if (ctx.clinicalFluidAccumulation === true) {
      warningSigns.push('clinical fluid accumulation (ascites / pleural effusion)');
    }
    if (ctx.mucosalBleeding === true) warningSigns.push('mucosal bleeding');
    if (ctx.lethargyOrRestlessness === true) warningSigns.push('lethargy or restlessness');
    if (ctx.hepatomegalyGreaterThan2cm === true) warningSigns.push('hepatomegaly > 2 cm');
    if (
      typeof ctx.plateletCount === 'number' &&
      typeof ctx.priorPlateletCount === 'number' &&
      ctx.plateletCount < ctx.priorPlateletCount - 50 &&
      ctx.plateletCount < PLATELET_LOW
    ) {
      warningSigns.push(
        `rapid platelet fall (${ctx.priorPlateletCount} → ${ctx.plateletCount} × 10⁹/L)`,
      );
    }
    if (
      typeof ctx.haematocritPercent === 'number' &&
      typeof ctx.baselineHaematocritPercent === 'number' &&
      ctx.haematocritPercent >= ctx.baselineHaematocritPercent * 1.2
    ) {
      warningSigns.push(
        `haematocrit ${ctx.haematocritPercent}% (≥ 20 % rise from baseline ${ctx.baselineHaematocritPercent}%)`,
      );
    }

    if (warningSigns.length > 0) {
      return [this.warningGroupBCard(rule, req, ctx, warningSigns)];
    }

    // Uncomplicated (Group A) — supportive care.
    if (ctx.suspectedZika === true && ctx.pregnant === true) {
      return [this.zikaPregnancyCard(rule, req)];
    }
    return [this.groupACard(rule, req, ctx)];
  }

  private severeCard(
    rule: CdsRule,
    req: CdsHookRequest,
    ctx: ArbovirContext,
    reasons: string[],
  ): CdsCard {
    const wt = ctx.weightKg ?? 60;
    const bolus = `${(20 * wt).toFixed(0)} mL`;
    return this.buildCard(
      rule,
      req,
      'critical',
      'Severe dengue (Group C) — admit, isotonic resuscitation, NO NSAIDs',
      'Severe feature(s): {{reasons}}. Bundle (WHO 2009 + 2024 update + PAHO 2022): (1) Admit to HDU / ICU. (2) Compensated shock — ' +
        "IV crystalloid (0.9 % NaCl or Ringer's lactate) {{bolus}} (10–20 mL/kg over 1 hour); reassess, taper to 7 mL/kg/h, then " +
        '5 mL/kg/h, then 3 mL/kg/h as condition allows. Hypotensive shock — 20 mL/kg crystalloid in 15 minutes, repeat once; if no ' +
        'response add a colloid bolus 10 mL/kg over 30 minutes; if Hct rises despite fluid → ongoing leakage, give colloid; if Hct ' +
        'falls → occult bleeding, transfuse packed cells. (3) Strictly avoid NSAIDs and aspirin — bleeding risk. (4) Paracetamol ' +
        '15 mg/kg every 6 h for fever (NOT every 4 h — hepatic risk). (5) Daily / 4-hourly FBC, electrolytes, glucose, LFTs, ' +
        'coagulation, urine output. (6) For severe bleeding: transfuse packed cells; reserve platelets / fresh-frozen plasma for ' +
        'active bleeding only — prophylactic platelet transfusion is NOT recommended even at very low counts. (7) For myocarditis ' +
        'or AKI: standard supportive care; renal replacement therapy if indicated. Notify district surveillance; barrier-protect ' +
        'against further mosquito bites in the hospital.',
      { reasons: reasons.join('; '), bolus },
      codingsForCtx(ctx),
    );
  }

  private warningGroupBCard(
    rule: CdsRule,
    req: CdsHookRequest,
    ctx: ArbovirContext,
    signs: string[],
  ): CdsCard {
    const isCriticalPhase =
      typeof ctx.daysOfFever === 'number' && ctx.daysOfFever >= 3 && ctx.daysOfFever <= 7;
    const phaseLine = isCriticalPhase
      ? 'Patient is within the critical-phase window (days 3–7) when plasma leakage typically occurs — vigilance is highest.'
      : 'Continue 4-hourly observations through the critical phase (typically days 3–7).';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Dengue with warning signs (Group B) — admit for IV fluids + close observation',
      'Warning sign(s): {{signs}}. {{phase}} Admit for IV crystalloid 5–7 mL/kg/h for 1–2 hours, reassess and titrate to 3 mL/kg/h ' +
        'over the next 4 hours, then 2 mL/kg/h; target urine output 0.5–1 mL/kg/h, not haemodilution. Reassess vitals + haematocrit ' +
        '4-hourly. NO NSAIDs / aspirin / aspirin-based antiplatelets. Paracetamol 15 mg/kg every 6 hours for fever. Monitor for ' +
        'progression to severe dengue. Investigate: full blood count (look for rising Hct + falling platelets), LFTs, U&E, ' +
        'coagulation, dengue NS1 antigen (within first 5 days) and IgM (after day 5), chikungunya / Zika serology where pattern ' +
        'suggests, malaria smear (co-endemic). Notify district surveillance.',
      { signs: signs.join('; '), phase: phaseLine },
      codingsForCtx(ctx),
    );
  }

  private zikaPregnancyCard(rule: CdsRule, req: CdsHookRequest): CdsCard {
    return this.buildCard(
      rule,
      req,
      'critical',
      'Suspected Zika in pregnancy — refer for foetal surveillance',
      'Zika virus crosses the placenta and is associated with congenital Zika syndrome (microcephaly, intracranial calcifications, ' +
        'severe neurodevelopmental impairment) and pregnancy loss. Send Zika RT-PCR (serum + urine within 14 days of onset) and ' +
        'IgM if available; serology cross-reacts with dengue, so a positive result needs confirmation. Refer to a maternal-foetal ' +
        'medicine service for serial foetal ultrasounds (every 4 weeks) looking for microcephaly, intracranial calcifications, ' +
        'ventriculomegaly. Counsel against further unprotected travel to Zika-endemic areas. Mosquito-bite prevention (DEET / IR3535 / ' +
        'picaridin repellents are pregnancy-safe). Notify district surveillance.',
      {},
      [...CODINGS_DENGUE, ...CODINGS_ZIKA],
    );
  }

  private groupACard(rule: CdsRule, req: CdsHookRequest, ctx: ArbovirContext): CdsCard {
    const chikLine =
      ctx.suspectedChikungunya === true || ctx.polyarthralgia === true
        ? ' Chikungunya pattern (marked polyarthralgia in small joints, often symmetrical, may persist for weeks–months): supportive ' +
          'care + paracetamol; AVOID NSAIDs / aspirin in the first 14 days until dengue is excluded.'
        : '';
    const zikaLine =
      ctx.suspectedZika === true || (ctx.rashPresent === true && ctx.conjunctivitis === true)
        ? ' Zika pattern (maculopapular rash + non-purulent conjunctivitis + low-grade fever): supportive care + barrier mosquito ' +
          'control. Counsel safe sex (Zika can be sexually transmitted) for at least 3 months (men) / 2 months (women) after onset.'
        : '';
    return this.buildCard(
      rule,
      req,
      'warning',
      'Uncomplicated arboviral fever (Group A) — outpatient supportive care + daily review',
      'Outpatient management with daily review during the critical phase (days 3–7 from fever onset). Strictly oral fluids — sips of ' +
        'oral rehydration solution, milk, fruit juice, rice water; avoid red / brown drinks (could mask haematemesis). Paracetamol ' +
        '15 mg/kg every 6 hours for fever (NOT every 4 hours). STRICTLY NO aspirin, ibuprofen, diclofenac, or other NSAIDs / ' +
        'antiplatelets — bleeding risk. Bedrest, mosquito-net protection (the patient remains infectious to mosquitoes for the first ' +
        'week of illness). Counsel return-immediately warning signs: abdominal pain, persistent vomiting, mucosal bleeding (gums, ' +
        'nose, urine, stool, vagina), restlessness or drowsiness, cold and clammy extremities, decreased urine output, sudden ' +
        'abdominal distension. Same-day return if fever defervesces between days 3–6 (sudden defervescence often heralds the leakage ' +
        'phase). Investigate with NS1 antigen (within first 5 days), IgM (after day 5), full blood count, LFTs.{{chik}}{{zika}}',
      { chik: chikLine, zika: zikaLine },
      codingsForCtx(ctx),
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
      label: 'WHO — Dengue: Guidelines for Diagnosis, Treatment, Prevention and Control (2009)',
      url: 'https://www.who.int/publications/i/item/9789241547871',
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
