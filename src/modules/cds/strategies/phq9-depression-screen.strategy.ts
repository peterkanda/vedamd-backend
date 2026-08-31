import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * PHQ-9 depression screen with suicide-risk gate (WHO mhGAP + Kenya
 * MoH mental-health guideline).
 *
 *   PHQ-9 total band severity:
 *     0–4   minimal       → INFO
 *     5–9   mild          → WARNING
 *     10–14 moderate      → WARNING
 *     15–19 mod-severe    → WARNING (consider pharmacotherapy)
 *     20–27 severe        → CRITICAL
 *
 *   Suicide-risk gate (overrides band):
 *     PHQ-9 item 9 (thoughts of being better off dead or self-harm)
 *     answered ≥ 1 → emit a SECOND `critical` card with the WHO mhGAP
 *     suicide-risk pathway: ask directly, assess plan / means / intent,
 *     refer urgently, and put a same-day safety plan in place.
 *
 * Validation:
 *   Strategy expects nine integer responses (0..3 each) in
 *   `context.phq9Responses`. If fewer than 9 are supplied or any
 *   response is out of range, no card is emitted and a brief INFO is
 *   returned asking the caller to complete the instrument.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears        number (≥ 12 — adolescents use PHQ-A but
 *                           PHQ-9 is widely used from 13 in Kenya)
 *   context.phq9Responses   number[]   nine 0..3 integers
 */

const MIN_AGE_YEARS = 12;

interface Phq9Context {
  ageYears?: number;
  phq9Responses?: unknown;
}

@Injectable()
export class Phq9DepressionScreenStrategy implements CdsRuleStrategy {
  readonly type = 'phq9-depression-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as Phq9Context;
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < MIN_AGE_YEARS) return [];

    const responses = ctx.phq9Responses;
    if (!Array.isArray(responses) || responses.length !== 9) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'Provide nine PHQ-9 responses to complete the screen',
          'PHQ-9 requires nine integer responses (each 0..3) covering interest, mood, sleep, energy, appetite, self-worth, ' +
            'concentration, psychomotor activity and thoughts of being better off dead. Supply context.phq9Responses as an ' +
            'array of nine integers.',
          {},
        ),
      ];
    }
    if (
      !responses.every(
        (r): r is number => Number.isInteger(r) && (r as number) >= 0 && (r as number) <= 3,
      )
    ) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'PHQ-9 responses must be integers 0..3',
          'Each of the nine PHQ-9 items takes a value 0 (not at all) to 3 (nearly every day). Re-check the supplied responses ' +
            'and re-submit.',
          {},
        ),
      ];
    }

    const total = (responses as number[]).reduce((a, b) => a + b, 0);
    const item9 = (responses as number[])[8];
    const band = bandFor(total);
    const cards: CdsCard[] = [];

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;
    if (band === 'minimal') {
      indicator = 'info';
      summary = `PHQ-9 ${total} (minimal) — no depression detected`;
      recommendation =
        'No further depression-specific action required at this contact. Offer general well-being counselling and ' +
        're-screen at next encounter if symptoms emerge.';
    } else if (band === 'mild') {
      indicator = 'warning';
      summary = `PHQ-9 ${total} (mild) — supportive counselling and watchful waiting`;
      recommendation =
        'Provide brief structured psychological support per the WHO mhGAP-IG mhPP module; encourage exercise, sleep hygiene, ' +
        'social engagement. Re-screen with PHQ-9 in 2–4 weeks.';
    } else if (band === 'moderate') {
      indicator = 'warning';
      summary = `PHQ-9 ${total} (moderate) — start treatment plan`;
      recommendation =
        'Initiate active treatment: brief psychological intervention (problem-solving therapy, behavioural activation) + ' +
        'consider an SSRI (fluoxetine 20 mg daily as Kenya-MoH first line) if access permits. Set safety plan; review at 2 weeks.';
    } else if (band === 'mod-severe') {
      indicator = 'warning';
      summary = `PHQ-9 ${total} (moderately severe) — start SSRI + structured psychological therapy`;
      recommendation =
        'Start an SSRI (fluoxetine 20 mg daily, titrate to 40 mg after 4 weeks if needed) alongside structured psychological ' +
        'therapy. Document a safety plan. Review weekly initially; refer to mental-health specialist where capacity exists.';
    } else {
      indicator = 'critical';
      summary = `PHQ-9 ${total} (severe) — urgent specialist referral`;
      recommendation =
        'Severe depression — refer urgently to a mental-health professional. Start an SSRI in the meantime per WHO mhGAP ' +
        'depression module, document a same-day safety plan, and engage family / support contacts. Re-screen weekly.';
    }

    cards.push(
      this.buildCard(rule, req, indicator, summary, recommendation, {
        score: total,
        band,
      }),
    );

    if (item9 >= 1) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'critical',
          'PHQ-9 item 9 positive — assess suicide risk now',
          'The patient endorsed thoughts of being better off dead or self-harm (PHQ-9 item 9). Per WHO mhGAP suicide module ' +
            'and Kenya MoH mental-health protocol, ask directly: "Are you thinking of killing yourself or hurting yourself?". ' +
            'Assess plan, access to means, intent and protective factors. If imminent risk, remove access to means, ensure a ' +
            'responsible adult stays with the patient, and refer urgently to a mental-health service. Develop a same-day ' +
            'safety plan even if risk appears low; document and follow up within 48–72 h.',
          {},
        ),
      );
    }

    return cards;
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
      label: 'WHO mhGAP Intervention Guide (2.0)',
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

type Phq9Band = 'minimal' | 'mild' | 'moderate' | 'mod-severe' | 'severe';
function bandFor(total: number): Phq9Band {
  if (total <= 4) return 'minimal';
  if (total <= 9) return 'mild';
  if (total <= 14) return 'moderate';
  if (total <= 19) return 'mod-severe';
  return 'severe';
}
