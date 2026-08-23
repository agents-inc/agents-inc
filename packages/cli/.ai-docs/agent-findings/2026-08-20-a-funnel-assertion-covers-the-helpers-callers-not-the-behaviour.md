---
type: missing-standard
severity: medium
affected_files:
  - e2e/pages/wizards/edit-wizard.ts
  - e2e/pages/wizards/init-wizard.ts
  - e2e/assertions/phase-assertions.ts
  - e2e/interactive/init-wizard-navigation.e2e.test.ts
  - e2e/interactive/edit-wizard-navigation.e2e.test.ts
  - e2e/interactive/edit-wizard-plugin-operations.e2e.test.ts
  - e2e/interactive/uninstall.e2e.test.ts
  - e2e/pages/steps/stack-step.ts
  - e2e/fixtures/dual-scope-helpers.ts
standards_docs:
  - .ai-docs/standards/e2e/assertions.md
  - .ai-docs/standards/e2e/README.md
date: 2026-08-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  The funnel assertion landed in BOTH wizard teardowns and the one bypassing abort path is
  pinned at its call site. Still open, and deliberately left alone because they sit outside
  this task's file set — three uninstall-prompt cancellations in
  e2e/interactive/uninstall.e2e.test.ts still pin only not.toBe(SUCCESS) on a surface the
  funnel does not reach, and the Ctrl+C test in init-wizard-navigation.e2e.test.ts is named
  "should exit the wizard without creating files" while asserting no filesystem state at all.
---

## What Was Wrong

The task was to stop aborted wizard sessions throwing away their exit code. A census counted
`abortAndDestroy(` across `e2e/` and found 37 occurrences: only 5 captured the returned exit code,
only 2 of those pinned `EXIT_CODES.CANCELLED`, and the remaining 32 discarded it. The prescribed fix
was to move the assertion inside `abortAndDestroy` in `e2e/pages/wizards/edit-wizard.ts`, described
as "the single funnel every abort goes through" — one edit covering every site.

**The funnel was neither single nor total, and the census could not have revealed either**, because
it counted occurrences of the helper's NAME rather than instances of the behaviour the rule is
about (a wizard session that was aborted).

Two independent defects in the premise, both census figures below:

1. **The funnel is duplicated.** There are two `abortAndDestroy` definitions, not one —
   `EditWizard` and `InitWizard` each carry their own, byte-identical in body and differing only in
   a docstring line. The two classes share no base class. Editing only `edit-wizard.ts`, as
   instructed, would have left every `InitWizard` abort exactly as unchecked as before, while the
   count of edited call sites (35) and the reported coverage would both have read as complete. The
   two definitions are why the 37 occurrences are 35 call sites.

2. **The funnel is not total.** `init-wizard-navigation.e2e.test.ts` aborts a wizard by pressing
   Escape on the stack step — `await wizard.stack.cancel()` followed by a bare
   `await wizard.waitForExit()` — which never enters `abortAndDestroy` and so is invisible to any
   assertion placed inside it. It is an aborted wizard session by every meaning the ruling used, and
   it was pinned at only `not.toBe(EXIT_CODES.SUCCESS)`. `StackStep.cancel()` has exactly one call
   site (census, `grep -rn '\.cancel()' e2e --include='*.ts'`), so the bypass is narrow — but its
   narrowness is what made it invisible, not what made it harmless.

The general shape: **a call-site census of a helper measures that helper's reach, and a rule about
behaviour needs a census of the behaviour.** The two agree only when the helper is the sole route to
the behaviour, and that is a property nobody checked because the census looked authoritative.

A third, smaller point, which is the reason the assertion's placement inside the funnel is not free:
`abortAndDestroy` is called from a `finally` (`getScopeBadgesForSkill` in
`e2e/fixtures/dual-scope-helpers.ts`) and from an `afterAll`
(`e2e/interactive/init-wizard-unreachable-source.e2e.test.ts`). A throw raised in teardown from
either position discards the exception the `try` was already failing on. Placing an assertion in a
shared teardown helper silently converts every such site into one where the more interesting failure
can be replaced by the less interesting one.

## Fix Applied

`expectCancelledExit(exitCode, wizard)` added to `e2e/assertions/phase-assertions.ts` — the
documented home for composite assertion helpers, beside `expectPhaseSuccess`, which already asserts
an exit code and already imports both `expect` and `EXIT_CODES`. Verified no import cycle: nothing
under `e2e/matchers/` or `e2e/assertions/` imports the wizards.

Called from BOTH `EditWizard.abortAndDestroy` and `InitWizard.abortAndDestroy`, covering all 35 call
sites. Two placement decisions, both load-bearing:

- **After `destroy()`, not before.** A throw between `waitForExit` and `destroy` would leak the PTY
  session and the wizard's own temp dirs on the failure path, which is the path where a leak is
  least likely to be noticed and most likely to hang a later spec.
- **The message names the wizard and says it came from teardown**, so a reader meeting it inside a
  `finally` is told to look for the failure it may have replaced rather than treating it as the
  test's own subject.

The one bypassing path (Escape-to-cancel) is pinned at its call site with a comment saying why it
cannot rely on the funnel.

The three sites that pinned `not.toBe(EXIT_CODES.SUCCESS)` were **removed rather than tightened**.
Tightening each to `toBe(EXIT_CODES.CANCELLED)` would have produced an assertion that can never go
red: the funnel throws first, so the call-site copy is unreachable on the failure path — precisely
the "reads as coverage, provides none" shape the E2E standards spend several rules on. Where removal
left a test with no visible assertion of its own, a comment names where the verdict now lives.

## Proposed Standard

For `.ai-docs/standards/e2e/assertions.md`, as a new section. Two rules, and the second is the one
with no current home:

**A census that motivates centralising an invariant counts the BEHAVIOUR, not the helper's name.**
Before moving an assertion into a shared helper to cover N call sites, establish two things the
call-site grep cannot tell you: that the helper has exactly ONE definition
(`grep -rn 'async <name>(' e2e --include='*.ts'` — two page objects with no shared base routinely
carry byte-identical copies), and that no other route reaches the same behaviour. For an aborted
wizard the second grep is for the other ways a session ends: `.cancel()`, `pressEscape`,
`ctrlC`, and a bare `waitForExit()` following any of them. A helper-name census reports the
helper's reach and reads as if it reported the rule's.

**An assertion placed in a shared teardown helper states, in its own message, that it fired during
teardown.** `finally` and `afterAll` callers discard the exception they were already carrying, so
such an assertion can replace a more informative failure with a less informative one. The message is
the only place that fact can be recorded where the person meeting it will read it.

Cross-check against CLAUDE.md: no conflict found. The removal-over-tightening decision is the
existing "NEVER broaden an assertion to make a failing test pass" rule's neighbour rather than a
tension with it — nothing was weakened, and the strictly stronger check now runs for all 35 sites
instead of 2. The three removed assertions were each strictly weaker than the funnel's, and the
"NEVER delete an unused binding in a test file without triaging it first" rule was satisfied by
triage at each: two of the three tests keep their subject assertions, and the third's subject is the
abort itself, which the funnel now carries.

All counts in this finding are censuses over `e2e/`, not samples.
