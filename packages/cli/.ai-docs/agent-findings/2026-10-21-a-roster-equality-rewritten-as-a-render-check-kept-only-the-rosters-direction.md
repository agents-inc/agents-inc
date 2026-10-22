---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/agent-template-renders-its-partials.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The spec holds the equality again. The Proposed Standard is not written into CLAUDE.md.
---

## What Was Wrong

`agent-template-renders-its-partials.test.ts` read the render tags out of the agent template and
asserted the list `toStrictEqual` `RENDERED_METHODOLOGY_PARTIALS`. A prune pass rewrote it to stop
reading source: it rendered each partial on the roster and checked that each one appears in a
compiled sub-agent, in order. That checks one direction only. A partial the template still renders
could move from `RENDERED_METHODOLOGY_PARTIALS` to `UNRENDERED_METHODOLOGY_PARTIALS`, whose comment
says it lists files no sub-agent reads, and both specs stayed green. The source-reading version
failed on exactly that move.

The rewrite iterated the roster, so it could only ask about the roster's members. Equality needs the
candidate set to come from somewhere the roster does not control: here, the directory.

Census, this lane's rewrites in that pass only (not a sweep of other lanes): three source-reading
assertions were rewritten as behaviour checks. `agent-partials.test.ts` (wrapper) and
`e2e-runner-environment.test.ts` (cleared variables) were containment checks before and after. This
one was the only equality, and the only one weakened.

## Fix Applied

The spec renders every partial in `methodologies/`, keeps those the compiled sub-agent contains,
orders them by position and asserts that list `toStrictEqual` `RENDERED_METHODOLOGY_PARTIALS`.
Checked with throwaway copies, deleted afterwards. With the roster move above, the pre-fix spec
passed 2 of 2; the fixed spec failed with
`expected [ 'operating-principles' ] to strictly equal []`. Without the move it passed 2 of 2.

## Proposed Standard

`packages/cli/CLAUDE.md` › "Test Assertions", beside the count-alone rule: when a roster is held
against what the product does, collect the product's answer from every candidate (the directory, the
generated union), not from the roster, and assert it `toStrictEqual` the roster. Iterating the
roster and checking each member is found tests only that the roster is a subset. Checked against
CLAUDE.md: nothing conflicts. The count-alone rule settles members versus count; this settles
subset versus equality.
