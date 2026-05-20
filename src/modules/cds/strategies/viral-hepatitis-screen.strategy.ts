import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Viral hepatitis B & C screening + linkage (WHO 2024 Hepatitis
 * Testing & Treatment guidelines + Kenya MoH Viral Hepatitis
 * Strategic Plan).
 *
 * Anonymous-by-design: the integrator supplies risk markers, prior
 * test status, and (optionally) a positive result. No patient
 * identifiers cross the API.
 *
 * Ladder:
 *
 *   A. CRITICAL — HBsAg positive (treatment-naive) OR anti-HCV +
 *      HCV-RNA positive:
 *        → Linkage bundle: confirmatory viral load (HBV DNA / HCV RNA
 *          if not yet done), ALT / AST, platelet count + APRI / FIB-4
 *          for fibrosis staging, HIV co-infection screen, HBV /HCV
 *          co-infection screen, abdominal ultrasound. For HBV, start
 *          tenofovir if cirrhosis OR HBV DNA > 20 000 IU/mL with
 *          raised ALT; pregnant women with HBV DNA > 200 000 IU/mL
 *          start tenofovir from week 28 for prevention of vertical
 *          transmission. For HCV, refer for pan-genotypic direct-
 *          acting antiviral (sofosbuvir-velpatasvir 400/100 mg once
 *          daily for 12 weeks).
 *
 *   B. CRITICAL — pregnant + HBsAg status unknown:
 *        Universal antenatal HBsAg screening is recommended; offer
 *        the rapid test today. If positive, schedule birth-dose HBV
 *        vaccine for the infant within 24 h plus maternal antiviral
 *        if criteria met.
 *
 *   C. WARNING — high-risk and never tested:
 *        PLHIV, people who inject drugs, MSM, sex workers, prisoners,
 *        transfusion before screening era, healthcare workers with
 *        sharps exposure, household / sexual contacts of a known
 *        HBV/HCV-positive person, dialysis patients, children of
 *        HBsAg-positive mothers without documented birth-dose vaccine.
 *        → Offer HBsAg + anti-HCV rapid tests; bundle with HIV +
 *          syphilis screen.
 *
 *   D. INFO — adult never tested with no specific risk:
 *        WHO recommends one-time testing for HBV and HCV for the
 *        general adult population in endemic settings (HBsAg
 *        prevalence ≥ 2 %). Offer routine screening.
 *
 * Reads only:
 *
 *   context.ageYears                  number ≥ 0
 *   context.pregnant                  boolean
 *   context.gestationalAgeWeeks       number (optional)
 *   context.hbsAgStatus               'positive' | 'negative' | 'unknown' | null
 *   context.antiHcvStatus             'positive' | 'negative' | 'unknown' | null
 *   context.hcvRnaStatus              'positive' | 'negative' | 'unknown' | null
 *   context.hbvDnaIuPerMl             number (optional)
 *   context.altIuL                    number (optional)
 *   context.cirrhosisDocumented       boolean
 *   context.treatmentInitiated        boolean
 *   context.hivStatus                 'positive' | 'negative' | 'unknown' | null
 *   context.keyPopulation             'sex-worker' | 'msm' | 'pwid'
 *                                     | 'transgender' | 'prisoner' | null
 *   context.transfusionPreScreeningEra boolean
 *   context.healthcareSharpsExposure  boolean
 *   context.householdContactHbv       boolean
 *   context.dialysisPatient           boolean
 *   context.ageAdultScreenOffered     boolean (suppresses INFO once offered)
 */

const KEY_POPULATION_LABELS: Record<string, string> = {
  msm: 'men who have sex with men',
  'sex-worker': 'sex workers',
  pwid: 'people who inject drugs',
  transgender: 'transgender people',
  prisoner: 'people in prisons',
};

interface HepContext {
  ageYears?: number;
  pregnant?: boolean;
  gestationalAgeWeeks?: number;
  hbsAgStatus?: 'positive' | 'negative' | 'unknown' | null;
  antiHcvStatus?: 'positive' | 'negative' | 'unknown' | null;
  hcvRnaStatus?: 'positive' | 'negative' | 'unknown' | null;
  hbvDnaIuPerMl?: number;
  altIuL?: number;
  cirrhosisDocumented?: boolean;
  treatmentInitiated?: boolean;
  hivStatus?: 'positive' | 'negative' | 'unknown' | null;
  keyPopulation?: string | null;
  transfusionPreScreeningEra?: boolean;
  healthcareSharpsExposure?: boolean;
  householdContactHbv?: boolean;
  dialysisPatient?: boolean;
  ageAdultScreenOffered?: boolean;
}

