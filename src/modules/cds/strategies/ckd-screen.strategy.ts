import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Chronic kidney disease (CKD) screening, staging, and management —
 * KDIGO 2024 CKD Evaluation & Management + WHO PEN HEARTS + Kenya
 * MoH NCD Guidelines.
 *
 * Sub-Saharan-Africa-relevant features:
 *   - Hypertensive nephrosclerosis and diabetic nephropathy are the
 *     dominant causes; HIVAN remains important.
 *   - APOL1 high-risk genotypes confer added susceptibility.
 *   - Schistosomiasis and chronic NSAID / herbal-medicine use are
 *     common reversible causes — always counsel.
 *
 * Workflow:
 *
 *   A. CRITICAL — KDIGO G4 / G5 (eGFR < 30 mL/min/1.73 m²) OR
 *      acute features (AKI, refractory hyperkalaemia, uraemia,
 *      fluid overload, severe acidosis):
 *        → Refer nephrology urgently. Avoid nephrotoxins (NSAIDs,
 *        aminoglycosides, IV contrast, herbal). Start prep for
 *        renal replacement therapy or conservative care.
 *
 *   B. CRITICAL — heavy proteinuria (uACR > 300 mg/g OR uPCR
 *      > 50 mg/mmol) OR rapid eGFR decline (> 5 mL/min/year):
 *        → Confirm cause (nephritic vs nephrotic; rule out HIVAN,
 *        diabetic nephropathy, post-infectious GN). Start ACE
 *        inhibitor / ARB at maximally tolerated dose. SGLT2
 *        inhibitor (dapagliflozin or empagliflozin) regardless of
 *        diabetes status when eGFR ≥ 20 and uACR ≥ 200 mg/g.
 *
 *   C. WARNING — KDIGO G3a / G3b (eGFR 30–59) AND / OR moderately
 *      increased albuminuria (uACR 30–300 mg/g):
 *        → Confirm chronicity (≥ 3 months). Optimise BP < 130/80,
 *        glycaemia, lipids; start ACE / ARB + SGLT2i when indicated;
 *        avoid nephrotoxins; vaccinate (influenza, pneumococcal,
 *        hepatitis B).
 *
 *   D. WARNING — high-risk screen-positive without documented
 *      eGFR / uACR:
 *        → Order serum creatinine + spot urine ACR today. Risk
 *        triggers: known hypertension, diabetes, HIV, age ≥ 60,
 *        family history of kidney disease, recurrent UTI / stones,
 *        long-term NSAID / herbal use.
 *
 *   E. INFO — adult with no risk markers, no recent screen:
 *        Routine screening is not universal but encouraged in
 *        hypertension / diabetes care.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears              number ≥ 18
 *   context.egfrMlMin             number (optional; KDIGO classification)
 *   context.creatinineUmolL       number (optional)
 *   context.uacrMgPerG            number (optional)
 *   context.uacrMgPerMmol         number (optional)
 *   context.upcrMgPerMmol         number (optional)
 *   context.proteinuriaDipstick   '-' | '+' | '++' | '+++' | null
 *   context.acuteFeatures         boolean (AKI, refractory hyperkalaemia,
 *                                  uraemia, fluid overload, severe
 *                                  acidosis)
 *   context.potassiumMmolL        number (optional)
 *   context.bicarbonateMmolL      number (optional)
 *   context.bpSystolicMmHg        number (optional)
 *   context.bpDiastolicMmHg       number (optional)
 *   context.knownHtn              boolean
 *   context.knownDiabetes         boolean
 *   context.hivStatus             'positive' | 'negative' | 'unknown' | null
 *   context.familyHistoryCkd      boolean
 *   context.longTermNsaidOrHerbal boolean
 *   context.recurrentUti          boolean
 *   context.kidneyStones          boolean
 *   context.priorEgfrMlMin        number (optional)
 *   context.priorEgfrAgeMonths    number (optional)
 *   context.diabetesPresent       boolean (informs SGLT2i indication)
 */

const KDIGO_G3A = 60;
const KDIGO_G3B = 45;
const KDIGO_G4 = 30;
const KDIGO_G5 = 15;

const ACR_A2_MIN = 30;
const ACR_A3_MIN = 300;

