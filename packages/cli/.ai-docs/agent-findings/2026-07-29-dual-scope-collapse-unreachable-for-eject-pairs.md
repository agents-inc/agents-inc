---
type: missing-standard
severity: medium
affected_files:
  - e2e/interactive/edit-wizard-dual-scope-collapse-removal-row.e2e.test.ts
  - e2e/fixtures/project-builder.ts
  - src/cli/stores/wizard-store.ts
  - src/cli/components/wizard/step-confirm.test.tsx
standards_docs:
  - .ai-docs/standards/e2e/test-data.md
  - .ai-docs/reference/concepts/tombstone-pattern.md
date: 2026-07-29
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Two things surfaced while writing the RED coverage for the Sources-tab `s` collapse
(skill installed at both scopes, project copy dropped, project row must still render
as `- <skill>`).

**1. The scenario is unreachable when both halves of the pair are eject-sourced.**

`ProjectBuilder.editable({ skills, globalSkills })` is the obvious fixture for "installed
at both scopes" — it writes a project entry and a global entry into the project config —
but it hardcodes `source: "eject"` for both. `toggleSkillScope` refuses a project→global
press in exactly that shape: `wouldOverwriteGlobalEject` fires when the live entry is
`scope: "project"` + `source: "eject"`, the snapshot holds an ACTIVE global entry with
`source: "eject"`, and the live config carries no tombstone. The press returns a toast and
changes nothing, so a spec built that way fails on a swallowed keystroke rather than on the
render it claims to test — a false RED that would look like the bug under test.

The unit-level fixture for the same scenario (`wizard-store.test.ts`, "renders a collapsed
dual-scope skill as a locked global row plus a project pending-removal row") already dodges
this by using `source: "agents-inc"` on both entries, but nothing says why, so the next
author reaching for `ProjectBuilder.editable` repeats the mistake. The new E2E spec makes the
global half marketplace-sourced and documents the reason in its file-level JSDoc.

**2. Sources and confirm disagree on the P→G RESTORATION case, and the disagreement is
currently pinned green on both sides.**

- Case A — snapshot `[P active][G active]`, live `[G active]`: the owner decision is two
  Sources rows (locked global + `-` project). The new store spec asserts that, and it is RED.
- Case B — snapshot `[P active][G tombstone]`, live `[G active]`: `step-confirm.test.tsx`
  ("P→G restoration should show - at Project and • at Global (not +)") asserts the confirm
  step prints BOTH a `- React` and a `• React`, while `wizard-store.test.ts` ("should not mark
  a collapsed dual-scope skill as added") asserts the Sources tab emits exactly ONE row for the
  same state. Both specs are green today.

So a per-slot rewrite of `collectRemovedInstalledEntries` keyed purely on
`(id, scope)` — the natural fix for case A — turns case B into two rows as well and breaks a
green spec, even though that would make Sources agree with the confirm step. Whether case B's
Sources row count or its confirm-step row count is the intended contract is an owner call, not
something the implementer can infer from the tests.

## Fix Applied

None to production code — test coverage only (this task was RED-spec authoring):

- `src/cli/stores/wizard-store.test.ts` — inverted the case-A spec to assert the two-row shape.
- `src/cli/components/wizard/source-grid.test.tsx` — added a `collapsed dual-scope pair` block
  covering the render contract (name twice: lock at Global, removal marker + `CLI_COLORS.ERROR`
  at Project) and the inert-row interaction contract (SPACE fires nothing, no focus highlight,
  focus falls through both rows to a genuinely editable row).
- `e2e/interactive/edit-wizard-dual-scope-collapse-removal-row.e2e.test.ts` — end-to-end RED
  spec with a marketplace-sourced global half, a scope-badge `P`→`G` proof that the collapse
  actually happened, and abort-leaves-config-and-filesystem-identical assertions.

Case B was left untouched, as instructed.

## Proposed Standard

1. Add to `.ai-docs/standards/e2e/test-data.md` a note under dual-scope fixtures:
   **"`ProjectBuilder.editable({ globalSkills })` produces eject/eject pairs."** A spec that
   presses `s` to collapse `[P][G]` → `[G]` must give at least the global half a
   non-eject source, because `wouldOverwriteGlobalEject` refuses the project→global press when
   both halves are ejected and no tombstone exists. Every `s`-collapse spec needs a
   proof-of-execution assertion on the scope badges (`["P"]` → `["G"]`) so a refused press
   cannot masquerade as the rendering bug under test.
2. Consider giving `EditableOptions` a `source` (or `globalSkillsSource`) field so this fixture
   shape does not have to be hand-rolled with `writeProjectConfig` + `buildProjectConfig` in
   each spec that needs it.
3. Record in `.ai-docs/reference/concepts/tombstone-pattern.md` which of the two collapse
   shapes (`[P active][G active]` vs `[P active][G tombstone]`) is expected to render a
   project-scope removal row on WHICH surface, so Sources and confirm stop being specified
   independently by whichever spec was written last.
