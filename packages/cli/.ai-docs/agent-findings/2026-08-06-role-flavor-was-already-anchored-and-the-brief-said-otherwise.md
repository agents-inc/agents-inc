---
type: audit
severity: low
affected_files:
  - packages/matrix/src/read-model/preload-defaults.ts
  - packages/matrix/src/read-model/preload-defaults.test.ts
  - packages/matrix/src/generated/agents.ts
date: 2026-08-06
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: rule-not-visible
status: resolved
resolved_by: "RoleFlavor re-anchored to ROLE_FLAVORS with a runtime guard in flavorOf; the premise it was fixing is recorded here as false."
---

## What Was Wrong

CLI-390's brief asked to fix a "known type hole": `RoleFlavor` was said to widen
to `string` because `GeneratedAgentDefinition.flavor` is typed `string`. It did
not. `AGENT_DEFINITIONS` is written `} as const satisfies Record<AgentName,
GeneratedAgentDefinition>`, and `satisfies` validates without widening, so
`(typeof AGENT_DEFINITIONS)[AgentName]["flavor"]` was already the literal union
of the six roles.

The evidence was sitting in the test file the whole time. Two
`@ts-expect-error` directives — on `["lazy"]` and on `["architect"]` — were
passing `tsc --noEmit` before the change. An unused `@ts-expect-error` is
itself error TS2578, so a green typecheck proved those lines really did fail to
compile, which proves `RoleFlavor` rejected non-role strings. Had it been
`string`, the matrix package's typecheck would have been red.

Verified directly rather than argued: deleting the `architect` directive
produces

    src/read-model/preload-defaults.test.ts(283,27): error TS2322: Type
    '"architect"' is not assignable to type '"meta" | "developer" | "planning" |
    "researcher" | "reviewer" | "tester"'.

and restoring it returns the package to green.

## Fix Applied

The re-anchor was still made, because it changes which side is the source of
truth rather than merely restating it:

- `ROLE_FLAVORS` keeps `as const satisfies readonly (typeof
AGENT_DEFINITIONS)[AgentName]["flavor"][]`, so every listed role must be one
  the roster carries — the compile-time direction that already worked.
- `RoleFlavor` is now `(typeof ROLE_FLAVORS)[number]`, so what an entry may say
  is authored in this module instead of inherited from generated data.
- `flavorOf` gained a `isRoleFlavor` guard and throws
  `Role flavor not found: <flavor> (agent: <id>)` — the other direction, a
  roster role the list does not name, which no `satisfies` can catch and which
  would otherwise resolve to lazy and look like a deliberate omission.

The two `@ts-expect-error` tests hold exactly the ground they held before —
neither stronger nor weaker, since the union is unchanged. A new test mocks
`../generated/agents` with a bogus flavor and asserts the throw.

## Proposed Standard

When a brief asserts a type is broken, check it before fixing it — a
`@ts-expect-error` that currently passes `tsc` is a proof the type is doing its
job, and it takes one command to read. Worth adding to
`.ai-docs/standards/typescript.md` alongside the existing cast rules: _an
`@ts-expect-error` in a green package is an assertion about the type system, so
treat it as evidence when auditing a type's strength — and when you change the
type it guards, delete the directive once to see the real error before putting
it back._
