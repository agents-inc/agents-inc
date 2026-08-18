---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/.ai-docs/reference/architecture-overview.md
  - packages/cli/.ai-docs/reference/concepts/guard-pattern.md
  - packages/cli/.ai-docs/reference/concepts/tombstone-pattern.md
  - packages/cli/.ai-docs/reference/config/config-merger.md
  - packages/cli/.ai-docs/reference/config/scope-split.md
  - packages/cli/.ai-docs/reference/features/plugin-system.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-08
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  CLI-434. Every site was corrected to `src/cli/lib/config-gate/propagate.ts`. The sweep found
  more sites than this finding's table listed — it recorded one per document, and
  `architecture-overview.md` and `guard-pattern.md` carry two and three respectively — so the
  closing grep was by SYMBOL, not by count: `grep -rn "local-installer" .ai-docs/` filtered to
  the eight masking names now returns only `buildAndMergeConfig`, which genuinely still lives
  there. Two sites outside this finding's six were corrected with them because they name
  `isExclusiveCategory`, one of the eight (`features/configuration.md` x2, `config/config-writer.md`),
  and `architecture-overview.md`'s "module-private" claim was corrected at the same time: the
  entry point is exported from `propagate.ts` for `config-gate/index.ts` and not re-exported
  from the gate's barrel.
---

## What Was Wrong

`reconcileProjectSplitAgainstGlobal` and the five module-private helpers around it
(`maskCollidingGlobalSkills`, `maskCollidingGlobalAgents`, `dropOrphanedDerivedMasks`,
`dropOrphanedDerivedAgentMasks`, `buildProjectCollisionTest`) are declared in
`src/cli/lib/config-gate/propagate.ts`. Seven sites across six documents place them in
`src/cli/lib/installation/local-installer.ts`, which declares none of them and imports none of
them:

| Doc                                       | Site                                                        |
| ----------------------------------------- | ----------------------------------------------------------- |
| `reference/architecture-overview.md`      | "**Entry point:** … module-private in `local-installer.ts`" |
| `reference/concepts/guard-pattern.md`     | the six-helper inventory line                               |
| `reference/concepts/tombstone-pattern.md` | the Derived conflict mask row                               |
| `reference/config/config-merger.md`       | two sites (prose + the post-split pointer)                  |
| `reference/config/scope-split.md`         | the post-split reconciliation pointer                       |
| `reference/features/plugin-system.md`     | the D-276 row's "vs `toggleTechnology`" cell                |

The behaviour each site describes is still correct; only the module is wrong. That is the
dangerous half — a reader who opens `local-installer.ts` to change masking finds an unrelated
file, and the natural conclusion is that the masking machinery was deleted rather than moved.
Two more sites in the same class were corrected in passing (`features/configuration.md` and
`concepts/scope-system.md`), because the paragraph naming the wrong module was the same
paragraph a `validate`-routing sweep had to rewrite.

This is a repeat recurrence of "a doc names an identifier or a path that moved" —
`2026-07-30-negative-exhaustiveness-claims-in-reference-docs-go-stale-silently.md` and
`2026-08-01-reference-docs-name-identifiers-that-no-longer-exist.md` record earlier ones, and a
further pass found eight reference docs still routing readers through a command that had been
deleted. A moved symbol is worse than a deleted one: the deleted name greps to nothing and the
reader knows immediately, while the moved name greps to a live declaration in a file the doc
does not mention.

## Fix Applied

None to the six files — out of scope for CLI-426, which named the `validate` routing and the
counts, not this class. The two sites inside CLI-426's own paragraphs were corrected. Recorded
here so the sweep is mechanical: every location is listed above and the correct module is one
string, `src/cli/lib/config-gate/propagate.ts`.

## Proposed Standard

The runnable check already proposed for the deleted-command class — every
`src/cli/**` path in `.ai-docs/**` must exist on disk — would not have caught any of these,
because `local-installer.ts` still exists. Extend it by one step, in
`.ai-docs/standards/documentation-bible.md` beside the path rule: **where a document pairs a
symbol with a file, the symbol must be declared in that file.** Both halves are already required
by "Path Verification" — the check makes the pair verifiable rather than the two halves
separately. `grep -n "^\(export \)\?\(async \)\?function <symbol>" <file>` is the whole test, and
it is the only mechanism that distinguishes a moved symbol from a live one.
