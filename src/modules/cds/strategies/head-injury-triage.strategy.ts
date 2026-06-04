import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Severe head-injury / traumatic-brain-injury triage — WHO Acute
 * Care 2019 + NICE NG232 (2023) + Brain Trauma Foundation 4th edn +
 * Kenya MoH Acute Care Guidelines.
 *
 * Road traffic injury is the third-leading cause of death in
 * 5–29 year-olds in sub-Saharan Africa and the dominant cause of
 * severe TBI. This rule triages presentations:
 *
 *   1. CRITICAL — severe TBI (GCS ≤ 8) OR herniation features
 *      (unilateral fixed dilated pupil, Cushing's triad, motor
 *      posturing):
 *        → ABC + intubate for airway protection, target SpO₂ ≥ 94 %,
 *          PaCO₂ 35–40 mmHg (avoid hyperventilation unless herniation),
 *          MAP ≥ 80 (or SBP ≥ 110), 30° head-up, mannitol 1 g/kg or
 *          3 % hypertonic saline 250 mL bolus for raised ICP / pupil
 *          changes, tranexamic acid 1 g IV within 3 h, urgent CT,
 *          neurosurgical referral.
 *
 *   2. CRITICAL — moderate TBI (GCS 9–12) OR any "NICE high-risk"
 *      finding for need of urgent CT (within 1 h):
 *        focal neurological deficit, > 1 episode of vomiting,
 *        post-traumatic seizure, suspected open or depressed skull
 *        fracture, signs of basal skull fracture (CSF leak,
 *        Battle's sign, racoon eyes, haemotympanum), age ≥ 65 with
 *        any loss of consciousness or amnesia, anticoagulant use,
 *        dangerous mechanism (pedestrian struck, fall > 1 m, motor
 *        vehicle ejection) AND any LOC / amnesia.
 *        → Urgent CT brain within 1 h, admit for neuro-obs,
 *          neurosurgical consult if abnormal CT or persistent
 *          symptoms.
 *
 *   3. WARNING — mild TBI (GCS 13–15) with intermediate risk:
 *        any single feature of: LOC / amnesia, persistent headache,
 *        single vomiting episode, intoxication confounding exam,
 *        suspected non-accidental injury (child).
 *        → 4-hour neuro-observation in a healthcare facility (vital
 *          signs + GCS + pupils every 30 min for 2 h, then hourly).
 *          Discharge with a written head-injury warning card to a
 *          responsible adult if asymptomatic at 4 h.
 *
 *   4. INFO — low-risk mild TBI (GCS 15, no LOC, no amnesia, no
 *      warning features, mechanism low-risk):
 *        → Safe to discharge with a written head-injury warning card
 *          and instruction to return immediately for any worsening.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                 number ≥ 0
 *   context.suspectedHeadInjury      boolean (sentinel)
 *   context.gcs                      number 3..15
 *   context.lossOfConsciousness      boolean
 *   context.amnesia                  boolean
 *   context.vomitingEpisodes         number
 *   context.postTraumaticSeizure     boolean
 *   context.focalDeficit             boolean
 *   context.suspectedSkullFracture   boolean (open or depressed)
 *   context.basalSkullFractureSigns  boolean (CSF leak, Battle's sign,
 *                                      racoon eyes, haemotympanum)
 *   context.unilateralFixedPupil     boolean
 *   context.motorPosturing           boolean
 *   context.cushingsTriad            boolean
 *   context.dangerousMechanism       boolean
 *   context.anticoagulantUse         boolean
 *   context.intoxicated              boolean
 *   context.suspectedNonAccidental   boolean (child)
 *   context.persistentHeadache       boolean
 *   context.spO2Percent              number (optional)
 *   context.systolicMmHg             number (optional)
 *   context.minutesSinceInjury       number (optional — for TXA window)
 */

interface HeadInjuryContext {
  ageYears?: number;
  suspectedHeadInjury?: boolean;
  gcs?: number;
  lossOfConsciousness?: boolean;
  amnesia?: boolean;
  vomitingEpisodes?: number;
  postTraumaticSeizure?: boolean;
  focalDeficit?: boolean;
  suspectedSkullFracture?: boolean;
  basalSkullFractureSigns?: boolean;
  unilateralFixedPupil?: boolean;
  motorPosturing?: boolean;
  cushingsTriad?: boolean;
  dangerousMechanism?: boolean;
  anticoagulantUse?: boolean;
  intoxicated?: boolean;
  suspectedNonAccidental?: boolean;
  persistentHeadache?: boolean;
  spO2Percent?: number;
  systolicMmHg?: number;
  minutesSinceInjury?: number;
}

const TXA_WINDOW_MIN = 180;

@Injectable()
export class HeadInjuryTriageStrategy implements CdsRuleStrategy {
  readonly type = 'head-injury-triage';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as HeadInjuryContext;
    if (ctx.suspectedHeadInjury !== true) return [];

    const herniation =
      ctx.unilateralFixedPupil === true ||
      ctx.motorPosturing === true ||
      ctx.cushingsTriad === true;
    const severeGcs = typeof ctx.gcs === 'number' && ctx.gcs <= 8;
    const moderateGcs = typeof ctx.gcs === 'number' && ctx.gcs >= 9 && ctx.gcs <= 12;

    // 1. Severe / herniation.
    if (severeGcs || herniation) {
      return [this.severeCard(rule, req, ctx, severeGcs, herniation)];
    }

    // 2. Moderate or any high-risk finding requiring urgent CT.
    const highRisk: string[] = [];
    if (moderateGcs) highRisk.push(`GCS ${ctx.gcs} (9–12, moderate)`);
    if (ctx.focalDeficit === true) highRisk.push('focal neurological deficit');
    if (typeof ctx.vomitingEpisodes === 'number' && ctx.vomitingEpisodes > 1) {
      highRisk.push(`${ctx.vomitingEpisodes} vomiting episodes (> 1)`);
    }
    if (ctx.postTraumaticSeizure === true) highRisk.push('post-traumatic seizure');
    if (ctx.suspectedSkullFracture === true) highRisk.push('suspected open or depressed skull fracture');
    if (ctx.basalSkullFractureSigns === true) {
      highRisk.push('signs of basal skull fracture (CSF leak / Battle\'s sign / racoon eyes / haemotympanum)');
    }
    if (
      typeof ctx.ageYears === 'number' &&
      ctx.ageYears >= 65 &&
      (ctx.lossOfConsciousness === true || ctx.amnesia === true)
    ) {
      highRisk.push(`age ${ctx.ageYears} y (≥ 65) with LOC / amnesia`);
    }
    if (ctx.anticoagulantUse === true && (ctx.lossOfConsciousness === true || ctx.amnesia === true)) {
      highRisk.push('anticoagulant use with LOC / amnesia');
    }
    if (
      ctx.dangerousMechanism === true &&
      (ctx.lossOfConsciousness === true || ctx.amnesia === true)
    ) {
      highRisk.push('dangerous mechanism with LOC / amnesia');
    }

    if (highRisk.length > 0) {
      return [this.urgentCtCard(rule, req, ctx, highRisk)];
    }

    // 3. Mild with intermediate features → 4-h obs.
    const obsReasons: string[] = [];
    if (ctx.lossOfConsciousness === true) obsReasons.push('loss of consciousness');
    if (ctx.amnesia === true) obsReasons.push('post-traumatic amnesia');
    if (ctx.persistentHeadache === true) obsReasons.push('persistent headache');
    if (typeof ctx.vomitingEpisodes === 'number' && ctx.vomitingEpisodes === 1) {
      obsReasons.push('one vomiting episode');
    }
    if (ctx.intoxicated === true) obsReasons.push('intoxication confounding exam');
    if (ctx.suspectedNonAccidental === true) obsReasons.push('suspected non-accidental injury');

    if (obsReasons.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Mild TBI with intermediate-risk feature(s) — 4-hour neuro-observation',
          'Feature(s): {{reasons}}. Observe in a healthcare facility for at least 4 hours from the time of injury. Record GCS, pupils, ' +
            'and vital signs every 30 minutes for the first 2 hours, then hourly. Re-image (CT) if there is any deterioration, ' +
            'persistent vomiting > 2 hours after presentation, new neurological sign, or persistent severe headache. If asymptomatic ' +
            'at 4 hours and a responsible adult is available, discharge with a written head-injury warning card and instructions to ' +
            'return immediately for: any decrease in consciousness, repeated vomiting, severe or worsening headache, seizure, ' +
            'unequal pupils, weakness, slurred speech, clear fluid from the nose or ear, or any concerning behaviour. If alone or ' +
            'in doubt, admit overnight. In suspected non-accidental injury in a child, MUST safeguard and refer per local pathways ' +
            'before considering discharge.',
          { reasons: obsReasons.join('; ') },
        ),
      ];
    }

    // 4. Low-risk discharge.
    return [
      this.buildCard(
        rule,
        req,
        'info',
        'Low-risk mild TBI (GCS 15) — discharge with written head-injury card',
        'No high- or intermediate-risk features. Discharge home with a responsible adult and a written head-injury warning card. ' +
          'Counsel: return immediately for any decrease in consciousness, repeated vomiting, severe or worsening headache, seizure, ' +
          'unequal pupils, weakness, slurred speech, clear fluid from the nose or ear, or any concerning behaviour. Rest for 24–48 ' +
          'hours; gradual return to activity. Avoid alcohol and sedatives for 24 hours. Follow-up if symptoms persist beyond 1 week.',
        {},
      ),
    ];
  }

  private severeCard(
    rule: CdsRule,
    req: CdsHookRequest,
    ctx: HeadInjuryContext,
    severeGcs: boolean,
    herniation: boolean,
  ): CdsCard {
    const reasons: string[] = [];
    if (severeGcs) reasons.push(`GCS ${ctx.gcs} (≤ 8, severe TBI)`);
    if (ctx.unilateralFixedPupil === true) reasons.push('unilateral fixed dilated pupil');
    if (ctx.motorPosturing === true) reasons.push('motor posturing');
    if (ctx.cushingsTriad === true) reasons.push("Cushing's triad");
    const txaLine =
      typeof ctx.minutesSinceInjury !== 'number' || ctx.minutesSinceInjury <= TXA_WINDOW_MIN
        ? ' Tranexamic acid 1 g IV bolus over 10 min then 1 g infusion over 8 h (CRASH-3 — give within 3 hours of injury for adults with GCS ≤ 12; ineffective in those with bilateral fixed pupils).'
        : ` Tranexamic acid window has passed (${ctx.minutesSinceInjury} min since injury — > ${TXA_WINDOW_MIN}). Do not give TXA.`;
    const hypertonicLine =
      herniation
        ? ' Herniation features — give 3 % hypertonic saline 250 mL IV over 5–10 min (or mannitol 1 g/kg IV) NOW; brief controlled ' +
          'hyperventilation (PaCO₂ 30–35 mmHg) is acceptable as a temporising measure pending neurosurgical decompression.'
        : ' Avoid prophylactic hyperventilation; target PaCO₂ 35–40 mmHg.';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Severe TBI / impending herniation — emergency neuroprotective bundle + urgent CT',
      'Reason(s): {{reasons}}. ABC: secure airway with rapid-sequence intubation (avoid hypotension and hypoxia — single episode of ' +
        'SpO₂ < 90 % or SBP < 90 mmHg doubles mortality). Target SpO₂ ≥ 94 %; in adults, MAP ≥ 80 (or SBP ≥ 110 mmHg). 30° head-up ' +
        'tilt, midline head, loosen tube ties. Sedate and analgesia (fentanyl + midazolam) to minimise ICP rises during handling. ' +
        '{{hypertonic}}{{txa}} Correct hypoglycaemia and hypothermia. Urgent non-contrast CT brain; activate neurosurgical referral. ' +
        'Reverse anticoagulation if applicable (warfarin: prothrombin complex concentrate + vitamin K 10 mg IV; DOACs: idarucizumab ' +
        'for dabigatran, andexanet for Xa-inhibitors where available, otherwise PCC). Withhold prophylactic phenytoin unless seizure ' +
        'occurs (then load 20 mg/kg IV).',
      { reasons: reasons.join('; '), hypertonic: hypertonicLine, txa: txaLine },
    );
  }

  private urgentCtCard(
    rule: CdsRule,
    req: CdsHookRequest,
    ctx: HeadInjuryContext,
    reasons: string[],
  ): CdsCard {
    const txaLine =
      typeof ctx.minutesSinceInjury !== 'number' || ctx.minutesSinceInjury <= TXA_WINDOW_MIN
        ? ' If GCS ≤ 12 within 3 hours of injury, give tranexamic acid 1 g IV over 10 min + 1 g infusion over 8 h (CRASH-3).'
        : '';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Moderate TBI or high-risk feature — urgent CT brain within 1 hour',
      'High-risk finding(s): {{reasons}}. Urgent non-contrast CT brain within 1 hour of risk identification (NICE NG232). Admit for ' +
        'neurological observation: GCS, pupils, and vital signs every 30 minutes for the first 2 hours, hourly thereafter for at ' +
        'least 24 hours OR until GCS 15 for 4 hours. Maintain SpO₂ ≥ 94 % and avoid hypotension. Reverse anticoagulation if present.{{txa}} ' +
        'Discuss with neurosurgery if CT abnormal, GCS does not return to 15 within 2 hours, persistent vomiting, or focal ' +
        'neurological signs. In children, follow PECARN pathway for imaging decisions and involve paediatric trauma services early.',
      { reasons: reasons.join('; '), txa: txaLine },
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
      label: 'NICE NG232 — Head injury: assessment and early management (2023)',
      url: 'https://www.nice.org.uk/guidance/ng232',
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
        },
      },
    };
  }
}
