/**
 * Request handling for the VedaMD CDS bridge.
 *
 * WHY A BRIDGE EXISTS AT ALL
 * --------------------------
 * `openmrs-module-cdss` — the module OpenMRS and Bahmni actually use —
 * sends no Authorization header. Its only configuration knob is the
 * global property `cdss.fhir.baseurl`; there is nowhere to put an API
 * key. It calls:
 *
 *   GET  {baseurl}              → expects { services: [ { id, hook, … } ] }
 *   POST {baseurl}/{serviceId}  → expects { cards: [ … ] }
 *
 * That is precisely VedaMD's CDS Hooks shape, minus the bearer token.
 * So the bridge terminates the EMR's unauthenticated call inside the
 * hospital network and re-issues it upstream with the tenant's key.
 *
 * The same endpoint serves GNU Health and DHIS2, whose scripting
 * environments also cannot hold a secret safely.
 *
 * SAFETY POSTURE
 * --------------
 * - The bridge is a pipe, not a store. It never writes a payload to
 *   disk or to a log; only counts and status codes are logged.
 * - Every upstream failure returns `{ cards: [] }` with HTTP 200 rather
 *   than an error. An EMR that gets a 500 shows a red banner the
 *   clinician learns to dismiss; an empty card list is the honest
 *   representation of "we have nothing to add right now". The failure
 *   is still logged and counted for the operator.
 */

const JSON_HEADERS = { 'content-type': 'application/json' };

export class Bridge {
  #config;
  #log;
  #fetch;

  constructor(config, { log = console, fetchImpl = globalThis.fetch } = {}) {
    this.#config = config;
    this.#log = log;
    this.#fetch = fetchImpl;
    this.stats = { discovery: 0, invocations: 0, upstreamErrors: 0, rejected: 0 };
  }

  /** Rejects callers that fail the optional IP allow-list or shared secret. */
  authorizeCaller(remoteAddress, headers) {
    const { allowedCallers, bridgeToken } = this.#config;

    if (allowedCallers.length > 0) {
      const addr = normaliseAddress(remoteAddress);
      if (!allowedCallers.some((a) => normaliseAddress(a) === addr)) {
        this.stats.rejected += 1;
        return { ok: false, status: 403, reason: 'caller_not_allowed' };
      }
    }

    if (bridgeToken) {
      const presented = headers['x-bridge-token'];
      if (presented !== bridgeToken) {
        this.stats.rejected += 1;
        return { ok: false, status: 403, reason: 'bad_bridge_token' };
      }
    }

    return { ok: true };
  }

  /** Proxies CDS Hooks service discovery. */
  async discover() {
    this.stats.discovery += 1;
    const res = await this.#upstream('GET', '/cds-services');
    if (!res.ok) return { services: [] };
    return res.body ?? { services: [] };
  }

  /**
   * Proxies one CDS Hooks invocation, injecting the API key.
   * `serviceId` is passed through untouched — the EMR configures which
   * VedaMD service it wants, and inventing a mapping here would hide
   * a misconfiguration behind a silently different rule set.
   */
  async invoke(serviceId, payload) {
    this.stats.invocations += 1;

    if (!/^[a-zA-Z0-9._-]{1,128}$/.test(serviceId)) {
      return { status: 400, body: { error: 'invalid service id' } };
    }

    const res = await this.#upstream('POST', `/cds-services/${serviceId}`, payload);

    if (!res.ok) {
      // Degrade to "nothing to add", never to an error banner.
      return { status: 200, body: { cards: [] } };
    }

    const cards = Array.isArray(res.body?.cards) ? res.body.cards : [];
    return { status: 200, body: { cards } };
  }

  async #upstream(method, path, payload) {
    const url = `${this.#config.upstream}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#config.timeoutMs);

    try {
      const response = await this.#fetch(url, {
        method,
        headers: {
          ...JSON_HEADERS,
          authorization: `Bearer ${this.#config.apiKey}`,
          accept: 'application/json',
        },
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        this.stats.upstreamErrors += 1;
        this.#log.warn?.({
          event: 'vedamd_upstream_error',
          path,
          status: response.status,
        });
        return { ok: false, status: response.status };
      }

      return { ok: true, status: response.status, body: await response.json() };
    } catch (err) {
      this.stats.upstreamErrors += 1;
      // Log the failure CLASS, never the payload — the request body is PHI.
      this.#log.warn?.({
        event: 'vedamd_upstream_unreachable',
        path,
        reason: err?.name === 'AbortError' ? 'timeout' : 'network',
      });
      return { ok: false, status: 504 };
    } finally {
      clearTimeout(timer);
    }
  }
}

function normaliseAddress(addr) {
  if (!addr) return '';
  // Node reports IPv4-mapped IPv6 for dual-stack listeners.
  return String(addr).replace(/^::ffff:/, '').trim();
}
