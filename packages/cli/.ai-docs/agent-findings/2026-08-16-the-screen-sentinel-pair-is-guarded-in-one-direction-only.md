---
type: standard-gap
severity: medium
affected_files:
  - e2e/pages/constants.ts
  - src/cli/components/wizard/wizard-layout.tsx
  - src/cli/components/wizard/wizard-layout.test.tsx
  - e2e/pages/steps/sources-step.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-16
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: open
---

## What Was Wrong

`STEP_TEXT.SOURCES` in `e2e/pages/constants.ts` duplicates `STEP_DROPDOWN_LABEL.sources` from
`wizard-layout.tsx`, and `SourcesStep.waitForReady()` waits on it with the `TIMEOUTS.WIZARD_LOAD`
budget of 45 seconds. Three separate comments — on the constant, on the component's label table, and
heading the describe block in `wizard-layout.test.tsx` — state that the unit spec is "the fast half
of that pair" which "goes red in under a second" when the subtitle moves.

It is the fast half of ONE direction. `wizard-layout.test.tsx` compares the PRODUCT against a
literal it carries itself. Nothing in the unit suite reads `e2e/pages/constants.ts` at all — it is
outside the unit `include` and behind its own tsconfig. So the pair has two literals and no
comparison between them:

| What moves                  | What happens                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| the product subtitle, alone | `wizard-layout.test.tsx` red in under a second, naming the string. Guarded, as documented.    |
| the e2e constant, alone     | whole unit suite green; roughly a dozen wizard e2e specs each burn 45s, then fail. Unguarded. |

The second row is the one that occurred. `STEP_TEXT.SOURCES` sat at `"Customize skill origins"`
against a product rendering `"Customize skill sources"`, and the wizard e2e suite was slow-red — the
exact failure the comments were written to prevent, arriving from the side they do not cover. The
prose describes a protection that exists in one direction and reads as though it exists in both,
which is worse than no comment: it tells the next reader the pair is covered.

`WIZARD_TAB_LABELS` against `WIZARD_STEP_LABELS` in `wizard-tabs.tsx` is the same shape. It is a
nuisance rather than a hazard only because a tab label is asserted with `toContain` rather than
waited on, so its drift fails fast on its own.

The literal duplication itself is right and must stay. An assertion that imports the constant under
test moves both sides at once and asserts nothing, which is exactly why both mirrors were written as
literals. The gap is that nothing compares the two literals to each other.

## Fix Applied

None for the gap — discovery only. The immediate drift was repaired (both mirrors restored to the
rendered strings, verified by running `sources-focused-row-marker-spacing.e2e.test.ts`, which settles
in 3s against a 45s wait), but the missing mechanism is untouched: the pair is still two literals
with no comparison, and the next mirror-side edit fails the same slow way.

Closing it is a decision about which mechanism, and that belongs to the owner rather than to a
test-fixing pass.

## Proposed Standard

**A sentinel whose wait budget is tens of seconds needs a mechanism, not a comment.** The rule
belongs in `.ai-docs/standards/e2e/assertions.md`, beside the rule that a negated word assertion
must not be run against text the harness contributed to:

> A constant in `e2e/pages/constants.ts` that a page object WAITS on, rather than asserts, is half
> of a pair whose other half is product source. Drift in it does not fail — it times out, once per
> spec that reaches the screen. Such a constant needs a check that compares it to the product string
> directly. A unit spec asserting the product against its own copy does not do this: it guards the
> product half and cannot see the mirror.

Two mechanisms, in order of preference:

1. **A `scripts/check-*.ts` in the existing family.** `check-shared-vitest-config.ts` and its two
   siblings exist for precisely this job — "two files must agree, and no per-suite gate can see the
   disagreement" — each with its own `.test.ts`, all three run from one command. A fourth that reads
   the sentinel constants and the product label tables and compares them fits the family exactly and
   crosses no tsconfig boundary, because it reads both as source.
2. **Move the mirror onto the fast side.** Have the wait-on constants live in `src/` beside the
   strings they duplicate and let e2e import them. This kills the duplication rather than checking
   it, but it also kills the property the duplication was for, so it is second.

Whichever lands, the three comments asserting a fast half must be corrected in the same change —
they currently claim the coverage this finding says is absent.

**Secondary, from the same incident.** Six specs asserted a vocabulary WITHDRAWAL as
`expect(output).not.toMatch(/\bsources?\b/i)`. When the ruling behind such a negative is itself
withdrawn, the spec is not merely failing — it asserts the opposite of the rule, and no change to
the product can satisfy it. Nothing in the standards says what to do, and "make it pass" reads as
weakening an assertion. The rule that resolved it here, worth writing down: **delete the negative
where the positive it inverts to is already asserted elsewhere; invert it where the positive is
otherwise uncovered.** Two of the six were resolved that way — deleted in `wizard-layout.test.tsx`,
where the tab-bar and subtitle literals already cover the positive, and inverted in
`wizard-tabs.test.tsx`, where every other tab assertion reads its label back through
`formatStepLabel` and so cannot fail on a rename.
