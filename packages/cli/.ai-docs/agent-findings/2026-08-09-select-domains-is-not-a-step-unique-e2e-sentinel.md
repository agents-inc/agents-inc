---
type: standard-gap
severity: low
affected_files:
  - e2e/pages/constants.ts
  - e2e/pages/wizards/init-wizard.ts
  - src/cli/components/wizard/stack-selection.tsx
standards_docs:
  - .ai-docs/standards/e2e/page-objects.md
date: 2026-08-09
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: convention-undocumented
status: partial
partial_note: >-
  Documented at the one launcher that waits on the sentinel without a cursor to anchor to
  (`InitWizard.launchOnDomainsInProject`, and the corresponding row in
  reference/testing/e2e-infrastructure.md). No standards rule written, and the collision itself is
  untouched — the scratch row's description is product copy.
---

## What Was Wrong

`STEP_TEXT.DOMAINS` is `"Select domains"`, the dropdown label the DOMAINS step paints. The stack
step paints it too, inside the description of its own scratch row: **"Start from scratch Select
domains and skills manually"**. So a wait for `STEP_TEXT.DOMAINS` settles on a frame of the STACK
step.

Every existing use survives it by accident of anchoring: `StackStep.selectFirstStack`,
`selectScratch` and `DomainStep.acceptDefaults` all wait through `pressEnterAndWaitFor`, which is
cursor-anchored on append-only raw output, so the stack step's own frame sits before the cursor and
cannot match. The collision only bites a wait with no cursor to anchor to — a launcher waiting for
the wizard's FIRST frame, which is exactly what a stackless source needed (CLI-451).

It surfaced as a misleading green: the new launcher returned on the stack step's frame, and the
spec failed one line later on `not.toContain("Choose a stack")` instead of on the wait. That was
the good outcome. A spec that only drove the wizard onward from there would have driven the wrong
step.

## Fix Applied

None to the sentinel — the collision is product copy, and changing the scratch row's description to
suit a test would be the wrong direction. `InitWizard.launchOnDomainsInProject` carries the note in
its JSDoc, and `reference/testing/e2e-infrastructure.md` records it in the method's row: the wait
cannot tell the two steps apart, so the caller's assertions are what catch a build that paints the
stack step when it should not.

## Proposed Standard

`.ai-docs/standards/e2e/page-objects.md` should state: **an unanchored `waitForText` sentinel must
be a string only the awaited screen can paint.** `STEP_TEXT` members are step LABELS, not proofs of
step identity — several are substrings of another step's body copy. Where no unique string exists,
document the collision at the wait and keep the discriminating assertion in the spec.
