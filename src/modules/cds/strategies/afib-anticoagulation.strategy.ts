import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Atrial fibrillation anticoagulation decision — CHA₂DS₂-VASc stroke
 * score + HAS-BLED bleeding score (ESC AF 2024).
 *
 * Why deterministic: these are exact additive scores where a manual
 * arithmetic slip changes the anticoagulation decision — a leading
 * preventable cause of both AF-related stroke (under-treatment) and
 * major bleeding (over-treatment). Computing them in code removes
 * that error class. The agentic layer can still add nuance on top.
 *
 * CHA₂DS₂-VASc (max 9): C(1) H(1) A₂ age≥75(2) D(1) S₂ stroke/TIA/TE(2)
 *   V vascular(1) A age 65-74(1) Sc female(1).
 * Anticoagulation: ≥2 men / ≥3 women → recommend; 1 men / 2 women →
 *   consider; 0 men / 1 women (sex alone) → none.
 *
 * HAS-BLED (max 9): Hypertension uncontrolled(1) Abnormal renal(1) +
 *   liver(1) Stroke(1) Bleeding(1) Labile INR(1) Elderly>65(1) Drugs
 *   antiplatelet/NSAID(1) + alcohol(1). ≥3 = high bleeding risk →
 *   address modifiable factors + review more often; do NOT withhold
 *   anticoagulation on HAS-BLED alone.
 *
 * Anonymous-by-design. Reads only:
 *   context.hasAtrialFibrillation   boolean sentinel (or "atrial fibrillation" in context.diagnoses)
 *   context.valvularAf              boolean (mechanical valve / mod-severe mitral stenosis → warfarin)
 *   context.ageYears                number
 *   context.sex                     'male' | 'female'
 *   context.chf | context.hypertension | context.diabetes
 *   context.priorStroke | context.vascularDisease  booleans (CHA₂DS₂-VASc)
 *   context.uncontrolledHypertension | context.abnormalRenal | context.abnormalLiver
 *   context.bleedingHistory | context.labileInr | context.alcoholExcess
 *   context.antiplateletOrNsaid     booleans (HAS-BLED)
 */

interface AfContext {
  hasAtrialFibrillation?: boolean;
  diagnoses?: string[];
  valvularAf?: boolean;
  ageYears?: number;
  sex?: string;
  chf?: boolean;
  hypertension?: boolean;
  diabetes?: boolean;
  priorStroke?: boolean;
  vascularDisease?: boolean;
  uncontrolledHypertension?: boolean;
  abnormalRenal?: boolean;
  abnormalLiver?: boolean;
  bleedingHistory?: boolean;
  labileInr?: boolean;
  alcoholExcess?: boolean;
  antiplateletOrNsaid?: boolean;
}

@Injectable()
export class AfibAnticoagulationStrategy implements CdsRuleStrategy {
  readonly type = 'afib-anticoagulation';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as AfContext;

    const afFromDiagnoses = (ctx.diagnoses ?? []).some((d) =>
      /atrial fibrillation|atrial flutter/i.test(String(d)),
    );
    if (ctx.hasAtrialFibrillation !== true && !afFromDiagnoses) return [];

    const female = String(ctx.sex).toLowerCase() === 'female';

    // --- CHA₂DS₂-VASc ---
    const cha: string[] = [];
    let chads = 0;
    if (ctx.chf === true) {
      chads += 1;
      cha.push('C: CHF/LV dysfunction');
    }
    if (ctx.hypertension === true) {
      chads += 1;
      cha.push('H: hypertension');
    }
    if (typeof ctx.ageYears === 'number' && ctx.ageYears >= 75) {
      chads += 2;
      cha.push('A₂: age ≥75 (2)');
    } else if (typeof ctx.ageYears === 'number' && ctx.ageYears >= 65) {
      chads += 1;
      cha.push('A: age 65–74');
    }
    if (ctx.diabetes === true) {
      chads += 1;
      cha.push('D: diabetes');
    }
    if (ctx.priorStroke === true) {
      chads += 2;
      cha.push('S₂: prior stroke/TIA/TE (2)');
    }
    if (ctx.vascularDisease === true) {
      chads += 1;
      cha.push('V: vascular disease');
    }
    if (female) {
      chads += 1;
      cha.push('Sc: female');
    }

