---
type: standard-gap
severity: low
affected_files:
  - .ai-docs/standards/prompt-bible.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
  - .ai-docs/standards/prompt-bible.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: shared
root_cause: convention-undocumented
status: open
---

## What Was Wrong

Removing the completion-gate hook deleted `prompt-bible.md` Technique #1 (Deterministic Completion
Gates) and Technique #11 (Write Verification, framed entirely on that gate). §1 now runs #2 to #10.

Renumbering would have changed what existing citations point at. Records cite techniques by number
in files a guides pass may not edit:

```
grep -rn "Technique #[0-9]" todo packages/cli/.ai-docs/agent-findings/INDEX.md packages/cli/.ai-docs/standards
```

Run it from the repository root. For example,
`todo/archive.md`'s CLI-415 line cites "Technique #6" for Expansion Modifiers. After renumbering,
#6 would be Self-Correction Triggers. The citation would still find a heading, so nothing would
fail.

This has already happened once. `todo/plans/summoner-context-engineering-2026-09-03.md` says
"`prompt-bible.md` already carries Technique #10, Positive Framing". Positive Framing was folded
into #3 and the techniques after it moved up, so #10 now opens Just-in-Time Context Loading.

## Fix Applied

The numbers were left as they are. A citation to a deleted technique (#1, #11) now finds no heading,
which a reader notices. A renumbered citation would find the wrong one, which nobody notices.

## Proposed Standard

`prompt-bible.md` §1 states that a technique's number is permanent: a deleted technique leaves its
number unused and nothing is renumbered. Citations elsewhere should name the technique as well as
the number ("Technique #6, Conditional Expansion Modifiers"), so a mismatch shows when the pair
disagrees. This is a proposal and is not applied. It conflicts with no CLAUDE.md rule.
