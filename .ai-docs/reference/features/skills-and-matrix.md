---
scope: reference
area: features
keywords: [skills-matrix, categories, resolution, source-loading, multi-source]
related:
  - reference/features/agent-system.md
  - reference/features/plugin-system.md
  - reference/type-system.md
  - reference/features/wizard-flow.md
last_validated: 2026-04-21
---

# Skills & Matrix System

**Last Updated:** 2026-04-21

## Overview

**Purpose:** Load, resolve, and merge the skills matrix (category definitions + relationship rules + skill metadata) into a unified read model (`MergedSkillsMatrix`) consumed by the wizard and CLI commands.

## Key Concepts

| Concept            | Description                                                                 |
| ------------------ | --------------------------------------------------------------------------- |
| Skill Categories   | `config/skill-categories.ts` - category definitions (domains, display info) |
| Skill Rules        | `config/skill-rules.ts` - relationship rules between skills                 |
| Skill Metadata     | Per-skill `SKILL.md` frontmatter + `metadata.yaml`                          |
| MergedSkillsMatrix | Combined read model after categories + rules + skill metadata merge         |
| Skill Slug         | Short kebab-case key (e.g., "react") used in relationship rules             |
| Slug Map           | Bidirectional `SkillSlug <-> SkillId` mapping built during merge            |
| Source             | Where skills come from (public marketplace, private, local)                 |

## Current Counts (2026-04-21)

| Type       | Count | Source File                               |
| ---------- | ----- | ----------------------------------------- |
| SKILL_MAP  | 222   | `src/cli/types/generated/source-types.ts` |
| Categories | 89    | `src/cli/types/generated/source-types.ts` |
| Domains    | 9     | `src/cli/types/generated/source-types.ts` |
| AgentNames | 23    | `src/cli/types/generated/source-types.ts` |

**Domains:** ai, api, cli, desktop, infra, meta, mobile, shared, web

## File Structure

### Matrix System (`src/cli/lib/matrix/`)

| File                     | Path                                        | Purpose                                                              |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------------------- |
| `matrix-loader.ts`       | `src/cli/lib/matrix/matrix-loader.ts`       | Load categories + rules, extract skill metadata                      |
| `matrix-resolver.ts`     | `src/cli/lib/matrix/matrix-resolver.ts`     | Alias resolution, relationship queries, validation                   |
| `matrix-provider.ts`     | `src/cli/lib/matrix/matrix-provider.ts`     | Singleton matrix holder, asserting lookups (getSkillById, findStack) |
| `skill-resolution.ts`    | `src/cli/lib/matrix/skill-resolution.ts`    | Merge categories + rules + skills into MergedSkillsMatrix            |
| `matrix-health-check.ts` | `src/cli/lib/matrix/matrix-health-check.ts` | Validate matrix integrity                                            |
| `index.ts`               | `src/cli/lib/matrix/index.ts`               | Barrel exports                                                       |

### Skills System (`src/cli/lib/skills/`)

| File                       | Path                                          | Purpose                                                 |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `skill-fetcher.ts`         | `src/cli/lib/skills/skill-fetcher.ts`         | Fetch skills from source directories                    |
| `skill-metadata.ts`        | `src/cli/lib/skills/skill-metadata.ts`        | Read/write skill metadata, hashing                      |
| `skill-copier.ts`          | `src/cli/lib/skills/skill-copier.ts`          | Copy skills to local/plugin dirs                        |
| `skill-plugin-compiler.ts` | `src/cli/lib/skills/skill-plugin-compiler.ts` | Compile skill as Claude plugin                          |
| `local-skill-loader.ts`    | `src/cli/lib/skills/local-skill-loader.ts`    | Discover local skills in project                        |
| `source-switcher.ts`       | `src/cli/lib/skills/source-switcher.ts`       | Delete/migrate local skills for source switching        |
| `generators.ts`            | `src/cli/lib/skills/generators.ts`            | Generate skill-categories.ts and skill-rules.ts content |
| `index.ts`                 | `src/cli/lib/skills/index.ts`                 | Barrel exports                                          |

### Loading System (`src/cli/lib/loading/`)

