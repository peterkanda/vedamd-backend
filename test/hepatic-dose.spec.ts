import { beforeEach, describe, expect, it } from 'vitest';
import { HepaticDoseService } from '../src/modules/hepatic-dose/hepatic-dose.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): HepaticDoseService {
  const svc = new HepaticDoseService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('HepaticDoseService', () => {
  let svc: HepaticDoseService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the hepatic-dose catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThanOrEqual(100);
    const slugs = list.map((r) => r.slug);
    // Anti-hallucination guard: the highest-stakes drugs in liver disease.
    for (const required of [
      'paracetamol-hepatic',     // common, max 2 g/day in cirrhosis
      'ibuprofen-hepatic',       // HRS / variceal risk
      'morphine-hepatic',        // accumulation -> encephalopathy
      'benzodiazepines-hepatic', // glucuronidated vs CYP3A distinction
      'doacs-hepatic',           // C-P C contraindicated
      'metformin-hepatic',       // lactic acidosis in decompensated
      'rifampicin-hepatic',      // intrinsic hepatotoxicity
      'spironolactone-hepatic',  // first-line in ascites
      'propranolol-hepatic',     // variceal prophylaxis
      'phenytoin-hepatic',       // free vs total levels in cirrhosis
      'tacrolimus-hepatic',      // post-transplant
      'tramadol-hepatic',        // seizure + serotonin syndrome
    ]) {
      expect(slugs).toContain(required);
    }
  });

  it('every record carries guidance for all three Child-Pugh classes', () => {
    for (const r of svc.list()) {
      const full = svc.get(r.slug)!;
      const classes = full.guidance.map((g) => g.class);
      expect(classes).toContain('A');
      expect(classes).toContain('B');
      expect(classes).toContain('C');
    }
  });

  it('reverse-lookup by drug slug works', () => {
    const r = svc.getByDrugSlug('apixaban');
    expect(r).not.toBeNull();
    expect(r!.slug).toBe('doacs-hepatic');
    expect(r!.worstClassDecision).toBe('contraindicated');
  });

  it('filters by worstClassDecision', () => {
    const avoid = svc.list({ decision: 'avoid' });
    expect(avoid.length).toBeGreaterThan(0);
    for (const r of avoid) expect(r.worstClassDecision).toBe('avoid');
    expect(avoid.map((r) => r.slug)).toEqual(
      expect.arrayContaining(['ibuprofen-hepatic', 'metformin-hepatic']),
    );
  });

  it('returns null for unknown slug / drug', () => {
    expect(svc.get('not-real')).toBeNull();
    expect(svc.getByDrugSlug('not-real')).toBeNull();
  });
});
