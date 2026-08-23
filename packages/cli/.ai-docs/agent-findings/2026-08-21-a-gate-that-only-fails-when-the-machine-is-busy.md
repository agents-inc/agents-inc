---
type: standard-gap
severity: low
affected_files:
  - packages/cli/src/cli/lib/__tests__/spec-gates.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-21
reporting_agent: cli-tester
category: testing
domain: infra
root_cause: missing-rule
status: resolved
resolved_by: >-
  The escape-shape gate now runs under ESCAPE_SHAPE_TIMEOUT_MS, derived as
  LINT_ZONES.length * ESCAPE_SHAPES.length * 2 * LINT_PASS_BUDGET_MS rather than written as a
  number, so it tracks the loop. clean-code-standards.md 6.26 states the rule and rejects both
  alternatives — raising the suite default, and stating the timeout as a literal.
---

## What Was Wrong

`spec-gates.test.ts`'s escape-shape gate drives ESLint in-process across
`LINT_ZONES.length * ESCAPE_SHAPES.length * 2` fixtures — 24 type-aware lint passes today, each
resolving its fixture through the TypeScript project service. Measured 2026-08-21 on an idle
machine: **2.7s against the suite's 10s `testTimeout`.** It passes alone and on a quiet re-run, and
it was observed failing during the 2026-08-19 wave with six agents live.

A test that fails only under load is worse than a slow test. Whoever meets the failure reads it as a
regression their change caused, and the thing that makes it go away is re-running — which is the
habit that then hides the next real failure in the same file.

The row that reported this described the loop as "four zones × five shapes"; it is three zones and
four shapes. The measurement stands either way, and the correction is why the fix derives the
timeout from the arrays rather than from a remembered figure.

## Fix Applied

Two named constants in `spec-gates.test.ts`:

- `LINT_PASS_BUDGET_MS` — what one in-process type-aware ESLint pass is allowed to take, with the
  measurement and its date in the docblock. ~20x the observed ~110ms.
- `ESCAPE_SHAPE_TIMEOUT_MS` — `LINT_ZONES.length * ESCAPE_SHAPES.length * 2 * LINT_PASS_BUDGET_MS`,
  handed to that one `it` as its third argument.

The wiring was proved by shrinking the budget to 10ms and watching that test — and only that test —
report `Test timed out in 240ms`, then restoring it.

## Proposed Standard

Landed as `clean-code-standards.md` **6.26**. It states why both obvious alternatives are wrong.
**Raising the suite default** hands the same headroom to every unit test in the package, where a
ten-second unit test is itself the bug. **Writing the timeout as a literal** leaves it claiming to
be sized for a loop that has since grown — a fifth zone is a third more work, and the failure would
land on whoever added the zone under a name that says nothing about them.

Where the dimensions are a disk glob rather than a stated list the multiplication is not available,
and the honest form is a flat constant whose docblock carries the measurement and says why. The
whole-tree scan in `scripts/check-spec-name-vocabulary.test.ts` is written that way and states the
difference on its own line.
