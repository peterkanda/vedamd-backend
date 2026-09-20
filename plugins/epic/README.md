# VedaMD for Epic (and Oracle Health / Cerner)

Epic supports CDS Hooks and SMART on FHIR, and VedaMD implements both.
There is no plugin to install and no code in this directory that changes
that — **the gating step is vendor onboarding, not engineering.** This
document exists so nobody spends a sprint building something that was
never the blocker.

## What is actually required

| Step | Owner | Can code shortcut it? |
|---|---|---|
| Register as an Epic developer | VedaMD | No |
| List the app on Epic's Showroom (formerly App Orchard) | VedaMD | No |
| Health system enables the app for their org | Customer | No |
| Epic client id issued per environment | Epic | No |
| Point Epic at VedaMD's discovery URL | Customer | Trivial once above is done |

Every hour spent on steps 1–4 is contract and paperwork. Start there.

## What is in this pack

| File | Use |
|---|---|
| `test-request.sh` | Sends the sample below to VedaMD with your key; expect an interaction card |
| `sample-order-select.json` | An `order-select` request in the shape Epic and Oracle Health send |
| `prefetch-templates.json` | The prefetch templates to ask the vendor to configure |

```bash
VEDAMD_API_KEY=vmd_test_xxxxxxxx ./test-request.sh
```

## Sandbox testing today

You can validate the technical integration now, without onboarding,
against Epic's public sandbox at <https://fhir.epic.com>.

**Discovery endpoint**

```
GET https://api.vedamd.io/cds-services
```

Unauthenticated by design, per CDS Hooks convention. It returns the
service list Epic reads to populate its configuration screen.

**Invocation**

```
POST https://api.vedamd.io/cds-services/vedamd-order-select
Authorization: Bearer vmd_live_xxxxxxxx
Content-Type: application/json
```

VedaMD accepts the CDS Hooks payload Epic sends unmodified — FHIR
resources in `context.draftOrders` and in `prefetch`. See
`vedamd-backend/src/modules/cds/normalize/` for exactly which resources
and codings are read.

## Supported hooks

| Hook | VedaMD service id |
|---|---|
| `patient-view` | `vedamd-patient-view` |
| `order-select` | `vedamd-order-select` |
| `order-sign` | `vedamd-order-sign` |
| `medication-prescribe` | `vedamd-medication-prescribe` |

`medication-prescribe` is a CDS Hooks 1.0 hook that was replaced by
`order-select`/`order-sign` in later drafts. VedaMD serves all four and
runs the same rule set behind them.

## Prefetch

Ask Epic to send the templates below. VedaMD works without them — it
simply has less to reason about, and rules whose inputs are missing
stay silent rather than guessing.

```json
{
  "patient": "Patient/{{context.patientId}}",
  "conditions": "Condition?patient={{context.patientId}}&clinical-status=active",
  "medications": "MedicationRequest?patient={{context.patientId}}&status=active",
  "allergies": "AllergyIntolerance?patient={{context.patientId}}",
  "labs": "Observation?patient={{context.patientId}}&category=laboratory&_count=50&_sort=-date"
}
```

The `labs` template matters most. Renal and hepatic dose-adjustment
rules need a creatinine; without one they produce nothing, and the
integration looks broken when it is merely uninformed.

## Authentication

VedaMD authenticates integrators with a bearer API key
(`Authorization: Bearer vmd_live_...`), issued from the VedaMD developer
portal.

VedaMD does **not** currently run an OAuth2 client-credentials token
endpoint — there is no `/oauth2/token`. If your Epic configuration
requires OAuth2 for outbound CDS Hooks calls, raise it with VedaMD
before scheduling the integration; it is a backend change, not
something configurable at your end.

## Oracle Health (Cerner)

The same discovery URL and the same four services apply. Registration
goes through the Oracle Health developer programme instead of Showroom,
and the sandbox is at <https://fhir.cerner.com>. Everything else in this
document carries over unchanged.
