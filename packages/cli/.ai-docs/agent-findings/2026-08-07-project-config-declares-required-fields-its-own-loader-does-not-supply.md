---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/src/cli/lib/configuration/project-config.ts
  - packages/cli/src/cli/lib/schemas.ts
  - packages/cli/src/cli/types/config.ts
  - packages/cli/src/cli/lib/wizard/build-step-logic.ts
  - packages/cli/src/cli/lib/configuration/config-writer.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  Code side landed for ProjectConfig.agents (the loader now supplies it, and ~20 dead `?? []`
  guards were deleted). CategoryDefinition.order/required/exclusive is CLOSED 2026-08-19 — the
  three disables and defaults are gone and the two red tests were the defect, not the evidence;
  see the update at the foot of this file. config-writer's `as unknown[]` was reordered rather
  than disabled. No bible section written.
---

## What Was Wrong

`ProjectConfig` declares `skills: SkillConfig[]` and `agents: AgentScopeConfig[]` as required.
`projectConfigLoaderSchema` makes both optional, and `loadProjectConfigFromDir` ends with
`as ProjectConfig` — so a `config.ts` with no `agents:` key produced a value whose type said the
array was there and whose runtime said otherwise.

Callers had been paying for the gap in cash: `config.agents ?? []` at four sites in `doctor.ts`,
`(loaded.config.agents ?? []).length` in `installation.ts`, `oldConfig?.agents?.map(...)` in
`edit.tsx`, and more. Every one of them is a guard the compiler calls dead and the data requires.
The loader repaired `name` and `skills` by mutation AFTER the cast and simply never repaired
`agents` — a two-out-of-three fix that reads as complete.

Turning on `no-unnecessary-condition` (CLI-422) is what surfaced it: the rule flags precisely the
guards a lying type makes look redundant, and this was the largest cluster of them.

**The class is wider than this one type.** Two more instances found in the same pass, both left as
documented disables because the honest fix cascades:

- `CategoryDefinition.order / required / exclusive` are declared required, but a category
  auto-synthesized for a custom skill arrives without them. `build-step-logic.ts` has
  `cat.order ?? 0`, `cat.required ?? false`, `cat.exclusive ?? true`, and there are unit tests
  asserting each default fires. Deleting them on the rule's word turned two tests red.
- `config-writer.ts`'s `extractConfigArrays` reads a `Record<string, unknown>` produced by a
  JSON round-trip. Writing `(cleaned.skills as unknown[]) ?? []` puts the cast BEFORE the `??`,
  so the checker sees a non-nullish value and calls the `??` dead — while the round-trip really
  does drop any key whose value was undefined. Deleting those three `??` broke 64 tests in one
  file. The fix is ordering: coalesce first, cast second.

## Fix Applied

`loadProjectConfigFromDir` now builds its result with the defaults applied in the literal —
`name`, `skills` AND `agents` — instead of casting and then mutating two of the three. The
declared type is true for every value the loader returns, and the ~20 `?? []` / `?.` guards that
existed only to cover the gap are deleted (`doctor.ts`, `installation.ts`, `edit.tsx`,
`init.tsx`, `uninstall.tsx`, `compile-agents.ts`, `config-types-writer.ts`, `plugin-info.ts`,
`propagate.ts`, `config-merger.ts`).

`config-writer.ts` was reordered to `(cleaned.skills ?? []) as unknown[]`, with a comment saying
the order is the point.

`build-step-logic.ts` keeps its three defaults with an `eslint-disable-next-line` each, naming
the reason: the type is stricter than the data. That is a marker, not a fix.

## Proposed Standard

`typescript-types-bible.md` should carry a section — **"A cast is a promise the caller has to
keep"** — with three rules:

1. A function returning `T` via `as T` from a leniently-parsed value MUST supply every field `T`
   declares required, in the same expression that performs the cast. Repairing fields by mutation
   after the cast is how two of three get repaired and the third does not: the compiler is
   satisfied at the cast, so nothing marks the omission.
2. When a `??` or `?.` guards a value that a cast has already widened, the coalesce goes FIRST.
   `(x ?? []) as T[]` and `(x as T[]) ?? []` differ only in whether the guard still runs — and
   the second reads as correct while being dead.
3. A `no-unnecessary-condition` report on a `??` over a _declared-required_ field is evidence
   about the DECLARATION, not about the guard. Check what the producing boundary actually
   supplies before deleting anything. This pass found three such clusters and only one of them
   was a genuinely dead guard.

## Update — 2026-08-19 (cli-developer), the CategoryDefinition half

Closed, by deleting the three defaults. The reason the disables gave — that "a category
auto-synthesized for a custom skill arrives without them" — is not true of any producer:
`synthesizeCategory` supplies all three (`exclusive: false`, `required: false`,
`order: AUTO_SYNTH_ORDER`), `defaultCategories` is `as const satisfies Record<Category, …>`, the
local-skill category `source-loader.ts` adds spells all three out, and both parse boundaries —
`categoryDefinitionSchema` here and `packages/matrix`'s schema — declare them non-optional. The
type is not stricter than the data; the comment was.

**The two tests that turned red are the part worth carrying forward.** This finding read them as
evidence that the defaults fire, and they are the opposite: each is driven by a fixture that
destructures a required field off a `TEST_CATEGORIES` entry (`FRAMEWORK_WITHOUT_FLAGS`,
`FRAMEWORK_WITHOUT_ORDER`) and feeds it through `buildCategoryMap`, whose parameter is
`Partial<Record<Category, Partial<CategoryDefinition>>>` and whose body is a cast. A fixture that
can construct a value the type forbids can make any dead branch look reachable, and a spec written
over it reads as coverage. Both specs and both fixtures are deleted.

So the rule the bible section needs has a second half: when a type-aware lint verdict disagrees
with a test, check whether the test's FIXTURE could exist — a red test is only evidence if its
input is producible. Reaching for a disable at that moment records the disagreement instead of
settling it.
