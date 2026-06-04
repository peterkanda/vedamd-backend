import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Prevention of mother-to-child transmission (PMTCT) of HIV —
 * WHO 2021 consolidated ARV guidelines + Kenya NASCOP PMTCT
 * Algorithm 2022.
 *
 * Anonymous-by-design. The integrator supplies pregnancy / lactation
 * status, maternal HIV status (positive / negative / unknown), ART
 * status, latest viral load, infant status, and infant feeding
 * choice. The strategy returns guidance for whichever cohort applies:
 *
 *   1. CRITICAL — HIV-positive woman pregnant / breastfeeding and not
 *      yet on ART:
 *        Start TLD (tenofovir + lamivudine + dolutegravir) the same
 *        day. Baseline viral load + creatinine + CD4. Counsel
 *        lifelong adherence. Discuss infant prophylaxis at delivery
 *        (NVP +/- AZT).
 *
 *   2. CRITICAL — HIV-positive on ART but viral load not suppressed:
 *        Repeat viral load, intensive adherence counselling, drug-
 *        resistance testing if available, switch / optimise regimen
 *        per WHO. High vertical-transmission risk — infant gets dual
 *        prophylaxis 12 weeks (AZT + NVP).
 *
 *   3. WARNING — HIV-positive, virally suppressed, pregnant or
 *      breastfeeding:
 *        Continue TLD; viral load every trimester + at 6 wk
 *        post-partum + 6 monthly thereafter; infant single-drug
 *        prophylaxis (NVP) 6 weeks; early infant diagnosis at 6 wk,
 *        6 mo, 12 mo, plus final antibody test at 18 mo or 6 wk
 *        after breastfeeding stops.
 *
 *   4. CRITICAL — HIV-status unknown in pregnancy / labour /
 *      breastfeeding:
 *        Offer PITC today; if test positive start TLD same day.
 *
 *   5. WARNING — HIV-negative pregnant woman in serodiscordant
 *      partnership or with sustained exposure risk:
 *        PrEP (TDF/FTC) is safe in pregnancy; offer and counsel
 *        repeat HIV test each trimester + 6 wk post-partum +
 *        every 3 months while breastfeeding.
 *
 *   6. CRITICAL — HIV-exposed infant not on prophylaxis:
 *        Start age-banded NVP / AZT prophylaxis now per maternal-risk
 *        profile.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.pregnant                  boolean
 *   context.breastfeeding             boolean
 *   context.gestationalAgeWeeks       number
 *   context.maternalHivStatus         'positive' | 'negative' | 'unknown' | null
 *   context.onArt                     boolean
 *   context.artRegimen                string (e.g. 'TLD', 'EFV-based')
 *   context.viralLoadCopiesMl         number (optional)
 *   context.serodiscordantPartner     boolean
 *   context.exposureRiskOngoing       boolean
 *   context.infantHivExposed          boolean
 *   context.infantAgeWeeks            number (optional)
 *   context.infantProphylaxisStarted  boolean
 *   context.infantFeeding             'exclusive-breast' | 'mixed' | 'formula' | null
 *   context.creatinineUmolL           number (optional)
 */

const VL_SUPPRESSED = 1000;

interface PmtctContext {
  pregnant?: boolean;
  breastfeeding?: boolean;
  gestationalAgeWeeks?: number;
  maternalHivStatus?: 'positive' | 'negative' | 'unknown' | null;
  onArt?: boolean;
  artRegimen?: string;
  viralLoadCopiesMl?: number;
  serodiscordantPartner?: boolean;
  exposureRiskOngoing?: boolean;
  infantHivExposed?: boolean;
  infantAgeWeeks?: number;
  infantProphylaxisStarted?: boolean;
  infantFeeding?: 'exclusive-breast' | 'mixed' | 'formula' | null;
  creatinineUmolL?: number;
}

@Injectable()
export class PmtctStrategy implements CdsRuleStrategy {
  readonly type = 'pmtct';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as PmtctContext;
    const isPregOrBf = ctx.pregnant === true || ctx.breastfeeding === true;
    const cards: CdsCard[] = [];

