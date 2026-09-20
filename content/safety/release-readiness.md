# Release readiness — bundle v0.1.0

Generated 2026-09-18T22:19:47.810Z by `npm run readiness:report` (same data as
`GET /v1/governance/readiness`).

**Release-ready for approved-only serving: NO**

Blocking:
- Clinical content approved (FR-024 two-reviewer sign-off): 0 of 7,144 records approved (0%); tier 1: 0 of 3,915
- Drug codes identify the right molecule: 229 known-wrong RxNorm code(s) (ignored at runtime); codes shared across molecules — RxNorm 1, ATC 24, SNOMED not served (CONTENT_SNOMED_ENABLED off)

| check | status | measurement | next step |
|---|---|---|---|
| Clinical content approved (FR-024 two-reviewer sign-off) | ⛔ block | 0 of 7,144 records approved (0%); tier 1: 0 of 3,915 | Review tier-1 domains first (dosing, interactions, CDS rules, antidotes); promote with npm run bundle:promote. |
| Approved records carry ≥ 2 reviewers and approvedAt | ✅ pass | 0 FR-024 violation(s) |  |
| Runtime serves approved content only (CONTENT_REQUIRE_APPROVED) | ⚠️ warn | off — draft content is being served | Enable once the approval check passes. |
| Drug codes identify the right molecule | ⛔ block | 229 known-wrong RxNorm code(s) (ignored at runtime); codes shared across molecules — RxNorm 1, ATC 24, SNOMED not served (CONTENT_SNOMED_ENABLED off) | Fix codes in the next bundle version from content/safety/rxnorm-code-audit.md; re-run npm run audit:drug-rxnorm. |
| Citations link to a verifiable source | ⚠️ warn | 2,899 of 11,385 citations have no URL | Work content/safety/citation-link-worklist.md (npm run enrich:citation-links proposes links). |
| Per-kg doses state a maximum (or are confirmed uncapped) | ⚠️ warn | 363 record(s) state a per-kg dose with no maximum | Confirm each in content/safety/perkg-dose-review.md during tier-1 review. |
| Expansion-country overlays clinically signed off | ⚠️ warn | 0 of 9 countries signed off | Does not block a Kenya release; required before serving a country as localized. |
| Manufacturer labels in the bundle are approved | ✅ pass | none shipped — draft lane only (content/labels/), pending legal sign-off |  |
| Verified content corrections applied | ⚠️ warn | 213 correction proposal(s) awaiting review and application to the next bundle | Review under domain "corrections" in the review queue; apply with npm run corrections:apply. Worklist: content/corrections/worklist.md. |

## Approval by domain (review in this order)

| tier | domain | records | approved | in review | draft | approved % |
|---|---|---|---|---|---|---|
| 1 | drugs | 855 | 0 | 0 | 855 | 0% |
| 1 | cds-rules | 819 | 0 | 0 | 819 | 0% |
| 1 | drug-interactions | 641 | 0 | 0 | 641 | 0% |
| 1 | pregnancy-lactation | 440 | 0 | 0 | 440 | 0% |
| 1 | drug-disease | 429 | 0 | 0 | 429 | 0% |
| 1 | iv-compatibility | 209 | 0 | 0 | 209 | 0% |
| 1 | hepatic-dose | 172 | 0 | 0 | 172 | 0% |
| 1 | antidotes | 154 | 0 | 0 | 154 | 0% |
| 1 | allergy-cross-reactivity | 120 | 0 | 0 | 120 | 0% |
| 1 | anticoagulant-reversal | 39 | 0 | 0 | 39 | 0% |
| 1 | renal-dose | 37 | 0 | 0 | 37 | 0% |
| 2 | conditions | 1529 | 0 | 0 | 1529 | 0% |
| 2 | clinical-scores | 223 | 0 | 0 | 223 | 0% |
| 2 | procedures | 202 | 0 | 0 | 202 | 0% |
| 2 | clinical-procedures | 128 | 0 | 0 | 128 | 0% |
| 2 | symptom-triage | 125 | 0 | 0 | 125 | 0% |
| 2 | pharmacogenomics | 113 | 0 | 0 | 113 | 0% |
| 2 | immunization | 87 | 0 | 0 | 87 | 0% |
| 2 | toxidromes | 50 | 0 | 0 | 50 | 0% |
| 3 | reference-ranges | 321 | 0 | 0 | 321 | 0% |
| 3 | preventive-care | 177 | 0 | 0 | 177 | 0% |
| 3 | notifiable-diseases | 109 | 0 | 0 | 109 | 0% |
| 3 | bedside-interpretation | 104 | 0 | 0 | 104 | 0% |
| 3 | growth-development | 61 | 0 | 0 | 61 | 0% |

Tier 1 = content that directly drives a dose, a drug choice or a safety alert;
tier 2 = clinical guidance and decision aids; tier 3 = reference material.
