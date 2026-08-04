---
scope: reference
area: features
keywords:
  [
    built-in-catalogue,
    defaultStacks,
    defaultRules,
    default-stacks,
    default-rules,
    SHARED_TOOLING,
    Stack,
    StackAgentConfig,
    SkillAssignment,
    SkillRulesConfig,
    RelationshipDefinitions,
    ConflictRule,
    RequireRule,
    AlternativeGroup,
    CompatibilityGroup,
    Recommendation,
    mergeRelationships,
    convertStackToResolvedStack,
    resolveStack,
    resolveStackAgentSkills,
    loadStackById,
    loadStacks,
    normalizeAgentConfig,
    BUILT_IN_MATRIX,
    generate-source-types,
    config-exports,
    stacks-file-path,
    skill-rules-path,
  ]
related:
  - reference/features/skills-and-matrix.md
  - reference/features/configuration.md
  - reference/features/compilation-pipeline.md
  - reference/features/agent-system.md
  - reference/features/wizard-flow.md
  - reference/types/core-types.md
last_validated: 2026-08-02
---

<!-- VALIDATED 2026-08-02 · FULL (product 0.147.1) — NEW FILE.
     Every claim below was derived from source this session:
     src/cli/lib/configuration/default-stacks.ts, default-rules.ts, config-exports.ts,
     src/cli/types/{stacks,matrix,skills}.ts, src/cli/lib/stacks/stacks-loader.ts,
     src/cli/lib/loading/source-loader.ts, src/cli/lib/matrix/{skill-resolution,
     matrix-health-check,matrix-provider}.ts, src/cli/lib/installation/local-installer.ts,
     src/cli/components/wizard/{wizard,stack-selection,step-agents}.tsx,
     scripts/generate-source-types.ts, tsconfig.json, tsconfig.scripts.json, package.json,
     and both pinning tests (run, 1892 specs passing).
     Quantities were re-derived by evaluating the modules, not by counting source lines. -->

# Built-in Catalogue — `defaultStacks` and `defaultRules`

**Last Updated:** 2026-08-02
**Last Validated:** 2026-08-02

## Scope — this is the CLI's BUILT-IN fallback data, not a source repo's config

Two modules ship a complete stack catalogue and a complete skill-relationship graph **inside the
CLI**:

| Module                                            | Export              | What it is                                                                                  |
| ------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `src/cli/lib/configuration/default-stacks.ts`     | `defaultStacks`     | Every built-in stack the wizard's stack step can offer                                      |
| `src/cli/lib/configuration/default-rules.ts`      | `defaultRules`      | The entire built-in skill-relationship graph                                                |
| `src/cli/lib/configuration/default-categories.ts` | `defaultCategories` | Sibling; category definitions. Written up in [skills-and-matrix.md](./skills-and-matrix.md) |

Each file states its own role in its header comment: _"Built-in stack definitions, equivalent to
`config/stacks.ts`"_ and _"Built-in skill rules, equivalent to `config/skill-rules.ts`"_, both
followed by _"Source repos may override or extend these."_

**`config/stacks.ts` and `config/skill-rules.ts` are SOURCE-REPO paths. This repository has no
`config/` directory at all** — the names are the constants `STACKS_FILE_PATH` and
`SKILL_RULES_PATH` in `src/cli/consts.ts`, which the loader joins onto a **fetched or local skills
source's** base path. Naming that distinction is this document's main job:

- Docs that say stacks "are defined in `config/stacks.ts`" ([skills-and-matrix.md](./skills-and-matrix.md),
  [boundary-map.md](../boundary-map.md)) are describing the **source-repo** file. In this repo the
  data an agent is looking for is in `default-stacks.ts` / `default-rules.ts`.
- `package.json`'s `files` array still lists `"config/"`. There is no such directory; the entry
  publishes nothing. Do not read it as evidence the path exists here.
