import { beforeEach, describe, expect, it } from 'vitest';
import { ToxidromesService } from '../src/modules/toxidromes/toxidromes.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): ToxidromesService {
  const svc = new ToxidromesService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('ToxidromesService', () => {
  let svc: ToxidromesService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the toxidrome catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThanOrEqual(30);
    const slugs = list.map((t) => t.slug);
    // Anti-hallucination guard: these eight syndromes are the patient-safety
    // floor; if a content edit accidentally drops one, the test fails loudly.
    for (const required of [
      'anticholinergic-toxidrome',
      'cholinergic-toxidrome',
      'opioid-toxidrome',
      'sympathomimetic-toxidrome',
      'sedative-hypnotic-toxidrome',
      'serotonin-syndrome',
      'neuroleptic-malignant-syndrome',
      'salicylate-toxidrome',
    ]) {
      expect(slugs).toContain(required);
    }
  });

  it('returns full pattern + management + red flags from get()', () => {
    const t = svc.get('cholinergic-toxidrome');
    expect(t).not.toBeNull();
    expect(t!.features.pupils).toMatch(/miosis/i);
    expect(t!.causativeAgents.length).toBeGreaterThan(0);
    expect(t!.differentialDiagnosis.length).toBeGreaterThan(0);
    expect(t!.management.length).toBeGreaterThan(0);
    expect(t!.redFlags.length).toBeGreaterThan(0);
    expect(t!.references.length).toBeGreaterThan(0);
  });

  it('links to the antidote record when one exists (opioid -> naloxone)', () => {
    const t = svc.get('opioid-toxidrome');
    expect(t!.antidoteSlug).toBe('opioid-naloxone');
  });

  it('filters by free-text query against name + agents + one-liner', () => {
    expect(svc.list({ q: 'organophosphate' }).map((t) => t.slug)).toContain(
      'cholinergic-toxidrome',
    );
    expect(svc.list({ q: 'clonus' }).map((t) => t.slug)).toContain('serotonin-syndrome');
    expect(svc.list({ q: 'tinnitus' }).map((t) => t.slug)).toContain('salicylate-toxidrome');
  });

  it('filters by domain', () => {
    expect(svc.list({ domain: 'toxicology' }).length).toBeGreaterThanOrEqual(30);
    expect(svc.list({ domain: 'psychiatry' }).map((t) => t.slug)).toContain('serotonin-syndrome');
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-toxidrome')).toBeNull();
  });
});
