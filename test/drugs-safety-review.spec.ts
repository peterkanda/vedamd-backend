import { describe, expect, it, beforeEach } from 'vitest';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import type { KnowledgeService } from '../src/modules/knowledge/knowledge.service';
import type { DrugInteraction, DrugRecord } from '../src/modules/drugs/drugs.types';

/**
 * Holistic medication safety review — interactions + AWaRe stewardship +
 * duplicate-therapy + pregnancy + renal/hepatic in one panel (the
 * world-class point-of-care feature).
 */

type DrugOpts = {
  pregnancyContraindicated?: boolean;
  renal?: Array<{
    crClMinMlMin?: number;
    crClMaxMlMin?: number;
    adjustment: string;
    prohibited?: boolean;
  }>;
  hepatic?: string;
};

const drug = (
  slug: string,
  inn: string,
  drugClass: string,
  aware: DrugRecord['awareCategory'],
  opts: DrugOpts = {},
) =>
  ({
    slug,
    inn,
    drugClass,
    awareCategory: aware,
    atc: [],
    tradeNames: [],
    pregnancy: {
      contraindicated: !!opts.pregnancyContraindicated,
      notes: opts.pregnancyContraindicated
        ? 'Teratogenic — avoid in pregnancy.'
        : 'No specific risk.',
    },
    dosing: { adult: [], renal: opts.renal, hepatic: opts.hepatic },
  }) as unknown as DrugRecord;

const drugs: DrugRecord[] = [
  drug('amoxicillin', 'Amoxicillin', 'Penicillin', 'Access'),
  drug('flucloxacillin', 'Flucloxacillin', 'Penicillin', 'Access'),
  drug('ciprofloxacin', 'Ciprofloxacin', 'Fluoroquinolone', 'Watch'),
  drug('ceftriaxone', 'Ceftriaxone', 'Cephalosporin', 'Watch'),
  drug('warfarin', 'Warfarin', 'Vitamin K antagonist', 'Not-classified', {
    pregnancyContraindicated: true,
  }),
  drug('nitrofurantoin', 'Nitrofurantoin', 'Nitrofuran', 'Access', {
    renal: [
      { crClMaxMlMin: 45, adjustment: 'Contraindicated when CrCl < 45 mL/min.', prohibited: true },
    ],
    hepatic: 'Use with caution in hepatic impairment; discontinue if hepatotoxicity.',
  }),
];
const interactions = [
  { slugA: 'ciprofloxacin', slugB: 'ceftriaxone', severity: 'major' },
] as unknown as DrugInteraction[];

function makeService(): DrugsService {
  const knowledge = {
    getDrugs: () => drugs,
    getInteractions: () => interactions,
  } as unknown as KnowledgeService;
  const svc = new DrugsService(knowledge);
  svc.onModuleInit();
  return svc;
}

describe('DrugsService.safetyReview', () => {
  let svc: DrugsService;
  beforeEach(() => {
    svc = makeService();
  });

  it('returns interactions, stewardship, duplicate-therapy, pregnancy flags and a summary', () => {
    const r = svc.safetyReview([
      'amoxicillin',
      'flucloxacillin',
      'ciprofloxacin',
      'ceftriaxone',
      'warfarin',
      'bogusdrug',
    ]);

    // pairwise interaction (major)
    expect(r.interactions).toHaveLength(1);
    expect(r.summary.majorInteractions).toBe(1);

    // AWaRe Watch/Reserve flagged (cipro + ceftriaxone)
    expect(r.stewardship.map((s) => s.slug).sort()).toEqual(['ceftriaxone', 'ciprofloxacin']);

    // duplicate therapy — two penicillins
    expect(r.duplicateTherapy).toHaveLength(1);
    expect(r.duplicateTherapy[0].drugClass).toBe('Penicillin');
    expect(r.duplicateTherapy[0].slugs.sort()).toEqual(['amoxicillin', 'flucloxacillin']);

    // pregnancy-contraindicated drug flagged
    expect(r.pregnancyContraindications.map((p) => p.slug)).toEqual(['warfarin']);
    expect(r.summary.pregnancyContraindicated).toBe(1);

    // unresolved slug surfaced, not silently dropped
    expect(r.unknownSlugs).toContain('bogusdrug');
    expect(r.summary.drugs).toBe(6);
  });

  it('clean list → no flags', () => {
    const r = svc.safetyReview(['amoxicillin', 'ciprofloxacin']);
    expect(r.duplicateTherapy).toHaveLength(0);
    expect(r.interactions).toHaveLength(0);
    expect(r.pregnancyContraindications).toHaveLength(0);
    expect(r.renalFlags).toHaveLength(0);
    expect(r.stewardship.map((s) => s.slug)).toEqual(['ciprofloxacin']);
  });

  it('flags a renal contraindication only when a CrCl is supplied', () => {
    // No CrCl → no renal flags, but hepatic guidance still surfaces.
    const withoutCrCl = svc.safetyReview(['nitrofurantoin', 'amoxicillin']);
    expect(withoutCrCl.renalFlags).toHaveLength(0);
    expect(withoutCrCl.hepaticGuidance.map((h) => h.slug)).toEqual(['nitrofurantoin']);

    // CrCl in the prohibited band → hard renal contraindication.
    const lowCrCl = svc.safetyReview(['nitrofurantoin', 'amoxicillin'], 20);
    expect(lowCrCl.renalFlags).toHaveLength(1);
    expect(lowCrCl.renalFlags[0].slug).toBe('nitrofurantoin');
    expect(lowCrCl.renalFlags[0].prohibited).toBe(true);
    expect(lowCrCl.summary.renalProhibited).toBe(1);

    // CrCl above the band → no renal flag.
    const goodCrCl = svc.safetyReview(['nitrofurantoin', 'amoxicillin'], 90);
    expect(goodCrCl.renalFlags).toHaveLength(0);
    expect(goodCrCl.summary.renalProhibited).toBe(0);
  });
});
