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
  ]
related:
  - reference/types/operations-types.md
  - reference/types/zod-schemas.md
  - reference/architecture/overview.md
last_validated: 2026-04-21
---

# Core Types

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

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
- Runtime validation uses `skillIdSchema` in `schemas.ts` with `.refine()` against `SKILL_IDS` array
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

### CategoryPath (`src/cli/types/skills.ts`)

```typescript
type CategoryPath = Category | "local";
```

### ModelName (`src/cli/types/matrix.ts`)

```typescript
type ModelName = "sonnet" | "opus" | "haiku" | "inherit";
```

### PermissionMode (`src/cli/types/matrix.ts`)

```typescript
type PermissionMode =
  | "default"
  | "acceptEdits"
  | "dontAsk"
  | "bypassPermissions"
  | "plan"
  | "delegate";
```

## Named Aliases (Composite Types)

| Alias                    | Definition                                                                                         | File        |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ----------- |
| `CategorySelections`     | `Partial<Record<Category, SkillId[]>>`                                                             | `skills.ts` |
| `ResolvedCategorySkills` | `Partial<Record<Category, SkillId>>`                                                               | `skills.ts` |
| `DomainSelections`       | `Partial<Record<Domain, Partial<Record<Category, SkillId[]>>>>`                                    | `matrix.ts` |
| `CategoryMap`            | `Partial<Record<Category, CategoryDefinition>>`                                                    | `matrix.ts` |
| `CategoryDomainMap`      | `Partial<Record<Category, { domain?: Domain }>>`                                                   | `matrix.ts` |
| `SkillSlugMap`           | `{ slugToId: Partial<Record<SkillSlug, SkillId>>; idToSlug: Partial<Record<SkillId, SkillSlug>> }` | `matrix.ts` |
| `StackAgentConfig`       | `Partial<Record<Category, SkillAssignment[]>>`                                                     | `stacks.ts` |
| `PluginSkillRef`         | `` `${SkillId}:${SkillId}` ``                                                                      | `skills.ts` |
| `SkillDefinitionMap`     | `Partial<Record<SkillId, SkillDefinition>>`                                                        | `skills.ts` |
| `SkillAlias`             | `string`                                                                                           | `matrix.ts` |

Note: There is no `SkillRef` type alias. The type in `skills.ts` is `SkillReference` (an object type, not an alias).

## Core Data Structures

### ResolvedSkill (`src/cli/types/matrix.ts`)

The primary skill representation after matrix merge. Contains:

- Identity: `id`, `slug`, `displayName`, `description`, `category`, `path`
- Guidance: `usageGuidance`
- Relationships: `conflictsWith`, `requires`, `alternatives`, `discourages`, `compatibleWith`
- Recommendation: `isRecommended`, `recommendedReason`
- Local: `local`, `custom`, `localPath`
- Sources: `availableSources`, `activeSource`
- Author: `author`

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

Skill metadata extracted from SKILL.md frontmatter + metadata.yaml before matrix merge:

- Identity: `id`, `directoryPath`, `description`, `category`, `path`, `slug`, `displayName`
- Metadata: `author`, `usageGuidance`
- Flags: `local`, `localPath`, `domain`, `custom`

### Wizard/UI Types in `matrix.ts`

| Type                  | Purpose                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `OptionState`         | Discriminated union for skill advisory state (normal/recommended/discouraged/incompatible) |
| `SkillOption`         | Skill as displayed in wizard (advisoryState/selected/unmetRequirements state)              |
| `SelectionValidation` | Result of validating skill selections                                                      |
| `ValidationError`     | Blocking validation error                                                                  |
| `ValidationWarning`   | Non-blocking validation warning                                                            |
| `SkillSource`         | Source from which a skill can be obtained                                                  |
| `SkillSourceType`     | `"public" \| "private" \| "local"`                                                         |
| `BoundSkill`          | Foreign skill bound to category via search                                                 |
| `BoundSkillCandidate` | Search result candidate before binding                                                     |
| `ResolvedStack`       | Stack with resolved skill IDs; `group?: string` for UI grouping                            |
| `SuggestedStack`      | Pre-configured stack from stacks.ts (before resolution); `group?: string` for UI grouping  |

## Type Narrowing Rules

**From CLAUDE.md and memory:**

1. Union types are generated from source (`bun run generate:types`) for finite sets
2. Skill ID validation uses `skillIdSchema` with `.refine()` against the generated `SKILL_IDS` array
3. Boundary casts only at data entry points (YAML parse, JSON parse, CLI args) with comments
4. Use `typedEntries()` / `typedKeys()` from `src/cli/utils/typed-object.ts` instead of raw `Object.entries()`/`Object.keys()`
5. Zod schemas at parse boundaries; post-safeParse `as T` casts are intentional (`.passthrough()` widens type)
6. Use type guards (`isCategory()`, `isDomain()`, `isAgentName()`, `isCategoryPath()`) from `src/cli/utils/type-guards.ts` for runtime narrowing

## Type Guards (`src/cli/utils/type-guards.ts`)

| Function           | Signature                                  | Purpose                                       |
| ------------------ | ------------------------------------------ | --------------------------------------------- |
| `isCategory()`     | `(value: string) => value is Category`     | Validates against generated CATEGORIES array  |
| `isDomain()`       | `(value: string) => value is Domain`       | Validates against generated DOMAINS array     |
| `isAgentName()`    | `(value: string) => value is AgentName`    | Validates against generated AGENT_NAMES array |
| `isCategoryPath()` | `(value: string) => value is CategoryPath` | Validates: `"local"` or valid Category        |

All guards import from `src/cli/types/generated/source-types.ts` and check against the generated const arrays.

## Typed Object Helpers (`src/cli/utils/typed-object.ts`)

| Function         | Signature                                                       | Purpose                                         |
| ---------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| `typedEntries()` | `<K extends string, V>(obj: Partial<Record<K, V>>) => [K, V][]` | Type-safe `Object.entries` preserving key types |
| `typedKeys()`    | `<K extends string>(obj: Partial<Record<K, unknown>>) => K[]`   | Type-safe `Object.keys` preserving key types    |
