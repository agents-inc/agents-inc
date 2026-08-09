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
last_validated: 2026-08-09
---

# Built-in Catalogue — `defaultStacks` and `defaultRules`

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
- `package.json`'s `files` array no longer lists `"config/"` — it publishes `dist/`, `assets/`,
  `src/agents/`, `src/schemas/` and the three top-level files. Nothing in this package's manifest
  implies a `config/` directory any more.
- The error thrown when a stack lookup fails no longer names `config/stacks.ts` at all. Both
  callers throw `stackNotOfferedMessage(stackId, source)` — _"Stack '\<id\>' is not a stack the
  source '\<source\>' offers"_ — which names the id asked for and the source asked, and says the
  built-ins belong to the default public marketplace alone. See
  [Two stack lookups, one fallback rule](#two-stack-lookups-one-fallback-rule).

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
| 5   | `react-old-school`           | Smallest stack in the catalogue (8 agents)   |
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
| 17  | `cli-ink-oclif`              | Only CLI-shaped stack; 10 agents             |

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
2. **Every assignment is already in normalized form, and none of them states a load.** All 1542
   `SkillAssignment` entries are objects, and not one carries a
   `preloaded` key: a built-in stack declares WHICH skills a sub-agent gets, and `PRELOAD_DEFAULTS`
   in `@workspace/matrix` answers how each `(skill, agent)` pair loads. `buildStackProperty`
   resolves the unflagged entries against it when a stack is applied, so the flag survives only
   where it is somebody's word — a user's saved config, or a third-party source's own stacks file.
   Being objects is what the header comment means by _"All values are already in normalized
   form (`SkillAssignment[]`)"_, and it is why `defaultStacks` **bypasses normalization entirely**: the
   `normalizeAgentConfig` / `normalizeStackRecord` pass in `stacks-loader.ts` — which widens bare
   strings to `{ id, preloaded: false }` and wraps single values in arrays — runs only on a
   Zod-parsed `config/stacks.ts` inside `loadStacks`, and on a loaded project config. Nothing calls
   it on `defaultStacks`. **Authoring a bare string or a non-array value here compiles under
   neither the type nor the tests, and no runtime pass will fix it up.**
3. **Two hoisted arrays, each aliased 47 times.** The module hoists
   `const SHARED_TOOLING: SkillAssignment[]` (typescript-config, git-hooks) and
   `const SHARED_LINT: SkillAssignment[]` (eslint-prettier), and references each from 47 agent
   slots across the catalogue — `SHARED_TOOLING` under the `shared-tooling` category,
   `SHARED_LINT` under `shared-lint`. Those slots hold the **same array
   object**, verified by identity: the `shared-tooling` value on `nextjs-fullstack`'s
   `web-developer` and the one on `cli-ink-oclif`'s `cli-developer` are `===`, and so are the two
   `shared-lint` values. Two consequences:
   editing either constant edits every stack that uses it, and **no code may mutate a
   `StackAgentConfig` array in place.** Nothing
   does today (`resolveStackAgentSkills` and `resolveStack` both build new arrays with
   `filter`/`map`), and the aliasing is why nothing may start.
4. **13 distinct agent names, 35 distinct categories, 53 distinct skill ids.** Six agents
   (`web-researcher`, `pm`, `reviewer`, `skill-summoner`, `codex-keeper`, `agent-summoner`)
   appear in all 17 stacks — `reviewer` and `pm` are single consolidated role agents holding each
   stack's whole reviewing and planning block, and no per-domain reviewer or PM name exists in
   `AGENT_NAMES` to assign; `web-developer` and `web-tester` appear
   in 16, `api-developer` and `api-researcher` in 15, `cli-developer` and `cli-tester` in the same
   8; `cli-researcher` appears only in `cli-ink-oclif`. Per-stack agent counts run 8, 9, 10 or 12.
   Five of the 18 `AGENT_NAMES` are on no stack at all: the three `ai-*` agents, `api-tester` and
   `convention-keeper` — so an AI-domain agent selected in the wizard starts with an empty
   stack. Every agent name used is a built-in, so `step-agents.tsx`'s
   `buildAgentGroups`
   finds no custom agent ids in `suggestedStacks` and returns `BUILT_IN_AGENT_GROUPS` unchanged.

## `defaultRules`

### Shape

`defaultRules: SkillRulesConfig` — `{ version: "1.0.0", relationships: RelationshipDefinitions }`,
both declared in `src/cli/types/matrix.ts`. **Every rule references skills by `SkillSlug`
(`"react"`, `"zustand"`), never by `SkillId`.** Slugs are resolved to canonical ids during the merge
step via `slugMap.slugToId`.

The four relationship kinds, their effects and their enforcement are tabulated in
[skills-and-matrix.md → Relationship System](./skills-and-matrix.md#relationship-system) — not
repeated here. What this document adds is **where the built-in instances live and what shape they
take**:

| Kind           | Entry type                          | Entry shape                                        | Built-in entries |
| -------------- | ----------------------------------- | -------------------------------------------------- | ---------------- |
| `conflicts`    | `ConflictRule` = `SkillGroupRule`   | `{ skills: SkillSlug[]; reason: string }`          | 12               |
| `discourages`  | `DiscourageRule` = `SkillGroupRule` | `{ skills; reason }`                               | **0**            |
| `requires`     | `RequireRule`                       | `{ skill; needs: SkillSlug[]; needsAny?; reason }` | 98               |
| `alternatives` | `AlternativeGroup`                  | `{ purpose: string; skills: SkillSlug[] }`         | 42               |

Declaration order in the object literal is `conflicts`, `discourages`, `requires`,
`alternatives` — it does **not** match the field order in `RelationshipDefinitions`. Every field on
that type is required, and `defaultRules` supplies all four.

### Invariants and dead fields

1. **`discourages` is deliberately empty**, and `default-rules.test.ts` pins it empty with the
   reason in the spec name: _"conflicts prevent co-selection"_. Everything that would be a soft
   warning is already a hard conflict. An empty array here is the intended state, not a gap.
2. **`alternatives` groups carry no `reason`.** `AlternativeGroup` is `{ purpose, skills }` — it is
   the one kind that is not a `SkillGroupRule`. `purpose` is what surfaces
   (`SkillAlternative = { skillId, purpose }`).
3. **61 of the 98 `requires` rules set `needsAny: true`** (OR semantics — "any one of `needs`").
   The default is AND. The canonical example — pinned field-for-field by the test — is the
   `zustand` rule, whose `needs` lists `react`, `nextjs`, `remix` and `react-native` with
   `needsAny: true`.
4. **Every slug the built-in rules name currently resolves.** The rules reference 176 distinct
   slugs, and all 176 are present in `BUILT_IN_MATRIX.slugMap.slugToId`. This is a currently-true
   property, **not an enforced one** — see
   [Trap 3](#trap-3--nothing-fails-when-the-catalogue-goes-stale).

## Precedence — how a source repo overrides or extends

The three built-in datasets have **three different precedence rules**. This is the single most
error-prone area of the module, because "the source wins" is true of all three in different senses.
All three decisions are made in `loadAndMergeFromBasePath` (`src/cli/lib/loading/source-loader.ts`):

| Dataset             | Source file                  | Rule                                                                              | Can the source REMOVE a built-in? |
| ------------------- | ---------------------------- | --------------------------------------------------------------------------------- | --------------------------------- |
| `defaultCategories` | `config/skill-categories.ts` | `{ ...defaultCategories, ...sourceCategories }` — per-key override                | Only by redefining the key        |
| `defaultRules`      | `config/skill-rules.ts`      | `mergeRelationships(source, narrowed defaults)` — **concatenation**, source first | **No**                            |
| `defaultStacks`     | `config/stacks.ts`           | `resolveOfferedStacks` — **all-or-nothing, and only for the default source**      | **Yes — all of them, at once**    |

### The built-in rules are narrowed to the slugs the source ships

`relationshipsForSource` (`source-loader.ts`) filters `defaultRules.relationships` against the
slugs of the skills the source actually extracted, BEFORE any merge: group rules
(`conflicts`, `discourages`, `alternatives`) keep only present members and are dropped below two of
them, and a `requires` rule survives only if its `skill` is present and at least one of its `needs`
is. **The source's own rules are never narrowed.**

This changes no resolved matrix. `resolveSlugsOrSkip` already dropped a member that resolves to no
skill, so narrowing removes exactly what resolution discarded — verified identical, per-skill
relation for relation, on both the ten-skill E2E fixture and the full public catalogue (where it is
a no-op, all 176 slugs being present).

What it removes is **noise**: the rules name 176 slugs, and the E2E fixture's ten skills carry six
of them, leaving 170 dangling — `resolveToCanonicalId` warns once per dangling reference **per
skill**, which is 2384 lines. Invisible until the startup band began painting buffered warnings
above the wizard's step, at which point three of them plus `... and 2383 more` took four rows off
every frame in the suite, and any warning raised after them was counted rather than read. A user
could act on none of them: the rules are the CLI's, not the source's.

The inverse case is why the narrowing stops at the built-ins. A slug a source AUTHOR typed into
`config/skill-rules.ts` that the source's own skills do not carry is that source's defect, and the
unresolved-slug warning is the only place it is ever reported — `doctor` surfaces it through the
same load. Both halves are pinned in `source-loader.test.ts` → _"source-loader relationship rules"_.

### `mergeRelationships` is additive, and "source first" means less than it sounds

`mergeRelationships` concatenates each of the four lists with the source's entries in front. It
performs no dedupe, no keying, and no removal. **A source repo cannot suppress a built-in rule** —
it can only add rules that also apply. A source shipping a `skill-rules.ts` gets its own rules
_plus_ every built-in rule its own skills can express (the narrowing above removes only the rest,
which never reached the resolved matrix anyway).

The helper's own comment says source rules "win first-match lookups". That is exactly true for one
kind and approximately true for the rest — worth recording because the difference decides whether a
source repo can actually change behaviour:

| Kind                                       | Resolution                                               | What "source first" buys                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `conflicts`, `discourages`, `alternatives` | `flatMap` over **all** groups, then `uniqueBy(memberId)` | Every group still contributes members; source-first only decides whose `reason`/`purpose` annotation survives the dedupe |
| `requires`                                 | loop pushing **every** matching rule; no dedupe          | Nothing — both the source's and the built-in's requirement apply                                                         |

**So: a source repo can re-annotate a conflict, but cannot relax one.** Adding a conflicting
source rule makes the union stricter, never looser.

### Which source the stand-in is for

`resolveOfferedStacks` (`source-loader.ts`) answers "what stacks does this source offer the
wizard", and the built-in catalogue stands in for **the default public marketplace only**:

| Source                                                | Ships `config/stacks.ts` | What the wizard is offered                                                  |
| ----------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| Default public marketplace                            | —                        | Its own stacks, else all 17 built-ins                                       |
| Custom (`init --source`, `CC_SOURCE` at init, config) | Yes                      | Its own stacks, and only those                                              |
| Custom                                                | No                       | **Nothing** — `suggestedStacks` is `[]` and the wizard skips its stack step |

The identity is `isDefaultSource(source)` in `lib/configuration/config.ts` — one exported predicate
over `DEFAULT_SOURCE`, shared with `multi-source-loader.ts`'s public/private marketplace labelling
so the two surfaces cannot disagree. It is a question about the source STRING: a local checkout of
the public marketplace passed as `--source /path/to/skills` is a custom source, because nothing in a
path says which repository it holds. Both install-time spellings belong to `init` alone
(`--source` is its flag, `CC_SOURCE` is read only for `caller: "init"`); a later command reads the
source the install recorded, so the row above is the same row for it.

`hydrateForInit` in `stores/wizard-store.ts` is what "skips its stack step" means: an empty
`matrix.suggestedStacks` opens the wizard on `domains`, prepared exactly as the stack step's own
"Start from scratch" row prepares it (shared `startFromScratch` store action), with an empty
`history` so there is no step behind it to walk back into.

### Two stack lookups, one fallback rule

`defaultStacks` is consulted from two places, and since CLI-455 both scope the stand-in the same
way — to the default public marketplace:

| Entry point                                                      | Rule                                                                                      | Effect                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `loadAndMergeFromBasePath` (`source-loader.ts`)                  | `resolveOfferedStacks` — default source only                                              | **Whole-catalogue swap.** One stack in the source hides all 17 built-ins from the wizard    |
| `loadStackById(stackId, configDir, source)` (`stacks-loader.ts`) | source `loadStacks` first, then `defaultStacks` — but only when `isDefaultSource(source)` | **Per-id fallback, same scope.** A built-in id resolves under the default marketplace alone |

Under any other source a built-in id resolves to `null`, whoever named it — an installed config or
an `init --from` payload included. That is the honest answer: the wizard could not have offered
`nextjs-fullstack` there (`matrix.suggestedStacks` holds only the source's own stacks), so
installing it would mean expanding a stack written against a different catalogue of skills.

The one caller turns the `null` into a failure that names the id AND the source it asked, through
the one message `stackNotOfferedMessage(stackId, source)` exports beside the loader. The eject path
(`local-installer.ts`) takes the source identity as an argument, read off
`sourceResult.sourceConfig.source`. A second caller, the stack→plugin compiler, was threaded the
same identity by CLI-455 and then deleted whole by CLI-459 — it had no user-reachable caller.

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
`isDefaultSource(source) && !devMode`. **`devMode` has no production writer** — grep finds it only
inside `source-loader.ts` itself and in two unit specs, and it defaults to `false`. So for the
default marketplace, which is the overwhelmingly common case, the user gets the **baked** matrix and
`defaultStacks` / `defaultRules` are never executed at runtime at all. Dev mode is consequently the
one runtime path on which the built-in stand-in itself is observable, which is where
`source-loader.test.ts` pins it.

> **This is the most important operational fact in this document.** Editing `default-stacks.ts` or
> `default-rules.ts` has **no effect on a default-source user** until `generate:types` is re-run and
> `src/cli/types/generated/matrix.ts` is committed. The edit will pass typecheck, lint, and the
> pinning tests, and change nothing the user sees.

### Path B — runtime resolution

Reached for a local source, an explicitly non-default remote source, or the (unused) dev mode:

```
loadAndMergeFromBasePath(basePath, source)
  categories     = { ...defaultCategories, ...sourceCategories }
  skills         = extractAllSkills(skillsDir)                 -- read BEFORE the rules are decided
  builtIn        = narrowToShippedSlugs(defaultRules.relationships, slugs of skills)
  relationships  = sourceRules ? mergeRelationships(source, builtIn) : builtIn
  mergeMatrixWithSkills(categories, relationships, skills)     -- rules DISSOLVE here
  stacks         = resolveOfferedStacks(basePath, stacksFile, source)
                     source's own stacks, else defaultStacks for the DEFAULT source, else []
  matrix.suggestedStacks = stacks.map(convertStackToResolvedStack)
```

**`defaultRules` has no read model.** `MergedSkillsMatrix` carries no `relationships` field: the
rules are consumed exactly once, by `mergeMatrixWithSkills`, and dissolved into per-skill
`conflictsWith` / `discourages` / `requires` / `alternatives` on each `ResolvedSkill`. Nothing downstream can ask "what rules were loaded?" — which is also why
`BUILT_IN_MATRIX` bakes the **resolved relations**, not the rules.

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

| Consumer                                                 | Reads               | Purpose                                                                    |
| -------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------- |
| `scripts/generate-source-types.ts`                       | both                | Bakes `BUILT_IN_MATRIX` (relations + `suggestedStacks`)                    |
| `lib/loading/source-loader.ts`                           | both                | Runtime merge for sources read from disk (stacks: dev mode only)           |
| `lib/stacks/stacks-loader.ts::loadStackById`             | `defaultStacks`     | Per-id fallback after the source's `config/stacks.ts`, default source only |
| `lib/configuration/index.ts` barrel, `config-exports.ts` | both                | Internal and public re-export                                              |
| `components/wizard/stack-selection.tsx`                  | via matrix          | Renders `matrix.suggestedStacks`; seeds selections from `allSkillIds`      |
| `components/wizard/wizard.tsx`                           | via matrix          | `resolveSelectedSkillIds` under stack-defaults                             |
| `components/wizard/step-agents.tsx`                      | via matrix          | Derives custom-agent ids from `stack.skills` keys                          |
| `lib/matrix/matrix-provider.ts::findStack`               | via matrix          | `suggestedStacks.find(s => s.id === stackId)`                              |
| `lib/installation/local-installer.ts`                    | via `loadStackById` | Eject-config build; throws `stackNotOfferedMessage(id, source)`            |

## Test surface

| File                                                             | Pins                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/cli/lib/configuration/__tests__/default-stacks.test.ts`     | `EXPECTED_STACK_COUNT`; three stacks by name/description/philosophy; `it.each` over every stack for non-empty required fields; `it.each` over every (stack, agent, category) triple asserting `SkillAssignment[]` shape; `it.each` over the same triples asserting no assignment carries a `preloaded` key; one stack entry by value |
| `src/cli/lib/configuration/__tests__/default-rules.test.ts`      | `version`; the exact sorted key set of `relationships`; a length for `conflicts` / `requires` / `alternatives`; one representative entry per kind; `discourages` empty                                                                                                                                                               |
| `src/cli/lib/configuration/__tests__/default-categories.test.ts` | Sibling. Pins the count **and** asserts key-for-key equality with the generated `CATEGORIES` union                                                                                                                                                                                                                                   |

The stack file's two triple-level `it.each` blocks expand to 2960 specs — the 1480
`(stack, agent, category)` triples, twice over — and are nearly the whole cost of the two files,
which run 2986 and 13 specs respectively. Both run in the unit suite, which the `pre-commit` hook
executes.

**One gap, closeable and currently passing if closed:**

1. **Nothing cross-checks either file against the generated matrix.** `default-categories.test.ts`
   has exactly that assertion (`keys` vs `CATEGORIES`); its two siblings do not. No test asserts
   that every `defaultStacks` skill id exists in `BUILT_IN_MATRIX.skills`, or that every rule slug
   resolves through `BUILT_IN_MATRIX.slugMap`. Both hold, so the assertions pass on the day they are written.

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

The artefact is already wrong before the type error appears. `tsconfig.json`'s `include` is
`["src/**/*"]`, so `scripts/**` is reached through `tsconfig.scripts.json` — which the `typecheck`
script does run, as the second of its three tsc programs.

### Trap 2 — an edit here is invisible without regeneration

See [Path A](#path-a--generation-dominant). Re-run `npm run generate:types` and commit
`src/cli/types/generated/matrix.ts` (and `source-types.ts` if the skill set moved). A stack or rule
edit that skips this changes nothing for default-source users while passing every gate.

### Trap 3 — nothing fails when the catalogue goes stale

Neither a stale stack skill id nor a stale rule slug produces an error:

| Staleness                                           | What happens                                                                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack names a skill not in the matrix               | Generation: silent drop. Runtime: dropped from `skills`, kept in `allSkillIds`, one `warn` from `resolveAgentConfigToSkills` (suppressed in tests)                                                                                            |
| Rule names an unresolvable slug                     | `resolveToCanonicalId` logs `Unresolved slug '<slug>' … — skipping` and returns `null`; `resolveSlugsOrSkip` filters it out. Only a SOURCE's rules reach it — a stale BUILT-IN slug is narrowed out before resolution and says nothing at all |
| A `requires` rule whose `needs` all fail to resolve | The whole rule is dropped (`resolvedNeeds.length === 0` → `continue`)                                                                                                                                                                         |

The narrowing described under [Precedence](#the-built-in-rules-are-narrowed-to-the-slugs-the-source-ships)
takes the middle row's warning away from the built-ins on purpose, and costs nothing here: the
warning was already not a staleness signal. It fired for every slug a small source did not ship,
which is the normal case, so a genuinely stale built-in slug was one line among thousands that read
exactly the same. Invariant 4 above — every built-in slug resolves against `BUILT_IN_MATRIX` — is
the property that would catch it, and it is still checked by nothing.

`checkMatrixHealth` does **not** close this. It runs five checks — category domains, skill
categories, relation refs, audit-verdict contradictions, unaudited skills — and the only one that
could bear on staleness, `checkSkillRelationRefs`, reads `conflictsWith` and `requires` on
already-**resolved** skills, i.e. references that survived resolution by definition. It never looks
at `suggestedStacks` at all (the field does not appear in `matrix-health-check.ts`). Slug
resolution failures are gone before the health check runs.

### Trap 4 — do not restate `preloaded` semantics here

`preloaded: true` embeds a skill's content in the compiled agent prompt; `false` loads it via the
Skill tool at runtime. That split, and the `pluginRef` form each takes, are owned by
[compilation-pipeline.md](./compilation-pipeline.md) (per-skill `pluginRef`) and
[agent-system.md](./agent-system.md) (`buildAgentTemplateContext`, `preloadedSkillIds`). Which
pairs preload by default is owned by `packages/matrix/src/read-model/preload-defaults.ts`. This
document records only the shape: no built-in assignment carries `preloaded` at all, so all 1542 of
them take the mapping's verdict.

### Trap 5 — editing `SHARED_TOOLING` or `SHARED_LINT` edits 47 slots each

Each is one shared array reference, not 47 copies. Adding an entry adds it to every stack that names
the constant. If a stack needs different tooling, give it its own literal rather than mutating or
slicing the shared one — see [invariant 3](#structural-invariants).
