---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/turbo.json
  - packages/cli/scripts/pre-push-hook.test.ts
  - packages/cli/scripts/generate-compile-package.test.ts
  - packages/cli/scripts/check-findings-frontmatter-against-this-repository.test.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-26
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: rule-not-visible
status: partial
partial_note: >-
  The test task now hashes every file outside the package that a spec reads, except the
  repository-wide symbol scan, and a spec pins the list. Whether that scan should be hashed is an
  owner question. The rule is not yet stated in docs/architecture.md or packages/cli/CLAUDE.md.
---

## What Was Wrong

`packages/cli/turbo.json` hashes the `test` task over the package plus `../../todo/**` and
`../../CLAUDE.md`, and its comment states the rule: "The extra inputs are trees the checkers read
outside this package, so a change there invalidates the cached run." Three specs in that task read
outside the package and are not listed:

- `scripts/pre-push-hook.test.ts` runs `.husky/pre-push` (REPO-42).
- `scripts/generate-compile-package.test.ts`, "runs the check in CI beside the matrix one", reads
  `.github/workflows/ci.yml`.
- `scripts/check-findings-frontmatter-against-this-repository.test.ts` resolves the symbols a
  finding names against the whole repository, `apps/` included.

Measured 2026-10-26, `npx turbo run test --filter=agents-inc --dry=json`: the only files hashed
from outside the package are under `CLAUDE.md` and `todo/`; `.husky/pre-push`,
`.github/workflows/ci.yml` and `apps/editor/package.json` are not, and the global cache inputs are
empty.

So a change to one of those files alone leaves `agents-inc#test`'s hash unchanged, and wherever a
run on the same package inputs is cached locally, turbo replays its green log without running the
spec. `.husky/pre-push` calls `bunx turbo run test --filter=agents-inc` without `--force`, so a push
editing only the hook is checked by a replay. CI keeps no turbo cache and runs fresh, so it does
catch it.

The sibling search was a sample, not a census: path climbs written literally
(`"../../`, `REPOSITORY_ROOT`, `repoRoot`) in `scripts/` and `src/cli/lib/__tests__/`. A read
routed through another constant would not show.

## Fix Applied

A census (static search, then `strace` over the specs) found more than the three above. The push
hook, the CI workflow, the root `package.json`, `README.md` and `docs/`, and each workspace's
`package.json`, `tsconfig*.json`, `vitest.config.*` and `eslint.config.*` are all read by specs in
`scripts/`. All of them are now in `test.inputs` in `packages/cli/turbo.json`.
`scripts/test-task-hashes-the-files-its-specs-read.test.ts` asks turbo's dry run what it hashes, and
fails on any file in the census that is missing. A new outside read is not caught until the census
is re-run. An editor source edit still leaves the hash alone.

An explicit input glob hashes git-ignored files too: `../../.husky/**` took in husky's generated
`.husky/_/` shims. So the input is `../../.husky/*`, the tracked hooks only.

The repository-wide symbol scan is still unhashed and the comment says so. Whether to hash it is
the owner's call.

## Proposed Standard

1. Add `"../../.husky/**"` and `"../../.github/**"` to `test.inputs` in `packages/cli/turbo.json`.
   Hashing `../../apps/**` would drop the CLI's test cache on every editor change, so the
   repository-wide symbol scan is better left unhashed and named as such in that comment.
2. State the rule where a spec author reads, not only in a JSON comment: `docs/architecture.md`
   "Gates", or `packages/cli/CLAUDE.md` "Test Assertions" — a spec in the CLI's `test` task that
   reads a file outside `packages/cli` lists it in `test.inputs`, or a change to that file alone
   replays a cached pass on every local gate.
3. Nothing cheap catches the class in general, because what a spec reads is not statically known.
