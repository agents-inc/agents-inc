---
type: standard-gap
severity: medium
affected_files:
  - src/cli/types/matrix.ts
  - src/cli/types/skills.ts
  - packages/matrix/src/vendor/matrix.ts
  - packages/matrix/src/vendor/skills.ts
  - scripts/generate-matrix-package.ts
  - vitest.global-setup.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-18
reporting_agent: codex-keeper
category: architecture
domain: infra
root_cause: rule-not-visible
status: partial
partial_note: >-
  The two vendored copies were regenerated and the scripts suite is back to 139 of 139. What is
  pending is the maintenance-hook row that would have told the editing agent to regenerate, and a
  decision about the second-order effect on the dist-staleness gate.
---

## What Was Wrong

Seven files under `src/cli/types/` are copied **byte for byte** into `packages/matrix/src/vendor/`
by `scripts/generate-matrix-package.ts` (`VENDORED_TYPE_FILES`). Byte for byte includes comments.
Correcting a stale JSDoc line in `src/cli/types/skills.ts` and `src/cli/types/matrix.ts` — a change
with no type, no value and no behaviour in it — drifted the vendored copies and turned
`scripts/generate-matrix-package.test.ts` red, three failures out of 139.

Nothing in front of the editing agent says so. `documentation-bible.md`'s maintenance-hook table
has a row for `src/cli/types/**`, and it lists three documents to update and no regeneration step —
the table's whole subject is which DOCUMENT owns a change, so a generated SOURCE artifact has no
column to appear in. `reference/features/code-generation.md` does record the coupling, in a "Reads"
cell reading "Seven files under `src/cli/types/`", but an agent editing a comment has no reason to
open the code-generation reference.

**The second-order effect is the expensive half.** `vitest.global-setup.ts` refuses the whole run
when `dist/` predates `packages/matrix/src`, and says in its own comment that this is "the half
that cannot be bypassed". So regenerating the vendored copies — the correct remedy — immediately
blocks every vitest project until someone rebuilds, including the `unit` project the failing
`scripts/` specs live in. A comment fix therefore costs a regeneration and a build, or it costs
driving each checker by hand. With several agents mid-edit in one tree, building to unblock a
suite captures whatever else is half-written into `dist/`, so the hand-driven route is the only
safe one and it is not written down anywhere.

## Fix Applied

`bun scripts/run-generate-matrix-package.ts` — the two vendored copies now carry the corrected
comments and nothing else moved (`git diff --stat packages/matrix` is two files, four insertions,
three deletions, all comment lines). `npx vitest run scripts/` is 139 of 139.

While `dist/` was stale, the checkers were driven directly rather than by rebuilding mid-flight:
`bun scripts/run-generate-matrix-package.ts --check` (which compares in memory), the three
`run-check-shared-*.ts` entry points, and a four-line bun driver calling `check({})` out of
`scripts/check-enumeration-drift.ts` and `scripts/check-findings-frontmatter.ts`. All clean.

## Proposed Standard

**Give the vendoring its own maintenance row.** In `documentation-bible.md`'s hook table, the
`src/cli/types/**` row should carry the regeneration alongside the documents: _any edit to one of
`VENDORED_TYPE_FILES` — comments included — owes `bun run generate:matrix`._ The word "comments" is
the load-bearing part; every agent already knows a type change propagates.

**Say where to drive a checker when the dist gate blocks the suite.** `reference/features/code-generation.md`
should name the direct entry points beside the npm scripts, and state the rule the multi-agent case
needs: when other agents are mid-edit, drive the checker rather than rebuild `dist/`, because a
build snapshots the whole tree and not just your change.
