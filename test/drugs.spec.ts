import { describe, expect, it, beforeEach } from 'vitest';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import { makeKnowledgeService } from './helpers/knowledge';

describe('DrugsService', () => {
  let svc: DrugsService;

  beforeEach(() => {
    svc = new DrugsService(makeKnowledgeService());
    svc.onModuleInit();
  });

  it('lists summaries without the deep content fields', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThanOrEqual(700);
    for (const summary of list) {
      expect(summary.slug).toBeTruthy();
      expect(summary.inn).toBeTruthy();
      expect('indications' in summary).toBe(false);
      expect('dosing' in summary).toBe(false);
    }
  });

  it('bundle contains the expanded interaction catalogue', () => {
    const drugs = svc.list();
    // pick any two existing slugs and ensure interaction catalogue is populated
    const slugs = drugs.map((d) => d.slug);
    expect(slugs.length).toBeGreaterThanOrEqual(700);
    // Sanity: known interaction pair
    const res = svc.checkInteractions(['warfarin', 'amiodarone']);
    expect(res.interactions.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by ATC code (exact)', () => {
    const ccbs = svc.list({ atc: 'C08CA01' });
    expect(ccbs.length).toBe(1);
    expect(ccbs[0].slug).toBe('amlodipine');
  });

  it('filters by AWaRe category', () => {
    const access = svc.list({ aware: 'Access' });
    expect(access.map((d) => d.slug)).toContain('amoxicillin');
  });

  it('returns a full record by slug', () => {
    const metformin = svc.get('metformin');
    expect(metformin).not.toBeNull();
    expect(metformin!.dosing.renal?.length).toBeGreaterThan(0);
    expect(metformin!.contraindications.length).toBeGreaterThan(0);
  });

  it('returns null for unknown slugs', () => {
    expect(svc.get('not-a-real-drug')).toBeNull();
  });

  it('finds the seeded paracetamol-warfarin interaction order-independently', () => {
    const a = svc.checkInteractions(['paracetamol', 'warfarin']);
    const b = svc.checkInteractions(['warfarin', 'paracetamol']);
    expect(a.interactions.length).toBe(1);
    expect(b.interactions.length).toBe(1);
    expect(a.interactions[0].severity).toBe('moderate');
  });

  it('reports unknown slugs separately from interaction results', () => {
    const res = svc.checkInteractions(['paracetamol', 'unobtanium']);
    expect(res.unknownSlugs).toEqual(['unobtanium']);
    expect(res.interactions).toEqual([]);
  });

  it('fires interactions whose agent has no drug monograph (regression)', () => {
    // dipyridamole has no record in drugs.json, but the bundle carries a
    // MAJOR adenosine–dipyridamole interaction. Pre-fix, the monograph
    // filter ran before the pair scan and silently suppressed it.
    const res = svc.checkInteractions(['adenosine', 'dipyridamole']);
    expect(res.interactions.length).toBe(1);
    expect(res.interactions[0].severity).toBe('major');
    // The slug participates in interaction content, so it is not "unknown".
    expect(res.unknownSlugs).toEqual([]);
  });

  it('returns no interactions when only one drug supplied', () => {
    const res = svc.checkInteractions(['paracetamol']);
    expect(res.interactions).toEqual([]);
  });

  it('seed records never contain patient-identifier fields', () => {
    const all = svc.list().map((s) => svc.get(s.slug)!);
    const forbidden = ['patient_id', 'patientId', 'mrn', 'dob', 'phone'];
    for (const rec of all) {
      const serialized = JSON.stringify(rec).toLowerCase();
      for (const key of forbidden) {
        expect(serialized.includes(`"${key}":`)).toBe(false);
      }
    }
  });
});
