---
scope: reference
area: architecture
keywords: [boundaries, input, parse, write, exec, security]
related:
  - reference/architecture-overview.md
  - reference/type-system.md
  - reference/features/configuration.md
last_validated: 2026-07-30
---

<!-- VALIDATED 2026-08-01 · PARTIAL (product 0.147.1)
     ✓ Key Files table, §1 CLI input boundaries (incl. new 1.4), §7 helper-function table and
       the source-validator.ts parse-cause claims
     ✗ §2-6, §8 — no schema, write-path or shell-boundary diff touched them; 2026-07-30 basis
-->

# Boundary Map

**Last Updated:** 2026-08-01
**Last Validated:** 2026-08-01 — **PARTIAL.** Key Files, section 1 (incl. new 1.4) and the section 7 helper table re-verified against source at 0.147.1. Sections 2-6 and 8 were not re-checked this pass and still carry their 2026-07-30 validation.

> **Do not "fix" the frontmatter `last_validated` to match the line above.** It is deliberately held at **2026-07-30** because a partial pass must not advance it. The staleness dashboard reads frontmatter, not this header, so stamping the file current would report sections 2-6 and 8 as freshly checked when nothing verified them.

## Overview

**Purpose:** Identifies all system boundaries where external data enters or leaves the CLI, and documents what validation/sanitization exists at each boundary.

**Key Files:**

| File                                               | Purpose                                                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/base-command.ts`                          | Base `--source` flag definition, error handling, terminal-geometry startup gate                                                         |
| `src/cli/hooks/init.ts`                            | Raw argv extraction of `--source` before oclif parsing                                                                                  |
| `src/cli/utils/terminal.ts`                        | Terminal-geometry predicate + message shared by both size gates (section 1.4)                                                           |
| `src/cli/utils/exec.ts`                            | Shell execution boundary, input validation                                                                                              |
| `src/cli/utils/fs.ts`                              | `readFileSafe()` with size limits                                                                                                       |
| `src/cli/lib/schemas.ts`                           | All Zod schemas for parse boundaries + metadata issue splitting (schema count lives in `reference/types/zod-schemas.md`, which owns it) |
| `src/cli/lib/configuration/config.ts`              | Source validation (`validateSourceFormat`)                                                                                              |
| `src/cli/lib/configuration/config-loader.ts`       | jiti TypeScript config loading                                                                                                          |
| `src/cli/lib/configuration/project-config.ts`      | `.claude-src/config.ts` load boundary; `ConfigLoadError` for corrupt-but-present configs (D-273)                                        |
| `src/cli/lib/configuration/config-writer.ts`       | Config file generation                                                                                                                  |
| `src/cli/lib/configuration/config-types-writer.ts` | Writer selection (project=import-from-global, global=standalone, D-228)                                                                 |
| `src/cli/lib/installation/local-installer.ts`      | Scoped config writes, cross-scope reconciliation, propagation to and pruning of registered projects                                     |
| `src/cli/lib/loading/source-loader.ts`             | Source fetch/network boundary; `matrixOnly` + `skipExtraSources` opt-outs                                                               |
| `src/cli/lib/stacks/stack-plugin-compiler.ts`      | Stack plugin compilation (`compileStackPlugin`)                                                                                         |
| `src/cli/lib/compiler.ts`                          | Liquid template sanitization, agent output, per-skill pluginRef derivation (`derivePluginRef`, D-217)                                   |
| `src/cli/lib/skills/skill-copier.ts`               | Path traversal prevention                                                                                                               |
| `src/cli/lib/plugins/plugin-settings.ts`           | Claude settings/registry JSON parsing (`installed_plugins.json` v2 registry)                                                            |
| `src/cli/lib/plugins/plugin-finder.ts`             | Plugin manifest JSON parsing                                                                                                            |
| `src/cli/lib/plugins/plugin-validator.ts`          | Plugin/skill/agent frontmatter validation                                                                                               |
| `src/cli/lib/source-validator.ts`                  | Source directory validation (`checkDirNameMatchesSkillId` compares dir name to the SKILL.md machine id)                                 |
| `src/cli/commands/uninstall.tsx`                   | Filesystem DELETE boundary (plugins, skills, agents, config manifest) + registry deregistration                                         |
| `src/cli/consts.ts`                                | File size limit constants                                                                                                               |

---

## 1. CLI Input Boundaries

### 1.1 Base Flag: `--source`

| Property       | Value                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| **Location**   | `src/cli/base-command.ts`                                                                 |
| **Direction**  | IN                                                                                        |
| **Data**       | Skills source path or URL                                                                 |
| **Validation** | oclif `Flags.string()` (accepts any string), then `validateSourceFormat()` in `config.ts` |
| **Schema**     | None (string flag); validated by `validateSourceFormat()`                                 |

Most commands inherit `baseFlags` (the `--source` / `-s` flag), which is optional and accepts any string. Actual validation happens in `resolveSource()` in `config.ts`.

**Seven commands override `static baseFlags = {}` and therefore do NOT accept `--source`:** `doctor`, `search`, `validate`, `import skill`, `new skill`, `build plugins`, `build marketplace`. Verified by `grep -rln "static baseFlags = {}" src/cli/commands` at time of writing; the previous text named only the first three, which would have an agent emit `--source` on four commands that reject it.

`edit` is the one command that re-declares the inheritance explicitly — its `static flags` opens with `...BaseCommand.baseFlags` rather than relying on oclif merging `baseFlags` for it.

### 1.2 Init Hook: Raw argv Extraction

| Property       | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| **Location**   | `src/cli/hooks/init.ts`                                                      |
| **Direction**  | IN                                                                           |
| **Data**       | `--source` and `-s` flags extracted from raw `options.argv`                  |
| **Validation** | Manual string extraction (indexOf + split), then passed to `resolveSource()` |
| **Schema**     | None at extraction point; downstream `validateSourceFormat()` validates      |

The init hook runs before oclif parses flags. It manually extracts `--source` / `--source=value` / `-s` from `options.argv` to pre-resolve the source config. This is a raw CLI input boundary with no validation at extraction -- validation happens in `resolveSource()` in `config.ts`.

### 1.3 Per-Command Flag Definitions

Every command extends `BaseCommand` and defines `static flags`. oclif handles type coercion, required validation, and enum constraints.

| Command             | File                            | Flags (beyond `--source`)                                                                                                                                      |
| ------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`              | `commands/init.tsx`             | `--refresh` (boolean)                                                                                                                                          |
| `edit`              | `commands/edit.tsx`             | `--refresh` (boolean), `--project-setup` (boolean, hidden internal flag `EDIT_PROJECT_SETUP_FLAG`)                                                             |
| `compile`           | `commands/compile.ts`           | `--verbose` (boolean)                                                                                                                                          |
| `list`              | `commands/list.tsx`             | (base only); alias `ls`                                                                                                                                        |
| `eject`             | `commands/eject.ts`             | `type` (**positional, optional**, enum: `agent-partials` \| `templates` \| `skills` \| `all`); `--force` (boolean), `--output` (string), `--refresh` (boolean) |
| `search`            | `commands/search.ts`            | `query` (positional, required); `baseFlags = {}` (inherits none)                                                                                               |
| `update`            | `commands/update.tsx`           | `skill` (positional, optional); `--yes` (boolean)                                                                                                              |
| `uninstall`         | `commands/uninstall.tsx`        | `--yes` / `-y` (boolean). **`--all` was removed (D-274)** — manifest removal is now unconditional.                                                             |
| `validate`          | `commands/validate.ts`          | (none); `baseFlags = {}` (zero-flag command)                                                                                                                   |
| `doctor`            | `commands/doctor.ts`            | (none); `baseFlags = {}` (drops `--source`)                                                                                                                    |
| `import skill`      | `commands/import/skill.ts`      | `source` (positional, required); `--skill` (string), `--all` (boolean), `--list` (boolean), `--force` (boolean); **`baseFlags = {}`**                          |
| `new skill`         | `commands/new/skill.ts`         | `name` (positional, required); `--author` (string), `--category` (string), `--domain` (string), `--force` (boolean); **`baseFlags = {}`**                      |
| `new agent`         | `commands/new/agent.tsx`        | `name` (positional, required); `--purpose` (string), `--force` (boolean)                                                                                       |
| `new marketplace`   | `commands/new/marketplace.ts`   | `name` (positional, required); `--force` (boolean)                                                                                                             |
| `build plugins`     | `commands/build/plugins.ts`     | `--agents-dir` (string), `--output-dir` (string), `--skill` (string), `--verbose` (boolean); **`baseFlags = {}`**                                              |
| `build marketplace` | `commands/build/marketplace.ts` | `--name` (string), `--plugins-dir` (string), `--output` (string), `--verbose` (boolean); **`baseFlags = {}`**                                                  |

