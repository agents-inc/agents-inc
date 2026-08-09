---
type: anti-pattern
severity: medium
affected_files:
  - ../../packages/matrix/src/schema.ts
  - ../../packages/matrix/src/read-model/catalog.ts
  - ../../packages/matrix/src/read-model/stacks.ts
  - ../../packages/matrix/src/read-model/sub-agents.ts
  - ../../packages/matrix/src/read-model/collections.ts
  - ../../packages/matrix/src/read-model/assignment-defaults.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-06
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: CLI-395 — every id field in packages/matrix/src/schema.ts now validates against the generated z.enum tuples, and the thirteen downstream casts they forced are deleted.
---

## What Was Wrong

`packages/matrix/src/schema.ts` opens with the claim that it is the file where "a regenerated
catalog that dropped or renamed something we depend on … fails here, loudly, instead of rendering a
blank table." For ids that claim was false. Every id — skill, category, agent, model — was typed
`z.string()`, so a renamed skill parsed cleanly and only surfaced later as a lookup that returned
nothing.

The cost landed one layer down. Because the parsed types carried `string` where the read models
needed unions, thirteen casts existed purely to undo the schema's looseness:

- `read-model/catalog.ts` — `skill.id as SkillId`, `skill.category as Category`,
  `category.id as Category`, `relation.skillId as SkillId` (×2), `requirement.skillIds as SkillId[]`,
  `skill.compatibleWith as SkillId[]`
- `read-model/stacks.ts` — `agentId as AgentName` (×2), `stack.allSkillIds as SkillId[]`
- `read-model/sub-agents.ts` — `definition.id as AgentName`

None carried a comment, and per the types bible's own cast taxonomy none qualified: these were
"mid-pipeline workarounds", whose sanctioned fix is _"fix the source type instead"_. The generated
tuples this needed — `SKILL_IDS`, `CATEGORIES`, `AGENT_NAMES`, emitted as
`as const satisfies readonly …[]` precisely because `z.enum` requires readonly tuples — were already
vendored into the package and went unused. `packages/cli/src/cli/lib/schemas.ts` was already doing it
the right way (`z.enum(SKILL_SLUGS)`, `z.enum(CATEGORIES)`), and one line of the same file
(`DomainIdSchema = z.enum(DOMAINS)`) already showed the pattern.

Two siblings rode along with the same cause. `SubAgent.model` was re-widened to `string` although
both the generated agent data and the CLI type it comes from say `ModelName`, and `SubAgent.flavor`
to `string` although `RoleFlavor` is the authored list one module away. Both erased information the
data already had.

Separately, the three by-id indexes (`Catalog.skillsById`, `Catalog.categoriesById`,
`SUB_AGENTS_BY_ID`) were declared `Record<string, …>`: total maps over an open key. Callers already
`?.`-guarded them (eight sites in the editor), so the type disagreed with the code reading it in
both directions at once — it promised every string key resolved, and it could not say that a known
id might legitimately miss.

## Fix Applied

Every id in `schema.ts` now validates against the generated tuple: `z.enum(SKILL_IDS)`,
`z.enum(CATEGORIES)`, `z.enum(AGENT_NAMES)`, `z.enum(MODEL_NAMES)`. The stack's agent→category→skill
nesting uses `z.partialRecord(AgentNameSchema, …)` — partial because a stack staffs a few agents, not
the roster — which is what let the `agentId as AgentName` pair go. All thirteen casts are deleted; the
parsed types now arrive narrowed and the read models pass them straight through.

`flavor` is the one id deliberately left as `z.string()` at the boundary. The list of sayable roles
(`ROLE_FLAVORS`) is authored in `read-model/preload-defaults.ts`, which reads `schema.ts` — importing
it back would be a cycle through `catalog.ts` → `source.ts` → `schema.ts`, and that cycle throws at
import time, not at review time. `SubAgent.flavor` is narrowed to `RoleFlavor` where the list lives
instead, by calling the `flavorOf` assertion that module already had (now exported rather than
duplicated). The schema comment records why the check is not at the boundary.

The three indexes became `Partial<Record<SkillId | Category | AgentName, …>>`, with `indexById`
widened to key on `T["id"]`. Two boundary casts were added and commented, both in
`read-model/collections.ts`, both of the kind the types bible sanctions: `Object.fromEntries` and
`Object.entries` type every key as `string`.

Behaviour is now covered by `packages/matrix/src/schema.test.ts` — thirteen rejection tests that all
failed before the change, plus one asserting the shipped catalogue still parses so a future
vocabulary drift has one legible place to land rather than failing every module at import.

**No schema-parse failure was caught by the new enums.** The vendored catalogue and the generated
roster both parse unchanged, and `bun run generate:matrix:check` reports the vendored copies still
match what the generator emits — the change is entirely on the matrix-owned side of the boundary, so
nothing needed regenerating.

**Residue, deliberately not fixed:** `read-model/domains.ts` still writes
`DOMAIN_IDS.has(prefix) ? (prefix as Domain) : "meta"` — a `Set.has` membership check followed by a
cast, which is the same shape as the guards this change introduced (`isSkillId`, `isAgentName`) with
the type predicate left off. One line, outside CLI-395's stated scope.

## Proposed Standard

`typescript-types-bible.md` §4 tells you to narrow record _keys_; nothing tells you to narrow the ids
_inside_ the parsed values, which is where this drift lived for the life of the package. Add to §4 (or
as a new short section beside it):

> **Validate ids against the generated tuple, not `z.string()`.** A schema at a parse boundary is the
> only place a renamed or dropped id can be caught. `SKILL_IDS`, `CATEGORIES`, `AGENT_NAMES` and
> `MODEL_NAMES` are emitted as `as const satisfies readonly …[]` for exactly this — `z.enum` requires a
> readonly tuple. A `z.string()` id does not merely skip the check: it forces every consumer to cast the
> union back, and those casts are the "mid-pipeline workaround" row of §6's table, which the same
> document says to fix at the source.
>
> Corollary for review: **a cast to a generated union in a read model is evidence its schema is loose.**
> Look upstream before accepting one.

The rule needs a stated exception for the case met here: when the vocabulary is authored _downstream_
of the schema, validating at the boundary is an import cycle. Narrow at the module that owns the list,
with an asserting lookup, and say so in a comment at the boundary.
