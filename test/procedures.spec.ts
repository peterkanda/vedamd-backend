import { describe, expect, it, beforeEach } from 'vitest';
import { ProceduresService } from '../src/modules/procedures/procedures.service';
import { makeKnowledgeService } from './helpers/knowledge';

describe('ProceduresService', () => {
  let svc: ProceduresService;

  beforeEach(() => {
    svc = new ProceduresService(makeKnowledgeService());
    svc.onModuleInit();
  });

  it('lists summaries without deep content fields', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThan(0);
    for (const s of list) {
      expect(s.slug).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(Array.isArray(s.domains)).toBe(true);
      expect('steps' in s).toBe(false);
      expect('complications' in s).toBe(false);
    }
  });

  it('filters by domain', () => {
    const emergency = svc.list({ domain: 'emergency' });
    for (const s of emergency) expect(s.domains).toContain('emergency');
    expect(emergency.length).toBeGreaterThan(0);
  });

  it('free-text search matches across title and slug', () => {
    const matches = svc.list({ q: 'lumbar' });
    expect(matches.some((s) => s.slug.includes('lumbar'))).toBe(true);
  });

  it('returns full guidance by slug', () => {
    const lp = svc.get('lumbar-puncture-adult');
    expect(lp).not.toBeNull();
    expect(lp!.steps.length).toBeGreaterThan(0);
    expect(lp!.contraindications.absolute.length).toBeGreaterThan(0);
    expect(lp!.complications.length).toBeGreaterThan(0);
    expect(lp!.reviewStatus).toBe('draft');
  });

  it('returns null for unknown slugs', () => {
    expect(svc.get('not-a-real-procedure')).toBeNull();
  });

  it('every record has a non-empty consent note and at least one safety check step', () => {
    const all = svc.list().map((s) => svc.get(s.slug)!);
    for (const p of all) {
      expect(p.consentNotes.length).toBeGreaterThan(0);
      const hasSafety = p.steps.some((step) => !!step.safetyCheck);
      expect(hasSafety).toBe(true);
    }
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
