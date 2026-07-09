---
scope: reference
area: architecture
keywords: [consts, messages, logger, fs, exec, typed-object]
related:
  - reference/architecture-overview.md
  - reference/dependency-graph.md
  - reference/test-infrastructure.md
last_validated: 2026-04-21
---

# Utilities Reference

**Last Updated:** 2026-04-21

## Utility Files

All utilities in `src/cli/utils/`.

| File              | Path                            | Purpose                                |
| ----------------- | ------------------------------- | -------------------------------------- |
| `errors.ts`       | `src/cli/utils/errors.ts`       | Error message extraction               |
| `exec.ts`         | `src/cli/utils/exec.ts`         | Shell command execution                |
| `frontmatter.ts`  | `src/cli/utils/frontmatter.ts`  | YAML frontmatter extraction            |
| `fs.ts`           | `src/cli/utils/fs.ts`           | File system wrappers                   |
| `logger.ts`       | `src/cli/utils/logger.ts`       | Logging: log, warn, verbose            |
| `messages.ts`     | `src/cli/utils/messages.ts`     | User-facing message constants          |
| `string.ts`       | `src/cli/utils/string.ts`       | String manipulation utilities          |
| `type-guards.ts`  | `src/cli/utils/type-guards.ts`  | Runtime type narrowing for union types |
| `typed-object.ts` | `src/cli/utils/typed-object.ts` | Type-safe Object.entries/keys          |

Exit codes live outside `utils/`: `src/cli/lib/exit-codes.ts` (`EXIT_CODES` constant). Base-command and commands import from there, not from `utils/`.

## Error Handling

### `getErrorMessage()` (`src/cli/utils/errors.ts`)

```typescript
function getErrorMessage(error: unknown): string;
```

Extracts human-readable message from unknown error value. Returns `error.message` for Error instances, `String(error)` otherwise.

**Used in:** Every catch block across the codebase.

## Shell Execution

### `execCommand()` (`src/cli/utils/exec.ts`)

```typescript
function execCommand(
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<ExecResult>;
```

Spawns a child process with stdio piped. Returns `{ stdout, stderr, exitCode }`.

### Exported Types

| Type              | Fields                             |
| ----------------- | ---------------------------------- |
| `ExecResult`      | `stdout`, `stderr`, `exitCode`     |
| `MarketplaceInfo` | `name`, `source`, `repo?`, `path?` |

### Claude CLI Wrappers

All validate inputs before execution (injection prevention via `validatePluginPath`, `validateMarketplaceSource`, `validatePluginName`):

| Function                          | Purpose                                                       |
| --------------------------------- | ------------------------------------------------------------- |
| `claudePluginInstall()`           | Install a plugin via `claude plugin install`                  |
| `claudePluginUninstall()`         | Uninstall via `claude plugin uninstall`                       |
| `claudePluginMarketplaceList()`   | List marketplaces via `claude plugin marketplace list --json` |
| `claudePluginMarketplaceExists()` | Check if marketplace is registered                            |
| `claudePluginMarketplaceAdd()`    | Register marketplace via `claude plugin marketplace add`      |
| `claudePluginMarketplaceRemove()` | Remove marketplace via `claude plugin marketplace remove`     |
| `claudePluginMarketplaceUpdate()` | Update marketplace via `claude plugin marketplace update`     |
| `isClaudeCLIAvailable()`          | Check if `claude` CLI is available                            |

**Total: 8 functions.** Install/Uninstall take `scope: "project" | "user"` and `projectDir`. `resolvePluginCwd()` picks `os.homedir()` for `"user"` scope so Claude writes settings to `~/.claude/settings.json`.

### Internal Helpers (not exported)

| Function                      | Purpose                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| `validatePluginPath()`        | Validates plugin path string (length, chars, control)                 |
| `validateMarketplaceSource()` | Validates marketplace source string                                   |
| `validatePluginName()`        | Validates plugin name string                                          |
| `resolvePluginCwd()`          | Returns `os.homedir()` for `"user"` scope, projectDir for `"project"` |

## Frontmatter

### `extractFrontmatter()` (`src/cli/utils/frontmatter.ts`)

```typescript
function extractFrontmatter(content: string): unknown | null;
```

Extracts YAML frontmatter from `---\n...\n---` delimited content. Returns parsed YAML object or null.

