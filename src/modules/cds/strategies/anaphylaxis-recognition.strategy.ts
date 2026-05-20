import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Anaphylaxis recognition + emergency bundle (WAO 2020 + Resus Council).
 *
 * Diagnostic criterion: acute onset of an illness (minutes to hours)
 * with involvement of TWO OR MORE systems after exposure to a likely
 * allergen — OR involvement of the cardiovascular system alone
 * (hypotension / shock) where allergen exposure is documented.
 *
 * System buckets (the strategy reads boolean flags per bucket):
 *   • skin / mucosal: urticaria, angioedema, flushing, oral itching
 *   • respiratory:    dyspnoea, wheeze, stridor, hypoxia
 *   • cardiovascular: hypotension, syncope, severely reduced level of
 *                     consciousness
 *   • gastrointestinal: persistent cramping abdominal pain, vomiting
 *
 * Output:
 *   • CRITICAL when ≥ 2 systems involved (or single CVS involvement
 *     with documented exposure) — IM adrenaline 0.5 mg (0.5 mL of
 *     1:1000) into the antero-lateral mid-thigh, repeat at 5–15 min if
 *     no improvement, lay flat with legs elevated, oxygen, IV
 *     crystalloid 20 mL/kg, monitor airway. Auto-computes paediatric
 *     dose (0.01 mg/kg, max 0.5 mg) when `weightKg < 50`.
 *   • WARNING for isolated single-system urticaria with exposure —
 *     antihistamine + 4-h observation, counsel return-immediately
 *     signs.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                  number ≥ 0
 *   context.suspectedAllergicReaction boolean (sentinel)
 *   context.weightKg                  number (optional)
 *   context.allergenExposureDocumented boolean
 *   context.skinOrMucosalInvolvement  boolean
 *   context.respiratoryInvolvement    boolean
 *   context.cardiovascularInvolvement boolean
 *   context.giInvolvement             boolean
 *   context.hypotensionOrShock        boolean
 *   context.knownAdrenalineAllergy    boolean (rare; flags caution)
 */

const ADULT_WEIGHT_THRESHOLD_KG = 50;
const PAED_DOSE_MG_PER_KG = 0.01;
const ADULT_DOSE_MG = 0.5;

interface AnaphylaxisContext {
  ageYears?: number;
  suspectedAllergicReaction?: boolean;
  weightKg?: number;
  allergenExposureDocumented?: boolean;
  skinOrMucosalInvolvement?: boolean;
  respiratoryInvolvement?: boolean;
  cardiovascularInvolvement?: boolean;
  giInvolvement?: boolean;
  hypotensionOrShock?: boolean;
  knownAdrenalineAllergy?: boolean;
}

@Injectable()
export class AnaphylaxisRecognitionStrategy implements CdsRuleStrategy {
  readonly type = 'anaphylaxis-recognition';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as AnaphylaxisContext;
    if (ctx.suspectedAllergicReaction !== true) return [];

    const systems: string[] = [];
    if (ctx.skinOrMucosalInvolvement === true) systems.push('skin / mucosal');
    if (ctx.respiratoryInvolvement === true) systems.push('respiratory');
    if (ctx.cardiovascularInvolvement === true) systems.push('cardiovascular');
    if (ctx.giInvolvement === true) systems.push('gastrointestinal');
    const cvs =
      ctx.cardiovascularInvolvement === true || ctx.hypotensionOrShock === true;

    const multiSystem = systems.length >= 2;
    const isolatedCvsWithExposure =
      cvs && ctx.allergenExposureDocumented === true && systems.length < 2;

    if (multiSystem || isolatedCvsWithExposure) {
      const dose = adrenalineDose(ctx);
      const cautionLine =
        ctx.knownAdrenalineAllergy === true
          ? ' Note: documented adrenaline allergy is exceptionally rare and almost always actually an adverse-effect history; IM adrenaline remains first line and life-saving in anaphylaxis.'
          : '';
      const summary =
        'Anaphylaxis — give IM adrenaline NOW and activate the emergency bundle';
      const detail =
        'Diagnostic criterion met: {{trigger}}. {{dose}} Lay the patient flat with legs elevated (or left lateral if pregnant ' +
        'or vomiting). Give high-flow oxygen via non-rebreather mask. Establish IV access; give a crystalloid bolus 20 mL/kg ' +
        '(repeat once if persistent hypotension). Monitor airway continuously — early intubation if stridor or angioedema ' +
        'progresses. Repeat IM adrenaline every 5–15 minutes until improvement. Refer urgently; observe for at least 6 hours ' +
        '(longer if biphasic-reaction risk). Document trigger; prescribe an adrenaline auto-injector and refer to allergy ' +
        'follow-up.{{caution}}';
      return [
        this.buildCard(rule, req, 'critical', summary, detail, {
          trigger: multiSystem
            ? `multi-system involvement (${systems.join(', ')})`
            : 'isolated cardiovascular collapse after documented allergen exposure',
          dose: dose.line,
          caution: cautionLine,
        }),
      ];
    }

    if (systems.length === 1 && ctx.allergenExposureDocumented === true) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Single-system allergic reaction — observe and counsel',
          'Single-system reaction ({{system}}) after documented exposure. Give an oral non-sedating H1 antihistamine ' +
            '(cetirizine 10 mg, paediatric weight-banded). Observe for 4 hours: any progression to a second system or ' +
            'cardiovascular involvement → escalate to the anaphylaxis bundle (IM adrenaline). Counsel adrenaline auto-injector ' +
            'eligibility; refer to allergy follow-up if recurrent or food / drug-triggered.',
          { system: systems[0] ?? 'isolated' },
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
      label: 'WAO Anaphylaxis Guidelines (2020)',
      url: 'https://www.worldallergy.org/UserFiles/file/Anaphylaxis-Guidelines-2020.pdf',
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

function adrenalineDose(ctx: AnaphylaxisContext): { line: string } {
  if (typeof ctx.weightKg === 'number' && ctx.weightKg > 0 && ctx.weightKg < ADULT_WEIGHT_THRESHOLD_KG) {
    const mg = Math.min(ADULT_DOSE_MG, Number((ctx.weightKg * PAED_DOSE_MG_PER_KG).toFixed(2)));
    const mLOfStandard = Number((mg).toFixed(2));
    return {
      line: `IM adrenaline ${mg} mg (${mLOfStandard} mL of 1:1000) — paediatric dose 0.01 mg/kg × ${ctx.weightKg} kg, capped at 0.5 mg — into the antero-lateral mid-thigh.`,
    };
  }
  return {
    line: 'IM adrenaline 0.5 mg (0.5 mL of 1:1000) into the antero-lateral mid-thigh.',
  };
}
