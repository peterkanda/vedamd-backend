import { describe, expect, it, beforeEach } from 'vitest';
import { ConditionsService } from '../src/modules/conditions/conditions.service';
import { makeKnowledgeService } from './helpers/knowledge';

describe('ConditionsService', () => {
  let svc: ConditionsService;

  beforeEach(() => {
    svc = new ConditionsService(makeKnowledgeService());
    svc.onModuleInit();
  });

  it('lists summaries without the deep content fields', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThan(0);
    for (const summary of list) {
      expect(summary.slug).toBeTruthy();
      expect(summary.title).toBeTruthy();
      expect(Array.isArray(summary.icd10)).toBe(true);
      expect('management' in summary).toBe(false);
      expect('presentation' in summary).toBe(false);
    }
  });

  it('filters by domain', () => {
    const ncds = svc.list({ domain: 'ncd' });
    expect(ncds.every((c) => c.slug.includes('hypertension') || c.slug.includes('diabetes'))).toBe(
      true,
    );
  });

  it('returns full guidance by slug', () => {
    const malaria = svc.get('malaria-uncomplicated-adult');
    expect(malaria).not.toBeNull();
    expect(malaria!.redFlags.length).toBeGreaterThan(0);
    expect(malaria!.management.length).toBeGreaterThan(0);
    expect(malaria!.evidenceLevel).toBeTruthy();
    expect(malaria!.reviewStatus).toBe('draft');
  });

  it('returns null for unknown slugs', () => {
    expect(svc.get('not-a-real-condition')).toBeNull();
  });

  it('seed content never contains patient identifiers', () => {
    const all = svc.list().map((s) => svc.get(s.slug)!);
    const forbiddenKeys = ['patient_id', 'patientId', 'mrn', 'dob', 'phone'];
    for (const guidance of all) {
      const serialized = JSON.stringify(guidance).toLowerCase();
      for (const key of forbiddenKeys) {
        expect(serialized.includes(`"${key}":`)).toBe(false);
      }
    }
  });
});