    // --- HAS-BLED ---
    const hb: string[] = [];
    let hasbled = 0;
    if (ctx.uncontrolledHypertension === true) {
      hasbled += 1;
      hb.push('H: uncontrolled HTN');
    }
    if (ctx.abnormalRenal === true) {
      hasbled += 1;
      hb.push('A: abnormal renal');
    }
    if (ctx.abnormalLiver === true) {
      hasbled += 1;
      hb.push('A: abnormal liver');
    }
    if (ctx.priorStroke === true) {
      hasbled += 1;
      hb.push('S: stroke');
    }
    if (ctx.bleedingHistory === true) {
      hasbled += 1;
      hb.push('B: bleeding history');
    }
    if (ctx.labileInr === true) {
      hasbled += 1;
      hb.push('L: labile INR');
    }
    if (typeof ctx.ageYears === 'number' && ctx.ageYears > 65) {
      hasbled += 1;
      hb.push('E: elderly >65');
    }
    if (ctx.antiplateletOrNsaid === true) {
      hasbled += 1;
      hb.push('D: antiplatelet/NSAID');
    }
    if (ctx.alcoholExcess === true) {
      hasbled += 1;
      hb.push('D: alcohol excess');
    }

    // --- Decision ---
    const recommendAnticoag = (!female && chads >= 2) || (female && chads >= 3);
    const considerAnticoag = (!female && chads === 1) || (female && chads === 2);

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    const agent =
      ctx.valvularAf === true
        ? 'Valvular AF (mechanical valve / moderate–severe mitral stenosis) → use a vitamin-K antagonist (warfarin, target INR 2.5); DOACs are contraindicated.'
        : 'Use a DOAC first-line (e.g. apixaban 5 mg BD; reduce to 2.5 mg BD if ≥2 of: age ≥80, weight ≤60 kg, creatinine ≥133 µmol/L). Warfarin is an alternative.';

    if (recommendAnticoag) {
      indicator = 'critical';
      summary = `AF: CHA₂DS₂-VASc ${chads} — anticoagulation RECOMMENDED`;
      recommendation = `Oral anticoagulation is recommended. ${agent} Do NOT use aspirin for stroke prevention in AF.`;
    } else if (considerAnticoag) {
      indicator = 'warning';
      summary = `AF: CHA₂DS₂-VASc ${chads} — consider anticoagulation`;
      recommendation = `Consider oral anticoagulation after a shared-decision discussion of individual risk/benefit. ${agent}`;
    } else {
      indicator = 'info';
      summary = `AF: CHA₂DS₂-VASc ${chads} — anticoagulation not routinely indicated`;
      recommendation =
        'Stroke risk is low; anticoagulation is not routinely recommended (no antiplatelet for stroke prevention either). Reassess as risk factors accrue.';
    }

    const bleedNote =
      hasbled >= 3
        ? ` HAS-BLED ${hasbled} (high bleeding risk): address MODIFIABLE factors (BP control, stop unnecessary antiplatelet/NSAID, reduce alcohol, manage INR lability) and review more frequently — do NOT withhold anticoagulation on HAS-BLED alone.`
        : ` HAS-BLED ${hasbled}.`;

    const ref = rule.references[0] ?? {
      label: 'ESC Atrial Fibrillation Guidelines 2024',
      url: 'https://academic.oup.com/eurheartj/article/45/36/3314/7738779',
    };

    const detail = `CHA₂DS₂-VASc ${chads} (${cha.join(' | ') || 'no risk factors'}).${bleedNote} ${recommendation}`;

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(
      rule,
      req,
      { summary, detail },
      { score: chads, components: cha.join(' | ') },
    );

    return [
      {
        summary: outSummary,
        indicator,
        detail: outDetail.replace(/\s+/g, ' ').trim(),
        source: { label: ref.label, url: ref.url, strength: ref.strength },
        extension: {
          'http://vedamd.io/Card/recommendation': {
            ruleId: rule.id,
            ruleVersion: rule.ruleVersion,
            evidenceLevel: rule.evidenceLevel,
            generatedAt: new Date().toISOString(),
          },
        },
      },
    ];
  }
}