- The error thrown when a stack lookup fails says `Stack '<id>' not found in config/stacks.ts` and
  (in `local-installer.ts`) adds _"Available stacks are defined in the CLI's config/stacks.ts
  file."_ **That sentence is wrong**, and it is the single most likely reason an agent lands in the
  wrong file. The lookup that produced it searched `defaultStacks` too — see
  [Two stack lookups, two fallback rules](#two-stack-lookups-two-fallback-rules).

**This document owns the built-in catalogue's quantities** (stack count, per-relationship-kind rule
counts, assignment totals) per the count-ownership rule in `standards/documentation-bible.md`. No
other doc may restate them. It does **not** restate the `SkillId` / `SkillSlug` / `Category` union
sizes (owned by [type-system.md](../type-system.md)) or the `defaultCategories` size (owned by
[skills-and-matrix.md](./skills-and-matrix.md)).

## Export surface

Both are exported three ways, and the third is the mechanism behind "override or extend":

| Surface                                       | Consumer                                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Direct module import                          | `stacks-loader.ts`, `source-loader.ts`, `scripts/generate-source-types.ts`, the pinning tests |
| `src/cli/lib/configuration/index.ts` (barrel) | Internal; listed on the barrel surface in [configuration.md](./configuration.md)              |
| `src/cli/config-exports.ts`                   | **Public.** Published as `agents-inc/config` (`package.json` `exports` → `./config`)          |

`config-exports.ts` re-exports `defineConfig`, `defaultCategories`, `defaultRules`, `defaultStacks`
and the types `Stack`, `StackAgentConfig`, `CategoryMap`, `SkillRulesConfig`, `ProjectConfig`. A
source repo's own `config/stacks.ts` can therefore write
`import { defaultStacks } from "agents-inc/config"` and spread it. `config-loader.ts` makes this
work under jiti by aliasing `"agents-inc/config"` to the local `config-exports.ts`, so the import
resolves whether the source repo is loaded from disk in dev or from a fetched clone. The same map
still carries `"@agents-inc/cli/config"`, the spelling the package published under before 0.150.0,
so a source repo written against it keeps loading; REPO-24 in `todo/repo.md` tracks its removal.

## `defaultStacks`

### Shape

`defaultStacks: Stack[]`, with `Stack` declared in `src/cli/types/stacks.ts`:

| Field         | Type                                           | Notes                                                  |
| ------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `id`          | `string`                                       | Not `SkillId`-like; a free-form stack key              |
| `name`        | `string`                                       | Rendered in the stack step                             |
| `description` | `string`                                       | One-line summary of the stack's headline libraries     |
| `agents`      | `Partial<Record<AgentName, StackAgentConfig>>` | Per-agent skill assignment                             |
| `philosophy`  | `string \| undefined`                          | Optional on the type; **every built-in stack sets it** |

`StackAgentConfig = Partial<Record<Category, SkillAssignment[]>>` and
`SkillAssignment = { id: SkillId; preloaded?: boolean; local?: boolean; path?: string }`.

