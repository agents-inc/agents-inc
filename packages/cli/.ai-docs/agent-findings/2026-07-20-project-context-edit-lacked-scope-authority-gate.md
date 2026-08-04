---
type: architectural-drift
severity: high
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/stores/wizard-store.ts
  - src/cli/lib/installation/local-installer.ts
standards_docs:
  - CLAUDE.md
date: 2026-07-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: 'The finding''s own "remaining half" is still open, and the fix it describes has since been replaced. Verified 2026-07-30: `applyProjectScopeAuthority()` and `enforceScopeAuthority()` no longer exist in `edit.tsx` under those names — the blanket restore-everything gate was narrowed to "authority follows the work actually performed" (only ids the run actually migrated, filtered by `isActiveAt(s, "global")`), the successor recorded in `2026-07-20-scope-authority-must-follow-work-performed.md`. Read that file before treating this one''s Fix Applied as current. Still pending: the ungated source setters the finding named as the remaining half. `setSourceSelection` (the renamed `setSkillSource`, D-262) validates only that skillId/sourceId are non-empty before calling `withActiveEntrySource`, and `setAllSourcesEject`/`setAllSourcesPlugin` skip excluded tombstones (D-265) but map over every active entry — none of the three carries the `isEditingFromGlobalScope`/`isInitMode` predicate that `toggleTechnology`/`toggleSkillScope` use, so the wizard can still show a source change on an inherited global row. The three proposed CLAUDE.md "Scope Awareness" bullets were not added, though D-277 covers the selection/scope half of the rule more broadly.'
---

## What Was Wrong

The "a project may not change global state" rule was enforced in three places that did not
agree with each other, so a project-context `cc edit` could perform a destructive change it
was never allowed to record.

- The wizard gates SELECTION and SCOPE on globally-installed skills (`toggleTechnology`,
  `toggleSkill`, `toggleSkillScope` in `wizard-store.ts` return
  `TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED`). The SOURCE setters (`setSkillSource`,
  `setAllSourcesEject`, `setAllSourcesPlugin`) have no such gate, so pressing `l`/`p` on the
  Sources step rewrites `source` on inherited global rows too.
- `executeMigration` (`mode-migrator.ts`) honours each skill's OWN scope, so it happily
  ejected a global-scoped skill into `<HOME>/.claude/skills/` and ran
  `claudePluginUninstallBestEffort(ref, "user", ...)`.
- `mergeGlobalConfigs` (`local-installer.ts`) deliberately refuses to modify existing global
  rows from a project context (`filter(s => !existingSkillIds.has(s.id))`, commit 403df46).

Net effect: the disk said `eject`, the global `config.ts` still said the marketplace name, and
the plugin registry was empty. Nothing could reconcile that state afterwards, and the change
summary printed `~ React (Agents Inc → Eject)` for a switch that was never recorded.

Note the bug report's attribution was one layer off: `mergeConfigs`' `skillKey` is
`${id}:${scope}`, i.e. source-insensitive, so a present-but-source-changed global row flows
through its `matching` branch. The project `config.ts` is nonetheless coherent because
`generateProjectConfigWithInlinedGlobal` inlines the global rows from `effectiveGlobalConfig`,
not from the merge result. The divergence was purely config-vs-DISK.

## Fix Applied

`edit.tsx` now enforces the authority rule ONCE, before anything is diffed, applied or
persisted. `applyProjectScopeAuthority()` restores inherited global-active skills
(`isActiveAt(entry, "global")` in the persisted project config) to their persisted values, and
`enforceScopeAuthority()` applies it whenever `!isHomeDirectory(cwd)`, warning the user once
when a change was refused. Because the refusal happens before `detectConfigChanges`, the change
summary, `detectMigrations`/`executeMigration`, `applySourceChanges` and `writeProjectConfig`
all see the same authorized roster — the one-story invariant.

Deliberately NOT fixed here: the ungated source setters in `wizard-store.ts` (out of ownership
for this task). The command-level gate makes the product correct, but the wizard still shows the
user a source change it will silently discard until those setters gain the same
`isEditingFromGlobalScope`/`isInitMode` predicate that `toggleSkill` and `toggleSkillScope`
already use. That is the remaining half of this finding.

## Proposed Standard

Add to CLAUDE.md under "Scope Awareness (project vs global)":

- NEVER let a project-context command apply a change to an inherited global-active entry (an
  entry with `scope: "global"` and no `excluded` flag in the persisted project config). Gate it
  at the command boundary BEFORE change detection, not per side effect — a gate added only to
  the destructive step leaves the change summary and the config write lying.
- ALWAYS pair a write-side refusal with a read-side one. `mergeGlobalConfigs` refusing to update
  an existing global row is only safe if no upstream step already acted on that row. When adding
  a new per-skill mutable field to `SkillConfig`, extend `applyProjectScopeAuthority` in
  `edit.tsx` at the same time.
- ALWAYS gate every wizard action that mutates a `SkillConfig` field with the same
  `isEditingFromGlobalScope`/`isInitMode` predicate used by `toggleSkill`/`toggleSkillScope`.
  Today `setSkillSource`, `setAllSourcesEject` and `setAllSourcesPlugin` are the exceptions.
