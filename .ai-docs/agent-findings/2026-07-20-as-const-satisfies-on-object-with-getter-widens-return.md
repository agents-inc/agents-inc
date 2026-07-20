---
type: anti-pattern
severity: medium
affected_files:
  - e2e/fixtures/expected-values.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: typescript
domain: e2e
root_cause: convention-undocumented
---

## What Was Wrong

The Pass 8 ledger asks for `as const satisfies` clauses on shared constant objects. Applied
naively to an object that contains a **getter**, `satisfies` silently makes the constant
_less_ precise than it was before the clause was added — the opposite of the intent.

`E2E_AGENTS` in `e2e/fixtures/expected-values.ts` is the concrete case:

```ts
export const E2E_AGENTS = {
  WEB: ["web-developer"],
  API: ["api-developer"],
  get WEB_AND_API() {
    return [...this.API, ...this.WEB].sort();
  },
} as const satisfies Record<string, readonly AgentName[]>;
```

The `satisfies` constraint supplies a **contextual type** for every member, including the
getter. The getter's return type stops being inferred from its body and widens to the
constraint. Measured with a type probe:

- before the clause: `E2E_AGENTS.WEB_AND_API` was `("web-developer" | "api-developer")[]`
- after the clause: `AgentName[]` — all 23 agent names

So the clause added _validation_ while removing _precision_. Nothing failed to compile,
because the widened type is still assignable everywhere the constant is used. The loss is
invisible at the call site and would only surface much later, as a missed type error in
some future spec that assigns `WEB_AND_API` to a narrower parameter.

The literal-array members (`WEB`, `API`) were unaffected — the trap is specific to
accessors, whose type is inferred rather than written.

## Fix Applied

Moved the `satisfies` clauses off the object and onto the member arrays, leaving the getter
with no contextual type so its body-inferred return survives:

```ts
export const E2E_AGENTS = {
  WEB: ["web-developer"] as const satisfies readonly AgentName[],
  API: ["api-developer"] as const satisfies readonly AgentName[],
  get WEB_AND_API() {
    return [...this.API, ...this.WEB].sort();
  },
} as const;
```

This keeps the full validation benefit (both arrays are still checked against `AgentName`)
with zero precision loss. Verified by a scratchpad type probe asserting
`E2E_AGENTS.WEB` is `readonly ["web-developer"]` and `WEB_AND_API` is
`readonly ("web-developer" | "api-developer")[]`. An on-site comment records why the
clauses sit where they do, so the next sweep does not "tidy" them back onto the object.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md` (and to any general TypeScript
conventions doc covering `as const satisfies`):

> **Do not put `satisfies` on an object literal that contains a getter or method.**
> `satisfies` contextually types every member, so an accessor's return type widens from
> what its body infers to whatever the constraint says. Put the `satisfies` clause on the
> individual data members instead. When a constant mixes data and accessors, verify the
> accessor's type is unchanged (a two-line type-probe assignment is enough) before and
> after adding any `satisfies` clause.

Generalized rule for the remaining `as const satisfies` sweep items: **a `satisfies` clause
must never change the type of the thing it annotates.** If adding one changes any member's
inferred type, the constraint is in the wrong place. Getters are the common case, but the
same applies to methods and to any member whose type is inferred rather than literal.