const HBV_TREATMENT_DNA_THRESHOLD = 20_000;
const HBV_PREGNANCY_DNA_THRESHOLD = 200_000;

@Injectable()
export class ViralHepatitisScreenStrategy implements CdsRuleStrategy {
  readonly type = 'viral-hepatitis-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as HepContext;
    const cards: CdsCard[] = [];

    // A1. HBV positive, not yet on treatment.
    if (ctx.hbsAgStatus === 'positive' && ctx.treatmentInitiated !== true) {
      cards.push(this.buildHbvCard(rule, req, ctx));
    }

    // A2. HCV positive (RNA-confirmed if available; antibody alone if not).
    const hcvActive =
      ctx.hcvRnaStatus === 'positive' ||
      (ctx.antiHcvStatus === 'positive' && ctx.hcvRnaStatus !== 'negative');
    if (hcvActive && ctx.treatmentInitiated !== true) {
      cards.push(this.buildHcvCard(rule, req, ctx));
    }

    // B. Pregnant + HBsAg unknown — universal antenatal offer.
    if (
      ctx.pregnant === true &&
      (ctx.hbsAgStatus === 'unknown' || ctx.hbsAgStatus == null)
    ) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'critical',
          'Antenatal HBV screen is universal — offer HBsAg rapid test today',
          'Pregnancy with no documented HBsAg result. WHO recommends universal antenatal HBsAg testing at the first ANC ' +
            'contact. If positive: confirm HBV DNA, ALT, abdominal ultrasound; schedule infant birth-dose HBV vaccine within ' +
            '24 h of delivery plus HBIG where available; start maternal tenofovir from week 28 if HBV DNA > {{thresh}} IU/mL ' +
            'to prevent perinatal transmission. Bundle with HIV + syphilis + anti-HCV testing.',
          { thresh: HBV_PREGNANCY_DNA_THRESHOLD.toLocaleString('en-US') },
        ),
      );
    }

    // C. High-risk + never tested.
    const riskReasons: string[] = [];
    if (typeof ctx.keyPopulation === 'string' && ctx.keyPopulation in KEY_POPULATION_LABELS) {
      riskReasons.push(`key population: ${KEY_POPULATION_LABELS[ctx.keyPopulation]}`);
    }
    if (ctx.hivStatus === 'positive') riskReasons.push('HIV-positive');
    if (ctx.transfusionPreScreeningEra === true) {
      riskReasons.push('transfusion before universal blood-bank screening');
    }
    if (ctx.healthcareSharpsExposure === true) {
      riskReasons.push('healthcare-worker sharps exposure');
    }
    if (ctx.householdContactHbv === true) {
      riskReasons.push('household / sexual contact of an HBV-positive person');
    }
    if (ctx.dialysisPatient === true) riskReasons.push('chronic dialysis');

    const screenNotDone =
      (ctx.hbsAgStatus !== 'positive' && ctx.hbsAgStatus !== 'negative') ||
      (ctx.antiHcvStatus !== 'positive' && ctx.antiHcvStatus !== 'negative');

    if (riskReasons.length > 0 && screenNotDone && ctx.pregnant !== true) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'Offer HBV + HCV screen for elevated risk',
          'Risk marker(s): {{reasons}}. Offer HBsAg + anti-HCV rapid tests today; reflex HCV RNA where anti-HCV is positive. ' +
            'Bundle with HIV + syphilis screening per WHO testing recommendations. Vaccinate HBV-non-immune adults (the ' +
            'Kenya EPI schedule covers infants; adults at risk need a 3-dose course at 0, 1 and 6 months).',
          { reasons: riskReasons.join('; ') },
        ),
      );
    }

    // D. Routine adult offer (endemic setting).
    const noRiskScreening =
      riskReasons.length === 0 &&
      ctx.pregnant !== true &&
      typeof ctx.ageYears === 'number' &&
      ctx.ageYears >= 18 &&
      ctx.hbsAgStatus !== 'positive' &&
      ctx.hbsAgStatus !== 'negative' &&
      ctx.ageAdultScreenOffered !== true;

    if (noRiskScreening) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'info',
          'Offer one-time HBV / HCV testing — adult in endemic setting',
          'Sub-Saharan Africa is an HBV-endemic region (HBsAg seroprevalence ≥ 5 % in most countries). WHO recommends a ' +
            'one-time test for HBV and HCV for all adults in endemic settings. Counsel and offer the rapid tests when ' +
            'capacity allows; result handling pathway should already be in place.',
          {},
        ),
      );
    }

    return cards;
  }

  private buildHbvCard(rule: CdsRule, req: CdsHookRequest, ctx: HepContext): CdsCard {
    const dna = ctx.hbvDnaIuPerMl;
    const alt = ctx.altIuL;
    let regimen: string;
    let summary: string;
    if (ctx.cirrhosisDocumented === true) {
      summary = 'HBsAg-positive with cirrhosis — start tenofovir now';
      regimen =
        'Tenofovir disoproxil fumarate 300 mg orally once daily lifelong (or tenofovir alafenamide 25 mg where available, ' +
        'preferred for renal / bone safety). HBV treatment in cirrhosis is independent of HBV DNA or ALT level. Add 6-monthly ' +
        'AFP + abdominal ultrasound surveillance for hepatocellular carcinoma.';
    } else if (
      typeof dna === 'number' &&
      dna > HBV_TREATMENT_DNA_THRESHOLD &&
      typeof alt === 'number' &&
      alt > 40
    ) {
      summary = 'HBsAg-positive with active disease — start tenofovir';
      regimen =
        `HBV DNA ${dna.toLocaleString('en-US')} IU/mL with ALT ${alt} IU/L (> ULN) meets WHO treatment criteria. Start ` +
        'tenofovir disoproxil fumarate 300 mg orally once daily; reassess ALT, HBV DNA, eGFR at 3 and 6 months. Counsel ' +
        'lifelong therapy and household HBV testing + vaccination of non-immune contacts.';
    } else if (ctx.pregnant === true && typeof dna === 'number' && dna > HBV_PREGNANCY_DNA_THRESHOLD) {
      summary = 'HBsAg-positive in pregnancy with high viral load — start tenofovir at 28 weeks';
      regimen =
        `Maternal HBV DNA ${dna.toLocaleString('en-US')} IU/mL exceeds the WHO threshold (${HBV_PREGNANCY_DNA_THRESHOLD.toLocaleString('en-US')} IU/mL) for prevention of vertical transmission. Start tenofovir disoproxil fumarate 300 mg from week 28 and continue to delivery (or per local protocol). Ensure the infant ` +
        'gets HBV vaccine within 24 h of birth plus HBIG where available.';
    } else {
      summary = 'HBsAg-positive — confirm disease status, monitor 6-monthly';
      regimen =
        'Treatment criteria not yet met. Stage with HBV DNA, ALT, platelets (APRI / FIB-4), abdominal ultrasound, HIV + HCV ' +
        'co-infection screen. Monitor ALT and HBV DNA every 6 months; treat if cirrhosis develops, HBV DNA > 20 000 IU/mL ' +
        'with raised ALT, or extrahepatic manifestations appear. Vaccinate non-immune household / sexual contacts.';
    }
    return this.buildCard(
      rule,
      req,
      'critical',
      summary,
      'HBsAg-positive (treatment-naive). {{regimen}} Refer to the hepatitis treatment site if your facility is not ' +
        'authorised to initiate tenofovir. Counsel alcohol avoidance and avoid hepatotoxins (high-dose paracetamol, herbal ' +
        'remedies).',
      { regimen },
    );
  }

  private buildHcvCard(rule: CdsRule, req: CdsHookRequest, _ctx: HepContext): CdsCard {
    return this.buildCard(
      rule,
      req,
      'critical',
      'HCV active infection — link to direct-acting antiviral therapy',
      'Active hepatitis C (anti-HCV positive with HCV RNA detectable, or RNA-positive standalone). WHO 2024 recommends ' +
        'pan-genotypic direct-acting antivirals as first-line: sofosbuvir 400 mg + velpatasvir 100 mg orally once daily for ' +
        '12 weeks (24 weeks with ribavirin if decompensated cirrhosis), OR sofosbuvir + daclatasvir 60 mg once daily for ' +
        '12 weeks. Cure rates are > 95 %. Stage fibrosis with APRI / FIB-4; arrange HCV RNA at week 12 post-treatment for ' +
        'sustained virologic response (SVR12). Screen for HBV and HIV co-infection. Counsel against alcohol and prevent ' +
        're-infection (single-use injection equipment, harm reduction).',
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
      label: 'WHO Hepatitis B & C testing and treatment guidelines (2024)',
      url: 'https://www.who.int/teams/global-hiv-hepatitis-and-stis-programmes/hepatitis',
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
