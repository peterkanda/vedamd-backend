import { describe, expect, it, beforeEach } from 'vitest';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import type { KnowledgeService } from '../src/modules/knowledge/knowledge.service';
import type { DrugInteraction, DrugRecord } from '../src/modules/drugs/drugs.types';

/**
 * Holistic medication safety review — interactions + AWaRe stewardship +
 * duplicate-therapy in one panel (the world-class point-of-care feature).
 */

const drug = (
  slug: string,
  inn: string,
  drugClass: string,
  aware: DrugRecord['awareCategory'],
  pregnancyContraindicated = false,
) =>
  ({
    slug,
    inn,
    drugClass,
    awareCategory: aware,
    atc: [],
    tradeNames: [],
    pregnancy: {
      contraindicated: pregnancyContraindicated,
      notes: pregnancyContraindicated ? 'Teratogenic — avoid in pregnancy.' : 'No specific risk.',
    },
  }) as unknown as DrugRecord;

const drugs: DrugRecord[] = [
  drug('amoxicillin', 'Amoxicillin', 'Penicillin', 'Access'),
  drug('flucloxacillin', 'Flucloxacillin', 'Penicillin', 'Access'),
  drug('ciprofloxacin', 'Ciprofloxacin', 'Fluoroquinolone', 'Watch'),
  drug('ceftriaxone', 'Ceftriaxone', 'Cephalosporin', 'Watch'),
  drug('warfarin', 'Warfarin', 'Vitamin K antagonist', 'Not-classified', true),
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
    expect(r.stewardship.map((s) => s.slug)).toEqual(['ciprofloxacin']);
  });
});
