import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Status epilepticus / seizure management — WHO mhGAP 2.0 +
 * ILAE 2015 operational definition + Kenya MoH Acute Care
 * Guidelines.
 *
 * The integrator confirms an active or recent seizure
 * (`suspectedSeizure` = true). The strategy returns a
 * weight-banded benzodiazepine + second-line bundle for the
 * STILL-CONVULSING patient, OR a stabilisation-and-investigate
 * card for the POST-ICTAL patient.
 *
 * Operational definition (ILAE 2015):
 *   • Status epilepticus is failure of mechanisms that terminate a
 *     seizure → continuous seizure activity at 5 min (generalised
 *     tonic-clonic) or 10 min (focal).
 *   • Treat as status from 5 min for tonic-clonic.
 *
 * Severity ladder:
 *
 *   1. CRITICAL — active convulsion ≥ 5 min OR recurrent seizures
 *      without recovery of consciousness:
 *        Stage 1 (now): IV lorazepam 0.1 mg/kg (max 4 mg) OR IM
 *        midazolam 10 mg (5 mg if 13–40 kg). May repeat once after
 *        10 min.
 *        Stage 2 (10–30 min still convulsing): IV phenytoin
 *        20 mg/kg in normal saline at ≤ 50 mg/min with cardiac
 *        monitoring, OR IV sodium valproate 40 mg/kg, OR IV
 *        levetiracetam 60 mg/kg.
 *        Stage 3 (> 30 min — refractory): refer / intubate +
 *        midazolam infusion or thiopentone induction.
 *
 *   2. CRITICAL — first seizure in pregnancy:
 *        Eclampsia until proven otherwise — magnesium sulphate is
 *        first-line (NOT a benzodiazepine). Loading dose 4 g IV slow
 *        + 10 g IM (5 g each buttock); maintenance 5 g IM every 4 h
 *        for 24 h. Antihypertensive if BP ≥ 160/110.
 *
 *   3. WARNING — first seizure now post-ictal:
 *        Investigate (glucose, malaria smear, electrolytes, calcium,
 *        sepsis screen, CT if focal signs / age > 40 / HIV-positive /
 *        head injury). Counsel safety. Initiate AED only if structural
 *        cause, abnormal EEG, or second seizure.
 *
 *   4. INFO — known epilepsy with break-through seizure:
 *        Check adherence; consider adjusting AED dose; counsel
 *        triggers; outpatient neurology follow-up.
 *
 * Reads only:
 *
 *   context.ageYears                  number ≥ 0
 *   context.weightKg                  number (optional, for paed dosing)
 *   context.suspectedSeizure          boolean
 *   context.activeConvulsion          boolean
 *   context.seizureDurationMinutes    number
 *   context.recurrentWithoutRecovery  boolean
 *   context.knownEpilepsy             boolean
 *   context.firstEverSeizure          boolean
 *   context.pregnant                  boolean
 *   context.bpSystolicMmHg            number (optional)
 *   context.bpDiastolicMmHg           number (optional)
 *   context.fingerStickGlucoseMmolL   number (optional)
 *   context.hivStatus                 'positive' | 'negative' | 'unknown' | null
 *   context.focalNeurologicalSigns    boolean
 *   context.recentHeadInjury          boolean
 */

const STATUS_THRESHOLD_MIN = 5;
const HYPOGLYCAEMIA_MMOLL = 3.0;

interface SeizureContext {
  ageYears?: number;
  weightKg?: number;
  suspectedSeizure?: boolean;
  activeConvulsion?: boolean;
  seizureDurationMinutes?: number;
  recurrentWithoutRecovery?: boolean;
  knownEpilepsy?: boolean;
  firstEverSeizure?: boolean;
  pregnant?: boolean;
  bpSystolicMmHg?: number;
  bpDiastolicMmHg?: number;
  fingerStickGlucoseMmolL?: number;
  hivStatus?: 'positive' | 'negative' | 'unknown' | null;
  focalNeurologicalSigns?: boolean;
  recentHeadInjury?: boolean;
}

@Injectable()
export class StatusEpilepticusStrategy implements CdsRuleStrategy {
  readonly type = 'status-epilepticus';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as SeizureContext;
    if (ctx.suspectedSeizure !== true) return [];

    const stillConvulsing =
      ctx.activeConvulsion === true ||
      (typeof ctx.seizureDurationMinutes === 'number' &&
        ctx.seizureDurationMinutes >= STATUS_THRESHOLD_MIN) ||
      ctx.recurrentWithoutRecovery === true;

