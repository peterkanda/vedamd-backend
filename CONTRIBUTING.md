# Contributing to VedaMD Backend

Thanks for your interest in contributing. This project is source-available
under [Apache-2.0 + Commons Clause](./LICENSE) — see the License section of
the [README](./README.md) for what that means in practice. By submitting a
contribution, you agree it's licensed under the same terms as the rest of the
project.

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
