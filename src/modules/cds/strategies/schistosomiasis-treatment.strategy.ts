import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator, CodedReference } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Schistosomiasis — diagnosis confirmation + praziquantel treatment +
 * mass-drug-administration eligibility.
 *
 *   Built from: WHO Guideline on Control and Elimination of Human
 *   Schistosomiasis (2022), WHO/UNICEF mass-drug administration
 *   guidance, CDC Schistosomiasis Clinical Guidance, Kenya MoH
 *   National Schistosomiasis & STH Strategic Plan.
 *
 * Anonymous-by-design. The integrator confirms exposure to fresh
 * water in an endemic area + a recognised clinical picture, OR a
 * positive diagnostic test. The strategy returns:
 *
 *   1. CRITICAL — Katayama fever (acute schistosomiasis):
 *        fever 4–8 weeks post-exposure + urticaria + eosinophilia
 *        + cough / hepatosplenomegaly. Treat with corticosteroids
 *        FIRST, then praziquantel 2–4 weeks later.
 *
 *   2. CRITICAL — severe / complicated schistosomiasis:
 *        neuroschistosomiasis (transverse myelitis, seizures, focal
 *        neurology), severe portal hypertension with variceal bleed,
 *        massive haematuria with shock, obstructive uropathy.
 *
 *   3. CRITICAL — confirmed infection (egg / antigen / serology
 *        positive) — start praziquantel today:
 *        S. mansoni / haematobium / intercalatum / guineensis:
 *          40 mg/kg single oral dose (or 20 mg/kg twice 4–6 h apart).
 *        S. japonicum / mekongi:
 *          60 mg/kg single dose (or 30 mg/kg twice 4–6 h apart).
 *
 *   4. WARNING — high clinical suspicion (endemic exposure + typical
 *        symptoms) without confirmed diagnosis: send urine
 *        microscopy / stool ova-cyst-parasite / circulating cathodic
 *        antigen (CCA) / serology; empirical treatment is reasonable
 *        in heavily endemic settings.
 *
 *   5. INFO — mass-drug-administration eligibility:
 *        ages 5–14 in endemic communities receive yearly
 *        praziquantel 40 mg/kg via WHO MDA. WHO 2022 also includes
 *        community-wide MDA for high-prevalence settings (≥ 10 %).
 *        Pregnant women may receive praziquantel after the first
 *        trimester per WHO 2006 recommendation.
 *
 * Anonymous context:
 *
 *   suspectedSchistosomiasis        boolean (sentinel)
 *   ageYears                        number
 *   weightKg                        number (for dose)
 *   pregnant                        boolean
 *   gestationalAgeWeeks             number (informational)
 *   freshwaterContactWeeksAgo       number (4–8 = Katayama window)
 *   speciesSuspected                'mansoni' | 'haematobium' | 'japonicum'
 *                                    | 'mekongi' | 'intercalatum' | 'guineensis' | null
 *   diagnosticConfirmed             boolean (positive egg / antigen / serology)
 *   katayamaFeatures                boolean (fever + urticaria + eosinophilia)
 *   eosinophilCount                 number (×10⁹/L, optional)
 *   neuroSchistoSuspected           boolean (myelitis / seizures / focal signs)
 *   portalHypertensionVariceal      boolean
 *   massiveHaematuriaShock          boolean
 *   obstructiveUropathy             boolean
 *   endemicAreaResidence            boolean (for MDA eligibility)
 *   priorPraziquantelLastYear       boolean
 */

interface SchistoContext {
  suspectedSchistosomiasis?: boolean;
  ageYears?: number;
  weightKg?: number;
  pregnant?: boolean;
  gestationalAgeWeeks?: number;
  freshwaterContactWeeksAgo?: number;
  speciesSuspected?: 'mansoni' | 'haematobium' | 'japonicum' | 'mekongi' | 'intercalatum' | 'guineensis' | null;
  diagnosticConfirmed?: boolean;
  katayamaFeatures?: boolean;
  eosinophilCount?: number;
  neuroSchistoSuspected?: boolean;
  portalHypertensionVariceal?: boolean;
  massiveHaematuriaShock?: boolean;
  obstructiveUropathy?: boolean;
  endemicAreaResidence?: boolean;
  priorPraziquantelLastYear?: boolean;
}