**`eject`'s positional `type` is the only enum-constrained arg in the CLI.** oclif rejects a value outside `EJECT_TYPES` (`agent-partials`, `templates`, `skills`, `all`, declared module-private in `commands/eject.ts`) at parse time, before `run()`. It is optional — omitting it is valid and handled inside the command.

**Validation pattern:** oclif validates flag types, required status, and enum `options` at parse time. String flags pass through without content validation -- downstream code validates semantics (e.g., `validateSourceFormat` for source strings).

> **This table exists to place oclif parsing on the boundary map, not to be the flag reference.** [`commands/index.md`](./commands/index.md) is canonical for signatures. If the two disagree, `commands/index.md` wins — that is what happened on 2026-08-01, when this table understated the `baseFlags = {}` overrides and omitted `eject`'s positional arg while `commands/index.md` had both right.

### 1.4 Terminal Geometry (Environment Input, Blocking)

The one input boundary that can **halt a command before it parses anything**. Terminal dimensions are environment data (`process.stdout.columns` / `.rows`, and the `resize` event) read at two points on opposite sides of the Ink mount.

| Property       | Value                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direction**  | IN (environment)                                                                                                                                      |
| **Data**       | `process.stdout.columns` / `.rows`; stdout `resize` events                                                                                            |
| **Threshold**  | `MIN_TERMINAL_SIZE` (`COLS: 80`, `ROWS: 20`) in `src/cli/consts.ts` — one constant, both gates                                                        |
| **Validation** | `isTerminalLargeEnough(columns, rows)` in `src/cli/utils/terminal.ts`                                                                                 |
| **Message**    | `formatTerminalTooSmallMessage(columns)` in the same module — one wording, so the E2E `STEP_TEXT.TOO_NARROW` / `TOO_SHORT` constants match both gates |

| Gate                               | File                                          | Position                    | Failure behaviour                                                                                 |
| ---------------------------------- | --------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- |
| `BaseCommand.ensureTerminalSize()` | `src/cli/base-command.ts`                     | `init()`, before Ink mounts | **Blocks** — clears screen, prints, then awaits a `resize` listener + 500 ms poll. Does not exit. |
| `WizardLayout` size guard          | `src/cli/components/wizard/wizard-layout.tsx` | Every render, after mount   | Returns `TerminalTooSmall` in place of the wizard tree; restores on growth with state intact.     |

**Boundary contracts:**

- **The startup gate blocks, it does not error.** No exit code is emitted for a too-small terminal — the command waits. Anything driving the CLI non-interactively at a small geometry hangs rather than failing, which is why the E2E harness sizes its PTY explicitly.
- **Not a TTY, not gated at render.** `useTerminalDimensions()` falls back to 80x24 when stdout is not a TTY (piped output, CI), so the render guard passes by default off-TTY. The startup gate falls back to `MIN_TERMINAL_SIZE` itself for the same reason.
- **`LOGO_MIN_TERMINAL_ROWS` (26) is not part of this boundary.** It gates one decorative element inside a terminal that already cleared the gate. See `architecture-overview.md` section 18.

---

## 2. File System Parse Boundaries (Data IN)

### 2.1 YAML Parse Pattern

**Note:** `src/cli/utils/yaml.ts` (`safeLoadYamlFile`) was removed as dead code. Production code uses the same validation pattern inline at each call site:

`readFileSafe()` (size limit) -> `parseYaml()` -> `schema.safeParse()`

Default size limit: `MAX_CONFIG_FILE_SIZE` (1 MB, in `consts.ts`).

### 2.2 TypeScript Config via `loadConfig` (jiti)

| Property       | Value                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------- |
| **Location**   | `src/cli/lib/configuration/config-loader.ts`                                                       |
| **Direction**  | IN                                                                                                 |
| **Data**       | `.claude-src/config.ts`, `config/stacks.ts`, `config/skill-categories.ts`, `config/skill-rules.ts` |
| **Validation** | Optional Zod schema via `schema.safeParse()`                                                       |
| **Mechanism**  | jiti dynamic import with module cache disabled, alias for `@agents-inc/cli/config`                 |

Callers:

| Caller                       | File                              | Schema Used                                            |
| ---------------------------- | --------------------------------- | ------------------------------------------------------ |
| `loadProjectConfigFromDir()` | `configuration/project-config.ts` | `projectConfigLoaderSchema` (via raw load + safeParse) |
| `loadGlobalSourceConfig()`   | `configuration/config.ts`         | `projectSourceConfigSchema`                            |
| `validateTsConfig()`         | `source-validator.ts` (internal)  | Passed by caller for each config file                  |
| `loadSkillCategories()`      | `matrix/matrix-loader.ts`         | `skillCategoriesFileSchema`                            |
| `loadSkillRules()`           | `matrix/matrix-loader.ts`         | `skillRulesFileSchema`                                 |
| `loadStacks()`               | `stacks/stacks-loader.ts`         | `stacksConfigSchema`                                   |

