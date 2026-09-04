---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/schemas.ts
  - src/cli/types/matrix.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
  - .ai-docs/reference/types/zod-schemas.md
  - .ai-docs/reference/types/core-types.md
date: 2026-09-03
reporting_agent: codex-keeper
category: typescript
domain: shared
root_cause: missing-rule
status: partial
partial_note: >-
  The instance is fixed — `agentIsolationSchema` reads the const array — and the census returns no
  second site. The RULE half is open: nothing states that a `satisfies` clause over a covariant type
  parameter is a one-way check, and nothing would report the next one.
---

## What Was Wrong

`agentIsolationSchema` in `src/cli/lib/schemas.ts` was written as:

```ts
export const agentIsolationSchema = z.literal("worktree") satisfies z.ZodType<AgentIsolation>;
```

`AgentIsolation` is derived from `AGENT_ISOLATIONS` in `src/cli/types/matrix.ts`, which is
`["worktree"] as const`. The `satisfies` clause reads as the thing holding the schema and the union in
step. It is not, and it cannot be.

**`ZodType`'s output parameter is covariant, so a NARROWER schema satisfies a WIDER annotation.** A
schema accepting only `"worktree"` satisfies `z.ZodType<"worktree" | "container">` for the same reason
a `Dog` is an acceptable `Animal`. The clause therefore reports one direction only: it catches a
schema that accepts something the union does not, and is silent on a schema that refuses something the
union does. That second direction is the one a widening moves.

Measured, and this is the specific thing that makes it worth a finding: **adding a member to
`AGENT_ISOLATIONS` produced zero `tsc` errors, while every parse of the newly-documented mode failed
at runtime.** The type-level statement and the runtime behaviour disagreed with nothing to notice —
the union widened, the schema did not, and the clause meant to bind them stayed green.

The four sibling schemas in the same file were always right, which is what made the odd one out look
deliberate rather than mistaken:

```ts
export const modelNameSchema = z.enum(MODEL_NAMES) as z.ZodType<ModelName>;
export const effortLevelSchema = z.enum(EFFORT_NAMES) as z.ZodType<EffortLevel>;
export const permissionModeSchema = z.enum(PERMISSION_MODES) as z.ZodType<PermissionMode>;
export const skillSlugSchema = z.enum(SKILL_SLUGS) as z.ZodType<SkillSlug>;
```

These do not rely on any check at all. **They CONSUME the const array**, so the schema's accepted set
is the union's members by construction and there is no second list to drift. The `as` is a boundary
cast onto the branded union type, which is a separate concern from membership. A union of one is
exactly where the difference is invisible: `z.literal("worktree")` and `z.enum(["worktree"])` accept
the same strings today, so nothing about the file's behaviour distinguished the wrong form from the
right one until the array moved.

## Fix Applied

`agentIsolationSchema` is now `z.enum(AGENT_ISOLATIONS) as z.ZodType<AgentIsolation>` — the sibling
form, consuming the array. Its docblock in `src/cli/lib/schemas.ts` carries the covariance reason so
the next reader does not "simplify" it back to a literal on the grounds that the array has one member.

Census run over the whole tree, and it returns exactly the docblock that explains the retirement — no
second `satisfies` clause over a Zod schema survives:

```
grep -rn 'satisfies z\.' src e2e scripts --include='*.ts' --include='*.tsx'
```

Documents corrected in the same pass: `reference/types/core-types.md` § AgentIsolation, which stated
"the bridge schema does not consume the const array … the `satisfies` clause is what holds the two in
step" — a sentence that was accurate about the code and wrong about what the clause did;
`reference/features/agent-system.md`'s `isolation` footnote; and the `agentIsolationSchema` row in
`reference/types/zod-schemas.md`, which moved from the Structural table to the Bridge table because
that is now what it is.

## Proposed Standard

**A `satisfies` clause over a type whose parameter is covariant in the position you care about checks
one direction, and the direction it checks is usually not the one that breaks.** The rule belongs in
`.ai-docs/standards/typescript-types-bible.md`, near § 10's existing material on constraining a
constant to the union it mirrors — that section already teaches "hold the constant against the
generated union", and this is the case where holding it that way does not work.

The decision procedure, which is shorter than the explanation:

> When a value must accept exactly the members of a const array, DERIVE it from the array. Do not
> assert a relationship with `satisfies` and do not annotate one with `: T`. A derivation cannot
> drift; a check over a variant parameter can, and silently.

Two supporting notes worth carrying into the rule:

- **A union of one is where this is undetectable.** Both forms behave identically until the array
  grows, so review cannot separate them and no test can either. That is an argument for a rule rather
  than for vigilance.
- **Nothing mechanical guards it.** `scripts/check-enumeration-drift.ts` binds a DOCUMENT's list of
  names to a symbol's membership; it says nothing about two symbols in source that ought to agree. So
  the enforcement here is the derivation itself, which is the standard's whole point.

Cross-checked against `CLAUDE.md`: no conflict. Its "ALWAYS constrain a shared expected-value constant
to the generated union it mirrors" rule is the same instinct one layer over, in test data rather than
at a parse boundary — and it too prescribes `as const satisfies`, which works there because the
constrained thing is an array of literals rather than a value with a variant type parameter. Naming
that distinction in the new rule is what keeps the two from reading as contradictory.
