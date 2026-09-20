# VedaMD EMR plugins

Integrations that let an EMR call VedaMD's clinical decision support at
the point of care. Every package here is downloadable from the
**Integrations** page of the VedaMD app, or from the API:

```bash
curl -H "Authorization: Bearer vmd_test_xxxxxxxx" \
  https://api.vedamd.io/api/v1/integrations/plugins                          # list, with SHA-256
curl -OJ -H "Authorization: Bearer vmd_test_xxxxxxxx" \
  https://api.vedamd.io/api/v1/integrations/plugins/openemr/download         # the zip
```

Check the downloaded file against the `sha256` in the list, or the
`X-Content-SHA256` response header, before installing it in a clinic.

## Packages

| Download id | For | What it is | Verified by |
|---|---|---|---|
| `openmrs-bahmni` | OpenMRS, Bahmni | Setup guide, `verify.sh`, bridge source | Contract from `openmrs-module-cdss` source; backend e2e test on the module's payload |
| `openemr` | OpenEMR 7+ | PHP module — dashboard card | APIs, schema and Twig filters from OpenEMR source; **PHP not executed** |
| `frappe` | Frappe Health (v15) | Frappe app | 23 unit tests; DocType fields from Frappe Health schemas |
| `gnu-health` | GNU Health 5.0 | Tryton module | 13 unit tests; fields from GNU Health 5.0.6 source |
| `dhis2` | DHIS2 2.41+ | No-build DHIS2 app | 13 unit tests; Tracker query run against the DHIS2 demo |
| `cds-bridge` | OpenMRS, Bahmni, DHIS2 | Node sidecar that holds the API key | 21 tests incl. HTTP round-trips and CORS |
| `epic-oracle` | Epic, Oracle Health | Prefetch templates, sample request, test script | Backend e2e test runs the shipped sample |

Every platform's payload shape is covered by
`test/cds-emr-payloads.spec.ts`, which asserts that a warfarin +
ibuprofen patient produces the interaction card. The OpenEMR, Frappe,
GNU Health and DHIS2 payloads all returned **zero cards** before the
backend learned to resolve drug names as EMRs store them.

## Which do I need?

```
EMR speaks CDS Hooks natively?
├── yes, and can send an Authorization header  → no plugin; point it at VedaMD (Epic, Oracle Health)
├── yes, but cannot send auth                  → openmrs-bahmni pack (includes the bridge)
└── no                                         → the platform package (openemr, frappe, gnu-health, dhis2)
```

## Layout and releasing

```
plugins/
├── packages.json          what each download contains — the source of truth
├── openmrs-bahmni/        guide + verify.sh
├── openemr/oe-module-vedamd-cds/
├── frappe/vedamd_cds/
├── gnu-health/vedamd_cds/
├── dhis2/vedamd-dhis2-app/ app/ is the installable zip root
├── vedamd-cds-bridge/
└── epic/
```

To release a change:

1. Edit the plugin, and bump its `version` in `packages.json`.
2. `npm run plugins:package` — rebuilds `content/plugins/*.zip` and
   `content/plugins/manifest.json` deterministically.
3. Commit both. `test/plugin-packages.spec.ts` fails if the committed
   archives do not match the source, so a stale download cannot ship.

Run each plugin's own tests from its directory: `npm test` for the
bridge and DHIS2, `python3 -m unittest discover -s tests` for Frappe and
GNU Health.

## Principles every plugin follows

**Never block care.** Every plugin degrades to "no cards" when VedaMD is
slow, unreachable or misconfigured, and none blocks a save.

**Never guess a clinical value.** Unrecognised units, out-of-range
values and unmappable codes are dropped and counted, never coerced.

**Never log payloads.** Plugins log counts, status codes and failure
classes — the request body is patient data.

**Send no identifiers.** No name, MRN, address or note text is
transmitted — only the clinical signals the rules evaluate.
