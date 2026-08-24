---
type: standard-gap
severity: low
affected_files:
  - .ai-docs/reference/testing/e2e-infrastructure.md
  - scripts/check-enumeration-drift.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-24
reporting_agent: claude
category: testing
domain: infra
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`check-enumeration-drift.ts` holds an exhaustive documentation list against the symbol it
enumerates, and it does that job: adding `STEP_TEXT.DOCTOR_STATUS_SKIP` to
`e2e/pages/constants.ts` reddened two documents in the same run, naming the member by name.

The list in `.ai-docs/reference/testing/e2e-infrastructure.md` is introduced by a **stated count** —
`**185 members, exhaustive as listed:**` — and that number is prose the check does not read. It
compares MEMBERSHIP, so a list naming every member satisfies it whatever the sentence above the
list claims. The count was 185 against 187 actual before this session touched the file: two members
had been added at some earlier point, correctly appended to the list, and the number in front of
them had not moved. Both halves of that document were edited by whoever added those members, and
only the half with a checker behind it stayed true.

The census is small and that is the point — one document in `.ai-docs/` states a count of this
shape, so this is a narrow gap rather than a class:

```
grep -rnoE '\*\*[0-9]+ (members|entries|rows|values)[^*]*\*\*' .ai-docs/
```

A count nobody reads mechanically is worse than no count, because a reader treats a specific
number as evidence the list was checked recently. `documentation-bible.md`'s "A Count Lives in
Exactly One Document" governs WHERE a count lives; it says nothing about whether the one place
holding it is enforced, and this is the case that distinguishes the two.

## Fix Applied

The count corrected to 187 while landing CLI-329, which is the immediate half. The gap itself is
untouched: nothing stops it drifting again, and the next author to append a member will find
exactly the same trap.

## Proposed Standard

Two candidate shapes, and the second is the one to prefer.

**Read the count.** `check-enumeration-drift.ts` already parses both sides; a registry row could
carry an optional `countPrefix` and the check could compare the number to the member total it
already computes. This closes the gap where it is, and the checker's own suite is the natural home
for the test. It is a small widening of a file whose docblock is deliberate about what it registers,
so the row should say why the count is registered rather than merely that it is.

**Or delete the count.** The repository's own rule is `prefer deleting a claim to rewriting it`
(ruled 2026-08-19), and a count in front of an exhaustive list adds nothing a reader cannot get by
reading the list — which the checker guarantees is complete. This is the cheaper fix and the one
that cannot rot. It also matches how the sibling document handles the same symbol:
`.ai-docs/standards/e2e/README.md` groups `STEP_TEXT` by subject and states no total at all, and
it has never drifted.

Either way the rule belongs in `documentation-bible.md` beside "A Count Lives in Exactly One
Document", as its second half: **a count that lives in exactly one document is still a claim, and
an unenforced claim beside an enforced list borrows the list's credibility.** Cross-checked against
CLAUDE.md's NEVER/ALWAYS rules — no conflict; the nearest is "A brief carries the command, not its
result", which is the same instinct one document away.
