---
type: convention-drift
severity: medium
affected_files:
  - src/cli/lib/configuration/default-categories.ts
  - src/cli/lib/matrix/skill-resolution.ts
  - src/cli/types/generated/matrix.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/reference/features/skills-and-matrix.md
date: 2026-07-30
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: The stale Known Limitation text in skills-and-matrix.md is corrected. The documentation-bible rule change that would prevent the class (a Known-Limitations re-validation trigger plus a doc-touching-changes row for default-categories.ts) is not applied — convention-keeper owns standards/.
---

## What Was Wrong

A shipped fix silently made a documented **Known Limitation** wrong, and nothing in the process
caught it.

Limitation #6 in `.ai-docs/reference/features/skills-and-matrix.md` read:

> Any skill referencing an undefined category gets an `order: 999` placeholder, regardless of
> `custom`. **Built-in marketplace drift is masked instead of failing loudly.**

The second sentence stopped being true in 0.145.0. The "38 missing category definitions" fix added
every remaining member of the generated `Category` union to `defaultCategories`, and
`src/cli/lib/configuration/__tests__/default-categories.test.ts` now pins the two key sets to each
other with `toStrictEqual`. Consequences an agent reading the old text would get wrong:

- `BUILT_IN_MATRIX` (`src/cli/types/generated/matrix.ts`) contains **zero** synthesized categories
  today — no `"order": 999`, no `"description": "Auto-generated category for ..."`.
- `loadAndMergeFromBasePath` (`source-loader.ts`) merges `{ ...defaultCategories, ...sourceCategories }`,
  so a built-in category can no longer fall through to synthesis on the source-load path either.
- Built-in drift now surfaces as a **failing test** at regeneration time, not as a junk
  `order: 999` placeholder rendered in the wizard.

The underlying gap (D-214 item 8 — "scope auto-synthesis to `custom: true` only") is genuinely
still open and `synthesizeCategory` is unchanged, so the limitation had to stay listed. What was
wrong was its stated blast radius. That is the dangerous shape: a limitation that is _half_ right
reads as authoritative and gets trusted.

This is a class, not a one-off. `documentation-bible.md` has a **Known Limitations Rule** telling
authors to _add_ a limitation while a hardening task is open, and a **Re-Validation Triggers**
section keyed on findings and task IDs — but neither says anything about revisiting a limitation
when a fix lands that narrows it without closing it. The **Doc-Touching Changes** table likewise has
rows for commands, components, stores and mock-data, but no row for the matrix-composition inputs
(`default-categories.ts`, `default-rules.ts`, `skill-resolution.ts`) that the limitations list is
written against.

Two other limitation-adjacent claims in the same doc were also verified stale-adjacent this pass and
corrected: `loadAndMergeSkillsMatrix()` is documented as a general-purpose loader but has **no
production callers** and merges no defaults (so it is the one remaining broad auto-synthesis
surface), and `loadSkillRules()` was described as defaulting each relationship list individually
when it actually replaces the whole `relationships` object — and that replacement omits
`compatibleWith`.

## Fix Applied

Corrected in `.ai-docs/reference/features/skills-and-matrix.md` (owned by this pass):

- Limitation #6 retitled "Auto-synth is not scoped to `custom: true`", with the mechanism restated
  precisely and the "built-in drift is masked" claim removed.
- Added a "Note on #6 — what the 38 added category definitions changed" subsection stating that
  D-214 item 8 remains open, that `defaultCategories` now covers all 89 generated categories
  (test-pinned), that `BUILT_IN_MATRIX` currently synthesizes nothing, and enumerating the two
  paths on which auto-synthesis is still reachable.
- Added `defaultCategories` (89) to the Current Counts table with its pinning test named.
- Recorded that `loadAndMergeSkillsMatrix()` has no production callers and merges no defaults.
- Corrected the `loadSkillRules()` relationship-default wording, including the `compatibleWith`
  omission.

No source or test files were touched.

## Proposed Standard

Two additions to `.ai-docs/standards/documentation-bible.md` (convention-keeper's file — not edited
here):

1. **Extend the "Known Limitations Rule"** with a re-validation clause:

   > A Known Limitation must be re-validated — not merely re-dated — whenever a change lands that
   > touches the code it names, **even when the referenced task is still open**. A fix that narrows
   > a limitation's reach without closing it must update the limitation's _current behavior_ column
   > in the same session. State the mechanism (unchanged / changed) separately from the reach
   > (which paths can still hit it), because a fix commonly changes only the second. Where the reach
   > is now guarded by a test, name that test.

2. **Add a row to the "Doc-Touching Changes" table:**

   | Change                                                                                                                                          | Doc(s) to grep + update                                                   |
   | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
   | Matrix composition inputs changed (`default-categories.ts`, `default-rules.ts`, `skill-resolution.ts`, regenerated `types/generated/matrix.ts`) | `features/skills-and-matrix.md` (esp. Known Limitations + Current Counts) |

A cheap mechanical check that would have caught this one: for any limitation whose current-behavior
text asserts an observable artifact (`order: 999` entries in `BUILT_IN_MATRIX`), grep the artifact
during validation. It was zero.
