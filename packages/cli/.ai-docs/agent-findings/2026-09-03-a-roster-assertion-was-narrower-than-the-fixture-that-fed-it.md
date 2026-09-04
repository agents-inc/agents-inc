---
type: convention-drift
severity: medium
affected_files:
  - src/cli/lib/resolver.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-09-03
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  Introduced `TUNED_OPTIONAL_FIELDS` as the single named constant both the fixture and the
  assertion read: the fixture is built with `...TUNED_OPTIONAL_FIELDS`, the "carries every field"
  spec asserts `pick(entryAt(result, "web-developer"), typedKeys(TUNED_OPTIONAL_FIELDS))` against
  it directly, and the "leaves each off entirely" spec filters `typedKeys(TUNED_OPTIONAL_FIELDS)`
  against the resolved output's own keys. Mutation-proved: force-dropping `experimental` from
  `resolveAgents`'s field list (`...(false && { experimental: ... })`) reddened exactly the
  roster spec, which reported the missing key by name; reverted and green again.
---

## What Was Wrong

`resolver.test.ts`'s `describe("fields the template reads")` block carries its own docblock stating
the reason it exists: `resolveAgents` builds its `AgentConfig` from an explicit field list rather
than by spreading the definition, so a field the list omits is dropped silently, and "a per-key
assertion cannot see the next one to be dropped" — the exact justification CLAUDE.md's roster rule
gives ("NEVER assert a directory listing, roster or generated union by count alone … Assert the
members with `toStrictEqual` against a named constant").

The spec built its fixture with five tuned fields (`disallowedTools`, `permissionMode`,
`isolation`, `hooks`, `experimental`) but its assertion object listed only four —
`experimental` was set on the fixture and read by nothing. The sibling "leaves each of them off
entirely" spec had the same gap in its filter list. `resolveAgents` itself carries `experimental`
through correctly (`...(definition.experimental !== undefined && { experimental:
definition.experimental })`), so nothing was broken in the product — the test had simply stopped
watching the field its own docblock says it exists to watch, exactly the failure mode the block
warns about, arriving from inside the file that already names it.

## Fix Applied

See `resolved_by`. Both specs now derive their field roster from one constant rather than
maintaining two independent lists (the fixture's spread and the assertion's object literal), so
adding a field to `TUNED_OPTIONAL_FIELDS` feeds both the fixture and both assertions in the same
edit.

## Proposed Standard

**Where a fixture and its assertion enumerate the same set of fields, bind both to one named
constant rather than writing the set out twice** — CLAUDE.md's roster rule already says this for
directory listings and generated unions; this is the same shape for a spec's own inline object
literal, which the existing rule's wording does not name explicitly (it reads as being about
`readdir()` output and generated types). Proposed addition to CLAUDE.md's "Test Assertions"
section, as a one-line extension of the existing roster rule: _"The same applies to a spec's own
inline fixture and its inline assertion object when both name the same set of keys — bind both to
one constant, not two independently maintained literals."_
