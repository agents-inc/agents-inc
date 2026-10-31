---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/scripts/check-vitest-collects-every-test.ts
  - packages/cli/scripts/check-vitest-collects-every-test.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-31
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  `createTempDir` in `src/cli/lib/__tests__/test-fs-utils.ts` hands out the real path, and
  `vitest.setup.ts` makes the default test home through it; four specs whose assertion depended on
  the temp path's spelling (its length, or a `.claude` folder above it) no longer do.
  `test-fs-utils.test.ts` pins the real path under a symlinked TMPDIR on a Linux run, red first. The
  unit suite passes from `packages/cli` under a symlinked TMPDIR; nothing runs it that way in CI.
---

## What Was Wrong

`check-vitest-collects-every-test.ts` joined workspace paths onto the root exactly as given and
compared them with the paths Vitest reports, which are real paths. Reached through a symlink, every
collected file looked uncollected; given as a relative path, the config failed to load once the
check changed working directory. On a Mac `os.tmpdir()` is under `/var`, a symlink to
`/private/var`, so 10 of that spec's 17 fixtures failed there and passed on Linux, where the
gates run. `clean-code-standards.md` 15.5 already forbids mixing `path.resolve` with a real path
on two sides of a comparison; nothing on Linux exercises it.

The same shape is wider than this script. Census of the CLI unit suite, 2026-10-31, from
`packages/cli` with `tmp-link` a symlink to an empty folder:

```
TMPDIR=<folder>/tmp-link npx vitest run --maxWorkers=4
 Test Files  28 failed | 302 passed (330)
      Tests  141 failed | 8939 passed (9080)
```

The two failures sampled (`detect-project.test.ts`, `bare-run.test.ts`) expect a path built from
the temp dir as created, while the CLI reports the real one through `process.cwd()`. The other 26
were not read; whether each is a spec or a product defect is open.

## Fix Applied

`check()` resolves the root once with `realpathSync(path.resolve(repoRoot))`. Its spec adds a clean
and a refused fixture reached through a symlinked root, and a runner case with a relative
`--root`; all three were red first. The spec passes 20 of 20 under the symlinked TMPDIR above.

## Proposed Standard

A gate that runs the CLI unit suite once with TMPDIR reached through a symlink, so the Mac's temp
dir shape reddens on Linux. It lands only once the 28 files are triaged, or it starts red. Until
then, a spec comparing a path it built under `os.tmpdir()` with one a tool or `process.cwd()`
reports takes the real path first, as `content-validator.test.ts` does.
This sits beside 15.5 in `clean-code-standards.md`, and does not conflict with `e2e/anti-patterns.md`
on symlinked sandboxes, which concerns E2E specs and `process.cwd()` only.
