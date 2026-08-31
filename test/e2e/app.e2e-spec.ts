import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { applyApiPrefix } from '../../src/openapi.config';

/**
 * HTTP end-to-end tests — boot the full Nest application (same bootstrap as
 * main.ts: Fastify + ValidationPipe + the /api global prefix) and drive it via
 * Fastify's in-process `inject`, so no network port or external services are
 * needed. Runs DB-less: services fall back to in-memory stores.
 *
 * Covers the integrator-facing contract:
 *   - public/operational surface (health, metadata, CDS Hooks discovery,
 *     localization, agentic capabilities incl. the advertised model),
 *   - the API-key auth contract (content + agentic require a key → 401),
 *   - request validation.
 */

// Configure the agentic provider BEFORE the module is compiled so the
// capabilities endpoint advertises a model (mirrors a real deployment with an
// OpenRouter key set). The dummy key never makes a network call here.
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'e2e-dummy-key';
process.env.AGENTIC_OPENROUTER_MODEL =
  process.env.AGENTIC_OPENROUTER_MODEL || 'google/medgemma-27b-text-it';
process.env.HTTP_EXPOSE_DOCS = 'false';

let app: NestFastifyApplication;

interface InjectResponse {
  statusCode: number;
  payload: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: () => any;
}

const inject = (opts: {
  method: string;
  url: string;
  payload?: unknown;
}): Promise<InjectResponse> =>
  (
    app.getHttpAdapter().getInstance() as unknown as {
      inject: (o: unknown) => Promise<InjectResponse>;
    }
  ).inject(opts);

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  applyApiPrefix(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
});

describe('operational + discovery surface (public)', () => {
  it('GET /health → 200', async () => {
    const res = await inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /metadata → FHIR CapabilityStatement', async () => {
    const res = await inject({ method: 'GET', url: '/metadata' });
    expect(res.statusCode).toBe(200);
    expect(res.json().resourceType).toBe('CapabilityStatement');
  });

  it('GET /cds-services → CDS Hooks discovery list', async () => {
    const res = await inject({ method: 'GET', url: '/cds-services' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.services)).toBe(true);
    expect(body.services.length).toBeGreaterThan(0);
    for (const s of body.services) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.hook).toBe('string');
    }
  });

  it('GET /api/v1/localization → directory with derived status', async () => {
    const res = await inject({ method: 'GET', url: '/api/v1/localization' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.defaultCountry).toBe('KE');
    expect(body.baseAuthority).toBe('WHO');
    expect(body.countries.find((c: { code: string }) => c.code === 'KE').localized).toBe(true);
  });

  it('GET /api/v1/agentic/capabilities → advertises provider AND model', async () => {
    const res = await inject({ method: 'GET', url: '/api/v1/agentic/capabilities' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agenticEnabled).toBe(true);
    expect(body.provider).toBe('openrouter');
    // The fix this suite locks in: the actual model is surfaced, not just the provider.
    expect(body.model).toBe('google/medgemma-27b-text-it');
  });
});

describe('API-key auth contract', () => {
  it('GET /api/v1/conditions without a key → 401', async () => {
    const res = await inject({ method: 'GET', url: '/api/v1/conditions' });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/agentic/evaluate without a key → 401', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/agentic/evaluate',
      payload: { question: 'malaria treatment' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/v1/assistant/chat without a session → 401', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/v1/assistant/chat',
      payload: { question: 'first-line malaria' },
    });
    expect(res.statusCode).toBe(401);
  });
});