**Note:** For SKILL.md parsing, use `parseFrontmatter()` from `src/cli/lib/loading/loader.ts` instead -- it adds Zod validation.

## File System

### `src/cli/utils/fs.ts`

Wraps `fs-extra` and `fast-glob`:

| Function             | Signature                                     | Purpose                               |
| -------------------- | --------------------------------------------- | ------------------------------------- |
| `readFile()`         | `(filePath: string) => Promise<string>`       | Read file as UTF-8                    |
| `readFileSafe()`     | `(filePath, maxSizeBytes) => Promise<string>` | Read with size limit (DoS prevention) |
| `readFileOptional()` | `(filePath, fallback?) => Promise<string>`    | Read or return fallback               |
| `fileExists()`       | `(filePath: string) => Promise<boolean>`      | Check file/dir existence              |
| `directoryExists()`  | `(dirPath: string) => Promise<boolean>`       | Check directory existence             |
| `listDirectories()`  | `(dirPath: string) => Promise<string[]>`      | List subdirectories                   |
| `glob()`             | `(pattern, cwd) => Promise<string[]>`         | Fast-glob file matching               |
| `writeFile()`        | `(filePath, content) => Promise<void>`        | Write file (ensures parent dir)       |
| `ensureDir()`        | `(dirPath: string) => Promise<void>`          | Create directory recursively          |
| `remove()`           | `(filePath: string) => Promise<void>`         | Remove file/directory                 |
| `copy()`             | `(src, dest) => Promise<void>`                | Copy file/directory                   |

## Logger

### `src/cli/utils/logger.ts`

| Function       | Signature                                      | Visibility      | Purpose                       |
| -------------- | ---------------------------------------------- | --------------- | ----------------------------- |
| `log(msg)`     | `(msg: string) => void`                        | Always          | User-facing progress output   |
| `warn(msg)`    | `(msg: string, options?: WarnOptions) => void` | Always          | Issues user should know about |
| `verbose(msg)` | `(msg: string) => void`                        | Only if enabled | Diagnostic/debug info         |
| `setVerbose()` | `(enabled: boolean) => void`                   | N/A             | Enable/disable verbose mode   |

### `WarnOptions` type (`src/cli/utils/logger.ts`)

```typescript
export type WarnOptions = {
  /** When true, suppresses this warning in test environments (VITEST=true). */
  suppressInTest?: boolean;
};
```

The `warn()` function accepts an optional second parameter. When `suppressInTest: true` is set and `process.env.VITEST` is truthy, the warning is silently dropped. This prevents noisy test output for expected warnings.

### Startup Message Buffering

Before Ink takes over the terminal, `warn()` messages would be overwritten. Buffering captures them for display in Ink's `<Static>` component.

| Function              | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `enableBuffering()`   | Start capturing warn() messages in buffer |
| `drainBuffer()`       | Return captured messages and clear buffer |
| `disableBuffering()`  | Stop buffering and clear buffer           |
| `pushBufferMessage()` | Manually add a message to buffer          |

**Type:** `StartupMessage = { level: "info" | "warn" | "error"; text: string }`

**Used by:** `init.tsx` and `edit.tsx` to capture loading messages before wizard renders.

**Style guide** (from logger.ts comments):

- Start with capital letter
- End with period if complete sentence, no period if fragment after colon
- Wrap dynamic values in single quotes: `'value'`
- Do NOT prefix warn messages with "Warning:" (added automatically)
- After colon use lowercase
- Use em dash for supplemental info

## String Utilities

### `truncateText()` (`src/cli/utils/string.ts`)

```typescript
function truncateText(text: string, maxLength: number): string;
```

Truncates text to `maxLength` characters, appending an ellipsis character (U+2026) if truncated. Returns the original text if it fits within `maxLength`.

**Used by:**

- `src/cli/commands/search.ts` -- truncate skill descriptions in search results

## Type Guards

### `src/cli/utils/type-guards.ts`

Runtime type narrowing functions for generated union types. Imports union arrays from `types/generated/source-types.ts`.

