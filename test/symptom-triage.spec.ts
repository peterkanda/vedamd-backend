import { beforeEach, describe, expect, it } from 'vitest';
import { SymptomTriageService } from '../src/modules/symptom-triage/symptom-triage.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): SymptomTriageService {
  const svc = new SymptomTriageService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('SymptomTriageService', () => {
  let svc: SymptomTriageService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the symptom-triage catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThanOrEqual(80);
    const slugs = list.map((r) => r.slug);
    // Anti-hallucination guard: the most-common chief complaints with
    // catastrophic differentials. If a content edit drops one, fail loudly.
    for (const required of [
      'adult-chest-pain',
      'adult-shortness-of-breath',
      'adult-abdominal-pain',
      'adult-headache',
      'paediatric-fever-under5',
      'adult-acute-back-pain',
      'adult-syncope',
      'adult-altered-mental-status',
    ]) {
      expect(slugs).toContain(required);
    }
  });

  it('returns ranked differential with must-not-miss + red flags from get()', () => {
    const r = svc.get('adult-chest-pain');
    expect(r).not.toBeNull();
    // The "killer DDx" — ACS, PE, aortic dissection — must all be flagged
    // as must-not-miss. Test fence-posts against accidental downgrade.
    const mustNotMiss = r!.differential.filter((d) => d.likelihood === 'must-not-miss');
    expect(mustNotMiss.length).toBeGreaterThanOrEqual(3);
    const labels = mustNotMiss.map((d) => d.diagnosis.toLowerCase()).join(' | ');
    expect(labels).toMatch(/acute coronary syndrome|acs/);
    expect(labels).toMatch(/pulmonary embolism/);
    expect(labels).toMatch(/aortic dissection/);
    expect(r!.redFlags.length).toBeGreaterThan(0);
    expect(r!.initialInvestigations.length).toBeGreaterThan(0);
    expect(r!.disposition.length).toBeGreaterThan(0);
    expect(r!.references.length).toBeGreaterThan(0);
  });

  it('paediatric fever returns paediatric-specific differential + traffic-light disposition', () => {
    const r = svc.get('paediatric-fever-under5');
    expect(r!.populationScope).toBe('paediatric');
    const ddxLabels = r!.differential.map((d) => d.diagnosis.toLowerCase()).join(' | ');
    expect(ddxLabels).toMatch(/meningococcal|sepsis/);
    expect(ddxLabels).toMatch(/uti|urinary tract/);
    expect(r!.disposition).toMatch(/traffic-light|amber|red|green/i);
  });

  it('filters by population scope', () => {
    const paeds = svc.list({ population: 'paediatric' });
    expect(paeds.map((r) => r.slug)).toContain('paediatric-fever-under5');
    for (const r of paeds) expect(r.populationScope).toBe('paediatric');
  });

  it('filters by free-text query', () => {
    expect(svc.list({ q: 'chest' }).map((r) => r.slug)).toContain('adult-chest-pain');
    expect(svc.list({ q: 'cauda equina' }).map((r) => r.slug)).toContain('adult-acute-back-pain');
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-complaint')).toBeNull();
  });
});
