---
type: anti-pattern
severity: low
affected_files:
  - e2e/helpers/test-utils.ts
  - e2e/integration/fixture-configs-round-trip.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-26
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  The code half landed for both forms. The globalConfig form is honoured and pinned, and the
  globalImportPath (spread) form is no longer offered by writeProjectConfig. The proposed rule for
  standards/e2e/anti-patterns.md is unwritten.
---

## What Was Wrong

`refuseUnreachableConfig` in `e2e/helpers/test-utils.ts` reads back the `config.ts` that
`writeProjectConfig` wrote and writes it again with the same options, refusing a fixture whose bytes
move. With `{ isProjectConfig: true, globalConfig }`, the written file inlines the global's entries
under `// global`. Reading it back gives one config holding those entries as well as the project's.
Writing that again with the same `globalConfig` lists every global entry twice, once under
`// global` and once under `// project`. So every write with a non-empty `globalConfig` was refused.
Reproduced before the fix: `web-framework-react` and `web-developer` appeared under both comments
in the rewrite. An empty `globalConfig` round-tripped, so the defect needed entries to show.

No spec passed the option, so nothing was red. Census, from `packages/cli`:
`grep -rn "isProjectConfig\|globalImportPath" e2e --include='*.ts'` returns
`lifecycle/preview-matches-install.e2e.test.ts`, which calls `generateConfigSource` directly, and
`fixtures/project-builder.ts`, which writes the import form by hand. Neither goes through the
helper.

**Sibling: `globalImportPath`.** The reread follows the import and spreads the whole global config
into the project, entries and scalar fields alike, so the guard refused this form too once the
global held entries (reproduced 2026-10-26). It cannot be honoured: a scalar field the project
states and one it inherits read back the same. No product code writes the spread form.
`grep -rn "globalImportPath" packages apps --include='*.ts' --include='*.tsx'`, leaving out
`packages/compile/src/config-source.ts` and test files, returns only `e2e/fixtures/project-builder.ts`.

## Fix Applied

When a global is given, the guard now splits the reread config before writing it again
(`withoutInlinedGlobal`). It uses `splitConfigByScope(...).project`, the split the product makes
before a project-context write (`writeFromProjectContext` in `src/cli/lib/config-gate/index.ts`).
That half keeps global masks (tombstones) with the project's own entries, as the writer expects.

`writeProjectConfig` and `writeProjectConfigIn` now take `{ isProjectConfig: true; globalConfig }`
or nothing. A literal passing `globalImportPath` fails `tsc -p e2e/tsconfig.json` with TS2353, and
one passing `isProjectConfig` without a global fails with TS2345.

`fixture-configs-round-trip.e2e.test.ts` gained five cases under "a project config written with the
global config it inlines":

- Three were red with the old helper and are green now: a plain project half, a project half
  masking a global entry, and a global carrying a stack, a marketplace and domains under a project
  naming its own.
- Two controls stayed green throughout: a global with no entries is accepted, and a stack filing a
  skill under the wrong category is still refused with a global inlined.

Mutation-checked, one red each:

- Skipping the guard whenever a global is given turns the refusal control red.
- Splitting by `scope === "project"` alone drops the mask, which turns the masking case red.
- Keeping only the split's entries and stack drops the project's own marketplace and domains, which
  turns the stack-and-fields case red.

## Proposed Standard

For `standards/e2e/anti-patterns.md`: a guard that reads back what a writer wrote and writes it
again must first undo what the writer added (anything inlined, imported or merged in). Otherwise it
compares the writer's output with a different input. Where the addition cannot be undone, the
helper does not offer the option. This agrees with CLAUDE.md's round-trip rule (compare the two
ends' generated artefacts).