| File                     | Path                                         | Purpose                              |
| ------------------------ | -------------------------------------------- | ------------------------------------ |
| `source-loader.ts`       | `src/cli/lib/loading/source-loader.ts`       | Load matrix from resolved source     |
| `source-fetcher.ts`      | `src/cli/lib/loading/source-fetcher.ts`      | Fetch/cache remote sources via giget |
| `multi-source-loader.ts` | `src/cli/lib/loading/multi-source-loader.ts` | Load skills from multiple sources    |
| `loader.ts`              | `src/cli/lib/loading/loader.ts`              | YAML/frontmatter parsing utilities   |
| `index.ts`               | `src/cli/lib/loading/index.ts`               | Barrel exports                       |

## Data Flow

```
1. Source Resolution
   resolveSource() -> ResolvedConfig { source, sourceOrigin, marketplace }

2. Source Fetching
   fetchFromSource() (source-fetcher.ts)
   -> Local: uses directory directly
   -> Remote: fetches via giget to cache dir (~/.cache/agents-inc/)

3. Category + Rules Loading
   loadSkillCategories() (matrix-loader.ts) -> CategoryMap
   loadSkillRules() (matrix-loader.ts) -> SkillRulesConfig { relationships: RelationshipDefinitions }

4. Skill Extraction
   extractAllSkills() (matrix-loader.ts)
   -> Walks source skills directory
   -> Reads SKILL.md frontmatter (parseFrontmatter from loader.ts)
   -> Reads metadata.yaml (parseYaml then Zod-validated via rawMetadataSchema)
   -> Invalid Zod shape: warn + skip (per-file, continues)
   -> Invalid YAML syntax: parseYaml throws and aborts the whole extraction pass
      (see Known Limitations #2)
   -> Returns ExtractedSkillMetadata[]

5. Matrix Merge
   mergeMatrixWithSkills() (skill-resolution.ts)
   -> Combines categories + extracted metadata + relationship rules
   -> Builds bidirectional slug map (SkillSlug <-> SkillId) -- primary skills only;
      local/custom slugs are NOT added (see Known Limitations #3)
   -> Resolves slug-based relationships to canonical SkillIds; unresolved slugs
      are warned and dropped (see Known Limitations #4, #7)
   -> Auto-synthesizes missing categories (exclusive: false by default) -- fires
      for built-ins too, masking marketplace drift (see Known Limitations #6)
   -> Duplicate skill IDs silently overwrite (see Known Limitations #1)
   -> Returns MergedSkillsMatrix

6. Multi-Source Loading (optional)
   loadSkillsFromAllSources() (multi-source-loader.ts)
   -> Loads skills from primary + extra configured sources
   -> Merges availableSources onto each ResolvedSkill
   -> Sets activeSource based on installation state
   -> NOTE: extras' skill-categories.ts and skill-rules.ts are NOT loaded.
      Only their skill metadata is read (tagExtraSources). See Known Limitations #5.

7. Combined Pipeline
   loadSkillsMatrixFromSource() (source-loader.ts)
   -> For default source: uses pre-computed BUILT_IN_MATRIX
   -> Otherwise: fetch -> load categories/rules -> extract skills -> merge -> multi-source
   -> Calls initializeMatrix() to set the singleton
   -> Returns SourceLoadResult
```

## Matrix Provider (`src/cli/lib/matrix/matrix-provider.ts`)

Singleton module holding the current `MergedSkillsMatrix` instance. Starts as `BUILT_IN_MATRIX`, replaced after local skill merge on startup via `initializeMatrix()`.

**Exported functions:**

- `matrix` (let) - The current matrix instance
- `initializeMatrix(merged)` - Replace the singleton
- `getSkillById(id: SkillId): ResolvedSkill` - Asserting lookup, throws if not found
- `getSkillBySlug(slug: SkillSlug): ResolvedSkill` - Resolves slug to ID via `slugMap`, throws if not found
- `getCustomSkillIds(): Set<SkillId>` - Returns IDs of all custom skills
- `getCategoryDomain(category: string): Domain | undefined` - Look up category's domain
- `hasSkill(id: string): boolean` - Check if a skill ID exists in the matrix
- `findStack(stackId: string): ResolvedStack | undefined` - Optional stack lookup by ID