`AgentName`, `Category` and `SkillId` all come from `src/cli/types/generated/source-types.ts` — the
generated unions. That is load-bearing; see
[Trap 1](#trap-1--the-bootstrap-the-data-is-type-checked-against-its-own-previous-output).

### The built-in stacks

Listed rather than counted, so the claim self-checks against `grep '^    id: "'`:

| #   | `id`                         | Notes                                        |
| --- | ---------------------------- | -------------------------------------------- |
| 1   | `nextjs-fullstack`           | The reference stack; pinned by name in tests |
| 2   | `nextjs-t3-stack`            |                                              |
| 3   | `nextjs-supabase-fullstack`  |                                              |
| 4   | `nextjs-turborepo-fullstack` |                                              |
| 5   | `react-old-school`           | Smallest web stack (10 agents)               |
| 6   | `react-hono-fullstack`       |                                              |
| 7   | `remix-fullstack`            |                                              |
| 8   | `sveltekit-fullstack`        |                                              |
| 9   | `solidjs-fullstack`          | Pinned by name in tests                      |
| 10  | `astro-content-fullstack`    |                                              |
| 11  | `vue-modern-fullstack`       |                                              |
| 12  | `nuxt-fullstack`             |                                              |
| 13  | `angular-modern-fullstack`   | Pinned by name + philosophy in tests         |
| 14  | `nextjs-ai-saas`             |                                              |
| 15  | `nextjs-saas-starter`        |                                              |
| 16  | `expo-mobile-fullstack`      |                                              |
| 17  | `cli-ink-oclif`              | Only CLI-shaped stack; 8 agents              |

**17 stacks.** `default-stacks.test.ts` pins that number in `EXPECTED_STACK_COUNT`, so adding or
removing a stack fails the unit suite (and therefore the `pre-commit` hook, which runs
`bun run test`) until the constant is updated deliberately.

### Structural invariants

Stated as facts, each verified by evaluating the module:

1. **Array order is UI order.** No built-in stack sets `group`, and `Stack` has no `group` field to
   set — only `ResolvedStack` declares `group?`. `stack-selection.tsx`'s `groupStacks` therefore
   takes its `sortedLabels.length === 0` branch and renders one flat, header-less list in
   `defaultStacks` order. A new stack cannot be grouped without changing `Stack`, `ResolvedStack`'s
   producers, or both.
2. **Every assignment is already in normalized form.** All 1997 `SkillAssignment` entries are
   objects with an **explicit** `preloaded` key (163 of them `true`). This is what the header
   comment means by _"All values are already in normalized form (`SkillAssignment[]` with
   `{ id, preloaded }`)"_, and it is why `defaultStacks` **bypasses normalization entirely**: the
   `normalizeAgentConfig` / `normalizeStackRecord` pass in `stacks-loader.ts` — which widens bare
   strings to `{ id, preloaded: false }` and wraps single values in arrays — runs only on a
   Zod-parsed `config/stacks.ts` inside `loadStacks`, and on a loaded project config. Nothing calls
   it on `defaultStacks`. **Authoring a bare string or a non-array value here compiles under
   neither the type nor the tests, and no runtime pass will fix it up.**
3. **`SHARED_TOOLING` is one array, aliased 46 times.** The module hoists
   `const SHARED_TOOLING: SkillAssignment[]` (eslint-prettier, typescript-config, git-hooks) and
   references it from 46 agent slots across the catalogue. Those slots hold the **same array
   object**, verified by identity: the `shared-tooling` value on `nextjs-fullstack`'s
   `web-developer` and the one on `cli-ink-oclif`'s `cli-developer` are `===`. Two consequences:
   editing the constant edits every stack that uses it, and **no code may mutate a
   `StackAgentConfig` array in place.** Nothing
   does today (`resolveStackAgentSkills` and `resolveStack` both build new arrays with
   `filter`/`map`), and the aliasing is why nothing may start.
4. **17 distinct agent names, 31 distinct categories, 53 distinct skill ids.** Five agents
   (`web-researcher`, `web-pm`, `skill-summoner`, `codex-keeper`, `agent-summoner`) appear in all 17
   stacks; the `cli-*` trio appears in 8. Per-stack agent counts run 8, 10, 14 or 17. Every agent
   name is a built-in, so `step-agents.tsx`'s `buildAgentGroups` finds no custom agent ids in
   `suggestedStacks` and returns `BUILT_IN_AGENT_GROUPS` unchanged.

## `defaultRules`

### Shape

`defaultRules: SkillRulesConfig` — `{ version: "1.0.0", relationships: RelationshipDefinitions }`,
both declared in `src/cli/types/matrix.ts`. **Every rule references skills by `SkillSlug`
(`"react"`, `"zustand"`), never by `SkillId`.** Slugs are resolved to canonical ids during the merge
step via `slugMap.slugToId`.