| Function           | Signature                                  | Purpose                              |
| ------------------ | ------------------------------------------ | ------------------------------------ |
| `isCategory()`     | `(value: string) => value is Category`     | Check if string is a valid Category  |
| `isDomain()`       | `(value: string) => value is Domain`       | Check if string is a valid Domain    |
| `isAgentName()`    | `(value: string) => value is AgentName`    | Check if string is a valid AgentName |
| `isCategoryPath()` | `(value: string) => value is CategoryPath` | Check Category or `"local"` literal  |

**Mandatory:** Use these instead of `as` casts for runtime narrowing at data boundaries (YAML/JSON parse, CLI args).

## Type-Safe Object Utilities

### `src/cli/utils/typed-object.ts`

```typescript
function typedEntries<K extends string, V>(obj: Partial<Record<K, V>>): [K, V][];
function typedKeys<K extends string>(obj: Partial<Record<K, unknown>>): K[];
```

**Mandatory** (per CLAUDE.md -- Type Safety): use these instead of raw `Object.entries()` / `Object.keys()` on records keyed by union types (`SkillId`, `Category`, `Domain`, etc.) to preserve key-type information and avoid `as [K, V][]` boundary casts. Raw `Object.entries/keys` widens to `string`, forcing downstream casts.

## YAML Loading

Production code imports `parse as parseYaml` from the `yaml` package directly. There is no `src/cli/utils/yaml.ts` module. Frontmatter extraction goes through `extractFrontmatter()` (see above) or the Zod-validated `parseFrontmatter()` in `src/cli/lib/loading/loader.ts`.

## User-Facing Messages

### `src/cli/utils/messages.ts`

All user-facing strings centralized in constant objects:

| Object             | Count | Examples                                                                                                                                           |
| ------------------ | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERROR_MESSAGES`   | 10    | UNKNOWN_ERROR, NO_INSTALLATION, NO_LOCAL_SKILLS, NO_SKILLS_FOUND, VALIDATION_FAILED, FAILED_RESOLVE_SOURCE, FAILED_COMPILE_AGENTS, SKILL_NOT_FOUND |
| `SUCCESS_MESSAGES` | 4     | UNINSTALL_COMPLETE, INIT_SUCCESS, PLUGIN_COMPILE_COMPLETE, ALL_SKILLS_UP_TO_DATE                                                                   |
| `STATUS_MESSAGES`  | 11    | LOADING_SKILLS, LOADING_MARKETPLACE_SOURCE, RECOMPILING_AGENTS, COMPILING_AGENTS, FETCHING_REPOSITORY, COPYING_SKILLS, UPDATING_PLUGIN_SKILLS      |
| `INFO_MESSAGES`    | 6     | NO_CHANGES_MADE, RUN_COMPILE, NO_AGENTS_TO_RECOMPILE, NO_PLUGIN_INSTALLATION, NO_LOCAL_INSTALLATION, NOT_INSTALLED                                 |

## Constants Reference (`src/cli/consts.ts`)

### Paths

| Constant                | Value                        | Purpose                       |
| ----------------------- | ---------------------------- | ----------------------------- |
| `PROJECT_ROOT`          | CLI package root             | Base for template resolution  |
| `GLOBAL_INSTALL_ROOT`   | `os.homedir()`               | Root for global installations |
| `CLAUDE_DIR`            | `.claude`                    | Claude config directory       |
| `CLAUDE_SRC_DIR`        | `.claude-src`                | Source config directory       |
| `PLUGINS_SUBDIR`        | `plugins`                    | Plugins subdirectory          |
| `PLUGIN_MANIFEST_DIR`   | `.claude-plugin`             | Plugin manifest directory     |
| `PLUGIN_MANIFEST_FILE`  | `plugin.json`                | Plugin manifest filename      |
| `DEFAULT_PLUGIN_NAME`   | `agents-inc`                 | Default plugin name           |
| `CACHE_DIR`             | `~/.cache/agents-inc`        | Source cache directory        |
| `SKILL_CATEGORIES_PATH` | `config/skill-categories.ts` | Skill categories config file  |
| `SKILL_RULES_PATH`      | `config/skill-rules.ts`      | Skill rules config file       |
| `STACKS_FILE_PATH`      | `config/stacks.ts`           | Stacks config file            |
| `SKILLS_DIR_PATH`       | `src/skills`                 | Skills source directory       |
| `LOCAL_SKILLS_PATH`     | `.claude/skills`             | Local skills directory        |

### Directory Constants

`DIRS` object:

| Key         | Value                   | Purpose                   |
| ----------- | ----------------------- | ------------------------- |
| `agents`    | `src/agents`            | Agent templates directory |
| `skills`    | `src/skills`            | Skills source directory   |
| `stacks`    | `src/stacks`            | Stacks config directory   |
| `templates` | `src/agents/_templates` | Agent templates           |
| `commands`  | `src/commands`          | CLI commands directory    |

### Standard Files and Dirs

`STANDARD_FILES` constant. All well-known filenames:

| Constant                                  | Value                      |
| ----------------------------------------- | -------------------------- |
| `STANDARD_FILES.SKILL_MD`                 | `SKILL.md`                 |
| `STANDARD_FILES.METADATA_YAML`            | `metadata.yaml`            |
| `STANDARD_FILES.METADATA_JSON`            | `metadata.json`            |
| `STANDARD_FILES.CONFIG_YAML`              | `config.yaml`              |
| `STANDARD_FILES.SKILL_CATEGORIES_TS`      | `skill-categories.ts`      |
| `STANDARD_FILES.SKILL_RULES_TS`           | `skill-rules.ts`           |
| `STANDARD_FILES.AGENT_METADATA_YAML`      | `metadata.yaml`            |
| `STANDARD_FILES.PLUGIN_JSON`              | `plugin.json`              |
| `STANDARD_FILES.CONFIG_TS`                | `config.ts`                |
| `STANDARD_FILES.CONFIG_TYPES_TS`          | `config-types.ts`          |
| `STANDARD_FILES.CLAUDE_MD`                | `CLAUDE.md`                |
| `STANDARD_FILES.REFERENCE_MD`             | `reference.md`             |
| `STANDARD_FILES.IDENTITY_MD`              | `identity.md`              |
| `STANDARD_FILES.PLAYBOOK_MD`              | `playbook.md`              |
| `STANDARD_FILES.OUTPUT_MD`                | `output.md`                |
| `STANDARD_FILES.CRITICAL_REQUIREMENTS_MD` | `critical-requirements.md` |
| `STANDARD_FILES.CRITICAL_REMINDERS_MD`    | `critical-reminders.md`    |

`STANDARD_DIRS` constant:

| Constant                 | Value      |
| ------------------------ | ---------- |
| `STANDARD_DIRS.EXAMPLES` | `examples` |
| `STANDARD_DIRS.SCRIPTS`  | `scripts`  |
| `STANDARD_DIRS.SKILLS`   | `skills`   |

### Branding and Naming

| Constant                     | Value                           | Purpose                                                                                                                                           |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLI_INVOKE_COMMAND`         | `npx @agents-inc/cli`           | Promoted invocation prefix shown in user-facing messages (registered global bin name is still `agentsinc` — see `package.json` `bin`/`oclif.bin`) |
| `DEFAULT_BRANDING.NAME`      | `Agents Inc.`                   | Default product name                                                                                                                              |
| `DEFAULT_BRANDING.TAGLINE`   | `AI-powered development tools`  | Default tagline                                                                                                                                   |
| `DEFAULT_PUBLIC_SOURCE_NAME` | `agents-inc`                    | Fallback marketplace name                                                                                                                         |
| `SOURCE_DISPLAY_NAMES`       | `{ public, eject, agents-inc }` | Human-readable source type labels                                                                                                                 |
| `DEFAULT_VERSION`            | `1.0.0`                         | Default skill version                                                                                                                             |
| `DEFAULT_DISPLAY_VERSION`    | `0.0.0`                         | Indicates no version explicitly set                                                                                                               |

### Versioning and Hashing

| Constant                       | Value | Purpose                     |
| ------------------------------ | ----- | --------------------------- |
| `HASH_PREFIX_LENGTH`           | 7     | Hash prefix for display     |
| `CACHE_HASH_LENGTH`            | 16    | Cache directory hash length |
| `CACHE_READABLE_PREFIX_LENGTH` | 32    | Cache dir readable prefix   |

### Limits

