---
scope: reference
area: features
keywords:
  [
    skills-matrix,
    categories,
    resolution,
    source-loading,
    multi-source,
    matrixOnly,
    skipExtraSources,
    source-validation,
    cliDescription,
    default-categories,
  ]
related:
  - reference/features/agent-system.md
  - reference/features/plugin-system.md
  - reference/type-system.md
  - reference/types/zod-schemas.md
  - reference/features/wizard-flow.md
  - reference/commands/index.md
last_validated: 2026-07-30
---

<!-- re-validated 2026-07-30 (product v0.146.0): documented the new `matrixOnly` SourceLoadOptions flag (offline default-source load, empty sourcePath) with its callers and its skipExtraSources parity claim; added a Source Validation section for source-validator.ts covering the three rule changes (advisory over-length cliDescription via splitMetadataValidationIssues, checkDisplayNameMatches -> checkDirNameMatchesSkillId running independently of metadata validity, and the plugins pass moving to the claude CLI v2 registry — cross-referenced, not duplicated); corrected Known Limitation #6, since defaultCategories now covers all 89 generated categories (pinned by default-categories.test.ts) so no built-in category auto-synthesizes; recorded that loadAndMergeSkillsMatrix has no production callers and merges no defaults; tightened the loadSkillRules relationship-default wording -->

# Skills & Matrix System

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

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

## Current Counts (2026-07-30)

| Type                | Count | Source File                                       |
| ------------------- | ----- | ------------------------------------------------- |
| SKILL_MAP           | 222   | `src/cli/types/generated/source-types.ts`         |
| SKILL_IDS           | 222   | `src/cli/types/generated/source-types.ts`         |
| SKILL_SLUGS         | 222   | `src/cli/types/generated/source-types.ts`         |
| CATEGORIES          | 89    | `src/cli/types/generated/source-types.ts`         |
| DOMAINS             | 9     | `src/cli/types/generated/source-types.ts`         |
| AGENT_NAMES         | 23    | `src/cli/types/generated/source-types.ts`         |
| `defaultCategories` | 89    | `src/cli/lib/configuration/default-categories.ts` |

**Domains:** ai, api, cli, desktop, infra, meta, mobile, shared, web

`defaultCategories` and the generated `CATEGORIES` union are pinned to each other by
`src/cli/lib/configuration/__tests__/default-categories.test.ts` (`toStrictEqual` on the sorted key
sets, plus an `EXPECTED_CATEGORY_COUNT` of 89). A marketplace introducing a new category therefore
fails that test until a matching `defaultCategories` entry is added — see Known Limitations #6.

## File Structure

### Matrix System (`src/cli/lib/matrix/`)

