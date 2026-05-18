# VedaMD Backend

Open-source Clinical Decision Support API for primary care in Kenya and Sub-Saharan Africa.

> *Safer clinical decisions, anywhere.*

## Stack

- **NestJS 11** on **Fastify 5** (high-throughput HTTP, low p95 latency for `<500ms` CDS evaluation budget)
- **Supabase** for auth (OAuth2/OIDC), Postgres, storage, RLS-based multi-tenancy
- **Medplum** as the FHIR R4/R5 server (TypeScript-native, replaces HAPI FHIR in the SRS recommendation)
- **cql-execution** (JS) for in-process CQL evaluation of WHO SMART Guideline content
- **Zod** + `class-validator` for input validation
- **Swagger / OpenAPI 3** auto-generated at `/docs` and `/openapi.json`

## Module map (mirrors SRS §6.3)

| Module | SRS section | Status |
|--------|-------------|--------|
| `cds`         | 6.3.1 Core CDS API                  | discovery + invoke stubs |
| `knowledge`   | 6.3.2 Knowledge Content Service     | skeleton |
| `terminology` | 6.3.3 Terminology Service           | skeleton |
| `drugs`       | 6.3.4 Drug Information Service      | skeleton |
| `fhir`        | 6.3.5 Patient Context / FHIR        | Medplum client wired |
| `llm`         | 6.3.6 LLM Orchestration             | skeleton |
| `audit`       | 6.3.7 Audit & Traceability          | logger-backed stub |
| `sync`        | 6.3.8 Offline Sync                  | skeleton |
| `identity`    | 6.3.9 Identity / AuthN / AuthZ      | Supabase token verify |
| `tenancy`     | 6.3.10 Multi-Tenancy                | skeleton |
| `analytics`   | 6.3.15 Analytics & Feedback         | skeleton |

## Quick start

```bash
cp .env.example .env
npm install
npm run start:dev
```

Then visit:

- `http://localhost:3000/health` — liveness
- `http://localhost:3000/cds-services` — CDS Hooks discovery (FR-001)
- `http://localhost:3000/docs` — Swagger UI

## Scripts

| Script            | Purpose                          |
|-------------------|----------------------------------|
| `npm run start:dev` | Dev server with watch          |
| `npm run build`     | Compile to `dist/`             |
| `npm test`          | Run unit tests (Vitest)        |
| `npm run typecheck` | `tsc --noEmit`                 |
| `npm run lint`      | ESLint with autofix            |

## License

Apache 2.0.