    // Pregnancy + active seizure → eclampsia first.
    if (stillConvulsing && ctx.pregnant === true) {
      const bpLine =
        typeof ctx.bpSystolicMmHg === 'number' &&
        typeof ctx.bpDiastolicMmHg === 'number' &&
        (ctx.bpSystolicMmHg >= 160 || ctx.bpDiastolicMmHg >= 110)
          ? `BP ${ctx.bpSystolicMmHg}/${ctx.bpDiastolicMmHg} mmHg meets severe-range threshold — add labetalol 20 mg IV every 10 min (max 300 mg) OR hydralazine 5 mg IV every 20 min (max 20 mg) targeting SBP 140–150 / DBP 90–100. Do not lower BP below 140/90 — risk of placental hypoperfusion.`
          : 'Reassess BP every 5 min during treatment.';
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Seizure in pregnancy — treat as eclampsia: magnesium sulphate now',
          'Active seizure in pregnancy is eclampsia until proven otherwise. Magnesium sulphate is first-line — NOT a ' +
            'benzodiazepine. Loading: 4 g IV (in 20 mL normal saline) over 5–10 min PLUS 10 g IM (5 g into each buttock with ' +
            'lidocaine). Maintenance: 5 g IM every 4 h for 24 h after the seizure or delivery (whichever later). Monitor ' +
            'every hour: respiratory rate ≥ 12, deep tendon reflexes present, urine output > 25 mL/h. Antidote (toxicity): ' +
            'calcium gluconate 1 g IV over 10 min. Plan urgent delivery once stabilised — the cure for eclampsia is delivery. ' +
            '{{bp}} Notify obstetric team; arrange transfer to an emergency obstetric unit if not already there.',
          { bp: bpLine },
        ),
      ];
    }

    // Active status (non-pregnant).
    if (stillConvulsing) {
      return [this.statusCard(rule, req, ctx)];
    }

    // Hypoglycaemia is a stop-the-presses trigger even when seizure stopped.
    if (
      typeof ctx.fingerStickGlucoseMmolL === 'number' &&
      ctx.fingerStickGlucoseMmolL < HYPOGLYCAEMIA_MMOLL
    ) {
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Post-ictal hypoglycaemia — give glucose now',
          `Capillary glucose ${ctx.fingerStickGlucoseMmolL.toFixed(1)} mmol/L (< ${HYPOGLYCAEMIA_MMOLL}). Adult: 50 mL of 50 % ` +
            'dextrose IV (or 100 mL of 25 % dextrose); child: 2 mL/kg of 10 % dextrose IV. Recheck glucose at 5 and 15 min. ' +
            'After correction, investigate for sepsis / malaria / adrenal insufficiency / sulphonylurea overdose. Continue ' +
            'with a 10 % dextrose infusion at maintenance to prevent rebound hypoglycaemia in malaria or sulphonylurea ' +
            'exposure.',
          {},
        ),
      ];
    }

    // First-ever seizure now post-ictal.
    if (ctx.firstEverSeizure === true) {
      const ctReasons: string[] = [];
      if (ctx.focalNeurologicalSigns === true) ctReasons.push('focal neurological deficit');
      if (typeof ctx.ageYears === 'number' && ctx.ageYears > 40) {
        ctReasons.push(`age ${ctx.ageYears} y > 40`);
      }
      if (ctx.hivStatus === 'positive') ctReasons.push('HIV-positive (risk of opportunistic CNS infection)');
      if (ctx.recentHeadInjury === true) ctReasons.push('recent head injury');
      const imagingLine =
        ctReasons.length > 0
          ? `Urgent CT brain indicated (${ctReasons.join('; ')}).`
          : 'Outpatient brain imaging (CT or MRI) can be arranged.';
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'First seizure — investigate, counsel, do not start AED reflexively',
          'Post-ictal after a first-ever seizure. Investigations: random glucose, electrolytes (Na, Ca, Mg), urea / creatinine, ' +
            'full blood count, malaria smear / RDT where endemic, HIV test, urine pregnancy test (history-only), ECG for QTc ' +
            'and ischaemia, EEG (outpatient). {{imaging}} Counsel: do not drive, avoid heights, swim only with a buddy, ' +
            'shower instead of bath, recognise warning signs. Anti-epileptic drug therapy is NOT routinely started after a ' +
            'first unprovoked seizure unless an underlying structural lesion is found, the EEG is abnormal, or a second ' +
            'seizure occurs. If AED is indicated, levetiracetam 500 mg twice daily, sodium valproate 500 mg twice daily ' +
            '(avoid in women of childbearing potential), or phenytoin 300 mg daily are first-line per Kenya EML. Refer to ' +
            'neurology / clinical officer for review within 2 weeks.',
          { imaging: imagingLine },
        ),
      ];
    }

    // Known epilepsy break-through.
    if (ctx.knownEpilepsy === true) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'Break-through seizure in known epilepsy — assess adherence + triggers',
          'Confirm adherence with current AEDs (missed doses are the commonest precipitant). Ask about new precipitants: sleep ' +
            'deprivation, alcohol, illness with fever, missed meals, new medications (especially tramadol, antimalarials, ' +
            'fluoroquinolones, antipsychotics — all lower the seizure threshold). Check drug levels where available ' +
            '(phenytoin, carbamazepine). If adherent and on monotherapy at maximum dose, refer to neurology for therapy ' +
            'review (escalation or change of AED). Re-counsel safety; document time of seizure and recovery.',
          {},
        ),
      ];
    }

    return [];
  }

  private statusCard(rule: CdsRule, req: CdsHookRequest, ctx: SeizureContext): CdsCard {
    const wt = ctx.weightKg;
    const isChild = typeof ctx.ageYears === 'number' && ctx.ageYears < 12;
    const lorazepamDose =
      typeof wt === 'number'
        ? `lorazepam ${Math.min(4, Number((0.1 * wt).toFixed(1)))} mg IV (0.1 mg/kg × ${wt} kg, max 4 mg)`
        : 'lorazepam 0.1 mg/kg IV (max 4 mg)';
    const midazolamDose =
      isChild
        ? typeof wt === 'number' && wt >= 13 && wt <= 40
          ? `buccal / IM midazolam 5 mg (weight ${wt} kg in 13–40 kg band)`
          : 'buccal / IM midazolam 10 mg (weight ≥ 40 kg) or 5 mg (13–40 kg)'
        : 'IM midazolam 10 mg (single dose)';
    const phenytoinDose =
      typeof wt === 'number'
        ? `phenytoin ${(20 * wt).toFixed(0)} mg IV (20 mg/kg) in normal saline at ≤ 50 mg/min (≤ 1 mg/kg/min in children)`
        : 'phenytoin 20 mg/kg IV in normal saline at ≤ 50 mg/min (≤ 1 mg/kg/min in children)';

    return this.buildCard(
      rule,
      req,
      'critical',
      'Status epilepticus — activate emergency bundle now',
      'ABCDE: airway protection (recovery position; suction; oxygen 15 L via non-rebreather; jaw thrust — do not force ' +
        'anything between teeth), IV access × 2 large-bore, finger-stick glucose (give 50 mL of 50 % dextrose if < 3 mmol/L; ' +
        'in alcohol use add thiamine 100 mg IV first). Stage 1 (0–5 min) — first-line benzodiazepine: {{bzd1}}. If no IV ' +
        'access: {{bzd2}}. Repeat ONCE after 10 min if still convulsing. Stage 2 (10–30 min, still convulsing) — second-line ' +
        'anti-epileptic: {{phenytoin}} with continuous cardiac monitoring (risk of hypotension, bradycardia, asystole), OR ' +
        'sodium valproate 40 mg/kg IV over 10 min (avoid in suspected hepatic disease, mitochondrial disease, pregnancy), ' +
        'OR levetiracetam 60 mg/kg IV (max 4.5 g) over 10 min. Stage 3 (> 30 min — refractory) — intubate; midazolam infusion ' +
        '0.05–0.4 mg/kg/h OR thiopentone induction with EEG monitoring. Investigate precipitant: full glucose / U&E / Ca / Mg, ' +
        'malaria smear, lactate, ABG, ECG, CT brain, lumbar puncture if febrile / immunocompromised once imaging clear. ' +
        'Refer to higher-level care.',
      { bzd1: lorazepamDose, bzd2: midazolamDose, phenytoin: phenytoinDose },
    );
  }

  private buildCard(
    rule: CdsRule,
    req: CdsHookRequest,
    indicator: CdsIndicator,
    defaultSummary: string,
    defaultDetail: string,
    vars: Record<string, string | number | boolean | null | undefined>,
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label: 'WHO mhGAP Intervention Guide v2.0 — Epilepsy / Convulsive Disorders',
      url: 'https://www.who.int/publications/i/item/9789241549790',
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
      source: { label: ref.label, url: ref.url },
      extension: {
        'http://vedamd.io/Card/recommendation': {
          ruleId: rule.id,
          ruleVersion: rule.ruleVersion,
          evidenceLevel: rule.evidenceLevel,
          generatedAt: new Date().toISOString(),
        },
      },
    };
  }
}
