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
  paediatric?: {
    mgPerKgPerDose: number;
    maxMgPerKgPerDay?: number;
    maxMgPerDose?: number;
    minWeightKg?: number;
    route: string;
    frequency: string;
  };
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
    dosing: {
      adult: [],
      renal: opts.renal,
      hepatic: opts.hepatic,
      paediatric: opts.paediatric,
    },
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
  drug('paracetamol', 'Paracetamol', 'Analgesic', 'Not-classified', {
    paediatric: {
      mgPerKgPerDose: 15,
      maxMgPerKgPerDay: 60,
      maxMgPerDose: 1000,
      route: 'oral',
      frequency: 'every 6 h',
    },
  }),
  drug('gentamicin', 'Gentamicin', 'Aminoglycoside', 'Watch', {
    // No maxMgPerDose → uncapped, flagged for senior review.
    paediatric: { mgPerKgPerDose: 7, route: 'IV', frequency: 'once daily' },
  }),
];
const interactions = [
  { slugA: 'ciprofloxacin', slugB: 'ceftriaxone', severity: 'major' },
  { slugA: 'warfarin', slugB: 'nitrofurantoin', severity: 'contraindicated' },
] as unknown as DrugInteraction[];

const drugDisease = [
  {
    slug: 'nitrofurantoin--chronic-kidney-disease',
    drugSlug: 'nitrofurantoin',
    drug: 'Nitrofurantoin',
    condition: 'Chronic kidney disease',
    conditionSlug: 'chronic-kidney-disease',
    severity: 'contraindicated',
    mechanism: 'Ineffective and toxic metabolites accumulate when CrCl is low.',
    recommendation: 'Avoid in CKD with eGFR < 45.',
    references: [{ label: 'BNF', strength: 'A' }],
  },
  {
    // Class-level match: any Fluoroquinolone in this condition.
    slug: 'fluoroquinolone--myasthenia-gravis',
    drugSlug: 'ciprofloxacin',
    drug: 'Fluoroquinolones',
    condition: 'Myasthenia gravis',
    conditionSlug: 'myasthenia-gravis',
    severity: 'caution',
    mechanism: 'May exacerbate muscle weakness.',
    recommendation: 'Avoid where alternatives exist.',
    references: [],
    drugClass: 'Fluoroquinolone',
  },
];

function makeService(): DrugsService {
  const knowledge = {
    getDrugs: () => drugs,
    getInteractions: () => interactions,
    getDrugDiseaseInteractions: () => drugDisease,
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

  it('computes paediatric weight-based dosing and flags uncapped drugs', () => {
    // 20 kg child — both paracetamol (capped) and gentamicin (uncapped) dose.
    const child = svc.safetyReview(['paracetamol', 'gentamicin'], undefined, 20);
    const bySlug = new Map(child.paediatricDosing.map((p) => [p.slug, p]));

    // paracetamol: 20 kg × 15 mg/kg = 300 mg; daily max 60 × 20 = 1200 mg; capped.
    expect(bySlug.get('paracetamol')?.mgPerDose).toBe(300);
    expect(bySlug.get('paracetamol')?.maxMgPerDay).toBe(1200);
    expect(bySlug.get('paracetamol')?.uncapped).toBe(false);

    // gentamicin: 20 kg × 7 mg/kg = 140 mg; no absolute ceiling → uncapped.
    expect(bySlug.get('gentamicin')?.mgPerDose).toBe(140);
    expect(bySlug.get('gentamicin')?.uncapped).toBe(true);
    expect(child.summary.paediatricUncapped).toBe(1);
  });

  it('omits paediatric dosing without a weight or for adult weights', () => {
    expect(svc.safetyReview(['paracetamol', 'gentamicin']).paediatricDosing).toHaveLength(0);
    // 70 kg → adult path, no paediatric dosing.
    expect(
      svc.safetyReview(['paracetamol', 'gentamicin'], undefined, 70).paediatricDosing,
    ).toHaveLength(0);
  });

  it('flags drug-disease contraindications only when patient conditions are supplied', () => {
    // No conditions → no flags.
    expect(svc.safetyReview(['nitrofurantoin', 'ciprofloxacin']).drugDiseaseFlags).toHaveLength(0);

    // CKD → nitrofurantoin contraindicated (matched by drug slug).
    const ckd = svc.safetyReview(['nitrofurantoin', 'ciprofloxacin'], undefined, undefined, [
      'chronic-kidney-disease',
    ]);
    expect(ckd.drugDiseaseFlags).toHaveLength(1);
    expect(ckd.drugDiseaseFlags[0].drugSlug).toBe('nitrofurantoin');
    expect(ckd.drugDiseaseFlags[0].severity).toBe('contraindicated');
    expect(ckd.summary.drugDiseaseContraindicated).toBe(1);

    // Myasthenia → ciprofloxacin caution (matched by drug class).
    const mg = svc.safetyReview(['nitrofurantoin', 'ciprofloxacin'], undefined, undefined, [
      'myasthenia-gravis',
    ]);
    expect(mg.drugDiseaseFlags.map((f) => f.condition)).toEqual(['Myasthenia gravis']);
    expect(mg.drugDiseaseFlags[0].severity).toBe('caution');
    expect(mg.summary.drugDiseaseContraindicated).toBe(0);

    // A condition no listed drug interacts with → no flags.
    expect(
      svc.safetyReview(['nitrofurantoin', 'ciprofloxacin'], undefined, undefined, ['asthma'])
        .drugDiseaseFlags,
    ).toHaveLength(0);
  });

  it('counts a contraindicated interaction as both major and contraindicated', () => {
    const r = svc.safetyReview(['warfarin', 'nitrofurantoin']);
    expect(r.interactions).toHaveLength(1);
    expect(r.interactions[0].severity).toBe('contraindicated');
    // contraindicated is the most severe grade — it must count as major
    // (never silently excluded) and also in its own bucket.
    expect(r.summary.majorInteractions).toBe(1);
    expect(r.summary.contraindicatedInteractions).toBe(1);
  });
});
