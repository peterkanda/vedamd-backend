import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Bridge } from '../src/bridge.js';
import { loadConfig } from '../src/config.js';

const silent = { warn() {}, info() {} };

function makeConfig(overrides = {}) {
  return {
    upstream: 'https://api.vedamd.io',
    apiKey: 'vmd_test_key',
    timeoutMs: 1000,
    allowedCallers: [],
    bridgeToken: null,
    ...overrides,
  };
}

/** Records the request the bridge made and replies with `reply`. */
function stubFetch(reply, captured = {}) {
  return async (url, init) => {
    captured.url = url;
    captured.init = init;
    if (reply instanceof Error) throw reply;
    return {
      ok: reply.status < 400,
      status: reply.status,
      json: async () => reply.body,
    };
  };
}

describe('config', () => {
  test('refuses to start without an API key', () => {
    assert.throws(() => loadConfig({}), /VEDAMD_API_KEY/);
  });

  test('refuses a plaintext upstream unless explicitly allowed', () => {
    assert.throws(
      () => loadConfig({ VEDAMD_API_KEY: 'k', VEDAMD_BASE_URL: 'http://api.vedamd.io' }),
      /must be https/,
    );
    assert.doesNotThrow(() =>
      loadConfig({ VEDAMD_API_KEY: 'k', VEDAMD_BASE_URL: 'http://localhost:3000', VEDAMD_ALLOW_INSECURE: '1' }),
    );
  });

  test('strips a trailing slash from the upstream URL', () => {
    const cfg = loadConfig({ VEDAMD_API_KEY: 'k', VEDAMD_BASE_URL: 'https://api.vedamd.io/' });
    assert.equal(cfg.upstream, 'https://api.vedamd.io');
  });
});

describe('invoke', () => {
  test('injects the bearer token the EMR cannot send', async () => {
    const captured = {};
    const bridge = new Bridge(makeConfig(), {
      log: silent,
      fetchImpl: stubFetch({ status: 200, body: { cards: [{ summary: 'x' }] } }, captured),
    });

    const result = await bridge.invoke('vedamd-order-select', { hook: 'order-select' });

    assert.equal(captured.url, 'https://api.vedamd.io/cds-services/vedamd-order-select');
    assert.equal(captured.init.headers.authorization, 'Bearer vmd_test_key');
    assert.equal(result.status, 200);
    assert.equal(result.body.cards.length, 1);
  });

  test('forwards the EMR payload byte-for-byte', async () => {
    const captured = {};
    const bridge = new Bridge(makeConfig(), {
      log: silent,
      fetchImpl: stubFetch({ status: 200, body: { cards: [] } }, captured),
    });

    // The exact envelope openmrs-module-cdss posts.
    const payload = {
      hook: 'vedamd-order-select',
      prefetch: {
        patient: { resourceType: 'Patient', gender: 'female' },
        conditions: { resourceType: 'Bundle', entry: [] },
        draftMedicationRequests: { resourceType: 'Bundle', entry: [] },
      },
    };
    await bridge.invoke('vedamd-order-select', payload);
    assert.deepEqual(JSON.parse(captured.init.body), payload);
  });

  test('an upstream 500 degrades to an empty card list, not an error', async () => {
    // A 500 reaching the EMR renders a red banner clinicians learn to
    // dismiss. An empty list honestly says "nothing to add right now".
    const bridge = new Bridge(makeConfig(), {
      log: silent,
      fetchImpl: stubFetch({ status: 500, body: {} }),
    });
    const result = await bridge.invoke('vedamd-order-select', {});
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { cards: [] });
    assert.equal(bridge.stats.upstreamErrors, 1);
  });

  test('an unreachable upstream degrades the same way and is counted', async () => {
    const bridge = new Bridge(makeConfig(), {
      log: silent,
      fetchImpl: stubFetch(new Error('ECONNREFUSED')),
    });
    const result = await bridge.invoke('vedamd-order-select', {});
    assert.deepEqual(result.body, { cards: [] });
    assert.equal(bridge.stats.upstreamErrors, 1);
  });

  test('rejects a service id that could escape the path', async () => {
    const bridge = new Bridge(makeConfig(), { log: silent, fetchImpl: stubFetch({ status: 200, body: {} }) });
    const result = await bridge.invoke('../../admin/keys', {});
    assert.equal(result.status, 400);
  });

  test('drops a non-array cards field rather than passing it through', async () => {
    const bridge = new Bridge(makeConfig(), {
      log: silent,
      fetchImpl: stubFetch({ status: 200, body: { cards: 'unexpected' } }),
    });
    const result = await bridge.invoke('vedamd-order-select', {});
    assert.deepEqual(result.body, { cards: [] });
  });
});

describe('caller authorization', () => {
  test('allows any caller when no allow-list is configured', () => {
    const bridge = new Bridge(makeConfig(), { log: silent });
    assert.equal(bridge.authorizeCaller('10.1.2.3', {}).ok, true);
  });

  test('enforces the IP allow-list, tolerating IPv4-mapped addresses', () => {
    const bridge = new Bridge(makeConfig({ allowedCallers: ['10.1.2.3'] }), { log: silent });
    assert.equal(bridge.authorizeCaller('::ffff:10.1.2.3', {}).ok, true);
    assert.equal(bridge.authorizeCaller('10.9.9.9', {}).ok, false);
  });

  test('enforces the shared secret when configured', () => {
    const bridge = new Bridge(makeConfig({ bridgeToken: 's3cret' }), { log: silent });
    assert.equal(bridge.authorizeCaller('10.1.2.3', { 'x-bridge-token': 's3cret' }).ok, true);
    assert.equal(bridge.authorizeCaller('10.1.2.3', { 'x-bridge-token': 'wrong' }).ok, false);
    assert.equal(bridge.authorizeCaller('10.1.2.3', {}).ok, false);
  });
});

describe('discovery', () => {
  test('passes the upstream service list through', async () => {
    const bridge = new Bridge(makeConfig(), {
      log: silent,
      fetchImpl: stubFetch({ status: 200, body: { services: [{ id: 'vedamd-order-select' }] } }),
    });
    const body = await bridge.discover();
    assert.equal(body.services[0].id, 'vedamd-order-select');
  });

  test('returns an empty service list when VedaMD is unreachable', async () => {
    // openmrs-module-cdss validates the service id against discovery
    // before every call; an empty list makes it fail loudly at config
    // time rather than silently at prescribing time.
    const bridge = new Bridge(makeConfig(), { log: silent, fetchImpl: stubFetch(new Error('down')) });
    assert.deepEqual(await bridge.discover(), { services: [] });
  });
});