**Missing vs corrupt (D-273):** `loadProjectConfigFromDir()` returns `null` **only** when the config file does not exist. Once the file exists, three failure modes throw `ConfigLoadError(configPath, reason)` instead of degrading to `null`:

| Failure                                     | Reason string source                       |
| ------------------------------------------- | ------------------------------------------ |
| jiti load throws (syntax/eval error)        | `getErrorMessage(error)`                   |
| Result is not an object (no default export) | `"the file has no valid default export"`   |
| `projectConfigLoaderSchema` rejects it      | `formatZodErrors(result.error).join("; ")` |

Two non-fatal repairs still happen after a successful parse: a missing `name` warns and defaults to `path.basename(projectDir)`; a missing `skills` warns and defaults to `[]`.

Caller handling of `ConfigLoadError` is tabulated in `architecture-overview.md` section 17.

### 2.3 Direct YAML Parse + Zod safeParse (Production Call Sites)

| File                              | What Is Parsed                           | Schema Used                                                                                                   |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `matrix/matrix-loader.ts`         | `metadata.yaml` per skill                | `rawMetadataSchema` (local schema, stricter than `skillMetadataLoaderSchema` — requires `author`, `category`) |
| `skills/skill-plugin-compiler.ts` | `metadata.yaml` for skill compilation    | `skillMetadataLoaderSchema`                                                                                   |
| `skills/skill-metadata.ts`        | `metadata.yaml` for local skill metadata | `localSkillMetadataSchema`                                                                                    |
| `skills/skill-metadata.ts`        | `metadata.yaml` for fork injection       | `localSkillMetadataSchema`                                                                                    |
| `source-validator.ts`             | `metadata.yaml` for strict validation    | `metadataValidationSchema` / `customMetadataValidationSchema`                                                 |
| `agents/agent-plugin-compiler.ts` | Agent `.md` frontmatter                  | `agentFrontmatterValidationSchema`                                                                            |

### 2.4 JSON Parse Boundaries (Production)

| File                          | What Is Parsed                                     | Validation After Parse                                                 |
| ----------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `utils/exec.ts`               | Claude CLI JSON stdout (`marketplace list --json`) | `marketplaceInfoListSchema.safeParse()` (Zod; returns `[]` on failure) |
| `plugins/plugin-finder.ts`    | `plugin.json` manifest                             | `pluginManifestSchema.parse()` (throws on failure)                     |
| `plugins/plugin-validator.ts` | `plugin.json` for validation                       | `pluginManifestValidationSchema.safeParse()`                           |
| `plugins/plugin-validator.ts` | `plugin.json` as raw Record                        | Type assertion only (`loadManifestForValidation()`)                    |
| `plugins/plugin-settings.ts`  | `.claude/settings.json`                            | `pluginSettingsSchema.safeParse()`                                     |
| `plugins/plugin-settings.ts`  | `~/.claude/plugins/installed_plugins.json`         | `installedPluginsSchema.safeParse()`                                   |
| `marketplace-generator.ts`    | `plugin.json` for marketplace build                | `pluginManifestSchema.parse()`                                         |
| `versioning.ts`               | `plugin.json` for version check                    | `pluginManifestSchema.parse()`                                         |
| `loading/source-fetcher.ts`   | `marketplace.json` from fetched source             | `validateNestingDepth()` + `marketplaceSchema.safeParse()`             |
| `commands/import/skill.ts`    | Imported skill metadata (YAML + JSON fallback)     | `importedSkillMetadataSchema.safeParse()`                              |
| `schema-validator.ts`         | `plugin.json` in validation targets                | `pluginManifestSchema` via `safeParse()`                               |

### 2.5 File Size Enforcement

| Constant                    | Value  | File        | Used By                                                                                |
| --------------------------- | ------ | ----------- | -------------------------------------------------------------------------------------- |
| `MAX_CONFIG_FILE_SIZE`      | 1 MB   | `consts.ts` | `permission-checker.tsx`, `plugin-settings.ts`                                         |
| `MAX_PLUGIN_FILE_SIZE`      | 1 MB   | `consts.ts` | `plugin-finder.ts`, `plugin-validator.ts`, `versioning.ts`, `marketplace-generator.ts` |
| `MAX_MARKETPLACE_FILE_SIZE` | 10 MB  | `consts.ts` | `source-fetcher.ts`                                                                    |
| `MAX_JSON_NESTING_DEPTH`    | 10     | `consts.ts` | `source-fetcher.ts` (marketplace.json)                                                 |
| `MAX_MARKETPLACE_PLUGINS`   | 10,000 | `consts.ts` | (available for marketplace size validation)                                            |

All enforced via `readFileSafe()` in `utils/fs.ts` which checks `stats.size` before reading.

### 2.6 Claude CLI Plugin Registry (`installed_plugins.json`)

The claude CLI (>= 2.1.220) records installs in `<pluginsDir>/installed_plugins.json` and lays plugins out under `cache/<marketplace>/<plugin>/<version>/` rather than as direct children of the plugins directory. Two readers with **deliberately different failure contracts** exist in `src/cli/lib/plugins/plugin-settings.ts`:

| Function                         | Path                                                   | On unreadable / schema-invalid registry                                | Consumers                         |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------- |
| `listRegisteredPluginInstalls()` | `getInstalledPluginsRegistryPath(pluginsDir)`          | **Throws** — the registry is the source of truth for what is installed | `commands/validate.ts`            |
| `resolvePluginInstallPaths()`    | `getInstalledPluginsRegistryPath(getUserPluginsDir())` | `verbose()` + returns `[]` (best-effort resolution)                    | `getVerifiedPluginInstallPaths()` |

