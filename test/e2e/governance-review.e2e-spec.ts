import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';
import { OperatorAuthGuard } from '../../src/common/operator-auth';
import { DRIZZLE } from '../../src/db/database.module';
import { GovernanceController } from '../../src/modules/governance/governance.controller';
import { GovernanceService } from '../../src/modules/governance/governance.service';
import { ContentReviewService } from '../../src/modules/governance/content-review.service';
import { KnowledgeService } from '../../src/modules/knowledge/knowledge.service';
import { makeKnowledgeService } from '../helpers/knowledge';

/**
 * HTTP contract for release readiness and the clinical review queue, over a
 * real Fastify instance with the committed bundle and no database. The
 * operator guard is replaced by one that attaches a verified-looking operator
 * from a test header — OIDC itself is covered in app.e2e-spec.ts. What this
 * proves: routing, query validation, status codes, and that reviewer identity
 * comes from the authenticated operator.
 */

let app: NestFastifyApplication;

interface InjectResponse {
  statusCode: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: () => any;
}

const inject = (
  method: 'GET' | 'POST',
  url: string,
  opts: { sub?: string; body?: unknown } = {},
): Promise<InjectResponse> =>
  (
    app.getHttpAdapter().getInstance() as unknown as {
      inject: (o: unknown) => Promise<InjectResponse>;
    }
  ).inject({
    method,
    url,
    headers: opts.sub ? { 'x-test-sub': opts.sub } : {},
    ...(opts.body !== undefined ? { payload: opts.body } : {}),
  });

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [GovernanceController],
    providers: [
      GovernanceService,
      ContentReviewService,
      { provide: KnowledgeService, useValue: makeKnowledgeService() },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => (key === 'content.reviewerSubs' ? ['rev-a', 'rev-b'] : undefined),
        },
      },
      { provide: DRIZZLE, useValue: null },
    ],
  })
    .overrideGuard(OperatorAuthGuard)
    .useValue({
      canActivate: (ctx: { switchToHttp: () => { getRequest: () => FastifyRequest } }) => {
        const req = ctx.switchToHttp().getRequest();
        const sub = req.headers['x-test-sub'];
        if (typeof sub !== 'string') return false;
        req.operator = {
          sub,
          integratorId: 'int-e2e',
          viaDevBypass: false,
          claims: { name: `Dr ${sub}` },
        };
        return true;
      },
    })
    .compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
});

describe('GET /v1/governance/readiness', () => {
  it('reports the shipped bundle as not release-ready, with blockers', async () => {
    const res = await inject('GET', '/v1/governance/readiness', { sub: 'anyone' });
    expect(res.statusCode).toBe(200);
    expect(res.json().releaseReady).toBe(false);
    expect(res.json().blockers.length).toBeGreaterThan(0);
  });

  it('requires an authenticated operator', async () => {
    expect((await inject('GET', '/v1/governance/readiness')).statusCode).toBe(403);
  });
});

describe('review queue', () => {
  it('serves tier-1 records first and validates filters', async () => {
    const res = await inject('GET', '/v1/governance/review-queue?tier=1&limit=3', { sub: 'rev-a' });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(3);
    expect(res.json().items.every((i: { tier: number }) => i.tier === 1)).toBe(true);

    expect(
      (await inject('GET', '/v1/governance/review-queue?state=bogus', { sub: 'rev-a' })).statusCode,
    ).toBe(400);
    expect(
      (await inject('GET', '/v1/governance/review-queue?tier=7', { sub: 'rev-a' })).statusCode,
    ).toBe(400);
  });

  it('404s an unknown record', async () => {
    const res = await inject('GET', '/v1/governance/review-queue/drugs/not-a-drug', {
      sub: 'rev-a',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /v1/governance/reviews → export', () => {
  it('records two reviewer approvals and exports the record for promotion', async () => {
    const packet = await inject('GET', '/v1/governance/review-queue/drugs/metformin', {
      sub: 'rev-a',
    });
    expect(packet.statusCode).toBe(200);
    const body = {
      domain: 'drugs',
      recordId: 'metformin',
      recordHash: packet.json().recordHash,
      decision: 'approve',
      role: 'Consultant Physician',
    };

    const stranger = await inject('POST', '/v1/governance/reviews', {
      sub: 'not-a-reviewer',
      body,
    });
    expect(stranger.statusCode).toBe(403);

    const stale = await inject('POST', '/v1/governance/reviews', {
      sub: 'rev-a',
      body: { ...body, recordHash: 'stale' },
    });
    expect(stale.statusCode).toBe(409);

    const first = await inject('POST', '/v1/governance/reviews', { sub: 'rev-a', body });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ reviewerSub: 'rev-a', reviewerName: 'Dr rev-a' });

    const again = await inject('POST', '/v1/governance/reviews', { sub: 'rev-a', body });
    expect(again.statusCode).toBe(409);

    const second = await inject('POST', '/v1/governance/reviews', { sub: 'rev-b', body });
    expect(second.statusCode).toBe(201);

    const exp = await inject('GET', '/v1/governance/reviews/export', { sub: 'rev-a' });
    expect(exp.statusCode).toBe(200);
    expect(exp.json().approvals).toEqual([
      expect.objectContaining({
        domain: 'drugs',
        recordId: 'metformin',
        recordHash: body.recordHash,
      }),
    ]);
  });
});
