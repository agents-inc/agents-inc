---
type: convention-drift
severity: medium
affected_files:
  - e2e/interactive/real-marketplace.e2e.test.ts
  - e2e/interactive/edit-wizard-pending-removal-row.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-08-09
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  Both suites now drive the opening step the stackless clone actually renders — DOMAINS — and pick
  their own skills; `real-marketplace.e2e.test.ts` gained a spec asserting the stack step never
  painted, and its roster expectation moved from a built-in stack's agents to the Web domain's
  preselection (`WEB_DOMAIN_AGENTS` in e2e/fixtures/expected-values.ts).
---

## What Was Wrong

Two suites pointed `--source` at the local skills clone to exercise "real marketplace" content.
The clone ships no `config/stacks.ts`, so every stack the wizard offered them came from the CLI's
own `defaultStacks` — and both suites drove that list as if it were the marketplace's.

The naming made the substitution invisible from the inside:

- `real-marketplace.e2e.test.ts` had a spec called **"should have rendered real stacks during
  stack selection"** whose two assertions were on installed skill refs, with a comment explaining
  that the stacks in question were the CLI's built-ins. The suite's own helper said so in prose —
  _"The skills clone ships no `config/stacks.ts`, so the wizard's stack list is the CLI's own
  `defaultStacks`"_ — and the spec name still claimed the marketplace's.
- `edit-wizard-pending-removal-row.e2e.test.ts` set its fixture up by installing "the first stack's
  defaults", i.e. `defaultStacks[0]` resolved against a different catalogue's skills, so which
  skills the setup installed depended on which of the built-in stack's ids the clone happened to
  carry.

Neither suite was wrong about the CLI's behaviour at the time — the loader really did substitute
the built-in catalogue for any source shipping none. The drift is that a spec named for one subject
(the marketplace's stacks) was pinned to another (the CLI's), and the only record of the swap was a
comment. When the owner's CLI-451 ruling removed the substitution, both suites failed in their
`beforeAll` on a wait for a step that no longer renders — the failure named a timeout, not the
assumption.

## Fix Applied

Both suites now start from `InitWizard.launchOnDomainsInProject`, which waits for the step a
stackless source actually opens on, and select their skills by display name instead of inheriting a
stack's. `real-marketplace.e2e.test.ts` also gained the missing positive: a spec asserting that the
session's append-only PTY output never contained the stack step's own strings or a built-in stack
name — the substitution is now something a spec would catch rather than depend on.

## Proposed Standard

`.ai-docs/standards/e2e/anti-patterns.md` should carry: **a spec named for a source's data must
assert on data that source ships.** When a fixture cannot supply the subject, the spec's name and
its assertions have to move to what is actually under test — a comment reconciling the two is not
enough, because it does not fail when the substitution it describes goes away.
