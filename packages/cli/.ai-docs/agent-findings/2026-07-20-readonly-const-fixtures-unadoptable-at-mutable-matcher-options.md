---
type: standard-gap
severity: low
affected_files:
  - e2e/fixtures/expected-values.ts
  - e2e/matchers/project-matchers.ts
  - e2e/assertions/phase-assertions.ts
  - e2e/assertions/scope-assertions.ts
  - e2e/matchers/agent-matchers.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/test-data.md
date: 2026-07-20
reporting_agent: cli-tester
category: typescript
domain: e2e
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

The shared E2E fixture constants in `e2e/fixtures/expected-values.ts` are declared
`as const`, so their array members are `readonly` tuples:

- `E2E_AGENTS.WEB` is `readonly ["web-developer"]`
- `E2E_AGENTS.API` is `readonly ["api-developer"]`
- `E2E_SKILL_IDS` is a `readonly` tuple

Every option bag they would be passed into declares a **mutable** array:

- `project-matchers.ts` — `skillIds?: string[]`, `agents?: string[]`
- `phase-assertions.ts` — `skillIds?: string[]`, `agents?: string[]`,
  `compiledAgents?: string[]`, `copiedSkills?: string[]`
- `scope-assertions.ts` — `copiedSkills?: string[]`
- `agent-matchers.ts` — `skillIds?: string[]`

A `readonly T[]` is not assignable to `T[]`, so the natural adoption

```ts
await expect(result.project).toHaveConfig({ agents: E2E_AGENTS.WEB });
```

does not compile. It only works today at `E2E_AGENTS.WEB_AND_API`, and only by
accident: that member is a **getter** whose body returns
`[...this.API, ...this.WEB].sort()` — a freshly-built mutable array.

The practical effect is that the single-agent cases (by far the most common in
spec files) can only adopt the shared constant by spreading it at every call
site — `agents: [...E2E_AGENTS.WEB]` — which is more noise than the literal
`["web-developer"]` it replaces. So during the Pass 8 Cluster G adoption sweep
these constants were left unadopted at assertion sites, which is the opposite of
what phase 1 built them for.

## Fix Applied

None — discovery only. Adoption was skipped rather than forced, because the only
behaviour-preserving workaround available to a spec-file-only agent is a
per-call-site `[...spread]`, and the matcher/assertion option types are frozen
infra this pass.

## Proposed Standard

Widen the option-bag element types to `readonly string[]` in the four
assertion/matcher modules listed above. These options are read-only inputs —
none of the matchers mutate the array they receive — so `readonly string[]`
is strictly more permissive and cannot break any existing caller (`string[]`
is assignable to `readonly string[]`, not the other way round).

Add to `.ai-docs/standards/e2e/test-data.md`:

> **Matcher and assertion option bags take `readonly` arrays.** Any option that
> a matcher only reads (`skillIds`, `agents`, `compiledAgents`, `copiedSkills`,
> `contains`, `notContains`) must be declared `readonly string[]`, never
> `string[]`. Shared fixtures in `e2e/fixtures/expected-values.ts` are declared
> `as const` so their members are readonly tuples; a mutable parameter type
> makes those fixtures unadoptable and pushes specs back onto bare literals.

Related: the `as const satisfies` placement caveat recorded in
`2026-07-20-as-const-satisfies-on-object-with-getter-widens-return.md` is why
`E2E_AGENTS` uses per-member `satisfies`; that decision is correct and should
not be reverted to fix this — fix the consumer side instead.