Both use `readFileSafe(MAX_CONFIG_FILE_SIZE)` -> `JSON.parse()` -> `installedPluginsSchema.safeParse()`. `listRegisteredPluginInstalls()` flattens `plugins[key][]` to unique `(pluginKey, installPath)` pairs across all scopes; `resolvePluginInstallPaths()` picks one installation per key via `pickInstallation()` (this project's `scope: "project"` entry wins, else the `scope: "user"` entry).

**Validate-command fallback ladder** (`Validate.validateRegistryPlugins()` in `commands/validate.ts`):

1. Registry file absent -> fall through to the direct-children scan (`findPluginDirectories`).
2. Registry present but unreadable/invalid -> log `failed: <reason>` and count **1 error** (never scan around it).
3. Registry present and records **zero** installs -> return `undefined` so the caller falls back to the direct-children scan.
4. Otherwise validate each recorded `installPath` via `validatePlugin()`. A recorded path that no longer exists surfaces as an **invalid plugin** through `validatePlugin`'s structure check, not a crash.

### 2.7 Network Boundary: Source Fetch and the `matrixOnly` Opt-Out

`loadSkillsMatrixFromSource(options)` in `src/cli/lib/loading/source-loader.ts` is the single entry point for materialising the skills matrix. Two options control how much of the boundary is crossed:

| Option             | Effect                                                                                                                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skipExtraSources` | Skips `loadSkillsFromAllSources()`. Extra sources only annotate `availableSources` / `activeSource` for wizard UI tagging — they never add skills or categories to the matrix.                                                                                                      |
| `matrixOnly`       | For the DEFAULT source, skips the `fetchFromSource()` clone entirely and returns `sourcePath: ""`. The matrix is the pre-computed `BUILT_IN_MATRIX` regardless, so nothing is lost. Local paths and custom remotes, which must be read from disk to build a matrix, are unaffected. |

**Why it matters:** without `matrixOnly` the default-source path performs a git clone on a cold cache. `compile` and `uninstall` both need a matrix but no skill files, and both must work offline.

| Caller                                 | Options                                    | Purpose                                                                                    |
| -------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `Compile.refreshConfigTypes()`         | `skipExtraSources: true, matrixOnly: true` | Regenerate `config-types.ts` for the compiled scope without touching the network.          |
| `Uninstall.prepareGlobalPropagation()` | `skipExtraSources: true, matrixOnly: true` | Load the matrix needed to prune registered projects before the global manifest is deleted. |

Both combinations are byte-identical to the wizard's fully-tagged load for config-types purposes — the config-types writer never reads the extra-source annotations. Pinned by the `skipExtraSources` parity test in `src/cli/lib/installation/local-installer.test.ts`.

---

## 3. File System Write Boundaries (Data OUT)

### 3.1 Config Writer

| Function                                 | File                             | What It Writes                         | Where                          |
| ---------------------------------------- | -------------------------------- | -------------------------------------- | ------------------------------ |
| `generateConfigSource()`                 | `configuration/config-writer.ts` | TypeScript config source               | Returns string (caller writes) |
| `ensureBlankGlobalConfig()`              | `configuration/config-writer.ts` | Global `config.ts` + `config-types.ts` | `~/.claude-src/`               |
| `generateBlankGlobalConfigSource()`      | `configuration/config-writer.ts` | Empty global config                    | Returns string                 |
| `generateBlankGlobalConfigTypesSource()` | `configuration/config-writer.ts` | Never-type config types                | Returns string                 |

Config writer uses `JSON.parse(JSON.stringify(x))` to strip undefined values before generating TypeScript source.

### 3.2 Config Types Writer

| Function                             | File                                   | What It Writes                                                          | Where                                   |
| ------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------- |
| `writeStandaloneConfigTypes()`       | `installation/local-installer.ts`      | Fully inlined union types (global path only)                            | `~/.claude-src/config-types.ts`         |
| `regenerateConfigTypes()`            | `configuration/config-types-writer.ts` | Project config-types.ts; emits import-from-global when global exists    | `<project>/.claude-src/config-types.ts` |
| `generateConfigTypesSource()`        | `configuration/config-types-writer.ts` | Standalone union source string                                          | Returns string                          |
| `generateProjectConfigTypesSource()` | `configuration/config-types-writer.ts` | Project source extending global types via `import type`                 | Returns string                          |
| `loadConfigTypesDataInBackground()`  | `configuration/config-types-writer.ts` | (reads matrix+agents for regen)                                         | Loads in background                     |
| `getGlobalConfigTypesPath()`         | `configuration/config-types-writer.ts` | (reads, not writes)                                                     | `~/.claude-src/config-types.ts`         |
| `regenerateScopeConfigTypes()`       | `installation/local-installer.ts`      | Scope-dispatching wrapper — applies the D-228 rule from one entry point | Whichever scope's `config-types.ts`     |

**Writer Selection Rule (D-228):** Project path writes go through `regenerateConfigTypes()` — it detects an existing global install and emits `import type { SkillId as GlobalSkillId, ... } from "<relpath>/config-types"` instead of duplicating global unions. Global path writes use `writeStandaloneConfigTypes()` directly. Never call `writeStandaloneConfigTypes()` for a project path — it bypasses the import-from-global branch.

`regenerateScopeConfigTypes(projectDir, config, matrix, agents)` is the one place that dispatch lives outside `writeScopedConfigs`: `isHomeDirectory(projectDir)` -> standalone, otherwise import-and-extend. `commands/compile.ts` calls it once per compile pass, including the pass that found no installed skills — the persisted config, not the discovered skills, drives the unions.

### 3.3 Skill Copier

| Function                                                          | File                     | What It Writes                                    | Where                        |
| ----------------------------------------------------------------- | ------------------------ | ------------------------------------------------- | ---------------------------- |
| `copySkillsToPluginFromSource()` / `copySkillsToLocalFlattened()` | `skills/skill-copier.ts` | Skill directories (SKILL.md, metadata.yaml, etc.) | `.claude/skills/<skill-id>/` |

Path traversal validation via `validateSkillPath()` in `skill-copier.ts` -- resolves paths and verifies they stay within the expected parent directory.

### 3.4 Local Installer

| Function                                     | File                              | What It Writes                                                                                                             | Where                                              |
| -------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `writeScopedConfigs()`                       | `installation/local-installer.ts` | Scoped config.ts files (global + project)                                                                                  | `.claude-src/config.ts` per scope                  |
| `compileAndWriteAgents()`                    | `installation/local-installer.ts` | Compiled agent markdown files                                                                                              | `.claude/agents/<name>.md` (project or `~/`)       |
| `propagateGlobalChangesToProjects()`         | `installation/local-installer.ts` | Re-writes `config.ts` + `config-types.ts` for registered projects                                                          | each tracked project's `.claude-src/`              |
| `pruneGlobalEntriesFromRegisteredProjects()` | `installation/local-installer.ts` | Same, with an EMPTIED global config so every inlined global row, tombstone, `selectedAgents` name and stack ref is dropped | each tracked project's `.claude-src/`              |
| `writeStandaloneConfigTypes()`               | `installation/local-installer.ts` | Inlined global unions (global path only, see 3.2)                                                                          | `~/.claude-src/config-types.ts`                    |
| `regenerateScopeConfigTypes()`               | `installation/local-installer.ts` | Scope-dispatched `config-types.ts` refresh (used by `compile`)                                                             | the compiled scope's `.claude-src/config-types.ts` |

Project-scoped `config-types.ts` writes delegate to `regenerateConfigTypes()` (see 3.2).

**Return-channel contract:** `writeScopedConfigs()` returns `ScopedConfigWriteResult { propagatedProjects: string[] }` — the registered project directories this write rewrote. The caller owns recompiling them; `init.tsx` and `edit.tsx` do so via `recompilePropagatedProjectAgents()` (D-240). `propagateGlobalChangesToProjects()` and `pruneGlobalEntriesFromRegisteredProjects()` both return `{ updated, skipped }`; `skipped` is surfaced to the user by `commands/uninstall.tsx` via `registeredProjectUpdateSkipped()`.

**Ordering constraint:** `pruneGlobalEntriesFromRegisteredProjects()` must run **after** the global `.claude-src` manifest is deleted, so each project's regenerated `config-types.ts` falls back to the standalone form instead of importing from a now-missing global `config-types.ts`.

### 3.5 Compiler Agent Output

| Function                     | File          | What It Writes                                    | Where                          |
| ---------------------------- | ------------- | ------------------------------------------------- | ------------------------------ |
| `compileAgentForPlugin()`    | `compiler.ts` | Compiled agent markdown via Liquid templates      | Returns string (caller writes) |
| `removeCompiledOutputDirs()` | `compiler.ts` | Removes `agents/`, `skills/`, `commands/` subdirs | Output directory               |

Template root resolution in `createLiquidEngine()` in `compiler.ts`: checks local `.claude-src/agents/_templates/`, legacy `.claude/templates/`, then CLI built-in `DIRS.templates`.

### 3.6 Per-Skill Source Propagation (D-217)

| Function                     | File                                   | Input                            | Output                                     |
| ---------------------------- | -------------------------------------- | -------------------------------- | ------------------------------------------ |
| `derivePluginRef()`          | `compiler.ts` (internal, non-exported) | `Skill.source` (per-skill field) | `${id}:${id}` when non-eject/non-undefined |
| `buildSkillRefsFromConfig()` | `resolver.ts`                          | `SkillConfig.source` per entry   | `SkillReference` with `source` propagated  |

**Contract (D-217):** `SkillConfig.source` on each skill config entry is authoritative for that skill's install mode. A skill renders a plugin reference (`${id}:${id}`) only when `skill.source` is defined and not `"eject"`. `undefined` source (user-authored local skills) and `"eject"` both fall through to bare id. There is no agent-level `installMode` override -- removing that dead plumbing from wrappers is covered in the D-217 finding.

### 3.7 Skill Metadata Injection

| Function                     | File                       | What It Writes                        | Where                   |
| ---------------------------- | -------------------------- | ------------------------------------- | ----------------------- |
| `injectForkedFromMetadata()` | `skills/skill-metadata.ts` | Updated metadata.yaml with forkedFrom | Skill's `metadata.yaml` |

### 3.8 Config-Semantics Boundary: Cross-Scope Reconciliation (D-279)

A **write-time invariant boundary**, distinct from the schema boundaries above: it does not validate incoming bytes, it enforces that the config the CLI is about to emit is semantically coherent across scopes. Before D-279 only one of the two project-config write paths reconciled at all, so `doctor` reported clean and `validate` exited 0 on a config carrying two live skills in an exclusive category.

| Property       | Value                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Location**   | `src/cli/lib/installation/local-installer.ts`                                                                                |
| **Function**   | `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)` (module-private)                                    |
| **Direction**  | OUT (pre-write)                                                                                                              |
| **Applied at** | `propagateGlobalChangesToProjects()` **and** the project-scope save branch of `writeScopedConfigs()` — both, unconditionally |
| **Invariant**  | A project's `config.ts` may not hold a live global entry that collides with what the project owns at project scope           |

**Collision test** (`buildProjectCollisionTest()`, shared by the mask producer and the self-heal):

| Kind         | Applies to      | Condition                                                                                                                  |
| ------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **IDENTITY** | skills + agents | The project owns the same id/name at project scope                                                                         |
| **CATEGORY** | skills only     | The project owns a DIFFERENT active skill in the same category AND the **merged matrix** declares `exclusive: true` for it |

**Boundary contracts:**

- **Read the merged matrix, not `defaultCategories`** — `isExclusiveCategory()` honours a source repo's category overrides.
- **An undeclared `exclusive` flag is NOT exclusive.** The wizard renderer defaults undeclared categories to exclusive (`cat.exclusive ?? true` in `lib/wizard/build-step-logic.ts`); a rule that masks _persisted_ entries deliberately does not.
- **Never throws on a custom skill.** `categoryOfSkill()` returns `undefined` for an id absent from the matrix or sitting in the `local` pseudo-category.
- **Global config is read-only here.** Masks are applied to the project split only — a tombstone is never written into `~/.claude-src/config.ts`.
- **Idempotent**, and self-healing: `dropOrphanedDerivedMasks()` / `dropOrphanedDerivedAgentMasks()` run BEFORE masking so a mask whose collision cleared is removed rather than re-derived.

### 3.9 Filesystem Delete Boundary (`uninstall`)

`src/cli/commands/uninstall.tsx` is the only command that removes CLI-managed content. Everything it deletes is enumerated up-front by `detectUninstallTarget(projectDir)` and rendered by the shared pure builder `buildRemovalPlan(target)`, which both the `--yes` plain-text plan (`printRemovalPlan`) and the Ink `UninstallConfirm` component consume, so the two renderings stay byte-identical.

| Section header       | What is deleted                                                                                                                  | Matching rule                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Plugins:`           | `<pluginsDir>/<pluginName>` + `claude plugin uninstall`                                                                          | `getCliInstalledPluginKeys(config)` — `id@source` and the `id@marketplace` variant |
| `CLI-managed files:` | `<skillsDir>/<dir>` where `metadata.yaml` carries `forkedFrom`; `<agentsDir>/<name>.md` where the basename is in `config.agents` | `readForkedFromMetadata()`; `listAgentMdFiles()`                                   |
| `Config:`            | `.claude-src/config.ts`, `.claude-src/config-types.ts`                                                                           | **Unconditional** (D-274) — no flag gates it                                       |

