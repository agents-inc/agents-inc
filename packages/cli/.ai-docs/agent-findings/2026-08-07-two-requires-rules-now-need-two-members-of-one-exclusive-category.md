---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/lib/configuration/default-rules.ts
  - src/cli/lib/configuration/default-categories.ts
standards_docs:
  - .ai-docs/reference/features/configuration.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`api-database` is `exclusive: true` — one pick, radio-style — and it holds sixteen skills that are
not all the same kind of thing: the SQL ORMs and query builders (Drizzle, Prisma, Knex, …), the
engines (PostgreSQL, MySQL), and the KV/cache stores (Redis, Upstash, Vercel KV).

Two `requires` rules now reach into it from different sides:

- `better-auth-drizzle-hono` needs `["drizzle", "hono"]` (AND) — this wave tightened it from
  `["drizzle"]`.
- `bullmq` needs `["redis", "upstash"]` (OR) — new this wave.

Each is individually satisfiable. Together they are not: satisfying both requires two members of
`api-database` at once, which the exclusive category refuses.

```
selection: better-auth-drizzle-hono + bullmq + drizzle + redis + hono
errors: [{
  type: "categoryExclusive",
  message: 'Category "Database ORM" only allows one selection, but multiple selected: Drizzle, Redis'
}]
```

A user who wants Better Auth and a background queue in the same API has no valid selection. There
is no path through the wizard that satisfies both fences, and the grid gives no hint why — the
radio simply swaps one for the other and the requirement re-lights.

The manifest's own consistency gate ("no rule's target sits in its subject's own category") holds:
BullMQ is in `api-queue`, Better Auth is in `api-auth`, and neither is in `api-database`. The gate
checks subject-against-target and does not look at target-against-target across rules. That is the
gap — the pre-existing shape of `api-database` was harmless while only one rule pointed into it.

Note also that the manifest describes Redis and Upstash as sitting in an exclusive `api-kv`
category. No such category exists; both are in `api-database`. The conclusion the manifest drew
happens to be right for the gate it was checking, but the premise is wrong, and the collision above
is what the correct premise reveals.

## Fix Applied

None — discovery only. Splitting `api-database` (a KV/cache category peeled off the ORM category,
the same move this wave made for `shared-task-runner` and `shared-lint`) would resolve it, but it
is not in this wave's manifest and inventing it here would be exactly the unfenced-window hazard
the ordering constraints exist to prevent. Both rules land as specified; the collision is recorded
for the batch that owns the `api-*` category shape.

## Proposed Standard

Add a **cross-rule** clause to the consistency gate that batch manifests apply, in
`.ai-docs/reference/features/configuration.md` -> the category section: when two `requires` rules
can apply to one selection, the union of their targets must not put two members of the same
exclusive category on the required side. A one-off check is cheap and could live as a test over
`defaultRules` + `defaultCategories` rather than as prose — walk every pair of rules, take the
targets that are forced (plain `needs`, plus every member of a `needsAny` list that is the only way
to satisfy it), and assert no exclusive category is named twice.

The narrower lesson for manifest authors: **verify the category a rule's target actually sits in
before asserting the gate holds.** The `api-kv` claim above was never checked against
`source-types.ts`, and the whole gate rested on it.
