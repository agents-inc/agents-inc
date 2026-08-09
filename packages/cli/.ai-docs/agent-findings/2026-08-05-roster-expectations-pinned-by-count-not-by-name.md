---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/expected-values.ts
  - src/cli/lib/__tests__/commands/eject.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-05
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: open
blocked_by: 2026-08-05-builtin-agent-rosters-unbound-to-generated-agent-names.md
---

## What Was Wrong

Two test-side expectations of the built-in agent roster were written so that a roster change
reports a number rather than a name.

**1. `EXPECTED_AGENTS` was untyped.** `src/cli/lib/__tests__/expected-values.ts` declared the
per-domain rosters as `as const` string arrays with no `AgentName` constraint. Its sibling
`EXPECTED_SKILLS` in the same file already carried `satisfies Record<string, readonly SkillId[]>`;
the agent constant did not. Retiring three agents therefore produced 25 `tsc` errors spread across
four consumer files — `user-journeys.integration.test.ts` alone owned 19 — and none at the single
line that actually held the stale name. The error text also never named the removed agent as the
constant's own value; it appeared only as an unassignable member of an inferred union.

**2. `eject.test.ts` asserted a directory listing by length.** Three sites read the ejected
`src/agents/` tree and asserted `expect(entries).toHaveLength(8)`. When the `pattern/` role
directory was deleted, all three failed with `expected [...] to have a length of 8 but got 7` —
a count with no statement of which directory left, and no protection against a swap (one role
removed, another added) that keeps the count intact. The same file already asserts the correct
way three lines earlier: `expect(entries).toStrictEqual([path.basename(DIRS.templates)])`. The
weaker form was the local drift, not the convention.

## Fix Applied

`EXPECTED_AGENTS` members now carry `as const satisfies readonly AgentName[]`, placed on the member
arrays rather than the object so the `WEB_AND_API` / `ALL` getters are not contextually typed and
widened — the pattern `E2E_AGENTS` in `e2e/fixtures/expected-values.ts` already documents. A stale
agent name is now a type error at its own line.

The three `toHaveLength(8)` assertions were replaced with `toStrictEqual(EJECTED_AGENT_DIRS)`
against one named module constant listing the seven expected directories.

The rosters themselves were also brought to the current state of `DOMAIN_AGENTS`: `WEB` lost
`web-architecture`, and `API` and `CLI` each gained the two roles the reorganization added.

## Proposed Standard

Add to CLAUDE.md under "Test Assertions":

> NEVER assert a directory listing, roster or generated union by count alone
> (`toHaveLength(n)`). Assert the members with `toStrictEqual` against a named constant. A count
> tells you something changed; only the members tell you what, and a count cannot detect a swap.

Add to CLAUDE.md under "Test Data":

> ALWAYS constrain shared expected-value constants to the generated union they mirror
> (`as const satisfies readonly AgentName[]`, `readonly SkillId[]`). An unconstrained constant
> moves its own type errors to every consumer and reports them as an inferred-union mismatch.
> Where the object has getters, put `satisfies` on the member arrays, not on the object.

This is the test-side half of
`2026-08-05-builtin-agent-rosters-unbound-to-generated-agent-names.md`, which proposes the
production-side roster-invariant test. That finding notes removals are self-checking via `tsc`
while additions are caught by nothing — true, but the constraint above is what makes the removal
signal land on the line that owns the stale name instead of 25 lines that merely read it.
