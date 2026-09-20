import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHash } from 'node:crypto';
import { PluginDownloadsController } from '../../src/modules/integrations/plugins/plugin-downloads.controller';
import { PluginPackagesService } from '../../src/modules/integrations/plugins/plugin-packages.service';
import { IntegrationsController } from '../../src/modules/integrations/integrations.controller';
import { IntegrationsService } from '../../src/modules/integrations/integrations.service';
import { PostmanCollectionService } from '../../src/modules/integrations/postman-collection.service';
import { IntegrationMarkdownService } from '../../src/modules/integrations/integration-markdown.service';
import { CdsService } from '../../src/modules/cds/cds.service';
import { ApiKeyGuard } from '../../src/common/api-key-auth';
import { PHI_FREE_LOGGER } from '../../src/common/phi-free-logger';
import { PhiFreeLogger } from '../../src/common/phi-free-logger/phi-free-logger';

/**
 * HTTP contract for plugin downloads, over a real Fastify instance.
 *
 * Boots only the integrations controllers (no database, no content
 * bundle) with the API-key guard stubbed — auth itself is covered in
 * app.e2e-spec.ts. What this proves is routing and the wire format: that
 * `/plugins` is not swallowed by the catalogue's `/:slug` route, and that
 * the zip arrives intact with headers a browser and curl can use.
 */

let app: NestFastifyApplication;

interface InjectResponse {
  statusCode: number;
  headers: Record<string, string>;
  rawPayload: Buffer;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: () => any;
}

const inject = (url: string, headers: Record<string, string> = {}): Promise<InjectResponse> =>
  (
    app.getHttpAdapter().getInstance() as unknown as {
      inject: (o: unknown) => Promise<InjectResponse>;
    }
  ).inject({ method: 'GET', url, headers });

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [PluginDownloadsController, IntegrationsController],
    providers: [
      PluginPackagesService,
      IntegrationsService,
      PostmanCollectionService,
      IntegrationMarkdownService,
      { provide: CdsService, useValue: { listServices: () => [] } },
      {
        provide: PHI_FREE_LOGGER,
        useValue: new PhiFreeLogger({ service: 'e2e', hashSecret: 'e2e', strict: true }),
      },
    ],
  })
    .overrideGuard(ApiKeyGuard)
    .useValue({ canActivate: () => true })
    .compile();

  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});

afterAll(async () => {
  await app?.close();
});

describe('GET /v1/integrations/plugins', () => {
  it('lists packages rather than being routed to the :slug catalogue endpoint', async () => {
    const res = await inject('/v1/integrations/plugins');
    expect(res.statusCode).toBe(200);
    const ids = res.json().plugins.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['openemr', 'dhis2', 'frappe', 'gnu-health']));
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('filters by integration slug', async () => {
    const res = await inject('/v1/integrations/plugins?integration=bahmni');
    const ids = res
      .json()
      .plugins.map((p: { id: string }) => p.id)
      .sort();
    expect(ids).toEqual(['cds-bridge', 'openmrs-bahmni']);
  });

  it('leaves the catalogue detail route working', async () => {
    const res = await inject('/v1/integrations/openemr');
    expect(res.statusCode).toBe(200);
    expect(res.json().slug).toBe('openemr');
  });
});

describe('GET /v1/integrations/plugins/:id/download', () => {
  it('returns the zip with a filename, length and matching SHA-256', async () => {
    const res = await inject('/v1/integrations/plugins/openemr/download');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="vedamd-openemr-\d+\.\d+\.\d+\.zip"$/,
    );
    const digest = createHash('sha256').update(res.rawPayload).digest('hex');
    expect(res.headers['x-content-sha256']).toBe(digest);
    expect(res.headers.etag).toBe(`"${digest}"`);
    expect(Number(res.headers['content-length'])).toBe(res.rawPayload.length);
    // PK\x03\x04 — a real zip, not JSON-serialised bytes.
    expect(res.rawPayload.subarray(0, 4).toString('hex')).toBe('504b0304');
  });

  it('answers 304 when the client already has these exact bytes', async () => {
    const first = await inject('/v1/integrations/plugins/dhis2/download');
    const again = await inject('/v1/integrations/plugins/dhis2/download', {
      'if-none-match': first.headers.etag,
    });
    expect(again.statusCode).toBe(304);
    expect(again.rawPayload.length).toBe(0);
  });

  it('404s an unknown package', async () => {
    const res = await inject('/v1/integrations/plugins/not-a-plugin/download');
    expect(res.statusCode).toBe(404);
  });
});