**Deletion contracts:**

- `.claude-src/` itself is removed only once empty (`removeDirIfEmpty`); user-owned content there (e.g. ejected templates) keeps it alive. `.claude/` follows the same rule and reports "Kept `.claude/` (contains user content)" otherwise.
- A skill directory without a `forkedFrom` marker is **skipped with a warning** — user-created content is never deleted.
- Plugin uninstall derives its scope per skill (`toClaudePluginScope(skillConfig?.scope)`) and goes through `claudePluginUninstallBestEffort()`, which tries the fallback scope too.
- **A project uninstall always deregisters** itself from the global `projects[]` registry (`deregisterProjectPath`). A failure there — missing, project-less, or `ConfigLoadError`-corrupt global config — **warns and continues**; it may never fail the uninstall.
- **A global uninstall** (`isHomeDirectory(projectDir)`) additionally prunes inlined global entries from every registered project. The data it needs (global config + matrix + agent defs) is captured by `prepareGlobalPropagation()` **before** any removal, because that data lives in the config being deleted. Unreachable projects are warned and skipped and can never abort the uninstall.

---

## 4. Shell Execution Boundaries

All shell execution goes through `execCommand()` in `src/cli/utils/exec.ts`.

### 4.1 Validation Functions

| Function                      | File      | What It Validates                              | Patterns                                          |
| ----------------------------- | --------- | ---------------------------------------------- | ------------------------------------------------- |
| `validatePluginPath()`        | `exec.ts` | Plugin path (max 1024 chars, no control chars) | `SAFE_PLUGIN_PATH_PATTERN`: `[a-zA-Z0-9._@/:~-]+` |
| `validateMarketplaceSource()` | `exec.ts` | Marketplace source (max 1024 chars)            | Same as `SAFE_PLUGIN_PATH_PATTERN`                |
| `validatePluginName()`        | `exec.ts` | Plugin name (max 256 chars)                    | `SAFE_NAME_PATTERN`: `[a-zA-Z0-9._@/-]+`          |

