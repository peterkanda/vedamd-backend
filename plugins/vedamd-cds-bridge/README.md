# VedaMD CDS bridge

A small, dependency-free Node service that sits inside a facility network
and forwards CDS Hooks calls to VedaMD with your API key attached.

Use it when the calling system cannot hold a credential:

- **OpenMRS / Bahmni** — `openmrs-module-cdss` has one setting,
  `cdss.fhir.baseurl`, and sends no `Authorization` header.
- **DHIS2** — apps run in the browser, where no secret can be kept.

Routes mirror VedaMD's, so the caller is configured with the bridge URL
and nothing else changes:

| Route | Purpose |
|---|---|
| `GET /cds-services` | CDS Hooks discovery |
| `POST /cds-services/{serviceId}` | CDS Hooks invocation |
| `GET /healthz` | Liveness plus counters (`upstreamErrors`, `rejected`) |

## Run with Docker (builds from this folder)

```bash
cp .env.example .env        # set VEDAMD_API_KEY
docker compose up -d --build
curl http://127.0.0.1:8088/healthz
```

There is no published registry image — you build it from the source in
this package, so you can read exactly what runs next to your EMR.

## Run with Node 20+

```bash
VEDAMD_API_KEY=vmd_live_xxxxxxxx node src/server.js
```

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `VEDAMD_API_KEY` | — | **Required.** The bridge refuses to start without it. |
| `VEDAMD_BASE_URL` | `https://api.vedamd.io` | Must be `https` unless `VEDAMD_ALLOW_INSECURE=1`. |
| `VEDAMD_TIMEOUT_MS` | `4000` | Keep well under the EMR's own timeout. |
| `PORT` / `HOST` | `8088` / `0.0.0.0` | |
| `BRIDGE_TOKEN` | — | If set, callers must send `X-Bridge-Token`. |
| `BRIDGE_ALLOWED_CALLERS` | — | Comma-separated IP allow-list. |
| `BRIDGE_ALLOWED_ORIGINS` | — | Browser origins allowed via CORS — set this to your DHIS2 URL for the DHIS2 app. |

CORS is not authentication: an origin allow-list stops other web pages
calling the bridge from a browser, not a script on your network. Keep
the bridge on a private interface, and use `BRIDGE_ALLOWED_CALLERS` or a
firewall for server-side callers.

## Behaviour

- **Never blocks care.** If VedaMD is slow, down, or rejects the key, the
  bridge returns `{ "cards": [] }` with HTTP 200 and counts the failure.
  Watch `upstreamErrors` in `/healthz`.
- **Never stores or logs payloads.** Only counts, status codes and
  failure classes are logged.

## Tests

```bash
npm test
```
