import { beforeEach, describe, expect, it } from 'vitest';
import { AntidotesService } from '../src/modules/antidotes/antidotes.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): AntidotesService {
  const svc = new AntidotesService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('AntidotesService', () => {
  let svc: AntidotesService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the open antidote catalogue from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThan(12);
    expect(list.map((a) => a.slug)).toContain('paracetamol-nac');
  });

  it('returns mechanism, dosing and the antidote drug slug from get()', () => {
    const a = svc.get('paracetamol-nac');
    expect(a).not.toBeNull();
    expect(a!.antidoteDrugSlug).toBe('n-acetylcysteine');
    expect(a!.mechanism.length).toBeGreaterThan(0);
    expect(a!.dosing.length).toBeGreaterThan(0);
    expect(a!.references.length).toBeGreaterThan(0);
  });

  it('filters by poison and by antidote drug slug', () => {
    expect(svc.list({ poison: 'opioid' }).map((a) => a.slug)).toContain('opioid-naloxone');
    expect(svc.list({ antidote: 'naloxone' }).map((a) => a.slug)).toContain('opioid-naloxone');
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-antidote')).toBeNull();
  });
});
