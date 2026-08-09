---
type: architectural-drift
severity: high
affected_files:
  - packages/cli/eslint.config.js
  - packages/eslint-config/base.js
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: convention-undocumented
status: resolved
resolved_by: "CLI-427, 2026-08-08 — packages/cli/eslint.config.js now extends @workspace/eslint-config (both Proposed Standard items landed: the structural fix, and scripts/check-shared-eslint-config.ts as deps:check's fourth axis). Equivalence proved by diffing `eslint --print-config` across sixteen file classes: one added option, no rule changed severity"
---

## What Was Wrong

`packages/cli/eslint.config.js` composes `tseslint.configs.recommendedTypeChecked` directly. It
does **not** extend `@workspace/eslint-config`, which every other workspace does. The two configs
overlap almost completely, so the divergence is invisible until you look for a rule that only one
of them carries.

`no-unnecessary-condition` is exactly that rule. `packages/eslint-config/base.js` adds it beyond
the recommended set, with a comment explaining why. `recommendedTypeChecked` does not include it.
So in `packages/cli` the rule was never enabled — and the CLI-393 debt block claimed the opposite:

> These two are the shared config's other addition and are off HERE ONLY

The first half is true of the shared config; the second half describes an override of something
this file never inherited. Deleting the `"off"` line as part of CLI-422 therefore did nothing —
the rule stayed silent, and the "252 reports" the block cited were unverifiable from this
package's own config. Turning it on required adding `"@typescript-eslint/no-unnecessary-condition":
"error"` explicitly.

The same gap applies to anything else the shared base adds in future: `packages/cli` will not get
it, and nothing fails when that happens. This is the eslint twin of the tsconfig divergence CLI-396
found — that one is now guarded by `deps:check`'s shared-tsconfig comparison; the eslint side has
no equivalent check.

## Fix Applied

`no-unnecessary-condition` is now stated explicitly in `packages/cli/eslint.config.js` with a
comment saying why it is stated rather than inherited, and naming the fact that this file composes
`recommendedTypeChecked` itself. Both it and `no-unnecessary-type-assertion` are on, and the
package is clean under them.

The structural divergence itself is NOT fixed. Making `packages/cli` extend
`@workspace/eslint-config` is a real change — the file carries seven zone-scoped blocks for the
config-gate enforcement layer, the React-hooks scoping and the task-ID guard, and the shared base
sets `projectService: true` where this file needs the `allowDefaultProject` carve-out for
`scripts/`. That merge is a task, not a footnote to this one.

## Proposed Standard

Two additions, both mirroring what already exists for tsconfig:

1. **`deps:check` should compare eslint configs the way it compares tsconfigs.**
   `packages/cli/scripts/check-shared-tsconfig.ts` exists because a workspace silently not
   extending the shared config stayed green for months across tsc, eslint, both suites, tsup and
   turbo. The eslint side has the identical failure mode and no checker. A workspace that does not
   extend `@workspace/eslint-config` should have to record why, in the same
   "6 extend, 4 record why they do not" shape.

2. **`typescript-types-bible.md` should state that a rule's presence is a property of the config
   that is loaded, not of the rule's reputation.** A debt comment that names a rule as "off here"
   is making a claim about inheritance. Verify it by running the rule, not by reading the note —
   the note in this case had been wrong since it was written.