**Barrel re-exports** (from `matrix/index.ts`): `matrix`, `initializeMatrix`, `getSkillById`, `getSkillBySlug`, `findStack`. Note: `getCustomSkillIds`, `getCategoryDomain`, `hasSkill` are exported from `matrix-provider.ts` but NOT re-exported from the barrel. Import them directly from `matrix-provider.ts`.

## Skill Resolution (`src/cli/lib/matrix/skill-resolution.ts`)

Contains the core merge logic that combines categories, relationship rules, and extracted skill metadata into a `MergedSkillsMatrix`.

**Exported functions:**

- `mergeMatrixWithSkills(categories, relationships, skills)` - Main merge function
- `synthesizeCategory(category, domain)` - Create a basic CategoryDefinition for undefined categories

**Internal function:**

- `resolveRelationships(skillId, relationships, resolve)` - Unified resolver (R-08) that resolves all five relationship types (conflicts, discourages, compatibleWith, requires, alternatives) in a single pass for each skill. Unresolved slugs are filtered out (`warn` only) and the rule proceeds with the surviving subset -- see Known Limitations #4 and #7.

## SourceLoadResult (`src/cli/lib/loading/source-loader.ts`)

```typescript
type SourceLoadResult = {
  matrix: MergedSkillsMatrix;
  sourceConfig: ResolvedConfig;
  sourcePath: string;
  isLocal: boolean;
  marketplace?: string;
  marketplaceDisplayName?: string;
};
```

## Skill Metadata Sources

Each skill has two metadata files:

### SKILL.md Frontmatter

```yaml
---
name: web-framework-react
description: React component patterns and hooks
model: sonnet
---
```

Parsed by `parseFrontmatter()` from `src/cli/lib/loading/loader.ts`.

### metadata.yaml

```yaml
category: web-framework
author: "@vince"
slug: react
domain: web
displayName: React
```

Validated with `rawMetadataSchema` in `src/cli/lib/matrix/matrix-loader.ts`.

**Schema fields:** `category` (required), `author` (required), `slug` (required), `domain` (required), `displayName` (optional), `cliDescription` (optional), `usageGuidance` (optional), `custom` (optional boolean).

**Note:** Relationship fields (`compatibleWith`, `conflictsWith`, `requires`, etc.) are NOT in per-skill metadata. They are defined centrally in `config/skill-rules.ts` as slug-based group rules and resolved during the merge step.

**Note:** `tags` and `version` are NOT part of the schema. Do not add them to metadata.yaml.

## Alias Resolution

**Function:** `resolveAlias()` in `src/cli/lib/matrix/matrix-resolver.ts`

Validates that a skill ID exists in the matrix:

- Input: `"web-framework-react"` -> Output: `"web-framework-react"` (confirmed to exist)
- Lookup via `matrix.skills[skillId]`
- Throws if the ID is not found in the matrix

## Relationship System

Defined in `config/skill-rules.ts` under `relationships` using skill slugs:

| Type             | Effect                                  | Enforcement         |
| ---------------- | --------------------------------------- | ------------------- |
| `conflicts`      | Selecting one disables others           | Hard (grays out)    |
| `discourages`    | Selecting one warns about others        | Soft (warning icon) |
| `recommends`     | Selecting one highlights companions     | Soft (highlight)    |
| `requires`       | Skill A needs skill B first             | Hard (dependency)   |
| `alternatives`   | Interchangeable skills for same purpose | Informational       |
| `compatibleWith` | Symmetric compatibility groups          | Framework filtering |

All relationship rules use `SkillSlug` references (e.g., `"react"`, `"zustand"`) which are resolved to canonical `SkillId`s during the merge step via the slug map.

### Relationship Query Functions (`matrix-resolver.ts`)

Checked per-skill by exported functions:

| Function                       | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `resolveAlias()`               | Validate skill ID exists in matrix                         |
| `getDependentSkills()`         | Find skills that depend on a given skill                   |
| `getUnmetRequiredBy()`         | Find first selected skill with unmet need for this skill   |
| `isDiscouraged()`              | Check if skill is discouraged by discourages relationships |
| `isIncompatible()`             | Check if skill conflicts or has unsatisfiable requires     |
| `hasUnmetRequirements()`       | Check if selected skill has unmet dependencies             |
| `getDiscourageReason()`        | Get human-readable discouragement reason                   |
| `getIncompatibleReason()`      | Get human-readable incompatibility reason                  |
| `getUnmetRequirementsReason()` | Get human-readable unmet requirements reason               |
| `isRecommended()`              | Check if skill is recommended by selected skills           |
| `getRecommendReason()`         | Get human-readable recommendation reason                   |
| `getAvailableSkills()`         | Get skills for a category with state annotations           |
| `getSkillsByCategory()`        | Get all resolved skills belonging to a category            |

