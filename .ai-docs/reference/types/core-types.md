---
scope: reference
area: types
keywords:
  [
    SkillId,
    SkillSlug,
    Domain,
    Category,
    AgentName,
    ResolvedSkill,
    MergedSkillsMatrix,
    ProjectConfig,
    SkillConfig,
    SkillReference,
    Skill,
    type-guards,
    typedEntries,
    SkillScope,
    ClaudePluginScope,
    SourceEntry,
    BrandingConfig,
    CompileAgentConfig,
    SourceRowContext,
    SkillCore,
    BaseAgentFields,
    SkillGroupRule,
    InstallMode,
    ConfigLoadError,
    LoadedProjectConfig,
  ]
related:
  - reference/types/operations-types.md
  - reference/types/zod-schemas.md
  - reference/architecture/overview.md
  - reference/store-map.md
  - reference/concepts/scope-system.md
last_validated: 2026-07-30
---

<!-- re-validated 2026-07-30 (product v0.146.0): re-counted every generated union against src/cli/types/generated/source-types.ts (222/222/89/9/23 — all unchanged); added the three shared base types the consolidation refactor introduced and the doc never picked up (SkillCore, BaseAgentFields, SkillGroupRule + its three aliases); added ConfigLoadError with the missing/content-less/unloadable three-way distinction (D-273); added InstallMode, SKILL_SOURCE_TYPES, LoadedProjectConfig, Installation; corrected SourceRowContext, which gained a fourth field (installedSkillSlots, D-258); noted that defaultCategories now defines all 89 Category members; cross-referenced the D-240 recompile types to operations-types.md rather than duplicating them -->

# Core Types

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

> **Split from:** `reference/type-system.md`. See also: [operations-types.md](./operations-types.md), [zod-schemas.md](./zod-schemas.md).

## Type Module Structure

All types are defined in `src/cli/types/` and re-exported through `src/cli/types/index.ts`.

| Module    | File                                      | Purpose                                                                     |
| --------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| Generated | `src/cli/types/generated/source-types.ts` | Generated union types: SkillId, SkillSlug, Category, Domain, AgentName      |
| Generated | `src/cli/types/generated/matrix.ts`       | Generated built-in matrix data (BUILT_IN_MATRIX constant)                   |
| Skills    | `src/cli/types/skills.ts`                 | SkillId (re-export), SkillFrontmatter, SkillAssignment, CategoryPath        |
| Agents    | `src/cli/types/agents.ts`                 | AgentName (re-export), AgentConfig, CompiledAgentData                       |
| Matrix    | `src/cli/types/matrix.ts`                 | Domain (re-export), Category (re-export), ResolvedSkill, MergedSkillsMatrix |
| Config    | `src/cli/types/config.ts`                 | ProjectConfig, CompileConfig, ValidationResult                              |
| Stacks    | `src/cli/types/stacks.ts`                 | Stack, StackAgentConfig, StacksConfig                                       |
| Plugins   | `src/cli/types/plugins.ts`                | PluginManifest, Marketplace, MarketplacePlugin                              |

## Union Types (Single Source of Truth: `src/cli/types/generated/source-types.ts`)

Union types for Domain, Category, AgentName, SkillId, and SkillSlug are **auto-generated** from the skills source and agent metadata. Run `bun run generate:types` to regenerate.

### SkillId (`src/cli/types/generated/source-types.ts`)

```typescript
export const SKILL_MAP = {
  "angular-standalone": "web-framework-angular-standalone",
  "ant-design": "web-ui-ant-design",
  // ... 222 entries total
} as const;

export type SkillSlug = keyof typeof SKILL_MAP;
export type SkillId = (typeof SKILL_MAP)[SkillSlug];
```

