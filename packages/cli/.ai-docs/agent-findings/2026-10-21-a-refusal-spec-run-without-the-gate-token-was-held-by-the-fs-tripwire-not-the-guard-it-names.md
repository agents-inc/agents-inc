---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/configuration/__tests__/config-types-io.test.ts
  - src/cli/lib/configuration/config-types-io.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The instance is fixed and the guard's comment now names the token. No rule ties a refusal spec
  to the token posture of the production callers, so the next one is caught only by a mutation.
---

## What Was Wrong

`regenerateConfigTypes` (`config-types-io.ts`) refuses the home directory at entry. Its comment
said "Refused here too: ... survives a mocked `utils/fs`", which reads as redundant with the
`utils/fs` write tripwire. A test prune took it at its word: it rewrote the spec "refuses the home
directory, and leaves no types file there" to call `regenerateConfigTypes(home.dir, ...)` with no
gate token, so the refusal it saw came from the tripwire. Deleting the entry guard left it green.

The deciding fact: `withGateToken` lifts the tripwire, and both production callers
(`config-gate/index.ts` directly, `config-gate/propagate.ts` through the gate's entry points) hold
it. Under the token the entry guard is the only refusal; without it, `regenerateConfigTypes`
overwrites the home's global `config-types.ts`.

## Fix Applied

The spec runs under `withGateToken`, real filesystem, both assertions kept. Mutation (guard
deleted, inside the dist lock, restored and sha-checked): the spec fails with `promise resolved
"undefined" instead of rejecting`. The guard comment now states the token as its reason.

Census, run from `packages/cli`: spec files naming `GlobalPairWriteViolation` or "may only be
written through config-gate":
`grep -rln 'GlobalPairWriteViolation\|may only be written through config-gate' src e2e scripts --include='*.ts' --include='*.tsx' | grep -E '\.test\.'`.
Of the token-free refusals in them, `gate-consequences.test.ts` calls `writeProjectPartial`, which
takes the token itself, and `the-pair-writer-writes-only-what-changed.test.ts` refuses
`writeGlobalTypesHalf` without the token on purpose (its subject is the tripwire). No other
instance.

## Proposed Standard

CLAUDE.md "Test Assertions", beside the refused/allowed pair rule: a spec pinning a guard that sits
inside a token-, flag- or context-holding path runs under the same posture the production callers
hold, or an outer layer answers for it. Check by deleting the guard and watching the spec redden.