All three validate: non-empty, length limit, no control characters (`[\x00-\x08\x0E-\x1F\x7F]`), allowlist character pattern.

### 4.2 Shell Commands Executed

| Function                          | File      | Command                                          | Input Validation              |
| --------------------------------- | --------- | ------------------------------------------------ | ----------------------------- |
| `claudePluginInstall()`           | `exec.ts` | `claude plugin install <path> --scope <scope>`   | `validatePluginPath()`        |
| `claudePluginUninstall()`         | `exec.ts` | `claude plugin uninstall <name> --scope <scope>` | `validatePluginName()`        |
| `claudePluginMarketplaceAdd()`    | `exec.ts` | `claude plugin marketplace add <source>`         | `validateMarketplaceSource()` |
| `claudePluginMarketplaceRemove()` | `exec.ts` | `claude plugin marketplace remove <name>`        | `validatePluginName()`        |
| `claudePluginMarketplaceUpdate()` | `exec.ts` | `claude plugin marketplace update <name>`        | `validatePluginName()`        |
| `claudePluginMarketplaceList()`   | `exec.ts` | `claude plugin marketplace list --json`          | (no user input in args)       |
| `isClaudeCLIAvailable()`          | `exec.ts` | `claude --version`                               | (no user input in args)       |

**Execution method:** `spawn()` with args array (not shell string interpolation). The `stdio` is `["ignore", "pipe", "pipe"]` -- stdin is ignored, stdout/stderr are captured.

**Composite wrappers (no new shell string):** `claudePluginMarketplaceExists(name)` delegates to `claudePluginMarketplaceList()` and matches on `name` in JS (no user input in the executed args). `claudePluginUninstallBestEffort(pluginRef, primaryScope, projectDir)` calls `claudePluginUninstall()` (which runs `validatePluginName()`) for the primary scope then the fallback scope, swallowing each attempt's error. Both reuse the validated boundary functions above rather than executing their own commands.

---

## 5. Security Boundaries

### 5.1 Source Format Validation

| Property         | Value                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| **Location**     | `src/cli/lib/configuration/config.ts`                                                              |
| **Entry points** | `resolveSource()`, `resolveAllSources()`                                                           |
| **Applied to**   | `--source` flag, `CC_SOURCE` env var (`SOURCE_ENV_VAR` in `config.ts`), config file `source` field |

**Checks performed:**

| Check                         | Implementation                                 | Purpose                                                                                                          |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Null byte detection           | `NULL_BYTE_PATTERN` test                       | Prevent C-level string termination bypass in git/giget                                                           |
| Length limit                  | `MAX_SOURCE_LENGTH` (512) check                | Prevent oversized input                                                                                          |
| Path traversal in remote URLs | `PATH_TRAVERSAL_PATTERN` (`..`)                | Block `?branch=../../etc/passwd`                                                                                 |
| UNC path blocking             | `UNC_PATH_PATTERN` (`\\` or `//` prefix)       | Prevent SMB auth credential leaks                                                                                |
| Control character blocking    | `CONTROL_CHAR_PATTERN`                         | Prevent terminal injection                                                                                       |
| HTTP URL hostname validation  | `validateHttpUrl()`                            | Require valid hostname                                                                                           |
| Private IP blocking (SSRF)    | `PRIVATE_IPV4_PATTERN`, `PRIVATE_IPV6_PATTERN` | Block `127.x.x.x`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `0.0.0.0`, `169.254.x.x`, `::1`, `fd*:`, `fe80:*` |
| Git shorthand validation      | `validateGitShorthand()`                       | Require `owner/repo` format                                                                                      |

### 5.2 Liquid Template Injection Prevention

| Property     | Value                          |
| ------------ | ------------------------------ | ---- | --- | ---- |
| **Location** | `src/cli/lib/compiler.ts`      |
| **Function** | `sanitizeCompiledAgentData()`  |
| **Pattern**  | `LIQUID_SYNTAX_PATTERN`: `\{\{ | \}\} | \{% | %\}` |

Sanitizes ALL user-controlled fields before Liquid template rendering:

- `agent.name`, `agent.title`, `agent.description`, `agent.tools[]`, `agent.disallowedTools[]`, `agent.model`, `agent.permissionMode`
- `identity`, `playbook`, `output`, `criticalRequirementsTop`, `criticalReminders`
- All skills: `skill.id`, `skill.description`, `skill.usage`, `skill.pluginRef`
- `preloadedSkillIds[]`

Strips `{{`, `}}`, `{%`, `%}` from values and logs a warning when stripping occurs.

### 5.3 Path Traversal Prevention (Skill Copier)

| Property     | Value                                |
| ------------ | ------------------------------------ |
| **Location** | `src/cli/lib/skills/skill-copier.ts` |
| **Function** | `validateSkillPath()`                |

Validates that resolved skill paths stay within the expected parent directory:

1. Null byte check on the raw skill path
2. `path.resolve()` both the resolved path and expected parent
3. Verify resolved path starts with parent + path separator

Called for every skill copy operation to prevent `../../sensitive` traversal in skill paths.

### 5.4 `isLocalSource()` Traversal Check

| Property     | Value                                                                 |
| ------------ | --------------------------------------------------------------------- |
| **Location** | `src/cli/lib/configuration/config.ts` (`isLocalSource()`)             |
| **Purpose**  | Blocks `..` and `~` in paths that don't have remote protocol prefixes |

### 5.5 File Size Limits

See Section 2.5 above. All parse boundaries use `readFileSafe()` which enforces size limits before reading content.

### 5.6 JSON Nesting Depth

