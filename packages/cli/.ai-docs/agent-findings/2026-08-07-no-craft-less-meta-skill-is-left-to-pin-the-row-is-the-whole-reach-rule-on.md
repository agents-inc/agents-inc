---
type: architectural-drift
severity: medium
affected_files:
  - packages/matrix/src/read-model/assignment-defaults.ts
  - packages/matrix/src/read-model/assignment-defaults.test.ts
standards_docs:
  - .ai-docs/reference/features/agent-system.md
date: 2026-08-07
reporting_agent: cli-developer
category: testing
domain: shared
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The code side landed — the pin now runs off a fixture row rather than a shipped skill, and the
  craft rules live in one per-flavor map. The standard is unwritten: nothing says a new `meta-*`
  category needs a decision on whether it is a craft, nor that the row-only rule must be pinned on
  a fixture from here on.
---

## What Was Wrong

`metaSkillReach` has two kinds of rule. The base rule is "a meta skill reaches exactly the flavors
its authored `PRELOAD_DEFAULTS` row names". The craft rules are exceptions to it: a category whose
skills reach a role with no row at all.

Each craft was ruled one at a time — `meta-reviewing` at the consolidation, `meta-design` by
CLI-416, `meta-planning` (domain-scoped) with the playbooks, and now `meta-methodology` by the
2026-08-07 parity ruling. Nobody was tracking what the exceptions left behind, and the answer is
**nothing**. The catalog's meta domain is exactly those four categories, so after this ruling every
meta skill the catalog ships is some role's craft, and there is no shipped skill left on which the
base rule can be observed on its own.

That has two consequences worth writing down:

1. `assignment-defaults.test.ts` pinned the base rule on `meta-methodology-research-methodology`
   ("a meta skill in neither craft"). That skill is now the planners' craft, so the pin had to move
   to a fixture row (`createAssignmentResolver({ [skill]: ["tester"] })`) — the reach is asserted as
   "the row's testers PLUS the craft's PMs", which is the base rule read against a known craft
   rather than in isolation. Any future pass looking for a craft-less skill to move it back onto
   will not find one.
2. `2026-08-06-demoting-a-meta-rows-reviewer-flavor-removes-its-reach-not-just-its-eagerness.md`
   says in its `resolved_by:` that the rule "moved onto `meta-methodology-research-methodology` — a
   meta skill in neither craft, so it still holds there unqualified". That sentence was true when
   written and is not now. It is left in place: a resolved finding records what a landing did, and
   this file is the successor record.

## Fix Applied

The four craft rules were consolidated where they could be. Three of them are flavor-wide — reach
every agent of a role — and now live in one map keyed by flavor:

```ts
const CRAFT_CATEGORIES_BY_FLAVOR: Partial<
  Record<RoleFlavor, readonly CatalogSkill["categoryId"][]>
> = {
  planning: ["meta-methodology"],
  reviewer: ["meta-reviewing", "meta-design"],
};
```

A fifth craft is now an entry rather than a fourth predicate. `meta-planning` stays its own rule
because it is the one domain-SCOPED craft: `web-planning` reaches the web PM and nobody else's, so
it cannot be expressed as "this flavor reaches this category".

The base-rule pin moved onto a fixture row, and the reach it asserts names the craft explicitly, so
the next reader sees that the craft's agents are expected rather than wondering why a "row is the
whole reach" test lists PMs.

## Proposed Standard

In `agent-system.md`, beside the meta-reach note, state the rule the four rulings have converged on:

- A `meta-*` category is either **a craft** (its skills reach a role with no row, lazily) or **row-
  only** (its row is both reach and eagerness). Adding a `meta-*` category to the catalog is
  therefore a decision, not just data — say which it is, and add the entry to
  `CRAFT_CATEGORIES_BY_FLAVOR` if it is a craft.
- Because no shipped skill is row-only today, the "a row is the whole of a meta skill's reach" pin
  belongs on a **fixture** row and must stay there. Re-homing it onto whichever meta skill looks
  craft-less is how it silently stopped testing the base rule the last two times a craft was ruled.
