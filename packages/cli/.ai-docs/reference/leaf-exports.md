---
scope: reference
area: cross-cutting
keywords:
  [
    METADATA_KEYS,
    SkillRelation,
    SkillRequirement,
    MarketplaceRemoteSource,
    AgentDefinitionOptions,
    fetchAgentDefinitionsFromRemote,
    AgentPluginOptions,
    PROJECT_CONFIG_TYPES_BEFORE,
    PROJECT_CONFIG_INTERFACE_AFTER,
    ProjectConfigTypesOptions,
    ProjectAgentName,
    SelectedAgentName,
    ValidationPartial,
    BuildStepValidation,
    leaf-exports,
    export-census,
  ]
related:
  - reference/utilities.md
  - reference/types/core-types.md
  - reference/features/built-in-catalogue.md
  - reference/features/source-fetch-and-cache.md
  - reference/features/model-and-effort.md
  - reference/skills/skill-primitives.md
  - reference/features/agent-system.md
  - reference/features/compilation-pipeline.md
  - reference/config/config-writer.md
  - reference/component-patterns.md
last_validated: 2026-08-02
---

# Leaf Exports

## What this file is

**Twelve named exports** across seven sections, each sitting inside an area whose doc is otherwise
thorough. Ten appear nowhere else under `.ai-docs/reference/`; the remaining two
(`fetchAgentDefinitionsFromRemote`, `PROJECT_CONFIG_TYPES_BEFORE`) are partially covered elsewhere
and this file carries only the remainder, saying so in place. Individually none justifies a file.

**Every one is small. Most are not boring.** Two validators whose `valid` flag is a constant; a
constants module whose only consumer reads a raw string instead of the constant it exports; an
options type silently dropped at the branch it names; a type declared twice under the same name.
Those are the entries worth reading. The rest are shape tables.

### Already covered elsewhere — do not re-document here

| Export                                            | Covered at                                                                                                               | What that doc adds                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `SkillAlternative`                                | [features/built-in-catalogue.md](./features/built-in-catalogue.md)                                                       | Why `AlternativeGroup` is the one kind that is not a `SkillGroupRule`                                                         |
| `MarketplaceFetchResult`                          | [features/source-fetch-and-cache.md](./features/source-fetch-and-cache.md) § "`fetchMarketplace` — the fetch/cache half" | That the `?? false` is **dead** — `FetchResult.fromCache` is a required `boolean` — and the `.claude-plugin/` directory check |
| `SkillPluginOptions`                              | [skills/skill-primitives.md](./skills/skill-primitives.md) § "`skill-plugin-compiler.ts`"                                | That `sanitizeSkillName` applies **only** when `skillName` is absent                                                          |
| `PROJECT_CONFIG_TYPES_BEFORE` (model/effort only) | [features/model-and-effort.md](./features/model-and-effort.md)                                                           | The blast radius: a project's file rejects a new member until it regenerates                                                  |
| `ProjectAgentName`                                | not an export at all — see §6                                                                                            | —                                                                                                                             |

`fetchAgentDefinitionsFromRemote` (§4) is partially covered; this file carries only the remainder,
and says so in place.

**Enumerate the corpus with `find` before claiming an export is undocumented anywhere.** An absence
claim is only as good as the file set it was run against, and a total copied from
`DOCUMENTATION_MAP.md` is not that set.

### Disposition — this file has an end state

This is a **staging area**. Each entry names the doc that owns its area. When that doc next takes a
FULL validation pass, its entry should move there and be **deleted** from here; when the last entry
moves, this file is deleted rather than left as an empty shell. Do not add a new export here just
because it is small — add it to its owning doc. The only reason an entry belongs here is that
its owning doc was out of scope for whoever found it.

