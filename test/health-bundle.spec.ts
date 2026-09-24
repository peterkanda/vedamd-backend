import { describe, expect, it } from 'vitest';
import { NotImplementedException } from '@nestjs/common';
import { HealthController } from '../src/health/health.controller';
import { CdsEvaluateController } from '../src/modules/cds/cds-evaluate.controller';
import type { KnowledgeService } from '../src/modules/knowledge/knowledge.service';
import type { HealthCheckService } from '@nestjs/terminus';
import type { CdsService } from '../src/modules/cds/cds.service';

describe('health reports the content bundle', () => {
  // Run the indicators directly: the terminus service is not under test.
  const health = {
    check: async (fns: Array<() => unknown>) => fns.map((f) => f()),
  } as unknown as HealthCheckService;
  const withBundle = (verified: boolean) =>
    new HealthController(health, {
      getInfo: () => ({
        verified,
        version: 'v0.1.0',
        verificationStatus: verified ? 'ok' : 'bad-signature',
      }),
    } as unknown as KnowledgeService);

  it('is down when the bundle failed verification (it would serve zero rules)', async () => {
    const [res] = (await withBundle(false).check()) as unknown as Array<
      Record<string, { status: string }>
    >;
    expect(res.content_bundle.status).toBe('down');
  });

  it('is up with a verified bundle', async () => {
    const [res] = (await withBundle(true).check()) as unknown as Array<
      Record<string, { status: string }>
    >;
    expect(res.content_bundle.status).toBe('up');
  });
});

describe('POST /v1/cds/evaluate', () => {
  it('says it is not implemented instead of returning an empty "all clear"', () => {
    const ctl = new CdsEvaluateController({} as CdsService);
    expect(() => ctl.evaluate({})).toThrow(NotImplementedException);
  });
});
