---
type: standard-gap
severity: medium
affected_files:
  - e2e/vitest.config.ts
  - package.json
  - e2e/smoke/home-isolation.smoke.test.ts
  - e2e/smoke/plugin-chain-poc.smoke.test.ts
  - e2e/smoke/plugin-install.smoke.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e-testing-bible.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
date: 2026-08-17
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  Every half of the Proposed Standard landed, and one of them landed in a stronger shape than
  proposed. `e2e/vitest.config.ts` now declares two named projects over one tree rather than a
  second config file — `e2e` including `e2e/**/*.e2e.test.ts` and `smoke` including
  `e2e/**/*.smoke.test.ts` — so `pom-framework.e2e.test.ts` keeps its place in `test:e2e` by its
  filename and cannot be double-run. `package.json` carries `test:smoke`
  ("vitest --config e2e/vitest.config.ts --run --project smoke") with its own `pretest:smoke`
  build, outside the default `test` chain, and a `//test:smoke` note explaining why it runs in
  CI anyway (`.github/workflows/ci.yml` invokes it): every describe there is
  `skipIf(!claudeAvailable)`, so a fully-skipped run still proves the files collect, import and
  resolve their helpers, which is the whole of what rotted. The enforcement the finding asked for
  is `src/cli/lib/__tests__/spec-gates.test.ts` -> "every spec the repository holds belongs to a
  gate", which asserts both directions: every `e2e/**/*.test.ts` on disk is claimed by some
  project's `include`, and every declared project is named by a package script as
  `--project <name>`. The four documents that said "run explicitly" now name the script —
  `standards/e2e/README.md` (Vitest Configuration `projects` row),
  `reference/testing/e2e-infrastructure.md`, `standards/e2e/user-journeys.md`, and the config's
  own comment.
---

## What Was Wrong

Four documents say the same thing about the three `*.smoke.test.ts` files — that they are
excluded from `e2e/vitest.config.ts`'s `include` and are "run explicitly", "run separately",
"must be run separately". None of them says with what, and no such command exists.

`package.json` has `test` and `test:e2e` and nothing else. `test:e2e` runs
`vitest --config e2e/vitest.config.ts --run`, whose `include` is `e2e/**/*.e2e.test.ts`, so a
positional filter naming a smoke file collects nothing:

```
$ npx vitest --config e2e/vitest.config.ts --run home-isolation
No test files found
```

Vitest has no `--include` flag to widen it from the command line (`--exclude` exists; its
opposite does not), so there is no invocation of the committed config that reaches these files.
Running them at all requires authoring a second config by hand.

This is why the three smoke files were the ones carrying stale claims. Two of their headers
still described a 2026 blocker as unresolved, one asserted `expect(typeof result.exitCode).toBe("number")`
throughout, and one had been writing a marketplace manifest the Claude CLI rejects for its whole
life — none of which any routine run would surface, because no routine run includes them. They
are the suite's only coverage of the third-party binary the plugin path depends on, and they are
the part of the suite nothing executes.

## Fix Applied

None — discovery only. This session ran them via a scratchpad config, which is not a fix
anybody else inherits.

## Proposed Standard

Add a `test:smoke` script to `packages/cli/package.json` beside `test:e2e`, backed by a
committed `e2e/vitest.smoke.config.ts` that reuses the e2e settings and sets
`include: ["e2e/smoke/**/*.smoke.test.ts"]`. Two details matter and belong in its comments:

- `pom-framework.e2e.test.ts` lives in `e2e/smoke/` but is a framework self-test matched by the
  E2E include pattern — the smoke config must not double-run it, and `test:e2e` must keep it.
- Smoke tests probe an external binary, so `test:smoke` belongs outside the default `test`
  chain and outside `prepublishOnly`; a contributor without `claude` on PATH should see the
  whole file skip, not a missing script.

Then correct the four documents that currently say "run explicitly" to name the script, and
state in `standards/e2e/README.md` § Test Categories that a category excluded from every
runnable command is unowned coverage: if nothing runs it, its assertions are documentation.
