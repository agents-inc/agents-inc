---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/stores/wizard-store.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-08-08
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: rule-not-specific-enough
blocked_by: 2026-08-08-a-new-skill-picked-in-a-project-edit-is-written-into-the-global-install.md
status: resolved
resolved_by: >-
  Owner ruling 2026-08-08 (CLI-443) narrowed the guard to GLOBAL-OWNED halves. `isGloballyLockedSkill`
  (`src/cli/stores/wizard-store.ts`) lost its live-`[P][G]`-pair arm and now holds two: an active global
  entry in the hydration snapshot, and a snapshot tombstone paired with a live plain active global (the
  stale shape an in-session collapse leaves). The exclusive radio-swap path keeps the pair arm through a
  separate predicate, `blocksExclusiveSwap` — dropping a pair's project half sideways would unmask its
  global install beside the new pick, seating two active skills in a category that permits one. Measured
  2026-08-08 against the rebuilt binary in a scratch HOME on this finding's own reproduction: SPACE on
  the persisted pair now summarises `- React [P]` and exits 0, the project's `config.ts` collapses to the
  single inherited `{scope: "global"}` entry, `<project>/.claude/skills/web-framework-react` is removed,
  and the global config, the global skills directory and all 11 global agents are byte-identical after.
  Specs: `e2e/lifecycle/project-edit-removes-project-half-of-pair.e2e.test.ts` (new, watched red against
  the pre-fix build); `dual-scope-s-round-trip-space-inert.e2e.test.ts`,
  `dual-scope-in-session-collapse-restore-sequence.e2e.test.ts` and two `wizard-store.test.ts` cases
  rewritten from the whole-pair reading to the narrowed one, each still pinning the refusal on the
  global-owned half in the same file.
---

## What Was Wrong

In an installation created global-first (a global install, then projects configured on top of it),
a project-scope edit cannot remove any skill at all.

Measured 2026-08-08 against the real binary (0.152.1). The subject was `web-testing-vitest` in a
project whose config held the persisted dual-scope pair the `s` toggle produces:

```
{ "id": "web-testing-vitest", "scope": "global", "source": "eject", "excluded": true }
{ "id": "web-testing-vitest", "scope": "project", "source": "eject" }
```

The project owns the second entry — its files sit in `<project>/.claude/skills/web-testing-vitest/`,
put there by that project's own edit. Pressing Space on the row raises the toast
`Global skills cannot be changed from project scope` and the session ends `No changes made.` The
project config, the project agents directory, the global config and a second project were all
byte-identical afterwards.

Refusing to uninstall the INHERITED global half is correct and deliberate. The observation is that
the guard fires on the pair as a unit, so the project-owned half is unreachable too — and because a
newly-selected skill in a project edit is written at global scope (see `blocked_by`), no
project-owned entry without a global backing can exist in this install shape. The result is that
"remove a skill from this project" has no reachable subject anywhere in a global-first installation.

### Reproduction

With a global install in `<scratch>` and a project that has moved one skill to project scope with
`s`:

```
cd <project>; HOME=<scratch> agents-inc edit --source /home/vince/dev/skills
```

Focus the `[P][G]` skill, press Space, observe the toast, Enter through to Confirm, Enter. The
session prints `No changes made.` and nothing on disk changes.

### Code in the path

- `TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED` and the guard at the head of `toggleTechnology`
  (`src/cli/stores/wizard-store.ts`), which computes `isGloballyLockedSkill(installed,
state.skillConfigs, technology)` on a deselect and `hasGlobalActive(installed, technology)` on a
  select, and returns the toast without touching state when either holds and the session is not a
  global-scope edit.
- The same guard repeated in the filter-incompatible removal path in the same file
  (`removesLockedGlobal`).
- `applySkillRemoval` / `isProjectOwned` / `isDualScopePair` in the same file — the ownership notion
  the guard is nominally protecting, and the one the guard does not consult.

### Suspected underlying cause

The guard keys on "does an active global install of this id exist" rather than on "does the project
own the entry being removed", so a `[P][G]` pair is refused as one unit even though its two halves
have different owners.

### Note for the root-cause session

The behaviour is described as intentional in the harness docs
(`e2e/fixtures/dual-scope-helpers.ts`, `runEditWithFirstSkillAction`: "space … Inert on any row
backed by a real global install — both a `[G]`-only inherited row and a `[P][G]` pair emit the
global-locked toast and change nothing"). What is not written down anywhere is the consequence: in
combination with the global-default for new selections, the two rules together make project-scope
removal unreachable, not merely restricted. Whether the pair-level refusal is the intended reading
of the invariant is the question to settle before anything is changed.

## Fix Applied

None — discovery only. Produced by an owner-ordered verification pass mandated to report causes
without patching.

## Proposed Standard

`.ai-docs/standards/e2e/README.md`, under "Critical Rules", beside the existing
prove-the-code-path-fired rule:

> A spec that asserts an operation is REFUSED must also pin, in the same file, the state in which
> the same operation is ALLOWED. A refusal assertion on its own cannot distinguish a guard that is
> correctly scoped from a guard that has swallowed its entire domain — both produce an unchanged
> filesystem and an unchanged config.
