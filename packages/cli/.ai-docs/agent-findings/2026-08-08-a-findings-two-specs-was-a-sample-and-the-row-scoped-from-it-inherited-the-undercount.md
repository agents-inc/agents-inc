---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/matrix/matrix-resolver.test.ts
  - src/cli/lib/matrix/skill-resolution.integration.test.ts
  - .ai-docs/agent-findings/2026-08-07-selectionvalidation-valid-is-hardcoded-true-and-two-specs-assert-it-beside-errors.md
standards_docs:
  - .ai-docs/agent-findings/README.md
date: 2026-08-08
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

The CLI-433 finding reported that `SelectionValidation.valid` was hardcoded `true` and named the
damage precisely:

> Two specs already assert the untruth in place: `skill-resolution.integration.test.ts` asserts
> `expect(validation.valid).toBe(true)` on the line ABOVE [a `missingRequirement` assertion]. The
> same file does it again beside an assertion that the first error is a `conflict`.

The tracker row was scoped from that sentence — "two integration specs" — and so was the task that
implemented it. Deriving `valid` from `errors.length` turned **seventeen** assertions red, not two:

| File                                   | Vacuous `valid: true` beside expected errors |
| -------------------------------------- | -------------------------------------------- |
| `matrix-resolver.test.ts`              | 13                                           |
| `skill-resolution.integration.test.ts` | 4                                            |

The finding named the two it had opened. `matrix-resolver.test.ts` — `validateSelection`'s own unit
spec, and the first file anyone would grep — carried thirteen more of the identical shape, including
the producer-side ones the finding's own Proposed Standard says are the only place the constant
should be asserted at all.

Nothing went wrong downstream: the extra fifteen surfaced the moment the one-line change ran, and
correcting each to the value its scenario implies was the same mechanical edit. The cost is that
"easy" and "two specs" were both estimates made from a sample, and a task sized on them would have
been wrong about its own blast radius before the first test ran.

## Fix Applied

All seventeen now assert what their scenario implies: `false` where the test goes on to assert a
`conflict`, `missingRequirement` or `categoryExclusive` error, `true` where it asserts an empty
`errors` array. The two that document `validateSelection`'s known limitations — the declaration-order
case in `matrix-resolver.test.ts` and the empty-selection cases — keep `true`, because that is what
those scenarios genuinely produce and it is no longer vacuous now that it can be `false`.

## Proposed Standard

Add to `.ai-docs/agent-findings/README.md`, where the writing conventions live:

> **Say whether a count is a census or a sample.** A finding that names "two specs" reads as the
> whole population, and the tracker row written from it will be scoped as if it were. When the
> reporting agent grepped, write the grep and its hit count; when it only opened what it happened to
> be reading, say so — "at least two, not a full sweep" costs four words and stops the next agent
> sizing a task from a sample.

The narrower rule for this class specifically: **a vacuous assertion is never local.** A field that
is constant by construction is asserted wherever the producer is asserted, so the population is
"every spec that calls the producer" — countable with one grep, and worth running before the count
goes in the finding.
