---
type: missing-standard
severity: low
affected_files:
  - docs/architecture.md
  - apps/editor/src/features/configure/lib/use-pinned.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-21
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`docs/architecture.md` › "Mutation testing" says Stryker cannot reach Playwright, and stops there. So
a NoCoverage mutant in code only a browser runs has no stated way to be judged. In
`apps/editor/vitest.config.ts`'s node environment nothing renders, so every hook and component
mutant is in that position.

Measured on REPO-44 step 8: `use-pinned.ts`'s `BAR_STUCK_ATTRIBUTE = "data-bar-stuck"` → `""` was
NoCoverage in the editor's first pass. It is user-visible: `setAttribute("")` throws
`InvalidCharacterError` once the filter bar sticks. Served to the dev server, `e2e/specs/sticky-bar.spec.ts`
went from 26 passed to 23 failed, 3 passed.

## Fix Applied

None in the tree. The method, as used:

- A Vite config outside the tree, named `.mts`, calls the editor's `vite.config.ts` function and
  appends the same `enforce: "pre"` transform plugin as
  `2026-10-21-a-hand-mutant-under-an-as-can-be-served-to-one-suite-without-writing-the-shared-tree`.
  Named `.ts` outside a `"type": "module"` package, Vite loads it as CommonJS and the editor config
  fails to load (`tailwindcss(...) is not a function`).
- A Playwright config outside the tree spreads `apps/editor/playwright.config.ts` and overrides
  `testDir` (absolute), `outputDir`, and `webServer.command` / `cwd` to start that Vite config on
  its own port, which `EDITOR_E2E_PORT` hands to the spread `baseURL`.
- The exactly-once snippet check catches a stale snippet, but a `MUTANT_FILE` that matches no module
  id serves nothing and reads as Survived. A positive control is needed: the same file with a
  `throw` served failed 32 of 46 `output-preview.spec.ts` tests.
- A spec that spawns the CLI, such as `preview-matches-install.spec.ts`, reads `packages/cli/dist`,
  so it runs under the shared dist lock like any other CLI build.

## Proposed Standard

`docs/architecture.md` › "Mutation testing": a mutant only Playwright can reach is judged by
serving it to the dev server through a Vite config outside the tree, with a positive control
showing the file was served. Nothing checks this. Not in conflict with `CLAUDE.md`.
