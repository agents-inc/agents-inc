---
type: standard-gap
severity: medium
affected_files:
  - src/cli/components/wizard/source-grid.tsx
  - src/cli/components/wizard/source-grid.test.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-07-30
reporting_agent: cli-developer
category: testing
domain: web
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The rendering bug itself is fixed (Scope header moved into the SCOPE_COL_WIDTH box in
  source-grid.tsx), and the accompanying coverage has since landed: source-grid.test.tsx now
  carries one `toMatchInlineSnapshot()` per layout branch (grouped and flat) inside
  `describe("scope-grouped rendering")`. The grouped snapshot was verified to FAIL against the
  pre-fix markup (`           Scope` vs `Scope` — the exact 11-column shift) while all four
  pre-existing presence/order assertions in the same block still passed, which is the finding's
  central claim reproduced under test. The standards gap is still NOT closed:
  clean-code-standards 6.17 continues to offer `toContain` and snapshotting as interchangeable
  options, and proposed rule 6.17a below remains unapplied pending an owner's acceptance.
---

## What Was Wrong

The Sources grid draws three families of fixed-width columns: an 11-character scope gutter holding
the `Global` / `Project` group labels, a 24-character skill-name column, and one 18-character
column per source option.

The `Scope` column header was rendered in the **wrong box**. The scope gutter was emitted as an
empty spacer and the word `Scope` was placed in the skill-name box next to it, so the header sat 11
characters to the right of the labels it names:

```
0         1         2         3         4         5
012345678901234567890123456789012345678901234567890123456789
           Scope                     Local             Plugin   <- header
Global     🔒 React                  Eject           ✓ Agents Inc
Project     Zustand                ❯ Eject             Agents Inc
```

`Scope` captioned the skill names; nothing captioned the scope column.

**The interesting part is why 56 passing tests could not see this.** `source-grid.test.tsx` has a
dedicated `describe("scope-grouped rendering")` block covering exactly this layout branch. Its
assertions are:

```ts
expect(output).toContain("Global");
expect(output).toContain("Project");
```

and, in the strongest case in the file, a relative-order check:

```ts
expect(output.indexOf("React")).toBeLessThan(output.indexOf("Zustand"));
```

Every assertion in the suite asks either _"does this string appear?"_ or _"does this string appear
before that one?"_. In a fixed-width column layout the thing that makes the render correct is
**where each string starts** — and a misaligned header preserves both presence and relative order
perfectly. The bug was structurally invisible to the entire suite, and would have stayed invisible
to any number of additional `toContain` tests.

This is not a case of the tests being sloppy. They follow the house rule correctly. The rule just
does not distinguish between a contract that is "this text appears somewhere" and a contract that
is "these columns line up".

## Fix Applied

**Code (done).** `source-grid.tsx` — the `Scope` `<Text>` moved into the `SCOPE_COL_WIDTH` box; the
`SKILL_NAME_WIDTH` box is now an empty width reservation (the skill-name column has no caption,
matching the flat layout, which has no header over it either). Colours, weights, widths, the
`scopeGroups.length > 0` condition, `marginBottom` and the source-column headers are untouched.

Verified by measuring the rendered frame rather than by eye — `Scope`, `Global` and `Project` all
start at column 0; the source headers `Local`/`Plugin` start at columns 37/55, identical to the
`Eject`/`Agents Inc` cells beneath them. The flat layout still emits no scope box at all, and the
short-viewport path still drops the header wholesale.

**Standards (not done).** No rule changed; see below.

## Proposed Standard

`clean-code-standards.md` **6.17** currently reads:

> Do not split, loop, or regex-scan `lastFrame()` output in component tests. Assert directly with
> `toContain("+ React")` or snapshot the frame. The rendered frame is the contract; that's what you
> assert.

The "or" is the gap. It presents `toContain` and snapshotting as equivalent, and `toContain` is the
cheaper habit, so it wins by default — including for components whose contract is geometric, where
it cannot express the contract at all.

Proposed addition, as **6.17a**, directly after 6.17:

> **6.17a** When a component renders fixed-width columns, at least one test per layout branch must
> pin the whole frame with `toMatchInlineSnapshot()`. `toContain` proves a label exists; it cannot
> prove the label sits above the column it names, and column position is the contract in a
> table-like view. One snapshot per branch captures every column start at once and fails loudly on
> any shift. Branch = each structurally distinct arrangement (e.g. `source-grid`'s grouped layout,
> which has a scope gutter, and its flat layout, which does not).

This deliberately stays inside the existing NEVER rule — 6.17 and 6.18 both already name
`toMatchInlineSnapshot` as a sanctioned alternative to parsing the frame, so this narrows an
existing option into a requirement for one component class rather than introducing a new mechanism.

Known cost: snapshots of a grid churn when unrelated labels change. That is acceptable and arguably
the point — a diff on a column-aligned snapshot is exactly the review signal that was missing here.
Scoping it to "one per layout branch" keeps the churn bounded instead of snapshotting every case.