| §   | Export                                                                                       | Source                                     | Owning doc                                                                              |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| 1   | `METADATA_KEYS`                                                                              | `lib/metadata-keys.ts`                     | [utilities.md](./utilities.md) — constants region                                       |
| 2   | `SkillRelation`, `SkillRequirement`                                                          | `types/matrix.ts`                          | [types/core-types.md](./types/core-types.md)                                            |
| 3   | `MarketplaceRemoteSource`                                                                    | `types/plugins.ts`                         | [types/core-types.md](./types/core-types.md)                                            |
| 4   | `AgentDefinitionOptions`, `fetchAgentDefinitionsFromRemote`                                  | `lib/agents/agent-fetcher.ts`              | [features/agent-system.md](./features/agent-system.md)                                  |
| 5   | `AgentPluginOptions`                                                                         | `lib/agents/agent-plugin-compiler.ts`      | [features/compilation-pipeline.md](./features/compilation-pipeline.md)                  |
| 6   | `PROJECT_CONFIG_TYPES_BEFORE`, `PROJECT_CONFIG_INTERFACE_AFTER`, `ProjectConfigTypesOptions` | `lib/configuration/config-types-writer.ts` | [config/config-writer.md](./config/config-writer.md)                                    |
| 7   | `ValidationPartial`                                                                          | `lib/matrix/matrix-resolver.ts`            | [features/skills-and-matrix.md](./features/skills-and-matrix.md) — Selection Validation |
| 7   | `BuildStepValidation`                                                                        | `lib/wizard/build-step-logic.ts`           | [component-patterns.md](./component-patterns.md)                                        |

---

## 1. `METADATA_KEYS` — a message vocabulary, not an accessor vocabulary

**File:** `src/cli/lib/metadata-keys.ts`

```typescript
export const METADATA_KEYS = {
  DISPLAY_NAME: "displayName",
  CLI_DESCRIPTION: "cliDescription",
  CATEGORY: "category",
  FORKED_FROM: "forkedFrom",
  CONTENT_HASH: "contentHash",
  USAGE_GUIDANCE: "usageGuidance",
} as const;
```

Its JSDoc says "Centralized to avoid string duplication across loaders and compilers." **The code
does not match that description, and the gap is the trap.**

| Claim                             | Reality (re-derived by grep over `src/`, `e2e/`, `scripts/`)                           |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| Used across loaders and compilers | **One** importing module: `lib/matrix/matrix-loader.ts`                                |
| Six keys centralized              | **One** key referenced: `DISPLAY_NAME`, inside `extractAllSkills` (`matrix-loader.ts`) |
| Avoids string duplication         | The other five field names still appear as raw literals — see the table below          |

**The one use is inside an error message, not a property read.** The `displayName` guard in
`extractAllSkills` (`matrix-loader.ts`):

```typescript
if (!metadata.displayName) {
  throw new Error(
    `Skill at ${metadataFile} is missing required '${METADATA_KEYS.DISPLAY_NAME}' field in metadata.yaml`,
  );
}
```

The guard reads `metadata.displayName` as a literal property; the constant supplies only the text of
the message. **Editing `METADATA_KEYS.DISPLAY_NAME` therefore changes what the error says and not
what the loader reads** — the two would silently disagree. The real contract for these field names
is the Zod layer (`skillMetadataLoaderSchema` in `lib/schemas.ts`), which spells them out
independently; see [types/zod-schemas.md](./types/zod-schemas.md).

Raw-literal hits for each key across `src/cli/**`, excluding `metadata-keys.ts` itself:

| Key              | Raw `"literal"` hits | Where they live                                                           |
| ---------------- | -------------------- | ------------------------------------------------------------------------- |
| `displayName`    | 6                    | schemas, test fixtures                                                    |
| `cliDescription` | 6                    | `isOverLengthCliDescription` in `lib/schemas.ts`, validator/command tests |
| `forkedFrom`     | 1                    | `skill-metadata.test.ts`                                                  |
| `usageGuidance`  | 1                    | the `TestSkill` `Pick` in `lib/__tests__/fixtures/create-test-source.ts`  |
| `contentHash`    | 0                    | — reached only through typed objects, never by string key                 |

**Adjacent exports in the same module are documented elsewhere — do not re-document them here.**
`SKILL_CONTENT_FILES` and `SKILL_CONTENT_DIRS` are cited by
[features/skills-and-matrix.md](./features/skills-and-matrix.md) under `computeSkillFolderHash`;
`LOCAL_DEFAULTS` by [skills/skill-primitives.md](./skills/skill-primitives.md). It carries a
deliberate boundary cast to `CategoryPath` (`"dummy-category"`) — a placeholder that sits
**outside** the generated `Category` union on purpose, annotated in place.

**No test file references `METADATA_KEYS`.** Its behaviour is covered only transitively, through
`matrix-loader`'s error-path specs.