**Barrel re-exports** (from `matrix/index.ts`): All 13 functions above, plus `validateSelection`. `validateConflicts`, `validateRequirements`, `validateExclusivity`, `validateRecommendations` are exported from `matrix-resolver.ts` directly but NOT re-exported from the barrel.

## Validation

**Function:** `validateSelection()` in `src/cli/lib/matrix/matrix-resolver.ts`

Runs four validation passes via helper functions:

| Function                    | What it validates                              |
| --------------------------- | ---------------------------------------------- |
| `validateConflicts()`       | Mutually exclusive skill pairs                 |
| `validateRequirements()`    | Required dependencies                          |
| `validateExclusivity()`     | Category exclusive violations                  |
| `validateRecommendations()` | Missing recommended companions (warnings only) |

Returns `SelectionValidation` with `valid` flag, error list, and warning list.

**Function:** `checkMatrixHealth()` at `src/cli/lib/matrix/matrix-health-check.ts`

Validates matrix integrity: orphaned skills, missing categories, broken references.

## Source Switching

**File:** `src/cli/lib/skills/source-switcher.ts`

When changing a skill's source:

- `deleteLocalSkill(projectDir, skillId)` - Permanently removes local skill directory
- `migrateLocalSkillScope(skillId, fromScope, projectDir)` - Moves skill files between project and global directories when scope changes

## Skill Versioning

**File:** `src/cli/lib/versioning.ts`

- `computeSkillFolderHash()` - SHA-256 hash of skill directory contents
- Used for `forkedFrom.contentHash` in metadata to detect local modifications

## Skill Generators

**File:** `src/cli/lib/skills/generators.ts`

Generates config file content for custom skills:

- `generateSkillCategoriesTs(category, domain)` - Generate a `skill-categories.ts` with one category entry
- `generateSkillRulesTs()` - Generate an empty `skill-rules.ts`
- `buildCategoryEntry(category, domain)` - Build a single category definition object
- `toTitleCase(kebabCase)` - Convert kebab-case to Title Case

## Stacks System (`src/cli/lib/stacks/`)

| File                       | Path                                          | Purpose                        |
| -------------------------- | --------------------------------------------- | ------------------------------ |
| `stacks-loader.ts`         | `src/cli/lib/stacks/stacks-loader.ts`         | Load stacks from stacks.ts     |
| `stack-installer.ts`       | `src/cli/lib/stacks/stack-installer.ts`       | Install stack as plugin        |
| `stack-plugin-compiler.ts` | `src/cli/lib/stacks/stack-plugin-compiler.ts` | Compile stack as plugin bundle |

Stacks are pre-configured bundles of skills mapped to agents. Defined in `config/stacks.ts`.

**Key functions (`stacks-loader.ts`):**

- `loadStacks()` - Load all stacks from TS config
- `loadStackById()` - Load specific stack
- `resolveAgentConfigToSkills()` - Resolve stack agent config to skill assignments
- `getStackSkillIds()` - Extract flat skill ID list from stack
- `normalizeStackRecord()` - Normalize stack values to `SkillAssignment[]` arrays
- `normalizeAgentConfig()` - Normalize agent config entries
- `resolveStackSkills()` - Resolve all stack skills by agent

## Known Limitations (D-214 matrix-hardening gaps)

Cross-ref: `todo/TODO.md` -> D-214 "Matrix composition hardening — prereq to re-enabling `new marketplace`". These are current behaviors, not bugs to fix in the doc. Do not document over them -- they must stay visible until D-214 lands.

