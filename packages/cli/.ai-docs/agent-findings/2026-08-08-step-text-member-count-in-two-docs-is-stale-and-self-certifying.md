---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/reference/testing/e2e-infrastructure.md
  - e2e/pages/constants.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/standards/e2e/README.md
date: 2026-08-08
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: open
---

## What Was Wrong

Two documents state the number of `STEP_TEXT` members in `e2e/pages/constants.ts` and both say
**94**. The constant currently holds **109**, and held **106** before this session added three.
So the number was already twelve short of the truth before any of today's work, and both documents
also carry an _exhaustive membership list_ that is short by the same twelve.

The drift is self-certifying, which is what makes it worth filing rather than just fixing. Both
documents introduce their list with a warning against exactly this failure — the standards file
says "An exhaustive list that is short is worse than a glob, because it reads as authoritative"
and instructs the reader to re-derive both the count and the membership rather than carry either
forward. The instruction is correct and was not followed, because nothing runs it: adding a member
to `STEP_TEXT` is a one-line edit in a test-support file, and no gate connects that edit to the two
prose lists that claim to enumerate it.

A short exhaustive list is worse than a stale count on its own: a reader looking for a sentinel
that is missing from the list concludes it does not exist and adds a duplicate constant. That is
the failure mode the list was written to prevent.

## Fix Applied

None — discovery only. Correcting it properly means re-deriving both exhaustive membership lists
from disk in both documents, which is a documentation pass on files this session was not sent to
edit, and the drift predates this session's three additions (`AGENTS_REWRITTEN`, `UNCHANGED`,
`EJECT_LOCAL_COPY`) by a factor of four.

## Proposed Standard

The count already lives in exactly one owning document per documentation-bible.md's "A Count Lives
in Exactly One Document" — except it does not: `standards/e2e/README.md` and
`reference/testing/e2e-infrastructure.md` both carry it, and the standards file's own text
acknowledges this by telling the reader to grep the other one. Two writable copies of a number is
the condition that rule exists to forbid.

Two options, either of which closes it:

1. **Give the number one owner.** `reference/testing/e2e-infrastructure.md` keeps the count and the
   exhaustive membership; `standards/e2e/README.md` links to it and carries neither. The
   cross-grep instruction then has nothing to grep for and is deleted with it.
2. **Make it checkable.** A line in `scripts/` that reads `STEP_TEXT`'s member names off
   `e2e/pages/constants.ts` and fails when either document's list disagrees, wired into the same
   place `check-findings-frontmatter.ts` runs. An exhaustive list that no one re-derives is only
   safe if something else does.

Option 1 is the smaller change and matches the pointer pattern the documentation map already uses
for `reference/type-system.md`, whose entry reads "owns the union counts".