---

## 2. `SkillRelation` and `SkillRequirement` — the record shapes

**File:** `src/cli/types/matrix.ts`. Reach consumers through `types/index.ts`
(`export type * from "./matrix"`); no barrel gives them a distinct name.

These are the **post-resolution** element shapes behind the relationship kinds tabulated at
[features/skills-and-matrix.md](./features/skills-and-matrix.md) → "Relationship System". The rule
types (`ConflictRule`, `RequireRule`, all slug-keyed) are the pre-resolution inputs.

| Type               | Shape                                                              | Which `ResolvedSkill` fields hold it |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------ |
| `SkillRelation`    | `{ skillId: SkillId; reason: string }`                             | `conflictsWith`, `discourages`       |
| `SkillRequirement` | `{ skillIds: SkillId[]; needsAny: boolean; reason: string }`       | `requires`                           |
| `SkillAlternative` | `{ skillId: SkillId; purpose: string }` — **documented elsewhere** | `alternatives`                       |

**Do not document the resolution mechanism here.**
[features/built-in-catalogue.md](./features/built-in-catalogue.md) owns it and covers more than this
pass derived: `collectSymmetricGroupMembers`' `uniqueBy` dedupe and whose annotation survives it
(`:273`), the AND-vs-OR default and
its distribution across the built-in rules (`:238-241`), and the two slug-resolution failure modes —
a filtered-out member vs. a whole rule dropped on `resolvedNeeds.length === 0` (`:432-433`).
`SkillAlternative`'s shape and the `AlternativeGroup` asymmetry are at `:230-232` of the same file.

What is left to say about these two records is one thing:

**Trap — `SkillRequirement` is declared twice in the repo.**
`lib/matrix/matrix-resolver.ts` declares a module-private
`type SkillRequirement = ResolvedSkill["requires"][number]`, shadowing the exported name so the
module needs no import for it. It resolves to the same type (`ResolvedSkill["requires"]` **is**
`SkillRequirement[]`), so there is no divergence risk today — but a grep for the identifier returns
two declaration sites, and the private one, used by `isRequirementMet`, `missingRequirementIds`
and `wouldLoseRequirement`, is not the one to edit.

**Vestigial JSDoc.** `SkillRequirement.needsAny` carries `@default false` in its JSDoc
(`types/matrix.ts`) but is
**not optional** — the default is applied upstream, in the resolver. `RequireRule.needsAny` in the
same file is the optional one and carries the same annotation, correctly.

---

## 3. `MarketplaceRemoteSource`

**File:** `src/cli/types/plugins.ts`, reached through `types/index.ts`'s
`export type * from "./plugins"`.
[types/core-types.md](./types/core-types.md) already lists `PluginManifest`, `Marketplace` and
`MarketplacePlugin` from this module (its table at `:63`); this is the gap.

```typescript
export type MarketplaceRemoteSource = {
  source: "github" | "url";
  repo?: string; // GitHub repository in owner/repo format
  url?: string;
  ref?: string; // Git ref (branch, tag, or commit)
};
```

It is the object half of `MarketplacePlugin.source`, whose declared type is
`string | MarketplaceRemoteSource` (`plugins.ts`).

**Invariant — the discriminator does not gate the payload.** The Zod bridge
`marketplaceRemoteSourceSchema` (`lib/schemas.ts`) is a plain object with `repo`, `url` and
`ref` **all optional**, so `{ source: "github" }` with neither `repo` nor `url` validates.
[types/zod-schemas.md](./types/zod-schemas.md) `:145` records the schema's place in the dependency
chain but not this leniency. It is deliberate and consistent with the rest of
`marketplacePluginSchema` (`category` is a bare `z.string().optional()` for the same reason) —
external marketplace JSON is not the CLI's to reject on shape. The consequence is that the malformed
case is caught at **use** time, not parse time.

**`source: "github" | "url"` is never read.** The one consumer, `resolvePluginSource`
(`lib/skills/skill-fetcher.ts`), discriminates on which field is _populated_, not on the
declared kind. Its precedence — `url` → bare string → `repo` + optional `#ref` — and the throw it
ends on are documented at [skills/skill-primitives.md](./skills/skill-primitives.md)
§ "`skill-fetcher.ts` — glob-based skill copy" → "Contracts and traps",
together with the sharper finding that a _diagnostic-only_ verbose call evaluates it inside a
template literal and can therefore abort a fetch with logging off. Do not restate that here.

