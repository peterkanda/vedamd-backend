import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createBridgeServer } from '../src/server.js';

const silent = { warn() {}, info() {} };

/** A stand-in VedaMD API that records what the bridge sent it. */
function startFakeVedaMd() {
  const received = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
      received.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });

      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url === '/cds-services') {
        res.end(JSON.stringify({ services: [{ id: 'vedamd-order-select', hook: 'order-select' }] }));
      } else {
        res.end(JSON.stringify({ cards: [{ summary: 'MAJOR interaction: warfarin ↔ ibuprofen' }] }));
      }
    });
  });
  return { server, received };
}

describe('bridge server (end to end)', () => {
  let fake, bridge, bridgeUrl;

  before(async () => {
    fake = startFakeVedaMd();
    await new Promise((r) => fake.server.listen(0, '127.0.0.1', r));
    const upstream = `http://127.0.0.1:${fake.server.address().port}`;

    bridge = createBridgeServer(
      {
        upstream,
        apiKey: 'vmd_test_abc',
        timeoutMs: 2000,
        allowedCallers: [],
        bridgeToken: null,
      },
      { log: silent },
    );
    await new Promise((r) => bridge.listen(0, '127.0.0.1', r));
    bridgeUrl = `http://127.0.0.1:${bridge.address().port}`;
  });

  after(async () => {
    await new Promise((r) => bridge.close(r));
    await new Promise((r) => fake.server.close(r));
  });

  test('GET /cds-services proxies discovery with the key attached', async () => {
    const res = await fetch(`${bridgeUrl}/cds-services`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.services[0].id, 'vedamd-order-select');

    const call = fake.received.find((r) => r.url === '/cds-services');
    assert.equal(call.auth, 'Bearer vmd_test_abc');
  });

  test('POST /cds-services/{id} forwards the openmrs-module-cdss envelope', async () => {
    const payload = {
      hook: 'vedamd-order-select',
      prefetch: {
        patient: { resourceType: 'Patient', gender: 'female', birthDate: '1958-06-01' },
        conditions: { resourceType: 'Bundle', entry: [] },
        draftMedicationRequests: { resourceType: 'Bundle', entry: [] },
      },
    };

    const res = await fetch(`${bridgeUrl}/cds-services/vedamd-order-select`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.cards[0].summary, /warfarin/i);

    const call = fake.received.find((r) => r.url === '/cds-services/vedamd-order-select');
    assert.equal(call.auth, 'Bearer vmd_test_abc');
    assert.deepEqual(call.body, payload);
  });

  test('GET /healthz reports upstream and counters without auth', async () => {
    const res = await fetch(`${bridgeUrl}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.ok(body.stats.invocations >= 1);
  });

  test('rejects a malformed JSON body with 400, not a crash', async () => {
    const res = await fetch(`${bridgeUrl}/cds-services/vedamd-order-select`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    assert.equal(res.status, 400);
  });

  test('unknown routes 404', async () => {
    assert.equal((await fetch(`${bridgeUrl}/admin`)).status, 404);
  });
});

describe('bridge server CORS', () => {
  let server, url;

  before(async () => {
    server = createBridgeServer(
      {
        upstream: 'http://127.0.0.1:9',
        apiKey: 'k',
        timeoutMs: 200,
        allowedCallers: [],
        bridgeToken: null,
        allowedOrigins: ['https://dhis2.example.org'],
      },
      { log: silent },
    );
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((r) => server.close(r));
  });

  test('answers a preflight from an allowed origin', async () => {
    const res = await fetch(`${url}/cds-services/vedamd-patient-view`, {
      method: 'OPTIONS',
      headers: { origin: 'https://dhis2.example.org', 'access-control-request-method': 'POST' },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://dhis2.example.org');
  });

  test('sends no CORS grant to an origin that is not allowed', async () => {
    const res = await fetch(`${url}/cds-services/vedamd-patient-view`, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example.com', 'access-control-request-method': 'POST' },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });
});
