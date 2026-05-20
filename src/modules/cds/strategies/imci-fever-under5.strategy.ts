import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * IMCI fever assessment in children under five (WHO IMCI 2014).
 *
 * The clinical rule, in plain language:
 *
 *   IF the child's age is under 60 months
 *   AND any temperature recorded in the last 14 days is ≥ 37.5 °C
 *   THEN this is a febrile illness in a child under five — perform
 *        the full IMCI fever assessment before any treatment.
 *
 *   Escalate to CRITICAL if any IMCI general danger sign is reported
 *   (unable to drink/breastfeed, vomits everything, history of
 *   convulsions, lethargic/unconscious, convulsing now).
 *
 * Anonymous-by-design (FR-088, FR-090): we read only the
 * non-identifying clinical signals the rule needs. No name, no MRN,
 * no DOB — the integrator sends us `ageMonths` and a list of recent
 * temperatures in °C. Nothing in the request is logged or persisted
 * beyond the bounded, hashed audit trail.
 *
 * Expected `context` shape on POST /cds-services/vedamd-imci-fever-under5:
 *
 *   {
 *     "ageMonths": 23,                          // 0–59 means "under 5"
 *     "recentTemperaturesC": [37.8, 38.1, 37.2], // °C, last 14 days
 *     "dangerSigns": ["vomits-everything"]       // optional, IMCI codes
 *   }
 *
 * Permitted danger-sign codes (per WHO IMCI 2014 General Danger Signs):
 *   - "unable-to-drink-or-breastfeed"
 *   - "vomits-everything"
 *   - "history-of-convulsions"
 *   - "lethargic-or-unconscious"
 *   - "convulsing-now"
 */

const FEVER_THRESHOLD_C = 37.5;
const UNDER_FIVE_MONTHS = 60;

const DANGER_SIGN_LABELS: Record<string, string> = {
  'unable-to-drink-or-breastfeed': 'unable to drink or breastfeed',
  'vomits-everything': 'vomits everything',
  'history-of-convulsions': 'history of convulsions',
  'lethargic-or-unconscious': 'lethargic or unconscious',
  'convulsing-now': 'convulsing now',
};

interface ImciContext {
  ageMonths?: number;
  recentTemperaturesC?: number[];
  dangerSigns?: string[];
}

@Injectable()
export class ImciFeverUnder5Strategy implements CdsRuleStrategy {
  readonly type = 'imci-fever-under5';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as ImciContext;

    if (typeof ctx.ageMonths !== 'number' || ctx.ageMonths < 0) return [];
    if (ctx.ageMonths >= UNDER_FIVE_MONTHS) return [];

    const temps = Array.isArray(ctx.recentTemperaturesC)
      ? ctx.recentTemperaturesC.filter((t): t is number => typeof t === 'number' && isFinite(t))
      : [];
    if (temps.length === 0) return [];

    const maxTemp = Math.max(...temps);
    if (maxTemp < FEVER_THRESHOLD_C) return [];

    const dangerSigns = Array.isArray(ctx.dangerSigns)
      ? ctx.dangerSigns.filter((s): s is string => typeof s === 'string' && s in DANGER_SIGN_LABELS)
      : [];
    const hasDangerSign = dangerSigns.length > 0;

    const indicator: CdsIndicator = hasDangerSign ? 'critical' : 'warning';

    const dangerSignLabels = dangerSigns.map((s) => DANGER_SIGN_LABELS[s]).join(', ');
    const dangerSentence = hasDangerSign
      ? `IMCI general danger signs reported: ${dangerSignLabels}. Initiate IMCI severe-illness protocol and refer urgently for stabilisation.`
      : 'Assess for IMCI general danger signs (unable to drink/breastfeed, vomits everything, convulsions, lethargic/unconscious).';
    const followUp =
      'Then classify the febrile illness per local epidemiology (malaria, pneumonia, measles, meningitis) using the WHO IMCI Chartbook before initiating treatment.';

    const defaultSummary = hasDangerSign
      ? 'Severe febrile illness in a child under 5 — IMCI danger sign(s) reported, urgent referral'
      : 'Suspected febrile illness in a child under 5 — full IMCI fever assessment indicated';
    const defaultDetail = `Age {{ageMonths}} months; maximum recorded temperature {{maxTempC}} °C. {{dangerSentence}} {{followUp}}`;

    const { summary, detail } = resolveCardCopy(
      rule,
      req,
      { summary: defaultSummary, detail: defaultDetail },
      {
        ageMonths: ctx.ageMonths,
        maxTempC: maxTemp.toFixed(1),
        dangerSentence,
        followUp,
      },
    );

    const ref = rule.references[0] ?? {
      label: 'WHO IMCI Chartbook 2014',
      url: 'https://apps.who.int/iris/handle/10665/104772',
    };

    return [
      {
        summary,
        indicator,
        detail,
        source: { label: ref.label, url: ref.url },
        extension: {
          'http://vedamd.io/Card/recommendation': {
            ruleId: rule.id,
            ruleVersion: rule.ruleVersion,
            evidenceLevel: rule.evidenceLevel,
            generatedAt: new Date().toISOString(),
          },
        },
      },
    ];
  }
}
