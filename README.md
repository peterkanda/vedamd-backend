# VedaMD Backend

Open-source, **stateless, content-driven** Clinical Decision Support API for primary care in Kenya and Sub-Saharan Africa.

> *Safer clinical decisions, anywhere.*
> *We never see your patients.*

## What VedaMD is

A clinical knowledge API. An integrator (EMR, telehealth, CHW app, custom tool) asks VedaMD questions like:

- "What's the management of uncomplicated malaria in an adult?"
- "What red flags warrant referral for stage-1 hypertension?"
- "Are these two medicines safe together?"
- "What's the paediatric dose of artemether-lumefantrine for a 14 kg child?"

and gets back structured, citation-bearing guidance. **No patient identity is required.** No FHIR server, no patient store, no Medplum, no JVM. The platform's clinical content is the product; the schemas and infrastructure are scaffolding.

## The stateless promise

VedaMD persists **zero patient data**, ever. Any structured signals an integrator sends with a CDS Hooks invocation are evaluated in memory and released the instant the response is sent. Enforced at four layers:

1. **Architecture** — no patient-data services have databases (FR-088, FR-089, FR-090, NFR-028).
2. **Code** — the PHI-free logger wrapper rejects any field outside an allow-list and HMAC-hashes identifier-pattern fields (NFR-027, NFR-029).
3. **CI** — the `audit-stateless` gate scans for forbidden patterns (forthcoming).
4. **Audit** — third-party annual verification published per NFR-097.

## Stack

- **NestJS 11** on **Fastify 5** (Node 22, JVM-free)
- **`cql-execution`** for in-memory rule evaluation
- **`jose`** for OIDC JWT verification (operator identity, provider-agnostic)
- **`pino`** under the PHI-free logger wrapper
- **Swagger / OpenAPI 3** auto-generated at `/docs` and `/openapi.json`
- **No FHIR server. No Medplum. No external runtime owning our shapes.** Anything FHIR-shaped that arrives in a CDS Hooks payload is treated as opaque JSON; we read only the non-identifying clinical signals our rules need.

## Module map

| Module | SRS section | v0.1 status |
|---|---|---|
| `cds` | 6.3.1 Core CDS API | Discovery + invoke; CapabilityStatement at `/metadata` (FR-093) |
| `conditions` | 6.3.18 Content-driven CDS | Structured guidance by slug — malaria, hypertension, T2DM seeded |
| `knowledge` | 6.3.2 Knowledge Content Service | Skeleton |
| `terminology` | 6.3.3 Terminology Service | Skeleton |
| `drugs` | 6.3.4 Drug Information Service | Search + record + interactions; 6 KEML drugs seeded |
| `llm` | 6.3.6 LLM Orchestration | Skeleton |
| `audit` | 6.3.7 Audit & Traceability | HMAC-hashed identifiers (NFR-029) |
| `bundles` | 6.3.8 Offline Rule Bundle Distribution | Catalog API skeleton |
| `identity` | 6.3.9 Operator Identity (OIDC) | JWKS verifier |
| `tenancy` | 6.3.10 Integrator Tenancy | Skeleton |
| `analytics` | 6.3.15 Aggregate Analytics | Skeleton |
| `developer` | 6.3.16 Developer Portal (backend) | API key CRUD (FR-313) |
| `integration-log` | 6.3.17 Bounded Integration Log | In-memory ring buffer with field allow-list (FR-330–343) |

## Authentication

Integrators authenticate with an API key as a standard bearer token:

```http
Authorization: Bearer vmd_live_<secret>
```

| Route | Auth |
|---|---|
| `GET /health` | Public |
| `GET /metadata` | Public (auditors verify the stateless promise) |
| `GET /cds-services` | Public (CDS Hooks discovery convention) |
| `GET /docs`, `GET /openapi.json` | Public |
| `POST /cds-services/:serviceId` | Bearer + `cds:evaluate` scope |
| `POST /api/v1/cds/evaluate` | Bearer + `cds:evaluate` scope |
| `GET /api/v1/conditions[/:slug]` | Bearer + `content:read` scope |
| `GET /api/v1/drugs[/:slug]`, `POST /api/v1/drugs/interactions` | Bearer + `drug-info:read` scope |
| `*/v1/developer/*` | Operator OIDC (forthcoming) — v0.1 stub via `x-integrator-id` |

Keys are HMAC-fingerprinted (`API_KEY_FINGERPRINT_SECRET`); the secret is shown
exactly once at creation and never persisted server-side (FR-313). The
guard validates in constant time and records `lastUsedAt` on success.
Revoked keys are rejected at the edge.

## What is NOT here, by design

- No patient store, no patient table, no patient schema (Section 2.7)
- No FHIR server, no FHIR client library, no Medplum — payload shape is ours, not theirs
- No clinician-identity store — clinicians authenticate to their EMR; VedaMD authenticates operators only (FR-165)
- No HIE/message-routing role — VedaMD never relays patient data between integrators

## Quick start

```bash
cp .env.example .env
npm install
npm run start:dev
```

Then visit:

- `http://localhost:3000/health` — liveness
- `http://localhost:3000/metadata` — stateless CapabilityStatement (FR-093)
- `http://localhost:3000/cds-services` — CDS Hooks discovery (FR-001)
- `http://localhost:3000/docs` — Swagger UI

## Scripts

| Script | Purpose |
|---|---|
| `npm run start:dev` | Dev server with watch |
| `npm run build` | Compile to `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## License

Apache 2.0.
