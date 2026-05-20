import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * IMCI measles — WHO Integrated Management of Childhood Illness
 * 2014 + WHO Measles Treatment 2020 + Kenya MoH IMCI / EPI.
 *
 * The integrator confirms a fever AND either a generalised rash OR
 * clinical suspicion of measles. The strategy returns:
 *
 *   1. CRITICAL — severe complicated measles:
 *        any IMCI general danger sign OR clouding of cornea OR deep
 *        / extensive mouth ulcers OR pneumonia OR severe dehydration
 *        OR encephalitis (seizures, altered mental state) OR
 *        stridor in calm child.
 *        → Admit. Vitamin A 50 000–200 000 IU now and day 2 (age-
 *          banded). IV / oral antibiotic for the complication
 *          (ceftriaxone for severe pneumonia / meningitis;
 *          amoxicillin if pneumonia non-severe). Tetracycline eye
 *          ointment for corneal clouding. ORS / IV fluids for
 *          dehydration. Notify public-health team for outbreak
 *          response.
 *
 *   2. CRITICAL — measles with eye / mouth complications:
 *        pus from eye OR mouth ulcers (any) without depth.
 *        → Outpatient management with vitamin A + tetracycline eye
 *          ointment + GV paint or 0.25 % salicylate for mouth + soft
 *          feeds.
 *
 *   3. WARNING — measles (uncomplicated):
 *        rash + cough + coryza + conjunctivitis in a febrile child
 *        without complications.
 *        → Vitamin A age-banded, paracetamol, fluids, isolate from
 *          other children for 4 days after rash onset, contact
 *          tracing + immunise non-immune contacts within 72 h.
 *
 *   4. INFO — suspected measles, rash not yet present:
 *        Koplik spots OR known measles contact within 21 days plus
 *        prodromal fever / coryza.
 *        → Vitamin A + isolation, review in 48 h for rash.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageMonths               number ≥ 0 (must be < 60)
 *   context.suspectedMeasles        boolean (sentinel)
 *   context.measlesRashPresent      boolean
 *   context.koplikSpots             boolean
 *   context.measlesContactInLast21d boolean
 *   context.generalDangerSign       boolean (unable to drink/breastfeed,
 *                                    vomits everything, convulsions
 *                                    now or recently, lethargic /
 *                                    unconscious)
 *   context.cornealClouding         boolean
 *   context.deepExtensiveMouthUlcers boolean
 *   context.pusFromEye              boolean
 *   context.mouthUlcersMild         boolean
 *   context.pneumoniaSevere         boolean
 *   context.pneumoniaNonSevere      boolean
 *   context.severeDehydration       boolean
 *   context.encephalitisSigns       boolean
 *   context.stridorInCalmChild      boolean
 *   context.cough                   boolean
 *   context.coryza                  boolean
 *   context.conjunctivitis          boolean
 *   context.epidOutbreakArea        boolean (informs the public-health
 *                                    notification footnote)
 */

const MAX_IMCI_AGE_MONTHS = 60;

interface MeaslesContext {
  ageMonths?: number;
  suspectedMeasles?: boolean;
  measlesRashPresent?: boolean;
  koplikSpots?: boolean;
  measlesContactInLast21d?: boolean;
  generalDangerSign?: boolean;
  cornealClouding?: boolean;
  deepExtensiveMouthUlcers?: boolean;
  pusFromEye?: boolean;
  mouthUlcersMild?: boolean;
  pneumoniaSevere?: boolean;
  pneumoniaNonSevere?: boolean;
  severeDehydration?: boolean;
  encephalitisSigns?: boolean;
  stridorInCalmChild?: boolean;
  cough?: boolean;
  coryza?: boolean;
  conjunctivitis?: boolean;
  epidOutbreakArea?: boolean;
}

function vitaminADose(ageMonths: number): string {
  if (ageMonths < 6) return '50 000 IU orally now and a second dose tomorrow';
  if (ageMonths < 12) return '100 000 IU orally now and a second dose tomorrow';
  return '200 000 IU orally now and a second dose tomorrow';
}

@Injectable()
export class ImciMeaslesStrategy implements CdsRuleStrategy {
  readonly type = 'imci-measles';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as MeaslesContext;
    if (ctx.suspectedMeasles !== true) return [];
    if (typeof ctx.ageMonths !== 'number' || ctx.ageMonths < 0 || ctx.ageMonths >= MAX_IMCI_AGE_MONTHS) {
      return [];
    }

    const vitA = vitaminADose(ctx.ageMonths);
    const outbreakNote =
      ctx.epidOutbreakArea === true
        ? ' Outbreak setting — notify district surveillance officer within 24 h; consider supplementary immunisation activity for the area.'
        : ' Notify the public-health team per the integrated disease-surveillance protocol.';

