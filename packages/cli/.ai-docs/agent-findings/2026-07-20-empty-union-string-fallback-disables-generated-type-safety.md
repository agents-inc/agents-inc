---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/configuration/config-types-writer.ts
  - src/cli/lib/configuration/config-writer.ts
  - src/cli/lib/configuration/__tests__/config-types-writer.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: "config-types-writer.ts now emits `never` (named constant EMPTY_UNION_TYPE) for an empty member list, aligning with generateBlankGlobalConfigTypesSource; four unit assertions that pinned the `string` fallback were flipped."
---

## What Was Wrong

Two generators produce `config-types.ts` for the **same** empty state, and they
disagreed about what an empty install means:

- `generateBlankGlobalConfigTypesSource` (config-writer.ts) emitted `never`.
- `formatUnion` / `formatMaybeSectionedUnion` / `formatSectionedUnion`
  (config-types-writer.ts) emitted the literal `"string"`.

`string` is the _absorbing_ element of a union, not the identity element. Once
the global `config-types.ts` said `export type SkillId = string`, the project
file that extends it (`SkillId = GlobalSkillId | "web-framework-react"`)
collapsed back to `string`, so the generated aliases accepted every value. The
entire purpose of these files — making a hand-edited `config.ts` fail `tsc` when
it names something that is not installed — was silently disabled.

This fires on a real, ordinary flow: a project-scope install leaves the GLOBAL
partition with `skills: []`, and `writeScopedConfigs` still hands that empty
partition to `writeStandaloneConfigTypes`.

Two things let it survive:

1. **A silent fallback that returns a plausible-looking wrong value.** The same
   `return "string"` was written in three separate places. `never` was the
   correct identity element in all three.
2. **The unit tests asserted the defect.** Four tests were literally named
   `falls back to string for empty skills/agents/domains/categories`, so the
   suite defended the bug. The sibling suite (`config-writer.test.ts`) asserted
   `never` for the identical state. Neither test knew about the other.

## Fix Applied

Introduced a named constant in `config-types-writer.ts` that states the
invariant once, and used it at all three sites:

```ts
const EMPTY_UNION_TYPE = "never";
```

Verified with real `tsc` (not by inspection) that `never` is correct for every
consumer, which was the crux question:

- `never | "web-testing-vitest"` reduces to `"web-testing-vitest"` — the project
  file that extends an empty global union still narrows, and a legitimate
  project `config.ts` type-checks clean.
- A global `config.ts` with `skills: []` type-checks clean against
  `SkillId = never`; `Partial<Record<never, …>>` is `{}`, and
  `splitConfigByScope` already filters the global stack down to global skills,
  so an empty-skills global partition never carries a stack to reject.

Flipped the four unit assertions **and their test names** — a test named
"falls back to string" would still have been lying even with a corrected
assertion body.

## Proposed Standard

Two rules, both worth adding to CLAUDE.md's existing NEVER lists:

1. **Under "Data Integrity"** (next to the existing no-silent-fallbacks rule):

   > NEVER emit `string` as the fallback for an empty generated union. The
   > identity element of a union is `never`. `string` absorbs every literal and
   > silently disables the type safety the generated file exists to provide.

2. **Under "Test Assertions"**:

   > NEVER write a test whose NAME asserts a fallback value (`falls back to
string for empty X`). Name the behaviour the code must have, not the value
   > it currently returns. A test named after a defect defends that defect.

Additionally, a structural gap worth closing: the e2e suite asserted the
generated **type text** but never type-checked it. A union that degrades to
`string` looks perfectly healthy in a `toContain` assertion. The new
`e2e/helpers/type-check-probe.ts` closes this by running `tsc` against the
generated aliases and asserting a bogus literal is rejected — future specs about
generated types should assert the _property_ (does it reject?) rather than the
printed text.
