import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Gestational diabetes mellitus (GDM) screening + diagnosis +
 * initial management — WHO 2013/2024 hyperglycaemia-in-pregnancy
 * criteria + IADPSG thresholds; FIGO 2015 management algorithm;
 * Kenya MoH National Maternal Health Guidelines.
 *
 * Workflow:
 *
 *   A. CRITICAL — overt diabetes in pregnancy at first ANC contact:
 *        FPG ≥ 7.0 mmol/L OR random ≥ 11.1 mmol/L OR HbA1c ≥ 6.5 %.
 *        Behave as type-2 diabetes — start insulin immediately,
 *        retinal + renal screen, refer to combined obstetric +
 *        diabetes clinic.
 *
 *   B. CRITICAL — GDM diagnosed by 75 g OGTT (24–28 weeks):
 *        Any one of FPG ≥ 5.1, 1-h ≥ 10.0, 2-h ≥ 8.5 mmol/L.
 *        Treatment ladder: medical nutrition therapy + activity for
 *        1–2 weeks; if not at target (FPG < 5.3 and 1-h post-prandial
 *        < 7.8 OR 2-h post-prandial < 6.7 in ≥ 80 % of readings),
 *        add metformin or insulin.
 *
 *   C. WARNING — high-risk + 24–28 weeks reached + OGTT not done:
 *        Risk factors: previous GDM, previous macrosomic infant
 *        (≥ 4 kg), BMI ≥ 30, first-degree relative with diabetes,
 *        age ≥ 35, PCOS, glycosuria, current pregnancy
 *        polyhydramnios / macrosomia, ethnic high-risk population.
 *
 *   D. INFO — pregnant + 24–28 weeks AND no risk factors: routine
 *        universal OGTT in keeping with WHO 2013 recommendation for
 *        endemic / high-prevalence regions.
 *
 * Reads only:
 *
 *   context.pregnant                    boolean
 *   context.gestationalAgeWeeks         number
 *   context.firstAncContact             boolean
 *   context.fastingGlucoseMmolL         number (optional)
 *   context.randomGlucoseMmolL          number (optional)
 *   context.hba1cPercent                number (optional)
 *   context.ogtt75gFasting              number (optional)
 *   context.ogtt75g1h                   number (optional)
 *   context.ogtt75g2h                   number (optional)
 *   context.smbgAboveTargetPercent      number (optional, 0..100, post-MNT)
 *   context.previousGdm                 boolean
 *   context.previousMacrosomicInfant    boolean
 *   context.bmi                         number (optional)
 *   context.familyHistoryDiabetes       boolean
 *   context.ageYears                    number
 *   context.pcosKnown                   boolean
 *   context.glycosuriaPresent           boolean
 *   context.polyhydramniosOrMacrosomia  boolean
 *   context.mntTrialCompleted           boolean
 */

const OVERT_FPG = 7.0;
const OVERT_RANDOM = 11.1;
const OVERT_HBA1C = 6.5;

const OGTT_FPG = 5.1;
const OGTT_1H = 10.0;
const OGTT_2H = 8.5;

const ABOVE_TARGET_PERCENT_TRIGGER = 20;

const SCREEN_WINDOW_START = 24;
const SCREEN_WINDOW_END = 28;

const ELEVATED_BMI = 30;
const ELEVATED_AGE = 35;

interface GdmContext {
  pregnant?: boolean;
  gestationalAgeWeeks?: number;
  firstAncContact?: boolean;
  fastingGlucoseMmolL?: number;
  randomGlucoseMmolL?: number;
  hba1cPercent?: number;
  ogtt75gFasting?: number;
  ogtt75g1h?: number;
  ogtt75g2h?: number;
  smbgAboveTargetPercent?: number;
  previousGdm?: boolean;
  previousMacrosomicInfant?: boolean;
  bmi?: number;
  familyHistoryDiabetes?: boolean;
  ageYears?: number;
  pcosKnown?: boolean;
  glycosuriaPresent?: boolean;
  polyhydramniosOrMacrosomia?: boolean;
  mntTrialCompleted?: boolean;
}