    // 1. Severe complicated.
    const severeReasons: string[] = [];
    if (ctx.generalDangerSign === true) severeReasons.push('IMCI general danger sign');
    if (ctx.cornealClouding === true) severeReasons.push('clouding of the cornea');
    if (ctx.deepExtensiveMouthUlcers === true) severeReasons.push('deep or extensive mouth ulcers');
    if (ctx.pneumoniaSevere === true) severeReasons.push('severe pneumonia');
    if (ctx.severeDehydration === true) severeReasons.push('severe dehydration');
    if (ctx.encephalitisSigns === true) severeReasons.push('encephalitis (seizures or altered mental state)');
    if (ctx.stridorInCalmChild === true) severeReasons.push('stridor in calm child');

    if (severeReasons.length > 0) {
      const corneaLine =
        ctx.cornealClouding === true
          ? ' Tetracycline 1 % eye ointment three times daily until redness has resolved (urgent ophthalmology review — corneal scarring causes blindness).'
          : '';
      const antibioticLine =
        ctx.pneumoniaSevere === true
          ? ' Pre-referral ceftriaxone 50 mg/kg IM/IV plus oxygen titrated to SpO₂ ≥ 90 %.'
          : ctx.encephalitisSigns === true
            ? ' Pre-referral ceftriaxone 50 mg/kg IM/IV and treat seizures with diazepam 0.5 mg/kg PR or buccal midazolam.'
            : ' Treat the complication per IMCI severe-illness pathways.';
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Severe complicated measles — admit urgently with vitamin A + complication-specific antibiotic',
          'Severe feature(s): {{reasons}}. Refer urgently to hospital. Vitamin A {{vitA}}.{{cornea}}{{abx}} Maintain hydration: ORS by sips ' +
            'if alert, IV / NG fluids if not. Continue breastfeeding. Strict respiratory isolation throughout admission. Track ' +
            'siblings under 5 in the household and immunise non-immune contacts within 72 h of exposure.{{outbreak}}',
          {
            reasons: severeReasons.join('; '),
            vitA,
            cornea: corneaLine,
            abx: antibioticLine,
            outbreak: outbreakNote,
          },
        ),
      ];
    }

    // 2. Eye / mouth complications without severe features.
    const complicationReasons: string[] = [];
    if (ctx.pusFromEye === true) complicationReasons.push('pus from the eye');
    if (ctx.mouthUlcersMild === true) complicationReasons.push('mouth ulcers');
    if (ctx.pneumoniaNonSevere === true) complicationReasons.push('non-severe pneumonia');

    if (complicationReasons.length > 0) {
      const pneumoniaLine =
        ctx.pneumoniaNonSevere === true
          ? ' Amoxicillin DT 25 mg/kg twice daily for 5 days. Counsel return-immediately signs (fast / difficult breathing, unable to drink).'
          : '';
      const eyeLine =
        ctx.pusFromEye === true
          ? ' Clean the eye with clean cloth + clean water, then tetracycline 1 % eye ointment four times daily for 5 days.'
          : '';
      const mouthLine =
        ctx.mouthUlcersMild === true
          ? ' Wash mouth with salt water 4 times/day and apply 0.25 % gentian-violet paint or 1 % salicylate gel after each meal.'
          : '';
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Measles with eye / mouth / pneumonia complications — outpatient bundle today',
          'Complication(s): {{reasons}}. Vitamin A {{vitA}}.{{pneum}}{{eye}}{{mouth}} Continue breastfeeding and offer soft, frequent ' +
            'meals. Isolate from other children for 4 days after rash onset. Review in 5 days or sooner if condition deteriorates.{{outbreak}}',
          {
            reasons: complicationReasons.join('; '),
            vitA,
            pneum: pneumoniaLine,
            eye: eyeLine,
            mouth: mouthLine,
            outbreak: outbreakNote,
          },
        ),
      ];
    }

    // 3. Uncomplicated measles.
    if (ctx.measlesRashPresent === true) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Uncomplicated measles — vitamin A + isolation + contact tracing',
          'Maculopapular rash with fever, cough, coryza or conjunctivitis. Vitamin A {{vitA}}. Paracetamol for fever, frequent fluids, ' +
            'continue breastfeeding. Isolate from other children for 4 days after rash onset (5 days for immunocompromised contacts). ' +
            'Identify under-5 household contacts and immunise non-immune ones within 72 hours. Counsel return-immediately signs: ' +
            'inability to drink, fast or difficult breathing, convulsions, cloudy eye.{{outbreak}}',
          { vitA, outbreak: outbreakNote },
        ),
      ];
    }

    // 4. Suspected prodrome.
    if (ctx.koplikSpots === true || ctx.measlesContactInLast21d === true) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'Suspected measles prodrome — vitamin A + isolation, review at 48 h',
          'Koplik spots or known measles contact within 21 days plus prodromal fever, cough, coryza, conjunctivitis. Vitamin A {{vitA}}. ' +
            'Isolate now; rash typically appears 2–4 days after onset of fever. Review in 48 h or sooner if a complication develops. ' +
            'Immunise non-immune household / school contacts within 72 h of exposure.{{outbreak}}',
          { vitA, outbreak: outbreakNote },
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
      label: 'WHO — Measles vaccines: WHO position paper (2017) + IMCI Chart Booklet 2014',
      url: 'https://www.who.int/publications/i/item/who-imci-chart-booklet',
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
