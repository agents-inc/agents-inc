---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/src/cli/lib/schemas.ts
  - packages/cli/src/cli/commands/build/marketplace.ts
  - packages/cli/src/cli/commands/new/agent.tsx
  - packages/cli/src/cli/utils/exec.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: typescript
domain: shared
root_cause: missing-rule
status: open
---

## What Was Wrong

`lib/schemas.ts` annotates fifteen schemas as `z.ZodType<T>` — `boundSkillSchema`,
`agentHookActionSchema`, `skillAssignmentSchema`, `pluginManifestSchema`, `marketplaceSchema` and
the rest. The annotation is a claim: _this schema's output is `T`_. Under
`exactOptionalPropertyTypes` all fifteen failed, and the failure was real rather than pedantic.

`z.string().optional()` on an object property does two things people conflate:

- it makes the key optional, and
- it **accepts a present-but-undefined value and preserves the key**.

Verified against zod 4.4.3:

```
s.parse({ a: "x", b: undefined })  ->  { a: "x" }, "b" in result === true
s.parse({ a: "x" })                ->  { a: "x" }, "b" in result === false
```

So `boundSkillSchema.parse(...)` can genuinely return an object carrying `description: undefined`,
which is not a valid `BoundSkill` when `description?: string` means what `exactOptionalPropertyTypes`
says it means. The annotation had been asserting something false; the flag opt-out was the only
reason nobody saw it.

The tempting fix is to widen fifteen domain types' optional properties to `?: T | undefined`. That
is the failure mode types-bible §4a names explicitly — "a type that admits `undefined` everywhere
is an optional property that no longer means anything" — and it would have touched roughly fifty
properties across `matrix.ts` and `config.ts`.

## Fix Applied

Zod 4.4 ships `.exactOptional()`, which is the schema-level statement of §4a's default: the key
stays optional and a present-but-undefined value is rejected. All 139 `.optional()` calls in
`lib/schemas.ts` became `.exactOptional()`, plus the local schemas in `build/marketplace.ts`,
`new/agent.tsx` and `utils/exec.ts`. Every `z.ZodType<T>` annotation now holds, and no domain type
was widened.

Two things were checked rather than assumed:

- **The generated JSON Schemas in `src/schemas/` are byte-identical.** JSON Schema has no way to
  express "present and undefined", so the published contract did not move.
- **It is a tightening, not a weakening.** `.exactOptional()` rejects an input the old schema
  accepted; it accepts nothing new.

**The behavioural edge, stated plainly because it is real:** a hand-written
`.claude-src/config.ts` containing `description: undefined` now fails to load with
`Invalid input: expected string, received undefined`, where it previously loaded with the key
silently present. The CLI's own generator never emits such a key — there are tests asserting it —
and JSON and YAML cannot represent `undefined` at all, so the reachable surface is a hand edit.
Full unit and e2e suites pass. It is a deliberate narrowing, not an accident.

## Proposed Standard

`typescript-types-bible.md` §4a should gain a fourth decision branch, since the first three all
describe objects you build by hand and say nothing about objects a parser builds for you:

> **4. It is a zod schema annotated `z.ZodType<T>` → `.exactOptional()`, not `.optional()`.**
> `.optional()` accepts and preserves an explicitly-undefined key, so the parsed value is
> `{ k?: V | undefined }` and the annotation is false under `exactOptionalPropertyTypes`.
> `.exactOptional()` keeps the key optional and rejects the undefined value, which is (a) applied
> at the parse boundary instead of the type. Widening `T`'s optional properties to satisfy the
> annotation is the reflex §4a already warns about — it moves the lie into the domain type, where
> every consumer inherits it.
>
> Check two things before adopting it on an existing schema: that the emitted JSON Schema is
> unchanged (it should be — JSON Schema cannot express the distinction), and that no caller
> `.parse()`s an object literal built from a maybe-value. The compiler catches the second for you,
> because `.exactOptional()` narrows the INPUT type too.
