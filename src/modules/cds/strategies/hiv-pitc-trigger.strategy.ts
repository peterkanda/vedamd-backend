import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO Consolidated Guidelines on HIV Testing Services (2019) +
 * Kenya NASCOP — provider-initiated testing and counselling (PITC).
 *
 * Fires only when context.hivStatusUnknown === true (the integrator
 * confirms the patient has no documented HIV status from this or a
 * recent encounter). Then surfaces the recommendation tier:
 *
 *   1. MANDATORY-OFFER tier (CRITICAL — testing is the standard of care):
 *      • Pregnancy at any antenatal contact OR labour OR postpartum.
 *      • Active TB (suspected or confirmed).
 *      • New STI diagnosis at this encounter.
 *      • Infant of HIV-positive mother (EID).
 *      → CRITICAL card: testing should be offered today, with opt-out
 *        consent per Kenya policy.
 *
 *   2. STRONGLY-OFFER tier (WARNING):
 *      • Member of a key population (sex workers, men who have sex
 *        with men, people who inject drugs, transgender people,
 *        people in prisons).
 *      • Serodiscordant or known-HIV-positive sexual contact.
 *      • Clinical features suggestive of HIV (oral candidiasis,
 *        persistent diarrhoea > 1 month, herpes zoster, weight loss
 *        > 10%, persistent generalised lymphadenopathy, recurrent
 *        infections).
 *      → WARNING card with PITC recommendation.
 *
 *   3. ROUTINE-OFFER tier (INFO):
 *      • Patient over 15 with no risk markers and no testing in the
 *        last 12 months.
 *      → INFO card with universal-offer reminder.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                  number
 *   context.hivStatusUnknown          boolean (sentinel — must be
 *                                     true for the rule to fire)
 *   context.pregnant                  boolean
 *   context.suspectedOrConfirmedTb    boolean
 *   context.newStiDiagnosis           boolean
 *   context.infantOfHivPositiveMother boolean
 *   context.keyPopulation             'msm' | 'sex-worker' | 'pwid'
 *                                     | 'transgender' | 'prisoner'
 *                                     | null
 *   context.knownHivPositiveContact   boolean
 *   context.clinicalFeaturesSuggestHiv boolean
 *   context.monthsSinceLastNegativeTest  number | null  (null = never)
 */

const ROUTINE_OFFER_INTERVAL_MONTHS = 12;

const KEY_POPULATION_LABELS: Record<string, string> = {
  msm: 'men who have sex with men',
  'sex-worker': 'sex workers',
  pwid: 'people who inject drugs',
  transgender: 'transgender people',
  prisoner: 'people in prisons',
};

interface HivContext {
  ageYears?: number;
  hivStatusUnknown?: boolean;
  pregnant?: boolean;
  suspectedOrConfirmedTb?: boolean;
  newStiDiagnosis?: boolean;
  infantOfHivPositiveMother?: boolean;
  keyPopulation?: string | null;
  knownHivPositiveContact?: boolean;
  clinicalFeaturesSuggestHiv?: boolean;
  monthsSinceLastNegativeTest?: number | null;
}

@Injectable()
export class HivPitcTriggerStrategy implements CdsRuleStrategy {
  readonly type = 'hiv-pitc-trigger';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as HivContext;
    if (ctx.hivStatusUnknown !== true) return [];

    // Tier 1 — mandatory offer (any one suffices).
    const mandatoryReasons: string[] = [];
    if (ctx.pregnant === true) mandatoryReasons.push('current pregnancy');
    if (ctx.suspectedOrConfirmedTb === true) {
      mandatoryReasons.push('TB suspected or confirmed');
    }
    if (ctx.newStiDiagnosis === true) mandatoryReasons.push('new STI diagnosis this visit');
    if (ctx.infantOfHivPositiveMother === true) {
      mandatoryReasons.push('infant of HIV-positive mother (EID indicated)');
    }

    if (mandatoryReasons.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'HIV testing is the standard of care — offer PITC today',
          'Mandatory-offer trigger(s): {{reasons}}. Per the Kenya NASCOP HTS guidelines and WHO HTS 2019, offer HIV testing ' +
            'with opt-out consent at this encounter. Use the national rapid-test algorithm; if reactive, link the patient ' +
            'to ART services the same day. In pregnancy or labour, ensure infant ARV prophylaxis is planned; in TB-HIV, ' +
            'start ART within 2 weeks of TB therapy (within 8 weeks if CD4 ≥ 50).',
          { reasons: mandatoryReasons.join('; ') },
        ),
      ];
    }

    // Tier 2 — strongly offer.
    const strongReasons: string[] = [];
    if (typeof ctx.keyPopulation === 'string' && ctx.keyPopulation in KEY_POPULATION_LABELS) {
      strongReasons.push(`key population: ${KEY_POPULATION_LABELS[ctx.keyPopulation]}`);
    }
    if (ctx.knownHivPositiveContact === true) {
      strongReasons.push('sexual contact with known HIV-positive partner');
    }
    if (ctx.clinicalFeaturesSuggestHiv === true) {
      strongReasons.push('clinical features suggestive of HIV');
    }
    if (strongReasons.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'HIV testing strongly recommended — offer PITC',
          'Recommend-offer trigger(s): {{reasons}}. Offer provider-initiated HIV testing today with opt-out consent. Discuss ' +
            'PrEP eligibility for HIV-negative members of key populations and serodiscordant couples. Consider concurrent ' +
            'screening for syphilis, hepatitis B and C, and TB.',
          { reasons: strongReasons.join('; ') },
        ),
      ];
    }

    // Tier 3 — routine offer for adolescents and adults not recently tested.
    if (
      typeof ctx.ageYears === 'number' &&
      ctx.ageYears >= 15 &&
      (ctx.monthsSinceLastNegativeTest === null ||
        ctx.monthsSinceLastNegativeTest === undefined ||
        ctx.monthsSinceLastNegativeTest > ROUTINE_OFFER_INTERVAL_MONTHS)
    ) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'Routine HIV testing reminder',
          'No prior test recorded in the last 12 months. Per Kenya NASCOP universal-offer policy, offer HIV testing to ' +
            'adolescents and adults at routine primary-care contacts.',
          {},
        ),
      ];
    }

    return [];
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
      label: 'WHO Consolidated Guidelines on HIV Testing Services (2019)',
      url: 'https://www.who.int/publications/i/item/9789241550581',
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
