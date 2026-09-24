# Contributing to VedaMD Backend

Thanks for your interest in contributing. The code is source-available
under [Apache-2.0 + Commons Clause](./LICENSE) — see the License section of
the [README](./README.md) for what that means in practice. The clinical
content under `content/` is licensed separately under
[CC BY-NC-SA 4.0](./content/LICENSE). By submitting a contribution, you agree
it's licensed under the same terms as the part of the project it changes:
code under Apache-2.0 + Commons Clause, content under CC BY-NC-SA 4.0.

## Contributing clinical content

This covers content records, overlays, corrections, translations,
formulary data and anything else under `content/`. By submitting it, you
confirm that:

1. **It contains no patient data.** No names, identifiers, dates of birth,
   record numbers, images of patients or case details that could identify
   someone (Kenya Data Protection Act 2019). VedaMD stores no patient data,
   and contributions must not either.
2. **You have the right to contribute it.** It is your own work, or it comes
   from a source whose licence allows it. Check the source's `reuseMode` in
   [`content/sources/registry.json`](./content/sources/registry.json):
   `adapt` sources may be adapted, `verbatim` sources may only be quoted
   unaltered, `separate` sources must stay separate items under their own
   licence, and `cite-only` sources may only be cited and paraphrased as
   facts. Name every source in the record's `references[]` and add any
   notice the source requires to [`content/NOTICE`](./content/NOTICE).
3. **You declare conflicts of interest.** State any relationship with a
   manufacturer or distributor of a product the content mentions.

Contributed content enters as `draft` and is published only after the
two-reviewer clinical sign-off in
[`docs/clinical-review-workflow.md`](./docs/clinical-review-workflow.md).

## Getting set up

```bash
cp .env.example .env
npm install
npm run start:dev
```

Then `http://localhost:3000/docs` has the Swagger UI, and `/health` is a
liveness check. See the [README](./README.md) for the full module map and
architecture notes.

## Before opening a PR

Run what CI runs:

```bash
npm run typecheck
npm run build
npm test
```

If you touched the clinical content bundle under `content/`, also run:

```bash
npm run bundle:verify
npm run bundle:check-licence
```

New/changed clinical content overlays go through `npm run overlays:validate`
and require sign-off per the review workflow described in
[`content/overlays/README.md`](./content/overlays/README.md) — draft content
never ships in a signed bundle without clinical review.

## Reporting bugs / requesting features

Open a GitHub issue. For anything that could be a security vulnerability,
see [`SECURITY.md`](./SECURITY.md) instead — please don't file those as
public issues.

## Pull requests

- Keep PRs focused — one logical change per PR.
- Add/update tests for behavior changes.
- CI (typecheck, build, unit tests, OpenAPI-snapshot drift check, content
  bundle verification) must pass before merge.
