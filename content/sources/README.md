# Content source & licence registry

`registry.json` is the machine-readable catalogue of every upstream content
source VedaMD may draw on, with a **licence tier** and an **embeddable
verdict**. It operationalises the Kenya/Sub-Saharan-Africa CDS content-sourcing
analysis so that licensing rules are enforced by code, not memory.

## Why this exists

VedaMD clinical content is licensed **CC BY-NC-SA 4.0**
([`content/LICENSE`](../LICENSE), decided 2026-09-24). That decides which
sources we may embed: non-commercial and share-alike sources such as WHO
guidance are compatible, while all-rights-reserved or restrictive sources
are not. The registry encodes those verdicts, and the tooling enforces them:

| Consumer | What it does |
|---|---|
| `scripts/ingest-country-content.ts` | Splits sources into an **embed** lane (`embeddable: yes`) and a **worklist** lane (`verify` / `cite-only`). Only the embed lane may be transformed into content; the rest become authoring tasks. |
| `scripts/check-licence-compliance.js` + `test/licence-compliance.spec.ts` | Maps every citation URL back to its source and verifies the declared `licence` matches the registry — a cite-only source can't be relabelled as reusable. The tests also check each source's `reuseMode` is permitted by its licence. Warn-now / enforce-later (ratchet ceiling = 0). |
| `src/modules/localization/source-registry.ts` | Typed loader the Nest app shares with the tooling. |

## Fields

- **`tier` / `embeddable`** — see below.
- **`reuseMode`** — what embedding may do with the source's wording:
  - `adapt`: reproduce or adapt; adaptations are CC BY-NC-SA 4.0.
  - `verbatim`: no-derivatives terms; unaltered excerpts only.
  - `separate`: share-alike without NC (CC BY-SA, ODbL); ship only as a
    separately licensed item, never merged into a record.
  - `cite-only`: link and cite; restate facts in our own words.
- **`commercialUse`** — whether the source licence also allows commercial
  use, so a commercial-safe subset can be served to integrators later.
- **`licenceScope: per-item` + `itemLicences`** — the licence varies per
  article or document (PMC, Europe PMC, WHO IRIS, Kenya MoH, hybrid
  journals). Check the item's own licence before embedding it.
- **`hosts` / `urlPrefixes`** — how a citation URL maps to the source.
  A `urlPrefixes` entry (host + path, no scheme or `www.`) wins over any
  host match, e.g. `ncbi.nlm.nih.gov/books/nbk501922` is LactMed while
  the rest of `ncbi.nlm.nih.gov` is the per-item NCBI Bookshelf.

## Tiers

- **Tier 1 — `embeddable: yes`.** Licence verified compatible with the
  VedaMD content licence. Examples: public domain (DailyMed, LactMed,
  LiverTox, CDC, NCI PDQ), CC0 (CPIC, Wikidata, OpenAlex), CC BY (WHO eEML,
  data.who.int, PLOS, PAMJ), non-commercial (OpenStax, DDInter, SAMJ,
  SA STGs), verbatim-only (ICD-11, StatPearls, USPSTF), and separate
  share-alike items (Wikipedia, PharmGKB, OpenStreetMap).
- **Tier 2 — `embeddable: verify`.** Licence unverified, or set per item:
  WHO publications and SMART Guidelines, Kenya MoH, PMC/Europe PMC,
  hybrid journals, Cochrane, OCL/CIEL, LITFL, Global Health Media.
- **Tier 3 — `embeddable: cite-only`.** Not reusable even
  non-commercially: MSF (all rights reserved), Hesperian (digital use needs
  permission), Liverpool HIV interactions, NICE, Radiopaedia (AI-use terms),
  WikEM (AI-use ban), IHME, DHS, proprietary point-of-care references, and
  most national MoH guideline sets. Cite and link; author original logic
  from the underlying facts; request permission where it matters
  (`docs/content-permission-requests/`).

Evidence for each verdict: `docs/content-sources-and-gaps.md`.

## Workflow

```
# scaffold overlays + provenance + worklists for expansion countries
npm run content:ingest -- --all          # or: -- UG TZ RW

# verify licence compliance of the signed bundle
npm run bundle:check-licence              # add --enforce in CI once clean
```

Each expansion country gets `content/overlays/<CC>/` with `overlay.json`
(derived-localization status + factual locale profile), `provenance.json`
(per-source audit), and `worklist.md` (authoring checklist). A country flips to
**localized** only when its clinical overlay is authored and `signedOff: true`.

### Locale profiles

`country-profiles.json` holds the **safe localization layer** — factual,
citable per-country data (official + patient-facing languages, national
formulary linkage, WHO-derivation) merged into each overlay by the engine and
surfaced as `languages` on the `/v1/localization` directory for client i18n. It
contains **no clinical recommendations**: dosing/protocol overlays are authored
separately and gated on clinical sign-off, so a populated profile does NOT by
itself make a country localized.

## Maintaining the registry

- Re-confirm Tier 2/3/gray licences at the source before relying on them
  (especially WHO SMART per-repo licences, LITFL, Global Health Media, SNOMED
  Kenya membership/cost, ATC/DDD and ICD-10 distribution terms, DrugBank Open
  Data scope) and bump `lastChecked`.
- Add a national source per new country as a `moh-restricted`, `cite-only`
  Tier-3 entry, then run the ingestion engine for that country.
- Francophone expansion reuses the same pipeline; add the countries to
  `EXPANSION_TARGETS` and author French / local-language patient-facing strings.
