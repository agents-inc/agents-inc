---
type: anti-pattern
severity: high
affected_files:
  - apps/editor/src/features/configure/lib/held-global.ts
  - apps/editor/src/stores/config-store.ts
  - apps/editor/src/features/configure/lib/use-apply-stack-request.ts
  - apps/editor/src/features/configure/components/skill-cell.tsx
  - apps/editor/src/features/configure/components/skill-options-panel.tsx
standards_docs:
  - docs/architecture.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: web
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  `keepingHeld` runs inside `applyStack` and `applySavedStack`, and the stack door no longer
  releases the hold; `assignmentRefusal` refuses a held sub-agent any new row, and `select` strips
  rows onto held sub-agents; `pressOnHeldSkill` lands a held plugin's press to project ejected on
  Codex. Pinned by held-global.test.ts ("a whole new selection on a project's link", "takes no row
  of a skill picked here", "switches to project and its install in one press") and the editor's
  project-link.spec.ts.
---

## What Was Wrong

A link a bare `edit` minted inside a project holds its global skills and sub-agents: they cannot be
switched off or changed, only switched to project (owner, E2-a, confirmed 2026-10-21). The rule
was guarded per press, in each `config-store` action that changes one entry, and every spec drove
one press at a time. Three doors were outside that set:

- **Whole replacements.** `applyStack` (a stack, and Start from scratch) and `applySavedStack` (a
  local or account save) replaced the selection wholesale, and `useApplyStackRequest` released the
  hold first. One press switched every held item off: on a project link the grid recognised as
  "CLI Tool", the scratch cell left React and Zustand unpressed and free.
- **A new skill's default rows.** The row guard refused only a held skill on a held sub-agent, so
  picking Tailwind put it on the held `web-developer`, and `edit --from` then rewrote the global
  `web-developer.md`.
- **Two refusals that compose into a dead end.** On Codex a held plugin skill could not go to
  project: `project` was refused as plugin+project, and `eject` as a change to a held entry.

## Fix Applied

The held entries are imposed on any whole replacement (`keepingHeld`): they stay as they are, a
replacement's skill that would swap one out is left out, and none of its rows reach a held
sub-agent. A held sub-agent takes no new row, by press or by default. On Codex a held skill's
press to project lands ejected, and the store accepts a patch that moves an entry to project with
the copy's other fields. The scratch cell and the switch confirm count only what goes, and say
what stays. Each was a failing spec first.

## Proposed Standard

`docs/architecture.md`, beside the editor's store: a rule that holds entries in the selection is
specified against every store action that writes `skills` or `agents`, the replacing ones
(`applyStack`, `applySavedStack`, `pruneToCatalog`) included, not against the presses that
prompted it. A spec that walks the `ConfigActions` keys and asserts held entries survive each one
would catch the next action added; nothing does today. `pruneToCatalog` (a marketplace switch on a
project link) still drops a held id the new catalogue does not know.
