import type { Citation } from '../../common/citation';
import { Injectable } from '@nestjs/common';
import { DrugsService } from '../drugs/drugs.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

/**
 * Clinician-facing dose calculator.
 *
 * Safety posture (per product decision): compute weight/age/renal-based
 * doses straight from the drug's signed bundle record + ALWAYS cite the
 * source. REFUSE to output a number when required inputs are missing or
 * when the drug is renally contraindicated in the supplied band —
 * surfacing the contraindication / reference text instead of guessing.
 *
 * Reuses the existing audited DrugsService.calculateDose so the
 * calculator + the deterministic paediatric-dosing CDS strategy share
 * one implementation (no divergence).
 */

export interface DoseCalcResult {
  slug: string;
  drug: string;
  /** Whether a patient-specific number was produced. */
  computed: boolean;
  /** Why a number was NOT produced (refusal reason), if computed=false. */
  refusedReason?: string;
  protocol?: string;
  calculatedDose?: unknown;
  narrative: string;
  warnings: string[];
  contraindications: string[];
  /** The reference dosing text from the bundle (always shown for transparency). */
  referenceDosing: unknown;
  references: Citation[];
  evidenceLevel: string;
}

@Injectable()
export class ReferenceDoseService {
  constructor(
    private readonly drugs: DrugsService,
    private readonly knowledge: KnowledgeService,
  ) {}

  calculate(input: {
    slug: string;
    weightKg?: number;
    ageYears?: number;
    crClMlMin?: number;
    indication?: string;
    route?: string;
  }): DoseCalcResult | null {
    const drug = this.knowledge.getDrugs().find((d) => d.slug === input.slug);
    if (!drug) return null;

    const refs = (drug as { references?: { label: string; url?: string }[] }).references ?? [];
    const referenceDosing = (drug as { dosing?: unknown }).dosing ?? null;
    const evidenceLevel = (drug as { evidenceLevel?: string }).evidenceLevel ?? 'expert-consensus';

    // Refuse cleanly when weight is missing — required for any weight-based calc.
    if (typeof input.weightKg !== 'number' || input.weightKg <= 0) {
      return {
        slug: drug.slug,
        drug: drug.inn,
        computed: false,
        refusedReason:
          'Patient weight is required to calculate a dose. Reference dosing is shown below — verify against the cited source before prescribing.',
        narrative: 'No patient weight supplied — calculation refused (safety).',
        warnings: [],
        contraindications: [],
        referenceDosing,
        references: refs,
        evidenceLevel,
      };
    }

    const result = this.drugs.calculateDose(drug.slug, {
      weightKg: input.weightKg,
      ageYears: input.ageYears,
      crClMlMin: input.crClMlMin,
      indication: input.indication,
      route: input.route,
    });

    if (!result) {
      // No structured dosing model for this drug — show reference text only.
      return {
        slug: drug.slug,
        drug: drug.inn,
        computed: false,
        refusedReason:
          'No structured weight-based dosing model for this drug — reference dosing text is shown. Verify against the cited source.',
        narrative: 'Individualised dosing — not safe to compute from weight alone.',
        warnings: [],
        contraindications: [],
        referenceDosing,
        references: refs,
        evidenceLevel,
      };
    }

    const computed = result.calculatedDose != null;
    return {
      slug: drug.slug,
      drug: drug.inn,
      computed,
      refusedReason: computed ? undefined : (result.contraindications[0] ?? result.narrative),
      protocol: result.protocol,
      calculatedDose: result.calculatedDose,
      narrative: result.narrative,
      warnings: result.warnings,
      contraindications: result.contraindications,
      referenceDosing,
      references: result.references.length ? result.references : refs,
      evidenceLevel: result.evidenceLevel,
    };
  }
}
