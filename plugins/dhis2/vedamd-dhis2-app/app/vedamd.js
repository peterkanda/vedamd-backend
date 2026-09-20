/**
 * VedaMD client for the DHIS2 app.
 *
 * The API key is NOT held in the browser. DHIS2 apps run entirely
 * client-side, so anything the app can read, any logged-in user can
 * read out of the bundle or the network tab. The app therefore talks
 * to the VedaMD CDS bridge deployed inside the implementation's own
 * network, which holds the key and allows this DHIS2 origin via CORS.
 */

const DEFAULT_SERVICE = 'vedamd-patient-view';

export async function evaluate({ bridgeUrl, service = DEFAULT_SERVICE, context, fetchImpl = fetch }) {
  if (!bridgeUrl) {
    throw new Error('bridgeUrl is required — see the VedaMD CDS bridge setup.');
  }

  const url = `${bridgeUrl.replace(/\/+$/, '')}/cds-services/${encodeURIComponent(service)}`;

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hook: 'patient-view',
      hookInstance: newHookInstance(),
      context,
    }),
  });

  if (!response.ok) {
    throw new Error(`VedaMD returned HTTP ${response.status}`);
  }

  const body = await response.json();
  return Array.isArray(body?.cards) ? body.cards : [];
}

/** crypto.randomUUID needs a secure context; fall back on plain-http test instances. */
function newHookInstance() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `dhis2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
