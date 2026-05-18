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
| `knowledge` | 6.3.2 Knowledge Content Service | Ed25519-signed bundle loader; signature + per-file SHA-256 + FR-024 multi-reviewer governance gate |
| `conditions` | 6.3.18 Content-driven CDS | Structured guidance by slug — sourced from the signed bundle |
| `procedures` | 6.3.19 Procedural guidance | Indications / steps with safety checks / red flags / complications — bundle-sourced |
| `drugs` | 6.3.4 Drug Information Service | Search + record + interactions + dosing calculator — bundle-sourced |
| `terminology` | 6.3.3 Terminology Service | Skeleton |
| `llm` | 6.3.6 LLM Orchestration | Skeleton |
| `audit` | 6.3.7 Audit & Traceability | HMAC-hashed identifiers (NFR-029) |
| `bundles` | 6.3.8 Offline Rule Bundle Distribution | Catalog API skeleton |
| `identity` | 6.3.9 Operator Identity (OIDC) | JWKS verifier |
| `tenancy` | 6.3.10 Integrator Tenancy | Skeleton |
| `analytics` | 6.3.15 Aggregate Analytics | Skeleton |
| `developer` | 6.3.16 Developer Portal (backend) | API key CRUD (FR-313) |
| `integration-log` | 6.3.17 Bounded Integration Log | In-memory ring buffer with field allow-list (FR-330–343) |

## CI bundle gate

Every PR runs `npm run bundle:verify` against `content/bundles/v0.1.0`:

| Check | Exit code on failure |
|---|---|
| Manifest present, signature parses | 4 |
| Ed25519 signature verifies | 4 |
| Per-file SHA-256 matches manifest | 4 |
| All `approved` records have ≥2 reviewers and `approvedAt` | 2 |
| `--require-approved` set AND any non-approved record present | 3 |

The CI workflow runs the verify step on every PR (without
`--require-approved`, so PRs that move records draft→approved are not
self-blocked) and also a second step on `main` with
`--require-approved`. Once content is promoted out of draft, flip
`continue-on-error` to `false` in `.github/workflows/ci.yml` to make
the approval gate enforcing.

## Content governance — FR-024 multi-reviewer approval

Every record carries `reviewStatus`, `reviewers[]`, and `approvedAt`.
The validator enforces two rules at signing time AND at runtime:

| Rule | Applies to |
|---|---|
| `reviewStatus === 'approved'` ⇒ `reviewers.length ≥ 2` | Approved records (FR-024) |
| `reviewStatus === 'approved'` ⇒ `approvedAt` present  | Approved records |

The sign script refuses to sign a bundle that contains any
`draft` / `review` / `deprecated` record unless invoked with
`--allow-draft` (for dev sandboxes). The runtime refuses to boot
when `CONTENT_REQUIRE_APPROVED=true` and the loaded bundle contains
any non-approved record. Production sets `CONTENT_REQUIRE_APPROVED=true`
by default.

`GET /api/v1/knowledge/bundle` (public) returns the live tally of
records by review status and domain so auditors can see what's
loaded without authenticating.

## Clinical content lives in a signed bundle

All clinical content (conditions, drugs, drug interactions, procedures)
is loaded from a versioned, Ed25519-signed bundle at boot — not from
TypeScript source. A bundle directory contains:

```
content/bundles/v0.1.0/
  manifest.json        ← version, signer, signedAt, files[].sha256
  manifest.sig         ← Ed25519 signature over canonical(manifest)
  public-key.pem       ← matching public key (committed)
  conditions.json
  drugs.json
  drug-interactions.json
  procedures.json
```

At boot the `KnowledgeService`:

1. Reads `manifest.json`, `manifest.sig`, and `public-key.pem`.
2. Verifies the Ed25519 signature over the canonical-JSON manifest.
3. For each file in the manifest, recomputes SHA-256 and compares to
   the manifest entry.
4. Refuses to load (in production / strict mode) on any failure.

`GET /api/v1/knowledge/bundle` is public and returns the live bundle
info (version, signer, signedAt, per-file SHA-256, verification
status) so integrators and auditors can confirm what content the
platform is serving.

The development signing keypair lives under `dev-keys/` (private key
gitignored; public key committed alongside the bundle). Production
keys live in a key store and never touch the repo.

```bash
# Generate a fresh dev keypair
npm run keys:generate -- --out ./dev-keys
cp dev-keys/public-key.pem content/bundles/v0.1.0/

# Sign the bundle
npm run bundle:sign -- \
  --bundle content/bundles/v0.1.0 \
  --key dev-keys/private-key.pem \
  --signer vedamd-dev-key-v0 \
  --version v0.1.0
```

## Persistence — Supabase / any Postgres

Operator state (API keys, integration log, audit events) lives in a
real Postgres database. Supabase is supported as a managed host —
we just need its connection string in `DATABASE_URL`. The same code
runs against:

- Supabase Cloud (`postgresql://postgres:[pw]@db.[project].supabase.co:5432/postgres`)
- Self-hosted Supabase (Kenya residency, Safaricom Cloud, etc.)
- Any Postgres 14+ (RDS, plain Postgres, docker-compose local)

Drizzle ORM owns the schema. Three tables today:

| Table | Purpose |
|---|---|
| `api_keys` | HMAC fingerprint (not the secret), scopes, env, lifecycle timestamps |
| `integration_log` | Per-request entries with PHI-free fields only (FR-330–343) |
| `audit_events` | Append-only with HMAC chain for tamper-evidence (FR-123) |

When `DATABASE_URL` is unset, services fall back to in-memory storage
with a loud `Logger.warn`. This is for unit tests and standalone
dev only; production always sets `DATABASE_URL`.

### Local dev

```bash
docker compose up -d            # starts Postgres on :5432
npm run db:migrate              # applies drizzle/0000_init.sql
npm run start:dev
```

### Migrations

| Script | Purpose |
|---|---|
| `npm run db:generate` | Generate a new migration from schema changes |
| `npm run db:migrate` | Apply pending migrations to `$DATABASE_URL` |
| `npm run db:push` | Push schema directly (dev only, skips migrations) |
| `npm run db:studio` | Drizzle Studio UI for inspecting the database |

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
| `GET /api/v1/procedures[/:slug]` | Bearer + `content:read` scope |
| `GET /api/v1/knowledge/bundle` | Public (auditors verify the loaded content) |
| `GET /api/v1/drugs[/:slug]`, `POST /api/v1/drugs/interactions`, `POST /api/v1/drugs/:slug/dosing` | Bearer + `drug-info:read` scope |
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
