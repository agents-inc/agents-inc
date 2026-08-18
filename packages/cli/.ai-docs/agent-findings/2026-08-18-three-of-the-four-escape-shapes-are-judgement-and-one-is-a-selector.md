---
type: standard-gap
severity: high
affected_files:
  - eslint.config.js
  - src/cli/lib/__tests__/spec-gates.test.ts
  - e2e/pages/constants.ts
  - e2e/assertions/four-surfaces.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: resolved
resolved_by: >-
  Three rules landed in `standards/e2e/` (departure assertions and sentinel choice in
  `assertions.md`, gate-style mutation proof in `README.md`), and the one mechanically
  detectable shape landed as `VACUOUS_COMPARISONS` in `eslint.config.js` plus core
  `no-self-compare`, with a permanent mutation proof in `spec-gates.test.ts`. The two
  candidate checks for the sentinel shape were measured and rejected; the numbers are
  below so the conclusion can be re-derived rather than retried.
---

## What Was Wrong

Eleven defects found by hand over two days escaped the suites in four shapes. Each shape is a
test positioned where it cannot see the thing it names, which is a different fault from a test
that is insufficiently strict — strengthening any of the assertions involved would have closed
nothing.

The open question was not what the rules say. It was **which of them a machine can enforce**, and
the answer differs per shape. A rule stated as prose where a check was possible leaves the defect
reachable; a check built where only judgement works is worse than nothing, because it fires on
correct code and teaches the reader to route around it.

## What Was Measured

**Shape (b), "a sentinel must name the substantive claim, not a lead-in".** Two candidate checks
were measured against all 172 members of `STEP_TEXT`, and neither is viable.

| Candidate                                                             | Measurement                                                                                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locate each sentinel's message in `src/cli/`, then judge its position | **22 of 172 appear nowhere in `src/cli/` verbatim.** The product composes them around counts — `UNINSTALL_AGENTS_KEPT_ONE`, `PROPAGATED_RECOMPILE_ONE`, `DOCTOR_SKILLS_VALIDATED`. |
| Flag a sentinel followed by a clause break in the line carrying it    | **Fires on 90 of the 150 that can be located.** Among them `DOCTOR_ROW_SKILLS_RESOLVED`, `DOCTOR_CONFIG_CHECK` and `SCOPE_GLOBAL` — row and group labels, correct as they stand.   |

The second measurement used the source LINE carrying the sentinel as a stand-in for the enclosing
message, and a clause break of `—`, `:`, `;` or a comma before a conjunction. It is generous to
the heuristic: a real implementation has to find the enclosing literal, which is the 22-member
problem again. A check that cannot locate its subject 13% of the time either declines to judge
those members silently — the exact defect one level up — or condemns them wrongly.

**Shape (c), the vacuous-comparison half.** `@typescript-eslint/no-unnecessary-condition` is
enabled in this package and reports nothing against `after.length >= 0`, `0 <= before.length`,
`after.length < 0` or `exitCode === exitCode`. Verified directly: the same file it stays silent on
draws `Unnecessary conditional, value is always truthy` from a plain `if (items)` one line away.

The reason is the rule's design, not a gap in it. `no-unnecessary-condition` asks whether a value's
**type** settles a condition. `after.length` is `number`, `number >= 0` is a `boolean`, and the
type `number` leaves that boolean open — TypeScript has no non-negative numeric type for `.length`
to narrow to, so no amount of type honesty reaches this shape. It is only ever visible
syntactically. `no-self-compare` would have caught `x === x` and is core ESLint outside
`js.configs.recommended`, so it was simply never switched on.

## Fix Applied

**`eslint.config.js`** — `VACUOUS_COMPARISONS`, two `no-restricted-syntax` selectors covering a
length compared against zero in either operand order, plus `no-self-compare: "error"`. Both report
zero problems across the tracked tree, which is precisely why they needed a proof rather than a
commit.

`no-restricted-syntax` options are not merged across config blocks — the last block naming the
rule for a file owns all of them, the same hazard the file already documents for
`no-restricted-imports`. The selectors are therefore spread into all three blocks that name the
rule, including the config-gate block, which every other block excludes and which would otherwise
inherit no `no-restricted-syntax` at all.

**`src/cli/lib/__tests__/spec-gates.test.ts`** — a fourth gate beside the from-scratch one. It
loads the repository's own ESLint config through `ESLint.lintText`, feeds one real file per
separately-ruled zone the vacuous verdict and requires a report, then feeds it the discriminating
verdict and requires silence. The positive half is the subject guard for the negative one: without
it, a zone ESLint declined to lint would satisfy the negative for free. A fixture that fails to
parse is thrown on rather than counted, because "eslint said something" holds for a parse error
exactly as `exitCode !== 0` held for a narrowing probe that never type-checked an assignment.

**Its own first mutation run found a defect in it.** The gate originally named a spec and an E2E
helper as two zones. `TEST_FILES` in the ESLint config matches `**/e2e/**` entire, not just the
`*.test.ts` under it, so both paths were the same zone and the CLI's own sources were unnamed —
the gate was green with the rule absent from the tree it mostly guards. Five mutations now stand
behind it: dropping the selectors from each of the three zones in turn, switching `no-self-compare`
off, and broadening a selector until it also condemns `after.length > 0`. Each produces a distinct
failure naming the zone or rule at fault.

## Proposed Standard

Landed rather than proposed, in the three places a reader meets before writing a spec.

- **`assertions.md` § A Sentinel Must Name the Substantive Claim, Not Its Lead-in**, with the
  `doctor` tip as the worked example and the measurement table above, so the rejected checks are
  not rebuilt.
- **`assertions.md` § Assert the Departure, Not Only the Arrival**, with the four editor defects,
  the three surfaces that hold old state, and a statement of why it stays prose.
- **`README.md` § the mutation rule**, extended past specs to every gate-style assertion, with the
  narrowing probe and the hand-run verdict as its two worked examples, and the standing
  distinction that a verdict is judged on the signal answering its question and never on a coarser
  one a failure also produces.

Two things are worth carrying further and are outside this pass's scope. `no-self-compare` belongs
in `packages/eslint-config/base.js` rather than in one package — the shape is universal and the
rule has no options to negotiate. And `VACUOUS_COMPARISONS` covers `.length` only; the same
selector shape would cover any expression compared against a bound its type cannot cross, but
every candidate beyond `.length` needs the same false-positive measurement before it is added.