| Constant                    | Value  | Purpose                     |
| --------------------------- | ------ | --------------------------- |
| `MAX_MARKETPLACE_FILE_SIZE` | 10 MB  | marketplace.json size limit |
| `MAX_PLUGIN_FILE_SIZE`      | 1 MB   | Plugin file size limit      |
| `MAX_CONFIG_FILE_SIZE`      | 1 MB   | Config file size limit      |
| `MAX_JSON_NESTING_DEPTH`    | 10     | JSON nesting limit          |
| `MAX_MARKETPLACE_PLUGINS`   | 10,000 | Max plugins in marketplace  |

### YAML Formatting

| Constant                          | Value | Purpose            |
| --------------------------------- | ----- | ------------------ |
| `YAML_FORMATTING.INDENT`          | 2     | YAML indentation   |
| `YAML_FORMATTING.LINE_WIDTH`      | 120   | Default line width |
| `YAML_FORMATTING.LINE_WIDTH_NONE` | 0     | Disable wrapping   |

### UI Constants

`UI_SYMBOLS`, `CLI_COLORS`, and `SCROLL_VIEWPORT` are defined in `src/cli/consts.ts`. (No `UI_LAYOUT` or `UI_MESSAGES` objects — those names are not defined.)

`UI_SYMBOLS` includes: `CHECKBOX_CHECKED`, `CHECKBOX_UNCHECKED`, `CHEVRON`, `CHEVRON_SPACER`, `SELECTED`, `UNSELECTED`, `CURRENT`, `SKIPPED`, `DISCOURAGED`, `DISABLED`, `LOCK`, `EJECT`, `BULLET`, `SCROLL_UP`, `SCROLL_DOWN`, `CHECK`, `CROSS`.

These are documented in detail in `reference/component-patterns.md`.

### Schema Paths

`SCHEMA_PATHS` object. JSON Schema URLs for yaml-language-server `$schema` comments:

| Key                   | Schema URL suffix                   |
| --------------------- | ----------------------------------- |
| `agent`               | `agent.schema.json`                 |
| `metadata`            | `metadata.schema.json`              |
| `marketplace`         | `marketplace.schema.json`           |
| `projectConfig`       | `project-config.schema.json`        |
| `projectSourceConfig` | `project-source-config.schema.json` |
| `stacks`              | `stacks.schema.json`                |

Helper: `yamlSchemaComment(schemaPath: string): string` generates a `# yaml-language-server: $schema=...` comment.

### Source Resolution

| Constant                      | Value                             | Purpose                            |
| ----------------------------- | --------------------------------- | ---------------------------------- |
| `GITHUB_SOURCE.HTTPS_PREFIX`  | `https://github.com/`             | GitHub HTTPS URL prefix            |
| `GITHUB_SOURCE.GITHUB_PREFIX` | `github:`                         | GitHub shorthand prefix            |
| `GITHUB_SOURCE.GH_PREFIX`     | `gh:`                             | GitHub short prefix                |
| `DEFAULT_SKILLS_SUBDIR`       | `skills`                          | Default skills subdirectory name   |
| `KEBAB_CASE_PATTERN`          | `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` | Strict kebab-case validation regex |

### Domain Configuration

| Constant                  | Value                                                                         |
| ------------------------- | ----------------------------------------------------------------------------- |
| `BUILT_IN_DOMAIN_ORDER`   | `["web", "api", "ai", "mobile", "desktop", "cli", "infra", "meta", "shared"]` |
| `DEFAULT_SCRATCH_DOMAINS` | `["web", "api", "mobile"]`                                                    |

## Remeda Utilities (External)

Used across 20+ files. Key functions:

| Function       | Usage                     |
| -------------- | ------------------------- |
| `unique()`     | Deduplicate arrays        |
| `uniqueBy()`   | Deduplicate by key        |
| `sortBy()`     | Sort with comparators     |
| `indexBy()`    | Index array into object   |
| `mapToObj()`   | Transform array to object |
| `pipe()`       | Functional pipeline       |
| `flatMap()`    | Flat map                  |
| `filter()`     | Type-safe filter          |
| `mapValues()`  | Transform record values   |
| `difference()` | Set difference            |
| `groupBy()`    | Group array by key        |
| `countBy()`    | Count occurrences         |
| `sumBy()`      | Sum by accessor           |

## Test Mocks

| Mock File                           | Mocks                  |
| ----------------------------------- | ---------------------- |
| `src/cli/utils/__mocks__/fs.ts`     | File system operations |
| `src/cli/utils/__mocks__/logger.ts` | Logging functions      |