| File                     | Path                                        | Purpose                                                              |
| ------------------------ | ------------------------------------------- | -------------------------------------------------------------------- |
| `matrix-loader.ts`       | `src/cli/lib/matrix/matrix-loader.ts`       | Load categories + rules, extract skill metadata                      |
| `matrix-resolver.ts`     | `src/cli/lib/matrix/matrix-resolver.ts`     | Relationship queries, compatibility checks, selection validation     |
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
   -> Globs `**/metadata.yaml` under the source skills directory
   -> Skips any skill whose sibling SKILL.md is missing (verbose, continues)
   -> Reads metadata.yaml (parseYaml then Zod-validated via matrixRawMetadataSchema
      from schemas.ts)
   -> Invalid Zod shape: warn + skip (per-file, continues)
   -> Invalid metadata.yaml YAML syntax: parseYaml throws and aborts the whole
      extraction pass (see Known Limitations #2)
   -> Reads SKILL.md frontmatter (parseFrontmatter from loader.ts); skill id =
      frontmatter.name. Null frontmatter (absent or malformed): skip
   -> Missing metadata.yaml `displayName`: throws a hard error, aborting the whole
      pass (see the metadata.yaml note below)
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
   loadSkillsFromAllSources() (multi-source-loader.ts) — six-phase in-place tagging:
   1. Primary  — tag every skill with the primary source (public/private marketplace)
   2. Local    — tag `local: true` skills as installed via the local (eject) source
   3. Plugin   — tag plugin-installed skills (settings.json + global cache)
   4. Public fallback — when primary is a private marketplace, fetch the default
      public source and tag matching skills so users can switch sources
   5. Extra sources — fetch each configured extra source and tag matching skills
   6. Active source — set `activeSource` to the installed variant, else first available
   -> Merges availableSources / activeSource onto each ResolvedSkill (mutates in place)
   -> NOTE: extras' skill-categories.ts and skill-rules.ts are NOT loaded.
      Only their skill metadata is read (tagExtraSources). See Known Limitations #5.

   searchExtraSources(alias: SkillAlias, configuredSources: SourceEntry[]): Promise<BoundSkillCandidate[]>
   in the same file is a separate entry point used by the wizard's skill-search modal — it
   fetches configured extra sources and matches skills by the last path segment of the skill
   directory (case-insensitive), returning one BoundSkillCandidate per match
   ({ id, sourceUrl, sourceName, alias, description? }). Returns an empty array when no
   sources are configured; never throws (per-source errors are warned and skipped).

7. Combined Pipeline
   loadSkillsMatrixFromSource() (source-loader.ts)
   -> resolveBaseResult():
      - Default source (and not devMode): uses pre-computed BUILT_IN_MATRIX.
        Still calls fetchFromSource() to resolve sourcePath UNLESS matrixOnly is
        set, in which case the fetch is skipped and sourcePath is "" (see
        Source Load Options below)
      - Local path / devMode: loadFromLocal()
      - Otherwise: loadFromRemote() — fetch -> load categories/rules ->
        extract skills -> merge (loadAndMergeFromBasePath)
   -> Merges discovered local skills (global then project; project wins on conflict).
      Global merge is skipped when projectDir IS the home directory
      (isHomeDirectory) so a global-scope run does not merge itself twice
   -> Runs loadSkillsFromAllSources() for multi-source tagging (unless skipExtraSources)
   -> Calls checkMatrixHealth(), then initializeMatrix() to set the singleton
   -> Returns SourceLoadResult
```

## Matrix Provider (`src/cli/lib/matrix/matrix-provider.ts`)

Singleton module holding the current `MergedSkillsMatrix` instance. Starts as `BUILT_IN_MATRIX`, replaced after local skill merge on startup via `initializeMatrix()`.

**Exported functions:**

- `matrix` (let) - The current matrix instance
- `initializeMatrix(merged)` - Replace the singleton
- `getSkillById(id: SkillId): ResolvedSkill` - Asserting lookup, throws if not found
- `getSkillDisplayName(id: SkillId): string` - Display label for an ID, falling back to the raw ID (optional chaining sanctioned here — callers may render IDs absent from the current matrix)
- `getSkillBySlug(slug: SkillSlug): ResolvedSkill` - Resolves slug to ID via `slugMap.slugToId`, throws if not found
- `allSkills(): ResolvedSkill[]` - All resolved skills in the current matrix (skips sparse-record holes)
- `getCustomSkillIds(): Set<SkillId>` - Returns IDs of all custom skills
- `getCategoryDomain(category: string): Domain | undefined` - Look up category's domain
- `hasSkill(id: string): boolean` - Check if a skill ID exists in the matrix
- `findStack(stackId: string): ResolvedStack | undefined` - Optional stack lookup by ID

**Barrel re-exports** (from `matrix/index.ts`): `matrix`, `initializeMatrix`, `getSkillById`, `getSkillBySlug`, `findStack`. Note: `getSkillDisplayName`, `allSkills`, `getCustomSkillIds`, `getCategoryDomain`, `hasSkill` are exported from `matrix-provider.ts` but NOT re-exported from the barrel. Import them directly from `matrix-provider.ts`.

## Matrix Loader (`src/cli/lib/matrix/matrix-loader.ts`)

Loads category/rule config files and extracts per-skill metadata from a skills directory.

**Exported functions** (all four re-exported from `matrix/index.ts`):

- `loadSkillCategories(configPath)` - Load + Zod-validate a `skill-categories.ts` file into a `CategoryMap` (throws when the file cannot be loaded or fails validation)
- `loadSkillRules(configPath)` - Load + Zod-validate a `skill-rules.ts` file into a `SkillRulesConfig`. When the loaded module has no `relationships` key at all, the whole object is replaced with one carrying five empty lists (`conflicts`, `discourages`, `recommends`, `requires`, `alternatives`) — note `compatibleWith` is **not** in that default and stays `undefined`, which every consumer reads as `?? []`
- `extractAllSkills(skillsDir)` - Glob `**/metadata.yaml` and build `ExtractedSkillMetadata[]` (see Data Flow step 4)
- `loadAndMergeSkillsMatrix(categoriesPath, rulesPath, projectRoot)` - Convenience loader: loads categories + rules from the given config paths and extracts skills from `{projectRoot}/src/skills` (`DIRS.skills`) — all three in parallel — then returns a merged `MergedSkillsMatrix` via `mergeMatrixWithSkills()`. Distinct from `loadSkillsMatrixFromSource()` (source-loader.ts), which resolves a configured source, merges local skills, and runs multi-source tagging.

**`loadAndMergeSkillsMatrix` has no production callers** — it is reachable only through the
`matrix/index.ts` barrel. Unlike `loadAndMergeFromBasePath` in `source-loader.ts`, it does **not**
merge `defaultCategories` under the loaded file's categories, so every category the config file omits
auto-synthesizes (Known Limitations #6). Prefer `loadSkillsMatrixFromSource()` for any new path.

## Skill Resolution (`src/cli/lib/matrix/skill-resolution.ts`)

Contains the core merge logic that combines categories, relationship rules, and extracted skill metadata into a `MergedSkillsMatrix`.

**Exported functions:**

- `mergeMatrixWithSkills(categories, relationships, skills)` - Main merge function
- `synthesizeCategory(category, domain)` - Create a basic CategoryDefinition for undefined categories

**Internal function:**

- `resolveRelationships(skillId, relationships, resolve)` - Unified resolver that resolves all five relationship types (conflicts, discourages, compatibleWith, requires, alternatives) in a single pass for each skill. Unresolved slugs are filtered out (`warn` only) and the rule proceeds with the surviving subset -- see Known Limitations #4 and #7.

## Source Load Options (`src/cli/lib/loading/source-loader.ts`)

```typescript
export type SourceLoadOptions = {
  sourceFlag?: string;
  projectDir?: string;
  forceRefresh?: boolean;
  devMode?: boolean;
  skipExtraSources?: boolean;
  matrixOnly?: boolean;
};
```

| Option             | Default         | Effect                                                                                                                                                                     |
| ------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sourceFlag`       | `undefined`     | Explicit source, passed to `resolveSource()`                                                                                                                               |
| `projectDir`       | `process.cwd()` | Directory used for config resolution, local-skill discovery, and extra-source resolution                                                                                   |
| `forceRefresh`     | `false`         | Bypass the giget cache in `fetchFromSource()` / `fetchMarketplace()`                                                                                                       |
| `devMode`          | `false`         | Forces the local-load branch even for the default source (skips `BUILT_IN_MATRIX`)                                                                                         |
| `skipExtraSources` | `false`         | Skips `loadSkillsFromAllSources()` — no `availableSources` / `activeSource` tagging on any `ResolvedSkill`                                                                 |
| `matrixOnly`       | `false`         | Default source only: skips the `fetchFromSource()` clone, so the load stays offline on a cold cache. `sourcePath` comes back `""`. Local paths / custom remotes unaffected |

### `matrixOnly`

Only meaningful on the `source === DEFAULT_SOURCE && !devMode` branch of `resolveBaseResult()`,
where the matrix is the pre-computed `BUILT_IN_MATRIX` and the fetch exists solely to produce a
`sourcePath` for readers of the skill files on disk (eject-mode copy). Callers that need the matrix
but never read skill files set it; the fetch — a network clone on a cold cache — is then skipped
entirely. Sources that must be read from disk to build the matrix ignore the flag.

**Consequence:** `SourceLoadResult.sourcePath` is `""` when `matrixOnly` short-circuits. Do not pass
the flag from a caller that later feeds `sourcePath` to `loadMergedAgents()`, the skill copier, or
anything else that resolves files under the source root.

Pinned by the `matrixOnly` describe block in `src/cli/lib/loading/source-loader.test.ts`, which
asserts `sourcePath === ""` and that the returned skill keys equal `BUILT_IN_MATRIX.skills`.

### Call sites

| Caller                                                                                 | `skipExtraSources` | `matrixOnly` | Why                                                                              |
| -------------------------------------------------------------------------------------- | ------------------ | ------------ | -------------------------------------------------------------------------------- |
| `Compile.refreshConfigTypes` (`src/cli/commands/compile.ts`)                           | yes                | yes          | Regenerates `config-types.ts` per compiled scope; never reads skill files        |
| `Uninstall.prepareGlobalPropagation` (`src/cli/commands/uninstall.tsx`)                | yes                | yes          | Loads the matrix before the global manifest is deleted; must not hang on remotes |
| `loadConfigTypesDataInBackground` (`src/cli/lib/configuration/config-types-writer.ts`) | yes                | no           | Reads `sourceResult.sourcePath` to call `loadMergedAgents()`                     |
| `validateSource` phase 3 (`src/cli/lib/source-validator.ts`)                           | yes                | no           | Validates a caller-supplied source path, so the default-source branch is moot    |

### `skipExtraSources` parity

`skipExtraSources: true` is **not** a divergence from the wizard's fully tagged multi-source load:
extra-source loading only annotates each skill's `availableSources` / `activeSource` for wizard UI
tagging (`tagExtraSources`), never adds skills or categories, and the config-types writer never
reads those annotations. Both matrices therefore emit byte-identical `config-types.ts`. Pinned by
the "emits byte-identical config-types from an untagged and a multi-source-tagged matrix" test in
`src/cli/lib/installation/local-installer.test.ts`. The same JSDoc claim is repeated at both
`compile.ts` and `uninstall.tsx` call sites.

## SourceLoadResult (`src/cli/lib/loading/source-loader.ts`)

```typescript
type SourceLoadResult = {
  matrix: MergedSkillsMatrix;
  sourceConfig: ResolvedConfig;
  sourcePath: string;
  isLocal: boolean;
  marketplace?: string;
};
```

**Other exports (`source-loader.ts`):**

- `convertStackToResolvedStack(stack: Stack): ResolvedStack` - Converts a raw `Stack` into a `ResolvedStack`: builds per-agent, per-category skill assignments (keeping only IDs present in the current matrix), a deduplicated first-seen `allSkillIds` list, and copies over `id` / `name` / `description` / `philosophy`. Called by `loadAndMergeFromBasePath` to populate `matrix.suggestedStacks`.
- `extractSourceName(source: string): string` - Derives a human-readable owner/org label from a source URL by stripping the protocol prefix (`github:`, `gh:`, `gitlab:`, `bitbucket:`, `sourcehut:`, or `https://host/`) and taking the first path segment (e.g., `"github:agents-inc/skills"` -> `"agents-inc"`). Falls back to the raw `source` when no segment remains.

**Internal helper:**

- `mergeRelationships(source, defaults)` - Concatenates each relationship list (`conflicts`, `discourages`, `recommends`, `requires`, `alternatives`, `compatibleWith`) with the **source rules first**, so source rules win first-match lookups over the CLI defaults. Not exported; used only by `loadAndMergeFromBasePath` when a source ships its own `skill-rules.ts`.

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

Parsed by `parseFrontmatter()` from `src/cli/lib/loading/loader.ts`. It delegates extraction to `extractFrontmatter()` in `src/cli/utils/frontmatter.ts`, whose contract is: **CRLF-tolerant** (matches `\r?\n` delimiters) and **returns `null` for absent OR malformed frontmatter** (YAML parse errors are caught, not thrown). Callers treat a `null` return as "skip this skill".

### metadata.yaml

```yaml
category: web-framework
author: "@vince"
slug: react
domain: web
displayName: React
```

Validated with `matrixRawMetadataSchema` in `src/cli/lib/schemas.ts` (moved out of `matrix-loader.ts`).

**Schema fields:** `category` (required), `author` (required), `slug` (required), `domain` (required), `displayName` (optional in the Zod schema), `cliDescription` (optional), `usageGuidance` (optional), `custom` (optional boolean).

**Note:** although `displayName` is optional in `matrixRawMetadataSchema`, `extractAllSkills()` throws a hard error (aborting the whole extraction pass) if a discovered skill's metadata.yaml omits it.

**Note:** Relationship fields (`compatibleWith`, `conflictsWith`, `discourages`, `requires`, `alternatives`) are NOT in per-skill metadata. They are defined centrally in `config/skill-rules.ts` as slug-based group rules and resolved during the merge step.

**Note:** `tags` and `version` are NOT part of the schema. Do not add them to metadata.yaml.

## Skill ID Validation

There is no longer a separate `resolveAlias()` function. Skill IDs are validated
directly through the matrix provider:

- `getSkillById(id)` in `matrix-provider.ts` — asserting lookup via `matrix.skills[id]`, throws if the ID is not found
- `hasSkill(id)` in `matrix-provider.ts` — boolean existence check (`id in matrix.skills`)
- `getSkillDisplayName(id)` in `matrix-provider.ts` — non-throwing label lookup, falls back to the raw ID

Slug-based references (from `skill-rules.ts`) are resolved to canonical IDs during
the merge step via `slugMap.slugToId` (see `resolveToCanonicalId` in `skill-resolution.ts`).

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

| Function                       | Purpose                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `getDependentSkills()`         | Find skills that depend on a given skill                                          |
| `getUnmetRequiredBy()`         | Find first selected skill with unmet need for this skill                          |
| `isDiscouraged()`              | Check if skill is discouraged by discourages relationships                        |
| `isIncompatible()`             | Check if skill conflicts or has unsatisfiable requires                            |
| `isCompatibleWithSelections()` | True if skill has no compatibleWith constraints or shares one with the selections |
| `hasUnmetRequirements()`       | Check if selected skill has unmet dependencies                                    |
| `getDiscourageReason()`        | Get human-readable discouragement reason                                          |
| `getIncompatibleReason()`      | Get human-readable incompatibility reason                                         |
| `getUnmetRequirementsReason()` | Get human-readable unmet requirements reason                                      |
| `isRecommended()`              | Check if skill is recommended by selected skills                                  |
| `getRecommendReason()`         | Get human-readable recommendation reason                                          |
| `getAvailableSkills()`         | Get skills for a category with state annotations                                  |
| `getSkillsByCategory()`        | Get all resolved skills belonging to a category                                   |

**Barrel re-exports** (from `matrix/index.ts`): All 13 functions above, plus `validateSelection`. `validateConflicts`, `validateRequirements`, `validateExclusivity`, `validateRecommendations` are exported from `matrix-resolver.ts` directly but NOT re-exported from the barrel.

## Selection Validation

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

Validates matrix integrity: orphaned skills, missing categories, broken references. Returns
`MatrixHealthIssue[]` (both `checkMatrixHealth` and the `MatrixHealthIssue` type are re-exported
from `matrix/index.ts`).

## Source Validation (`src/cli/lib/source-validator.ts`)

Validates a **skills source repository** on disk (a marketplace checkout or a local source dir).
Entry point: `validateSource(sourcePath): Promise<SourceValidationResult>`, consumed by the
`validate` command.

```typescript
export type SourceValidationIssue = {
  severity: "error" | "warning";
  file: string;
  message: string;
};

export type SourceValidationResult = {
  issues: SourceValidationIssue[];
  skillCount: number;
  errorCount: number;
  warningCount: number;
};
```

`skillCount` is the number of **complete** pairs validated (metadata files whose directory also has
a `SKILL.md`), not the number of globbed metadata files.

### Phases

| Phase | What runs                                                                                                                                                | Failure mode                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| pre   | `directoryExists(resolvedPath)`, then `directoryExists(skillsDir)` (`skillsDir` from `loadProjectSourceConfig(...).skillsDir ?? SKILLS_DIR_PATH`)        | Each returns early with a single error and `skillCount: 0`               |
| 1     | `validateSkillFilePairs()` — every skill dir must have both `SKILL.md` and `metadata.yaml`                                                               | error per missing half                                                   |
| 2     | Per complete pair: YAML parse, `checkSnakeCaseKeys()`, `validateSkillMetadata()` split via `splitMetadataValidationIssues()`, then `checkSkillDirName()` | see rules below                                                          |
| 3     | `loadSkillsMatrixFromSource({ sourceFlag: resolvedPath, skipExtraSources: true })` then `checkMatrixHealth(matrix)`                                      | a throw downgrades to one warning ("Cross-reference validation skipped") |
| 4–6   | `validateStacks()`, `validateAgents()`, `validateConfigFiles()` — run in parallel via `Promise.all`                                                      | errors only; each skips silently when its directory/file is absent       |

Phase 3 reads the **module-level `matrix` singleton** from `matrix/matrix-provider.ts` after the
load, so `validateSource` mutates global matrix state as a side effect (D-214 item 10).

### Exported helpers

| Function                                                       | Purpose                                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `validateSource(sourcePath)`                                   | Full source-repo validation (above)                                           |
| `isSnakeCase(key)`                                             | `/[a-z]_[a-z]/` test                                                          |
| `checkSnakeCaseKeys(rawMetadata, relPath)`                     | One **error** per snake_case top-level key; non-object input yields no issues |
| `checkDirNameMatchesSkillId(skillId, relPath, dirName)`        | One **warning** when the directory name differs from the skill's machine id   |
| `validateSkillFilePairs(skillMdDirs, metadataDirs, skillsDir)` | Pure set-difference over the two globbed dir sets                             |

Internal (not exported): `checkSkillDirName`, `validateStacks`, `validateAgents`,
`validateConfigFiles`, `validateYamlFiles`, `validateTsConfig`, `formatLoadError`, `buildResult`.

### Rule: over-length `cliDescription` is advisory

`validateSkillMetadata(rawMetadata)` (`src/cli/lib/schemas.ts`) picks the schema —
`customMetadataValidationSchema` when `isCustomMetadata(rawMetadata)`, otherwise
`metadataValidationSchema`. Both `.extend()` the same `skillMetadataBaseSchema`, so the
`cliDescription` bound applies either way.

`splitMetadataValidationIssues(error, rawMetadata)` then partitions the resulting `ZodError` into
`{ errors, warnings }`. The **only** advisory issue is an over-length `cliDescription` — matched by
`isOverLengthCliDescription` (`issue.code === "too_big"` **and** a single-segment path equal to
`cliDescription`). Its message carries the actual length:
`cliDescription is <n> characters — exceeds the recommended maximum of 60`. Everything else is
formatted through `formatZodIssue` and reported as an error.

| Case                                         | Severity               |
| -------------------------------------------- | ---------------------- |
| `cliDescription` longer than 60 chars        | **warning** (advisory) |
| `cliDescription` empty (`min(1)`) or missing | **error**              |
| any other validation-schema violation        | **error**              |

Rationale encoded in the source: `CLI_DESCRIPTION_MAX_LENGTH = 60` remains the declared contract on
`skillMetadataBaseSchema` (`.max(CLI_DESCRIPTION_MAX_LENGTH)`), but the **runtime** load schemas
(`matrixRawMetadataSchema`, `localRawMetadataSchema`) declare `cliDescription` as
`z.string().optional()` with no upper bound, and the value only feeds wizard description text — so
an over-length value cannot break a load. See `reference/types/zod-schemas.md` for the full schema
inventory.

**Known gap:** `validateStacks()` validates stack-embedded skill `metadata.yaml` files with
`metadataValidationSchema` directly (via `validateYamlFiles`), which does **not** route through
`splitMetadataValidationIssues`. An over-length `cliDescription` inside `src/stacks/**/skills/**`
is still a hard error. No impact on the official marketplace, which ships no `src/stacks`.

### Rule: directory name is compared to the machine id

`checkSkillDirName()` reads the skill's `SKILL.md`, calls `parseFrontmatter()`
(`src/cli/lib/loading/loader.ts`), and compares `frontmatter.name` — the id the loader registers the
skill under — against `path.basename(skillDir)`. It replaced the pre-0.145 `checkDisplayNameMatches`,
which compared `displayName` and could never pass on the marketplace convention of human display
names inside `<domain>-<category>-<slug>` directories.

Two properties matter for callers:

1. **It runs independently of metadata validity.** Phase 2 no longer `continue`s on a
   `validateSkillMetadata` failure — the id lives in `SKILL.md`, not `metadata.yaml`, so a broken
   `metadata.yaml` no longer suppresses the directory check.
2. **Every outcome is a warning, never an error.** A mismatch warns; an unreadable `SKILL.md` or
   `null` frontmatter warns with `Cannot verify directory name '<dir>': ...` so the skipped check is
   visible rather than silent.

### Rule: the plugins pass reads the claude CLI v2 registry

Not part of `source-validator.ts` — it lives in the `validate` command
(`Validate.validateRegistryPlugins` in `src/cli/commands/validate.ts`) and reads
`listRegisteredPluginInstalls()` from `src/cli/lib/plugins/plugin-settings.ts`. Registry-first with a
direct-children fallback when the registry records no installs. Documented in
`reference/features/plugin-system.md`; the command surface is in `reference/commands/index.md`.

## Source Switching

**File:** `src/cli/lib/skills/source-switcher.ts`

When changing a skill's source:

- `deleteLocalSkill(projectDir, skillId)` - Permanently removes local skill directory
- `migrateLocalSkillScope(skillId, fromScope, projectDir)` - Moves skill files between project and global directories when scope changes

## Skill Versioning

**File:** `src/cli/lib/versioning.ts`

Content-hashing and plugin-version utilities shared by the skill, agent, and stack plugin compilers.

**Hashing helpers:**

- `computeSkillFolderHash(skillPath)` - SHA-256 hash of a skill directory's content files and content dirs (`SKILL_CONTENT_FILES` + `SKILL_CONTENT_DIRS` from `metadata-keys.ts`); used for `forkedFrom.contentHash` in metadata to detect local modifications
- `computeStringHash(content)` - SHA-256 hex digest truncated to `HASH_PREFIX_LENGTH`; the primitive the other hashers build on
- `computeFileHash(filePath)` - Reads a file and returns `computeStringHash()` of its contents
- `getCurrentDate()` - Current date as an ISO `YYYY-MM-DD` string

**Plugin-version bumping** (reads an existing `plugin.json` + sibling `.content-hash`, bumps the semver major on content change):

- `parseMajorVersion(version)` - Extracts the numeric major from a semver string, defaulting to `1` when unparseable
- `bumpMajorVersion(version)` - Returns `${major + 1}.0.0`
- `determinePluginVersion(newHash, pluginDir, getManifestPath)` - Returns `{ version, contentHash }`: `DEFAULT_VERSION` for a plugin with no existing manifest, a major bump when the stored `.content-hash` differs from `newHash`, else the existing version unchanged
- `writeContentHash(pluginDir, contentHash, getManifestPath)` - Writes the `.content-hash` file next to the plugin manifest (path derived from `getManifestPath`)

`readExistingPluginManifest()` is an internal (non-exported) helper used by `determinePluginVersion()`; it parses `plugin.json` via `pluginManifestSchema` and reads the sibling `.content-hash`.

## Skill Generators

**File:** `src/cli/lib/skills/generators.ts`

Generates config file content for custom skills:

- `generateSkillCategoriesTs(category, domain)` - Generate a `skill-categories.ts` with one category entry
- `generateSkillRulesTs()` - Generate an empty `skill-rules.ts`
- `buildCategoryEntry(category, domain)` - Build a single category definition object
- `formatTsExport(comment, data)` - Serialize a value as a commented `export default` TS module

`toTitleCase()` lives in `src/cli/utils/string.ts` (not `generators.ts`) and is used by `buildCategoryEntry`.

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

| #   | Limitation                                          | Where                                                                                                                | Current behavior                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Duplicate skill IDs silently overwrite              | `mergeMatrixWithSkills` in `skill-resolution.ts`                                                                     | Second skill with same `id` replaces the first in `resolvedSkills` with no warn. Order depends on glob order. `buildSlugMap` warns on slug collision -- IDs do not.                                                                                         |
| 2   | Invalid YAML crashes whole matrix load              | `extractAllSkills` in `matrix-loader.ts`                                                                             | `parseYaml(metadataContent)` is not try-wrapped. One malformed `metadata.yaml` throws and aborts the entire extraction pass, so the whole matrix fails to load.                                                                                             |
| 3   | Custom skill slugs are never added to `slugMap`     | `mergeLocalSkillsIntoMatrix` in `source-loader.ts`                                                                   | Local/custom skills are appended to `matrix.skills` but `buildSlugMap` is not re-run. `getSkillBySlug("<custom-slug>")` throws. Stacks and rules can't address them.                                                                                        |
| 4   | Partial `requires` resolution pretends to succeed   | `resolveRelationships` in `skill-resolution.ts` (requires branch)                                                    | Unresolved slugs in `rule.needs` are filtered out; the rule proceeds with whatever remains. `needsAny: false` (AND) silently narrows to "AND of what resolved".                                                                                             |
| 5   | Extras do not participate in the relationship graph | `tagExtraSources` in `multi-source-loader.ts`                                                                        | Extra sources load only via `extractAllSkills` to tag `availableSources`. Their `skill-categories.ts` and `skill-rules.ts` are never loaded. A skill shipped in an extra with `requires: [...]` has no effect.                                              |
| 6   | Auto-synth is not scoped to `custom: true`          | `mergeMatrixWithSkills` -> `synthesizeCategory` in `skill-resolution.ts`                                             | Mechanism unchanged: any skill whose category is absent from the passed `CategoryMap` gets an `order: 999`, `exclusive: false`, `required: false` placeholder with a `toTitleCase()` name, regardless of `custom`. **Reach narrowed** — see the note below. |
| 7   | Unresolved slugs dropped before `checkMatrixHealth` | `resolveToCanonicalId` in `skill-resolution.ts`                                                                      | `warn(...)` only. No `unresolvedSlugs[]` is returned from the merge, so `validate` cannot surface a typo in a marketplace's `skill-rules.ts`.                                                                                                               |
| 8   | Duplicate-slug reverse map is half-written          | `buildSlugMap` in `skill-resolution.ts`                                                                              | When slug A is already taken, the loser's `idToSlug[loser.id]` is never written. Consumers reading `idToSlug` for the loser get `undefined`.                                                                                                                |
| 9   | Double `initializeMatrix` write                     | `source-loader.ts` (`loadAndMergeFromBasePath` intermediate write, plus final write in `loadSkillsMatrixFromSource`) | Singleton is set twice -- once before local/extra merge, once after. Any consumer reading between the two sees a stale matrix.                                                                                                                              |

### Note on #6 — what the 38 added category definitions changed

D-214 item 8 ("scope category auto-synthesis to `custom: true` only") is still **open** and
`synthesizeCategory` is unchanged. What changed is the exposure, and the old wording ("built-in
marketplace drift is masked") no longer describes today's behavior:

- `src/cli/lib/configuration/default-categories.ts` now defines **all 89** members of the generated
  `Category` union (38 were added in 0.145.0), pinned key-for-key by
  `src/cli/lib/configuration/__tests__/default-categories.test.ts`.
- `BUILT_IN_MATRIX` (`src/cli/types/generated/matrix.ts`) is produced by
  `scripts/generate-source-types.ts` calling
  `mergeMatrixWithSkills(defaultCategories, defaultRules.relationships, skills)`. It currently
  contains **zero** synthesized categories — no `"order": 999` and no
  `"description": "Auto-generated category for ..."` entries.
- `loadAndMergeFromBasePath` (`source-loader.ts`) passes `{ ...defaultCategories, ...sourceCategories }`,
  so a built-in category can no longer fall through to synthesis on the source-load path either.

Auto-synthesis is therefore reachable today only when: (a) a source ships a skill whose category is
outside the generated union and outside its own `skill-categories.ts`; or (b) a caller uses
`loadAndMergeSkillsMatrix()`, which merges no defaults. Regeneration against a marketplace that adds
a new category will synthesize it once and then fail `default-categories.test.ts` — the drift now
surfaces as a red test rather than an `order: 999` placeholder in the wizard.

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
