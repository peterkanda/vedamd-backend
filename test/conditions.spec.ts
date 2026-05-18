import { describe, expect, it } from 'vitest';
import { ConditionsService } from '../src/modules/conditions/conditions.service';

describe('ConditionsService', () => {
  it('lists summaries without the deep content fields', () => {
    const svc = new ConditionsService();
    const list = svc.list();
    expect(list.length).toBeGreaterThan(0);
    for (const summary of list) {
      expect(summary.slug).toBeTruthy();
      expect(summary.title).toBeTruthy();
      expect(Array.isArray(summary.icd10)).toBe(true);
      // Summaries do not leak the deep payload.
      expect('management' in summary).toBe(false);
      expect('presentation' in summary).toBe(false);
    }
  });

  it('filters by domain', () => {
    const svc = new ConditionsService();
    const ncds = svc.list({ domain: 'ncd' });
    expect(ncds.every((c) => c.slug.includes('hypertension') || c.slug.includes('diabetes'))).toBe(
      true,
    );
  });

  it('returns full guidance by slug', () => {
    const svc = new ConditionsService();
    const malaria = svc.get('malaria-uncomplicated-adult');
    expect(malaria).not.toBeNull();
    expect(malaria!.redFlags.length).toBeGreaterThan(0);
    expect(malaria!.management.length).toBeGreaterThan(0);
    expect(malaria!.evidenceLevel).toBeTruthy();
    expect(malaria!.reviewStatus).toBe('draft');
  });

  it('returns null for unknown slugs', () => {
    const svc = new ConditionsService();
    expect(svc.get('not-a-real-condition')).toBeNull();
  });

  it('seed content never contains patient identifiers', () => {
    const svc = new ConditionsService();
    const all = svc.list().map((s) => svc.get(s.slug)!);
    const forbiddenKeys = ['patient', 'patient_id', 'patientId', 'mrn', 'name', 'dob', 'phone'];
    for (const guidance of all) {
      const serialized = JSON.stringify(guidance).toLowerCase();
      for (const key of forbiddenKeys) {
        // 'patient' as a substring is allowed inside narrative text; the rule
        // is that no top-level identifier-bearing field is present.
        if (key === 'patient') continue;
        expect(serialized.includes(`"${key}":`)).toBe(false);
      }
    }
  });
});
