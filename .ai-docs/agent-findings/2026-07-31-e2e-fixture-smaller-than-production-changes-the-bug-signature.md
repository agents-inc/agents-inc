---
type: missing-standard
severity: medium
affected_files:
  - e2e/interactive/init-wizard-stack-banner.e2e.test.ts
  - e2e/helpers/create-e2e-source.ts
  - e2e/pages/constants.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/test-data.md
date: 2026-07-31
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: the spec and its inline rationale landed; the anti-patterns.md and test-data.md rules below are not yet written
---

## What Was Wrong

The stack step bled at the CLI's own advertised minimum height: the six-row ASCII logo starved the
stack list's viewport below `SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS`, `useRowScroll` stopped clipping, and
the rows painted over whatever was below them. Against the real marketplace at 100x20 the visible
symptom is:

```
Start from scratch  Select domains and skills manuallyizzle PostHogzzle
```

and at 100x24 it reaches the footer:

```
SPACE  selectSt ENTER  continuele ESC  backuth, Vitest
```

The E2E spec written to guard the fix was designed around that symptom — assert the footer as one
unbroken line, because a bleed leaves every hotkey word present but splices list content between
them. Mutation-verified against the unfixed binary, **that assertion passed**. The one that went red
was an unrelated-looking positive: `expect(screen).toContain(E2E_STACK_NAME)`.

The reason is the fixture. `createE2ESource()` writes **one** stack (`E2E_STACK`); the real
marketplace has a dozen. How far the overpaint reaches scales with the list's length. With one stack
the list is three rows in a one-row viewport, so the overflow is two rows: it destroys the stack row
itself and stops well short of the footer. The bug is fully present, its blast radius is not.

Had the spec been written with only the footer assertion — the one that matches the reported symptom
and reads like the sharpest signature — it would have been **green on the unfixed binary**. It would
have shipped as a regression guard for a bug it could not see.

This is a different failure from the one recorded in
`2026-07-31-negative-render-assertion-needs-a-positive-subject-guard.md`. That one is about
capturing a frame at an offset where the subject is not painted. This one is about a fixture whose
data volume is smaller than production's, which changes **which row** a size-dependent defect
destroys. Both produce a spec that passes for the wrong reason, and neither is caught by reading the
spec.

## Fix Applied

The spec (`e2e/interactive/init-wizard-stack-banner.e2e.test.ts`) keeps both assertions and records
in an inline comment which one is load-bearing against this fixture and why the other is not — so the
next reader does not "simplify" it down to the footer match. Both are genuine: the footer line is the
guard against the production-shaped bleed, the stack-row match is what actually goes red here.

Every assertion in the spec was mutation-verified by reverting the height gate in `src/`, rebuilding
and re-running, not inferred.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`, in the "Weak Assertions" group, immediately after
the positive-subject-guard rule it extends:

> **Mutation-verify a regression spec against the unfixed binary, and do not assume the fixture
> reproduces production's symptom.** A defect whose blast radius scales with data volume shows up
> somewhere else — or not at all — under a fixture smaller than production. `createE2ESource()`
> carries one stack and nine skills; the real marketplace carries a dozen stacks and many more
> skills. A spec written against the symptom seen while driving the real binary can be green against
> the fixture while the bug is fully present. Revert the fix in `src/`, run `npm run build`, run the
> spec, and confirm it is red **and red for the reason the test name claims** before calling it a
> guard. Record in the spec which assertion carries the red under this fixture.

Also worth a line in `.ai-docs/standards/e2e/test-data.md` beside the E2E source description: state
the fixture's cardinality (one stack, nine skills) explicitly, because that number is the thing a
size- or overflow-dependent spec has to reason about, and today it is only discoverable by reading
`create-e2e-source.ts`.
