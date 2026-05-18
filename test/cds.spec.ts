import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CdsService } from '../src/modules/cds/cds.service';
import { PhiFreeLogger } from '../src/common/phi-free-logger';
import type { AppConfig } from '../src/config/configuration';

function makeService(): CdsService {
  const config = {
    get: (key: string) => {
      if (key === 'stateless.capabilityExtensionUrl') {
        return 'http://vedamd.io/CapabilityStatement/stateless';
      }
      if (key === 'audit.hashSecret') return 'test-secret';
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
  const log = new PhiFreeLogger({ service: 'test', hashSecret: 'test-secret', strict: true });
  return new CdsService(config, log);
}

describe('CdsService', () => {
  it('exposes a CDS Hooks service descriptor list', () => {
    const svc = makeService();
    const services = svc.listServices();
    expect(services.length).toBeGreaterThan(0);
    for (const s of services) {
      expect(s.id).toBeTruthy();
      expect(s.hook).toBeTruthy();
      expect(s.title).toBeTruthy();
    }
  });

  it('returns an empty card set for unknown service ids', async () => {
    const svc = makeService();
    const res = await svc.evaluateHook('does-not-exist', {
      hook: 'patient-view',
      hookInstance: 'x',
      context: {},
    });
    expect(res.cards).toEqual([]);
  });

  it('declares stateless: true in its CapabilityStatement (FR-093)', () => {
    const svc = makeService();
    const cap = svc.capabilityStatement();
    expect(cap.resourceType).toBe('CapabilityStatement');
    expect(cap.extension).toContainEqual({
      url: 'http://vedamd.io/CapabilityStatement/stateless',
      valueBoolean: true,
    });
  });
});
