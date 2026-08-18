---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/commands/index.md
  - .ai-docs/reference/commands/edit.md
  - .ai-docs/reference/concepts/scope-system.md
  - src/cli/utils/messages.ts
  - src/cli/types/config.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-17
reporting_agent: codex-keeper
category: architecture
domain: shared
root_cause: enforcement-gap
status: partial
partial_note: >-
  Docs side landed — every drifted table in the four files this pass owned was re-derived from
  source and corrected. Code/tooling side pending — there is still no runnable check that a doc
  table claiming exhaustiveness matches the module's export list, which is the mechanism that
  let all four instances through.
---

## What Was Wrong

Four separate exhaustiveness claims in `reference/commands/index.md` had drifted from source, and
each drifted the same way: the document asserts a complete list, a later change adds a member, and
nothing connects the two.

| Claim                                                                       | Doc said            | Source has                                  |
| --------------------------------------------------------------------------- | ------------------- | ------------------------------------------- |
| "Five constant objects, enumerated exhaustively"                            | 5 objects           | 6 objects plus one bare string constant     |
| `STATUS_MESSAGES` members                                                   | 12 named            | 13 — `MARKETPLACE_HAS_NEWER_CONTENT` absent |
| "these message builder functions ... No other function is exported from it" | 25 rows             | 32 — seven builders absent                  |
| `edit`'s `static flags`                                                     | "declares one flag" | three (`--ui`, `--from`, `--project-setup`) |

The seven absent builders were `sharedConfigDestinations`, `skippedUnknownSkills`,
`skippedUnknownAgents`, `carriedSkillsWritten`, `sharedConfigNeedsTerminal`, `globallyInstalledKept`
and `authoredHereKept` — every one of them added by the same body of work, none of them reaching the
table that claims to name them all.

Two further defect classes turned up in the same files:

**A field rename that documentation did not follow.** `SkillConfig.source` is now
`SkillConfig.origin` (`src/cli/types/config.ts`). `reference/concepts/scope-system.md` still carried
the old shape as a quoted TypeScript block, which is the worst place for it — a reader copying that
block writes code that does not compile. The same rename affected
`migratePluginSkillScopes(skills: Pick<SkillConfig, "id" | "origin">[])`,
`applyMigratedGlobalSources`, and `edit`'s warning text (`Could not record global origin change`),
all documented under the old name.

**A stated invariant that had become actively misleading.** `reference/commands/edit.md` said
enforcement of "globally installed items are immutable from project scope" _lives in the wizard
store, not this command_. There are two enforcement points and they protect different things:
`authoritativeScope: "owned"` in `mergeConfigs` protects the config ROW, while the removal DIFF
(`ConfigChanges.removedSkills` / `removedAgents`) is what drives `uninstallPluginSkills`,
`deleteLocalSkill` and `removeCompiledAgents` and reaches the disk regardless of what the merger
later does with the row. The doc's version was true only because every caller happened to reach the
writer through the store. `edit --from` does not, which is why `reconcileSharedConfig` exists.

## Fix Applied

Every table above re-derived from source and corrected. `reference/commands/edit.md` rewritten
whole against `src/cli/commands/edit.tsx` (three flags, the `--ui` outbound half, the `--from`
inbound half, the removal confirm, the ownership rule) and its `last_validated` advanced.
`reference/concepts/scope-system.md` and `reference/features/seed-contract.md` corrected in place
with their `last_validated` left alone, because neither was re-derived whole.

Also removed while in these files: five pass-narration sentences (`init` used to compute them and
drop them; `edit` used to run the same install in silence; it previously held the install mode;
their diagnostics used to arrive spliced between the rows; removed the pre-emptive persisted-pair
guard; init mode used to bypass the guards), two task IDs in `commands/index.md`, and one decision
date in `commands/edit.md`.

## Proposed Standard

`documentation-bible.md` already carries "Exhaustive enumeration over glob shorthand" and the
"Heading Diff" sweep procedure. Neither catches this class, because both are about _missing
sections_, not _short lists inside a present section_. Two additions would:

1. **Extend the Heading Diff step to member lists.** The sweep already globs a doc's owned modules
   and diffs exported symbols against headings. The same glob answers the harder question for free:
   for any table introduced by the words "exhaustively", "every", or "no other X is exported",
   diff the row keys against `grep -E '^export (const|function|type) '` on the named module. Add
   this as step 6 of "Heading Diff: Detecting Sections That Were Never Written", renaming the
   section accordingly.

2. **Make an exhaustiveness claim name its source command.** A table that says "enumerated
   exhaustively" should carry the one-line derivation beside it, the way `seed-contract.md`'s Test
   Surface carries its `vitest run` line. An unverifiable claim of completeness is worse than no
   claim, because it stops the next reader looking.

The `SkillConfig.source` -> `origin` rename suggests a third, narrower rule for the
"Doc-Touching Changes" hook table: **a field rename inside a type that any doc quotes as a code
block must grep `.ai-docs/` for the OLD field name**, not just for the type name. The existing
`src/cli/types/**` row points at `type-system.md` / `types/core-types.md` and would not have caught
a copy sitting in a concepts doc.
