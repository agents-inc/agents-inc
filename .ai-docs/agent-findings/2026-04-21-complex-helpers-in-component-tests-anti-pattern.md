---
type: anti-pattern
severity: high
affected_files:
  - src/cli/components/wizard/step-confirm.test.tsx
standards_docs:
  - CLAUDE.md
date: 2026-04-21
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-visible
status: resolved
resolved_by: helper deleted from step-confirm.test.tsx; tests rewritten with direct toContain/not.toContain; rule codified in CLAUDE.md Test Assertions section
---

## What Was Wrong

`src/cli/components/wizard/step-confirm.test.tsx` defined a local helper
`getSkillPrefixesByScope(output, skillName)` — a ~20-line extractor with a
line-by-line loop, a `/([+\-~\u2022])\s+[A-Za-z]/` regex, and a
`currentScope` state-machine variable to pluck diff prefixes out of
`lastFrame()` for two scope sections (Project / Global). Five D-230 / D-232
regression tests called this helper and asserted via
`expect(prefixes).toStrictEqual({ project: "+", global: "\u2022" })`.

This is a testing anti-pattern for three reasons:

1. **The helper has non-trivial logic and no tests.** A state-machine that
   toggles `currentScope` based on label matches, a regex that captures one
   of four diff characters, and a `prefixes[scope] ?? null` first-match rule
   — all of that logic would itself need tests to be trusted. An
   uninstrumented parser in a test file silently produces wrong answers
   when the layout changes.

2. **It obscures the contract.** The actual rendered contract is the
   substring `"+ React"` / `"\u2022 React"` / `"- React"` in the frame.
   Going through a parsed-struct indirection hides what the component
   produces and what the bug shape looks like — a reader of the assertion
   has to reverse-engineer the helper before understanding what failed.

3. **It drops the bug-shape negative check.** The `toStrictEqual` on the
   parsed struct only passes if both fields exactly match the expected
   prefixes — it implicitly negates bug prefixes, but only at the scopes
   where the helper happened to look. Nothing in the test explicitly
   asserts `not.toContain("- React")` for the D-230 "spurious minus" bug
   or `not.toContain("+ React")` for the D-232 "spurious plus" bug. This
   is the exact class of implicit-negative assertion that let Scenarios
   A/C ship with the wrong expected behavior (see
   `2026-04-21-d230-d232-diff-baseline-pre-filter-drift.md`).

## Fix Applied

Deleted `getSkillPrefixesByScope` entirely and rewrote each of the 5
D-230 / D-232 tests to assert directly on `lastFrame()` with four
assertions per test:

- One or two positive `toContain("<prefix> <name>")` anchors proving each
  expected prefix is present (e.g. `"+ React"` and `"\u2022 React"`).
- Explicit negative `not.toContain("<bug-prefix> <name>")` for every diff
  prefix that must NOT appear (`-`, `+`, `~` as appropriate).

Since each test renders a single skill or agent, the `<prefix> <name>`
substring is unambiguous within the frame. When two rows share the same
prefix (e.g. D-232 no-op: both scopes `•`), exhaustive negation of all
other prefixes (`not.toContain("+ React")`, `not.toContain("- React")`,
`not.toContain("~ React")`) proves by exclusion that both rows must be
bullets.

Net: -13 lines from the test file. All 44 tests pass.

## Proposed Standard

**Status**: The rule was codified in `CLAUDE.md` in the commit just prior
to this finding (see "NEVER do this / Test Assertions" section):

> NEVER define local parser/extractor helpers inside a test file (loops,
> regex scans, state machines that pick data out of rendered output or
> config text). If the helper has non-trivial logic it would need its OWN
> tests to be trusted.
>
> NEVER split/loop/regex-scan `lastFrame()` output in component tests —
> use `toContain("+ React")` or snapshot the frame.

This finding records the drift that led to the rule so future sub-agents
have the rationale. Two reinforcements worth adding when a sibling
standard is next updated:

1. **`.ai-docs/standards/e2e/assertions.md` § Diff-Shape Assertions** —
   every diff-prefix test must include an explicit
   `not.toContain("<bug-prefix> <name>")` for the concrete bug shape,
   not rely on `toStrictEqual` against a parsed struct to implicitly
   cover absence. The memory rule "never `expect.arrayContaining`
   without a matching negative" generalizes to all diff assertions.

2. **CLAUDE.md § Test Assertions** — an additional bullet: "if two rows
   render the same prefix, prove it by exhaustively negating all other
   prefixes rather than extracting to a struct — `toContain('• React')
   - not.toContain('+ React') + not.toContain('- React') +
     not.toContain('~ React')`is strictly stronger than a parsed`{ project: '•', global: '•' }` assertion because it pins both the
     positive AND negative shape of the entire rendered frame."
