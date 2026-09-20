# Content corrections

Machine-verified fixes to bundle content, reviewed by clinicians before they
are applied to the **next** bundle version. Nothing here changes the running
bundle.

| File | Produced by | Contents |
|---|---|---|
| `proposals.json` | `npm run corrections:propose` | RxNorm code fixes verified against RxNav (from `npm run audit:drug-rxnorm`) |
| `worklist.md` | `npm run corrections:propose` | Issues needing human judgement: quarantined codes with no single replacement, ATC/SNOMED codes shared across molecules, candidate duplicate monographs, `X` / `X-detail` pairs, and codes the corrections will make shared |

Flow (details in `docs/clinical-review-workflow.md`):

1. `npm run audit:drug-rxnorm` → `npm run corrections:propose`
2. Reviewers approve proposals in the review queue (`domain=corrections`); two reviewers each.
3. `GET /v1/governance/reviews/export` → `npm run corrections:apply -- --bundle <next> --from-decisions <export>`
4. Corrected records return to draft; review them, then `bundle:promote` and `bundle:sign`.

Only fields listed in `CORRECTABLE_FIELDS` (`src/modules/governance/corrections.ts`)
can be machine-corrected — today just `rxnorm`. Clinical text never is.
