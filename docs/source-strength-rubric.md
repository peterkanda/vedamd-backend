# Source-strength rubric

Every reference in the VedaMD content bundle carries a **strength** tier
(`A`, `B`, `C`, or `D`). The tier appears as a small badge next to each
citation in the clinical UI so prescribers can calibrate trust at a
glance.

| Tier | Meaning | Examples |
|------|---------|----------|
| **A** | International guideline body, government regulator, Cochrane systematic review, or top-tier peer-reviewed journal | WHO, NICE, KDIGO, FDA, EMA, NEJM, Lancet, JAMA, BMJ, AHA Journals, ESC, IDSA, AAP, EAACI, BSACI, CDC ACIP, BNF / BNFc, Public Health England Green Book |
| **B** | Peer-reviewed specialty publication or recognised formulary / compendium | Wiley, Springer, Elsevier and OUP journals; Br J Anaesth, J Allergy Clin Immunol, Clin Pharmacol Ther, Anesthesiology, J Pediatr, Pediatr Allergy Immunol; LactMed, LiverTox, Sanford Guide, Briggs *Drugs in Pregnancy*, Palliative Care Formulary, Goodman & Gilman, Merck Manual professional |
| **C** | Other authoritative reference — society educational material, NCBI Bookshelf review (StatPearls), academic-centre protocol, country sub-national reference | UCSF / University of Iowa care pathways, ASH PreCheck, GOLD COPD, professional educational summaries |
| **D** | Consumer / wiki / encyclopedic source | Wikipedia, WebMD, Healthline, Patient.info, drugs.com aggregator pages |

## Policy

- **All four tiers are allowed.** D is allowed (e.g. Wikipedia as an
  orienting overview) so long as the tier is visible and clinicians can
  see what they're relying on. Editorial transparency is preferred to
  silently blocking sources.
- **D-tier should never be the SOLE reference** for a clinical
  recommendation. During clinical review, content with only D-tier
  references must be supplemented with at least one A or B citation
  before promotion from `draft` to `approved`.
- Every reference MUST carry a strength field. CI enforces this via
  `scripts/check-citation-strength.js` (wired into the `bundle-verify`
  job). To auto-fill missing strengths on a new content drop, run
  `npm run bundle:score-sources`.

## Copyright posture

The strength tier does not change copyright behaviour. Strength says how
much to trust a source; its licence says what we may do with its text.

- **VedaMD content is licensed CC BY-NC-SA 4.0** ([`content/LICENSE`](../content/LICENSE),
  decided 2026-09-24). It is free and non-commercial, which lets it build on
  WHO guidance (CC BY-NC-SA 3.0 IGO) and other non-commercial open sources.
  The code is licensed separately (Apache-2.0 + Commons Clause).
- **Facts are not copyrightable.** Any source may be cited and its facts
  restated in VedaMD's own words.
- **Reusing a source's wording** depends on its `reuseMode` in
  [`content/sources/registry.json`](../content/sources/registry.json):
  `adapt` (reproduce or adapt; the result is CC BY-NC-SA 4.0),
  `verbatim` (no-derivatives licences: quote unaltered only), `separate`
  (share-alike licences such as Wikipedia's CC BY-SA: keep as a separately
  licensed item, never merged into a record), or `cite-only` (link only).
  For `per-item` sources (PMC, WHO IRIS, Kenya MoH) check the individual
  document's licence first.
- Any record that reproduces or adapts third-party material names it in
  `references[]` and carries the notice listed in
  [`content/NOTICE`](../content/NOTICE). `npm run bundle:check-licence`
  enforces that declared licences match the registry.
- Evidence behind each verdict: [`content-sources-and-gaps.md`](./content-sources-and-gaps.md)
  and [`manufacturer-label-licensing.md`](./manufacturer-label-licensing.md).

## How a reference is scored

`scripts/score-citation-sources.js` walks every JSON file in the signed
bundle and classifies each reference using:

1. **URL host pattern** — the strongest signal. Hostname is checked
   against a whitelist of recognised publishers / societies / regulators
   for tier A and B; against a Wikipedia / consumer-aggregator list for
   tier D.
2. **Label keyword fallback** — used when a reference has no URL or the
   host isn't recognised. Catches "WHO Guidelines", "NEJM", "BNF",
   "EAACI", "Briggs", "et al. … 20XX" patterns, etc.
3. **Default** — `C` (conservative).

To re-score the entire bundle after editing the heuristic, pass
`--rewrite`:

```
npm run bundle:score-sources -- --rewrite
```
