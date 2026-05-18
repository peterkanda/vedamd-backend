import { describe, expect, it } from 'vitest';
import { CdsService } from '../src/modules/cds/cds.service';

describe('CdsService', () => {
  it('exposes a CDS Hooks service descriptor list', () => {
    const svc = new CdsService();
    const services = svc.listServices();
    expect(services.length).toBeGreaterThan(0);
    for (const s of services) {
      expect(s.id).toBeTruthy();
      expect(s.hook).toBeTruthy();
      expect(s.title).toBeTruthy();
    }
  });

  it('returns an empty card set for unknown service ids', async () => {
    const svc = new CdsService();
    const res = await svc.evaluateHook('does-not-exist', {
      hook: 'patient-view',
      hookInstance: 'x',
      context: {},
    });
    expect(res.cards).toEqual([]);
  });
});
