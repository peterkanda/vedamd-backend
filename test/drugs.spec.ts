import { describe, expect, it } from 'vitest';
import { DrugsService } from '../src/modules/drugs/drugs.service';

describe('DrugsService', () => {
  it('lists summaries without the deep content fields', () => {
    const svc = new DrugsService();
    const list = svc.list();
    expect(list.length).toBeGreaterThan(0);
    for (const summary of list) {
      expect(summary.slug).toBeTruthy();
      expect(summary.inn).toBeTruthy();
      expect('indications' in summary).toBe(false);
      expect('dosing' in summary).toBe(false);
    }
  });

  it('filters by ATC code (exact)', () => {
    const svc = new DrugsService();
    const ccbs = svc.list({ atc: 'C08CA01' });
    expect(ccbs.length).toBe(1);
    expect(ccbs[0].slug).toBe('amlodipine');
  });

  it('filters by AWaRe category', () => {
    const svc = new DrugsService();
    const access = svc.list({ aware: 'Access' });
    expect(access.map((d) => d.slug)).toContain('amoxicillin');
  });

  it('returns a full record by slug', () => {
    const svc = new DrugsService();
    const metformin = svc.get('metformin');
    expect(metformin).not.toBeNull();
    expect(metformin!.dosing.renal?.length).toBeGreaterThan(0);
    expect(metformin!.contraindications.length).toBeGreaterThan(0);
  });

  it('returns null for unknown slugs', () => {
    const svc = new DrugsService();
    expect(svc.get('not-a-real-drug')).toBeNull();
  });

  it('finds the seeded paracetamol-warfarin interaction order-independently', () => {
    const svc = new DrugsService();
    const a = svc.checkInteractions(['paracetamol', 'warfarin']);
    const b = svc.checkInteractions(['warfarin', 'paracetamol']);
    expect(a.interactions.length).toBe(1);
    expect(b.interactions.length).toBe(1);
    expect(a.interactions[0].severity).toBe('moderate');
  });

  it('reports unknown slugs separately from interaction results', () => {
    const svc = new DrugsService();
    const res = svc.checkInteractions(['paracetamol', 'unobtanium']);
    expect(res.unknownSlugs).toEqual(['unobtanium']);
    expect(res.interactions).toEqual([]);
  });

  it('returns no interactions when only one drug supplied', () => {
    const svc = new DrugsService();
    const res = svc.checkInteractions(['paracetamol']);
    expect(res.interactions).toEqual([]);
  });

  it('seed records never contain patient-identifier fields', () => {
    const svc = new DrugsService();
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
