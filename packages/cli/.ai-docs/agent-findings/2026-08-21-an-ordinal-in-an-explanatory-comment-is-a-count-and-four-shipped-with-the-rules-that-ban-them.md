---
type: convention-drift
severity: low
affected_files:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/reference/utilities.md
  - .ai-docs/standards/clean-code-standards.md
  - src/cli/lib/__tests__/spec-gates.test.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-tester
category: architecture
domain: infra
root_cause: rule-not-specific-enough
status: partial
blocked_by: 2026-08-19-the-owned-count-rule-names-totals-so-four-per-directory-copies-sat-outside-it.md
partial_note: >-
  The four sites named below are corrected — each by deleting the number rather than re-deriving
  it, so there is nothing left to go stale. Pending is the class. Nothing binds a quantity written
  into prose or a code comment to the population it describes, and the upstream finding this one is
  blocked by already carries the half that would notice a tree-diagram annotation.
---

## What Was Wrong

Three passes landed on 2026-08-21 whose whole subject was a claim nothing executes — a checker
gate, a per-test timeout, a specimen of a rename that could never go red. Each wrote its reasoning
into prose or a docblock, and each reached for an ordinal or a total to make the reasoning
concrete. **Four of those numbers are wrong today, and three of them were wrong on the day they
were written.** They sit in the same documents that ban the practice.

Census, all four sites, measured 2026-08-21 against the working tree:

| Site                                        | What it claimed                                                    | What the tree holds                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `standards/e2e/README.md`, tree diagram     | `expectCancelledExit` is not called "from the 35 sites that abort" | `grep -rno '\.abortAndDestroy(' e2e --include='*.ts' \| wc -l` answers 36                    |
| `reference/utilities.md`, drift-survey note | `UI_SYMBOLS` has "three identifier-valued members"                 | four — `SELECTED`, `SKIPPED`, `DISABLED`, `CHECK`, which its own `UI_SYMBOLS` section states |
| `standards/clean-code-standards.md` § 6.26  | "a fifth zone is a third more work"                                | `LINT_ZONES` holds three                                                                     |
| `src/cli/lib/__tests__/spec-gates.test.ts`  | "A fifth zone or a sixth shape is a third more lint passes"        | three zones and four shapes                                                                  |

The `utilities.md` one is the sharpest, because the document contradicts itself: the survey note
says three, and its `UI_SYMBOLS` section says "Two key pairs share one glyph" and names
both pairs. Nothing brings the two sentences into the same reader's view, so neither is doubted.

**The rule these violate already exists and does not look like it covers them.**
`documentation-bible.md` § "A Count Lives in Exactly One Document" opens with exactly the README
case — "Annotations in an index, a tree diagram or a 'covers' column describe **scope**, never
**quantity**" — and its GOOD/BAD example is a tree-diagram comment carrying a total. But the rest of
the section argues from DUPLICATION: a count belongs in one place because a second copy drifts, and
it hands ownership of eight named counts to eight named documents. Read for its argument rather than
its opening line, it says nothing to an author writing a number that no document owns and no other
document repeats — which is what all four of these are.

The second half is the form. A count in a table looks like a fact and invites checking. **An ordinal
inside an explanatory sentence — "a fifth zone", "the 35 sites" — reads as rhetoric**, and it is the
form a narrative docblock naturally reaches for: the sentence is about why the constant is derived,
and the ordinal is there to make the growth vivid. It is still a claim about the tree, it is still
falsifiable, and it was already false.

## Fix Applied

All four corrected by **deleting the number**, not by re-deriving it — a re-derived number is a new
claim with the same lifespan, and the ruling of 2026-08-19 (prefer deleting a claim to rewriting it)
applies with full force where the number does no work.

- `standards/e2e/README.md`: the annotation now reads "so no spec that aborts names it", which is
  the mechanism the entry existed to state.
- `reference/utilities.md`: "the members bound to the module-private `CHECK_GLYPH` / `EN_DASH_GLYPH`",
  which names the reason the pair reader refuses them and cannot go stale by one.
- `clean-code-standards.md` § 6.26 and the `ESCAPE_SHAPE_TIMEOUT_MS` docblock: "another zone or
  another shape is more work every time" — the point was never the fraction.

Not corrected, and reported rather than edited: the same "fifth zone" ordinal stands in
`agent-findings/2026-08-21-a-gate-that-only-fails-when-the-machine-is-busy.md`, in its `INDEX.md`
row, and a "35 sites" in
`agent-findings/2026-08-20-a-funnel-assertion-covers-the-helpers-callers-not-the-behaviour.md`.
A finding is a dated record of what a pass found, and its index row has to mirror it; rewriting
either would falsify the record. They are named here so the next reader of those files meets the
correction.

## Proposed Standard

**Do not widen a checker for this.** The four populations here are a call-site count, an array
length, a members-with-identifier-values count and a fraction of two array lengths. Binding any of
them would mean registering a per-claim grep — which is what `check-enumeration-drift.ts`'s registry
already is for the enumerable case, and none of these four is an enumeration. A "count claim" reader
would need one registry row per sentence, cost more than the sentences are worth, and would still be
silent on the fifth.

What is cheap is one clause in `documentation-bible.md` § "A Count Lives in Exactly One Document",
stated as a property of the VALUE rather than of the table it sits in:

> A quantity in a sentence is a count, whether or not it is written as a numeral. "A fifth zone",
> "the 35 sites", "three identifier-valued members" are the same claim as a cell in the owned-count
> table, with nothing owning them and no pass re-deriving them. If the number is load-bearing, give
> it an owner; if it is there to make a sentence vivid, write the sentence without it.

This does not conflict with any NEVER/ALWAYS rule in CLAUDE.md, and it restates in the
documentation bible what CLAUDE.md's briefing rules already require of a brief ("a brief carries the
command, not its result"). The gap is that the briefing rule binds prompts and this one binds
documents, and three passes on one day wrote into documents what none of them would have written
into a brief.
