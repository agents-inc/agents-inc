---
type: missing-standard
severity: low
affected_files:
  - docs/briefing.md
  - apps/server/vitest.config.ts
standards_docs:
  - docs/briefing.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`briefing.md` rule 11 has a lane report the exact change it wants in a file it does not own, and
rule 9 has a verdict carry a reproduction. When the change is a test, that leaves a proposed spec
nobody has run, unless it can run without being written into the tree. For `apps/server`'s
workers pool it can. Three steps fail without their fix:

- A `.ts` vitest config in a directory with no `package.json` bundles as CommonJS and fails on the
  ESM-only `@cloudflare/vitest-pool-workers`. Fix: a `{ "type": "module" }` `package.json` beside it.
- Bare imports from a scratch file resolve nowhere. Fix: a `node_modules` symlink to the root's.
- Relative imports (`../vitest.setup`, `./crawl`) break once the file is copied. Fix: rewrite them
  to absolute paths.

## Fix Applied

None in the tree. The config used spreads `apps/server/vitest.config.ts` through `mergeConfig`, sets
`root` back to `apps/server` (so `./wrangler.jsonc` and `./vitest.setup.ts` resolve), and sets
`test.dir` to the scratch directory with `include: ["*.test.ts"]`. The preset's `src/**` include then
matches nothing there. It also set `server.fs.allow`; whether that is needed was not tested. For
typecheck, a scratch tsconfig extends the app's and lists the probe, `worker-configuration.d.ts` and
`src/cloudflare-test.d.ts`. For lint, `eslint --stdin --stdin-filename src/crawl.test.ts` runs in
the app. The source mutants were made in place, as the review's reproduction steps said, and each
was restored and checked with `sha256sum -c` and `git diff --quiet`.
`2026-10-21-a-hand-mutant-under-an-as-can-be-served-to-one-suite-without-writing-the-shared-tree`
gives the transform-plugin way to avoid that, and it composes with this one.

## Proposed Standard

`standards/briefing.md` rule 11: a lane that proposes a test for a file it does not own runs it from
outside the tree, red on the mutant and green on the source, and the report carries both runs.
Nothing checks it. Not in conflict with `CLAUDE.md`.
