---
date: 2026-07-30
proposer: codex-keeper
status: absorbed
resolution_date: 2026-07-30
resolution_note: |
  Approved by the user and adopted 2026-07-30 as rule **6.17a** in
  `.ai-docs/standards/clean-code-standards.md` -> "6. Testing", placed directly
  between 6.17 and 6.18 so it reads with the two rules that already sanction
  `toContain` and frame snapshots as assertion options.

  Adopted as proposed, with two additions drawn from the landed tests: the two
  live layout branches are named as the worked example (grouped, with the scope
  gutter, and flat, without it — one `toMatchInlineSnapshot()` each in
  `src/cli/components/wizard/source-grid.test.tsx`), and the double-width-glyph
  trap is called out (`UI_SYMBOLS.LOCK` 🔒 occupies two columns, so a
  glyph-free row is preferred when the point of the test is position).

  The rule narrows 6.17 rather than carving an exception from it, and so sits
  inside CLAUDE.md's existing prohibition on parsing rendered output in tests —
  a snapshot is not a parser.

  The three open questions in "Risks / Open Questions" below are NOT resolved by
  this adoption and stay open: retroactive application to other candidates
  (`skill-agent-summary.tsx`, `category-grid.tsx`, `info-panel.tsx`), and
  whether the short-viewport path that drops the header below
  `SOURCE_GRID_HEADER_MIN_HEIGHT` counts as a third branch.
affected_files:
  - src/cli/components/wizard/source-grid.tsx
  - src/cli/components/wizard/source-grid.test.tsx
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
category: testing
domain: web
---

# Require a column-geometry snapshot per layout branch (rule 6.17a)

> **ADOPTED 2026-07-30** as rule **6.17a** in `.ai-docs/standards/clean-code-standards.md`
> -> "6. Testing", directly between 6.17 and 6.18. For fixed-width-column
> components, `toContain` and snapshotting are no longer interchangeable — one
> `toMatchInlineSnapshot()` per layout branch is required. Source of the
> underlying observation:
> `.ai-docs/agent-findings/2026-07-30-component-tests-assert-text-presence-never-column-position.md`.

## Problem

A real rendering bug shipped and was invisible to a 56-test suite that covered
the exact component and the exact layout branch it lived in.

`source-grid.tsx` draws fixed-width columns: an 11-character scope gutter
(`SCOPE_COL_WIDTH`), a 24-character skill-name column (`SKILL_NAME_WIDTH`), and
one 18-character column per source option (`SOURCE_COL_WIDTH`). The `Scope`
header was emitted into the **skill-name** box while the scope gutter was
rendered as an empty spacer, so the header sat 11 columns right of the labels it
captioned:

```
           Scope                     Local             Plugin   <- header
Global     🔒 React                  Eject           ✓ Agents Inc
Project     Zustand                ❯ Eject             Agents Inc
```

`Scope` captioned the skill names; nothing captioned the scope column.

**Why the tests could not see it.** `describe("scope-grouped rendering")` covers
this branch specifically. Its assertions are of exactly two shapes:

```ts
expect(output).toContain("Global");
expect(output).toContain("Project");
expect(output.indexOf("React")).toBeLessThan(output.indexOf("Zustand"));
```

Presence, and relative order. In a fixed-width column layout the thing that makes
the render correct is **where each string starts** — and an 11-column header
shift preserves both presence and relative order perfectly. No quantity of
additional `toContain` assertions would have caught it.

The tests were not sloppy; they follow the house rule correctly. The rule does
not distinguish a contract of "this text appears" from a contract of "these
columns line up".

`clean-code-standards.md` **6.17** currently reads:

> Do not split, loop, or regex-scan `lastFrame()` output in component tests.
> Assert directly with `toContain("+ React")` or snapshot the frame. The rendered
> frame is the contract; that's what you assert.

The **"or"** is the gap. It presents the two as equivalent, and `toContain` is
the cheaper habit, so it wins by default — including for components whose
contract is geometric, where it cannot express the contract at all.

## Proposal

Add as **6.17a**, directly after 6.17:

> **6.17a** When a component renders fixed-width columns, at least one test per
> layout branch must pin the whole frame with `toMatchInlineSnapshot()`.
> `toContain` proves a label exists; it cannot prove the label sits above the
> column it names, and column position is the contract in a table-like view. One
> snapshot per branch captures every column start at once and fails loudly on any
> shift. Branch = each structurally distinct arrangement (e.g. `source-grid`'s
> grouped layout, which has a scope gutter, and its flat layout, which does not).

## Rationale

This stays **inside** the existing NEVER rule rather than carving an exception
from it. 6.17 and 6.18 already name `toMatchInlineSnapshot` as a sanctioned
alternative to parsing the frame; 6.17a narrows an existing sanctioned option
into a requirement for one component class. It introduces no new mechanism and
contradicts nothing.

The mechanism is already demonstrated, not hypothetical. Two inline snapshots
have since landed in `source-grid.test.tsx` (one per layout branch, inside
`describe("scope-grouped rendering")`), and the grouped snapshot was verified to
FAIL against the pre-fix markup — `           Scope` vs `Scope`, the exact
11-column shift — while all four pre-existing presence/order assertions in the
same block still passed. The suggestion is to generalise a rule from a case that
has been reproduced under test, not to adopt one on argument.

## Risks / Open Questions

- **Snapshot churn.** A grid snapshot updates whenever any unrelated label
  changes. Partially the point — a diff on a column-aligned snapshot is exactly
  the review signal that was missing — but it does raise the cost of unrelated
  copy edits, and a reviewer who rubber-stamps snapshot updates gets nothing.
- **"Layout branch" needs judgement.** `source-grid` has two obvious ones
  (grouped / flat). Other components may not partition as cleanly. Scoping to
  one-per-branch bounds the churn, but the boundary is not mechanical.
- **Scope of retroactive application is undecided.** Which existing components
  qualify as "renders fixed-width columns"? Candidates worth auditing:
  `skill-agent-summary.tsx` (two-column), `category-grid.tsx`, `info-panel.tsx`.
  Applying 6.17a to all of them at once is a much larger change than adopting the
  rule for new work.
- **Interaction with the short-viewport path.** `source-grid` drops the header
  entirely below `SOURCE_GRID_HEADER_MIN_HEIGHT`. Whether that counts as a third
  branch requiring its own snapshot is unresolved.
