---
type: anti-pattern
severity: medium
affected_files:
  - apps/editor/src/stores/config-store.ts
  - packages/cli/.ai-docs/standards/editor-and-worker.md
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-24
reporting_agent: web-developer
category: architecture
domain: web
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The guard landed in `setSkillOption`, and the survivor table records plugin on an eject-only skill.
  `applyStack` and its sibling `applySavedStack` (same census, same miss) now return before `set`
  when the selection they would leave, after `keepingHeld`, equals the one in effect, and
  `applyStack` reports to analytics only past that return. `alreadyInEffect` compares by value, key
  order aside, so one predicate serves options and whole selections. Held by `config-store.test.ts`
  (`applyStack`, `applySavedStack`, "what the store tells analytics") and
  `saved-stack-applied.spec.ts` ("a stack under a save of it").
---

## What Was Wrong

`setSkillOption` in `config-store.ts` had no in-effect check. Pressing the amber option on a skill
cell or in its ••• panel called `set` with an equal state (a write under `persist`) and sent one
`skill_configured` per field. `setAgentOption` beside it returned early through `alreadyInEffect`.

`setSkillOption` has carried `get()` since 2026-08-04
(`git log -S "setSkillOption: (skillId, patch) =>"`), so it was a hit of the census in
`editor-and-worker.md` → "Under `persist`, `set` IS the write". The table "One hit survives a
deliberate reading" landed 2026-10-14 (`git log -S "One hit survives a deliberate reading"`) and
records only `remember`. That census reading missed this hit.

## Fix Applied

`setSkillOption` returns before `set` and `track` when every field of the press already holds its
value. "In effect" is what the cell draws: `skills[id] ?? remembered[id] ?? freshEntry(id)`
(`skillOptionsInEffect`). `alreadyInEffect` was made generic, so one predicate serves both
actions.

The check compares the press as made, not the patch after `withOfferedInstall` rewrites plugin to
eject. Comparing after the rewrite was tried: "keeps an added skill at eject when plugin is asked
for, and says so" went red with `expected [] to strictly equal [ { name: 'skill_configured', … } ]`.

**What is left, deliberately:** plugin pressed on an eject-only skill still writes an equal state
and reports `install: eject`, because that spec pins the event. The UI cannot make that press:
`skill-options-panel.tsx` disables it (`disabled={ejectOnly && install === "plugin"}`), and
`skill-cell.tsx` draws a plain statement in place of the pair.

## Proposed Standard

In `editor-and-worker.md` → "Under `persist`, `set` IS the write", add a row to the survivor
table: `setSkillOption`, plugin on an eject-only skill. It can return an equal value. The UI
can't reach it, and the store keeps it so the event says the skill stays eject.

Before the table claims to be complete, read `applyStack` with its own stack already applied. It
rebuilds the selection and calls `set` unconditionally. Whether the UI can make that press was not
investigated.

The census is manual (`grep -rn 'set((state)\|get()' apps/editor/src/stores --include='*.ts' | grep -v '\.test\.'`),
so nothing re-reads it when an action is added or a table row is written. No conflict with
CLAUDE.md.
