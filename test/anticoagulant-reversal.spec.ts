import { beforeEach, describe, expect, it } from 'vitest';
import { AnticoagulantReversalService } from '../src/modules/anticoagulant-reversal/anticoagulant-reversal.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): AnticoagulantReversalService {
  const svc = new AnticoagulantReversalService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('AnticoagulantReversalService', () => {
  let svc: AnticoagulantReversalService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the reversal catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThanOrEqual(30);
    const slugs = list.map((r) => r.slug);
    // Anti-hallucination guard: these nine reversal records are the
    // patient-safety floor — every anticoagulant a clinician will see
    // bleeding on. If a content edit drops one, the test fails loudly.
    for (const required of [
      'warfarin-reversal',
      'dabigatran-reversal',
      'apixaban-reversal',
      'rivaroxaban-reversal',
      'edoxaban-reversal',
      'unfractionated-heparin-reversal',
      'lmwh-reversal',
      'fondaparinux-reversal',
      'alteplase-reversal',
    ]) {
      expect(slugs).toContain(required);
    }
  });

  it('returns mechanism, urgency-ordered protocols, pitfalls and citations from get()', () => {
    const r = svc.get('warfarin-reversal');
    expect(r).not.toBeNull();
    expect(r!.mechanism.length).toBeGreaterThan(0);
    expect(r!.protocols.length).toBeGreaterThanOrEqual(3);
    // First protocol must be life-threatening — clinician reaching for this
    // at 3 a.m. needs the worst case first.
    expect(r!.protocols[0].urgency).toBe('life-threatening-bleed');
    expect(r!.protocols[0].dosing.length).toBeGreaterThan(0);
    expect(r!.pitfalls.length).toBeGreaterThan(0);
    expect(r!.references.length).toBeGreaterThan(0);
  });

  it('links anticoagulant to its drug record where one exists', () => {
    const r = svc.get('apixaban-reversal');
    expect(r!.anticoagulantDrugSlug).toBe('apixaban');
  });

  it('filters by free-text query against agents + class + one-liner', () => {
    expect(svc.list({ q: 'idarucizumab' }).map((r) => r.slug)).toContain('dabigatran-reversal');
    expect(svc.list({ q: 'andexanet' }).map((r) => r.slug)).toEqual(
      expect.arrayContaining(['apixaban-reversal', 'rivaroxaban-reversal']),
    );
    expect(svc.list({ q: 'cryoprecipitate' }).map((r) => r.slug)).toContain('alteplase-reversal');
  });

  it('filters by drug class substring', () => {
    expect(svc.list({ drugClass: 'DOAC' }).length).toBeGreaterThanOrEqual(4);
    expect(svc.list({ drugClass: 'fibrinolytic' }).map((r) => r.slug)).toContain(
      'alteplase-reversal',
    );
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-reversal')).toBeNull();
  });
});