const CODINGS_SCHISTO: CodedReference[] = [
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'B65', display: 'Schistosomiasis (bilharziasis)', kind: 'diagnosis' },
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'B65.0', display: 'Schistosomiasis due to Schistosoma haematobium (urinary)', kind: 'diagnosis' },
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'B65.1', display: 'Schistosomiasis due to Schistosoma mansoni (intestinal)', kind: 'diagnosis' },
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'B65.2', display: 'Schistosomiasis due to Schistosoma japonicum', kind: 'diagnosis' },
  { system: 'http://id.who.int/icd/release/11/mms', code: '1F86', display: 'Schistosomiasis', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '32517009', display: 'Schistosomiasis (disorder)', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '76271006', display: 'Schistosomiasis haematobium (disorder)', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '24378007', display: 'Schistosomiasis mansoni (disorder)', kind: 'diagnosis' },
  { system: 'http://whocc.no/atc', code: 'P02BA01', display: 'Praziquantel', kind: 'drug' },
];

function praziDose(species: SchistoContext['speciesSuspected'], wt?: number): { total: string; pattern: string } {
  const isJaponicumOrMekongi = species === 'japonicum' || species === 'mekongi';
  const mgPerKg = isJaponicumOrMekongi ? 60 : 40;
  if (typeof wt !== 'number') {
    return {
      total: `${mgPerKg} mg/kg (single dose, with food)`,
      pattern: isJaponicumOrMekongi
        ? '60 mg/kg total (S. japonicum / mekongi): give as 30 mg/kg twice 4–6 hours apart with food.'
        : '40 mg/kg single dose with food, OR 20 mg/kg twice 4–6 hours apart for better tolerability.',
    };
  }
  const total = Math.round(mgPerKg * wt);
  return {
    total: `${total} mg total (${mgPerKg} mg/kg × ${wt} kg)`,
    pattern: isJaponicumOrMekongi
      ? `S. japonicum / mekongi 60 mg/kg: give ${Math.round(total / 2)} mg twice 4–6 hours apart with food.`
      : `${total} mg as a single dose with food, OR ${Math.round(total / 2)} mg twice 4–6 hours apart for better tolerability.`,
  };
}

@Injectable()
export class SchistosomiasisTreatmentStrategy implements CdsRuleStrategy {
  readonly type = 'schistosomiasis-treatment';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as SchistoContext;
    if (ctx.suspectedSchistosomiasis !== true) return [];

    // 2. Severe complicated.
    const severeReasons: string[] = [];
    if (ctx.neuroSchistoSuspected === true) severeReasons.push('neuroschistosomiasis (myelitis / seizures / focal neurology)');
    if (ctx.portalHypertensionVariceal === true) severeReasons.push('portal hypertension with variceal bleeding');
    if (ctx.massiveHaematuriaShock === true) severeReasons.push('massive haematuria with shock');
    if (ctx.obstructiveUropathy === true) severeReasons.push('obstructive uropathy');
    if (severeReasons.length > 0) {
      return [this.complicatedCard(rule, req, ctx, severeReasons)];
    }

    // 1. Katayama fever.
    if (ctx.katayamaFeatures === true ||
      (typeof ctx.freshwaterContactWeeksAgo === 'number' &&
        ctx.freshwaterContactWeeksAgo >= 3 &&
        ctx.freshwaterContactWeeksAgo <= 10 &&
        (typeof ctx.eosinophilCount === 'number' && ctx.eosinophilCount >= 1.0))) {
      return [this.katayamaCard(rule, req, ctx)];
    }

    // 3. Confirmed infection → praziquantel.
    if (ctx.diagnosticConfirmed === true) {
      return [this.confirmedTreatmentCard(rule, req, ctx)];
    }

