# Country overlays

Per-country localization built on the jurisdiction model (`src/common/jurisdiction.ts`):
a country variant overrides the WHO/global baseline and falls back to it, and
**never** substitutes one country's national guideline for another.

## Layout

```
content/overlays/
  _base/                 WHO/global baseline overlay content (jurisdiction: 'WHO')
    aware-stewardship.json
  <CC>/                  per expansion country (UG, TZ, …)
    overlay.json         derived-localization status + locale profile (generated)
    provenance.json      per-source audit log (generated)
    worklist.md          authoring checklist (generated)
    records/             national draft overlay content (authored, jurisdiction: '<CC>')
```

`overlay.json` / `provenance.json` / `worklist.md` are produced by
`npm run content:ingest`. The `_base/*.json` and `<CC>/records/*.json` files are
**authored clinical content**.

## Authoring → promotion workflow

Overlay content is **draft and lives outside the signed production bundle**. It
is promoted into a signed bundle release only after clinical review — draft
content can never serve itself as approved.

1. Author records under `_base/` (WHO baseline, shared by all countries) or
   `<CC>/records/` (national), tagged with `jurisdiction` and
   `reviewStatus: 'draft'`. Cite sources; never reproduce cite-only text.
2. `npm run overlays:validate` — enforces jurisdiction tagging, no
   self-approval, graded citations, and licence compliance.
3. Clinical review (≥2 reviewers per the content-review policy). On sign-off,
   set the country's `overlay.json` `signedOff: true` and promote the records
   into the next signed bundle as `approved`.
4. The country then auto-resolves to **localized** with no code change.

## Status

- **WHO baseline:** `aware-stewardship.json` — AWaRe Access/Watch/Reserve
  classification (draft; verify against the current WHO AWaRe list before
  approval). All 9 anglophone countries inherit this as their stewardship
  fallback until a national overlay is authored.
- **National overlays:** worklists generated for all 9 anglophone countries;
  clinical authoring in progress. None signed off yet (correctly — all remain
  `in-progress` / not localized).
