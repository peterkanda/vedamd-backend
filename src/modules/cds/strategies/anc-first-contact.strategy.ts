import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO ANC SMART Guideline — first antenatal-contact danger-sign screen.
 *
 * Plain-language rule (per the WHO 2016 ANC recommendations + Kenya MoH
 * ANC profile):
 *
 *   On `patient-view`, IF the patient is pregnant AND this is the first
 *   ANC contact, fire one or more cards:
 *
 *     • CRITICAL — any obstetric danger sign reported (severe headache,
 *                  blurred vision, convulsions, fever, severe abdominal
 *                  pain, severe vaginal bleeding, severe difficulty
 *                  breathing). Urgent referral to a higher-level
 *                  facility per WHO ANC Recommendation E.1.
 *
 *     • WARNING — first contact at >12 weeks gestation (late booking)
 *                  → catch-up plan for missed early-pregnancy
 *                  screening per WHO recommendation A.7.
 *
 *     • INFO    — initial-visit checklist when no danger signs and not
 *                  late-booking: BP, urine dipstick, Hb, blood
 *                  group/Rh, HIV/syphilis/HepB screening, tetanus
 *                  vaccination check, folic acid + iron supplementation,
 *                  ITN distribution (where malaria-endemic).
 *
 * Anonymous-by-design (FR-088). Reads only:
 *
 *   context.pregnant                  boolean — mandatory trigger
 *   context.firstAncContact           boolean — mandatory trigger
 *   context.gestationalAgeWeeks       number, optional
 *   context.dangerSigns               string[] — optional ANC danger codes
 *   context.malariaEndemic            boolean, optional (defaults true for v0.1 Kenya scope)
 *
 * No name, no DOB, no MRN. The integrator extracts only structured
 * obstetric signals from their own EMR.
 */

const LATE_BOOKING_WEEKS_THRESHOLD = 12;

const DANGER_SIGN_LABELS: Record<string, string> = {
  'severe-headache': 'severe persistent headache',
  'blurred-vision': 'blurred vision / scotomata',
  convulsions: 'convulsions',
  fever: 'fever',
  'severe-abdominal-pain': 'severe abdominal pain',
  'severe-vaginal-bleeding': 'severe vaginal bleeding',
  'severe-difficulty-breathing': 'severe difficulty breathing',
  'reduced-foetal-movements': 'reduced foetal movements',
};

interface AncContext {
  pregnant?: boolean;
  firstAncContact?: boolean;
  gestationalAgeWeeks?: number;
  dangerSigns?: string[];
  malariaEndemic?: boolean;
}

@Injectable()
export class AncFirstContactStrategy implements CdsRuleStrategy {
  readonly type = 'anc-first-contact';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as AncContext;
    if (ctx.pregnant !== true) return [];
    if (ctx.firstAncContact !== true) return [];

    const cards: CdsCard[] = [];

    // 1. Danger signs — always emitted first, always critical.
    const dangerCodes = Array.isArray(ctx.dangerSigns)
      ? ctx.dangerSigns.filter((s): s is string => typeof s === 'string' && s in DANGER_SIGN_LABELS)
      : [];
    if (dangerCodes.length > 0) {
      const labels = dangerCodes.map((c) => DANGER_SIGN_LABELS[c]).join(', ');
      cards.push(
        this.buildCard(
          rule,
          req,
          'critical',
          'ANC danger sign reported — refer urgently to a higher-level facility',
          'Reported obstetric danger sign(s): {{labels}}. Per the WHO ANC SMART Guideline (Recommendation E.1) and the Kenya MoH ANC profile, initiate immediate stabilisation, document and refer urgently — do not delay for routine first-visit labs.',
          { labels },
        ),
      );
    }

    // 2. Late booking warning.
    const weeks = typeof ctx.gestationalAgeWeeks === 'number' ? ctx.gestationalAgeWeeks : undefined;
    if (weeks !== undefined && weeks > LATE_BOOKING_WEEKS_THRESHOLD) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'Late booking (first ANC contact at >12 weeks)',
          'First antenatal contact at {{weeks}} weeks gestation. Per WHO ANC Recommendation A.7, catch up on early-pregnancy screening this visit: confirm dating, take the full obstetric history, request booking labs, and counsel on missed early-pregnancy interventions (folic acid pre-conception, varicella status, etc.).',
          { weeks },
        ),
      );
    }

    // 3. First-visit checklist — only if no danger sign was reported.
    if (dangerCodes.length === 0) {
      const endemicLine =
        ctx.malariaEndemic === false
          ? ''
          : 'distribute a long-lasting insecticidal net (LLIN) per Kenya MoH malaria-in-pregnancy policy; ';
      cards.push(
        this.buildCard(
          rule,
          req,
          'info',
          'WHO ANC first-contact checklist',
          'Initiate the WHO ANC SMART Guideline first-contact bundle: record baseline BP, weight and uterine fundal height; test urine dipstick (protein, glucose, leukocyte esterase); request booking labs (Hb, blood group/Rh, HIV, syphilis VDRL/RPR, hepatitis B surface antigen); confirm tetanus-toxoid vaccination status; start daily oral iron 30–60 mg + folic acid 400 µg; counsel on nutrition and danger signs; {{endemicLine}}schedule the next contact per the 8-contact model.',
          { endemicLine },
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
      label: 'WHO ANC SMART Guideline (2016)',
      url: 'https://www.who.int/publications/i/item/9789241549912',
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
