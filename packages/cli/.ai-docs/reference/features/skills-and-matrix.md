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

# Skills & Matrix System

## Overview

**Purpose:** Load, resolve, and merge the skills matrix (category definitions + relationship rules + skill metadata) into a unified read model (`MergedSkillsMatrix`) consumed by the wizard and CLI commands.

## Key Concepts

| Concept            | Description                                                                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill Categories   | `config/skill-categories.ts` - category definitions (domains, display info) — a **source-repo** path; CLI built-in fallback is `lib/configuration/default-categories.ts`                                  |
| Skill Rules        | `config/skill-rules.ts` - relationship rules between skills — a **source-repo** path; CLI built-in fallback is `lib/configuration/default-rules.ts`, see [built-in-catalogue.md](./built-in-catalogue.md) |
| Skill Metadata     | Per-skill `SKILL.md` frontmatter + `metadata.yaml`                                                                                                                                                        |
| MergedSkillsMatrix | Combined read model after categories + rules + skill metadata merge                                                                                                                                       |
| Skill Slug         | Short kebab-case key (e.g., "react") used in relationship rules                                                                                                                                           |
| Slug Map           | Bidirectional `SkillSlug <-> SkillId` mapping built during merge                                                                                                                                          |
| Source             | Where skills come from (public marketplace, private, local)                                                                                                                                               |

Each of the three `config/` files — `skill-categories.ts`, `skill-rules.ts` and `stacks.ts` — exports
its value as the module's **default** export. `loadConfig` reads the default and nothing else, so a
file exporting only named bindings carries no config at all as far as the loader is concerned;
`doctor` reports such a file as `Config has no default export`.

## Current Counts

| Type                | Count | Source File                                       |
| ------------------- | ----- | ------------------------------------------------- |
| `defaultCategories` | 102   | `src/cli/lib/configuration/default-categories.ts` |

Of the 102 entries, **35 are `exclusive: true`** and **6 are `required: true`**.

**The generated union sizes are not restated here.** `SKILL_MAP`, `SKILL_IDS`, `SKILL_SLUGS`,
`CATEGORIES`, `DOMAINS` and `AGENT_NAMES` are counted in
[`reference/type-system.md`](../type-system.md) ("Counts") and nowhere else.

**Domains:** ai, api, cli, desktop, infra, meta, mobile, shared, web

`defaultCategories` and the generated `CATEGORIES` union are pinned to each other by
`src/cli/lib/configuration/__tests__/default-categories.test.ts` (`toStrictEqual` on the sorted key
sets, plus an `EXPECTED_CATEGORY_COUNT` of 102). A marketplace introducing a new category therefore
fails that test until a matching `defaultCategories` entry is added — see Known Limitations #1.

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

| File                       | Path                                          | Purpose                                                       |
| -------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| `skill-fetcher.ts`         | `src/cli/lib/skills/skill-fetcher.ts`         | Fetch skills from source directories                          |
| `skill-metadata.ts`        | `src/cli/lib/skills/skill-metadata.ts`        | Read/write skill metadata, hashing                            |
| `skill-copier.ts`          | `src/cli/lib/skills/skill-copier.ts`          | Copy skills to local/plugin dirs                              |
| `skill-plugin-compiler.ts` | `src/cli/lib/skills/skill-plugin-compiler.ts` | Compile skill as Claude plugin                                |
| `local-skill-loader.ts`    | `src/cli/lib/skills/local-skill-loader.ts`    | Discover local skills in project                              |
| `local-skill-mover.ts`     | `src/cli/lib/skills/local-skill-mover.ts`     | Delete/migrate a skill's local copy on a mode or scope change |
| `index.ts`                 | `src/cli/lib/skills/index.ts`                 | Barrel exports                                                |

Per-function inventory for `skill-fetcher.ts`, `skill-metadata.ts`, `skill-copier.ts`, `local-skill-loader.ts` and `skill-plugin-compiler.ts` — including which exports have no production caller: [skills/skill-primitives.md](../skills/skill-primitives.md).

### Loading System (`src/cli/lib/loading/`)

