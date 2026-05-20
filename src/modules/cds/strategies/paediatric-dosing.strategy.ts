import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import { DrugsService } from '../../drugs/drugs.service';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Paediatric-dosing CDS Hooks rule.
 *
 * Plain-language rule:
 *
 *   On `medication-prescribe`, IF the patient is a child (weight or
 *   age supplied) AND any of the proposed medications has a structured
 *   paediatric protocol in the formulary, THEN emit a card per drug
 *   with the calculated mg/dose, maximum daily dose, and any
 *   weight/renal warnings.
 *
 *   The card escalates to `critical` when the calculator refuses to
 *   compute a dose (renal contraindication, no paediatric protocol,
 *   or weight below the minimum threshold).
 *
 * Anonymous-by-design (FR-088). Reads only:
 *
 *   context.childWeightKg              number, mandatory trigger
 *   context.childAgeYears              number, optional
 *   context.crClMlMin                  number, optional
 *   context.proposedMedications        string[] OR
 *   context.proposed                   string[] OR
 *   context.medications                string[]
 *   context.indication                 string, optional (free-text)
 *
 * No name, no DOB, no MRN. The integrator extracts only the weight and
 * the proposed drug slugs from their own EMR.
 */

interface PaedContext {
  childWeightKg?: number;
  childAgeYears?: number;
  crClMlMin?: number;
  indication?: string;
  proposedMedications?: unknown;
  proposed?: unknown;
  medications?: unknown;
}

function readSlugs(ctx: PaedContext): string[] {
  for (const field of ['proposedMedications', 'proposed', 'medications'] as const) {
    const raw = ctx[field];
    if (Array.isArray(raw)) {
      return raw.filter((s): s is string => typeof s === 'string' && s.length > 0);
    }
  }
  return [];
}

@Injectable()
export class PaediatricDosingStrategy implements CdsRuleStrategy {
  readonly type = 'paediatric-dosing';

  constructor(private readonly drugs: DrugsService) {}

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as PaedContext;
    if (typeof ctx.childWeightKg !== 'number' || ctx.childWeightKg <= 0) return [];
    if (ctx.childWeightKg >= 50) return []; // adult-band — out of scope here

    const slugs = readSlugs(ctx);
    if (slugs.length === 0) return [];

    const seen = new Set<string>();
    const cards: CdsCard[] = [];

    for (const slug of slugs) {
      if (seen.has(slug)) continue;
      seen.add(slug);

      const drug = this.drugs.get(slug);
      if (!drug) continue; // unknown slug — DDI rule already silently skips these

      const result = this.drugs.calculateDose(slug, {
        weightKg: ctx.childWeightKg,
        ageYears: ctx.childAgeYears,
        indication: ctx.indication,
        crClMlMin: ctx.crClMlMin,
      });
      if (!result) continue;

      // Decide indicator and a short headline:
      //   • paediatric / weight-banded → info (with warnings array empty)
      //                                  warning (with non-empty warnings)
      //   • adult fallback             → not surfaced (not a child issue)
      //   • not-applicable / individualised → critical
      let indicator: CdsIndicator;
      let headline: string;
      if (result.protocol === 'adult') {
        // Calculator routed the input to an adult band — that already means
        // the child's weight is at the adult threshold. Skip card.
        continue;
      } else if (result.protocol === 'not-applicable' || result.protocol === 'individualised') {
        indicator = 'critical';
        headline = `${drug.inn}: paediatric dose unsafe to calculate`;
      } else if (result.warnings.length > 0) {
        indicator = 'warning';
        headline = `${drug.inn}: paediatric dose calculated — review warnings`;
      } else {
        indicator = 'info';
        headline = `${drug.inn}: paediatric dose`;
      }

      const warningsLine =
        result.warnings.length > 0 ? `Warnings: ${result.warnings.join('; ')}.` : '';
      const contraLine =
        result.contraindications.length > 0
          ? `Contraindications: ${result.contraindications.join('; ')}.`
          : '';
      const defaultSummary = headline;
      const defaultDetail = `Patient weight {{weightKg}} kg{{ageNote}}. {{narrative}} {{warnings}} {{contras}}`;

      const { summary, detail } = resolveCardCopy(
        rule,
        req,
        { summary: defaultSummary, detail: defaultDetail },
        {
          weightKg: ctx.childWeightKg,
          ageNote: ctx.childAgeYears !== undefined ? `, age ${ctx.childAgeYears} y` : '',
          narrative: result.narrative,
          warnings: warningsLine,
          contras: contraLine,
        },
      );

      cards.push({
        summary,
        indicator,
        detail: detail.replace(/\s+/g, ' ').trim(),
        source: {
          label: drug.references[0]?.label ?? 'WHO Model Formulary',
          url: drug.references[0]?.url,
        },
        extension: {
          'http://vedamd.io/Card/recommendation': {
            ruleId: rule.id,
            ruleVersion: rule.ruleVersion,
            evidenceLevel: rule.evidenceLevel,
            generatedAt: new Date().toISOString(),
          },
        },
      });
    }

    return cards;
  }
}