const KDIGO_DECLINE_THRESHOLD = 5; // mL/min/year

interface CkdContext {
  ageYears?: number;
  egfrMlMin?: number;
  creatinineUmolL?: number;
  uacrMgPerG?: number;
  uacrMgPerMmol?: number;
  upcrMgPerMmol?: number;
  proteinuriaDipstick?: '-' | '+' | '++' | '+++' | null;
  acuteFeatures?: boolean;
  potassiumMmolL?: number;
  bicarbonateMmolL?: number;
  bpSystolicMmHg?: number;
  bpDiastolicMmHg?: number;
  knownHtn?: boolean;
  knownDiabetes?: boolean;
  hivStatus?: 'positive' | 'negative' | 'unknown' | null;
  familyHistoryCkd?: boolean;
  longTermNsaidOrHerbal?: boolean;
  recurrentUti?: boolean;
  kidneyStones?: boolean;
  priorEgfrMlMin?: number;
  priorEgfrAgeMonths?: number;
  diabetesPresent?: boolean;
}

function uacrMgPerG(ctx: CkdContext): number | undefined {
  if (typeof ctx.uacrMgPerG === 'number') return ctx.uacrMgPerG;
  if (typeof ctx.uacrMgPerMmol === 'number') return ctx.uacrMgPerMmol * 8.84;
  return undefined;
}

function annualDecline(ctx: CkdContext): number | undefined {
  if (
    typeof ctx.egfrMlMin !== 'number' ||
    typeof ctx.priorEgfrMlMin !== 'number' ||
    typeof ctx.priorEgfrAgeMonths !== 'number' ||
    ctx.priorEgfrAgeMonths <= 0
  ) {
    return undefined;
  }
  const months = ctx.priorEgfrAgeMonths;
  const dropPerYear = ((ctx.priorEgfrMlMin - ctx.egfrMlMin) * 12) / months;
  return dropPerYear;
}

