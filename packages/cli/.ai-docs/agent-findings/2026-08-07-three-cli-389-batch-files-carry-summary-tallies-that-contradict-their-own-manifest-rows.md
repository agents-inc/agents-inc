---
type: audit
severity: low
affected_files:
  - todo/plans/CLI-389-batches/B1-web-core.md
  - todo/plans/CLI-389-batches/B3-web-ui.md
  - todo/plans/CLI-389-batches/B4-web-platform.md
  - src/cli/lib/configuration/skill-audit.ts
date: 2026-08-07
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: open
---

## What Was Wrong

Transcribing the twelve CLI-389 batch manifest tables into `skillAudit` meant reading every row
and every batch's own summary line. Three batches disagree with themselves — the prose tally does
not match the table it summarises:

| batch | says                                                                    | its rows actually give                           |
| ----- | ----------------------------------------------------------------------- | ------------------------------------------------ |
| B1    | "(B ×7, C ×1, A ×2)" over 9 classified rows — sums to 10                | A ×2, B ×6, C ×1 = 9                             |
| B3    | "8 universal …, 14 constrained" = 22, but names only 7 universal skills | 7 universal, 15 constrained                      |
| B4    | "12 constrained / 11 universal; 9 class A, 6 class B, 8 class C"        | 13 constrained / 10 universal; A ×11, B ×6, C ×6 |

B3's line is self-refuting on its face: it claims 8 and then parenthesises the full list, which has
seven names in it. B4's class tally is a straight miscount (its A and C figures are both wrong while
B is right). B1's appears in "Contradicts-the-worksheet §2", arguing — correctly — that nine rows
carry real classifications, then tallying them to ten.

The rows themselves are consistent and unambiguous in all three cases, so the manifest was
transcribed from the tables and the summaries were discarded. This finding exists because the
summaries are what a later reader quotes: the batch files are the audit's only record, the report
for this task had to state a verdict distribution, and three of twelve inputs would have produced
wrong numbers if trusted.

The nine other batches' tallies match their rows exactly.

## Fix Applied

None to the batch files — they are `todo/` tracker documents and this task was scoped "no tracker
edits". The manifest was built from the rows, not the summaries.

What did land is the mechanical replacement for the summaries: `skill-audit.test.ts` derives the
verdict, class and batch distributions from `skillAudit` itself and pins the per-batch sizes
(`BATCH_SIZES`, summing to 237) with `toStrictEqual`. Any future disagreement between a stated
count and the data is now a test failure rather than a sentence nobody re-adds up.

## Proposed Standard

For `todo/plans/**` research batches whose product is a table that later becomes code: **do not
restate a count in prose beside the table that produces it.** This is
`documentation-bible.md`'s existing "A Count Lives in Exactly One Document" rule applied within a
single file — the table is the count's home, and a summary line is a second, unmaintained copy.

Where a headline number genuinely helps the reader, it belongs in the _destination_ artifact where
a test can pin it, which is what `BATCH_SIZES` in `src/cli/lib/configuration/__tests__/skill-audit.test.ts`
now does. Add this to the batch-authoring guidance in the CLI-389 plan, and to
`.ai-docs/standards/documentation-bible.md` under the existing counts rule as the intra-file case.
