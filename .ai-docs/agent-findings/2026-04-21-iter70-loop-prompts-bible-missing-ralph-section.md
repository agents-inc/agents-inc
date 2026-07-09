---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/standards/loop-prompts-bible.md
standards_docs:
  - .ai-docs/standards/loop-prompts-bible.md
date: 2026-04-21
reporting_agent: ralph-loop
category: architecture
domain: shared
root_cause: convention-undocumented
status: resolved
resolved_by: loop-prompts-bible.md Section 8 "Ralph-Loop Iteration Pattern" added with 8.1-8.7 subsections plus three generic anti-patterns and Quick Reference addenda
---

## What Was Wrong

`loop-prompts-bible.md` covered classic orchestrator/sub-agent coordination (delegation, uncertainty, task management, context, QC, boundaries, comms, generic anti-patterns) but had zero content on the ralph-loop mechanism that is currently running the 100-iter docs sweep. Missing entirely:

1. **CRITICAL RULE on the completion promise** -- `/ralph-loop:ralph-loop` explicitly forbids emitting the sentinel unless unequivocally true. Not referenced anywhere.
2. **Single-focus-per-iter discipline** -- no guidance to prevent fanning out across unrelated areas.
3. **Cross-referencing prior findings** -- iters were (per the prompt this finding is attached to) rediscovering covered territory because the bible did not prescribe grepping `.ai-docs/agent-findings/` first.
4. **Findings filing as a loop product** -- findings are the durable output; reports are ephemeral. Bible implied opposite.
5. **Report length caps** -- no 250-300-word target, leading to report bloat that buries signal.
6. **Self-correction triggers** -- no guidance for detecting saturation, trivial iters, scope creep, or blockers.
7. **Multi-iteration consolidation** -- no "every ~10 iters run a synthesis pass" rule, causing findings-directory noise.
8. **Seeding the next iter** -- no requirement to end reports with a concrete next-iter suggestion.

Iter 68 filed an equivalent finding for `prompt-bible.md` (delegation section); iter 70 is the sibling finding for `loop-prompts-bible.md` (ralph-loop section).

## Fix Applied

Added Section 8 "Ralph-Loop Iteration Pattern" with subsections:

- 8.1 CRITICAL RULE -- Completion Promise (quoted verbatim from plugin command)
- 8.2 Single Focus Per Iter (with prior-findings grep discipline)
- 8.3 Findings as a Loop Product (+ filename convention `YYYY-MM-DD-iterNN-<slug>.md`)
- 8.4 Report Length Caps (table: per-iter 250-300w, finding ~500w, synthesis 400w) + structure
- 8.5 Self-Correction Triggers (repeat, trivial, scope-creep, blocker signals)
- 8.6 Multi-Iteration Consolidation (every ~10 iters = synthesis pass)
- 8.7 Seeding the Next Iter

Added three new generic anti-patterns (6/7/8: False Completion Promise, Duplicate Iteration, Report Bloat). Added a "Ralph-loop addenda" block to the Quick Reference Checklist.

## Proposed Standard

Keep Section 8 as the canonical ralph-loop reference. Pair with `prompt-bible.md` §8 (delegation mechanics) -- loop-prompts-bible §8 covers **when and how often**, prompt-bible §8 covers **how to phrase the delegation**. When adding new loop-style slash commands (synthesis loops, review loops), extend Section 8 rather than forking a new doc.

Future iters should: (a) cite §8.2 before starting (prior-findings grep), (b) follow §8.4 report template, (c) trigger §8.6 synthesis on iters 10/20/30/...
