---
scope: reference
area: architecture
keywords: [boundaries, input, parse, write, exec, security]
related:
  - reference/architecture-overview.md
  - reference/type-system.md
  - reference/features/configuration.md
last_validated: 2026-04-21
---

# Boundary Map

**Last Updated:** 2026-04-21

## Overview

**Purpose:** Identifies all system boundaries where external data enters or leaves the CLI, and documents what validation/sanitization exists at each boundary.

**Key Files:**

| File                                               | Purpose                                                                 |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/cli/base-command.ts`                          | Base `--source` flag definition, error handling                         |
| `src/cli/hooks/init.ts`                            | Raw argv extraction of `--source` before oclif parsing                  |
| `src/cli/utils/exec.ts`                            | Shell execution boundary, input validation                              |
| `src/cli/utils/fs.ts`                              | `readFileSafe()` with size limits                                       |
| `src/cli/lib/schemas.ts`                           | All Zod schemas (30+) for parse boundaries                              |
| `src/cli/lib/configuration/config.ts`              | Source validation (`validateSourceFormat`)                              |
| `src/cli/lib/configuration/config-loader.ts`       | jiti TypeScript config loading                                          |
| `src/cli/lib/configuration/config-writer.ts`       | Config file generation                                                  |
| `src/cli/lib/configuration/config-types-writer.ts` | Writer selection (project=import-from-global, global=standalone, D-228) |
| `src/cli/lib/installation/local-installer.ts`      | Scoped config writes, propagation to registered projects                |
| `src/cli/lib/stacks/stack-plugin-compiler.ts`      | Per-skill plugin ref derivation (D-217)                                 |
| `src/cli/lib/compiler.ts`                          | Liquid template sanitization, agent output                              |
| `src/cli/lib/skills/skill-copier.ts`               | Path traversal prevention                                               |
| `src/cli/lib/plugins/plugin-settings.ts`           | Claude settings/registry JSON parsing                                   |
| `src/cli/lib/plugins/plugin-finder.ts`             | Plugin manifest JSON parsing                                            |
| `src/cli/lib/plugins/plugin-validator.ts`          | Plugin/skill/agent frontmatter validation                               |
| `src/cli/consts.ts`                                | File size limit constants                                               |

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

All commands inherit `baseFlags` via `...BaseCommand.baseFlags`. The `--source` (`-s`) flag is optional and accepts any string. Actual validation happens in `resolveSource()` in `config.ts`.

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

| Command             | File                            | Flags (beyond `--source`)                                                                                                                                                                  |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `init`              | `commands/init.tsx`             | `--refresh` (boolean)                                                                                                                                                                      |
| `edit`              | `commands/edit.tsx`             | `--refresh` (boolean), `--agent-source` (string)                                                                                                                                           |
| `compile`           | `commands/compile.ts`           | `--verbose` (boolean), `--agent-source` (string)                                                                                                                                           |
| `list`              | `commands/list.tsx`             | (base only)                                                                                                                                                                                |
| `eject`             | `commands/eject.ts`             | `--force` (boolean), `--output` (string), `--refresh` (boolean)                                                                                                                            |
| `search`            | `commands/search.ts`            | `query` (positional, required); `baseFlags = {}` (inherits none)                                                                                                                           |
| `update`            | `commands/update.tsx`           | `--yes` (boolean), `--no-recompile` (boolean)                                                                                                                                              |
| `uninstall`         | `commands/uninstall.tsx`        | `--yes` (boolean), `--all` (boolean)                                                                                                                                                       |
| `validate`          | `commands/validate.ts`          | `--verbose` (boolean), `--all` (boolean), `--plugins` (boolean)                                                                                                                            |
| `doctor`            | `commands/doctor.ts`            | `--source` (string, own definition), `--verbose` (boolean)                                                                                                                                 |
| `import skill`      | `commands/import/skill.ts`      | `--skill` (string), `--all` (boolean), `--list` (boolean), `--subdir` (string), `--force` (boolean), `--refresh` (boolean)                                                                 |
| `new skill`         | `commands/new/skill.ts`         | `--author` (string), `--category` (string), `--domain` (string), `--force` (boolean), `--output` (string)                                                                                  |
| `new agent`         | `commands/new/agent.tsx`        | `--purpose` (string), `--non-interactive` (boolean), `--refresh` (boolean)                                                                                                                 |
| `new marketplace`   | `commands/new/marketplace.ts`   | `--force` (boolean), `--output` (string)                                                                                                                                                   |
| `build plugins`     | `commands/build/plugins.ts`     | `--skills-dir` (string), `--agents-dir` (string), `--output-dir` (string), `--skill` (string), `--verbose` (boolean)                                                                       |
| `build marketplace` | `commands/build/marketplace.ts` | `--plugins-dir` (string), `--output` (string), `--name` (string), `--version` (string), `--description` (string), `--owner-name` (string), `--owner-email` (string), `--verbose` (boolean) |

**Validation pattern:** oclif validates flag types, required status, and enum `options` at parse time. String flags pass through without content validation -- downstream code validates semantics (e.g., `validateSourceFormat` for source strings).

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

| File                          | What Is Parsed                                     | Validation After Parse                                     |
| ----------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| `utils/exec.ts`               | Claude CLI JSON stdout (`marketplace list --json`) | `Array.isArray()` check, cast to `MarketplaceInfo[]`       |
| `plugins/plugin-finder.ts`    | `plugin.json` manifest                             | `pluginManifestSchema.parse()` (throws on failure)         |
| `plugins/plugin-validator.ts` | `plugin.json` for validation                       | `pluginManifestValidationSchema.safeParse()`               |
| `plugins/plugin-validator.ts` | `plugin.json` as raw Record                        | Type assertion only (`loadManifestForValidation()`)        |
| `plugins/plugin-settings.ts`  | `.claude/settings.json`                            | `pluginSettingsSchema.safeParse()`                         |
| `plugins/plugin-settings.ts`  | `~/.claude/plugins/installed_plugins.json`         | `installedPluginsSchema.safeParse()`                       |
| `marketplace-generator.ts`    | `plugin.json` for marketplace build                | `pluginManifestSchema.parse()`                             |
| `versioning.ts`               | `plugin.json` for version check                    | `pluginManifestSchema.parse()`                             |
| `loading/source-fetcher.ts`   | `marketplace.json` from fetched source             | `validateNestingDepth()` + `marketplaceSchema.safeParse()` |
| `commands/import/skill.ts`    | Imported skill metadata (YAML + JSON fallback)     | `importedSkillMetadataSchema.safeParse()`                  |
| `schema-validator.ts`         | `plugin.json` in validation targets                | `pluginManifestSchema` via `safeParse()`                   |

### 2.5 File Size Enforcement

| Constant                    | Value  | File        | Used By                                                                                |
| --------------------------- | ------ | ----------- | -------------------------------------------------------------------------------------- |
| `MAX_CONFIG_FILE_SIZE`      | 1 MB   | `consts.ts` | `permission-checker.tsx`, `plugin-settings.ts`                                         |
| `MAX_PLUGIN_FILE_SIZE`      | 1 MB   | `consts.ts` | `plugin-finder.ts`, `plugin-validator.ts`, `versioning.ts`, `marketplace-generator.ts` |
| `MAX_MARKETPLACE_FILE_SIZE` | 10 MB  | `consts.ts` | `source-fetcher.ts`                                                                    |
| `MAX_JSON_NESTING_DEPTH`    | 10     | `consts.ts` | `source-fetcher.ts` (marketplace.json)                                                 |
| `MAX_MARKETPLACE_PLUGINS`   | 10,000 | `consts.ts` | (available for marketplace size validation)                                            |

All enforced via `readFileSafe()` in `utils/fs.ts` which checks `stats.size` before reading.

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

| Function                             | File                                   | What It Writes                                                       | Where                                   |
| ------------------------------------ | -------------------------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| `writeStandaloneConfigTypes()`       | `installation/local-installer.ts`      | Fully inlined union types (global path only)                         | `~/.claude-src/config-types.ts`         |
| `regenerateConfigTypes()`            | `configuration/config-types-writer.ts` | Project config-types.ts; emits import-from-global when global exists | `<project>/.claude-src/config-types.ts` |
| `generateConfigTypesSource()`        | `configuration/config-types-writer.ts` | Standalone union source string                                       | Returns string                          |
| `generateProjectConfigTypesSource()` | `configuration/config-types-writer.ts` | Project source extending global types via `import type`              | Returns string                          |
| `loadConfigTypesDataInBackground()`  | `configuration/config-types-writer.ts` | (reads matrix+agents for regen)                                      | Loads in background                     |
| `getGlobalConfigTypesPath()`         | `configuration/config-types-writer.ts` | (reads, not writes)                                                  | `~/.claude-src/config-types.ts`         |

**Writer Selection Rule (D-228):** Project path writes go through `regenerateConfigTypes()` — it detects an existing global install and emits `import type { SkillId as GlobalSkillId, ... } from "<relpath>/config-types"` instead of duplicating global unions. Global path writes use `writeStandaloneConfigTypes()` directly. Never call `writeStandaloneConfigTypes()` for a project path — it bypasses the import-from-global branch.

### 3.3 Skill Copier

| Function                                                          | File                     | What It Writes                                    | Where                        |
| ----------------------------------------------------------------- | ------------------------ | ------------------------------------------------- | ---------------------------- |
| `copySkillsToPluginFromSource()` / `copySkillsToLocalFlattened()` | `skills/skill-copier.ts` | Skill directories (SKILL.md, metadata.yaml, etc.) | `.claude/skills/<skill-id>/` |

Path traversal validation via `validateSkillPath()` in `skill-copier.ts` -- resolves paths and verifies they stay within the expected parent directory.

### 3.4 Local Installer

| Function                             | File                              | What It Writes                                         | Where                                                |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `writeScopedConfigs()`               | `installation/local-installer.ts` | Scoped config.ts files (global + project)              | `.claude-src/config.ts` per scope                    |
| `compileAndWriteAgents()`            | `installation/local-installer.ts` | Compiled agent markdown files                          | `.claude/agents/<name>.md` (project or `~/`)         |
| `propagateGlobalChangesToProjects()` | `installation/local-installer.ts` | Re-writes project config-types for registered projects | each tracked project's `.claude-src/config-types.ts` |
| `writeStandaloneConfigTypes()`       | `installation/local-installer.ts` | Inlined global unions (global path only, see 3.2)      | `~/.claude-src/config-types.ts`                      |

Project-scoped `config-types.ts` writes delegate to `regenerateConfigTypes()` (see 3.2).

### 3.5 Compiler Agent Output

| Function                     | File          | What It Writes                                    | Where                          |
| ---------------------------- | ------------- | ------------------------------------------------- | ------------------------------ |
| `compileAgentForPlugin()`    | `compiler.ts` | Compiled agent markdown via Liquid templates      | Returns string (caller writes) |
| `removeCompiledOutputDirs()` | `compiler.ts` | Removes `agents/`, `skills/`, `commands/` subdirs | Output directory               |

Template root resolution in `createLiquidEngine()` in `compiler.ts`: checks local `.claude-src/agents/_templates/`, legacy `.claude/templates/`, then CLI built-in `DIRS.templates`.

### 3.6 Per-Skill Source Propagation (D-217)

| Function                     | File                              | Input                            | Output                                     |
| ---------------------------- | --------------------------------- | -------------------------------- | ------------------------------------------ |
| `derivePluginRef()`          | `stacks/stack-plugin-compiler.ts` | `Skill.source` (per-skill field) | `${id}:${id}` when non-eject/non-undefined |
| `buildSkillRefsFromConfig()` | `resolver/*`                      | `SkillConfig.source` per entry   | `SkillReference` with `source` propagated  |

**Contract (D-217):** `SkillConfig.source` on each skill config entry is authoritative for that skill's install mode. A skill renders a plugin reference (`${id}:${id}`) only when `skill.source` is defined and not `"eject"`. `undefined` source (user-authored local skills) and `"eject"` both fall through to bare id. There is no agent-level `installMode` override -- removing that dead plumbing from wrappers is covered in the D-217 finding.

### 3.7 Skill Metadata Injection

| Function                     | File                       | What It Writes                        | Where                   |
| ---------------------------- | -------------------------- | ------------------------------------- | ----------------------- |
| `injectForkedFromMetadata()` | `skills/skill-metadata.ts` | Updated metadata.yaml with forkedFrom | Skill's `metadata.yaml` |

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

---

## 5. Security Boundaries

### 5.1 Source Format Validation

| Property         | Value                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| **Location**     | `src/cli/lib/configuration/config.ts`                                    |
| **Entry points** | `resolveSource()`, `resolveAllSources()`                                 |
| **Applied to**   | `--source` flag, `AGENTS_INC_SOURCE` env var, config file `source` field |

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
| `pluginManifestValidationSchema`   | `schemas.ts` | `agentsinc validate` plugin validation     |
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

| Function                 | File         | Purpose                            |
| ------------------------ | ------------ | ---------------------------------- |
| `formatZodErrors()`      | `schemas.ts` | Format Zod issues to string        |
| `validateNestingDepth()` | `schemas.ts` | Check JSON nesting depth           |
| `warnUnknownFields()`    | `schemas.ts` | Log warnings for unexpected fields |

---

## 8. Boundary Pattern Summary

### Data IN: Validation Chain

All data entering the system follows one of these validated paths:

```
CLI flags --> oclif type checking --> downstream semantic validation (validateSourceFormat)
YAML files --> readFileSafe(sizeLimit) --> parseYaml() --> schema.safeParse()
JSON files --> readFileSafe(sizeLimit) --> JSON.parse() --> schema.safeParse() or schema.parse()
TS configs --> fileExists() --> jiti.import() --> optional schema.safeParse()
Shell output --> JSON.parse(stdout) --> Array.isArray() / type assertion
```

### Data OUT: Generation Chain

```
Config objects --> JSON.parse(JSON.stringify(x)) to strip undefined --> generateConfigSource() --> writeFile()
Agent data --> sanitizeCompiledAgentData() --> Liquid template rendering --> writeFile()
Skill files --> validateSkillPath() (traversal check) --> copy()
Shell commands --> validate{PluginPath|PluginName|MarketplaceSource}() --> spawn() with args array
```

### Unvalidated Boundaries (Potential Gaps)

| Location                                     | Issue                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `claudePluginMarketplaceList()` in `exec.ts` | JSON.parse of Claude CLI stdout, only `Array.isArray()` check, no Zod schema, cast to `MarketplaceInfo[]` |
| Same function                                | Array elements cast as `MarketplaceInfo[]` without per-element validation                                 |

These are low-risk since the data comes from the locally-installed Claude CLI binary (trusted source), not from user or network input.
