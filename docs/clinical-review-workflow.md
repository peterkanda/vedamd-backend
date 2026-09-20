# Clinical content review workflow

How clinical content goes from `draft` to `approved` (FR-024: two named
reviewers). The signed bundle is never edited by the API: reviewers record
decisions, and the content team applies them to the **next** bundle version.

## Roles

| Who | Does |
|---|---|
| Clinical reviewer | Reviews records in the queue and records approve / request-changes decisions |
| Content lead | Fixes records that had changes requested, exports approvals, builds and signs the next bundle |
| Platform admin | Adds reviewers: their OIDC subject goes in `CLINICAL_REVIEWER_SUBS` (comma-separated) |

Reviewer identity comes from the reviewer's login, never from what they type.
Decisions made through the development bypass are stored but never count.

## 1. See where we stand

`GET /v1/governance/readiness` (or `npm run readiness:report`, which writes
`content/safety/release-readiness.md`) lists what blocks an approved-only
release. It also shows approval per domain, ordered by clinical risk.

## 2. Review

1. `GET /v1/governance/review-queue?tier=1`: the queue, highest risk first.
   - Tier 1: dosing, interactions, CDS rules, antidotes, renal/hepatic dosing, pregnancy.
   - Within a tier, KEML level 1 drugs come first.
   - Filter with `domain`, `state` (`needs-review`, `needs-second-review`, `changes-requested`, `ready-to-promote`), `limit` and `offset`.
2. `GET /v1/governance/review-queue/{domain}/{recordId}`: the record exactly as it ships, plus:
   - **flags**:
     - `quarantinedCode`: the drug's RxNorm code is known to be wrong;
     - `uncappedPerKgDose`: a per-kg dose with no stated maximum, which you should confirm;
     - `citationsWithoutUrl`: citations a clinician can't open;
     - `soleDTierCitations`: no authoritative source;
   - `approvalBlockers`: why approval would be refused right now;
   - the decision history.
3. `POST /v1/governance/reviews` with:

   ```json
   { "domain": "drugs", "recordId": "metformin", "recordHash": "<from the packet>",
     "decision": "approve", "role": "Consultant Physician" }
   ```

   - Use `"decision": "request-changes"` with `notes` explaining what is wrong.
   - `recordHash` pins your decision to the exact content you read. If the content changes later, your decision stops counting and the record returns to the queue.

A record is **ready to promote** when two different reviewers' latest decisions on its current content are `approve`, and nobody's latest decision is `request-changes`.

Approval is refused while:
- the drug's RxNorm code is quarantined (fix the code first, see `content/safety/rxnorm-code-audit.md`);
- the record's only graded citations are D-tier.

## Correction proposals

Some defects have a verifiable fix, e.g. an RxNorm code that the audit showed belongs to another drug, where the correct code is known. These are generated as **proposals** (`npm run corrections:propose`, see `content/corrections/`) and appear in the queue under `domain=corrections`, at the risk tier of the record they change.

- Review them like records: two approvals each.
- A proposal is blocked if its target record has changed since the proposal was generated.
- Issues without a verifiable fix are listed in `content/corrections/worklist.md` for editors.

## 3. Promote into the next bundle version

```bash
cp -r content/bundles/v0.1.0 content/bundles/v0.2.0          # the next version
curl -H "Authorization: Bearer $TOKEN" \
  https://<api>/v1/governance/reviews/export > approvals.json
npm run corrections:apply -- --bundle content/bundles/v0.2.0 --from-decisions approvals.json --dry-run
npm run corrections:apply -- --bundle content/bundles/v0.2.0 --from-decisions approvals.json
npm run bundle:promote -- --bundle content/bundles/v0.2.0 --from-decisions approvals.json --dry-run
npm run bundle:promote -- --bundle content/bundles/v0.2.0 --from-decisions approvals.json
npm run bundle:sign -- --bundle content/bundles/v0.2.0 --version v0.2.0 --key <key> --signer <signer>
```

Apply corrections **first**: a corrected record's content changes, so it returns to draft and needs its own review before it can be promoted. Records already approved in the same export can't be promoted if a correction changed them, because their hash no longer matches.

`--from-decisions` re-checks every approval itself: the content hash still matches, at least two distinct named reviewers with roles, and not D-tier only. It writes **nothing** if any record fails.

After promotion:
- lower `MAX_UNAPPROVED` in `scripts/promote-bundle.ts`;
- re-run `npm run audit:drug-rxnorm -- --bundle content/bundles/v0.2.0` and `npm run corrections:propose -- --bundle content/bundles/v0.2.0` so corrected codes leave the quarantine and applied proposals drop out;
- once tier 1 is fully approved, plan the switch to `CONTENT_REQUIRE_APPROVED=true`.

## Database

Decisions are stored in the `content_reviews` table (migration `0010_content_reviews`).
- Without `DATABASE_URL`, they're kept in memory and lost on restart. That's for development only.
- `scripts/supabase-bootstrap.sql` is behind the migrations (it predates 0007–0010). Use `npm run db:migrate`.
