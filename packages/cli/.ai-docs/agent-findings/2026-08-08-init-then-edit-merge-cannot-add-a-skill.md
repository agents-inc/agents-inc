---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/init-then-edit-merge.e2e.test.ts
  - e2e/helpers/create-e2e-source.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-08
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  Owner ruling 2026-08-09 ("fix the test", CLI-448). `createE2ESource` gained one non-exclusive
  spare — `web-testing-visual-regression`, assigned to no agent by the stack — so an edit can add a
  skill the default install did not take. The spec is a plain `it` asserting the delta as a set
  difference naming the added id, on config AND on the compiled agent. A fourth defect surfaced
  while making it drivable: Phase 2 used `EditWizard.launch()`, whose HOME is an internal temp dir,
  so the edit ran as a project-context edit and recompiled the global agents somewhere the spec
  never looked. It now uses `launchInGlobal`, matching Phase 1's collapse. The merge itself has no
  defect.
---

## What Was Wrong

`e2e/lifecycle/init-then-edit-merge.e2e.test.ts` exists to prove one thing: that
`init` followed by `edit` **merges** the config rather than overwriting it, with the
skills init wrote surviving alongside a skill the edit adds. It has never tested
that. Three separate defects stacked on top of each other, and each one was hidden
by the one above it.

**1. Phase 1 never completed.** The spec drove the init wizard with
`completeWithDefaults()`, which leaves every skill in plugin mode. The E2E source
carries no `marketplace.json`, so the install hard-errors —
`Cannot install plugin skills: marketplace could not be resolved from source '…'` —
and the wizard never reaches its success banner. Every assertion after Phase 1 was
dead code. The spec was `it.fails`, so this read as "the merge bug is still open".

**2. The install target was the wrong directory.** `InitWizard.launch()` leaves
HOME distinct from `projectDir`, and an eject install lands at the DEFAULT (global)
scope — so with Phase 1 fixed, the config, compiled agents and ejected skills were
written under HOME while every assertion read `projectDir`.
`local-lifecycle.e2e.test.ts` already records this trap in a comment and uses
`launchInGlobal` for exactly this reason; this spec did not.

**3. With both fixed, the edit cannot add a skill at all.** Phase 1's default
install takes **seven of the E2E source's nine skills**. The two it leaves out —
`web-state-pinia` and `web-framework-vue-composition-api` — are the
exclusive-category alternates of two skills it _did_ install (`web-state-zustand`,
`web-framework-react`). So every skill this fixture could add is an exclusive swap,
and the Space press on one is a no-op: `config.ts` comes back unchanged and the run
prints `No changes made`.

Verified across three variants, all producing the same unchanged config:

| Phase 2 keystroke                                        | Result                  |
| -------------------------------------------------------- | ----------------------- |
| `navigateDown()` + `toggleFocusedSkill()` (as written)   | config unchanged, no-op |
| `selectSkill(E2E_SKILL.vitest.display)` (already chosen) | config unchanged, no-op |
| `selectSkill(E2E_SKILL.pinia.display)` (exclusive alt)   | config unchanged, no-op |

**What made all three invisible:** the spec ended on
`expect(editSkillIds.length).toBeGreaterThanOrEqual(initSkillIds.length)`. A
count floor is satisfied by an edit that changed nothing, which is precisely what
was happening. The audit (CLI-444) classified this row CAN-BE-STRICTER on the floor
alone; replacing the floor with the set-difference the merge contract actually
names is what surfaced the rest.

The same shape sat beside it: two generic absences,
`not.toContain("Failed to")` and `not.toContain("ENOENT")`, on an edit that had
never run.

## Fix Applied

**Partial — the spec now fails for its real reason instead of a fake one.** Landed:

- Phase 1 drives `completeWithLocalSources()` against
  `InitWizard.launchInGlobal(...)`, so the install completes and lands where the
  assertions look. Phase 1 and everything through the edit now genuinely execute.
- The floor is replaced by the two set differences the merge contract names: no
  skill init wrote may disappear, and exactly one new skill must appear.
- The two generic absences are replaced by `STEP_TEXT.EDIT_SUCCESS`, positioned
  **after** the merge assertions so the set difference is what carries the red.
- The blind `navigateDown()` is replaced by a named `selectSkill(...)`.
- The `it.fails` carries a JSDoc naming the exact assertion that reddens, the
  cause, and the three variants tried.

**Then the fixture (CLI-448, 2026-08-09).** The owner ruled "fix the test", and the fixture rather
than the keystrokes: `createE2ESource` now writes a tenth skill,
`web-testing-visual-regression`, in the NON-exclusive `web-testing` category and assigned to no
agent by `E2E_STACK`. It carries no relationship rules, so nothing about it steers the wizard. The
default install still takes the same seven — the spare is simply available to add, which is what
"init installs a subset, edit adds one of the rest" needed. Deselecting during init was the other
option and was not taken: it would have made the spec's Phase 1 diverge from the default install
every other lifecycle spec drives.

The spec's added skill is now that spare, its closing assertion is
`toStrictEqual([ADDED_SKILL.id])` rather than a length, and the merge is asserted on the compiled
agent too (`toHaveAgentDynamicSkills`) — the surface a config-only check cannot see.

**A fourth defect surfaced doing it,** and only the compiled-agent assertion could see it: Phase 2
launched with `EditWizard.launch()`, whose HOME is an internal auto-allocated temp dir, while Phase
1 used `InitWizard.launchInGlobal` (HOME === projectDir). So the edit ran as a PROJECT-context edit
over a config whose every entry is global-scoped: it wrote the global halves and recompiled the
global agents under that foreign HOME, and left `projectDir`'s compiled agent byte-identical
(verified by sha). Every config assertion still passed, because global rows are inlined into the
project config. Phase 2 now uses `EditWizard.launchInGlobal`.

The merge itself has no defect: prior skills survive, the named skill arrives, and the compiled
agent gains it.

## Proposed Standard

Two rules, both for `.ai-docs/standards/e2e/anti-patterns.md`.

**1. A spec whose subject is a DELTA must assert the delta as a set difference,
never as a count relation.** `after.length >= before.length`,
`after.length > 0` and `expect(list).toContain(x)` in a loop all pass for a run
that did nothing. The affordable form is two filters — what left and what arrived —
each compared with `toStrictEqual` or an exact length. This generalises the existing
"§ A counter is not its content" rule from scroll affordances, where it is currently
scoped to rendering, to config and filesystem deltas, where the same failure mode
costs more.

**2. A fixture must be able to produce the state its spec asserts, and the spec
should say how.** The E2E source has nine skills of which the default install takes
seven, and the two remaining are exclusive alternates — so "add a skill by edit" is
unreachable from a default install and no amount of keystroke tuning changes that.
`.ai-docs/standards/e2e/test-data.md` should record the default install's roster
and which skills stay available, so the next author picks a reachable subject
instead of discovering this from a silently-passing `it.fails`.

A third, narrower note for `.ai-docs/standards/e2e/patterns.md`: **an eject-mode
init must use `InitWizard.launchInGlobal`**, because eject installs at the default
(global) scope. `local-lifecycle.e2e.test.ts` explains this in a code comment; it
belongs in the standards where the next author will look for it.
