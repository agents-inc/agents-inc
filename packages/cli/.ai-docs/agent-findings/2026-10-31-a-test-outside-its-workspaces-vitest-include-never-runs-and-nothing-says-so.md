---
type: missing-standard
severity: medium
affected_files:
  - apps/editor/vitest.config.ts
  - packages/vitest-config/node.js
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-31
reporting_agent: web-developer
category: testing
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  `packages/cli/scripts/check-vitest-collects-every-test.ts`, run by `bun run deps:check`, refuses
  any workspace holding a `*.test.ts(x)` outside its `e2e/` and `node_modules/` that Vitest's own
  glob (`createVitest` then `globTestSpecifications`) over its `vitest.config.*` does not collect,
  naming the workspace and the file. The class is every such file in every workspace, and the check
  reads all of it: on 2026-10-31 `bun run deps:check` printed 427 test files in 13
  workspaces collected, none refused. The `editor-and-worker.md` sentence was the stopgap until
  this check and was not written.
---

## What Was Wrong

`packages/vitest-config/node.js` collects `src/**/*.test.ts`, and `apps/editor/vitest.config.ts`
extended it without adding to `include`, so `apps/editor/scripts/spa-fallback-shell.test.ts` was
never run by `bun run test --filter=editor`. The gate stayed green and printed no warning: a test
file no `include` reaches looks exactly like coverage until someone reads the file list.

## Fix Applied

`include: ["scripts/**/*.test.ts"]` in the editor config's `test` block; `mergeConfig` concatenates
it with the shared `src/**` glob, as `packages/cli/vitest.config.ts` already does for its scripts.

Census, run in `apps/editor` (whole list, not a sample; empty after the fix, the scripts test
before it):

```
comm -13 <(bunx vitest list --filesOnly | sort) <(git ls-files --cached --others --exclude-standard '*.test.ts' '*.test.tsx' ':!e2e/**' | sort)
```

A `find apps packages -name '*.test.ts'` outside `src/` and `e2e/` found test files only in
`apps/editor/scripts/` and `packages/cli/scripts/`, and the CLI config already collects the latter.

## Proposed Standard

A check beside `packages/cli/scripts/check-shared-vitest-config.ts` (run by `bun run deps:check`)
that refuses a workspace holding a `*.test.ts(x)` outside `e2e/` that its Vitest config does not
collect, using the census above per workspace. Until then, `editor-and-worker.md` could say that a
test added outside `src/` needs an `include` entry. Neither conflicts with a CLAUDE.md rule;
`packages/cli/CLAUDE.md`'s `e2e/helpers` rule is the same hazard for one directory.
