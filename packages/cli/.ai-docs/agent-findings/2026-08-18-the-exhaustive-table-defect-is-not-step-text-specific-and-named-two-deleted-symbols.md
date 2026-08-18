---
type: convention-drift
severity: medium
affected_files:
  - packages/cli/.ai-docs/standards/e2e/README.md
  - packages/cli/.ai-docs/reference/testing/e2e-infrastructure.md
  - packages/cli/e2e/pages/constants.ts
  - packages/cli/e2e/assertions/four-surfaces.ts
  - packages/cli/e2e/vitest.config.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/standards/e2e/README.md
date: 2026-08-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  Every enumeration named below was re-derived and corrected in this pass. The machine check
  that would stop the next drift is still unwritten, and it is now clear it must cover more
  than STEP_TEXT — three of the four defects found here were in OTHER enumerations in the
  same file.
---

## What Was Wrong

Two predecessors already record `STEP_TEXT`'s count drifting in `standards/e2e/README.md` and
`reference/testing/e2e-infrastructure.md` (`2026-08-08-…-stale-and-self-certifying.md`,
`2026-08-16-…-stale-in-two-docs.md`). This pass found the same drift a third time, and two things
about it are new.

**1. The table named symbols that no longer exist.** It listed `SHARED_CONFIG_KEPT_GLOBAL` and
`SHARED_CONFIG_KEPT_GLOBAL_REMEDY`, both deleted when a project run started REMOVING globally
installed entries rather than keeping them. That is a different failure from a short list. A short
list under-reports: a reader looks for a sentinel, does not find it, and adds a duplicate. A list
naming deleted symbols mis-reports: a reader greps for a name the doc gave them, finds nothing
anywhere in the tree, and reasonably concludes the document describes a different codebase — after
which nothing else in it is trusted either. The predecessors' proposed check ("fail on any
difference in either direction") already covers this, which is worth noting: the direction that had
not yet been observed was the one the proposal had anticipated.

**2. The defect is not `STEP_TEXT`-specific.** Diffing _every_ enumeration in
`standards/e2e/README.md` against source turned up three more, none of which any predecessor
mentions and none of which a `STEP_TEXT`-shaped checker would catch:

| Claim in the doc                                                                                   | Source                                            | Wrong how                                                                                         |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `STEP_TEXT` "**165 members**… the groups below partition all 165 exactly"                          | 171 members                                       | short by 8, and 2 of the 165 were deleted symbols                                                 |
| "nothing else is exported from that file beyond the **eight** objects above and the three markers" | nine objects                                      | the paragraph asserting exhaustiveness miscounted the things it was being exhaustive about        |
| `assertions/` directory tree, and the Assertions row of the horizontal-layers table                | `four-surfaces.ts` exists                         | a whole assertion module absent from both places that list them                                   |
| Vitest Configuration: an `include` row, no `projects` row                                          | `e2e/vitest.config.ts` declares `e2e` and `smoke` | describes a config shape that no longer exists; the reference doc's "Pattern:" line said the same |

The third one matters beyond tidiness: `four-surfaces.ts` is precisely the module a new spec should
reach for, and the two places a reader looks to discover it are the two places that omit it.

So the class is "a documentation enumeration is checkable against source and is not checked", and
the `STEP_TEXT` count is only its most-visited instance. Counting instances by symbol has made the
problem look narrower than it is.

## Fix Applied

All four re-derived from source and corrected in both documents:

- `STEP_TEXT` count and membership re-derived by evaluating `Object.keys(STEP_TEXT).length` and
  `Object.keys(STEP_TEXT)`, never by adjusting a printed number. 165 (as listed) → 171 at the start
  of the pass; **172** as committed, because this session added `STACK_SKILL_ABSENT_FROM_MATRIX` —
  the sentinel for a warning that only became assertable once the runners stopped forwarding
  `VITEST` (see the sibling finding of this date). Both documents' lists now match
  `Object.keys(STEP_TEXT)` exactly, element for element and in source order, which is a stronger
  property than agreeing on a total and is what makes the next diff a one-liner.
- "eight objects" → "nine objects", checked against the module's runtime exports (19 = 9 objects +
  3 markers + 7 loose).
- `four-surfaces.ts` added to the `assertions/` tree and to the horizontal-layers Assertions row.
- The Vitest Configuration `include` row replaced with a `projects` row naming both projects, their
  per-project includes, and the script each is selected by; the reference doc's `Pattern:` line and
  its two "NOT matched by include" annotations rewritten the same way.

`last_validated` was deliberately NOT advanced on either file. This pass re-derived the
enumerations and not the prose, and `documentation-bible.md` § Staleness rule 2 is explicit that a
partial pass leaves the date — an honestly stale document beats a falsely fresh one.

## Proposed Standard

Adopt the predecessor's option 1, and widen it. A checker that reads only `STEP_TEXT` would have
caught one of the four defects above.

`scripts/check-findings-frontmatter.ts` and `src/cli/lib/__tests__/spec-gates.test.ts` are both
existing precedents for asserting a property of the repository rather than of the product. The
generalisation: a small registry of `(source symbol or directory) → (document, section)` pairs, with
one test that re-derives each and fails on any difference in either direction. Seed it with the four
above; every future exhaustive claim adds one row rather than a promise in prose.

Until that exists, add one line to `documentation-bible.md` § "A Count Lives in Exactly One
Document", which today governs counts only:

> The same rule governs **membership**. A list that says "exhaustive", "all N", or "the groups below
> partition all N" is a claim about the source, re-derivable in one command — so re-derive it in the
> same pass as the count, and diff in BOTH directions. A name in the doc that no longer exists in the
> source is worse than a name missing from the doc: the reader greps, finds nothing, and stops
> trusting the file.