| File                     | Path                                         | Purpose                                                                                             |
| ------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `source-loader.ts`       | `src/cli/lib/loading/source-loader.ts`       | Load matrix from resolved source                                                                    |
| `source-fetcher.ts`      | `src/cli/lib/loading/source-fetcher.ts`      | Fetch/cache remote sources via giget — see [source-fetch-and-cache.md](./source-fetch-and-cache.md) |
| `multi-source-loader.ts` | `src/cli/lib/loading/multi-source-loader.ts` | Load skills from multiple sources                                                                   |
| `loader.ts`              | `src/cli/lib/loading/loader.ts`              | YAML/frontmatter parsing utilities                                                                  |
| `index.ts`               | `src/cli/lib/loading/index.ts`               | Barrel exports                                                                                      |

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
   -> Invalid metadata.yaml YAML syntax: warn naming the file path + skip (per-file,
      continues) — parseYaml is try-wrapped
   -> Reads SKILL.md frontmatter (parseFrontmatter from loader.ts); skill id =
      frontmatter.name. Null frontmatter (absent or malformed): skip
   -> Missing metadata.yaml `displayName`: throws a hard error, aborting the whole
      pass (see the metadata.yaml note below)
   -> Returns ExtractedSkillMetadata[]

5. Matrix Merge
   mergeMatrixWithSkills() (skill-resolution.ts)
   -> Combines categories + extracted metadata + relationship rules
   -> Builds bidirectional slug map (SkillSlug <-> SkillId) via claimSlug, first
      claim winning and every later one warned
   -> Resolves slug-based relationships to canonical SkillIds; a `requires` rule
      whose needs do not ALL resolve is dropped whole, and every unresolved slug
      lands on matrix.unresolvedSlugs for checkMatrixHealth to report
   -> Auto-synthesizes missing categories (exclusive: false by default) -- fires
      for built-ins too, masking marketplace drift (see Known Limitations #1)
   -> Duplicate skill ids warn naming both paths; the first one wins
   -> Returns MergedSkillsMatrix

6. Install-mode tagging (optional)
   loadSkillsFromAllSources() (multi-source-loader.ts) — four-phase in-place tagging:
   1. Primary  — tag every skill with the one marketplace (public/private)
   2. Local    — tag `local: true` skills as installed via the local (eject) source
   3. Plugin   — tag plugin-installed skills (settings.json + global cache)
   4. Active source — set `activeSource` to the installed variant, else first available
   -> Merges availableSources / activeSource onto each ResolvedSkill (mutates in place)
   -> availableSources therefore holds AT MOST two entries — the local copy and the one
      marketplace — which are the two install modes the Sources step offers. The
      public-fallback and extra-source phases that used to add more were withdrawn with
      the marketplace axis, along with the cross-marketplace skill search
      (searchExtraSources) they fed.

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
- `loadSkillRules(configPath)` - Load + Zod-validate a `skill-rules.ts` file into a `SkillRulesConfig`. When the loaded module has no `relationships` key at all, the whole object is replaced with one carrying four empty lists (`conflicts`, `discourages`, `requires`, `alternatives`) — the four the type declares, none of them optional
- `extractAllSkills(skillsDir)` - Glob `**/metadata.yaml` and build `ExtractedSkillMetadata[]` (see Data Flow step 4)
- `loadAndMergeSkillsMatrix(categoriesPath, rulesPath, projectRoot)` - **Dead. Do not call it, and do not add the first caller.** It loads categories + rules from the given config paths, extracts skills from `{projectRoot}/src/skills` (`DIRS.skills`) — all three in parallel — and returns a merged `MergedSkillsMatrix` via `mergeMatrixWithSkills()`.

**`loadAndMergeSkillsMatrix` has zero callers** — nothing in `src/`, `scripts/`, `e2e/` or the test
suite invokes it. Its only reference outside its own definition is the re-export in
`matrix/index.ts`, which is what keeps it visible to autocomplete and is the whole reason it is
documented here rather than dropped: a reader will find the symbol whether or not this page names
it, and this paragraph is the only place that says not to use it.

It is documented as dead rather than deleted from the page for a second reason — it is the sole
surviving route to a behaviour the page describes elsewhere. Unlike `loadAndMergeFromBasePath` in
`source-loader.ts`, it does **not** merge `defaultCategories` under the loaded file's categories, so
every category the config file omits auto-synthesizes; it is clause (b) of the reachability argument
in Known Limitations #1, and dropping it from here would leave that limitation naming a function no
document explains.

**Reach for one of these instead, and which depends on who is asking:**

| You are                                                                    | Call                                                                 | Because                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reading a marketplace ON DISK, as its author (`build`, catalogue emission) | `loadMarketplaceMatrix(marketplaceDir)` (`loading/source-loader.ts`) | Its own skills, categories and stacks, with the built-in relationship rules narrowed to the slugs it ships. No local merge, so a published catalogue never carries the author's private skills |
| Resolving the source an INSTALL is configured against                      | `loadSkillsMatrixFromSource(options)` (`loading/source-loader.ts`)   | Resolves the configured source, merges the machine's `~/.claude/skills` and the project's own, and runs multi-source tagging                                                                   |

Both are exported from `lib/loading/index.ts`. The two differ in exactly one decision — whether the
invoking machine's local skills join the result — and that decision is right for an install and
wrong for anything published, which is why there are two functions rather than a flag.

## Skill Resolution (`src/cli/lib/matrix/skill-resolution.ts`)

Contains the core merge logic that combines categories, relationship rules, and extracted skill metadata into a `MergedSkillsMatrix`.

**Exported functions:**

- `mergeMatrixWithSkills(categories, relationships, skills)` - Main merge function
- `synthesizeCategory(category, domain)` - Create a basic CategoryDefinition for undefined categories

**Internal function:**

- `resolveRelationships(skillId, relationships, resolve)` - Unified resolver that resolves all four relationship types (conflicts, discourages, requires, alternatives) in a single pass for each skill. For the symmetric kinds (conflicts, discourages, alternatives) an unresolved slug is warned and dropped from its group. For `requires` the rule is taken WHOLE or not at all: `resolveEveryNeed` returns `null` unless every `need` resolves, so a rule naming one unknown slug states nothing rather than narrowing to the survivors. Every unresolved slug also reaches `checkMatrixHealth` through `matrix.unresolvedSlugs`.

## Source Load Options (`src/cli/lib/loading/source-loader.ts`)

```typescript
export type SourceLoadOptions = {
  sourceFlag?: string;
  projectDir?: string;
  devMode?: boolean;
  skipExtraSources?: boolean;
  matrixOnly?: boolean;
};
```

| Option             | Default         | Effect                                                                                                                                                                     |
| ------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caller`           | `"stored"`      | `"init"` unlocks the install-time rungs of `resolveSource()` (the `CC_SOURCE` env var); every other caller starts at the project config                                    |
| `sourceFlag`       | `undefined`     | Explicit source, passed to `resolveSource()` — only `init` gets one from a flag                                                                                            |
| `projectDir`       | `process.cwd()` | Directory used for config resolution, local-skill discovery, and extra-source resolution                                                                                   |
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

`skipExtraSources: true` is **not** a divergence from the wizard's fully tagged load: the tagging
pass only annotates each skill's `availableSources` / `activeSource` for the Sources step, never
adds skills or categories, and the config-types writer never reads those annotations. Both matrices
therefore emit byte-identical `config-types.ts`. Pinned by the "emits byte-identical config-types
from an untagged and a source-tagged matrix" test in
`src/cli/lib/installation/local-installer.test.ts`. The option's NAME outlived the extras it was
introduced for — it gates the whole tagging pipeline, not an extras phase. The same JSDoc claim is repeated at both
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

**Internal helpers:**

- `mergeRelationships(source, defaults)` - Concatenates each relationship list (`conflicts`, `discourages`, `requires`, `alternatives`) with the **source rules first**, so source rules win first-match lookups over the CLI defaults. Not exported; used only by `relationshipsForSource` when a source ships its own `skill-rules.ts`.
- `relationshipsForSource(sourceRules, skills)` - What `loadAndMergeFromBasePath` hands `mergeMatrixWithSkills`: the source's own rules verbatim, plus the CLI's built-in rules **narrowed to the slugs the extracted skills carry**. The narrowing changes no resolved relation -- `resolveSlugsOrSkip` already dropped members that resolve to nothing -- it removes the `warn` each dropped member emitted once per skill. See [built-in-catalogue.md -> The built-in rules are narrowed to the slugs the source ships](./built-in-catalogue.md#the-built-in-rules-are-narrowed-to-the-slugs-the-source-ships).

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

**Note:** Relationship fields (`conflictsWith`, `discourages`, `requires`, `alternatives`) are NOT in per-skill metadata. They are defined centrally in `config/skill-rules.ts` as slug-based group rules and resolved during the merge step.

**Note:** `tags` and `version` are NOT part of the schema. Do not add them to metadata.yaml.

## Skill ID Validation

There is no longer a separate `resolveAlias()` function. Skill IDs are validated
directly through the matrix provider:

- `getSkillById(id)` in `matrix-provider.ts` — asserting lookup via `matrix.skills[id]`, throws if the ID is not found
- `hasSkill(id)` in `matrix-provider.ts` — boolean existence check (`id in matrix.skills`)
- `getSkillDisplayName(id)` in `matrix-provider.ts` — non-throwing label lookup, falls back to the raw ID

Slug-based references (from `skill-rules.ts`) are resolved to canonical IDs during
the merge step via `slugMap.slugToId` (see `resolveToCanonicalId` in `skill-resolution.ts`).

## The Skill-Id Namespace

**Every custom marketplace's skill ids carry that marketplace's name as a prefix, written by the
marketplace author.** A marketplace named `acme` ships `acme-web-frontend`, never a bare
`web-frontend`. The public catalogue is the sole exception: its skills stay unprefixed, so
`agents-inc` IS the namespace they occupy.

**Why it exists.** A skill id is the name of the directory the skill installs into, and Claude reads
`~/.claude` and `./.claude` together — so two marketplaces naming one id means one silently shadows
the other. Unique ids make that unrepresentable rather than managed.

**Author time, not load time.** The id in the marketplace repository IS the id everywhere; nothing
transforms it on ingest. A load-time namespace would have to be applied independently by the CLI and
by the editor, and two implementations of one rule is a failure class this repository has already
paid for. It also removes the question of what the prefix derives from, since nothing derives it.

**Separator `-`, and it stays filesystem-legal** — `:` and `/` are out, because the id is a directory
name and has to work on Windows.

### Reserved namespaces

| Name         | Holds                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| `agents-inc` | The public catalogue's own bare ids                                                    |
| `external`   | Skills answering to no marketplace — added from an arbitrary repo, or created in place |
| `local`      | Skills created in place rather than fetched                                            |

`RESERVED_MARKETPLACE_NAMES` in `src/cli/lib/marketplace-generator.ts` is the one list; the two
non-catalogue members are the module-private `EXTERNAL_SKILL_NAMESPACE` and `LOCAL_SKILL_NAMESPACE`.
An externally-added skill takes `external-`, because a local `web-frontend` against the published
`web-frontend` is the exact collision the rule exists to prevent. `external-` separates such skills
from marketplaces, **not from one another** — two added skills can still resolve to the same id, and
that is caught at add time with the id in hand rather than by deriving a longer id from the repo
owner: these are eject-only, per-install files, so the requirement is uniqueness within one machine's
two scopes, not global uniqueness.

### Two guards, and the division between them

**Build-time catches honest mistakes; load-time catches the rest.** Nothing a source ships is
unforgeable, so the consumer's own load has to ask the question again.

| Guard                                                 | Where                                                                                                 | Refuses                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `validateMarketplaceName(name, packageName)`          | `src/cli/lib/marketplace-generator.ts`, called by `build marketplace`                                 | A marketplace claiming a reserved name                                                                   |
| `validateSkillIdNamespace(marketplace)`               | same module, called after the plugin scan                                                             | A marketplace shipping an id that does not begin `<name>-`; lists up to 10, each with the id it expected |
| `refuseCatalogueCollisions(basePath, source, skills)` | `src/cli/lib/loading/source-loader.ts`, called by `loadAndMergeFromBasePath` after `extractAllSkills` | A source whose ids intersect `CATALOGUE_SKILL_IDS` — the keys of `BUILT_IN_MATRIX.skills`                |

**The SOURCE is refused, not the colliding skills.** Dropping them would hand the user a marketplace
quietly missing the skills they chose it for, leave the catalogue's own copies standing in under
those ids, and tell the author nothing.

### The exemption is read off package identity

`PUBLIC_CATALOGUE_PACKAGE` (`@agents-inc/skills`, in `src/cli/consts.ts`) is the one signal, and both
sides key on it — never on the name a `marketplace.json` claims, because that name is the claim under
test and a guard keyed on it would exempt exactly the source it exists to catch.

- **Load side:** `isPublicCatalogue(basePath)` reads the source's `package.json` through
  `packageIdentitySchema` (`z.object({ name: z.string() })`, the only field it reads) and compares
  `name` to the constant. An unreadable or unparseable file yields `null`, which is not the catalogue.
- **Build side:** `validateMarketplaceName` compares package.json's own `name` to the constant, so
  only that package may hold a reserved name. `validateSkillIdNamespace` then exempts on
  `marketplace.name === DEFAULT_PUBLIC_SOURCE_NAME` — **safe only because the first guard ran.** The
  two are a pair, in that order; separating them re-opens the hole.

### Consequence for catalogue-keyed tables

Namespacing an id removes it from every built-in table keyed by the generated `SkillId` union, because
the coupling is a MEMBERSHIP test rather than a parse. The classification of those tables — which can
be re-read through a skill's taxonomy and which cannot — is
[`standards/e2e/user-journeys.md` § Journey 26](../../standards/e2e/user-journeys.md). The live case in
this module is `checkUnauditedSkills` (`matrix-health-check.ts`), which warns only for ids the built-in
catalogue names: a marketplace's skills are outside the audit manifest by construction, not unaudited,
and warning per skill would put a clean bill of health out of reach for anyone not on the public
catalogue.

## Relationship System

Defined in `config/skill-rules.ts` under `relationships` using skill slugs:

| Type           | Effect                                  | Enforcement         |
| -------------- | --------------------------------------- | ------------------- |
| `conflicts`    | Selecting one disables others           | Hard (grays out)    |
| `discourages`  | Selecting one warns about others        | Soft (warning icon) |
| `requires`     | Skill A needs skill B first             | Hard (dependency)   |
| `alternatives` | Interchangeable skills for same purpose | Informational       |

All relationship rules use `SkillSlug` references (e.g., `"react"`, `"zustand"`) which are resolved to canonical `SkillId`s during the merge step via the slug map.

### Selection semantics: possibility, not presence

Every incompatibility verdict this vocabulary can produce is about **possibility** — a requirement
is unmet only once every candidate that could satisfy it has been ruled out, and a conflict fires
only against something the selection actually reaches. No rule states **presence**: that a host must
be in the selection as clicked rather than merely still available. The two are not
interchangeable, and a rule of one kind is never redundant with a rule of identical membership in
the other.

That distinction is why the catalogue used to carry both `requires` and a `compatibleWith`
whitelist over the same 39 groups. The whitelist asked "is a declared host selected"; `requires`
asks "is a declared host still reachable". Astro conflicts with Next.js and Remix but not with
React, so Radix's `needsAny [react, nextjs, remix]` keeps a survivor and Radix stays offerable
beside Astro — where the whitelist ruled it out. The owner ruled those verdicts an accepted loss
on 2026-08-07 and CLI-389 phase C deleted `compatibleWith` entirely, which is what made the CLI
and the editor answer the same question.

Two consequences follow and are pinned as behaviour:

- **A selection id outside the catalogue's relationship vocabulary contributes nothing to a
  verdict.** A local or custom skill names no relationship and is named by none, so selecting one
  alone rules nothing out.
- **A skill is never judged against itself.** Every surviving predicate is either symmetric
  (nothing conflicts with itself) or about what the selection reaches, and a selected skill
  reaches itself.

Anything that genuinely needs a presence semantic — "this skill needs its host chosen, not merely
available" — is D-306's territory and must arrive as new vocabulary, not as a second reading of an
existing rule.

### Relationship Query Functions (`matrix-resolver.ts`)

Checked per-skill by exported functions:

| Function                       | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `getDependentSkills()`         | Find skills that depend on a given skill                   |
| `getUnmetRequiredBy()`         | Find first selected skill with unmet need for this skill   |
| `isDiscouraged()`              | Check if skill is discouraged by discourages relationships |
| `isIncompatible()`             | Check if skill conflicts or has unsatisfiable requires     |
| `hasUnmetRequirements()`       | Check if selected skill has unmet dependencies             |
| `getDiscourageReason()`        | Get human-readable discouragement reason                   |
| `getIncompatibleReason()`      | Get human-readable incompatibility reason                  |
| `getUnmetRequirementsReason()` | Get human-readable unmet requirements reason               |
| `getAvailableSkills()`         | Get skills for a category with state annotations           |
| `getSkillsByCategory()`        | Get all resolved skills belonging to a category            |

**Barrel re-exports** (from `matrix/index.ts`): All 10 functions above, plus `validateSelection`. `validateConflicts`, `validateRequirements`, `validateExclusivity` are exported from `matrix-resolver.ts` directly but NOT re-exported from the barrel.

## Selection Validation

**Function:** `validateSelection()` in `src/cli/lib/matrix/matrix-resolver.ts`

> **`valid` is hard-coded `true`.** `validateSelection` returns `valid: true` regardless of how many errors it collected. Read `errors`, never `valid`.

Runs three validation passes via helper functions, each returning `ValidationError[]`:

| Function                 | What it validates              |
| ------------------------ | ------------------------------ |
| `validateConflicts()`    | Mutually exclusive skill pairs |
| `validateRequirements()` | Required dependencies          |
| `validateExclusivity()`  | Category exclusive violations  |

Returns `SelectionValidation` with `valid` flag and error list.

**Function:** `checkMatrixHealth()` at `src/cli/lib/matrix/matrix-health-check.ts`

Validates matrix integrity: orphaned skills, missing categories, broken references. Returns
`MatrixHealthIssue[]` (both `checkMatrixHealth` and the `MatrixHealthIssue` type are re-exported
from `matrix/index.ts`).

## Source Validation (`src/cli/lib/source-validator.ts`)

Validates a **skills source repository** on disk (a marketplace checkout or a local source dir).
Entry point: `validateSource(sourcePath): Promise<SourceValidationResult>`, whose only production
consumer is `validateRegisteredSources()` in `src/cli/lib/content-validator.ts` — the `Sources` row
of `doctor`'s content layer.

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
load, so `validateSource` mutates global matrix state as a side effect.

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
skill under — against `path.basename(skillDir)`. It supersedes `checkDisplayNameMatches`,
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

Not part of `source-validator.ts` — it lives beside it, in `validateRegistryPlugins` in
`src/cli/lib/content-validator.ts` (the `Plugins` row of `doctor`'s content layer), and reads
`listRegisteredPluginInstalls()` from `src/cli/lib/plugins/plugin-settings.ts`. Registry-first with a
direct-children fallback when the registry records no installs. Documented in
`reference/features/plugin-system.md`; the command surface is in `reference/commands/index.md`.

## Moving a Skill's Local Copy

**File:** `src/cli/lib/skills/local-skill-mover.ts`

The file-movement half of an install-mode or scope change — it moves working copies and knows
nothing about sources:

- `deleteLocalSkill(projectDir, skillId)` - Permanently removes a local skill directory (the eject→plugin half of a mode switch)
- `migrateLocalSkillScope(skillId, fromScope, projectDir)` - Moves skill files between project and global directories when scope changes

## Skill Versioning

**File:** `src/cli/lib/versioning.ts`

Content-hashing and plugin-version utilities shared by the skill, agent, and stack plugin compilers.

**Hashing helpers:**

- `computeSkillFolderHash(skillPath)` - SHA-256 hash of a skill directory's content files and content dirs (`SKILL_CONTENT_FILES` + `SKILL_CONTENT_DIRS` from `metadata-keys.ts`); feeds plugin `.content-hash` / version bumping. It does **NOT** feed `forkedFrom.contentHash` — everything that stamps that field uses `computeFileHash` on `SKILL.md` alone (`generateSkillHash` in `skill-copier.ts`). Nothing reads it back: the `computeSourceHash` that once re-derived it for comparison was deleted unused. See [skills/skill-primitives.md](../skills/skill-primitives.md) § The two hashers.
- `computeStringHash(content)` - SHA-256 hex digest truncated to `HASH_PREFIX_LENGTH`; the primitive the other hashers build on
- `computeFileHash(filePath)` - Reads a file and returns `computeStringHash()` of its contents
- `getCurrentDate()` - Current date as an ISO `YYYY-MM-DD` string

**Plugin-version bumping** (reads an existing `plugin.json` + sibling `.content-hash`, bumps the semver major on content change):

- `parseMajorVersion(version)` - Extracts the numeric major from a semver string, defaulting to `1` when unparseable
- `bumpMajorVersion(version)` - Returns `${major + 1}.0.0`
- `determinePluginVersion(newHash, pluginDir, getManifestPath)` - Returns `{ version, contentHash }`: `DEFAULT_VERSION` for a plugin with no existing manifest, a major bump when the stored `.content-hash` differs from `newHash`, else the existing version unchanged
- `writeContentHash(pluginDir, contentHash, getManifestPath)` - Writes the `.content-hash` file next to the plugin manifest (path derived from `getManifestPath`)

`readExistingPluginManifest()` is an internal (non-exported) helper used by `determinePluginVersion()`; it parses `plugin.json` via `pluginManifestSchema` and reads the sibling `.content-hash`.

## Stacks System (`src/cli/lib/stacks/`)

| File               | Path                                  | Purpose                    |
| ------------------ | ------------------------------------- | -------------------------- |
| `stacks-loader.ts` | `src/cli/lib/stacks/stacks-loader.ts` | Load stacks from stacks.ts |

`stacks-loader.ts` is the whole module. `stack-installer.ts` and `stack-plugin-compiler.ts` — the
stack→plugin bundle path — were deleted in CLI-459; nothing a user runs ever reached them.

Stacks are pre-configured bundles of skills mapped to agents. Defined in `config/stacks.ts` **in a source repo**; the CLI's own built-in catalogue is `lib/configuration/default-stacks.ts` — see [built-in-catalogue.md](./built-in-catalogue.md), which also covers the three different source-vs-default precedence rules.

**Key functions (`stacks-loader.ts`):**

- `loadStacks()` - Load all stacks from TS config
- `loadStackById()` - Load specific stack
- `resolveAgentConfigToSkills()` - Resolve stack agent config to skill assignments
- `getStackSkillIds()` - Extract flat skill ID list from stack
- `normalizeStackRecord()` - Normalize stack values to `SkillAssignment[]` arrays
- `normalizeAgentConfig()` - Normalize agent config entries

## Known Limitations (matrix-composition hardening)

These are current behaviours, not bugs to fix in the doc. Do not document over them — they must stay visible until they are actually closed.

| #   | Limitation                                 | Where                                                                                                                | Current behavior                                                                                                                                                                                                                                            |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Auto-synth is not scoped to `custom: true` | `mergeMatrixWithSkills` -> `synthesizeCategory` in `skill-resolution.ts`                                             | Mechanism unchanged: any skill whose category is absent from the passed `CategoryMap` gets an `order: 999`, `exclusive: false`, `required: false` placeholder with a `toTitleCase()` name, regardless of `custom`. **Reach narrowed** — see the note below. |
| 2   | Duplicate-slug reverse map is half-written | `claimSlug` in `skill-resolution.ts`                                                                                 | When a slug is already claimed by another id, the loser's `idToSlug[loser.id]` is never written. Consumers reading `idToSlug` for the loser get `undefined`. The collision itself is warned, naming both ids.                                               |
| 3   | Double `initializeMatrix` write            | `source-loader.ts` (`loadAndMergeFromBasePath` intermediate write, plus final write in `loadSkillsMatrixFromSource`) | Singleton is set twice -- once before the local merge, once after. Any consumer reading between the two sees a stale matrix.                                                                                                                                |

**Guarantees the composition pipeline gives, each of them a trap if you assume otherwise.** These
read like the open gaps above and are not — a caller that codes defensively around them is guarding
against a shape this pipeline does not produce:

| Behaviour                          | Guarantee now in force                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unparseable `metadata.yaml`        | `extractAllSkills` wraps `parseYaml` and **warns naming the path**, skipping that skill alone. One bad file does not take the scan down.                                                                                                                                                                                    |
| Duplicate skill id                 | `buildResolvedSkillMap` **warns naming both paths** and keeps the first. Silently overwriting left the loser no trace at all.                                                                                                                                                                                               |
| Local skill slugs                  | `mergeLocalSkillsIntoMatrix` calls the exported `claimSlug` for every local skill, so `getSkillBySlug` answers for them. First claim wins; a re-statement of a claim the same id already holds is not a collision, which is what lets a local skill overriding a matrix id keep its slug.                                   |
| Partially resolvable `requires`    | `resolveEveryNeed` returns `null` unless **every** `need` resolves, so the rule is dropped WHOLE. Keeping the survivors applied a requirement nobody wrote — under AND it narrowed the rule, under OR it removed an alternative, and either was shown to the user under the author's own `reason`.                          |
| Unresolved rule slugs and `doctor` | `collectUnresolvedSlugs` puts them on `MergedSkillsMatrix.unresolvedSlugs`, and `checkUnresolvedRuleSlugs` reports one finding per slug. Asked of the RULES rather than counted off the resolution pass, which walks every rule once per skill — one typo would otherwise report as many findings as the source has skills. |

### Note on #1 — the reach of auto-synthesis

Scoping category auto-synthesis to `custom: true` only is **open** and the
**mechanism** is unchanged: `synthesizeCategory` (`src/cli/lib/matrix/skill-resolution.ts`) still
placeholders any category absent from the passed `CategoryMap`, regardless of `custom`. The
**reach** is what the definitions bound:

- `src/cli/lib/configuration/default-categories.ts` defines every member of the generated
  `Category` union, pinned key-for-key by
  `src/cli/lib/configuration/__tests__/default-categories.test.ts`.
- `BUILT_IN_MATRIX` (`src/cli/types/generated/matrix.ts`) is produced by
  `scripts/generate-source-types.ts` calling
  `mergeMatrixWithSkills(defaultCategories, defaultRules.relationships, skills)`. It carries
  **zero** synthesized categories — no `"order": 999` and no
  `"description": "Auto-generated category for ..."` entries.
- `loadAndMergeFromBasePath` (`source-loader.ts`) passes `{ ...defaultCategories, ...sourceCategories }`,
  so a built-in category cannot fall through to synthesis on the source-load path either.

Auto-synthesis is therefore reachable today only when: (a) a source ships a skill whose category is
outside the generated union and outside its own `skill-categories.ts`; or (b) something calls
`loadAndMergeSkillsMatrix()`, which merges no defaults — and nothing does, so (a) is the only
route anything actually takes (see [Matrix Loader](#matrix-loader-srcclilibmatrixmatrix-loaderts)).
Regeneration against a marketplace that adds
a new category will synthesize it once and then fail `default-categories.test.ts` — the drift now
surfaces as a red test rather than an `order: 999` placeholder in the wizard.

**Consumer rule:** treat the matrix composition pipeline as current-known-behavior. If you are reading the matrix in `doctor` or any new path that exercises multi-source / custom-skill composition, assume these gaps exist and guard around them.

## Operations Layer Integration

The operations layer (`src/cli/lib/operations/skills/`) provides higher-level wrappers used by commands:

| Operation                   | File                                           | Wraps                                                                               |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `discoverInstalledSkills()` | `operations/skills/discover-skills.ts`         | 4-way merge: global plugins + global local + project plugins + project local skills |
| `installPluginSkills()`     | `operations/skills/install-plugin-skills.ts`   | Install skill plugins via Claude CLI by scope                                       |
| `uninstallPluginSkills()`   | `operations/skills/uninstall-plugin-skills.ts` | Uninstall skill plugins via Claude CLI by scope                                     |
| `copyLocalSkills()`         | `operations/skills/copy-local-skills.ts`       | Copy local-source skills to scope-appropriate directories                           |

See `reference/features/operations-layer.md` for the full operations layer documentation.
