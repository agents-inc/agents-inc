---
type: standard-gap
severity: medium
affected_files:
  - .ai-docs/reference/features/built-in-catalogue.md
  - src/cli/lib/configuration/default-stacks.ts
  - src/cli/lib/configuration/__tests__/default-stacks.test.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  built-in-catalogue.md invariant 4 now states both readings and names the seven slots where they
  differ, and default-stacks.test.ts pins them in EXPECTED_EMPTY_AGENT_SLOTS beside an assertion
  that the one filled slot is filled. The count-ownership rule is unchanged; the proposal below
  asks it to require the reading, not the owner.
---

## What Was Wrong

`built-in-catalogue.md` invariant 4 said `cli-developer` and `cli-tester` "appear in the same 8"
stacks. The number is right and the sentence is wrong, and no amount of re-deriving the number
would have found it.

`Object.keys(stack.agents)` counts sub-agents a stack **declares**. Seven of the eight stacks that
declare `cli-tester` give it `{}` — it is named and handed nothing — so `cli-ink-oclif` is the only
stack that assigns it a skill. Under the declared reading `cli-tester` is 8; under the assigning
reading it is 1. The document's own re-derivation invocation takes the declared reading, so the
document was internally consistent and re-runnable, and still told a reader that eight stacks equip
a CLI tester.

Reproduction, from `packages/cli`:

```
npx tsx -e '
import { defaultStacks } from "./src/cli/lib/configuration/default-stacks.ts";
const declared = new Map(), assigning = new Map();
for (const s of defaultStacks) for (const [a, cfg] of Object.entries(s.agents)) {
  declared.set(a, (declared.get(a) ?? 0) + 1);
  if (Object.keys(cfg ?? {}).length > 0) assigning.set(a, (assigning.get(a) ?? 0) + 1);
}
for (const [a, n] of [...declared].sort())
  if (assigning.get(a) !== n) console.log(a, "declared", n, "assigning", assigning.get(a) ?? 0);
'
```

It printed one row — `cli-tester declared 8 assigning 1` — which is what makes this worth filing
rather than fixing quietly: every other agent's two readings agree, so the one figure that carries
the ambiguity is invisible beside twelve that do not.

The corpus already knows counts rot. This is the adjacent failure: the count never moved, was
correct every time anybody checked it, and named a different quantity than the sentence around it.
A drift checker cannot see it, a re-derivation confirms it, and the only thing that catches it is
computing the other reading and comparing.

## Fix Applied

- Invariant 4 now states both readings, names all seven empty slots, and says which reading the
  section's counts take.
- `EXPECTED_EMPTY_AGENT_SLOTS` pins the seven by name — not by arity, per CLAUDE.md's rule against
  encoding a gap in a count — beside an assertion that `cli-ink-oclif > cli-tester` IS filled, so
  the pin cannot pass on a catalogue that files nothing at all.
- Both were mutation-checked: dropping one slot from the constant and pointing the control at a
  non-existent pair each redden the spec.

Whether a stack should declare a sub-agent it gives nothing to is a product question. Nothing here
answers it; the pin records that seven do, so the answer becomes a decision rather than a discovery.

## Proposed Standard

For `standards/documentation-bible.md`, beside "A Count Lives in Exactly One Document":

> **A count says what it counts, or it is two numbers.** Where a figure is derived from a keyed
> structure, the sentence states whether it counts KEYS or non-empty VALUES, because a declared-
> and-empty member makes those different and nothing about the number says which one it is. Where
> the two readings differ, the document names the members where they diverge rather than choosing a
> reading — and the suite pins those members, since a count of either kind stays green while the
> divergence grows.

This does not conflict with the count-ownership rule; it constrains the same sentence one level
further in. The existing rule settles WHO may state a count and this settles WHAT the count is of,
and the second question has been the expensive one here: the figure that produced this finding had
survived at least one hand audit, because auditing a count means re-deriving it, and re-deriving it
reproduces the ambiguity exactly.