| #   | Limitation                                          | Where                                                                                                                | Current behavior                                                                                                                                                                                               |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Duplicate skill IDs silently overwrite              | `mergeMatrixWithSkills` in `skill-resolution.ts`                                                                     | Second skill with same `id` replaces the first in `resolvedSkills` with no warn. Order depends on glob order. `buildSlugMap` warns on slug collision -- IDs do not.                                            |
| 2   | Invalid YAML crashes whole matrix load              | `extractAllSkills` in `matrix-loader.ts`                                                                             | `parseYaml(metadataContent)` is not try-wrapped. One malformed `metadata.yaml` throws and aborts the entire extraction pass, so the whole matrix fails to load.                                                |
| 3   | Custom skill slugs are never added to `slugMap`     | `mergeLocalSkillsIntoMatrix` in `source-loader.ts`                                                                   | Local/custom skills are appended to `matrix.skills` but `buildSlugMap` is not re-run. `getSkillBySlug("<custom-slug>")` throws. Stacks and rules can't address them.                                           |
| 4   | Partial `requires` resolution pretends to succeed   | `resolveRelationships` in `skill-resolution.ts` (requires branch)                                                    | Unresolved slugs in `rule.needs` are filtered out; the rule proceeds with whatever remains. `needsAny: false` (AND) silently narrows to "AND of what resolved".                                                |
| 5   | Extras do not participate in the relationship graph | `tagExtraSources` in `multi-source-loader.ts`                                                                        | Extra sources load only via `extractAllSkills` to tag `availableSources`. Their `skill-categories.ts` and `skill-rules.ts` are never loaded. A skill shipped in an extra with `requires: [...]` has no effect. |
| 6   | Auto-synth fires for built-ins too                  | `mergeMatrixWithSkills` -> `synthesizeCategory` in `skill-resolution.ts`                                             | Any skill referencing an undefined category gets an `order: 999` placeholder, regardless of `custom`. Built-in marketplace drift is masked instead of failing loudly.                                          |
| 7   | Unresolved slugs dropped before `checkMatrixHealth` | `resolveToCanonicalId` in `skill-resolution.ts`                                                                      | `warn(...)` only. No `unresolvedSlugs[]` is returned from the merge, so `validate` cannot surface a typo in a marketplace's `skill-rules.ts`.                                                                  |
| 8   | Duplicate-slug reverse map is half-written          | `buildSlugMap` in `skill-resolution.ts`                                                                              | When slug A is already taken, the loser's `idToSlug[loser.id]` is never written. Consumers reading `idToSlug` for the loser get `undefined`.                                                                   |
| 9   | Double `initializeMatrix` write                     | `source-loader.ts` (`loadAndMergeFromBasePath` intermediate write, plus final write in `loadSkillsMatrixFromSource`) | Singleton is set twice -- once before local/extra merge, once after. Any consumer reading between the two sees a stale matrix.                                                                                 |

**Consumer rule:** treat the matrix composition pipeline as current-known-behavior. If you are reading the matrix in `validate`, `new marketplace`, or any new path that exercises multi-source / custom-skill composition, assume these gaps exist and guard around them. `new marketplace` itself is gated behind `FEATURE_FLAGS.NEW_MARKETPLACE_COMMAND` (`false`) until D-214 lands.

## Operations Layer Integration

The operations layer (`src/cli/lib/operations/skills/`) provides higher-level wrappers used by commands:

| Operation                   | File                                             | Wraps                                                                               |
| --------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `discoverInstalledSkills()` | `operations/skills/discover-skills.ts`           | 4-way merge: global plugins + global local + project plugins + project local skills |
| `compareSkillsWithSource()` | `operations/skills/compare-skills.ts`            | `compareLocalSkillsWithSource()` from `skill-metadata.ts` for both scopes           |
| `findSkillMatch()`          | `operations/skills/find-skill-match.ts`          | Skill lookup by exact ID, partial name, or directory name                           |
| `installPluginSkills()`     | `operations/skills/install-plugin-skills.ts`     | Install skill plugins via Claude CLI by scope                                       |
| `uninstallPluginSkills()`   | `operations/skills/uninstall-plugin-skills.ts`   | Uninstall skill plugins via Claude CLI by scope                                     |
| `copyLocalSkills()`         | `operations/skills/copy-local-skills.ts`         | Copy local-source skills to scope-appropriate directories                           |
| `collectScopedSkillDirs()`  | `operations/skills/collect-scoped-skill-dirs.ts` | List local skill directories with scope annotations                                 |

See `reference/features/operations-layer.md` for the full operations layer documentation.