- Derived from `SKILL_MAP` constant (slug-to-ID mapping), not a template literal
- No dedicated `skillIdSchema` exists. At parse boundaries `SkillId` is validated with a lenient `z.string() as z.ZodType<SkillId>` cast (see `skillFrontmatterLoaderSchema`, `boundSkillSchema` in `src/cli/lib/schemas.ts`) — intentionally permissive because local/custom skills carry non-builtin IDs
- 222 skill IDs, 222 skill slugs
- Re-exported from `src/cli/types/skills.ts`
- Examples: `"web-framework-react"`, `"meta-methodology-research-methodology"`, `"api-database-drizzle"`, `"ai-provider-anthropic-sdk"`, `"desktop-framework-electron"`

### SkillSlug (`src/cli/types/generated/source-types.ts`)

```typescript
type SkillSlug = keyof typeof SKILL_MAP;
```

- 222 members (one per skill): `"react"`, `"zustand"`, `"vitest"`, `"drizzle"`, `"anthropic-sdk"`, `"electron"`, `"tauri"`, etc.
- Used in relationship rules (conflicts, recommends, requires) instead of full SkillId
- Re-exported from `src/cli/types/skills.ts`

### AgentName (`src/cli/types/generated/source-types.ts`)

```typescript
export const AGENT_NAMES = [
  "agent-summoner",
  "ai-developer",
  "ai-reviewer",
  "api-developer",
  "api-pm",
  "api-researcher",
  "api-reviewer",
  "api-tester",
  "cli-developer",
  "cli-reviewer",
  "cli-tester",
  "codex-keeper",
  "convention-keeper",
  "infra-reviewer",
  "pattern-scout",
  "skill-summoner",
  "web-architecture",
  "web-developer",
  "web-pattern-critique",
  "web-pm",
  "web-researcher",
  "web-reviewer",
  "web-tester",
] as const;

export type AgentName = (typeof AGENT_NAMES)[number];
```

23 members total. Re-exported from `src/cli/types/agents.ts`.

### Domain (`src/cli/types/generated/source-types.ts`)

```typescript
export const DOMAINS = [
  "ai",
  "api",
  "cli",
  "desktop",
  "infra",
  "meta",
  "mobile",
  "shared",
  "web",
] as const;
export type Domain = (typeof DOMAINS)[number];
```

9 members. Re-exported from `src/cli/types/matrix.ts`.

### Category (`src/cli/types/generated/source-types.ts`)

89 values covering all skill categories across domains:

- ai-\*: infrastructure, observability, orchestration, patterns, provider (5)
- api-\*: analytics, api, auth, baas, caching, cms, commerce, database, email, framework, graphql, messaging, observability, performance, queue, search, specs, vector-db (18)
- cli-\*: framework, prompts (2)
- desktop-\*: backend, framework, ipc, mobile, multiwindow, packaging, plugins, security, storage, testing, ui, updates (12)
- infra-\*: ci-cd, config, containers, iac, platform (5)
- meta-\*: design, methodology, reviewing (3)
- mobile-\*: animation, background, camera, deep-linking, deployment, framework, hardware, navigation, notifications, performance, security, storage, styling, testing, ui-components (15)
- shared-\*: monorepo, security, tooling (3)
- web-\*: 3d, accessibility, animation, client-state, dataviz, dnd, editor, error-handling, file-upload, files, forms, framework, i18n, maps, meta-framework, mocking, performance, pwa, realtime, routing, server-state, styling, testing, tooling, ui-components, utilities (26)

Re-exported from `src/cli/types/matrix.ts`.

**`defaultCategories` now defines all 89 (0.145.0).** `defaultCategories` in `src/cli/lib/configuration/default-categories.ts` previously defined 51 of the 89 union members, so `tsc --noEmit` failed with TS1360 and each of the 38 undefined categories was auto-synthesized at load time with a humanized display name ("Api Graphql"), `order: 999` and `exclusive: false` — which is what the wizard rendered. All 89 are now declared, of which **27 carry `exclusive: true`** and **6 carry `required: true`**. `src/cli/lib/configuration/__tests__/default-categories.test.ts` pins the key set against the generated `CATEGORIES` array so the two cannot drift again.

