# VedaMD Backend

Open-source, **stateless** Clinical Decision Support API for primary care in Kenya and Sub-Saharan Africa.

> *Safer clinical decisions, anywhere.*
> *We never see your patients.*

## The stateless promise

VedaMD persists **zero patient data**, ever. Patient context arrives with each API request, is evaluated in memory, and is released the instant the response is sent. The platform is bounded by SRS Section 2.7 and enforced at four layers:

1. **Architecture** — no patient-data services have databases (FR-088, FR-089, FR-090, NFR-028).
2. **Code** — the PHI-free logger wrapper rejects any field outside an allow-list and HMAC-hashes identifier-pattern fields (NFR-027, NFR-029).
3. **CI** — the `audit-stateless` gate scans for forbidden patterns (forthcoming).
4. **Audit** — third-party annual verification published per NFR-097.

## Stack

- **NestJS 11** on **Fastify 5** (Node 22, JVM-free)
- **`@medplum/core`** as a **FHIR client only** — for CDS Hooks Pattern B callbacks to integrators' own FHIR servers (we are not a FHIR server, FR-089)
- **`cql-execution`** for in-memory CQL evaluation against inbound FHIR bundles
- **`jose`** for OIDC JWT verification (operator identity, provider-agnostic)
- **`pino`** under the PHI-free logger wrapper
- **Swagger / OpenAPI 3** auto-generated at `/docs` and `/openapi.json`

## Module map

| Module | SRS section | v0.1 status |
|---|---|---|
| `cds` | 6.3.1 Core CDS API + 6.3.5 Stateless FHIR adapter | Discovery + invoke stubs; CapabilityStatement at `/metadata` (FR-093) |
| `knowledge` | 6.3.2 Knowledge Content Service | Skeleton |
| `terminology` | 6.3.3 Terminology Service | Skeleton |
| `drugs` | 6.3.4 Drug Information Service | Skeleton |
| `fhir` | 6.3.5 Stateless FHIR client (Pattern B) | Client factory |
| `llm` | 6.3.6 LLM Orchestration | Skeleton |
| `audit` | 6.3.7 Audit & Traceability | HMAC-hashed identifiers (NFR-029) |
| `bundles` | 6.3.8 Offline Rule Bundle Distribution | Catalog API skeleton |
| `identity` | 6.3.9 Operator Identity (OIDC) | JWKS verifier |
| `tenancy` | 6.3.10 Integrator Tenancy | Skeleton |
| `analytics` | 6.3.15 Aggregate Analytics | Skeleton |
| `developer` | 6.3.16 Developer Portal (backend) | API key CRUD (FR-313) |
| `integration-log` | 6.3.17 Bounded Integration Log | In-memory ring buffer with field allow-list (FR-330–343) |

## What is NOT here, by design

- No patient store, no patient table, no patient schema (Section 2.7)
- No persistent FHIR server (FR-089) — `@medplum/core` is used purely as an outbound HTTP client
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
