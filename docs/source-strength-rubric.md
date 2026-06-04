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

The strength tier does not change copyright behaviour:

- VedaMD never reproduces source text. We link to sources and paraphrase
  facts (which are not copyrightable). Wikipedia content is CC BY-SA;
  the licence permits unlimited linking and citation.
- Where a record is materially derived from a single open-access source,
  the source is named in the `references[]` array. Closed-access source
  text (publisher PDFs, FDA labels) is never copied into the bundle —
  only the citation pointer.
- The bundle JSON itself is owned by VedaMD; the per-domain content is
  copyrighted by VedaMD and licensed under the platform's commercial
  terms. Citations point readers to upstream sources for the underlying
  evidence.

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