@Injectable()
export class GdmScreenStrategy implements CdsRuleStrategy {
  readonly type = 'gdm-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as GdmContext;
    if (ctx.pregnant !== true) return [];

    // A. Overt diabetes in pregnancy at first contact.
    const overtReasons: string[] = [];
    if (typeof ctx.fastingGlucoseMmolL === 'number' && ctx.fastingGlucoseMmolL >= OVERT_FPG) {
      overtReasons.push(`FPG ${ctx.fastingGlucoseMmolL.toFixed(1)} mmol/L (≥ ${OVERT_FPG})`);
    }
    if (typeof ctx.randomGlucoseMmolL === 'number' && ctx.randomGlucoseMmolL >= OVERT_RANDOM) {
      overtReasons.push(
        `random glucose ${ctx.randomGlucoseMmolL.toFixed(1)} mmol/L (≥ ${OVERT_RANDOM})`,
      );
    }
    if (typeof ctx.hba1cPercent === 'number' && ctx.hba1cPercent >= OVERT_HBA1C) {
      overtReasons.push(`HbA1c ${ctx.hba1cPercent.toFixed(1)}% (≥ ${OVERT_HBA1C}%)`);
    }
    if (overtReasons.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Overt diabetes in pregnancy — treat as type-2 diabetes',
          'Threshold(s) met: {{reasons}}. WHO 2013 / IADPSG: glycaemia at these levels at any point in pregnancy is overt ' +
            'diabetes (not GDM) and warrants the same management as pre-pregnancy type-2 diabetes. Stop any oral hypoglycaemics ' +
            'other than metformin; start insulin (basal + prandial regimen) targeting fasting < 5.3, 1-h post-prandial < 7.8. ' +
            'Refer to combined obstetric + diabetes clinic. Baseline retinal screen, urine ACR, and creatinine; thromboembolism ' +
            'risk assessment. Aspirin 75–150 mg from week 12 to reduce pre-eclampsia risk. Plan delivery by 39–40 weeks.',
          { reasons: overtReasons.join('; ') },
        ),
      ];
    }

    // B. GDM diagnosed by OGTT.
    const ogttReasons: string[] = [];
    if (typeof ctx.ogtt75gFasting === 'number' && ctx.ogtt75gFasting >= OGTT_FPG) {
      ogttReasons.push(`fasting ${ctx.ogtt75gFasting.toFixed(1)} mmol/L (≥ ${OGTT_FPG})`);
    }
    if (typeof ctx.ogtt75g1h === 'number' && ctx.ogtt75g1h >= OGTT_1H) {
      ogttReasons.push(`1-h ${ctx.ogtt75g1h.toFixed(1)} mmol/L (≥ ${OGTT_1H})`);
    }
    if (typeof ctx.ogtt75g2h === 'number' && ctx.ogtt75g2h >= OGTT_2H) {
      ogttReasons.push(`2-h ${ctx.ogtt75g2h.toFixed(1)} mmol/L (≥ ${OGTT_2H})`);
    }
    if (ogttReasons.length > 0) {
      const nextStep =
        ctx.mntTrialCompleted === true &&
        typeof ctx.smbgAboveTargetPercent === 'number' &&
        ctx.smbgAboveTargetPercent > ABOVE_TARGET_PERCENT_TRIGGER
          ? 'MNT alone has failed (' +
            `${ctx.smbgAboveTargetPercent.toFixed(0)}% of SMBG readings above target — > ${ABOVE_TARGET_PERCENT_TRIGGER}% triggers pharmacotherapy). Start metformin 500 mg twice daily, titrated to 1 g twice daily over 2 weeks; if targets still not met, add or switch to insulin (basal NPH 0.2 U/kg at bedtime, titrated by 2 U every 3 days).`
          : 'Start medical nutrition therapy (3 meals + 2–3 snacks; carbohydrate 35–45 % of total energy distributed across meals) + 30 min moderate activity 5 days/week. Self-monitor fasting + 1-h post-prandial glucose 4 ×/day. Targets: fasting < 5.3 mmol/L, 1-h < 7.8 mmol/L (or 2-h < 6.7). Reassess after 1–2 weeks; if ≥ 20 % of readings above target, add metformin or insulin.';
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'GDM diagnosed by 75 g OGTT — initiate management',
          'IADPSG / WHO 2013 GDM thresholds met: {{reasons}}. {{step}} Ultrasound at 28–32 weeks for foetal growth. Aspirin ' +
            '75–150 mg from week 12 to reduce pre-eclampsia risk where not already started. Plan delivery by 39–40 weeks; ' +
            'continue glucose monitoring intrapartum. Postnatal 75 g OGTT at 6–12 weeks (40 % go on to develop type-2 ' +
            'diabetes within 10 years — long-term follow-up is essential).',
          { reasons: ogttReasons.join('; '), step: nextStep },
        ),
      ];
    }

    // C. High-risk + screening window + OGTT not done.
    const ga = ctx.gestationalAgeWeeks;
    const inWindow = typeof ga === 'number' && ga >= SCREEN_WINDOW_START && ga <= SCREEN_WINDOW_END;
    const haveOgtt =
      typeof ctx.ogtt75gFasting === 'number' ||
      typeof ctx.ogtt75g1h === 'number' ||
      typeof ctx.ogtt75g2h === 'number';

    if (inWindow && !haveOgtt) {
      const riskFactors: string[] = [];
      if (ctx.previousGdm === true) riskFactors.push('previous GDM');
      if (ctx.previousMacrosomicInfant === true) riskFactors.push('previous macrosomic infant');
      if (typeof ctx.bmi === 'number' && ctx.bmi >= ELEVATED_BMI) {
        riskFactors.push(`BMI ${ctx.bmi.toFixed(1)} (≥ ${ELEVATED_BMI})`);
      }
      if (ctx.familyHistoryDiabetes === true)
        riskFactors.push('first-degree relative with diabetes');
      if (typeof ctx.ageYears === 'number' && ctx.ageYears >= ELEVATED_AGE) {
        riskFactors.push(`maternal age ${ctx.ageYears} y (≥ ${ELEVATED_AGE})`);
      }
      if (ctx.pcosKnown === true) riskFactors.push('PCOS');
      if (ctx.glycosuriaPresent === true) riskFactors.push('glycosuria this pregnancy');
      if (ctx.polyhydramniosOrMacrosomia === true) {
        riskFactors.push('current polyhydramnios / macrosomia');
      }

      if (riskFactors.length > 0) {
        return [
          this.buildCard(
            rule,
            req,
            'warning',
            'GDM-risk pregnancy at 24–28 weeks — do 75 g OGTT this week',
            'Gestational age {{ga}} weeks with risk factor(s): {{reasons}}. WHO 2013 + Kenya MoH antenatal profile recommend a ' +
              '75 g 2-hour OGTT between 24 and 28 weeks: fast overnight (≥ 8 h); measure fasting glucose, then 75 g oral ' +
              'glucose load, then 1-h and 2-h venous plasma glucose. Any single value at or above the GDM thresholds ' +
              `(fasting ${OGTT_FPG} / 1-h ${OGTT_1H} / 2-h ${OGTT_2H} mmol/L) makes the diagnosis.`,
            { ga: ga ?? '', reasons: riskFactors.join('; ') },
          ),
        ];
      }
    }

    // D. Routine offer in the window.
    if (inWindow && !haveOgtt) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'Routine 75 g OGTT recommended at 24–28 weeks',
          'WHO 2013 recommends universal OGTT screening between 24 and 28 weeks in regions where the prevalence of ' +
            'hyperglycaemia in pregnancy is ≥ 10 % (most of sub-Saharan Africa). Offer the test today; same protocol as for ' +
            'risk-factor screening.',
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
      label: 'WHO Diagnostic criteria & classification of hyperglycaemia in pregnancy (2013)',
      url: 'https://www.who.int/publications/i/item/WHO-NMH-MND-13.2',
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