The residue worth recording: the ladder's ordering means a source carrying **both** `url` and `repo`
silently ignores `repo`, and `ref` is appended **only** on the `repo` arm — so
`{ source: "url", url, ref }` drops `ref` with no warning and pins nothing.

---

## 4. `AgentDefinitionOptions` and the remote branch of `getAgentDefinitions`

**File:** `src/cli/lib/agents/agent-fetcher.ts`. Barrel: `lib/agents/index.ts` re-exports the type
and all three functions from `./agent-fetcher`.

[features/agent-system.md](./features/agent-system.md) documents `getAgentDefinitions()` in its
export table (`:531`) with the signature `(remoteSource?, options?) => Promise<AgentSourcePaths>`.
[features/source-fetch-and-cache.md](./features/source-fetch-and-cache.md) records the one row this
module contributes to the `fetchFromSource` call-site table in its § "Call sites" (options
`{ subdir: "" }`), and notes under that table that `fetchAgentDefinitionsFromRemote`'s
parameter type is **the only place `FetchOptions` is extended rather than constructed**. Neither
describes the options type, the branch asymmetries, or the reachability. That is this section.

```typescript
export type AgentDefinitionOptions = FetchOptions & {
  projectDir?: string;
};
```

`FetchOptions` is `{ subdir?: string }` (declared in
`lib/loading/source-fetcher.ts`), so the full field set is `{ subdir?, projectDir? }`. **Every field is inert on at
least one branch:**

| Field        | Local branch (`getLocalAgentDefinitions`)                                                  | Remote branch (`fetchAgentDefinitionsFromRemote`)                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `projectDir` | **Read** via `localTemplatesDir` — selects `<projectDir>/.claude/templates` when it exists | **Never read.** Not in the parameter type at all                                                                        |
| `subdir`     | Ignored                                                                                    | Overridden with `""` in the `fetchFromSource` call — see source-fetch-and-cache.md on why `""` is intent, not behaviour |

**Invariant — `fetchAgentDefinitionsFromRemote` does not take `AgentDefinitionOptions`.** Its own
parameter type is `FetchOptions & { agentsDir?: string }`, a _different_ intersection.
`getAgentDefinitions` forwards its `options` straight into it, and because that argument is
a variable rather than an object literal TypeScript applies no excess-property check. The mismatch
runs both ways:

- **`projectDir` is silently dropped** when a remote source is supplied. A caller passing
  `{ projectDir }` alongside a `remoteSource` gets no local-templates preference and no diagnostic.
- **`agentsDir` is unreachable through `getAgentDefinitions`.** It is not in
  `AgentDefinitionOptions`, so only a direct call to `fetchAgentDefinitionsFromRemote` can set it.
  That matters because `agentsDir` doubles as the flag that **suppresses** the source-config lookup:
  the `sourceProjectConfig` binding in `fetchAgentDefinitionsFromRemote` skips
  `loadProjectSourceConfig(result.path)` entirely when it is set.

**Remote agents-dir precedence (`agentsDirRelPath` in `fetchAgentDefinitionsFromRemote`):**
`options.agentsDir` → the fetched source's own `agentsDir` from its project source config →
`DIRS.agents` (`"src/agents"`).

