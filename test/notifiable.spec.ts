import { beforeEach, describe, expect, it } from 'vitest';
import { NotifiableService } from '../src/modules/notifiable/notifiable.service';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): NotifiableService {
  const svc = new NotifiableService(makeKnowledgeService());
  svc.onModuleInit();
  return svc;
}

describe('NotifiableService', () => {
  let svc: NotifiableService;
  beforeEach(() => {
    svc = makeService();
  });

  it('loads the open notifiable-disease reference from the signed bundle', () => {
    const list = svc.list();
    expect(list.length).toBeGreaterThan(15);
    expect(list.map((n) => n.slug)).toContain('cholera');
  });

  it('returns full detail from get()', () => {
    const n = svc.get('cholera');
    expect(n).not.toBeNull();
    expect(n!.level).toBe('ihr-assess');
    expect(n!.timeframe.length).toBeGreaterThan(0);
    expect(n!.references.length).toBeGreaterThan(0);
  });

  it('filters by notification level', () => {
    const always = svc.list({ level: 'ihr-always' });
    expect(always.length).toBeGreaterThan(0);
    expect(always.every((n) => n.level === 'ihr-always')).toBe(true);
    expect(always.map((n) => n.slug)).toContain('poliomyelitis-wild');
  });

  it('returns null for an unknown slug', () => {
    expect(svc.get('not-a-real-disease')).toBeNull();
  });
});
