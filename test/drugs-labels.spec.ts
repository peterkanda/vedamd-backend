import { describe, expect, it, vi } from 'vitest';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import type { ManufacturerLabel, PpbSmpcLink } from '../src/modules/drugs/drugs.types';
import { makeKnowledgeService } from './helpers/knowledge';

/**
 * GET /v1/drugs/:slug/labels — manufacturer labels are reference-only and must
 * obey the same approval gate as the rest of the bundle.
 */

const label = (slug: string, reviewStatus: ManufacturerLabel['reviewStatus']) =>
  ({
    slug,
    reviewStatus,
    jurisdiction: 'US',
    source: 'openfda',
    setId: `${slug}-${reviewStatus}`,
  }) as ManufacturerLabel;
const link = (slug: string, reviewStatus?: PpbSmpcLink['reviewStatus']): PpbSmpcLink => ({
  slug,
  title: `${slug} SmPC`,
  url: `https://products.pharmacyboardkenya.org/uploads/${slug}.pdf`,
  matchedOn: 'inn',
  confidence: 'high',
  ...(reviewStatus ? { reviewStatus } : {}),
});

function service(requireApproved: boolean) {
  const knowledge = makeKnowledgeService();
  vi.spyOn(knowledge, 'requiresApproved').mockReturnValue(requireApproved);
  vi.spyOn(knowledge, 'getManufacturerLabels').mockReturnValue([
    label('amoxicillin', 'draft'),
    label('amoxicillin', 'approved'),
    label('paracetamol', 'draft'),
  ]);
  vi.spyOn(knowledge, 'getPpbSmpcLinks').mockReturnValue([
    link('amoxicillin'),
    link('amoxicillin', 'approved'),
  ]);
  const svc = new DrugsService(knowledge);
  svc.onModuleInit();
  return svc;
}

describe('DrugsService.getLabels', () => {
  it('returns null for an unknown drug', () => {
    expect(service(false).getLabels('not-a-drug')).toBeNull();
  });

  it('returns only the requested drug’s labels and links, with the jurisdiction notice', () => {
    const res = service(false).getLabels('amoxicillin')!;
    expect(res.labels.map((l) => l.setId)).toEqual(['amoxicillin-draft', 'amoxicillin-approved']);
    expect(res.ppbSmpcLinks).toHaveLength(2);
    expect(res.notice).toMatch(/reference-only/);
    expect(res.notice).toMatch(/Kenya/);
  });

  it('withholds anything not explicitly approved in approved-only mode', () => {
    const res = service(true).getLabels('amoxicillin')!;
    expect(res.labels.map((l) => l.setId)).toEqual(['amoxicillin-approved']);
    expect(res.ppbSmpcLinks.map((l) => l.reviewStatus)).toEqual(['approved']);
  });

  it('is empty (not an error) for a known drug with no labels — the shipped bundle today', () => {
    const svc = new DrugsService(makeKnowledgeService());
    svc.onModuleInit();
    expect(svc.getLabels('metformin')).toMatchObject({
      slug: 'metformin',
      labels: [],
      ppbSmpcLinks: [],
    });
  });
});
