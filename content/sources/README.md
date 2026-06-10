# Content source & licence registry

`registry.json` is the machine-readable catalogue of every upstream content
source VedaMD may draw on, with a **licence tier** and an **embeddable
verdict**. It operationalises the Kenya/Sub-Saharan-Africa CDS content-sourcing
analysis so that licensing rules are enforced by code, not memory.

## Why this exists

The most clinically attractive sources are the ones we legally **cannot**
embed. The registry encodes that distinction and two pieces of tooling enforce
it:

| Consumer | What it does |
|---|---|
| `scripts/ingest-country-content.ts` | Splits sources into an **embed** lane (`embeddable: yes`) and a **worklist** lane (`verify` / `cite-only`). Only the embed lane may be transformed into content; the rest become authoring tasks. |
| `scripts/check-licence-compliance.js` + `test/licence-compliance.spec.ts` | Maps every citation host back to its source and verifies the declared `licence` matches the registry — a cite-only source can't be relabelled as reusable. Warn-now / enforce-later (ratchet ceiling = 0). |
| `src/modules/localization/source-registry.ts` | Typed loader the Nest app shares with the tooling. |

## Tiers (from the analysis)

- **Tier 1 — `embeddable: yes`.** Public-domain / permissive, safe to embed
  with attribution: HL7 FHIR, DailyMed, openFDA, RxNorm, LOINC, AHRQ CDS
  Connect, ONC DDI list, DrugBank Open Data.
- **Tier 2 — `embeddable: verify`.** High value, licence-uncertain — verify
  per source/repo before embedding: **WHO SMART Guidelines** FHIR IGs (highest
  leverage — code vs clinical-content licences differ per repo), OCL/CIEL,
  ICD-11 (CC BY-ND: unmodified-embeddable, no derivatives), SNOMED CT & WHO
  ATC/DDD (paid).
- **Tier 3 — `embeddable: cite-only`.** Free to clinicians but NOT embeddable
  (NC/ND/proprietary/government): WHO narrative publications, NICE, StatPearls,
  MSF, Hesperian, Global Health Media, Radiopaedia, LITFL, the proprietary
  point-of-care references, and every **national MoH** guideline set
  (`moh-restricted`). Cite and link; author original logic from the underlying
  clinical facts; secure MoH permission where logic derives from national
  guidelines.

## Workflow

```
# scaffold overlays + provenance + worklists for expansion countries
npm run content:ingest -- --all          # or: -- UG TZ RW

# verify licence compliance of the signed bundle
npm run bundle:check-licence              # add --enforce in CI once clean
```

Each expansion country gets `content/overlays/<CC>/` with `overlay.json`
(derived-localization status), `provenance.json` (per-source audit), and
`worklist.md` (authoring checklist). A country flips to **localized** only when
its overlay is authored and `signedOff: true`.

## Maintaining the registry

- Re-confirm Tier 2/3/gray licences at the source before relying on them
  (especially WHO SMART per-repo licences, StatPearls' CC variant, SNOMED Kenya
  membership/cost, ATC/DDD commercial terms, DrugBank Open Data scope) and bump
  `lastChecked`.
- Add a national source per new country as a `moh-restricted`, `cite-only`
  Tier-3 entry, then run the ingestion engine for that country.
- Francophone expansion reuses the same pipeline; add the countries to
  `EXPANSION_TARGETS` and author French / local-language patient-facing strings.
