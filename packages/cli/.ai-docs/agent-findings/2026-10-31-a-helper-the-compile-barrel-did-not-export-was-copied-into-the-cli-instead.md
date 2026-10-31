---
type: anti-pattern
severity: low
affected_files:
  - packages/compile/src/index.ts
  - packages/cli/src/cli/utils/string.ts
  - packages/cli/src/cli/lib/stacks/stacks-loader.ts
  - packages/cli/src/cli/utils/messages.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-31
reporting_agent: cli-developer
category: dry
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  `@workspace/compile` exports `inAnEnglishList` beside `bytewise`, `utils/string.ts` re-exports it,
  and the CLI's two private copies are deleted.
---

## What Was Wrong

The "A, B and C" join lived three times: `inAnEnglishList` in `packages/compile/src/string.ts`, a
private copy in `stacks-loader.ts` whose comment said the compile barrel did not export the original,
and `listed` in `messages.ts`. The lane that needed it did not own `packages/compile/src/index.ts`, so
it copied the helper rather than widening the export, and each copy could drift (an Oxford comma in
one) without any gate seeing it.

## Fix Applied

`export { bytewise, inAnEnglishList } from "./string.js"` in the compile barrel, the same re-export
in `utils/string.ts`, and both CLI call sites import it from there. Output is unchanged: the three
bodies agree for 0, 1 and n items. Census:
`grep -rn 'slice(0, -1).join(", ")' packages/cli/src packages/compile/src` finds only compile's
`string.ts` and a test's hand-built expected text.

## Proposed Standard

A helper that `@workspace/compile` declares but does not export is reached by exporting it, never by
copying it: a lane that does not own the barrel reports the one-line export as a cross-lane change.
No honest gate: a copy need not share the name or the body's text.

Not covered: `apps/editor` holds two private copies (`agent-switches.ts`, which matches; `provider.ts`,
which joins with "or" and so is a different function under the same name).