The six relationship kinds, their effects and their enforcement are tabulated in
[skills-and-matrix.md → Relationship System](./skills-and-matrix.md#relationship-system) — not
repeated here. What this document adds is **where the built-in instances live and what shape they
take**:

| Kind             | Entry type                              | Entry shape                                        | Built-in entries |
| ---------------- | --------------------------------------- | -------------------------------------------------- | ---------------- |
| `conflicts`      | `ConflictRule` = `SkillGroupRule`       | `{ skills: SkillSlug[]; reason: string }`          | 28               |
| `discourages`    | `DiscourageRule` = `SkillGroupRule`     | `{ skills; reason }`                               | **0**            |
| `compatibleWith` | `CompatibilityGroup` = `SkillGroupRule` | `{ skills; reason }`                               | 39               |
| `recommends`     | `Recommendation`                        | `{ skill: SkillSlug; reason: string }`             | 26               |
| `requires`       | `RequireRule`                           | `{ skill; needs: SkillSlug[]; needsAny?; reason }` | 50               |
| `alternatives`   | `AlternativeGroup`                      | `{ purpose: string; skills: SkillSlug[] }`         | 42               |

Declaration order in the object literal is `conflicts`, `discourages`, `compatibleWith`,
`recommends`, `requires`, `alternatives` — it does **not** match the field order in
`RelationshipDefinitions`. `compatibleWith` is the only optional field on that type; `defaultRules`
supplies it.

### Invariants and dead fields

1. **`discourages` is deliberately empty**, and `default-rules.test.ts` pins it empty with the
   reason in the spec name: _"conflicts prevent co-selection"_. Everything that would be a soft
   warning is already a hard conflict. An empty array here is the intended state, not a gap.
2. **`alternatives` groups carry no `reason`.** `AlternativeGroup` is `{ purpose, skills }` — it is
   the one kind that is not a `SkillGroupRule`. `purpose` is what surfaces
   (`SkillAlternative = { skillId, purpose }`).
3. **`compatibleWith`'s `reason` is authored but discarded.** `collectSymmetricGroupMembers` lifts
   the rule alongside each member for every symmetric kind, but the `compatibleWith` mapping keeps
   `memberId` only, and `ResolvedSkill.compatibleWith` is a bare `SkillId[]`. The 39 reason strings
   are documentation for the next editor of this file and reach no UI. Do not delete them as dead
   weight; do not expect them to render either.
4. **34 of the 50 `requires` rules set `needsAny: true`** (OR semantics — "any one of `needs`").
   The default is AND. The canonical example — pinned field-for-field by the test — is the
   `zustand` rule, whose `needs` lists `react`, `nextjs`, `remix` and `react-native` with
   `needsAny: true`.
5. **Every slug the built-in rules name currently resolves.** The rules reference 129 distinct
   slugs, and all 129 are present in `BUILT_IN_MATRIX.slugMap.slugToId`. This is a currently-true
   property, **not an enforced one** — see
   [Trap 3](#trap-3--nothing-fails-when-the-catalogue-goes-stale).

## Precedence — how a source repo overrides or extends

The three built-in datasets have **three different precedence rules**. This is the single most
error-prone area of the module, because "the source wins" is true of all three in different senses.
All three decisions are made in `loadAndMergeFromBasePath` (`src/cli/lib/loading/source-loader.ts`):

| Dataset             | Source file                  | Rule                                                                          | Can the source REMOVE a built-in? |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| `defaultCategories` | `config/skill-categories.ts` | `{ ...defaultCategories, ...sourceCategories }` — per-key override            | Only by redefining the key        |
| `defaultRules`      | `config/skill-rules.ts`      | `mergeRelationships(source, defaults)` — **concatenation**, source first      | **No**                            |
| `defaultStacks`     | `config/stacks.ts`           | `sourceStacks.length > 0 ? sourceStacks : defaultStacks` — **all-or-nothing** | **Yes — all of them, at once**    |

### `mergeRelationships` is additive, and "source first" means less than it sounds

`mergeRelationships` concatenates each of the six lists with the source's entries in front. It
performs no dedupe, no keying, and no removal. **A source repo cannot suppress a built-in rule** —
it can only add rules that also apply. A source shipping a `skill-rules.ts` gets its own rules
_plus_ all of `defaultRules`.

The helper's own comment says source rules "win first-match lookups". That is exactly true for one
kind and approximately true for the rest — worth recording because the difference decides whether a
source repo can actually change behaviour:

| Kind                                                         | Resolution                                               | What "source first" buys                                                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `recommends`                                                 | `.find(r => r.skill === slug)` — genuine first match     | The source's `reason` wins outright; the built-in entry is never read                                                    |
| `conflicts`, `discourages`, `compatibleWith`, `alternatives` | `flatMap` over **all** groups, then `uniqueBy(memberId)` | Every group still contributes members; source-first only decides whose `reason`/`purpose` annotation survives the dedupe |
| `requires`                                                   | loop pushing **every** matching rule; no dedupe          | Nothing — both the source's and the built-in's requirement apply                                                         |

**So: a source repo can restate a recommendation, and can re-annotate a conflict, but cannot relax
one.** Adding a conflicting source rule makes the union stricter, never looser.

### Two stack lookups, two fallback rules

`defaultStacks` is consulted from two places with **different** semantics, and they disagree:

| Entry point                                              | Rule                                                                        | Effect                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `loadAndMergeFromBasePath` (`source-loader.ts`)          | `sourceStacks.length > 0 ? sourceStacks : defaultStacks`                    | **Whole-catalogue swap.** One stack in the source hides all 17 built-ins from the wizard      |
| `loadStackById(stackId, configDir)` (`stacks-loader.ts`) | source `loadStacks` first, then `defaultStacks.find(s => s.id === stackId)` | **Per-id fallback.** A built-in stack stays resolvable by id even when the source has its own |

Consequence: with a source that ships stacks, `matrix.suggestedStacks` contains only that source's
stacks (so the wizard cannot offer `nextjs-fullstack`), yet `loadStackById("nextjs-fullstack", …)`
still returns it. The eject path (`local-installer.ts`) and the stack→plugin compiler
(`stack-plugin-compiler.ts`) use the per-id form; the wizard uses the swapped array. **When the
lookup does fail, both throw a message naming only `config/stacks.ts`** — the file that was searched
first, not the fallback that was searched second.

## Data flow — two paths, and the one users actually take

### Path A — generation (dominant)

```
scripts/generate-source-types.ts
  Phase 1 -> src/cli/types/generated/source-types.ts   (SkillId, SkillSlug, Category, Domain, AgentName + skillIdSet)
  Phase 2 -> src/cli/types/generated/matrix.ts         (BUILT_IN_MATRIX)
       mergeMatrixWithSkills(defaultCategories, defaultRules.relationships, skills)
       matrix.suggestedStacks = defaultStacks.map(stack => resolveStack(stack, skillIdSet))
```

Run by `npm run generate:types` (`bun scripts/generate-source-types.ts`).

`source-loader.ts::resolveBaseResult` short-circuits to `BUILT_IN_MATRIX` whenever
`source === DEFAULT_SOURCE && !devMode`. **`devMode` has no production writer** — grep finds it only
inside `source-loader.ts` itself and in one unit spec, and it defaults to `false`. So for the
default marketplace, which is the overwhelmingly common case, the user gets the **baked** matrix and
`defaultStacks` / `defaultRules` are never executed at runtime at all.

> **This is the most important operational fact in this document.** Editing `default-stacks.ts` or
> `default-rules.ts` has **no effect on a default-source user** until `generate:types` is re-run and
> `src/cli/types/generated/matrix.ts` is committed. The edit will pass typecheck, lint, and the
> pinning tests, and change nothing the user sees.

### Path B — runtime resolution

Reached for a local source, an explicitly non-default remote source, or the (unused) dev mode:

```
loadAndMergeFromBasePath(basePath)
  categories     = { ...defaultCategories, ...sourceCategories }
  relationships  = sourceRules ? mergeRelationships(source, defaultRules.relationships) : defaultRules.relationships
  mergeMatrixWithSkills(categories, relationships, skills)     -- rules DISSOLVE here
  stacks         = sourceStacks.length > 0 ? sourceStacks : defaultStacks
  matrix.suggestedStacks = stacks.map(convertStackToResolvedStack)
```

**`defaultRules` has no read model.** `MergedSkillsMatrix` carries no `relationships` field: the
rules are consumed exactly once, by `mergeMatrixWithSkills`, and dissolved into per-skill
`conflictsWith` / `discourages` / `compatibleWith` / `requires` / `alternatives` / `isRecommended` /
`recommendedReason` on each `ResolvedSkill`. Nothing downstream can ask "what rules were loaded?" —
which is also why `BUILT_IN_MATRIX` bakes the **resolved relations**, not the rules.

### `resolveStack` vs `convertStackToResolvedStack` — not equivalent

`resolveStack`'s JSDoc says it is _"Equivalent to `convertStackToResolvedStack` in source-loader.ts
but uses `skillIdSet` instead of `isValidSkillId()`"_. There is a **second** difference, and it is
observable:

| Field                    | `resolveStack` (generation)                    | `convertStackToResolvedStack` (runtime)                                        |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `skills` (per-agent/cat) | filtered by `skillIdSet.has(id)`               | filtered by `id in currentMatrix.skills` (`resolveStackAgentSkills`)           |
| `allSkillIds`            | derived **from the already-filtered** `skills` | derived from `resolveAgentConfigToSkills`, which **warns but does not filter** |
| Unknown-id handling      | silent drop                                    | dropped from `skills`, **kept** in `allSkillIds`, one `warn` per occurrence    |

So on the runtime path a stale id vanishes from `ResolvedStack.skills` but survives in
`ResolvedStack.allSkillIds`, making `allSkillIds` a superset rather than a flattening. That matters
because `allSkillIds` is what the wizard actually seeds selections from: `stack-selection.tsx`
merges `focusedStack.allSkillIds` with the global preselections and hands the union to
`populateFromSkillIds`, and `wizard.tsx::resolveSelectedSkillIds` returns `[...stack.allSkillIds]`
for the stack-defaults branch. On the generated path the two fields agree by construction.

## Consumers

| Consumer                                                 | Reads               | Purpose                                                               |
| -------------------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| `scripts/generate-source-types.ts`                       | both                | Bakes `BUILT_IN_MATRIX` (relations + `suggestedStacks`)               |
| `lib/loading/source-loader.ts`                           | both                | Runtime merge for non-default sources                                 |
| `lib/stacks/stacks-loader.ts::loadStackById`             | `defaultStacks`     | Per-id fallback after the source's `config/stacks.ts`                 |
| `lib/configuration/index.ts` barrel, `config-exports.ts` | both                | Internal and public re-export                                         |
| `components/wizard/stack-selection.tsx`                  | via matrix          | Renders `matrix.suggestedStacks`; seeds selections from `allSkillIds` |
| `components/wizard/wizard.tsx`                           | via matrix          | `resolveSelectedSkillIds` under stack-defaults                        |
| `components/wizard/step-agents.tsx`                      | via matrix          | Derives custom-agent ids from `stack.skills` keys                     |
| `lib/matrix/matrix-provider.ts::findStack`               | via matrix          | `suggestedStacks.find(s => s.id === stackId)`                         |
| `lib/installation/local-installer.ts`                    | via `loadStackById` | Eject-config build; throws the misleading `config/stacks.ts` message  |
| `lib/stacks/stack-plugin-compiler.ts`                    | via `loadStackById` | Stack→plugin compilation                                              |

## Test surface

| File                                                             | Pins                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/cli/lib/configuration/__tests__/default-stacks.test.ts`     | `EXPECTED_STACK_COUNT`; three stacks by name/description/philosophy; `it.each` over every stack for non-empty required fields; `it.each` over every (stack, agent, category) triple asserting `SkillAssignment[]` shape; one preloaded assertion |
| `src/cli/lib/configuration/__tests__/default-rules.test.ts`      | `version`; the exact sorted key set of `relationships`; a length for `conflicts` / `recommends` / `requires` / `alternatives`; one representative entry per kind; `discourages` empty                                                            |
| `src/cli/lib/configuration/__tests__/default-categories.test.ts` | Sibling. Pins the count **and** asserts key-for-key equality with the generated `CATEGORIES` union                                                                                                                                               |

The stack file's two `it.each` blocks expand to roughly 1.9k specs — nearly the whole cost of the
two files. Both run in the unit suite, which the `pre-commit` hook executes.

**Two gaps, both closeable and both currently passing if closed:**

1. **Nothing cross-checks either file against the generated matrix.** `default-categories.test.ts`
   has exactly that assertion (`keys` vs `CATEGORIES`); its two siblings do not. No test asserts
   that every `defaultStacks` skill id exists in `BUILT_IN_MATRIX.skills`, or that every rule slug
   resolves through `BUILT_IN_MATRIX.slugMap`. Both hold today — 53/53 ids and 129/129 slugs,
   verified this session — so the assertions would pass on the day they are written.
2. **`compatibleWith` is the one relationship kind with no length assertion**, while the other five
   are pinned. Adding or dropping a compatibility group is currently silent.

## Traps

### Trap 1 — the bootstrap: the data is type-checked against its own previous output

`defaultStacks` is typed with `SkillId`, `Category` and `AgentName`; `defaultRules` with
`SkillSlug`. All four come from `src/cli/types/generated/source-types.ts`, which
`scripts/generate-source-types.ts` writes — the same script that consumes both files. **The
generator's inputs are type-checked against the generator's previous output.** A committed
`defaultStacks` entry can therefore legitimately name a skill the current source no longer provides.

The failure order is what makes this quiet:

1. The upstream source drops skill `X`.
2. `bun run generate:types` runs. Bun strips types without checking, so nothing complains. Phase 1
   rewrites the unions without `X`; Phase 2's `resolveStack` **silently drops** `X` from every stack
   that named it — no warning, no non-zero exit. The stack ships smaller.
3. Only the _next_ `npm run typecheck` fails, on `default-stacks.ts`, because `"X"` is no longer a
   `SkillId`.

The artefact is already wrong before the type error appears. Note also that `tsconfig.json`'s
`include` is `["src/**/*"]`, so `scripts/**` is covered only by `typecheck:scripts`
(`tsconfig.scripts.json`), which is **not** in `prepublishOnly` and not in the pre-commit hook.
Recorded upstream as `as-any-on-valid-union-members-is-noise-that-hides-two-fabrications` in
[findings-impact-report.md](../findings-impact-report.md) (Pattern R).

### Trap 2 — an edit here is invisible without regeneration

See [Path A](#path-a--generation-dominant). Re-run `npm run generate:types` and commit
`src/cli/types/generated/matrix.ts` (and `source-types.ts` if the skill set moved). A stack or rule
edit that skips this changes nothing for default-source users while passing every gate.

### Trap 3 — nothing fails when the catalogue goes stale

Neither a stale stack skill id nor a stale rule slug produces an error:

| Staleness                                           | What happens                                                                                                                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack names a skill not in the matrix               | Generation: silent drop. Runtime: dropped from `skills`, kept in `allSkillIds`, one `warn` from `resolveAgentConfigToSkills` (suppressed in tests) |
| Rule names an unresolvable slug                     | `resolveToCanonicalId` logs `Unresolved slug '<slug>' … — skipping` and returns `null`; `resolveSlugsOrSkip` filters it out                        |
| A `requires` rule whose `needs` all fail to resolve | The whole rule is dropped (`resolvedNeeds.length === 0` → `continue`)                                                                              |

`checkMatrixHealth` does **not** close this. It inspects only `compatibleWith`, `conflictsWith` and
`requires` on already-**resolved** skills — references that survived resolution by definition — and
it never looks at `suggestedStacks` at all. Slug resolution failures are gone before the health
check runs.

### Trap 4 — do not restate `preloaded` semantics here

`preloaded: true` embeds a skill's content in the compiled agent prompt; `false` loads it via the
Skill tool at runtime. That split, and the `pluginRef` form each takes, are owned by
[compilation-pipeline.md](./compilation-pipeline.md) (D-217 per-skill `pluginRef`) and
[agent-system.md](./agent-system.md) (`buildAgentTemplateContext`, `preloadedSkillIds`). This
document records only the shape (`preloaded` is explicit on every built-in assignment) and the
distribution (163 of 1997 true).

### Trap 5 — editing `SHARED_TOOLING` edits 46 slots

It is one shared array reference, not 46 copies. Adding an entry adds it to every stack that names
the constant. If a stack needs different tooling, give it its own literal rather than mutating or
slicing the shared one — see [invariant 3](#structural-invariants).
