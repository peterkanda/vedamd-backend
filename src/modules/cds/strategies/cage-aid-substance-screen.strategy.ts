import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * CAGE-AID — Cut down, Annoyed, Guilty, Eye-opener, Adapted to
 * Include Drugs.
 *
 *   Four yes/no items:
 *     1. Have you ever felt you ought to Cut down on your drinking
 *        or drug use?
 *     2. Have people Annoyed you by criticising your drinking or drug
 *        use?
 *     3. Have you ever felt bad or Guilty about your drinking or drug
 *        use?
 *     4. Have you ever had a drink or used drugs first thing in the
 *        morning (Eye-opener) to steady nerves or get rid of a hangover?
 *
 *   Scoring:
 *     ≥ 2 "yes" → positive screen → WARNING with brief intervention
 *                 + onward referral to substance-use services.
 *     1 "yes"   → INFO, motivational counselling and re-screen.
 *     0 "yes"   → INFO, no further action.
 *
 *   Critical escalation:
 *     If any of `withdrawalSigns`, `recentInjectionUse`, or
 *     `recentOverdose` is true → CRITICAL with immediate
 *     medical-stabilisation pathway (per WHO mhGAP SUB module).
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                number (≥ 12)
 *   context.cageAidResponses        boolean[4]
 *   context.withdrawalSigns         boolean (optional — tremor,
 *                                   sweating, tachycardia, seizure)
 *   context.recentInjectionUse      boolean (last 30 days)
 *   context.recentOverdose          boolean (any time in last 12 months)
 */

const MIN_AGE_YEARS = 12;

interface CageAidContext {
  ageYears?: number;
  cageAidResponses?: unknown;
  withdrawalSigns?: boolean;
  recentInjectionUse?: boolean;
  recentOverdose?: boolean;
}

@Injectable()
export class CageAidSubstanceScreenStrategy implements CdsRuleStrategy {
  readonly type = 'cage-aid-substance-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as CageAidContext;
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < MIN_AGE_YEARS) return [];

    const responses = ctx.cageAidResponses;
    if (!Array.isArray(responses) || responses.length !== 4) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'Provide four CAGE-AID yes/no responses to complete the screen',
          'CAGE-AID has four yes/no items (Cut down, Annoyed, Guilty, Eye-opener). Supply context.cageAidResponses as a ' +
            'four-element boolean array (true = yes).',
          {},
        ),
      ];
    }
    if (!responses.every((r): r is boolean => typeof r === 'boolean')) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'CAGE-AID responses must be booleans',
          'Each of the four items takes true (yes) or false (no). Re-check responses and re-submit.',
          {},
        ),
      ];
    }

    const yesCount = (responses as boolean[]).filter(Boolean).length;
    const cards: CdsCard[] = [];

    // Critical-escalation gate fires first when any acute-risk flag is set.
    if (
      ctx.withdrawalSigns === true ||
      ctx.recentInjectionUse === true ||
      ctx.recentOverdose === true
    ) {
      const reasons: string[] = [];
      if (ctx.withdrawalSigns === true) reasons.push('active withdrawal signs');
      if (ctx.recentInjectionUse === true) reasons.push('injection drug use in the last 30 days');
      if (ctx.recentOverdose === true) reasons.push('overdose in the last 12 months');
      cards.push(
        this.buildCard(
          rule,
          req,
          'critical',
          'Acute substance-use risk — medical stabilisation + harm-reduction pathway',
          'Acute-risk feature(s): {{reasons}}. Per WHO mhGAP substance-use module: assess for alcohol-withdrawal severity ' +
            '(CIWA-Ar) — admit and treat with diazepam-tapering protocol if scoring ≥ 8; offer naloxone take-home kits to ' +
            'opioid users at risk; refer for HIV / HCV / TB screening (injection users); link to opioid-substitution therapy ' +
            'where available; treat any acute medical complication first.',
          { reasons: reasons.join('; ') },
        ),
      );
    }

    if (yesCount >= 2) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          `CAGE-AID positive (${yesCount}/4) — brief intervention and referral`,
          'Two or more positive CAGE-AID items suggests harmful or hazardous use. Conduct a brief motivational intervention ' +
            'using FRAMES (Feedback, Responsibility, Advice, Menu, Empathy, Self-efficacy). Screen with AUDIT for alcohol or ' +
            'ASSIST for drugs to characterise severity. Refer to substance-use specialist services; screen for HIV, hepatitis ' +
            'B and C, and tuberculosis; treat comorbid mental-health conditions (depression, anxiety) concurrently.',
          { yesCount },
        ),
      );
    } else if (yesCount === 1) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'info',
          `CAGE-AID 1/4 — motivational counselling and re-screen`,
          'One positive CAGE-AID item is suggestive but not diagnostic. Use a brief motivational discussion about safe-use ' +
            'thresholds (men < 14 units/week alcohol; women < 7 units/week). Re-screen at the next contact or in 6–12 months.',
          { yesCount },
        ),
      );
    } else {
      cards.push(
        this.buildCard(
          rule,
          req,
          'info',
          `CAGE-AID 0/4 — negative screen`,
          'No CAGE-AID items endorsed. Reinforce healthy lifestyle messaging. Re-screen at routine intervals or whenever ' +
            'clinical suspicion arises.',
          { yesCount },
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
