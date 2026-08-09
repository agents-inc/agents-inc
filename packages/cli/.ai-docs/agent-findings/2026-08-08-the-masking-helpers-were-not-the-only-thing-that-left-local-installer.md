---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/.ai-docs/reference/config/config-merger.md
  - packages/cli/.ai-docs/reference/config/scope-split.md
  - packages/cli/.ai-docs/reference/concepts/scope-system.md
  - packages/cli/.ai-docs/reference/features/agent-system.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-08
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: scope-discipline-deferred
status: resolved
resolved_by: >-
  CLI-437. Swept by symbol rather than by this finding's site table, per the standard proposed
  below — a script cross-checking every `local-installer` line in `reference/` against the three
  modules' actual declarations, which is what decides a row rather than a reading of it. Nine sites
  corrected across four documents: `features/agent-system.md` (2), `concepts/scope-system.md` (3),
  `config/config-merger.md` (4). Two beyond this finding's table, both found only by the symbol
  cross-check — `scope-system.md`'s self-heal parenthetical naming `dropOrphanedDerivedMasks` /
  `dropOrphanedDerivedAgentMasks`, and its predicate-consumers row, which turned out to be wrong in
  a way the table did not predict: `local-installer.ts` still consumes four of the five predicates
  listed against it and never consumed `isGlobalTombstone`, while `config-gate/propagate.ts` had no
  row at all. Three sites that grep as drift were verified CORRECT and left: `config-merger.md`'s
  `local-installer.test.ts` reference (that describe block is really still there),
  `plugin-system.md`'s `buildAgentScopeMap()` row (still declared there; `activeAgentScopeMap` is a
  parenthetical), and every `local-installer.ts` row in `config/scope-split.md`, as this finding
  said. `architecture-overview.md` was already right. The closing check is the cross-check itself,
  re-run to empty.
---

## What Was Wrong

CLI-434 swept the six cross-scope **masking** helpers out of `installation/local-installer.ts` and
into `config-gate/propagate.ts` across the docs. The symbol-by-symbol grep that closed it showed
the masking helpers were not the only thing that moved. A second, larger set of `propagate.ts`
symbols is still documented as living in `local-installer.ts`, and a third set moved to
`configuration/scope-predicates.ts`:

| Symbol                                                                                                         | Doc says             | Actually in                         |
| -------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------- |
| `mergeGlobalConfigs`, `additiveMergeStack`, `mergeAgentCategories`                                             | `local-installer.ts` | `config-gate/propagate.ts`          |
| `propagateGlobalChangesToProjects`                                                                             | `local-installer.ts` | `config-gate/propagate.ts`          |
| `registerProjectPath` / `deregisterProjectPath`                                                                | `local-installer.ts` | `config-gate/propagate.ts`          |
| `isActiveAt`, `isGlobalTombstone`, `activeSkillScopeMap`, `activeAgentScopeMap`, `effectivelyExcludedSkillIds` | `local-installer.ts` | `configuration/scope-predicates.ts` |

Sites: `config/config-merger.md` (the anchors line and the `projects`-preservation paragraph),
`concepts/scope-system.md` (two rows in the by-module table), `features/agent-system.md` (two rows
naming `propagateGlobalChangesToProjects` and `mergeGlobalConfigs`). `config/scope-split.md`'s
`local-installer.ts` rows are **correct** — `computeNewlyAddedSkillIds` and
`computeScopeEligibilityGained` really are still there, as are `buildCompileAgents`,
`buildAgentScopeMap` and `compileAndWriteAgents`. That mixture is the trap: the same file name is
right in some rows and wrong in others, so a reader cannot dismiss the file wholesale or trust it
wholesale.

This is the fifth recorded recurrence of "a doc names a path a symbol left", and the second within
the same week on the same source file.

## Fix Applied

None — out of CLI-434's scope, which named the masking helpers specifically and was closed against
that list. Recorded here with every site enumerated so the next sweep is mechanical. The check that
finds them all is one line per symbol:

```
grep -n "^\(export \)\?\(async \)\?function <symbol>" src/cli/lib/**/*.ts
```

## Proposed Standard

The symbol-in-file rule proposed by
`2026-08-08-six-docs-place-the-cross-scope-masking-helpers-in-the-module-they-left.md` is the right
rule and this is evidence for making it runnable rather than advisory. One addition, learned from
closing that finding:

> **Do not close a moved-symbol sweep against the finding's site table.** A finding written while
> reading one paragraph records the sites it saw; the module a symbol moved to is a property of the
> symbol, so the closing check must be `grep` per SYMBOL over the whole doc tree. CLI-434's table
> listed seven sites; the symbol grep found eleven, and two of them were in documents the table
> did not name.
