import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { applyApiPrefix } from '../../src/openapi.config';
import { ApiKeysService } from '../../src/modules/developer/api-keys.service';
import { AuditService } from '../../src/modules/audit/audit.service';

/**
 * The streaming chat endpoint and the lightweight catalogue endpoints the
 * portal uses in place of downloading whole lists. DB-less, like app.e2e.
 */

process.env.HTTP_EXPOSE_DOCS = 'false';

let app: NestFastifyApplication;
let key: string;

interface InjectResponse {
  statusCode: number;
  payload: string;
  headers: Record<string, string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: () => any;
}

const inject = (opts: {
  method: string;
  url: string;
  payload?: unknown;
  headers?: Record<string, string>;
}): Promise<InjectResponse> =>
  (
    app.getHttpAdapter().getInstance() as unknown as {
      inject: (o: unknown) => Promise<InjectResponse>;
    }
  ).inject({ ...opts, headers: { authorization: `Bearer ${key}`, ...opts.headers } });

/** Parse a text/event-stream body into its events. */
function parseEvents(body: string): Array<{ event: string; data: unknown }> {
  return body
    .split('\n\n')
    .filter((block) => block.startsWith('event: '))
    .map((block) => {
      const [eventLine, dataLine] = block.split('\n');
      return {
        event: eventLine.slice('event: '.length),
        data: JSON.parse(dataLine.slice('data: '.length)),
      };
    });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  applyApiPrefix(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const created = await app.get(ApiKeysService).create({
    integratorId: 'e2e',
    name: 'e2e',
    scopes: ['cds:evaluate', 'content:read', 'drug-info:read'],
    environment: 'sandbox',
  });
  key = created.secret;
});

afterAll(async () => {
  await app?.close();
});

describe('POST /api/v1/agentic/evaluate/stream', () => {
  const body = {
    mode: 'deterministic',
    question: 'warfarin and ibuprofen together?',
    medications: ['warfarin', 'ibuprofen'],
  };

  it('streams deterministic cards and retrieval counts, then the final result', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/agentic/evaluate/stream',
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/event-stream/);

    const events = parseEvents(res.payload);
    // The first two arrive in whichever order their steps finish.
    expect(
      events
        .map((e) => e.event)
        .slice(0, 2)
        .sort(),
    ).toEqual(['deterministic', 'retrieval']);
    expect(events.map((e) => e.event)[2]).toBe('final');
    expect(events).toHaveLength(3);

    const byName = Object.fromEntries(events.map((e) => [e.event, e.data]));
    const deterministic = byName.deterministic as { cards: Array<{ summary: string }> };
    const retrieval = byName.retrieval as { drugs: number };
    const final = byName.final as {
      cards: Array<{ summary: string }>;
      meta: Record<string, unknown>;
    };
    expect(deterministic.cards.length).toBeGreaterThan(0);
    expect(retrieval.drugs).toBeGreaterThan(0);

    // Same answer as the non-streaming endpoint (card ids and timing differ).
    const plain = (
      await inject({ method: 'POST', url: '/api/v1/agentic/evaluate', payload: body })
    ).json();
    expect(final.cards.map((c) => c.summary)).toEqual(
      plain.cards.map((c: { summary: string }) => c.summary),
    );
    const withoutTiming = (meta: Record<string, unknown>) => ({
      ...meta,
      agenticLatencyMs: undefined,
    });
    expect(withoutTiming(final.meta)).toEqual(withoutTiming(plain.meta));
  });

  it('writes exactly one clinical audit event', async () => {
    const record = vi.spyOn(app.get(AuditService), 'record');
    await inject({ method: 'POST', url: '/api/v1/agentic/evaluate/stream', payload: body });
    await new Promise((r) => setTimeout(r, 50));
    const events = record.mock.calls.map(([e]) => e.type);
    expect(events).toEqual(['cds.evaluated']);
    record.mockRestore();
  });

  it('requires an API key', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/agentic/evaluate/stream',
      payload: body,
      headers: { authorization: '' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('catalogue shortcuts', () => {
  it('GET /api/v1/catalogue/counts matches the length of each list', async () => {
    const { counts } = (await inject({ method: 'GET', url: '/api/v1/catalogue/counts' })).json();
    const conditions = (await inject({ method: 'GET', url: '/api/v1/conditions' })).json();
    const drugs = (await inject({ method: 'GET', url: '/api/v1/drugs' })).json();
    const antidotes = (await inject({ method: 'GET', url: '/api/v1/antidotes' })).json();
    expect(counts.conditions).toBe(conditions.conditions.length);
    expect(counts.drugs).toBe(drugs.drugs.length);
    expect(counts.antidotes).toBe(antidotes.antidotes.length);
    for (const n of Object.values(counts)) expect(typeof n).toBe('number');
  });

  it('GET /api/v1/drugs/slugs and /conditions/slugs list every slug', async () => {
    const drugSlugs = (await inject({ method: 'GET', url: '/api/v1/drugs/slugs' })).json();
    const drugs = (await inject({ method: 'GET', url: '/api/v1/drugs' })).json();
    expect(drugSlugs.slugs).toEqual(drugs.drugs.map((d: { slug: string }) => d.slug));

    const conditionSlugs = (
      await inject({ method: 'GET', url: '/api/v1/conditions/slugs' })
    ).json();
    const conditions = (await inject({ method: 'GET', url: '/api/v1/conditions' })).json();
    expect(conditionSlugs.slugs).toEqual(
      conditions.conditions.map((c: { slug: string }) => c.slug),
    );
  });

  it('caches slug lists privately in the browser', async () => {
    const res = await inject({ method: 'GET', url: '/api/v1/drugs/slugs' });
    expect(res.headers['cache-control']).toBe('private, max-age=3600, immutable');
  });
});
