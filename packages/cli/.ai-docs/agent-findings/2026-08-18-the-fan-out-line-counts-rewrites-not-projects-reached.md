---
type: anti-pattern
severity: medium
affected_files:
  - e2e/pages/constants.ts
  - src/cli/utils/messages.ts
  - e2e/lifecycle/edit-global-propagates-to-every-registered-project.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/README.md
date: 2026-08-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The spec side has landed — journey 7's from-scratch run asserts the visited count as
  `rewritten + unchanged` and was watched go red when a mutation stopped the fan-out after the
  first project. What is pending is the standards text and the constant's own comment, which are
  what would stop the next author reading the leading number the same wrong way.
---

## What Was Wrong

`BaseCommand.reportPropagatedRecompile` prints one line for the fan-out a global change performs
across every OTHER registered project:

```
Recompiled agents in <rewritten> registered projects, <unchanged> unchanged
```

The leading number reads as "how many projects this reached". It is not. `propagatedRecompileSummary`
(`src/cli/utils/messages.ts`) counts projects whose compiled agents this pass actually **rewrote**;
a project the fan-out visited and left byte-identical is counted in `unchanged`. The number of
projects reached is the **sum**, and neither operand alone answers the question.

That matters because the sentinel a spec reaches for is
`STEP_TEXT.PROPAGATED_RECOMPILE_ONE`, whose value is `"Recompiled agents in 1 registered projects"`
and whose comment reads "Summary after a global-scope change fans out to one registered project".
Both the value and the comment invite the misreading: the line appears when the fan-out reached one
project **and rewrote it**, and is absent in that spelling when it reached one project and changed
nothing.

Writing journey 7's from-scratch run, the first draft asserted
`` `${STEP_TEXT.PROPAGATED_RECOMPILE} 2 registered projects` `` as the proof that a global edit had
reached both registered projects. It went red against a correct binary. The run had reached both —
the real line was `Recompiled agents in 0 registered projects, 2 unchanged`, because the removed
global sub-agent shared no skill with either project's own one, so both projects' compiled agents
came back identical.

The failure mode this sets up is the dangerous direction, not the one that bit me. A spec asserting
only `PROPAGATED_RECOMPILE` as a prefix, or only the leading count, cannot distinguish:

| The run                               | The line                                    |
| ------------------------------------- | ------------------------------------------- |
| reached two projects, rewrote both    | `... in 2 registered projects, 0 unchanged` |
| reached two projects, rewrote neither | `... in 0 registered projects, 2 unchanged` |
| reached ONE project, rewrote it       | `... in 1 registered projects, 0 unchanged` |
| reached no project at all             | nothing printed — the method returns early  |

Rows two and three are the pair a "did the fan-out reach every project" assertion has to separate,
and the leading number orders them backwards.

## Fix Applied

Confined to the new spec, and proved rather than asserted.
`e2e/lifecycle/edit-global-propagates-to-every-registered-project.e2e.test.ts` asserts the whole
pair — `0 registered projects, 2 unchanged` — with a comment recording that the counts partition the
projects VISITED. It was then mutation-checked: adding a `break` to the loop in
`propagateGlobalChangesToProjects` (`src/cli/lib/config-gate/propagate.ts`), so the fan-out stops
after the first project, turns the line into `... 1 unchanged` and takes that assertion red along
with three others, one of which names the bystander specifically.

Nothing in `src/` was changed. The message is correct and its doc comment already states the
distinction precisely — "a project whose agents all came back byte-identical was visited and left
alone, and says so instead of being counted as recompiled". The defect is that the distinction lives
only there, and a spec author reads the constant, not the producer.

## Proposed Standard

Two edits, both small, neither of which I made because they belong to the docs owner:

1. **`e2e/pages/constants.ts`** — extend the comment on `PROPAGATED_RECOMPILE_ONE` to say that the
   leading number counts projects **rewritten**, not reached, and that a spec proving the fan-out
   reached N projects must assert the pair (`N` split across the two operands) rather than the first
   operand. The constant's current comment says "fans out to one registered project", which is the
   reading that has to change.

2. **`.ai-docs/standards/e2e/assertions.md`** — this is an instance of a class the page already
   names under "A Sentinel Must Name the Substantive Claim", but from an angle it does not cover: the
   sentinel here is not a preamble, it is a **counter whose subject is narrower than the question**.
   The existing README rule "a counter is not its content" is about scroll affordances; the same
   sentence covers this. Add the fan-out line as the second worked example, phrased as: where a
   message reports a partition (`rewritten` / `unchanged`, `installed` / `skipped`,
   `updated` / `failed`), a spec asking "how many did this reach" must assert every part of the
   partition — asserting one operand silently accepts the run that moved the population into the
   other.

The general form is worth stating once because the codebase has at least four messages of this
shape, and the reason it is easy to get wrong is that the wrong assertion is green on the day it is
written: the author picks the arm their fixture happens to produce, and the spec only becomes
misleading when a later change moves work into the other arm.
