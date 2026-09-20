# Reference labels (draft lane)

Manufacturer / regulator product information held **beside** VedaMD drug
records, never merged into them. Everything here is generated, draft, and
outside the signed bundle until reviewed and promoted.

| File | Produced by | Contents |
|---|---|---|
| `manufacturer-labels.json` | `npm run labels:ingest` | US FDA label excerpts (openFDA/DailyMed), one record per drug + route, `jurisdiction: US` |
| `match-report.md` | `npm run labels:ingest` | Matched, unmatched, RxNorm-mismatch and pending drugs |
| `ppb-smpc-links.json` | `npm run labels:ppb-links` | Kenya PPB SmPC **links only** (no text) |
| `ppb-smpc-report.md` | `npm run labels:ppb-links` | Link coverage, KEML drugs without an SmPC link |

Related: `npm run audit:drug-rxnorm` writes `content/safety/rxnorm-code-audit.md`,
listing `drugs.json` RxNorm codes that disagree with the drug's INN (the same
check that blocks label attachment).

## Licensing

Read `docs/manufacturer-label-licensing.md` first. In short: only sources with
`embeddable: yes` in `content/sources/registry.json` may contribute stored
text (today: openFDA, pending legal sign-off on manufacturer-authored text).
PPB, SAHPRA, EMA and emc content is link-only until permission is granted.
`npm run bundle:check-licence` fails if a file here stores text from a
non-embeddable source.

## How labels are matched

1. The drug's INN is parsed (`scripts/lib/manufacturer-labels.ts`) and resolved
   to RxNorm ingredients via RxNav. If the record's own `rxnorm` code points at
   a different ingredient, **no label is attached** and the drug is listed as
   an RxNorm mismatch.
2. openFDA labels are searched by exact generic name (single ingredient) or all
   substances (combinations), excluding repackagers.
3. Per route, the innovator (NDA/BLA) label is preferred, then the newest
   generic; up to three other current labels are kept as DailyMed links.

## Promotion

1. Spot-check matches (`match-report.md`), especially combinations.
2. Legal sign-off on storing FDA label excerpts.
3. Set `reviewStatus: approved` on reviewed records, copy the file into the
   next bundle version as `manufacturer-labels.json` (and optionally
   `ppb-smpc-links.json`), then `npm run bundle:sign`.
4. `GET /v1/drugs/:slug/labels` serves them; in approved-only mode only
   approved labels/links are returned.

Labels are served by the API but **excluded from the mobile offline bundle**
for now (~16 KB per label, ~1,000 labels).

## Refresh

Re-run monthly. `.cache/labels/` holds per-drug results; pass `--refresh` to
re-query everything. Without `OPENFDA_API_KEY` openFDA allows 1,000 requests
a day; the script stops cleanly at the quota and resumes next run.
