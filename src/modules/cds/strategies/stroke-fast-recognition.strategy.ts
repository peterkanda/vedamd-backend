import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Stroke recognition using the FAST (Face / Arm / Speech / Time)
 * algorithm + WHO PEN-HEARTS stroke pathway.
 *
 * Sentinel-gated by `suspectedStroke`. Tiers:
 *
 *   1. CRITICAL — any positive FAST element OR any focal-neurology flag
 *      OR any acute severe headache "thunderclap" / decreased GCS.
 *      Onset within 4.5 h is the thrombolysis window; rule highlights
 *      this when supplied. Bundle: ABC + secure airway if GCS ≤ 8, IV
 *      access, capillary glucose (treat hypoglycaemia immediately
 *      with 10 % dextrose 50 mL bolus — strokes mimic hypoglycaemia),
 *      check BP (do NOT lower below 220/120 in ischaemic stroke
 *      pending imaging), keep NBM until swallow assessed, urgent CT
 *      head ideally within 60 min, refer to comprehensive stroke
 *      facility for IV alteplase ± mechanical thrombectomy decision.
 *
 *   2. INFO — none of the above features. Re-assess if any new
 *      neurological feature appears.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                  number ≥ 18
 *   context.suspectedStroke           boolean (sentinel)
 *   context.faceDroop                 boolean
 *   context.armWeakness               boolean
 *   context.speechSlurredOrAphasia    boolean
 *   context.minutesSinceOnset         number (optional)
 *   context.focalSensoryDeficit       boolean
 *   context.suddenSevereHeadache      boolean (thunderclap)
 *   context.glasgowComaScale          number 3..15 (optional)
 *   context.systolicMmHg              number (optional)
 *   context.diastolicMmHg             number (optional)
 *   context.bloodGlucoseMmolL         number (optional)
 *   context.onAnticoagulant           boolean (optional)
 */

const ADULT_AGE_YEARS = 18;
const THROMBOLYSIS_WINDOW_MIN = 270; // 4.5 h
const LOW_GCS = 12;
const HYPOGLYCAEMIA_MMOLL = 3.5;

interface StrokeContext {
  ageYears?: number;
  suspectedStroke?: boolean;
  faceDroop?: boolean;
  armWeakness?: boolean;
  speechSlurredOrAphasia?: boolean;
  minutesSinceOnset?: number;
  focalSensoryDeficit?: boolean;
  suddenSevereHeadache?: boolean;
  glasgowComaScale?: number;
  systolicMmHg?: number;
  diastolicMmHg?: number;
  bloodGlucoseMmolL?: number;
  onAnticoagulant?: boolean;
}

@Injectable()
export class StrokeFastRecognitionStrategy implements CdsRuleStrategy {
  readonly type = 'stroke-fast-recognition';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as StrokeContext;
    if (ctx.suspectedStroke !== true) return [];
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < ADULT_AGE_YEARS) return [];

    const features: string[] = [];
    if (ctx.faceDroop === true) features.push('F: facial droop');
    if (ctx.armWeakness === true) features.push('A: unilateral arm weakness');
    if (ctx.speechSlurredOrAphasia === true) features.push('S: slurred speech or aphasia');
    if (ctx.focalSensoryDeficit === true) features.push('focal sensory deficit');
    if (ctx.suddenSevereHeadache === true) features.push('thunderclap-pattern severe headache');
    if (typeof ctx.glasgowComaScale === 'number' && ctx.glasgowComaScale <= LOW_GCS) {
      features.push(`GCS ${ctx.glasgowComaScale}`);
    }

    if (features.length === 0) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'No FAST features identified — reassess if new neurology appears',
          'No face, arm, speech, sensory, headache, or consciousness features reported. Reassess every 30 minutes while the ' +
            'patient is in the unit; counsel the patient and family on FAST so they re-present immediately if symptoms develop.',
          {},
        ),
      ];
    }

    const minutesKnown = typeof ctx.minutesSinceOnset === 'number' && ctx.minutesSinceOnset >= 0;
    const inWindow = minutesKnown && ctx.minutesSinceOnset! <= THROMBOLYSIS_WINDOW_MIN;

    const hypoglycaemic =
      typeof ctx.bloodGlucoseMmolL === 'number' &&
      ctx.bloodGlucoseMmolL < HYPOGLYCAEMIA_MMOLL;

    const detailParts: string[] = [];
    detailParts.push(`Features: ${features.join('; ')}.`);
    if (minutesKnown) {
      detailParts.push(
        `Onset ${ctx.minutesSinceOnset} min ago — ${inWindow ? 'WITHIN' : 'OUTSIDE'} the 270-minute (4.5 h) IV thrombolysis window.`,
      );
    } else {
      detailParts.push('Onset time not supplied — establish "last known well" urgently.');
    }
    if (hypoglycaemic) {
      detailParts.push(
        `Capillary glucose ${ctx.bloodGlucoseMmolL!.toFixed(1)} mmol/L — treat hypoglycaemia immediately with 10 % dextrose 50 mL IV bolus before any other decision (stroke mimic).`,
      );
    } else if (typeof ctx.bloodGlucoseMmolL === 'number') {
      detailParts.push(`Capillary glucose ${ctx.bloodGlucoseMmolL.toFixed(1)} mmol/L (above hypoglycaemia threshold).`);
    } else {
      detailParts.push('Check capillary glucose immediately — hypoglycaemia mimics stroke.');
    }
    if (typeof ctx.systolicMmHg === 'number' || typeof ctx.diastolicMmHg === 'number') {
      detailParts.push(
        `BP ${ctx.systolicMmHg ?? '?'}/${ctx.diastolicMmHg ?? '?'} mmHg. Do NOT lower below 220/120 in ischaemic stroke before imaging; for SBP > 220 or DBP > 120, lower cautiously by ≤ 15 % in the first hour.`,
      );
    }
    if (ctx.onAnticoagulant === true) {
      detailParts.push(
        'On anticoagulation — request urgent INR / anti-Xa / PT-INR with thrombolysis decision; consider reversal if intracerebral haemorrhage on imaging.',
      );
    }
    detailParts.push(
      'Bundle: secure airway if GCS ≤ 8, IV access, ECG, baseline bloods (FBC, U&E, glucose, INR), urgent non-contrast CT head ideally within 60 min, keep NBM until formal swallow screen. Activate the stroke pathway; transfer to a comprehensive stroke facility for IV alteplase ± mechanical thrombectomy decision.',
    );

    const summary = inWindow
      ? 'Acute stroke — IN THROMBOLYSIS WINDOW. Activate the stroke pathway NOW.'
      : minutesKnown
        ? 'Acute stroke (outside 4.5 h IV-thrombolysis window) — refer for assessment and secondary prevention.'
        : 'Acute stroke — establish onset time, refer urgently, activate the stroke pathway.';

    const indicator: CdsIndicator = 'critical';

    return [this.buildCard(rule, req, indicator, summary, detailParts.join(' '), {})];
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
      label: 'WHO PEN — HEARTS technical package',
      url: 'https://www.who.int/publications/i/item/9789241514613',
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
