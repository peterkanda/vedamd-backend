import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Antenatal post-partum-haemorrhage (PPH) risk screen.
 *
 * Based on WHO 2022 PPH recommendations + Kenya MoH ANC profile.
 * Stratifies the antenatal patient into risk tiers so the facility
 * can plan a birth setting + active management of the third stage of
 * labour (AMTSL) with the right medications and blood-availability.
 *
 *   Risk factors counted (1 point each unless stated):
 *     • Previous PPH                                          (+ 2)
 *     • Antepartum haemorrhage in this pregnancy              (+ 2)
 *     • Known placenta praevia or accreta spectrum            (+ 2)
 *     • Severe anaemia (Hb < 7 g/dL) at booking or current    (+ 1)
 *     • Grand multiparity (parity ≥ 5)                        (+ 1)
 *     • Multiple pregnancy                                    (+ 1)
 *     • Polyhydramnios                                        (+ 1)
 *     • Macrosomia (estimated fetal weight ≥ 4 kg)            (+ 1)
 *     • Prolonged labour > 12 h (intrapartum context only)    (+ 1)
 *     • Bleeding diathesis or anticoagulation                 (+ 2)
 *     • Pre-eclampsia / eclampsia in this pregnancy           (+ 1)
 *
 *   Score → band:
 *     0      Routine — universal AMTSL                         (INFO)
 *     1–2    Moderate — plan facility birth with prophylactic
 *            oxytocin/heat-stable carbetocin ready              (WARNING)
 *     ≥ 3    High — comprehensive-EmONC facility, cross-matched
 *            blood available before delivery                    (CRITICAL)
 *
 * Strategy fires only for pregnant patients ≥ 20 weeks gestation.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.pregnant                 boolean (must be true)
 *   context.gestationalAgeWeeks      number  (≥ 20 to fire)
 *   context.previousPph              boolean
 *   context.antepartumHaemorrhage    boolean
 *   context.placentaPraeviaOrAccreta boolean
 *   context.severeAnaemia            boolean  (Hb < 7 g/dL)
 *   context.parity                   number
 *   context.multiplePregnancy        boolean
 *   context.polyhydramnios           boolean
 *   context.macrosomia               boolean
 *   context.prolongedLabour          boolean
 *   context.bleedingDiathesisOrAnticoag boolean
 *   context.preEclampsiaThisPregnancy   boolean
 */

const MIN_GA_WEEKS = 20;

interface PphContext {
  pregnant?: boolean;
  gestationalAgeWeeks?: number;
  previousPph?: boolean;
  antepartumHaemorrhage?: boolean;
  placentaPraeviaOrAccreta?: boolean;
  severeAnaemia?: boolean;
  parity?: number;
  multiplePregnancy?: boolean;
  polyhydramnios?: boolean;
  macrosomia?: boolean;
  prolongedLabour?: boolean;
  bleedingDiathesisOrAnticoag?: boolean;
  preEclampsiaThisPregnancy?: boolean;
}

@Injectable()
export class AncPphRiskScreenStrategy implements CdsRuleStrategy {
  readonly type = 'anc-pph-risk-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as PphContext;
    if (ctx.pregnant !== true) return [];
    if (typeof ctx.gestationalAgeWeeks !== 'number' || ctx.gestationalAgeWeeks < MIN_GA_WEEKS) return [];

    const parts: Array<{ label: string; pts: number }> = [];
    if (ctx.previousPph === true) parts.push({ label: 'previous PPH', pts: 2 });
    if (ctx.antepartumHaemorrhage === true) parts.push({ label: 'antepartum haemorrhage', pts: 2 });
    if (ctx.placentaPraeviaOrAccreta === true) parts.push({ label: 'placenta praevia / accreta', pts: 2 });
    if (ctx.severeAnaemia === true) parts.push({ label: 'severe anaemia (Hb < 7)', pts: 1 });
    if (typeof ctx.parity === 'number' && ctx.parity >= 5) {
      parts.push({ label: `grand multiparity (parity ${ctx.parity})`, pts: 1 });
    }
    if (ctx.multiplePregnancy === true) parts.push({ label: 'multiple pregnancy', pts: 1 });
    if (ctx.polyhydramnios === true) parts.push({ label: 'polyhydramnios', pts: 1 });
    if (ctx.macrosomia === true) parts.push({ label: 'macrosomia (EFW ≥ 4 kg)', pts: 1 });
    if (ctx.prolongedLabour === true) parts.push({ label: 'prolonged labour > 12 h', pts: 1 });
    if (ctx.bleedingDiathesisOrAnticoag === true) {
      parts.push({ label: 'bleeding diathesis or anticoagulation', pts: 2 });
    }
    if (ctx.preEclampsiaThisPregnancy === true) {
      parts.push({ label: 'pre-eclampsia in this pregnancy', pts: 1 });
    }

    const score = parts.reduce((s, p) => s + p.pts, 0);
    const partsLabel = parts.length > 0
      ? parts.map((p) => `${p.label} (+${p.pts})`).join('; ')
      : 'no risk factors recorded';

    let indicator: CdsIndicator;
    let summary: string;
    let detail: string;

    if (score >= 3) {
      indicator = 'critical';
      summary = `PPH risk score ${score} — high. Comprehensive-EmONC delivery + cross-matched blood`;
      detail =
        'Risk factors: {{parts}}. Plan delivery at a comprehensive emergency-obstetric-and-newborn-care (CEmONC) facility ' +
        'with cross-matched blood and a dedicated obstetric anaesthetist. Administer active management of the third stage ' +
        'of labour (AMTSL) with oxytocin 10 IU IM / heat-stable carbetocin 100 µg as soon as the baby is born. Counsel the ' +
        'family about the higher haemorrhage risk; prepare a transport plan and obtain consent for transfusion in advance. ' +
        'Optimise iron + folic acid; transfuse if Hb < 7 g/dL before term.';
    } else if (score >= 1) {
      indicator = 'warning';
      summary = `PPH risk score ${score} — moderate. Plan facility birth and AMTSL`;
      detail =
        'Risk factors: {{parts}}. Plan a facility birth (basic emergency-obstetric-care minimum), ensure oxytocin or ' +
        'heat-stable carbetocin is available, and conduct AMTSL routinely. Counsel the patient on warning signs of PPH ' +
        '(soaking pads, dizziness, fast pulse). Optimise anaemia before term; recheck haemoglobin at 36 weeks.';
    } else {
      indicator = 'info';
      summary = 'PPH risk routine — universal AMTSL still required';
      detail =
        'No additional risk factors recorded. Plan a facility birth with universal AMTSL (oxytocin 10 IU IM / heat-stable ' +
        'carbetocin 100 µg with delivery of the anterior shoulder). Counsel the patient on PPH warning signs and the ' +
        'importance of facility delivery even without identified risk.';
    }

    const ref = rule.references[0] ?? {
      label: 'WHO Recommendations on Postpartum Haemorrhage (2022)',
      url: 'https://www.who.int/publications/i/item/9789240062498',
    };
    const { summary: outSummary, detail: outDetail } = resolveCardCopy(
      rule,
      req,
      { summary, detail },
      { parts: partsLabel, score },
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
