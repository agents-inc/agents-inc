---
type: missing-standard
severity: low
affected_files:
  - packages/cli/src/cli/commands/eject.ts
  - packages/cli/src/cli/lib/__tests__/commands/eject.test.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The instance is pinned. `eject.test.ts` › "with a configured marketplace that cannot be loaded"
  holds the guard: a `skills` control and one spec each for `templates` and `agent-partials`. The
  `EjectPlan` type tightening and the CLAUDE.md wording below are unwritten.
---

## What Was Wrong

`planEject` in `commands/eject.ts` loads the marketplace for `skills` and `all` only. No spec held
that rule, and neither did the type checker. With `|| type === "templates"` deleted, `eject.test.ts`
and the eject e2e specs stayed green, and `tsc` reported 0 diagnostics. Yet `eject templates`
against a configured marketplace that cannot be loaded exited 1 with the "Check it for a typo"
refusal rather than 0.

The new spec pins that `eject templates` succeeds. That claim is vacuous if the fixture's
marketplace can in fact load. That happens if `loadSource` ever tolerates a missing local path, or
falls back to the default marketplace. The mutant would then pass too, and the spec would stay
green. So the same `describe` carries a control: `eject skills` with the same config refuses with
the exact error. This is the converse of CLAUDE.md's "NEVER pin an operation as REFUSED without
pinning … ALLOWED". It is not the sweep converse in
`2026-10-22-a-sweep-pinned-only-where-it-fires-left-the-filter-sparing-a-clicked-off-pin-unchecked`.

Why `tsc` cannot see it: `EjectPlan`'s source-less member is `{ type: "agent-partials" | "templates" }`.
TypeScript splits `{ type, sourceResult }` by its discriminant, and
`{ type: "templates", sourceResult }` is assignable to that member, because the extra property is
not checked once the literal is split.

## Fix Applied

The spec and its control, in `eject.test.ts` › "what eject says". Red against mutants served
without writing the tree (a Node load hook for `dist/`, a Vite transform for the source).

- **M11** (`agent-partials` only skips the load): the templates spec fails, and nothing else does.
- **M11c** (`templates` only skips the load): the agent-partials spec fails, along with four
  older specs.
- **M11b** (`if (false)`): both new specs fail.

The type was measured in memory and not applied, because it is outside this lane's row. With
`{ type: "agent-partials" | "templates"; sourceResult?: never }`, the real code reports 0
diagnostics. M11 reports TS2322 at the `return { type, sourceResult }`, and M11b reports two.

## Proposed Standard

The control rule goes in `packages/cli/CLAUDE.md` › Test Assertions, beside the REFUSED/ALLOWED
rule. A spec that an operation still succeeds while a dependency is broken gets a spec in the same
file showing that the same fixture refuses an operation that does read the dependency. Without it,
a fixture that stops breaking the dependency leaves the spec green whatever the guard does.

Separately, give `EjectPlan`'s source-less member `sourceResult?: never`, so the type checker also
holds the guard. This is a proposal; it does not conflict with any NEVER or ALWAYS rule in either
CLAUDE.md.
