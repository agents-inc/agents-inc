---
type: standard-gap
severity: medium
affected_files:
  - src/cli/components/wizard/source-grid.test.tsx
  - src/cli/components/wizard/source-grid.tsx
  - .ai-docs/standards/clean-code-standards.md
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-07-31
reporting_agent: cli-developer
category: testing
domain: web
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

Rule **6.17a** requires a whole-frame `toMatchInlineSnapshot()` per layout branch for any component
that draws fixed-width columns, precisely so a caption that drifts off the column it names fails
loudly. `source-grid.test.tsx` carries the two required snapshots (grouped and flat).

Both snapshots were regenerated with `vitest -u` when the Sources grid's scope gutter was removed,
and both came back green — encoding a layout the owner had not asked for. The rule got exactly what
it demands (a snapshot per branch, updated with the change) and still caught nothing, because
**`-u` writes whatever the component currently renders.** A regenerated snapshot is a proposal, not
a verification: it agrees with the code by construction. Its only value is at review time, and the
diff a reviewer sees is a wall of aligned spaces that reads as noise unless somebody counts columns.

The suggestion that introduced 6.17a
(`.ai-docs/agent-suggestions/2026-07-30-column-geometry-snapshot-rule-6-17a.md`) named this risk
explicitly — _"a reviewer who rubber-stamps snapshot updates gets nothing"_ — and shipped the rule
without an obligation that would close it. This is that risk occurring, one day later, on the very
component the rule was written for.

Note what did NOT fail: `tsc`, ESLint, Prettier, 57 unit tests and every E2E spec touching the
Sources grid were green against the wrong layout. Geometry has no other gate.

## Fix Applied

Code and tests corrected under the owner's clarification (gutter and row headers restored, caption
stays deleted). For the snapshots specifically, the regeneration was verified rather than accepted:
the intended column starts were derived from the component's own width constants
(`SCOPE_COL_WIDTH` 11 + `SKILL_NAME_WIDTH` 26 + `SOURCE_COL_WIDTH` 18, plus the 2-column chevron
prefix) and then checked against the emitted frame by index —

| Column        | Expected start | Grouped snapshot  | Flat snapshot |
| ------------- | -------------- | ----------------- | ------------- |
| scope gutter  | 0 / absent     | `Global` at 0     | absent        |
| skill name    | 11 / 0         | 13 (2-col marker) | 2             |
| `Local` cell  | 37 / 26        | caption+value 39  | 28            |
| `Plugin` cell | 55 / 44        | caption+value 57  | 46            |

— confirming each caption sits over the cell it names and that the flat branch is the grouped one
shifted left by exactly `SCOPE_COL_WIDTH`. Then confirmed against the real binary through a PTY.

No standards doc was edited; the rule change below needs an owner decision.

## Proposed Standard

Extend **6.17a** in `.ai-docs/standards/clean-code-standards.md` with the verification obligation the
rule currently leaves implicit:

> A column-geometry snapshot regenerated with `-u` is a proposal, not a result. Before committing
> one, derive the intended column starts from the component's width constants and confirm the
> emitted frame puts each caption over the cell it names. State the derivation in the test's JSDoc
> so the next reader can re-check it without re-deriving it. `-u` output accepted on faith gives the
> rule a passing snapshot of whatever the code happens to do, which is what 6.17a exists to prevent.

Cheaper alternative if that reads as too much ceremony for every update: require the derivation only
when the snapshot's **leading whitespace** changes, since that is what a column shift looks like and
it is mechanically detectable in a diff.

Related: `2026-07-30-component-tests-assert-text-presence-never-column-position.md` (the finding that
produced 6.17a) — this one is its follow-through, not a duplicate: that finding established that
geometry needs a snapshot, this one that a snapshot needs reading.
