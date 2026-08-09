---
type: standard-gap
severity: medium
affected_files:
  - e2e/commands/compile-scope-filtering.e2e.test.ts
  - e2e/commands/dual-scope.e2e.test.ts
  - e2e/commands/compile-config-types-refresh.e2e.test.ts
  - e2e/lifecycle/dual-scope-mixed-source-compiled-ref.e2e.test.ts
  - e2e/lifecycle/dual-scope-s-round-trip-space-inert.e2e.test.ts
  - e2e/lifecycle/dual-scope-in-session-collapse-restore-sequence.e2e.test.ts
  - src/cli/stores/wizard-store.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-08
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: missing-rule
status: open
---

## What Was Wrong

Fixing two owner-ruled scope regressions (CLI-438 compile containment, CLI-443 the `[P]`-half
toggle) turned **six E2E files and two unit cases red**. Not one of them was testing a defect:
each had been written FROM the behaviour, and each read as a deliberate contract.

- Six E2E tests across three files ran `compile` inside a project and then asserted on the GLOBAL
  scope's compiled agents — `expect(output).toContain("Compiling global agents")`, and content
  assertions on `$HOME/.claude/agents/*.md` that only the global pass could satisfy. Two more
  (`dual-scope-mixed-source-compiled-ref`) read a global agent file that the project compile had
  written.
- Two E2E tests and two `wizard-store.test.ts` cases asserted that SPACE on a live `[P][G]` pair
  is inert and emits the global-locked toast — the whole-pair refusal the owner narrowed.

The specs were not wrong when written; they pinned what the code did. The gap is that nothing in
them recorded WHERE the behaviour came from, so a later reader — human or agent — could not tell
"this is the ruled contract" from "this is what the implementation happened to do on the day the
spec was written". Both behaviours had, in fact, never been ruled on: the first was a
consequence of deriving the compile pass set from which installations exist, the second of a
guard keying on "is there a global install" rather than "does the project own this entry".

A spec in that position is worse than no spec: it makes a regression look intentional, and it
makes the fix look like the regression. Rewriting eight of them was the larger half of this
change.

## Fix Applied

Every one of them was rewritten to the ruling rather than deleted, and each kept its original
subject:

- The compile specs now run one invocation per scope — the global agents from a home-context run,
  the project's from the project — so the same content assertions hold under containment.
- The `[P][G]` specs now assert the narrowed guard BOTH ways in the same file: the project half
  toggles off, and the global half an in-session collapse leaves behind still refuses with the
  toast.

## Proposed Standard

`.ai-docs/standards/e2e/anti-patterns.md`, as a new rule beside the existing assertion rules:

> **A spec that pins a scope, ownership or propagation boundary must cite where the boundary came
> from** — a ruling, a finding, or a standards section — in its file-level JSDoc. Not the ticket
> that added the test: the decision that made the behaviour correct. A boundary assertion with no
> provenance is indistinguishable from an accident of the implementation, and the next person to
> change that behaviour has to treat the red spec as evidence against the change rather than as a
> question about it.

The rule is cheap to follow (one sentence per file) and it is the only thing that would have told
this session's eight specs apart from the specs around them.
