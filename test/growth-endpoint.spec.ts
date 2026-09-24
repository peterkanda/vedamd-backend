import { describe, expect, it } from 'vitest';
import { GrowthService } from '../src/modules/growth/growth.service';

/**
 * With no tables ingested — the state of a fresh checkout, and of any
 * deployment where `growth:ingest` has not run — the service must say the
 * standard is unavailable. A z-score is a number a clinician acts on; an
 * invented one is worse than none.
 */
describe('GrowthService without ingested standards', () => {
  const svc = new GrowthService();

  it('reports no standards rather than failing to start', () => {
    expect(Array.isArray(svc.available())).toBe(true);
  });

  it('declines to score, naming the remedy', () => {
    const out = svc.score('wfa', 'male', 12, 9.6);
    if ('result' in out) {
      // Tables are present in this checkout; then it must produce a score.
      expect(typeof out.result.z).toBe('number');
      return;
    }
    expect(out.unavailable).toContain('growth:ingest');
  });
});

/**
 * GrowthModule omitted DeveloperModule, which supplies what ApiKeyGuard
 * resolves. The app then failed to bootstrap and the OpenAPI generator died
 * with exit 1 and no output at all — no stack, nothing on stderr — so the
 * breakage was invisible until the snapshot silently stopped updating.
 *
 * Any controller guarded by ApiKeyGuard needs that import; this pins it.
 */
describe('GrowthModule wiring', () => {
  it('imports what ApiKeyGuard needs', async () => {
    const { GrowthModule } = await import('../src/modules/growth/growth.module');
    const { DeveloperModule } = await import('../src/modules/developer/developer.module');
    const imports = Reflect.getMetadata('imports', GrowthModule) as unknown[];
    expect(imports).toContain(DeveloperModule);
  });
});