    // 6. HIV-exposed infant not on prophylaxis.
    if (ctx.infantHivExposed === true && ctx.infantProphylaxisStarted !== true) {
      cards.push(this.infantProphylaxisCard(rule, req, ctx));
    }

    if (!isPregOrBf) return cards;

    // 4. Status unknown.
    if (ctx.maternalHivStatus === 'unknown' || ctx.maternalHivStatus == null) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'critical',
          'HIV status unknown in pregnancy / lactation — PITC today',
          'WHO + Kenya NASCOP require all pregnant and breastfeeding women to have a documented HIV result. Offer provider-initiated ' +
            'HIV testing and counselling now (rapid serial algorithm). If positive: start TLD (tenofovir 300 mg + lamivudine 300 mg ' +
            '+ dolutegravir 50 mg) once daily SAME DAY, baseline viral load + creatinine + CD4, draw blood for syphilis + HBsAg + ' +
            'haemoglobin, and plan infant prophylaxis at delivery. If negative: offer PrEP if ongoing risk (serodiscordant partner, ' +
            'sustained exposure); re-test each trimester, at delivery, at 6 weeks post-partum, then 3-monthly while breastfeeding.',
          {},
        ),
      );
      return cards;
    }

    // Maternal HIV-positive branches.
    if (ctx.maternalHivStatus === 'positive') {
      if (ctx.onArt !== true) {
        cards.push(this.startArtCard(rule, req, ctx));
      } else if (
        typeof ctx.viralLoadCopiesMl === 'number' &&
        ctx.viralLoadCopiesMl >= VL_SUPPRESSED
      ) {
        cards.push(this.unsuppressedCard(rule, req, ctx));
      } else {
        cards.push(this.suppressedFollowUpCard(rule, req, ctx));
      }
    }

    // Maternal HIV-negative with ongoing risk.
    if (
      ctx.maternalHivStatus === 'negative' &&
      (ctx.serodiscordantPartner === true || ctx.exposureRiskOngoing === true)
    ) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'HIV-negative with ongoing exposure — offer PrEP + scheduled retesting',
          'PrEP (tenofovir 300 mg / emtricitabine 200 mg once daily) is safe in pregnancy and breastfeeding (WHO 2021). Risk markers: ' +
            '{{reasons}}. Counsel adherence, screen renal function (creatinine, eGFR) before initiation, HBsAg before initiation ' +
            '(active hepatitis B → seek specialist advice), then 3-monthly HIV retest + renal monitoring. Re-test HIV each trimester ' +
            'AND at 6 weeks post-partum AND every 3 months while breastfeeding to detect seroconversion early.',
          {
            reasons: [
              ctx.serodiscordantPartner === true ? 'serodiscordant partnership' : null,
              ctx.exposureRiskOngoing === true ? 'sustained exposure risk' : null,
            ]
              .filter(Boolean)
              .join('; '),
          },
        ),
      );
    }

    return cards;
  }

  private startArtCard(rule: CdsRule, req: CdsHookRequest, ctx: PmtctContext): CdsCard {
    const renalNote =
      typeof ctx.creatinineUmolL === 'number' && ctx.creatinineUmolL > 110
        ? ` Creatinine ${ctx.creatinineUmolL} µmol/L (elevated) — confirm eGFR. If eGFR < 50, switch tenofovir component for abacavir or zidovudine after specialist review.`
        : '';
    return this.buildCard(
      rule,
      req,
      'critical',
      'HIV-positive pregnancy / lactation, ART naive — start TLD same day',
      'Start tenofovir 300 mg + lamivudine 300 mg + dolutegravir 50 mg (TLD) once daily TODAY. Baseline viral load, creatinine, CD4, ' +
        'haemoglobin, HBsAg, syphilis, cryptococcal antigen if CD4 < 200. Intensive adherence counselling + disclosure support. ' +
        'Schedule viral-load monitoring at month 3, month 6, then 6-monthly. Plan infant prophylaxis at delivery: high-risk profile ' +
        '(maternal VL > 1000 near delivery, last-trimester ART start) → infant gets dual AZT (4 mg/kg BD) + NVP for 12 weeks; lower ' +
        'risk → NVP only for 6 weeks. Early infant diagnosis (HIV DNA PCR) at 6 weeks, 6 months, 12 months + final antibody at 18 ' +
        'months or 6 weeks after breastfeeding stops.{{renal}}',
      { renal: renalNote },
    );
  }

  private unsuppressedCard(rule: CdsRule, req: CdsHookRequest, ctx: PmtctContext): CdsCard {
    return this.buildCard(
      rule,
      req,
      'critical',
      'HIV-positive on ART, viral load not suppressed — escalate management',
      `Viral load ${ctx.viralLoadCopiesMl?.toLocaleString('en-US')} copies/mL ≥ ${VL_SUPPRESSED.toLocaleString('en-US')}. Repeat viral load after intensive adherence ` +
        'counselling (3 sessions over 4–8 weeks) and recheck at week 12 of the enhanced adherence package. If still unsuppressed and ' +
        'on dolutegravir-based regimen, perform drug-resistance testing where available; if on EFV / NVP-based, switch to TLD per WHO ' +
        '2021. High vertical-transmission risk — infant prophylaxis is dual (AZT + NVP) for 12 weeks; consider scheduled caesarean ' +
        'if viral load remains > 1000 near delivery. Continue intensive viral-load monitoring every 3 months until suppressed.',
      {},
    );
  }

  private suppressedFollowUpCard(rule: CdsRule, req: CdsHookRequest, ctx: PmtctContext): CdsCard {
    const feedingLine =
      ctx.infantFeeding === 'mixed'
        ? ' Counsel against mixed feeding — exclusive breastfeeding (or exclusive formula) reduces transmission risk; mixed feeding increases gut permeability and transmission risk.'
        : ctx.infantFeeding === 'exclusive-breast'
          ? ' Exclusive breastfeeding for 6 months, complementary feeding from 6 months with continued breastfeeding to at least 12 months while maternal ART continues.'
          : ctx.infantFeeding === 'formula'
            ? ' If using formula, ensure AFASS (Acceptable, Feasible, Affordable, Sustainable, Safe) criteria can be met for the entire intended duration.'
            : '';
    const vlLine =
      typeof ctx.viralLoadCopiesMl === 'number'
        ? `Viral load ${ctx.viralLoadCopiesMl.toLocaleString('en-US')} copies/mL (suppressed).`
        : 'Suppressed.';
    return this.buildCard(
      rule,
      req,
      'warning',
      'HIV-positive virally suppressed — continue TLD + scheduled monitoring',
      `${vlLine} Continue TLD. Viral load each trimester + 6 weeks post-partum + 6-monthly thereafter. Infant single-drug NVP ` +
        'prophylaxis for 6 weeks (extended to 12 weeks if breastfeeding and any high-risk markers appear). Early-infant-diagnosis ' +
        'HIV DNA PCR at 6 weeks, 6 months, 12 months; final antibody at 18 months or 6 weeks after breastfeeding stops.{{feeding}}',
      { feeding: feedingLine },
    );
  }

  private infantProphylaxisCard(rule: CdsRule, req: CdsHookRequest, ctx: PmtctContext): CdsCard {
    const age = ctx.infantAgeWeeks;
    const window = typeof age === 'number' && age <= 6 ? 'within the 6-week window' : 'late but still indicated';
    return this.buildCard(
      rule,
      req,
      'critical',
      'HIV-exposed infant without prophylaxis — start nevirapine today',
      `Infant ${typeof age === 'number' ? age.toFixed(1) + ' weeks old' : 'age unknown'} (${window}). Start daily nevirapine syrup: ` +
        'birth–6 weeks at 15 mg (1.5 mL of 10 mg/mL); 6 weeks–6 months continue 20 mg (2 mL) daily. High-risk maternal profile (no ' +
        'ART, late ART, unsuppressed VL) → use dual prophylaxis (NVP + AZT 4 mg/kg twice daily) for 12 weeks. Start cotrimoxazole ' +
        'prophylaxis from 6 weeks. HIV DNA PCR at 6 weeks, 6 months, 12 months; antibody test at 18 months or 6 weeks after ' +
        'breastfeeding stops, whichever is later.',
      {},
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
      label: 'WHO — Consolidated guidelines on HIV prevention, testing, treatment, service delivery and monitoring (2021)',
      url: 'https://www.who.int/publications/i/item/9789240031593',
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