| Property      | Value                                          |
| ------------- | ---------------------------------------------- |
| **Location**  | `src/cli/lib/schemas.ts`                       |
| **Function**  | `validateNestingDepth()`                       |
| **Max depth** | `MAX_JSON_NESTING_DEPTH` = 10 (in `consts.ts`) |
| **Used at**   | `source-fetcher.ts` for marketplace.json       |

Recursively checks that parsed JSON/YAML does not exceed max nesting depth. Prevents stack overflow from deeply nested structures.

---

## 6. Plugin/Marketplace API Boundaries

### 6.1 Plugin Discovery

| Function                          | File                         | What It Reads                                              | Validation                                                                  |
| --------------------------------- | ---------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `readPluginManifest()`            | `plugins/plugin-finder.ts`   | `plugin.json`                                              | `readFileSafe(MAX_PLUGIN_FILE_SIZE)` + `pluginManifestSchema.parse()`       |
| `getEnabledPluginKeys()`          | `plugins/plugin-settings.ts` | `.claude/settings.json`                                    | `readFileSafe(MAX_CONFIG_FILE_SIZE)` + `pluginSettingsSchema.safeParse()`   |
| `resolvePluginInstallPaths()`     | `plugins/plugin-settings.ts` | `~/.claude/plugins/installed_plugins.json`                 | `readFileSafe(MAX_CONFIG_FILE_SIZE)` + `installedPluginsSchema.safeParse()` |
| `getVerifiedPluginInstallPaths()` | `plugins/plugin-settings.ts` | Combines settings + registry, verifies paths exist on disk | `fileExists()` check for each plugin manifest                               |

### 6.2 Plugin Validation

| Function                     | File                          | What It Validates       | Schema                                      |
| ---------------------------- | ----------------------------- | ----------------------- | ------------------------------------------- |
| `validatePluginManifest()`   | `plugins/plugin-validator.ts` | `plugin.json` structure | `pluginManifestValidationSchema` (strict)   |
| `validateSkillFrontmatter()` | `plugins/plugin-validator.ts` | `SKILL.md` frontmatter  | `skillFrontmatterValidationSchema` (strict) |
| `validateAgentFrontmatter()` | `plugins/plugin-validator.ts` | Agent `.md` frontmatter | `agentFrontmatterValidationSchema` (strict) |

### 6.3 Marketplace Registration (Shell Boundary)

| Function                          | File      | Direction                     | Validation                    |
| --------------------------------- | --------- | ----------------------------- | ----------------------------- |
| `claudePluginMarketplaceAdd()`    | `exec.ts` | OUT (registers marketplace)   | `validateMarketplaceSource()` |
| `claudePluginMarketplaceRemove()` | `exec.ts` | OUT (deregisters marketplace) | `validatePluginName()`        |
| `claudePluginInstall()`           | `exec.ts` | OUT (installs plugin)         | `validatePluginPath()`        |
| `claudePluginUninstall()`         | `exec.ts` | OUT (uninstalls plugin)       | `validatePluginName()`        |

### 6.4 Marketplace File Parsing

| Property       | Value                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Location**   | `src/cli/lib/loading/source-fetcher.ts`                                                                                                          |
| **Direction**  | IN                                                                                                                                               |
| **Data**       | `marketplace.json` from fetched remote source                                                                                                    |
| **Validation** | `readFileSafe(MAX_MARKETPLACE_FILE_SIZE)` -> `JSON.parse()` -> `validateNestingDepth(MAX_JSON_NESTING_DEPTH)` -> `marketplaceSchema.safeParse()` |

This is the most heavily validated parse boundary: size limit (10 MB), nesting depth (10), and full Zod schema validation.

### 6.5 Marketplace Generation

| Function                                        | File                       | Direction                                           |
| ----------------------------------------------- | -------------------------- | --------------------------------------------------- |
| `readPluginManifest()`                          | `marketplace-generator.ts` | IN (reads plugin manifests to generate marketplace) |
| (output written by `build marketplace` command) |                            | OUT (writes `marketplace.json`)                     |

---

## 7. Schema Reference

### Lenient Schemas (Parse Boundaries)

Used at data entry points with `.passthrough()` for forward compatibility.

| Schema                         | File                         | Used For                             |
| ------------------------------ | ---------------------------- | ------------------------------------ |
| `projectConfigLoaderSchema`    | `schemas.ts`                 | `.claude-src/config.ts` loading      |
| `projectSourceConfigSchema`    | `schemas.ts`                 | `.claude-src/config.yaml` loading    |
| `skillMetadataLoaderSchema`    | `schemas.ts`                 | `metadata.yaml` in skill compilation |
| `localSkillMetadataSchema`     | `schemas.ts`                 | Local skill metadata (forkedFrom)    |
| `localRawMetadataSchema`       | `schemas.ts`                 | Raw metadata in local skills         |
| `skillFrontmatterLoaderSchema` | `schemas.ts`                 | SKILL.md frontmatter (lenient)       |
| `pluginManifestSchema`         | `schemas.ts`                 | `plugin.json` loading                |
| `marketplaceSchema`            | `schemas.ts`                 | `marketplace.json` loading           |
| `pluginSettingsSchema`         | `plugins/plugin-settings.ts` | `.claude/settings.json`              |
| `installedPluginsSchema`       | `plugins/plugin-settings.ts` | `installed_plugins.json`             |
| `settingsFileSchema`           | `schemas.ts`                 | Settings YAML                        |
| `importedSkillMetadataSchema`  | `schemas.ts`                 | Imported skill metadata              |
| `stacksConfigSchema`           | `schemas.ts`                 | `config/stacks.ts`                   |
| `skillCategoriesFileSchema`    | `schemas.ts`                 | `config/skill-categories.ts`         |
| `skillRulesFileSchema`         | `schemas.ts`                 | `config/skill-rules.ts`              |
| `agentYamlConfigSchema`        | `schemas.ts`                 | Agent YAML definition                |

### Strict Schemas (Validation Boundaries)

Used for validation commands and build-time checks. Reject unknown fields via `.strict()`.

| Schema                             | File         | Used For                                   |
| ---------------------------------- | ------------ | ------------------------------------------ |
| `pluginManifestValidationSchema`   | `schemas.ts` | `agents-inc validate` plugin validation    |
| `skillFrontmatterValidationSchema` | `schemas.ts` | SKILL.md strict validation                 |
| `agentFrontmatterValidationSchema` | `schemas.ts` | Agent frontmatter strict validation        |
| `metadataValidationSchema`         | `schemas.ts` | Published skill metadata strict validation |
| `customMetadataValidationSchema`   | `schemas.ts` | Custom skill metadata validation           |
| `agentYamlGenerationSchema`        | `schemas.ts` | Compiled agent metadata validation         |
| `stackConfigValidationSchema`      | `schemas.ts` | Published stack config validation          |

### Utility Schemas (Shared Building Blocks)

