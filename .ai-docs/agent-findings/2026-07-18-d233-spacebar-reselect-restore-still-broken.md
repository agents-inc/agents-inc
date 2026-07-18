---
type: audit
severity: medium
affected_files:
  - e2e/lifecycle/tombstone-cleanup-PtoG-restoration.e2e.test.ts
  - e2e/lifecycle/dual-scope-spacebar-reselect-restore.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: incorrect-premise
status: resolved
resolved_by: >
  The "still broken" premise was WRONG. There is no product bug. Once a
  dual-scope [P][G] skill is collapsed via spacebar to a plain inherited-global
  [G] entry and saved, the project-scope presence is genuinely, permanently
  deleted — not "paused". The user-confirmed intended behaviour is that a second
  spacebar on that [G]-only row is a NO-OP (matching the D-233 design doc's own
  stated expectation: "Spacebar on a [G]-only (pure global-inherited) skill
  should already be a no-op / toast"), and the sanctioned way to bring the skill
  back to project scope is `s` (the standard G→P scope-toggle key), exactly like
  any other globally-inherited item. Empirically confirmed via real `cc edit`
  runs: (a) spacebar on the collapsed [G] row leaves config.ts byte-identical
  and the badge a single `G`; (b) `s` on that row restores project scope through
  the well-tested `toggleSkillScope` G→P path, re-creating a fresh [P][G] pair
  `[{scope:"project"}, {scope:"global", excluded:true}]` with badges [G][P].
  The `it.fails` guard that encoded the wrong premise was removed and replaced
  with correct-behaviour coverage in
  `dual-scope-spacebar-reselect-restore.e2e.test.ts` (both tests now genuinely
  passing; no `it.fails` remains). No product code was ever needed or changed.
---

## What Was Wrong (with THIS finding)

This finding originally claimed D-233 had a "still broken" second half: that a
second spacebar on a collapsed inherited-global `[G]` row SHOULD restore the
`[P][G]` dual-scope state, and that it was a bug the spacebar was a no-op. **That
premise is incorrect.** The spacebar no-op is the intended, correct behaviour.

The corrected understanding:

1. **Collapse `[P][G]` → `[G]` (correct, covered).** Spacebar on a persisted
   dual-scope skill drops both the active project entry and the global
   tombstone, leaving a single inherited-global entry. This half was always
   right — `tombstone-cleanup-PtoG-restoration.e2e.test.ts` (3 scenarios) and
   `dual-scope-spacebar-reselect-restore.e2e.test.ts` test 1 both pass.

2. **Re-select via SPACEBAR is deliberately inert (correct, not a bug).** Once
   collapsed and saved, the project-scope presence is genuinely deleted. The
   `[G]`-only row is now a plain inherited-global row with no project override to
   deselect, so spacebar is a no-op — exactly as the D-233 design doc states.
   The blanket `isInstalledGlobal` guard in `toggleTechnology` is doing its job
   here, not hiding a missing restore path. There is no "D-233 Fix Layer 2" to
   land, and no dead store branch to un-block.

3. **Restore is done with `s`, not spacebar (correct, already working).** To
   bring the skill back to project scope, the user presses `s` — the standard
   G→P scope-toggle key — on the `[G]` row. This routes through the same
   `toggleSkillScope` G→P mechanism used for any globally-installed skill and
   re-creates a fresh `[P][G]` pair. Empirically verified working.

## Fix Applied

No product code (there was no bug). The incorrect `it.fails` test in
`dual-scope-spacebar-reselect-restore.e2e.test.ts` — which asserted the
spacebar-restore premise — was removed and replaced with a round-trip test that
asserts the REAL behaviour: (a) spacebar on the collapsed `[G]` row is a no-op
(react rows unchanged + config.ts byte-identical + single `G` badge), and (b)
`s` on that row restores project scope as a fresh `[P][G]` pair. The suite now
contains zero `it.fails`; both tests are genuinely passing correct-behaviour
coverage. The sibling suite `tombstone-cleanup-PtoG-restoration.e2e.test.ts`
remains green (3/3).

## Lesson

When commissioning an E2E test around a supposed "bug", confirm the INTENDED
behaviour against the design doc and a real run before encoding an `it.fails`
guard. An `it.fails` that passes-because-broken can silently ossify a wrong
premise: here it asserted a restore path that was never intended, making a
correct no-op look like an outstanding defect. Prefer verifying the sanctioned
interaction (`s` restore) actually works over assuming a symmetric-looking one
(spacebar restore) should.