The `exclusive` flag is load-bearing beyond the wizard grid: cross-scope conflict masking reads it from the **merged matrix** (not from `defaultCategories`, so a source repo's overrides win) to decide whether a globally installed skill collides with a project-owned one. See [concepts/tombstone-pattern.md](../concepts/tombstone-pattern.md).

### CategoryPath (`src/cli/types/skills.ts`)

```typescript
type CategoryPath = Category | "local";
```

### ModelName (`src/cli/types/matrix.ts`)

Derived from the `MODEL_NAMES` const array (same array consumed by `modelNameSchema`):

```typescript
export const MODEL_NAMES = ["sonnet", "opus", "haiku", "inherit"] as const;
export type ModelName = (typeof MODEL_NAMES)[number];
```

### PermissionMode (`src/cli/types/matrix.ts`)

Derived from the `PERMISSION_MODES` const array (same array consumed by `permissionModeSchema`):

```typescript
export const PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "dontAsk",
  "bypassPermissions",
  "plan",
  "delegate",
] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];
```

## Named Aliases (Composite Types)

| Alias                    | Definition                                                                                         | File        |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ----------- |
| `CategorySelections`     | `Partial<Record<Category, SkillId[]>>`                                                             | `skills.ts` |
| `ResolvedCategorySkills` | `Partial<Record<Category, SkillId>>`                                                               | `skills.ts` |
| `DomainSelections`       | `Partial<Record<Domain, Partial<Record<Category, SkillId[]>>>>`                                    | `matrix.ts` |
| `CategoryMap`            | `Partial<Record<Category, CategoryDefinition>>`                                                    | `matrix.ts` |
| `SkillSlugMap`           | `{ slugToId: Partial<Record<SkillSlug, SkillId>>; idToSlug: Partial<Record<SkillId, SkillSlug>> }` | `matrix.ts` |
| `StackAgentConfig`       | `Partial<Record<Category, SkillAssignment[]>>`                                                     | `stacks.ts` |
| `PluginSkillRef`         | `` `${SkillId}:${SkillId}` ``                                                                      | `skills.ts` |
| `SkillDefinitionMap`     | `Partial<Record<SkillId, SkillDefinition>>`                                                        | `skills.ts` |
| `SkillAlias`             | `string`                                                                                           | `matrix.ts` |

Note: There is no `SkillRef` type alias. The type in `skills.ts` is `SkillReference` (an object type, not an alias).

## Shared Base Types (intersection bases)

Three types exist purely as intersection bases. Each is `export`ed, and its derivatives are written `Base & { extras }` rather than repeating the fields. They are structural only — no runtime shape change.

| Base              | File                      | Derived by                                                         |
| ----------------- | ------------------------- | ------------------------------------------------------------------ |
| `SkillCore`       | `src/cli/types/matrix.ts` | `ResolvedSkill` (post-merge), `ExtractedSkillMetadata` (pre-merge) |
| `BaseAgentFields` | `src/cli/types/agents.ts` | `AgentDefinition` (→ `AgentConfig`), `AgentYamlConfig`             |
| `SkillGroupRule`  | `src/cli/types/matrix.ts` | `ConflictRule`, `DiscourageRule`, `CompatibilityGroup`             |

### SkillCore (`src/cli/types/matrix.ts`)

Identity/description fields shared by the pre-merge and post-merge skill surfaces:

- `id: SkillId`, `slug: SkillSlug`, `displayName: string`, `description: string`
- `usageGuidance?: string`
- `category: CategoryPath` — matches a key in `matrix.categories`; determines the wizard category grid
- `author: string`, `path: string`
- `local?: boolean`, `localPath?: string`, `custom?: boolean`

### BaseAgentFields (`src/cli/types/agents.ts`)

- `title: string`, `description: string`
- `model?: ModelName`, `tools: string[]`, `disallowedTools?: string[]`, `permissionMode?: PermissionMode`
- `hooks?: Record<string, AgentHookDefinition[]>`, `outputFormat?: string`

### SkillGroupRule (`src/cli/types/matrix.ts`)

```typescript
export type SkillGroupRule = { skills: SkillSlug[]; reason: string };
export type ConflictRule = SkillGroupRule; // selecting one disables ALL others
export type DiscourageRule = SkillGroupRule; // selecting one warns for ALL others
export type CompatibilityGroup = SkillGroupRule; // all skills in the group work together
```

The three aliases are distinct names for the identical shape — they carry intent, not structure. `RequireRule`, `Recommendation`, and `AlternativeGroup` are **not** aliases of it (different shapes; see source).

## Core Data Structures

### ResolvedSkill (`src/cli/types/matrix.ts`)

The primary skill representation after matrix merge. Defined as `SkillCore & { … }`:

- Everything in [`SkillCore`](#skillcore-srcclitypesmatrixts): `id`, `slug`, `displayName`, `description`, `usageGuidance`, `category`, `author`, `path`, `local`, `localPath`, `custom`
- Relationships: `conflictsWith`, `requires`, `alternatives`, `discourages`, `compatibleWith`
- Recommendation: `isRecommended`, `recommendedReason`
- Sources: `availableSources`, `activeSource`

### MergedSkillsMatrix (`src/cli/types/matrix.ts`)

The primary read model for the wizard and CLI commands:

- `version: string`
- `categories: CategoryMap` - Category definitions
- `skills: Partial<Record<SkillId, ResolvedSkill>>` - All resolved skills
- `suggestedStacks: ResolvedStack[]` - Pre-configured stacks
- `slugMap: SkillSlugMap` - Bidirectional slug-to-ID mapping
- `agentDefinedDomains` - Domain overrides from agent metadata
- `generatedAt: string` - ISO timestamp

### ProjectConfig (`src/cli/types/config.ts`)

Unified project configuration stored at `.claude-src/config.ts`. No `version` field (removed under D-231; `config.ts` is a TypeScript module, not a versioned schema).

- `name`, `description?`, `author?`
- `agents: AgentScopeConfig[]` - Per-agent scope config (`{ name, scope, excluded? }`)
- `skills: SkillConfig[]` - Per-skill scope+source config (`{ id, scope, source, excluded? }`)
- `stack?: Record<string, StackAgentConfig>`
- `source?`, `marketplace?`, `agentsSource?`
- `domains?: Domain[]`, `selectedAgents?: AgentName[]`
- `sources?: SourceEntry[]` - Additional skill sources
- `boundSkills?: BoundSkill[]` - Skills bound via search
- `branding?: BrandingConfig` - White-label overrides
- Directory overrides: `skillsDir?`, `agentsDir?`, `stacksFile?`, `categoriesFile?`, `rulesFile?`
- `projects?: string[]` - Tracked project installation paths (global config only)

### SkillConfig (`src/cli/types/config.ts`)

Per-skill configuration entry used inside `ProjectConfig.skills`:

- `id: SkillId`
- `scope: "project" | "global"`
- `source: string` — `"eject"` or marketplace name (e.g., `"agents-inc"`). Drives per-skill `pluginRef` attachment in the compiler.
- `excluded?: boolean` — when true, skill is tracked in config but not installed/compiled

### AgentScopeConfig (`src/cli/types/config.ts`)

Per-agent configuration entry used inside `ProjectConfig.agents` (mirrors `SkillConfig` pattern):

- `name: AgentName`
- `scope: "project" | "global"`
- `excluded?: boolean`

### SkillScope & ClaudePluginScope (`src/cli/types/config.ts`)

Two distinct scope unions — do NOT conflate them:

```typescript
export type SkillScope = "project" | "global"; // cc-side install target
export type ClaudePluginScope = "project" | "user"; // Claude CLI --project/--user flag
```

- `SkillScope` — the cc scope stored on every `SkillConfig.scope` / `AgentScopeConfig.scope` / `ScopedEntry.scope`. `"global"` installs live under `~/.claude/`; `"project"` under `<projectDir>/.claude/`. Used throughout scope-splitting (`filter(s => s.scope === "global")`) before any path-dependent op.
- `ClaudePluginScope` — the value passed to the underlying `claude plugin install/uninstall --project|--user` command. Converted from a `SkillScope` by `toClaudePluginScope(scope)` in `src/cli/lib/plugins/plugin-ref.ts`: `"global"` → `"user"`, everything else (including `undefined`) → `"project"`. Consumed at the exec boundary in `src/cli/utils/exec.ts` and by the plugin install/uninstall operations.

### SourceEntry (`src/cli/types/config.ts`)

An additional skills source (private marketplace / custom repo) listed in `ProjectConfig.sources`:

- `name: string`
- `url: string` — e.g. `"github:acme-corp/skills"`
- `description?: string`
- `ref?: string` — git ref/branch pin

Re-exported from `src/cli/lib/configuration/config.ts` and `src/cli/lib/configuration/index.ts`.

### BrandingConfig (`src/cli/types/config.ts`)

White-label overrides stored in `ProjectConfig.branding`:

- `name?: string` — custom CLI name (e.g. `"Acme Dev Tools"`)
- `tagline?: string` — custom tagline shown in the wizard header

Re-exported from `src/cli/lib/configuration/config.ts` and `src/cli/lib/configuration/index.ts`.

### SkillReference (`src/cli/types/skills.ts`)

Skill reference used in agent config (stack → agent → skills mapping):

- `id: SkillId`
- `usage: string` — context-specific description of when to use this skill (required)
- `preloaded?: boolean`
- `source?: string` — install source propagated from `SkillConfig.source` (D-217). Absent when no `SkillConfig` entry exists (e.g., user-authored local skills). `"eject"` means ejected to `.claude/skills/`; any other value (e.g., marketplace name) means plugin-installed.

### Skill (`src/cli/types/skills.ts`)

Fully resolved skill consumed by the compiler (merged from `SkillDefinition` + `SkillReference`):

- All `SkillDefinition` fields: `id`, `path`, `description`
- `usage: string` — context-specific guidance for this agent
- `preloaded: boolean` — whether in frontmatter (auto-loaded) vs. dynamic
- `pluginRef?: PluginSkillRef` — fully-qualified plugin reference (`${id}:${id}`) for plugin mode
- `source?: string` — propagated from `SkillReference.source` (D-217). `source !== "eject"` → renders as `${id}:${id}`; otherwise bare id.

### SkillDefinition (`src/cli/types/skills.ts`)

Static skill metadata (decoupled from per-agent usage):

- `id: SkillId`
- `path: string`
- `description: string`

### CompileConfig (`src/cli/types/config.ts`)

Compile configuration derived from stack:

- `name`, `description`
- `stack?: string`
- `agents: Record<string, CompileAgentConfig>`

### CompileAgentConfig (`src/cli/types/config.ts`)

Per-agent skills mapping — the value type of `CompileConfig.agents` and of the `Record<string, CompileAgentConfig>` maps assembled in `src/cli/lib/agents/agent-recompiler.ts` and `src/cli/lib/resolver.ts`:

```typescript
export type CompileAgentConfig = {
  skills?: SkillReference[];
};
```

### CompileContext (`src/cli/types/config.ts`)

Compilation context passed through pipeline:

- `stackId`, `verbose`, `projectRoot`, `outputDir`

### ValidationResult (`src/cli/types/config.ts`)

Generic validation result:

- `valid: boolean`, `errors: string[]`, `warnings: string[]`

### AgentConfig (`src/cli/types/agents.ts`)

Fully resolved agent for compilation:

- All `AgentDefinition` fields (title, description, model, tools, etc.)
- `name: string`
- `skills: Skill[]` - Unified skills list

### CompiledAgentData (`src/cli/types/agents.ts`)

Template context for Liquid rendering:

- `agent: AgentConfig`
- Section content: `identity`, `playbook`, `output`, `criticalRequirementsTop`, `criticalReminders`
- `skills: Skill[]` - All skills
- Skill splits: `preloadedSkills`, `dynamicSkills`, `preloadedSkillIds`

### ExtractedSkillMetadata (`src/cli/types/matrix.ts`)

Skill metadata extracted from SKILL.md frontmatter + metadata.yaml **before** matrix merge. Defined as `SkillCore & { … }` — it adds exactly two fields on top of the shared base:

- Everything in [`SkillCore`](#skillcore-srcclitypesmatrixts)
- `directoryPath: string` — filesystem path for access, e.g. `"web/framework/react"`
- `domain: Domain`

Relationship fields (`compatibleWith`, `conflictsWith`, `requires`, …) are **absent** here: they are resolved from the centralized group declarations in `skill-rules.ts` during the merge, not from per-skill metadata. That is the whole structural difference between `ExtractedSkillMetadata` and `ResolvedSkill`.

### InstallMode (`src/cli/types/matrix.ts`)

```typescript
export type InstallMode = "eject" | "plugin" | "mixed";
```

Derived at runtime from `SkillConfig.source` by `deriveInstallMode(skills)` in `src/cli/lib/installation/installation.ts`: empty skills → `"eject"`; any mix of `EJECT_SOURCE` and non-eject sources → `"mixed"`. Re-exported from the installation barrel for existing importers, and labelled for display via `INSTALL_MODE_LABELS` (same file).

### SkillSourceType (`src/cli/types/matrix.ts`)

```typescript
export const SKILL_SOURCE_TYPES = ["public", "private", "local"] as const;
export type SkillSourceType = (typeof SKILL_SOURCE_TYPES)[number];
```

A const-array-derived union like `MODEL_NAMES` / `PERMISSION_MODES`, but note it has **no** `z.enum` bridge schema in `schemas.ts`.

### Installation (`src/cli/lib/installation/installation.ts`)

Result of `detectInstallation` / `detectProjectInstallation` / `detectGlobalInstallation`:

- `mode: InstallMode`, `configPath: string`, `agentsDir: string`, `skillsDir: string`, `projectDir: string`

Distinct from `InstallationInfo` (`src/cli/lib/plugins/plugin-info.ts`), which is the display-oriented shape carrying counts — documented in [features/plugin-system.md](../features/plugin-system.md). `InstallationInfo` has **no `version` field**; it was removed in 0.145.0 because it only ever held the install mode.

### LoadedProjectConfig (`src/cli/lib/configuration/project-config.ts`)

```typescript
export type LoadedProjectConfig = {
  config: ProjectConfig;
  configPath: string;
};
```

### ConfigLoadError (`src/cli/lib/configuration/project-config.ts`)

A named `Error` subclass — the only such class in the config layer — introduced by D-273.

```typescript
export class ConfigLoadError extends Error {
  constructor(
    readonly configPath: string,
    readonly reason: string,
  ) {
    super(`Config at '${configPath}' could not be loaded: ${reason}`);
    this.name = "ConfigLoadError";
  }
}
```

**Three-way outcome of `loadProjectConfigFromDir(projectDir)`.** Before D-273 the first two collapsed into a single `null`, so a corrupt `.claude-src/config.ts` was detected as a phantom eject installation and `compile` rebuilt all 23 built-in agents:

| On disk                                                                                     | Result                        | Meaning                                            |
| ------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| **Missing** — `fileExists(configPath)` is false                                             | `null`                        | Legitimately not installed                         |
| **Unloadable** — `loadConfig` throws, export is not an object, or the loader schema rejects | throws `ConfigLoadError`      | Corrupt; callers must surface it, never swallow it |
| **Content-less** — loads fine but declares neither skills nor agents                        | `LoadedProjectConfig` (valid) | Not an _installation_ — see below                  |

The three `ConfigLoadError` throw sites carry distinct `reason` values: `getErrorMessage(error)` from the loader, the literal `"the file has no valid default export"`, and `formatZodErrors(result.error).join("; ")` from `projectConfigLoaderSchema`.

**Content-less is a separate axis.** `loadProjectConfigFromDir` returns a valid `LoadedProjectConfig` for a config with `skills: []` and no `agents`; it is `detectInstallationInDir` (`installation.ts`) that returns `null` for it, so `init` routes to the setup wizard instead of the dashboard. That check reads `loaded.config.skills.length === 0 && (loaded.config.agents ?? []).length === 0` — `skills` is asserted directly because the loader defaults it to `[]`, `agents` is not defaulted and is guarded.

**Consumers (exhaustive):**

| File                                               | Handling                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/cli/commands/compile.ts`                      | `instanceof ConfigLoadError` → hard-errors **before any write**                                |
| `src/cli/lib/operations/project/detect-project.ts` | `instanceof ConfigLoadError` → converts to `null` so `doctor` / `edit` report a config problem |
| `src/cli/lib/installation/installation.ts`         | Lets it propagate — `detectInstallationInDir` no longer fabricates an installation             |
| `src/cli/commands/uninstall.tsx`                   | A corrupt global config must never fail the uninstall (diagnostic only)                        |

Exported from `src/cli/lib/configuration/index.ts`.

### Wizard/UI Types in `matrix.ts`

| Type                  | Purpose                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `OptionState`         | Discriminated union for skill advisory state (normal/recommended/discouraged/incompatible)            |
| `SkillOption`         | Skill as displayed in wizard (advisoryState/selected/unmetRequirements state)                         |
| `SelectionValidation` | Result of validating skill selections                                                                 |
| `ValidationError`     | Advisory validation error (non-blocking); `type: conflict \| missingRequirement \| categoryExclusive` |
| `ValidationWarning`   | Non-blocking validation warning; `type: missing_recommendation`                                       |
| `SkillSource`         | Source from which a skill can be obtained                                                             |
| `SkillSourceType`     | `"public" \| "private" \| "local"`                                                                    |
| `BoundSkill`          | Foreign skill bound to category via search                                                            |
| `BoundSkillCandidate` | Search result candidate before binding                                                                |
| `ResolvedStack`       | Stack with resolved skill IDs; `group?: string` for UI grouping                                       |

### SourceRowContext (`src/cli/stores/wizard-store.ts`)

Module-internal helper type (not exported) passed to `classifySkillSourceRows()` when the store builds the source-grid rows for one skill. **Four fields** — it gained `installedSkillSlots` under D-258:

```typescript
type SourceRowContext = {
  configEntry: SkillConfig | undefined; // saved config entry (scope/source/excluded probe)
  installedSkillConfigs: SkillConfig[] | null; // on-disk installed configs, used to detect a locked global row
  isEditingFromGlobalScope: boolean; // true when the edit session targets the global roster
  installedSkillSlots: ReadonlySet<string> | null; // D-258: `(id, scope)` slots the snapshot occupies — the baseline each row's `+` derives from
};
```

Steers whether a skill renders as a single editable `SourceRow`, a locked global row (`readOnly: true`) for excluded-global entries, or a locked-global + editable-project pair when a skill was re-scoped global→project this session. `SourceRow` / `SourceOption` are exported from `src/cli/components/wizard/source-grid.tsx`.

**Slot keys are shared with the confirm step.** `installedSkillSlots` holds `skillSlotKey(id, scope)` strings built by `skillSlotKey` in `src/cli/lib/wizard/scope-diff.ts` — the same function `computeScopeDiff` uses for its baseline. Keying both surfaces on `(id, scope)` rather than on the id alone is what stops the Sources tab and the confirm step from disagreeing about what changed this session (D-278). Two related module-internal row helpers sit alongside it in `wizard-store.ts`: `toPendingRemovalRow` (the inert red row for a snapshot slot this session emptied, D-257) and `isSlotAlreadyRendered` (suppresses a removal row for a slot an emitted row already covers, so an inherited global install does not read as both locked and removed).

## Types Documented Elsewhere (cross-references, not duplicated here)

| Type / area                                                         | Lives in                                                         | Documented in                                             |
| ------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| `CompilationResult`, `PropagatedRecompileSummary` (D-240 recompile) | `src/cli/lib/operations/project/recompile-project-agents.ts`     | [operations-types.md](./operations-types.md)              |
| `LoadedSource`, `PluginInstallResult`, `ConfigChanges`              | `src/cli/lib/operations/**`                                      | [operations-types.md](./operations-types.md)              |
| `WizardState` and every store action signature                      | `src/cli/stores/wizard-store.ts`                                 | [store-map.md](../store-map.md)                           |
| `InstallationInfo`, `PluginInfo`, `Marketplace*`                    | `src/cli/lib/plugins/plugin-info.ts`, `src/cli/types/plugins.ts` | [features/plugin-system.md](../features/plugin-system.md) |
| `ScopedEntry` and the scope predicates                              | `src/cli/lib/configuration/scope-predicates.ts`                  | [concepts/scope-system.md](../concepts/scope-system.md)   |

## Type Narrowing Rules

**From CLAUDE.md and memory:**

1. Union types are generated from source (`bun run generate:types`) for finite sets
2. `SkillId`, `Domain`, `Category`, and `AgentName` have NO standalone Zod schema in `schemas.ts` — they are accepted as lenient `z.string() as z.ZodType<...>` casts at parse boundaries, and narrowed at runtime with the `isSkillId()`/`isCategory()`/`isDomain()`/`isAgentName()` type guards. Only `SkillSlug`, `ModelName`, and `PermissionMode` have `z.enum(...)` bridge schemas; `CategoryPath` uses a `z.string().refine()`
3. Boundary casts only at data entry points (YAML parse, JSON parse, CLI args) with comments
4. Use `typedEntries()` / `typedKeys()` from `src/cli/utils/typed-object.ts` instead of raw `Object.entries()`/`Object.keys()`
5. Zod schemas at parse boundaries; post-safeParse `as T` casts are intentional (`.passthrough()` widens type)
6. Use type guards (`isCategory()`, `isDomain()`, `isAgentName()`, `isCategoryPath()`, `isSkillId()`, `isSkillSlug()`, `isRecord()`, `isSkillAssignment()`) from `src/cli/utils/type-guards.ts` for runtime narrowing (full table below)

## Type Guards (`src/cli/utils/type-guards.ts`)

| Function              | Signature                                              | Purpose                                                                              |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `isRecord()`          | `(value: unknown) => value is Record<string, unknown>` | Narrows parse output to a plain object (rejects arrays/primitives)                   |
| `isCategory()`        | `(value: string) => value is Category`                 | Validates against generated CATEGORIES array                                         |
| `isDomain()`          | `(value: string) => value is Domain`                   | Validates against generated DOMAINS array                                            |
| `isAgentName()`       | `(value: string) => value is AgentName`                | Validates against generated AGENT_NAMES array                                        |
| `isCategoryPath()`    | `(value: string) => value is CategoryPath`             | Validates: `"local"` or valid Category                                               |
| `isSkillId()`         | `(value: string) => value is SkillId`                  | Validates against generated SKILL_IDS array                                          |
| `isSkillSlug()`       | `(value: string) => value is SkillSlug`                | Validates against generated SKILL_SLUGS array                                        |
| `isSkillAssignment()` | `(value: unknown) => value is SkillAssignment`         | Structural check for `{ id, preloaded? }` (id-ness is structural, not union-checked) |

`isCategory`, `isDomain`, `isAgentName`, `isCategoryPath`, `isSkillId`, and `isSkillSlug` import the generated const arrays from `src/cli/types/generated/source-types.ts`. `isRecord` and `isSkillAssignment` are structural guards (no union lookup).

## Typed Object Helpers (`src/cli/utils/typed-object.ts`)

| Function             | Signature                                                                            | Purpose                                                               |
| -------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `typedEntries()`     | `<K extends string, V>(obj: Partial<Record<K, V>>) => [K, V][]`                      | Type-safe `Object.entries` preserving key types                       |
| `typedKeys()`        | `<K extends string>(obj: Partial<Record<K, unknown>>) => K[]`                        | Type-safe `Object.keys` preserving key types                          |
| `typedFromEntries()` | `<K extends string, V>(entries: Iterable<readonly [K, V]>) => Partial<Record<K, V>>` | Type-safe `Object.fromEntries` preserving key types                   |
| `typedValues()`      | `<K extends string, V>(obj: Partial<Record<K, V>>) => V[]`                           | Type-safe `Object.values` filtering out the Partial's undefined slots |
