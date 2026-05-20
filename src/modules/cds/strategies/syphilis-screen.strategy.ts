import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Syphilis screening + treatment — WHO STI Guidelines (2021) +
 * Kenya MoH STI / ANC guidance.
 *
 * Two pathways covered by one rule:
 *
 *   A. Universal antenatal screen (CRITICAL when missed)
 *      All pregnant women should be screened at the first ANC contact
 *      and re-screened in the third trimester in high-prevalence
 *      settings. Untreated maternal syphilis carries up to 50 %
 *      perinatal mortality.
 *      → Trigger: pregnant === true AND syphilisScreenStatus !== 'done'
 *        for this pregnancy.
 *      → CRITICAL card: offer rapid syphilis test (treponemal RDT)
 *        today, with reflex VDRL / RPR titre to guide treatment.
 *
 *   B. Targeted offer (WARNING)
 *      Any of: new STI diagnosis this visit, key population (sex
 *      worker, MSM, PWID, transgender), serodiscordant partner, recent
 *      genital ulcer, recent IV drug use.
 *      → WARNING card recommending PITC for syphilis + HIV + hepatitis B/C.
 *
 *   C. Confirmed positive result (CRITICAL)
 *      When syphilisTestPositive === true AND treatmentGiven !== true:
 *      → CRITICAL card with the treatment bundle:
 *        Early syphilis (primary, secondary, early latent < 1 y or
 *        unknown duration with high titre): benzathine penicillin G
 *        2.4 MU IM single dose (1.2 MU per buttock).
 *        Late latent or unknown-duration low titre: 2.4 MU IM weekly × 3.
 *        Neurosyphilis: aqueous crystalline penicillin G 18–24 MU/day
 *        IV for 10–14 days.
 *        In pregnancy: same regimens; document partner notification
 *        and infant follow-up.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                    number ≥ 0
 *   context.pregnant                    boolean
 *   context.gestationalAgeWeeks         number (optional)
 *   context.syphilisScreenStatus        'done' | 'not-done' | null
 *   context.syphilisTestPositive        boolean | null
 *   context.treatmentGiven              boolean | null
 *   context.suspectedNeurosyphilis      boolean
 *   context.earlyVsLate                 'early' | 'late' | 'unknown'
 *   context.newStiDiagnosis             boolean
 *   context.keyPopulation               'sex-worker' | 'msm' | 'pwid'
 *                                       | 'transgender' | 'prisoner' | null
 *   context.knownPositiveContact        boolean
 *   context.recentGenitalUlcer          boolean
 *   context.penicillinAllergy           boolean
 */

const KEY_POPULATION_LABELS: Record<string, string> = {
  msm: 'men who have sex with men',
  'sex-worker': 'sex workers',
  pwid: 'people who inject drugs',
  transgender: 'transgender people',
  prisoner: 'people in prisons',
};

interface SyphilisContext {
  ageYears?: number;
  pregnant?: boolean;
  gestationalAgeWeeks?: number;
  syphilisScreenStatus?: 'done' | 'not-done' | null;
  syphilisTestPositive?: boolean | null;
  treatmentGiven?: boolean | null;
  suspectedNeurosyphilis?: boolean;
  earlyVsLate?: 'early' | 'late' | 'unknown';
  newStiDiagnosis?: boolean;
  keyPopulation?: string | null;
  knownPositiveContact?: boolean;
  recentGenitalUlcer?: boolean;
  penicillinAllergy?: boolean;
}

@Injectable()
export class SyphilisScreenStrategy implements CdsRuleStrategy {
  readonly type = 'syphilis-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as SyphilisContext;
    const cards: CdsCard[] = [];

    // 1. Confirmed positive → treatment guidance.
    if (ctx.syphilisTestPositive === true && ctx.treatmentGiven !== true) {
      cards.push(this.buildTreatmentCard(rule, req, ctx));
    }

    // 2. Pregnant + screen not done → universal-offer (mandatory).
    if (ctx.pregnant === true && ctx.syphilisScreenStatus !== 'done') {
      cards.push(
        this.buildCard(
          rule,
          req,
          'critical',
          'Antenatal syphilis screen is mandatory — offer rapid test today',
          'Pregnancy with no documented syphilis result this pregnancy. Per WHO STI Guidelines 2021 and Kenya MoH ANC ' +
            'profile, all pregnant women must be screened for syphilis at the first ANC contact (and re-screened in the ' +
            'third trimester in high-prevalence settings). Untreated maternal syphilis is associated with up to 50 % ' +
            'perinatal mortality. Offer a treponemal RDT today, with reflex RPR / VDRL titre if positive. Treat positives ' +
            'and notify the partner; arrange infant evaluation and follow-up testing at delivery.',
          {},
        ),
      );
    }

