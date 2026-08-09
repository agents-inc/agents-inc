---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/reference/features/built-in-catalogue.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  CLI-418 item 8 (2026-08-07) did both halves. The rule landed as
  `standards/documentation-bible.md` → Staleness → binding rule 6: `last_validated` may only be
  advanced by a pass that re-derived EVERY count the document owns; a pass that moved some and not
  others corrects what it found and leaves the date, so the document reads as honestly stale rather
  than falsely fresh. It cites this finding as its source. The counts were then re-derived by
  evaluating `default-stacks.ts` / `default-rules.ts` and running both pinning test files:
  `conflicts` 28→12, `requires` 50→98, needsAny "34 of 50"→"61 of 98", distinct slugs 129→176,
  distinct categories 31→35, `mergeRelationships` "five lists"→four (post-`compatibleWith`), the
  test-cost figure "roughly 1.9k specs"→2978 (1489 triples × 2), and invariant 3's single
  `SHARED_TOOLING` →two hoisted arrays (`SHARED_TOOLING`, `SHARED_LINT`) at 48 slots each, after
  eslint-prettier moved out of the first. `alternatives` 42 and the 17 / 1552 / 14 / 53 figures
  re-derived unchanged. Two non-count claims the same sweep falsified were corrected rather than
  left under a fresh date — `package.json`'s `files` array no longer lists `"config/"`, and
  `checkMatrixHealth` now runs five checks rather than the one the doc described.
  `last_validated` advanced to 2026-08-07 only after all of that.
---

## What Was Wrong

Found while deleting the `compatibleWith` row from the relationship table in
`built-in-catalogue.md` (CLI-389 phase C). Two of the counts in that table, and one
in the invariants below it, do not match `default-rules.ts` — even though the
document's `last_validated` is `2026-08-06`, which asserts the whole file was
re-derived from source that day.

| Claim in the document                      | Measured from `defaultRules` |
| ------------------------------------------ | ---------------------------- |
| `conflicts` — 28 built-in entries          | 12                           |
| `requires` — 50 built-in entries           | 98                           |
| "34 of the 50 `requires` rules `needsAny`" | 61 of 98                     |
| `alternatives` — 42 built-in entries       | 42 (correct)                 |
| "The rules reference 129 distinct slugs"   | 176                          |

The pattern says what happened: `alternatives` is right and the three figures the
CLI-389 passes moved are wrong, so the file was partially refreshed and its
`last_validated` was stamped as if wholly re-derived. The table is the one place
these counts live (documentation-bible's "A Count Lives in Exactly One Document"),
so nothing else contradicts them and nothing fails.

Left as found rather than spot-fixed: re-deriving a document is a convention-keeper
pass, and a second partial refresh under the same date is the defect being reported,
not the cure.

## Fix Applied

None on the counts — discovery only. The `compatibleWith` row and its three prose
references were removed as part of the phase C deletion, which is what surfaced this.

## Proposed Standard

`.ai-docs/standards/documentation-bible.md`, beside the staleness rules, should say
that **`last_validated` may only be advanced by a pass that re-derived every
count the document owns**, and that a partial edit leaves the date alone. The
staleness signal is worthless if a partial pass can refresh it — a reader has no
way to tell "checked yesterday" from "one table checked yesterday".

Cheaply enforceable for this file specifically: `default-rules.test.ts` already
pins `EXPECTED_CONFLICT_GROUP_COUNT`, `EXPECTED_REQUIRES_COUNT` and
`EXPECTED_ALTERNATIVES_COUNT` as named constants. Nothing ties the document's
table to them, and a test that did would make this class of drift fail rather than
be noticed by the next agent who happens to read both.
