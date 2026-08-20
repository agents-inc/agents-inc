---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/reference/component-patterns.md
  - src/cli/components/wizard/summary-panel.test.tsx
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-19
reporting_agent: codex-keeper
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  The rule written into `reference/component-patterns.md` says `frames.join("\n")`, not
  `lastFrame()`, and states why — Ink 7 writes a bare newline as its own final frame on the exit
  the caught throw triggers, so the painted error is the frame before teardown. The correction
  came from re-reading `summary-panel.test.tsx`, which had already discovered it, rather than
  from the finding that proposed the rule.
---

## What Was Wrong

`2026-07-31-display-lookup-fallbacks-hide-invariants-in-ink-render-paths.md` proposed a rule for
`reference/component-patterns.md`. **That file was deleted in the same pass that wrote this one**,
its remaining half having landed — so the quotation below is the surviving record of what it said,
and there is nothing to grep for:

> **An assert inside an Ink component is caught by Ink's error boundary.** `render()` resolves and
> the frame becomes Ink's `ERROR` overview, so `expect(() => render(...)).toThrow()` never passes.
> Assert on `lastFrame()` containing the thrown message and silence `console.error` for the
> boundary's log.

The first two sentences are still true. **The third is not, and following it produces a failing
test.** Catching the throw also exits the app, and Ink 7's exit path writes a bare `"\n"` as its
own final frame unconditionally — so `lastFrame()` is that newline and the painted error is the
frame before it. The live spec asserts over `frames.join("\n")` and carries the reason inline:

```ts
// Every frame, and never `lastFrame()`: catching the throw also exits the app,
// and Ink 7's exit path writes a bare "\n" as its own final frame,
// unconditionally. (Ink 5 only did this when CI was set, ...)
```

So the finding was correct when written, against Ink 5, and the dependency moved underneath it.
Nothing marked the file, because nothing could: `agent-findings/` is dated point-in-time evidence
by design, not maintained and not re-validated. That design is right — the problem is at the other
end, where a later pass reads a finding's Proposed Standard as the text to write.

**The failure would have been quiet in the wrong direction.** Adopting the sentence verbatim puts
a rule in a reference document that produces a red test, and the next author reads the red as a
product regression rather than as bad advice — the same shape as the defect the original finding
was about.

## Fix Applied

The rule in `reference/component-patterns.md` was written from the current spec rather than from
the finding's wording, and it names both halves: assert over `frames`, and why `lastFrame()` is
wrong here specifically.

## Proposed Standard

For `.ai-docs/standards/documentation-bible.md`, in the Agent Findings section, which currently
says findings are not maintained and stops there:

> **A Proposed Standard is evidence of a rule, not the text of one.** Findings are frozen by
> design, so a Proposed Standard ages exactly as fast as the code, the library versions and the
> conventions it was written against — and the older it is, the more likely the pass adopting it
> is the first person to read it since. Re-derive the rule from source before writing it, and
> where the finding named a specific call, matcher or version, verify that one first: it is the
> part most likely to have moved and the part a reader will copy. A finding proposing
> `lastFrame()` for an Ink error-boundary assertion was correct against Ink 5 and would have
> produced a failing test against Ink 7, which is what shipped.
>
> Where the finding's own worked example is still in the tree, prefer it to the finding's prose —
> the spec was updated when the dependency moved and the finding was not.

This does not conflict with any NEVER rule in either `CLAUDE.md`, and it is narrower than
`agent-findings/README.md`'s existing "a Proposed Standard is a proposal, cross-check it against
the NEVER list": that guards a proposal that was always wrong, this guards one that stopped being
right. The claim above is a single verified instance, not a census — no sweep of other findings'
Proposed Standards for staleness has been run.