| Schema                   | File         | Used In                                         |
| ------------------------ | ------------ | ----------------------------------------------- |
| `skillIdSchema`          | `schemas.ts` | Validated against generated `SKILL_IDS` array   |
| `skillSlugSchema`        | `schemas.ts` | Validated against generated `SKILL_SLUGS` array |
| `categorySchema`         | `schemas.ts` | Validated against generated `CATEGORIES` array  |
| `categoryPathSchema`     | `schemas.ts` | Known category, "local", or kebab-case          |
| `domainSchema`           | `schemas.ts` | Validated against generated `DOMAINS` array     |
| `agentNameSchema`        | `schemas.ts` | Validated against generated `AGENT_NAMES` array |
| `modelNameSchema`        | `schemas.ts` | `"sonnet" \| "opus" \| "haiku" \| "inherit"`    |
| `permissionModeSchema`   | `schemas.ts` | Agent permission modes                          |
| `skillAssignmentSchema`  | `schemas.ts` | Skill assignment objects                        |
| `stackAgentConfigSchema` | `schemas.ts` | Per-agent stack categories                      |
| `boundSkillSchema`       | `schemas.ts` | Bound skill entries                             |

### Helper Functions

| Function                          | File                  | Purpose                                                                                                                           |
| --------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `formatZodErrors()`               | `schema-validator.ts` | Format Zod issues to string array                                                                                                 |
| `formatZodIssue()`                | `schema-validator.ts` | Format a single Zod issue                                                                                                         |
| `formatZodIssues()`               | `schemas.ts`          | Join formatted issues into one `"; "`-separated string                                                                            |
| `validateSkillMetadata()`         | `schemas.ts`          | Selects `customMetadataValidationSchema` vs `metadataValidationSchema` via `isCustomMetadata()` — the one place that policy lives |
| `splitMetadataValidationIssues()` | `schemas.ts`          | Splits strict-metadata issues into hard `errors` and advisory `warnings`                                                          |
| `isCustomMetadata()`              | `schemas.ts`          | True for custom (non-marketplace) skill metadata                                                                                  |
| `validateNestingDepth()`          | `schemas.ts`          | Check JSON nesting depth                                                                                                          |
| `warnUnknownFields()`             | `schemas.ts`          | Log warnings for unexpected fields                                                                                                |

**Advisory-vs-hard metadata split:** an over-length `cliDescription` is the **only** advisory violation. `skillMetadataBaseSchema` (shared by `metadataValidationSchema` and `customMetadataValidationSchema`) keeps `.min(1).max(CLI_DESCRIPTION_MAX_LENGTH)` — 60, module-private in `schemas.ts` — as the declared contract. But the runtime loader schemas accept any length and the value only feeds wizard description text, so `commands/validate.ts` reports the `too_big` issue as a warning carrying the actual character count. `isOverLengthCliDescription()` matches on `code === "too_big"` at path `["cliDescription"]` exactly; an **empty** `cliDescription` trips `min(1)` and stays an error, as does every other issue. A skill is `valid` iff the hard-error list is empty.

**Skill-directory-name rule:** `checkDirNameMatchesSkillId()` in `source-validator.ts` compares the directory name against the skill's **machine id from `SKILL.md` frontmatter**, not against `displayName`. It runs independently of whether `metadata.yaml` validated, and an unreadable/invalid `SKILL.md` frontmatter yields a "Cannot verify directory name" issue rather than a false mismatch.

**Parse-failure causes are reported inconsistently across `source-validator.ts` phases (0.147.1).** Two of its `catch` blocks bound the error and discarded it; both now interpolate `getErrorMessage(error)`:

| Phase                                       | Message                                                           | Carries cause? |
| ------------------------------------------- | ----------------------------------------------------------------- | -------------- |
| `metadata.yaml` parse (skills phase 2)      | `Failed to parse YAML: <cause>`                                   | Yes            |
| Cross-reference load (categories/rules)     | `Cross-reference validation skipped: failed to load ...: <cause>` | Yes            |
| `validateYamlFiles()` (config/stacks files) | `Failed to parse YAML`                                            | **No**         |

`validateYamlFiles` uses a bare `catch {`, so it binds nothing and a linter cannot see it — the reason it fell outside the pass that fixed the other two. **Known gap, recorded not fixed.** The consequence at this boundary: an invalid `config/stacks.ts` or `config/skill-categories.ts` reports only the failure category, while an invalid `metadata.yaml` reports the YAML parser's line and column. Do not read "Failed to parse YAML" as a uniform contract.

---

## 8. Boundary Pattern Summary

### Data IN: Validation Chain

All data entering the system follows one of these validated paths:

```
CLI flags     --> oclif type checking --> downstream semantic validation (validateSourceFormat)
YAML files    --> readFileSafe(sizeLimit) --> parseYaml() --> schema.safeParse()
JSON files    --> readFileSafe(sizeLimit) --> JSON.parse() --> schema.safeParse() or schema.parse()
TS configs    --> fileExists() --> jiti.import() --> optional schema.safeParse()
                  (project config: missing => null; present-but-broken => throw ConfigLoadError)
Plugin registry --> readFileSafe(MAX_CONFIG_FILE_SIZE) --> JSON.parse() --> installedPluginsSchema.safeParse()
                  (validate path THROWS on invalid; resolve path degrades to [])
Shell output  --> JSON.parse(stdout) --> marketplaceInfoListSchema.safeParse() (Zod)
```

### Data OUT: Generation Chain

```
Project config --> reconcileProjectSplitAgainstGlobal() (self-heal masks, then mask collisions)
                   --> JSON.parse(JSON.stringify(x)) to strip undefined --> generateConfigSource() --> writeFile()
Config types   --> regenerateScopeConfigTypes() --> {writeStandaloneConfigTypes | regenerateConfigTypes} --> writeFile()
Agent data     --> sanitizeCompiledAgentData() --> Liquid template rendering --> writeFile()
Skill files    --> validateSkillPath() (traversal check) --> copy()
Shell commands --> validate{PluginPath|PluginName|MarketplaceSource}() --> spawn() with args array
Deletions      --> detectUninstallTarget() --> buildRemovalPlan() --> confirm --> remove() + removeDirIfEmpty()
```

### Shell-Output Boundaries (Now Zod-Validated)

| Location                                     | Handling                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claudePluginMarketplaceList()` in `exec.ts` | JSON.parse of Claude CLI stdout, then `marketplaceInfoListSchema.safeParse()` (`z.ZodType<MarketplaceInfo[]>`); returns `[]` and warns on failure |

The prior gap (only `Array.isArray()`, no schema) is closed — the Claude CLI marketplace-list output is now validated per-element by a Zod array schema. This boundary is low-risk regardless since the data comes from the locally-installed Claude CLI binary (trusted source), not from user or network input.
