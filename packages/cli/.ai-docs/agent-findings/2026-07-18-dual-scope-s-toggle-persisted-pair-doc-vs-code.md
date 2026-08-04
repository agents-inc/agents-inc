---
type: convention-drift
severity: low
affected_files:
  - src/cli/stores/wizard-store.ts
  - .ai-docs/reference/concepts/tombstone-pattern.md
  - e2e/pages/steps/agents-step.ts
  - e2e/lifecycle/dual-scope-agent-badge-and-s-inert.e2e.test.ts
  - e2e/lifecycle/dual-scope-same-source-eject.e2e.test.ts
  - e2e/lifecycle/dual-scope-same-source-plugin.e2e.test.ts
standards_docs:
  - .ai-docs/reference/concepts/tombstone-pattern.md
  - .ai-docs/reference/concepts/scope-system.md
date: 2026-07-18
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: superseded
superseded_by: 2026-07-18-d233-agent-collapse-fix-in-toggleagent-action-not-helper.md
supersedes: 2026-07-18-dual-scope-agent-s-toggle-guarded-noop-not-collapse.md
---

## What Was Wrong

> Note: the guarded no-op is the **intended** behavior, independently confirmed
> by the user (2026-07-18): pressing `s` on a dual-scope skill/agent must do
> nothing; only SPACE toggles dual-scope presence. The code is correct — this
> finding is strictly about doc wording that could be read to imply otherwise.

The `tombstone-pattern.md` "`toggleSkillScope` Undo Path" section reads as if
pressing `s` (scope-toggle) on a persisted dual-scope pair (`[P][G]`) performs a
P→G undo that drops the tombstone:

> "When an excluded tombstone exists for a skill, the scope-toggle guard bypasses
> the ... block ... because the tombstone indicates the toggle is undoing a prior
> G→P rather than creating a new collision."

The actual code in `wizard-store.ts` `toggleSkillScope` does the opposite for a
PERSISTED dual-scope pair reopened for edit (the `installedSkillConfigs` snapshot
carries the global tombstone): it is an intentional **guarded no-op that emits a
toast** — `"Installed at both scopes — use space to change project scope"` — and
leaves the `[P][G]` pair intact. Only WITHIN the same session (where the snapshot
still holds an ACTIVE global entry, not a tombstone) does `s` perform the P→G
collapse. The guard comment in the code explains why: repeated `s` on a persisted
pair would corrupt it (`[P][G] → [G] → [P]`, losing `[G]`), so space
(`toggleTechnology`) is the only sanctioned way to change the project half.

This matters because a reader (or task author) consulting `tombstone-pattern.md` /
`scope-system.md`'s general "P→G drops the tombstone" rule would reasonably expect
`s` on a reopened `[P][G]` skill to collapse it to a single global entry. It does
not. The existing `tombstone-cleanup-PtoG-restoration.e2e.test.ts` already relies
on this (it uses space, not `s`, and notes `s` "is intentionally inert on a
persisted dual-scope pair").

Verified empirically via real `cc edit` runs in the two new E2E tests
(`e2e/lifecycle/dual-scope-same-source-{eject,plugin}.e2e.test.ts`, check 4):
after reopening the wizard on a persisted `[P][G]` hono, pressing `s` leaves the
badges as `[P][G]` (no collapse).

## Fix Applied

None — discovery only (verification-only task; no source/docs edited). The two new
E2E tests assert the actual guarded-no-op behavior (badges remain `[P][G]` after
`s`) rather than the collapse the general P→G rule implies.

## Proposed Standard

In `.ai-docs/reference/concepts/tombstone-pattern.md`, tighten the "`toggleSkillScope`
Undo Path" section to distinguish the two cases explicitly:

1. **Within-session** G↔P round-trip (snapshot holds an ACTIVE global entry):
   `s` performs the P→G collapse and drops the tombstone (D-224 unconditional
   cleanup).
2. **Persisted** dual-scope pair reopened for edit (snapshot holds the global
   tombstone): `s` is a guarded no-op with the "use space to change project
   scope" toast; `space` (`toggleTechnology` → `applySkillRemoval`) is the only
   way to collapse `[P][G] → [G]`.

Cross-link the guard predicate (`hasGlobalTombstone(installedSkillConfigs) &&
hasProjectActive(skillConfigs) && hasGlobalTombstone(skillConfigs)`) so the
"bypass" language in the Undo Path section is not read as "s performs the undo."