    // 3. Targeted offer.
    const strongReasons: string[] = [];
    if (ctx.newStiDiagnosis === true) strongReasons.push('new STI diagnosis this visit');
    if (typeof ctx.keyPopulation === 'string' && ctx.keyPopulation in KEY_POPULATION_LABELS) {
      strongReasons.push(`key population: ${KEY_POPULATION_LABELS[ctx.keyPopulation]}`);
    }
    if (ctx.knownPositiveContact === true) {
      strongReasons.push('sexual contact of a known syphilis-positive partner');
    }
    if (ctx.recentGenitalUlcer === true) strongReasons.push('recent genital ulcer');

    if (
      strongReasons.length > 0 &&
      ctx.syphilisTestPositive !== true &&
      ctx.syphilisScreenStatus !== 'done'
    ) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'Offer syphilis screen + HIV / hepatitis B & C',
          'Risk marker(s): {{reasons}}. Offer a treponemal RDT plus quantitative RPR / VDRL today; bundle with HIV testing ' +
            'and hepatitis B / C screening per WHO STI Guidelines and Kenya NASCOP recommendations. Counsel partner ' +
            'notification.',
          { reasons: strongReasons.join('; ') },
        ),
      );
    }

    return cards;
  }

  private buildTreatmentCard(rule: CdsRule, req: CdsHookRequest, ctx: SyphilisContext): CdsCard {
    const stage = ctx.suspectedNeurosyphilis === true ? 'neuro' : (ctx.earlyVsLate ?? 'unknown');
    const allergyLine =
      ctx.penicillinAllergy === true
        ? ' Penicillin allergy reported — desensitisation is the recommended approach in pregnancy and in neurosyphilis (no equivalent regimen). For non-pregnant patients with early disease, doxycycline 100 mg twice daily for 14 days is an alternative.'
        : '';
    const pregnancyLine =
      ctx.pregnant === true
        ? ' Pregnancy: same penicillin regimens apply; document partner notification and arrange infant evaluation at delivery + serology follow-up at 1, 3 and 6 months.'
        : '';

    let regimen: string;
    let summary: string;
    if (stage === 'neuro') {
      summary = 'Neurosyphilis suspected — IV penicillin × 10–14 days';
      regimen =
        'Aqueous crystalline penicillin G 18–24 MU/day IV (3–4 MU every 4 h OR continuous infusion) for 10–14 days. Refer urgently for inpatient management; consider a 7-day course of weekly benzathine penicillin 2.4 MU IM afterwards to complete the equivalent total dose.';
    } else if (stage === 'early') {
      summary = 'Early syphilis — single-dose benzathine penicillin G 2.4 MU IM';
      regimen =
        'Benzathine penicillin G 2.4 MU IM as a single dose (1.2 MU per buttock). Counsel about the Jarisch–Herxheimer reaction (fever, myalgia 6–8 h after the dose — manage with antipyretics; in pregnancy monitor for preterm labour).';
    } else if (stage === 'late') {
      summary = 'Late latent / late syphilis — benzathine penicillin G 2.4 MU IM weekly × 3';
      regimen =
        'Benzathine penicillin G 2.4 MU IM once weekly for 3 consecutive weeks. Counsel return-immediately signs if dose missed.';
    } else {
      summary = 'Syphilis confirmed (duration unknown) — treat as late stage';
      regimen =
        'When duration is unknown OR titre is low (RPR ≤ 1:8), treat as late latent: benzathine penicillin G 2.4 MU IM once weekly for 3 weeks. If the patient was tested or treated < 12 months ago AND the titre has risen ≥ 4-fold, manage as early disease (single 2.4 MU IM dose).';
    }

    const detail =
      'Positive syphilis screen. {{regimen}} Recheck RPR / VDRL titre at 3, 6 and 12 months — expect a 4-fold drop by 6 ' +
      'months (sero-fast response after that is acceptable). Notify and treat all sexual contacts from the preceding ' +
      '90 days. Screen for HIV, hepatitis B and C if not done.{{allergy}}{{pregnancy}}';

    return this.buildCard(rule, req, 'critical', summary, detail, {
      regimen,
      allergy: allergyLine,
      pregnancy: pregnancyLine,
    });
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
      label: 'WHO STI Guidelines for the management of T. pallidum (2021)',
      url: 'https://www.who.int/publications/i/item/9789240029446',
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
