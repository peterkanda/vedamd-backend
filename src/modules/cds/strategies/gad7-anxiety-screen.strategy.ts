import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * GAD-7 generalised anxiety disorder screen.
 *
 *   Banding:
 *     0–4   minimal      INFO
 *     5–9   mild         WARNING — supportive counselling, watchful waiting
 *     10–14 moderate     WARNING — structured psychological therapy ± SSRI
 *     15–21 severe       CRITICAL — SSRI + therapy + specialist referral
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears        number (≥ 12)
 *   context.gad7Responses   number[7] — each value 0..3
 */

const MIN_AGE_YEARS = 12;

interface Gad7Context {
  ageYears?: number;
  gad7Responses?: unknown;
}

@Injectable()
export class Gad7AnxietyScreenStrategy implements CdsRuleStrategy {
  readonly type = 'gad7-anxiety-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as Gad7Context;
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < MIN_AGE_YEARS) return [];

    const responses = ctx.gad7Responses;
    if (!Array.isArray(responses) || responses.length !== 7) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'Provide seven GAD-7 responses to complete the screen',
          'GAD-7 requires seven integer responses (each 0..3) covering nervousness, uncontrollable worry, excessive worry, ' +
            'trouble relaxing, restlessness, irritability, and feeling afraid. Supply context.gad7Responses as an array of ' +
            'seven integers.',
          {},
        ),
      ];
    }
    if (
      !responses.every(
        (r): r is number =>
          Number.isInteger(r) && (r as number) >= 0 && (r as number) <= 3,
      )
    ) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'GAD-7 responses must be integers 0..3',
          'Each of the seven GAD-7 items takes a value 0 (not at all) to 3 (nearly every day). Re-check responses and ' +
            're-submit.',
          {},
        ),
      ];
    }

    const total = (responses as number[]).reduce((a, b) => a + b, 0);
    const band: Gad7Band = total <= 4 ? 'minimal' : total <= 9 ? 'mild' : total <= 14 ? 'moderate' : 'severe';

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    if (band === 'minimal') {
      indicator = 'info';
      summary = `GAD-7 ${total} (minimal) — no clinically significant anxiety detected`;
      recommendation =
        'No further anxiety-specific action required. Offer general wellbeing counselling and re-screen if symptoms emerge.';
    } else if (band === 'mild') {
      indicator = 'warning';
      summary = `GAD-7 ${total} (mild) — supportive counselling and watchful waiting`;
      recommendation =
        'Brief structured psychological support per WHO mhGAP. Counsel on sleep hygiene, exercise, caffeine reduction and ' +
        'breathing techniques. Re-screen in 2–4 weeks.';
    } else if (band === 'moderate') {
      indicator = 'warning';
      summary = `GAD-7 ${total} (moderate) — structured therapy, consider SSRI`;
      recommendation =
        'Start structured psychological therapy (CBT for anxiety or problem-solving therapy). Consider an SSRI ' +
        '(sertraline 50 mg daily or fluoxetine 20 mg daily as Kenya-MoH first line). Review at 2 weeks.';
    } else {
      indicator = 'critical';
      summary = `GAD-7 ${total} (severe) — start SSRI + structured therapy, refer if available`;
      recommendation =
        'Severe anxiety with substantial functional impairment. Start an SSRI alongside structured psychological therapy and ' +
        'refer to a mental-health professional where capacity exists. Exclude comorbid depression (PHQ-9), substance use, ' +
        'hyperthyroidism. Document a same-day safety plan if any suicidality screening is positive.';
    }

    return [this.buildCard(rule, req, indicator, summary, recommendation, { score: total, band })];
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

type Gad7Band = 'minimal' | 'mild' | 'moderate' | 'severe';