**The two branches derive `templatesDir` differently, and the difference is deliberate.** Locally
(`getLocalAgentDefinitions`' `templatesDir`) it is the full independent constant
`PROJECT_ROOT + DIRS.templates` (`"src/agents/_templates"`). Remotely
(`fetchAgentDefinitionsFromRemote`'s `templatesDir`) it is `agentsDir + basename(DIRS.templates)` —
only the **basename** `_templates` is taken, so the templates dir is re-nested under whatever
agents dir was resolved. With the default relative path the two agree; they diverge exactly when a source
config relocates `agentsDir`, which is the case the basename exists to handle. The local
`.claude/templates` override has **no remote equivalent** — a remote source cannot be given project
templates.

**Failure asymmetry, both branches.** A missing agents dir **throws** — each branch guards on
`directoryExists(agentsDir)`. A missing templates dir only `verbose()`-logs — each branch guards on
`directoryExists(templatesDir)` — and the path is returned anyway, so a downstream Liquid render is
what actually fails.

### The remote branch is production-unreachable today

| Caller                                                        | `remoteSource` passed                |
| ------------------------------------------------------------- | ------------------------------------ |
| `loadAgentDefs` (`lib/operations/project/load-agent-defs.ts`) | hardcoded `undefined` — always local |

`loadAgentDefs` is now the only caller, and it never passes a remote source — the one site that
could went with the `new agent` command when that command was deleted.
**No shipped code path reaches `fetchAgentDefinitionsFromRemote`.** Its
behaviour is held up entirely by `agent-fetcher.test.ts` (**22 specs**, verified by running the
file; a `fetchAgentDefinitionsFromRemote` describe block plus blocks for the local resolver and the
dispatcher). Treat it as tested-but-dormant: changing it will not break a user today, and no E2E
will catch it either.

---

## 5. `AgentPluginOptions` — the agent compiler's options shape

The **function** is documented: `compileAgentPlugin()` and `compileAllAgentPlugins()` are in
[features/compilation-pipeline.md](./features/compilation-pipeline.md) `:319-320`, `:326`.
`SkillPluginOptions` is fully covered by
[skills/skill-primitives.md](./skills/skill-primitives.md) and is **not** repeated here.

The shape is what remains:

| Type                 | File                                  | Shape                                      |
| -------------------- | ------------------------------------- | ------------------------------------------ |
| `AgentPluginOptions` | `lib/agents/agent-plugin-compiler.ts` | `{ agentPath: string; outputDir: string }` |

Barrel: `lib/agents/index.ts`.

**`AgentPluginOptions` has one construction site and it is internal.** `compileAgentPlugin` is
called only from `compileAllAgentPlugins` in the same file, which always sets both fields. The
command layer (`compileAgents` in `commands/build/plugins.ts`) reaches the batch
wrapper, never the singular. Public surface, no external caller — the same posture
skill-primitives.md records for `SkillPluginOptions`.

**The stack installer's shapes used to sit here and no longer exist.** `StackInstallOptions` /
`StackInstallResult`, and the whole `installStackAsPlugin` → `compileStackToTemp` →
`compileStackPlugin` chain beneath them, were deleted in CLI-459 — dormant surface with green specs
and no user-reachable caller. See [features/plugin-system.md](./features/plugin-system.md)
§ "Stack Plugin Compilation — removed".

---

## 6. The emitted `config-types.ts` template halves

**File:** `src/cli/lib/configuration/config-types-writer.ts`. Owning doc:
[config/config-writer.md](./config/config-writer.md) → "Config Types Writer", which documents the
five generator functions, the union-emission internals, `assembleConfigTypesSource`'s generated-file
stamp, `STACK_AGENT_CONFIG_LOOSE_LINE` and `buildSkillsByCategory` — but not the two constants those
functions interpolate, and not `ProjectConfigTypesOptions`.

**These are string constants holding emitted TypeScript, not types.** `assembleConfigTypesSource`
splices them around the dynamically-generated `StackAgentConfig`:

```
// AUTO-GENERATED by agents-inc — DO NOT EDIT
[importBlock?]
export type SkillId / AgentName / SelectedAgentName / ProjectAgentName / Domain / Category = ...
PROJECT_CONFIG_TYPES_BEFORE
<stackAgentConfig>
PROJECT_CONFIG_INTERFACE_AFTER
```

| Constant                         | Emits                                                                  |
| -------------------------------- | ---------------------------------------------------------------------- |
| `PROJECT_CONFIG_TYPES_BEFORE`    | `InstallMode`, `SkillConfig`, `AgentScopeConfig`, `SkillAssignment<S>` |
| `PROJECT_CONFIG_INTERFACE_AFTER` | the whole `ProjectConfig` interface                                    |

**`PROJECT_CONFIG_TYPES_BEFORE`'s `model?` / `effort?` lines are documented elsewhere and must not
be restated here.** [features/model-and-effort.md](./features/model-and-effort.md) owns the emission
of `MODEL_NAMES` / `EFFORT_NAMES` into `AgentScopeConfig`, the `formatLiteralUnion` vs `formatUnion`
rationale, and the blast radius: the members are _emitted content_, so a project's generated file keeps rejecting a new member until something
rewrites it, and the user sees a type error on a value the CLI already accepts at runtime. That doc
also owns the `MODEL_NAMES` membership per the count-ownership rule.

The rest of the template is `InstallMode`, `SkillConfig` and the generic
`SkillAssignment<S extends SkillId = SkillId> = S | { id: S; preloaded: boolean }`. Only the
emitted `SkillAssignment` is generic; the runtime type of the same name is not.

### `ProjectAgentName` is emitted, not exported

`ProjectAgentName` is _not_ a named export of
`config-types-writer.ts`. It exists only inside the template strings: declared by
`assembleConfigTypesSource` (`export type ProjectAgentName = ${parts.projectAgentName};`) and
consumed by `PROJECT_CONFIG_INTERFACE_AFTER`
(`stack?: Partial<Record<ProjectAgentName, StackAgentConfig>>`). `SelectedAgentName` is the same
kind of thing — declared alongside it and consumed only as `ProjectAgentName`'s fallback value
(the emitted `ProjectConfig` interface has no property typed with it — it carries
`selectedDomains?: Domain[]` and no selected-agent field). Neither can be imported from the
module; both are only strings until a generated file is written. A grep for either name in `src/`
finds the template, not a declaration — which is how each gets mistaken for an export.

Their values come from the same two-step narrowing in both generators — each derived from the
config's `agents[]` rows via the `scope-predicates.ts` helpers — and the fallback is a _type
name_, not a literal union:

| Alias               | Value when the config supplies names                                                                                                                                                                                        | Fallback              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `SelectedAgentName` | `formatUnion(activeAgentNames(config.agents))` — `selectedAgentNameLine` in `generateConfigTypesSource`; `selectedAgentNameUnion` in `generateProjectConfigTypesSource` (fed via the `selectedAgentNames` option)           | `"AgentName"`         |
| `ProjectAgentName`  | `formatUnion(activeProjectAgentNames(config.agents))` — `projectAgentNameLine` in `generateConfigTypesSource`; `projectAgentNameUnion` in `generateProjectConfigTypesSource` (fed via the `projectScopedAgentNames` option) | `"SelectedAgentName"` |

So the emitted chain widens gracefully: with no project-scoped agents, `ProjectAgentName` **is**
`SelectedAgentName`, which with no active agent rows **is** `AgentName`.

**Why the emitted `ProjectConfig` deliberately diverges from `types/config.ts`.** Recorded in
`assembleConfigTypesSource`'s JSDoc: the emitted interface uses the narrowed generated aliases so a
user's `config.ts` is type-checked against **only the installed** skills and agents rather than the full
runtime union. The two interfaces are supposed to differ; reconciling them would defeat the
narrowing.

### `ProjectConfigTypesOptions`

The parameter of `generateProjectConfigTypesSource`, which **is** exported from the
configuration barrel (`lib/configuration/index.ts`) — unlike `generateConfigTypesSource` and
`regenerateConfigTypes`, which are deliberately withheld from it (see the barrel's own comment
above that export block and config-writer.md's four-layer enforcement section).

| Field                     | Required? | Purpose                                                                                               |
| ------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| `globalTypesImportPath`   | yes       | Absolute path to the global `.claude-src`; `generateProjectConfigTypesSource` appends `/config-types` |
| `projectSkillIds`         | yes       | Project-only skill ids                                                                                |
| `projectAgentNames`       | yes       | Project-only agent names                                                                              |
| `projectDomains`          | yes       | Project-only domains                                                                                  |
| `projectCategories`       | **no**    | Project-only categories                                                                               |
| `selectedAgentNames`      | no        | Narrows `SelectedAgentName`                                                                           |
| `projectScopedAgentNames` | no        | Narrows `ProjectAgentName`                                                                            |

**`projectCategories`' optionality is the only asymmetry, and it buys nothing.** The other three
`project*` fields are required and go straight through `formatExtendedUnion`.
`projectCategories` gets a bespoke ternary instead (`categoryUnion`): coalesce to `[]`, then emit
the bare `GlobalCategory` when the list is empty. **That ternary is redundant** — `formatExtendedUnion`
already returns the bare `globalTypeName` for an empty member list, so
`formatExtendedUnion("GlobalCategory", projectCategories)` would produce identical output on every
input. The optional-vs-required split in the type is a caller convenience with no emission
consequence, and `regenerateConfigTypes` supplies all four anyway, each defaulted to
`[]`, so no shipped call exercises the omission.

**A second vestige in the same function:** the comment above `categoryImport` reads "Import
`Category` as `GlobalCategory` when we have project categories or need to re-export it", but
`categoryImport` is an **unconditional** string constant. The import is always emitted. Read the
comment as history, not as a condition.

`formatExtendedUnion` applies its own `MULTI_LINE_THRESHOLD` break. That is safe because these
unions are emitted at statement level, not inside a property — the exact distinction
`formatLiteralUnion` exists to preserve for `model?` / `effort?`.

---

## 7. The two validation return shapes

### The selection validation passes (`lib/matrix/matrix-resolver.ts`)

The three validation passes that
[features/skills-and-matrix.md](./features/skills-and-matrix.md) → "Selection Validation" tabulates
by name — `validateConflicts`, `validateRequirements`, `validateExclusivity` — each return a bare
`ValidationError[]`, precisely because a single pass has no standing to judge the whole selection.

**Not in the barrel.** `lib/matrix/index.ts`'s `./matrix-resolver` block re-exports
`validateSelection` only — none of the three passes. Import them from `./matrix-resolver` directly.

**Zero production consumers of the three passes outside `validateSelection` itself.** The only
other importer is `matrix-resolver.test.ts`, which has a dedicated describe block per pass. They
are exported for testability.

**`valid` is derived from `errors`, and is still not a gate.**

```typescript
const errors = [...three passes, spread...];
return { valid: errors.length === 0, errors };
```

`SelectionValidation.valid` from `validateSelection` was a hardcoded `true` — non-empty `errors`
and `valid: true` on the same object, which reads as a contradiction to anyone who has not been
told. It is derived now, so the two fields agree. What did **not** change is what either field
means: the whole matrix validation surface is **advisory** (the wizard shows conflicts and unmet
requirements without blocking, and `reportValidationErrors` on `BaseCommand` warns and returns),
and every `ValidationError` in `types/matrix.ts` is annotated "Advisory validation error
(non-blocking)". **A `false` here does not stop anything** — nothing branches on it. Note that the
generic
`mergeValidationResults` (`lib/validation-result.ts`) serves the string-based `ValidationResult`
used by `output-validator.ts` and `plugins/plugin-validator.ts`, where `valid` _is_ meaningful.

### `BuildStepValidation` (`lib/wizard/build-step-logic.ts`)

```typescript
export type BuildStepValidation = {
  valid: boolean;
  message?: string;
};
```

The return type of `validateBuildStep`, which
[features/wizard-flow.md](./features/wizard-flow.md) `:207` lists by name and
[architecture-overview.md](./architecture-overview.md) `:167` lists in the `lib/wizard` export
inventory. Barrel: `lib/wizard/index.ts` exports both the type and the function.

**Same invariant, more starkly: `valid` is `true` on both arms of the ternary.**

```typescript
const emptyRequired = categories.find((c) => c.required && !selections[c.id]?.length);
return emptyRequired
  ? {
      valid: true,
      message: `No skills selected in ${emptyRequired.displayName} (required category)`,
    }
  : { valid: true };
```

`valid: false` is unreachable. The declared `boolean` describes a shape the function never produces;
the only information it carries is the presence or absence of `message`. A `required` category is
therefore an **advisory** label, which makes `CategoryDefinition.required`'s own JSDoc claim ("the
user must select at least one skill before proceeding", `types/matrix.ts`) the thing that is
_not_ enforced.

**Only the first empty required category is reported** — `.find`, not `.filter`. Two unfilled
required categories produce one message naming one of them.

**Zero production callers.** Grep over `src/` and `e2e/` returns the definition, the barrel
re-export, and two test files: `lib/wizard/build-step-logic.test.ts` (**50 specs**, verified by
running the file) and the `validateBuildStep` describe block in
`components/wizard/step-build.test.tsx`. No wizard component calls it
and no rendered string comes from it, so the `message` it constructs is never shown to a user. Both
dormancy facts hold together: the function is unreachable AND could not block anything if it were
reached.

Its file-mate `buildCategoriesForDomain` is by contrast heavily used and thoroughly
documented — see [component-patterns.md](./component-patterns.md) `:266` and
[features/wizard-flow.md](./features/wizard-flow.md) for the deterministic-ordering
contract. Do not infer from `validateBuildStep`'s dormancy that the module is dead.

---

## Test surface

Counts obtained by **running** each file (`npx vitest run <file>`), not by counting `it(` lines —
`it.each` blocks contribute more than one case each, which is how a prior count in this repo went
wrong.

| File                                                              | Specs | Covers                                                                                        |
| ----------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| `src/cli/lib/agents/agent-fetcher.test.ts`                        | 22    | `getLocalAgentDefinitions`, `fetchAgentDefinitionsFromRemote`, `getAgentDefinitions` dispatch |
| `src/cli/lib/wizard/build-step-logic.test.ts`                     | 50    | `validateBuildStep`, `buildCategoriesForDomain`                                               |
| `src/cli/lib/configuration/__tests__/config-types-writer.test.ts` | 62    | emitted source of both generators                                                             |
| `src/cli/lib/matrix/matrix-resolver.test.ts`                      | 127   | the four `ValidationPartial` passes plus the rest of the resolver                             |
| `src/cli/components/wizard/step-build.test.tsx`                   | —     | the `validateBuildStep` describe block (file total not re-derived)                            |

**No test file references `METADATA_KEYS`, `SkillRelation` or `MarketplaceRemoteSource` by name.**
Those three are covered only transitively.

---

## Traps, collected

| #   | Trap                                                                                                              | Anchor                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Editing `METADATA_KEYS.DISPLAY_NAME` changes the error text, not the field the loader reads                       | `extractAllSkills` (`matrix-loader.ts`)                                                          |
| 2   | `SkillRequirement` is declared twice — the private alias in `matrix-resolver.ts` is not the one to edit           | the module-private `SkillRequirement` alias (`matrix-resolver.ts`)                               |
| 3   | `{ source: "github" }` with no `repo` and no `url` passes schema validation and throws at use time                | `marketplaceRemoteSourceSchema` (`schemas.ts`)                                                   |
| 4   | A remote source carrying both `url` and `repo` ignores `repo`; `ref` is dropped unless the `repo` arm is taken    | `resolvePluginSource` (`skill-fetcher.ts`)                                                       |
| 5   | `projectDir` is silently dropped whenever `getAgentDefinitions` takes a `remoteSource`                            | `getAgentDefinitions` vs `fetchAgentDefinitionsFromRemote` (`agent-fetcher.ts`)                  |
| 6   | `agentsDir` cannot be set through `getAgentDefinitions`, and setting it also suppresses the source-config lookup  | the `sourceProjectConfig` binding in `fetchAgentDefinitionsFromRemote`                           |
| 7   | `templatesDir` is an independent constant locally but re-nested under `agentsDir` remotely                        | the `templatesDir` binding in `getLocalAgentDefinitions` vs in `fetchAgentDefinitionsFromRemote` |
| 8   | `ProjectAgentName` / `SelectedAgentName` are emitted strings, not importable types                                | `assembleConfigTypesSource` (`config-types-writer.ts`)                                           |
| 9   | The `projectCategories` ternary is redundant, and the `categoryImport` comment describes a condition that is gone | `categoryUnion` and `categoryImport` in `generateProjectConfigTypesSource`                       |
| 10  | `validateSelection` returns `valid: true` with a non-empty `errors` array — never branch on it                    | `validateSelection` (`matrix-resolver.ts`)                                                       |
| 11  | `validateBuildStep` cannot return `valid: false`, has no production caller, and its `message` is never rendered   | `validateBuildStep` (`build-step-logic.ts`)                                                      |

---

## Known limitations of this file

- **A name-absence census is not a description-absence census.** Entries here were selected by "this
  identifier appears in no reference doc". An export named somewhere but never _described_ is not
  selected — that is a different sweep, and this file does not stand in for it.
- **No count here is owned by this file** except the four spec counts in the test-surface table.
  Every other figure is a re-derivable grep or `find` result stated inline with its method. Nothing
  here belongs in the count-ownership registry.
- **`step-build.test.tsx`'s file total is deliberately absent.** Only its `validateBuildStep`
  describe block is relevant here; a file total would imply a wider coverage claim.
- **A deferral is a link, and links break.** If one of the docs named above is later trimmed, the
  corresponding entry has to come back here.