@Injectable()
export class CkdScreenStrategy implements CdsRuleStrategy {
  readonly type = 'ckd-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as CkdContext;
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < 18) return [];

    const egfr = ctx.egfrMlMin;
    const acr = uacrMgPerG(ctx);

    // A. G4–G5 or acute features.
    if (
      (typeof egfr === 'number' && egfr < KDIGO_G4) ||
      ctx.acuteFeatures === true ||
      (typeof ctx.potassiumMmolL === 'number' && ctx.potassiumMmolL >= 6.0) ||
      (typeof ctx.bicarbonateMmolL === 'number' && ctx.bicarbonateMmolL < 15)
    ) {
      return [this.severeCard(rule, req, ctx)];
    }

    // B. Heavy proteinuria or rapid decline.
    const heavyAcr = typeof acr === 'number' && acr >= ACR_A3_MIN;
    const heavyPcr = typeof ctx.upcrMgPerMmol === 'number' && ctx.upcrMgPerMmol >= 50;
    const dip3plus = ctx.proteinuriaDipstick === '+++';
    const decline = annualDecline(ctx);
    const rapidDecline = typeof decline === 'number' && decline > KDIGO_DECLINE_THRESHOLD;
    if (heavyAcr || heavyPcr || dip3plus || rapidDecline) {
      return [this.heavyProteinuriaCard(rule, req, ctx, acr, decline)];
    }

    // C. G3 or A2.
    const g3 = typeof egfr === 'number' && egfr < KDIGO_G3A;
    const a2 = typeof acr === 'number' && acr >= ACR_A2_MIN;
    if (g3 || a2) {
      return [this.moderateCard(rule, req, ctx, egfr, acr)];
    }

    // D. Risk markers without an eGFR / ACR pair.
    const noEgfr = typeof egfr !== 'number';
    const noAcr = typeof acr !== 'number';
    const riskMarkers: string[] = [];
    if (ctx.knownHtn === true) riskMarkers.push('known hypertension');
    if (ctx.knownDiabetes === true) riskMarkers.push('known diabetes');
    if (ctx.hivStatus === 'positive') riskMarkers.push('HIV-positive (HIVAN risk)');
    if (ctx.ageYears >= 60) riskMarkers.push(`age ${ctx.ageYears} y (≥ 60)`);
    if (ctx.familyHistoryCkd === true) riskMarkers.push('family history of kidney disease');
    if (ctx.longTermNsaidOrHerbal === true) riskMarkers.push('long-term NSAID or herbal use');
    if (ctx.recurrentUti === true) riskMarkers.push('recurrent UTI');
    if (ctx.kidneyStones === true) riskMarkers.push('kidney stones');

    if ((noEgfr || noAcr) && riskMarkers.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'CKD risk markers without recent screen — order eGFR + uACR today',
          'Risk marker(s): {{markers}}. KDIGO 2024 + WHO PEN recommend annual screening of high-risk adults with serum creatinine ' +
            '(eGFR by CKD-EPI 2021) AND spot urine albumin-creatinine ratio (uACR). Confirm any abnormal result at 3 months to ' +
            'distinguish AKI from CKD. Counsel hydration, blood-pressure control, and stop NSAIDs / nephrotoxic herbal preparations.',
          { markers: riskMarkers.join('; ') },
        ),
      ];
    }

    // E. INFO routine offer if no recent screen, no risk markers — silent for now.
    return [];
  }

  private severeCard(rule: CdsRule, req: CdsHookRequest, ctx: CkdContext): CdsCard {
    const reasons: string[] = [];
    if (typeof ctx.egfrMlMin === 'number') {
      reasons.push(`eGFR ${ctx.egfrMlMin.toFixed(0)} mL/min/1.73 m² (KDIGO G${ctx.egfrMlMin < KDIGO_G5 ? '5' : '4'})`);
    }
    if (ctx.acuteFeatures === true) reasons.push('acute features (AKI / uraemia / fluid overload)');
    if (typeof ctx.potassiumMmolL === 'number' && ctx.potassiumMmolL >= 6.0) {
      reasons.push(`K⁺ ${ctx.potassiumMmolL.toFixed(1)} mmol/L (≥ 6.0)`);
    }
    if (typeof ctx.bicarbonateMmolL === 'number' && ctx.bicarbonateMmolL < 15) {
      reasons.push(`HCO₃⁻ ${ctx.bicarbonateMmolL.toFixed(0)} mmol/L (< 15)`);
    }
    const hyperKalaemiaLine =
      typeof ctx.potassiumMmolL === 'number' && ctx.potassiumMmolL >= 6.0
        ? ' Hyperkalaemia bundle: ECG (peaked T-waves), IV 10 % calcium gluconate 10 mL over 5 min if ECG changes, insulin / dextrose ' +
          '(10 U regular insulin + 50 mL of 50 % dextrose IV), salbutamol nebuliser 10 mg, sodium bicarbonate IV if acidotic; ' +
          'definitive removal needs dialysis or sodium polystyrene sulfonate.'
        : '';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Advanced CKD or acute kidney emergency — urgent nephrology referral',
      'Reason(s): {{reasons}}. AVOID nephrotoxins (NSAIDs, aminoglycosides, IV iodinated contrast, herbal remedies). Review every ' +
        'medication for renal dosing (use eGFR-based dosing tables — e.g. metformin contraindicated at eGFR < 30). Treat reversible ' +
        'causes (obstruction by ultrasound, sepsis, volume depletion). Vaccinate against hepatitis B before dialysis access. ' +
        'Counsel patient and family on renal replacement therapy options (haemodialysis, peritoneal dialysis, transplantation) ' +
        'and conservative care pathway.{{hyperK}}',
      { reasons: reasons.join('; '), hyperK: hyperKalaemiaLine },
    );
  }

  private heavyProteinuriaCard(
    rule: CdsRule,
    req: CdsHookRequest,
    ctx: CkdContext,
    acr: number | undefined,
    decline: number | undefined,
  ): CdsCard {
    const reasons: string[] = [];
    if (typeof acr === 'number' && acr >= ACR_A3_MIN) {
      reasons.push(`uACR ${acr.toFixed(0)} mg/g (≥ ${ACR_A3_MIN}, KDIGO A3)`);
    }
    if (typeof ctx.upcrMgPerMmol === 'number' && ctx.upcrMgPerMmol >= 50) {
      reasons.push(`uPCR ${ctx.upcrMgPerMmol.toFixed(0)} mg/mmol (heavy proteinuria)`);
    }
    if (ctx.proteinuriaDipstick === '+++') {
      reasons.push('dipstick proteinuria +++ (semi-quantitative)');
    }
    if (typeof decline === 'number' && decline > KDIGO_DECLINE_THRESHOLD) {
      reasons.push(`eGFR decline ${decline.toFixed(1)} mL/min/year (> ${KDIGO_DECLINE_THRESHOLD})`);
    }
    const sglt2Line =
      typeof ctx.egfrMlMin !== 'number' || ctx.egfrMlMin >= 20
        ? ' Add SGLT2 inhibitor (dapagliflozin 10 mg or empagliflozin 10 mg once daily) — KDIGO 2024 endorses use with or without ' +
          'diabetes when eGFR ≥ 20 and uACR ≥ 200 mg/g for cardiorenal protection. Counsel sick-day rules (hold during AKI, vomiting, ' +
          'diarrhoea, anticipated surgery).'
        : '';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Heavy proteinuria or rapidly declining eGFR — workup + RAAS + SGLT2i',
      'Reason(s): {{reasons}}. Investigate cause: HIV (if status unknown), HBsAg, anti-HCV, ANA + complement (lupus nephritis), ' +
        'serum protein electrophoresis (myeloma), HbA1c, ultrasound (size, echogenicity, obstruction), urine microscopy for dysmorphic ' +
        'RBCs / casts. Start ACE inhibitor (enalapril 5 mg titrated to 20 mg twice daily) or ARB (losartan 50–100 mg once daily) at ' +
        'the maximally tolerated dose; check K⁺ and creatinine within 2 weeks of any dose change.{{sglt2}} Target BP < 130 / 80 mmHg. ' +
        'Referral to nephrology for biopsy if cause unclear or nephritic features (haematuria with dysmorphic RBCs / red-cell casts).',
      { reasons: reasons.join('; '), sglt2: sglt2Line },
    );
  }

  private moderateCard(
    rule: CdsRule,
    req: CdsHookRequest,
    ctx: CkdContext,
    egfr: number | undefined,
    acr: number | undefined,
  ): CdsCard {
    const stage =
      typeof egfr === 'number'
        ? egfr >= KDIGO_G3A
          ? 'G1–G2'
          : egfr >= KDIGO_G3B
            ? 'G3a'
            : 'G3b'
        : 'unstaged';
    const acrBand =
      typeof acr === 'number'
        ? acr < ACR_A2_MIN
          ? 'A1'
          : acr < ACR_A3_MIN
            ? 'A2'
            : 'A3'
        : 'unmeasured';
    const sglt2Line =
      ctx.diabetesPresent === true && typeof egfr === 'number' && egfr >= 20
        ? ' Add SGLT2 inhibitor (dapagliflozin / empagliflozin) for diabetic kidney disease — cardiorenal protection across the ' +
          'eGFR spectrum down to 20.'
        : '';
    return this.buildCard(
      rule,
      req,
      'warning',
      'Moderate CKD ({{stage}} / {{acr}}) — optimise risk factors + RAAS blockade',
      'Stage {{stage}}, albuminuria {{acr}}. Confirm chronicity by repeat at 3 months. Target BP < 130 / 80 mmHg; ACE inhibitor or ARB ' +
        'preferred (titrate to maximally tolerated dose; monitor K⁺ + creatinine 1–2 weeks after change). Glycaemic target HbA1c 6.5– ' +
        '7.5 % depending on frailty.{{sglt2}} Lipid management: moderate-intensity statin (atorvastatin 20 mg) for all CKD adults ≥ 50 y, ' +
        'and ≥ 18 y with diabetes / prior CV event. Avoid NSAIDs and nephrotoxic herbal preparations. Vaccinate (influenza annually, ' +
        'pneumococcal once, hepatitis B series). Annual review with repeat eGFR + uACR.',
      { stage, acr: acrBand, sglt2: sglt2Line },
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
      label: 'KDIGO 2024 Clinical Practice Guideline for the Evaluation & Management of CKD',
      url: 'https://kdigo.org/guidelines/ckd-evaluation-and-management/',
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