    // 4. High suspicion without confirmation.
    if (typeof ctx.freshwaterContactWeeksAgo === 'number' && ctx.freshwaterContactWeeksAgo > 0) {
      return [this.empiricalCard(rule, req, ctx)];
    }

    // 5. MDA eligibility.
    if (ctx.endemicAreaResidence === true && ctx.priorPraziquantelLastYear !== true) {
      return [this.mdaCard(rule, req, ctx)];
    }

    return [];
  }

  private complicatedCard(rule: CdsRule, req: CdsHookRequest, ctx: SchistoContext, reasons: string[]): CdsCard {
    const dose = praziDose(ctx.speciesSuspected, ctx.weightKg);
    return this.buildCard(
      rule,
      req,
      'critical',
      'Complicated schistosomiasis — admit + specialist referral + supportive care',
      'Severe feature(s): {{reasons}}. Bundle (WHO 2022 + CDC clinical guidance): (1) ABC + resuscitate as for the active ' +
        'complication (variceal bleed: terlipressin / octreotide + endoscopic banding; obstructive uropathy: catheter / nephrostomy ' +
        '+ urology; neuroschistosomiasis: prednisolone 1 mg/kg/day to suppress granulomatous inflammation in the spinal cord / ' +
        'brain). (2) Praziquantel at standard dose IS still required for cure: {{dose}}. {{pattern}} Counsel patient that ' +
        'praziquantel may transiently worsen neurological symptoms — start ONLY after corticosteroid cover is established. ' +
        '(3) Investigate cause: ultrasound (bladder / liver / portal vein), MRI spine / brain for neuroschistosomiasis, urine + ' +
        'stool for ova, urine CCA, schistosomal serology. (4) Multidisciplinary follow-up: urology, hepatology, neurology. ' +
        '(5) Treat household members and screen contacts. (6) Health-education on safe water practices.',
      { reasons: reasons.join('; '), dose: dose.total, pattern: dose.pattern },
      CODINGS_SCHISTO,
    );
  }

  private katayamaCard(rule: CdsRule, req: CdsHookRequest, ctx: SchistoContext): CdsCard {
    const dose = praziDose(ctx.speciesSuspected, ctx.weightKg);
    return this.buildCard(
      rule,
      req,
      'critical',
      'Katayama fever (acute schistosomiasis) — corticosteroids FIRST then praziquantel',
      'Acute schistosomiasis syndrome at 4–8 weeks post-exposure (fever, urticaria, eosinophilia, cough, hepatosplenomegaly). ' +
        '(1) Start prednisolone 1 mg/kg/day orally for 5–7 days to suppress the hypersensitivity response. (2) Praziquantel is ' +
        'LESS EFFECTIVE during the acute phase (immature worms) and may paradoxically worsen symptoms — defer the curative course ' +
        'until 6–12 weeks after exposure, then give {{dose}}. {{pattern}} (3) Investigate: full blood count + differential ' +
        '(eosinophilia), LFTs, schistosomal serology (ELISA), urine + stool ova, abdominal ultrasound. (4) Counsel: rest, oral ' +
        'fluids, antihistamines for urticaria, avoid further freshwater exposure. (5) Travel-medicine notification where ' +
        'applicable.',
      { dose: dose.total, pattern: dose.pattern },
      CODINGS_SCHISTO,
    );
  }

  private confirmedTreatmentCard(rule: CdsRule, req: CdsHookRequest, ctx: SchistoContext): CdsCard {
    const dose = praziDose(ctx.speciesSuspected, ctx.weightKg);
    const pregLine =
      ctx.pregnant === true
        ? (typeof ctx.gestationalAgeWeeks === 'number' && ctx.gestationalAgeWeeks < 14
          ? ' Pregnancy ≤ 14 weeks: defer praziquantel until the second trimester unless severe schistosomiasis warrants immediate treatment. (Pregnancy is no longer a contraindication per WHO 2006 / 2022; safety data are extensive.)'
          : ' Pregnancy ≥ 14 weeks: praziquantel is safe and recommended. Same standard dose applies.')
        : '';
    const speciesLine = ctx.speciesSuspected
      ? `Species: ${ctx.speciesSuspected}.`
      : 'Species not stated — assume 40 mg/kg standard regimen (most common SSA species are S. haematobium and S. mansoni).';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Confirmed schistosomiasis — single-day praziquantel cure',
      '{{species}} Treatment: {{dose}}. {{pattern}} Give with food (improves bioavailability + reduces dizziness). Common side ' +
        'effects: nausea, abdominal pain, dizziness, urticaria — resolve within 24 hours. Counsel against driving for 12 hours ' +
        'after the dose. Re-check eggs / antigen at 8–12 weeks; if positive, give a second course (efficacy is ~85 %). Screen and ' +
        'treat all household / school / fishing-community contacts. Counsel safe-water practices (no swimming, washing, fishing in ' +
        'lakes or slow-moving fresh water in endemic areas; if contact unavoidable, dry skin within 10 minutes of contact with a ' +
        'rough towel).{{preg}}',
      { species: speciesLine, dose: dose.total, pattern: dose.pattern, preg: pregLine },
      CODINGS_SCHISTO,
    );
  }

  private empiricalCard(rule: CdsRule, req: CdsHookRequest, ctx: SchistoContext): CdsCard {
    return this.buildCard(
      rule,
      req,
      'warning',
      'Clinical suspicion of schistosomiasis — confirm and treat (empirical treatment reasonable in endemic settings)',
      `Freshwater contact ${ctx.freshwaterContactWeeksAgo} weeks ago in an endemic area. Send confirmatory tests: urine microscopy ` +
        '(centrifuged or 10 mL of urine concentrated for S. haematobium eggs — best between 10 am and 2 pm), stool ova-cyst-parasite ' +
        '(Kato-Katz, S. mansoni), urine circulating cathodic antigen (CCA) point-of-care test where available, schistosomal serology ' +
        '(ELISA). In high-burden settings, empirical praziquantel 40 mg/kg single dose is reasonable BEFORE results return — the ' +
        'drug is cheap, well-tolerated, and treats most species. Counsel safe-water practices and avoid further freshwater contact.',
      {},
      CODINGS_SCHISTO,
    );
  }

  private mdaCard(rule: CdsRule, req: CdsHookRequest, ctx: SchistoContext): CdsCard {
    const ageBand =
      typeof ctx.ageYears === 'number' && ctx.ageYears >= 5 && ctx.ageYears <= 14
        ? 'school-age (5–14 y) — primary target group for WHO MDA.'
        : typeof ctx.ageYears === 'number' && ctx.ageYears < 5
          ? 'pre-school (< 5 y) — WHO 2022 also recommends MDA for preschool children where prevalence ≥ 10 % using paediatric praziquantel.'
          : 'adult — WHO 2022 expands MDA to adults in high-prevalence (≥ 10 %) settings.';
    return this.buildCard(
      rule,
      req,
      'info',
      'Mass drug administration eligibility — yearly praziquantel in endemic community',
      `Endemic residence + no praziquantel in the past 12 months. ${ageBand} Offer praziquantel 40 mg/kg single dose (or 60 mg/kg ` +
        'for S. japonicum / mekongi areas) with food. Add health-education: safe water and sanitation, latrine use to break the ' +
        'lifecycle, snail-control programmes, avoid bathing / fishing in infested water. Integrate with deworming for soil-transmitted ' +
        'helminths (albendazole 400 mg single dose) where co-endemic.',
      {},
      CODINGS_SCHISTO,
    );
  }

  private buildCard(
    rule: CdsRule,
    req: CdsHookRequest,
    indicator: CdsIndicator,
    defaultSummary: string,
    defaultDetail: string,
    vars: Record<string, string | number | boolean | null | undefined>,
    codings: CodedReference[],
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label: 'WHO Guideline on Control and Elimination of Human Schistosomiasis (2022)',
      url: 'https://www.who.int/publications/i/item/9789240041608',
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
          codings,
        },
      },
    };
  }
}
