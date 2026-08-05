---
scope: reference
area: architecture
keywords:
  [
    consts,
    messages,
    logger,
    fs,
    exec,
    typed-object,
    ui-symbols,
    cli-colors,
    diff-markers,
    ConfigLoadError,
  ]
related:
  - reference/architecture-overview.md
  - reference/dependency-graph.md
  - reference/test-infrastructure.md
  - reference/component-patterns.md
  - reference/features/configuration.md
last_validated: 2026-08-01
---

# Utilities Reference

## Utility Files

All utilities in `src/cli/utils/`.

| File              | Path                            | Purpose                                     |
| ----------------- | ------------------------------- | ------------------------------------------- |
| `errors.ts`       | `src/cli/utils/errors.ts`       | Error message extraction                    |
| `exec.ts`         | `src/cli/utils/exec.ts`         | Shell command execution + Claude CLI wraps  |
| `frontmatter.ts`  | `src/cli/utils/frontmatter.ts`  | YAML frontmatter extraction                 |
| `fs.ts`           | `src/cli/utils/fs.ts`           | File system wrappers + path containment     |
| `logger.ts`       | `src/cli/utils/logger.ts`       | Logging: log, warn, verbose, buffering      |
| `messages.ts`     | `src/cli/utils/messages.ts`     | User-facing message constants + builders    |
| `string.ts`       | `src/cli/utils/string.ts`       | `truncateText`, `toTitleCase`               |
| `terminal.ts`     | `src/cli/utils/terminal.ts`     | Clear screen/scrollback + size-gate helpers |
| `type-guards.ts`  | `src/cli/utils/type-guards.ts`  | Runtime type narrowing for union types      |
| `typed-object.ts` | `src/cli/utils/typed-object.ts` | Type-safe Object.entries/keys/values        |
| `yaml-schema.ts`  | `src/cli/utils/yaml-schema.ts`  | yaml-language-server schema comment helpers |

Exit codes live outside `utils/`: `src/cli/lib/exit-codes.ts` (`EXIT_CODES` constant). Base-command and commands import from there, not from `utils/`.

| `EXIT_CODES` key | Value |
| ---------------- | ----- |
| `SUCCESS`        | 0     |
| `ERROR`          | 1     |
| `INVALID_ARGS`   | 2     |
| `NETWORK_ERROR`  | 3     |
| `CANCELLED`      | 4     |

## Error Handling

### `getErrorMessage()` (`src/cli/utils/errors.ts`)

```typescript
function getErrorMessage(error: unknown): string;
```

Extracts human-readable message from unknown error value. Returns `error.message` for Error instances, `String(error)` otherwise.

**Used in:** Every catch block across the codebase.

### Typed errors

`ConfigLoadError` (`src/cli/lib/configuration/project-config.ts`) is the **only** class extending
`Error` in production code — every other failure path throws a plain `Error` or returns a result
object. It carries `configPath` and `reason` as readonly fields and sets `name = "ConfigLoadError"`,
so callers can distinguish "config file absent" (`loadProjectConfigFromDir` returns `null`) from
"config file present but unloadable" (throws). Behaviour and callers are documented in
`reference/features/configuration.md` and `reference/commands/index.md` — not duplicated here.

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

Wrappers that pass a user-controlled argument to the `claude` subprocess validate it first (injection prevention via `validatePluginPath`, `validateMarketplaceSource`, `validatePluginName`). `claudePluginMarketplaceList()`, `claudePluginMarketplaceExists()`, and `isClaudeCLIAvailable()` pass no user value to the shell and perform no validation:

| Function                            | Purpose                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `claudePluginInstall()`             | Install a plugin via `claude plugin install`                            |
| `claudePluginUninstall()`           | Uninstall via `claude plugin uninstall`                                 |
| `claudePluginUninstallBestEffort()` | Uninstall trying both scopes (primary then fallback), swallowing errors |
| `claudePluginMarketplaceList()`     | List marketplaces via `claude plugin marketplace list --json`           |
| `claudePluginMarketplaceExists()`   | Check if marketplace is registered                                      |
| `claudePluginMarketplaceAdd()`      | Register marketplace via `claude plugin marketplace add`                |
| `claudePluginMarketplaceRemove()`   | Remove marketplace via `claude plugin marketplace remove`               |
| `claudePluginMarketplaceUpdate()`   | Update marketplace via `claude plugin marketplace update`               |
| `isClaudeCLIAvailable()`            | Check if `claude` CLI is available                                      |

**Total: 9 functions.** Install/Uninstall take `scope: ClaudePluginScope` (`"project" | "user"`, from `src/cli/types/config.ts`) and `projectDir`. `resolvePluginCwd()` picks `os.homedir()` for `"user"` scope so Claude writes settings to `~/.claude/settings.json`. `claudePluginUninstallBestEffort(pluginRef, primaryScope, projectDir)` is used when the registered scope is ambiguous (re-scoped skill, cleanup) — it uninstalls from `primaryScope` then the opposite scope, ignoring each failure; the ref must be marketplace-qualified (`skill-id@marketplace`). Callers: `src/cli/lib/installation/mode-migrator.ts`, `src/cli/commands/uninstall.tsx`.

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

Extracts YAML frontmatter delimited by a leading `---` fence and a closing `---` (regex `/^---\r?\n([\s\S]*?)\r?\n---/`, so CRLF line endings are tolerated). Returns the parsed YAML object, or `null` when no frontmatter fence is present or the body fails to parse.

**Note:** For SKILL.md parsing, use `parseFrontmatter()` from `src/cli/lib/loading/loader.ts` instead -- it adds Zod validation.

## File System

### `src/cli/utils/fs.ts`

Wraps `fs-extra` and `fast-glob`:

| Function             | Signature                                     | Purpose                                           |
| -------------------- | --------------------------------------------- | ------------------------------------------------- |
| `readFile()`         | `(filePath: string) => Promise<string>`       | Read file as UTF-8                                |
| `readFileSafe()`     | `(filePath, maxSizeBytes) => Promise<string>` | Read with size limit (DoS prevention)             |
| `readFileOptional()` | `(filePath, fallback?) => Promise<string>`    | Read or return fallback                           |
| `fileExists()`       | `(filePath: string) => Promise<boolean>`      | Check file/dir existence                          |
| `directoryExists()`  | `(dirPath: string) => Promise<boolean>`       | Check directory existence                         |
| `listDirectories()`  | `(dirPath: string) => Promise<string[]>`      | List subdirectories                               |
| `glob()`             | `(pattern, cwd) => Promise<string[]>`         | Fast-glob file matching                           |
| `writeFile()`        | `(filePath, content) => Promise<void>`        | Write file (ensures parent dir)                   |
| `ensureDir()`        | `(dirPath: string) => Promise<void>`          | Create directory recursively                      |
| `remove()`           | `(filePath: string) => Promise<void>`         | Remove file/directory                             |
| `copy()`             | `(src, dest) => Promise<void>`                | Copy file/directory                               |
| `isPathWithin()`     | `(child: string, parent: string) => boolean`  | Lexical containment check (no symlink resolution) |

`isPathWithin()` is a pure/synchronous path helper (does not touch the filesystem). Callers: `src/cli/lib/skills/skill-copier.ts`, `src/cli/lib/skills/source-switcher.ts`.

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

Before Ink takes over the terminal, `warn()` output written to the console would be cleared by Ink's screen reset. Buffer mode captures those messages into an in-memory `StartupMessage[]` array instead of writing to stderr, so the caller can hand them to the wizard.

| Function              | Purpose                                   |
| --------------------- | ----------------------------------------- |
| `enableBuffering()`   | Start capturing warn() messages in buffer |
| `drainBuffer()`       | Return captured messages and clear buffer |
| `disableBuffering()`  | Stop buffering and clear buffer           |
| `pushBufferMessage()` | Manually add a message to buffer          |

**Type:** `StartupMessage = { level: "info" | "warn" | "error"; text: string }`

**Used by:** `src/cli/lib/operations/source/load-source.ts` (when its `captureStartupMessages` option is set) calls `enableBuffering()` to capture `warn()` output during skill loading, then `drainBuffer()` + `disableBuffering()` to return the captured messages as `startupMessages: StartupMessage[]`. `src/cli/commands/init.tsx` and `src/cli/commands/edit.tsx` receive that array and thread it through `src/cli/components/wizard/wizard.tsx` to the `WizardLayout` `startupMessages` prop (`src/cli/components/wizard/wizard-layout.tsx`). No Ink `<Static>` block currently renders the prop, and `pushBufferMessage()` has no production callers (test-only).

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

### `toTitleCase()` (`src/cli/utils/string.ts`)

```typescript
function toTitleCase(kebabCase: string): string;
```

Converts a kebab-case string to a space-separated Title Case string (`"web-framework"` -> `"Web Framework"`).

**Used by:**

- `src/cli/lib/skills/generators.ts`
- `src/cli/lib/matrix/skill-resolution.ts`
- `src/cli/components/wizard/step-agents.tsx`
- `src/cli/commands/new/skill.ts`
- `src/cli/commands/import/skill.ts`

## Terminal

`src/cli/utils/terminal.ts` exports exactly three functions. Two of them exist so that the CLI's
**two** terminal-size gates read one threshold and print one wording.

| Function                          | Signature                                    | Purpose                                        |
| --------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `clearTerminalScreen()`           | `() => void`                                 | Clear screen + scrollback, move cursor home    |
| `isTerminalLargeEnough()`         | `(columns: number, rows: number) => boolean` | `MIN_TERMINAL_SIZE` cleared in BOTH dimensions |
| `formatTerminalTooSmallMessage()` | `(columns: number) => string`                | The single resize prompt both gates print      |

### `clearTerminalScreen()`

Writes ANSI escape sequences that clear the screen, clear scrollback, and move the cursor home. Shared by `BaseCommand.clearTerminal` (`src/cli/base-command.ts`) and the init dashboard (`src/cli/commands/init.tsx`).

### `isTerminalLargeEnough()` / `formatTerminalTooSmallMessage()`

Both read `MIN_TERMINAL_SIZE` from `src/cli/consts.ts`. The threshold lives in one constant and the
message in one builder because two independent gates enforce it:

| Gate                             | File                                          | When it fires                                                      |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `BaseCommand.ensureTerminalSize` | `src/cli/base-command.ts`                     | Once, in `init()`, **before Ink mounts** — blocks the command      |
| `WizardLayout`                   | `src/cli/components/wizard/wizard-layout.tsx` | Every render, on the `useTerminalDimensions()` value — mid-session |

The startup gate polls (`setInterval` 500 ms) plus a `process.stdout` `resize` listener and resolves
once the terminal is big enough. The `WizardLayout` guard **replaces** the wizard tree with
`TerminalTooSmall` rather than overlaying it — Ink lays a still-mounted subtree out at the small size
regardless of what is drawn on top, so an overlay leaves squeezed content bleeding underneath.

`formatTerminalTooSmallMessage` takes only `columns`: its precondition is that
`isTerminalLargeEnough` returned false, and width is reported in preference to height, so
"not too narrow" already means "too short". Output is
`Terminal too narrow (need 80). Please resize.` or `Terminal too short (need 20). Please resize.`

`STEP_TEXT.TOO_NARROW` / `STEP_TEXT.TOO_SHORT` in `e2e/pages/constants.ts` key off this text, so a
second wording would leave one of the two gates unassertable.

## Type Guards

### `src/cli/utils/type-guards.ts`

Runtime type narrowing functions for generated union types. Imports union arrays (`CATEGORIES`, `DOMAINS`, `AGENT_NAMES`, `SKILL_IDS`, `SKILL_SLUGS`) from `types/generated/source-types.ts`.

| Function              | Signature                                              | Purpose                                                      |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| `isRecord()`          | `(value: unknown) => value is Record<string, unknown>` | Narrow unknown to a plain object (rejects arrays/primitives) |
| `isCategory()`        | `(value: string) => value is Category`                 | Check if string is a valid Category                          |
| `isDomain()`          | `(value: string) => value is Domain`                   | Check if string is a valid Domain                            |
| `isAgentName()`       | `(value: string) => value is AgentName`                | Check if string is a valid AgentName                         |
| `isCategoryPath()`    | `(value: string) => value is CategoryPath`             | Check Category or `"local"` literal                          |
| `isSkillId()`         | `(value: string) => value is SkillId`                  | Check if string is a valid SkillId                           |
| `isSkillSlug()`       | `(value: string) => value is SkillSlug`                | Check if string is a valid SkillSlug                         |
| `isSkillAssignment()` | `(value: unknown) => value is SkillAssignment`         | Structural check for `{ id, preloaded? }`                    |

**Mandatory:** Use these instead of `as` casts for runtime narrowing at data boundaries (YAML/JSON parse, CLI args). `isSkillAssignment()` is structural (checks `id` is a string) — it does NOT union-check the id, since assignments flow from runtime sources whose skills may not be in the generated union.

## Type-Safe Object Utilities

### `src/cli/utils/typed-object.ts`

```typescript
function typedEntries<K extends string, V>(obj: Partial<Record<K, V>>): [K, V][];
function typedKeys<K extends string>(obj: Partial<Record<K, unknown>>): K[];
function typedFromEntries<K extends string, V>(
  entries: Iterable<readonly [K, V]>,
): Partial<Record<K, V>>;
function typedValues<K extends string, V>(obj: Partial<Record<K, V>>): V[];
```

**Mandatory** (per CLAUDE.md -- Type Safety): use these instead of raw `Object.entries()` / `Object.keys()` / `Object.fromEntries()` / `Object.values()` on records keyed by union types (`SkillId`, `Category`, `Domain`, etc.) to preserve key-type information and avoid `as [K, V][]` boundary casts. Raw `Object.entries/keys` widens to `string`, forcing downstream casts. `typedValues()` filters the `undefined` slots the `Partial` type admits, so it yields only present values.

## YAML Loading

Production code imports `parse as parseYaml` from the `yaml` package directly. There is no `src/cli/utils/yaml.ts` module. Frontmatter extraction goes through `extractFrontmatter()` (see above) or the Zod-validated `parseFrontmatter()` in `src/cli/lib/loading/loader.ts`.

### `src/cli/utils/yaml-schema.ts`

Helpers for the `# yaml-language-server: $schema=...` header on generated YAML files:

| Function                   | Signature                                                             | Purpose                                                     |
| -------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `yamlSchemaComment()`      | `(schemaPath: string) => string`                                      | Build a `# yaml-language-server: $schema=<path>` comment    |
| `stripYamlSchemaComment()` | `(content: string) => { schemaComment: string; yamlContent: string }` | Split a leading schema comment from the parseable YAML body |

**Callers:** `src/cli/lib/skills/skill-plugin-compiler.ts`, `src/cli/lib/skills/skill-metadata.ts`, `src/cli/commands/new/skill.ts`, `src/cli/commands/import/skill.ts`.

## User-Facing Messages

### `src/cli/utils/messages.ts`

Static user-facing strings live in four constant objects; strings that interpolate a runtime value
are exported as **functions** instead (see below).

Each row lists every key in that object (exhaustive, in source order).

| Object             | Count | Keys                                                                                                                                                                                                                                      |
| ------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERROR_MESSAGES`   | 10    | UNKNOWN_ERROR, UNKNOWN_ERROR_SHORT, NO_INSTALLATION, NO_LOCAL_SKILLS, NO_SKILLS_FOUND, VALIDATION_FAILED, FAILED_RESOLVE_SOURCE, FAILED_LOAD_AGENT_PARTIALS, FAILED_COMPILE_AGENTS, SKILL_NOT_FOUND                                       |
| `SUCCESS_MESSAGES` | 4     | UNINSTALL_COMPLETE, INIT_SUCCESS, PLUGIN_COMPILE_COMPLETE, ALL_SKILLS_UP_TO_DATE                                                                                                                                                          |
| `STATUS_MESSAGES`  | 11    | LOADING_SKILLS, LOADING_MARKETPLACE_SOURCE, RECOMPILING_AGENTS, COMPILING_AGENTS, DISCOVERING_SKILLS, RESOLVING_SOURCE, RESOLVING_MARKETPLACE_SOURCE, LOADING_AGENT_PARTIALS, FETCHING_REPOSITORY, COPYING_SKILLS, UPDATING_PLUGIN_SKILLS |
| `INFO_MESSAGES`    | 7     | NO_CHANGES_MADE, RUN_COMPILE, NO_AGENTS_TO_RECOMPILE, NO_PLUGIN_INSTALLATION, NO_LOCAL_INSTALLATION, NOT_INSTALLED, CONFIG_TYPES_REFRESHED                                                                                                |

All four key lists are pinned with `toStrictEqual` in `src/cli/utils/messages.test.ts`, which also
asserts non-empty string values everywhere and a trailing `...` on every `STATUS_MESSAGES` value.
The test does **not** cover the message-builder functions below.

### Message builder functions

Exported from the same file. Used where the string embeds a count, a path, or an error reason —
so they cannot live in a `const` object.

| Function                                      | Signature                         | Where it prints                                                                                                        |
| --------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `globalScopedAgentsHint(count)`               | `(count: number) => string`       | `Compile` — project pass resolved zero project agents but the config declares global-scope ones. Singular/plural aware |
| `configTypesRefreshFailed(reason)`            | `(reason: string) => string`      | `Compile.refreshConfigTypes` catch — compiled agents are written, only the type unions may be stale                    |
| `registeredProjectsUpdated(count)`            | `(count: number) => string`       | `Uninstall` — summary after a global uninstall pruned inlined global entries. Singular/plural aware                    |
| `registeredProjectUpdateSkipped(projectPath)` | `(projectPath: string) => string` | `Uninstall` — one registered project was unreachable; the uninstall continues                                          |
| `registeredProjectsUpdateFailed(reason)`      | `(reason: string) => string`      | `Uninstall.prepareGlobalPropagation` catch — no registered project could be updated; the uninstall still completes     |

`INFO_MESSAGES.CONFIG_TYPES_REFRESHED` is the success counterpart to `configTypesRefreshFailed()`;
both interpolate `STANDARD_FILES.CONFIG_TYPES_TS` rather than hardcoding `config-types.ts`.

## Constants Reference (`src/cli/consts.ts`)

### Paths

| Constant                  | Value                        | Purpose                                                                                                                                                   |
| ------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROJECT_ROOT`            | CLI package root             | Base for template resolution                                                                                                                              |
| `GLOBAL_INSTALL_ROOT`     | `os.homedir()`               | Root for global installations                                                                                                                             |
| `CLAUDE_DIR`              | `.claude`                    | Claude config directory                                                                                                                                   |
| `CLAUDE_SRC_DIR`          | `.claude-src`                | Source config directory                                                                                                                                   |
| `PLUGINS_SUBDIR`          | `plugins`                    | Plugins subdirectory                                                                                                                                      |
| `PLUGIN_MANIFEST_DIR`     | `.claude-plugin`             | Plugin manifest directory                                                                                                                                 |
| `PLUGIN_MANIFEST_FILE`    | `plugin.json`                | Plugin manifest filename                                                                                                                                  |
| `MARKETPLACE_JSON`        | `marketplace.json`           | Marketplace manifest filename                                                                                                                             |
| `PLUGINS_DIST_PATH`       | `dist/plugins`               | Compiled plugin output dir (marketplace-relative)                                                                                                         |
| `DEFAULT_PLUGIN_NAME`     | `agents-inc`                 | Default plugin name                                                                                                                                       |
| `CACHE_DIR`               | `~/.cache/agents-inc`        | Source cache directory. Consumed by `lib/loading/source-fetcher.ts`; layout in [features/source-fetch-and-cache.md](./features/source-fetch-and-cache.md) |
| `SKILL_CATEGORIES_PATH`   | `config/skill-categories.ts` | Skill categories config file                                                                                                                              |
| `SKILL_RULES_PATH`        | `config/skill-rules.ts`      | Skill rules config file                                                                                                                                   |
| `STACKS_FILE_PATH`        | `config/stacks.ts`           | Stacks config file                                                                                                                                        |
| `SOURCE_SRC_DIR`          | `src`                        | Source root dir inside a marketplace/source repo                                                                                                          |
| `SKILLS_DIR_PATH`         | `src/skills`                 | Skills source directory (`${SOURCE_SRC_DIR}/skills`)                                                                                                      |
| `LOCAL_SKILLS_PATH`       | `.claude/skills`             | Local skills directory                                                                                                                                    |
| `EJECT_SOURCE`            | `eject`                      | Synthetic source name for ejected (copied) skills                                                                                                         |
| `LOCAL_PSEUDO_CATEGORY`   | `local`                      | Pseudo-category for local skills (not a `Category`)                                                                                                       |
| `GLOBAL_CONFIG_NAME`      | `global`                     | `name` field written into a global-scope config                                                                                                           |
| `EDIT_PROJECT_SETUP_FLAG` | `project-setup`              | Hidden `edit` flag marking the setup half of `init`                                                                                                       |

Helper: `marketplaceManifestPath(dir: string): string` joins `dir` + `PLUGIN_MANIFEST_DIR` + `MARKETPLACE_JSON`.

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
| `STANDARD_FILES.README_MD`                | `README.md`                |
| `STANDARD_FILES.REFERENCE_MD`             | `reference.md`             |
| `STANDARD_FILES.IDENTITY_MD`              | `identity.md`              |
| `STANDARD_FILES.PLAYBOOK_MD`              | `playbook.md`              |
| `STANDARD_FILES.OUTPUT_MD`                | `output.md`                |
| `STANDARD_FILES.CRITICAL_REQUIREMENTS_MD` | `critical-requirements.md` |
| `STANDARD_FILES.CRITICAL_REMINDERS_MD`    | `critical-reminders.md`    |
| `STANDARD_FILES.SETTINGS_JSON`            | `settings.json`            |
| `STANDARD_FILES.SETTINGS_LOCAL_JSON`      | `settings.local.json`      |

`STANDARD_DIRS` constant:

| Constant                  | Value       |
| ------------------------- | ----------- |
| `STANDARD_DIRS.EXAMPLES`  | `examples`  |
| `STANDARD_DIRS.SCRIPTS`   | `scripts`   |
| `STANDARD_DIRS.SKILLS`    | `skills`    |
| `STANDARD_DIRS.AGENTS`    | `agents`    |
| `STANDARD_DIRS.COMMANDS`  | `commands`  |
| `STANDARD_DIRS.TEMPLATES` | `templates` |

### Branding and Naming

| Constant                     | Value                                                              | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLI_INVOKE_COMMAND`         | `npx agents-inc`                                                   | Promoted invocation prefix shown in user-facing messages. `package.json` `bin` registers BOTH `agents-inc` and `agentsinc` for `dist/index.js`; `oclif.bin` is `agents-inc` alone. **Convention (recorded beside the constant in `consts.ts`): every user-facing instruction in this repo — messages, docs, code comments, agent playbooks — writes commands in this `npx agents-inc <cmd>` form. Prose that merely NAMES a command ("the `agents-inc list` table") does not.** |
| `DEFAULT_BRANDING.NAME`      | `Agents Inc.`                                                      | Default product name                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `DEFAULT_BRANDING.TAGLINE`   | `AI-powered development tools`                                     | Default tagline                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `DEFAULT_PUBLIC_SOURCE_NAME` | `agents-inc` (= `DEFAULT_PLUGIN_NAME`)                             | Fallback marketplace/source name                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `PUBLIC_SOURCE_NAME`         | `public`                                                           | Canonical name of the built-in public source                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SOURCE_DISPLAY_NAMES`       | `{ public: "Public", eject: "Eject", "agents-inc": "Agents Inc" }` | Inline human-readable source type labels                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SOURCE_HEADER_NAMES`        | `{ eject: "Local", "agents-inc": "Plugin", public: "Public" }`     | Column-header labels for the source grid (distinct from inline labels)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `DEFAULT_VERSION`            | `1.0.0`                                                            | Default skill version                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `DEFAULT_DISPLAY_VERSION`    | `0.0.0`                                                            | Indicates no version explicitly set                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `ALL_SKILLS_EJECTED_LABEL`   | `All skills ejected`                                               | Summary-panel `Marketplace` row when no skill has a marketplace source (distinct state from an empty set, which falls back to the public default)                                                                                                                                                                                                                                                                                                                               |

`ALL_SKILLS_EJECTED_LABEL` has exactly one production consumer: `formatSkillMarketplaces(skillConfigs: SkillConfig[])` in `src/cli/components/wizard/summary-panel.tsx`. Three distinct cases, in source order:

| Input                            | Output                                                |
| -------------------------------- | ----------------------------------------------------- |
| `skillConfigs.length === 0`      | `formatSourceDisplayName(DEFAULT_PUBLIC_SOURCE_NAME)` |
| every `source` is `EJECT_SOURCE` | `ALL_SKILLS_EJECTED_LABEL`                            |
| any marketplace-sourced skill    | its marketplace name(s), sorted, joined with `" · "`  |

The label derives from `SkillConfig.source`, not from a store field. A `Marketplace` row reading a store field no code ever writes prints the hardcoded public default instead — do not reintroduce one. Tombstoned (`excluded`) entries count toward the marketplace names, because one still records a real global install.

Helper: `formatSourceDisplayName(source: string): string` resolves a source name to its `SOURCE_DISPLAY_NAMES` label, falling back to the raw name.

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

`UI_SYMBOLS`, `CLI_COLORS`, `SCROLL_VIEWPORT`, and `ASCII_LOGO` are defined in `src/cli/consts.ts`. (No `UI_LAYOUT` or `UI_MESSAGES` objects — those names are not defined.)

`UI_SYMBOLS` has exactly 19 members (exhaustive, in source order): `CHECKBOX_CHECKED`, `CHECKBOX_UNCHECKED`, `CHEVRON`, `CHEVRON_SPACER`, `SELECTED`, `UNSELECTED`, `CURRENT`, `SKIPPED`, `DISCOURAGED`, `DISABLED`, `LOCK`, `EJECT`, `BULLET`, `SCROLL_UP`, `SCROLL_DOWN`, `CHECK`, `CROSS`, `REMOVED`, `ADDED`. (`SELECTED`/`CHECK` share one checkmark glyph via the module-private `CHECK_GLYPH`; `SKIPPED`/`DISABLED` share one en-dash glyph via `EN_DASH_GLYPH`. Both key pairs are kept so call sites express intent.)

#### Shared diff markers

`UI_SYMBOLS.ADDED` (ASCII `+`) and `UI_SYMBOLS.REMOVED` (ASCII `-`) are the added / pending-removal
diff markers, deliberately shared by the two surfaces that render a session diff so they cannot
drift apart:

| Consumer                                            | Surface                 | Usage                                               |
| --------------------------------------------------- | ----------------------- | --------------------------------------------------- |
| `src/cli/components/wizard/skill-agent-summary.tsx` | Confirm-step info panel | `DIFF_PREFIX` record keyed by `DiffRowStatus`       |
| `src/cli/components/wizard/source-grid.tsx`         | Sources step            | `row.disabled` -> `REMOVED`, `row.added` -> `ADDED` |

The `unchanged` marker is `UI_SYMBOLS.BULLET`. The **source-changed** marker is a bare `"~ "` string
literal in `skill-agent-summary.tsx`'s `DIFF_PREFIX` — it is _not_ a `UI_SYMBOLS` member.

`CLI_COLORS` has exactly 16 keys (exhaustive, in source order): `PRIMARY`, `SUCCESS`, `ERROR`, `WARNING`, `INFO`, `NEUTRAL`, `FOCUS`, `UNFOCUSED`, `WHITE`, `BLACK`, `DIM`, `GRAY_1`, `LABEL_BG`, `TOAST_BG`, `TOAST_FG`, `HOVER_BG`.

`SCROLL_VIEWPORT` keys (exhaustive — **4** keys): `SCROLL_INDICATOR_HEIGHT` (1), `CATEGORY_NAME_LINES` (2), `CATEGORY_MARGIN_LINES` (1), `MIN_VIEWPORT_ROWS` (5).

#### Terminal-height constants (both siblings of `SCROLL_VIEWPORT`, neither a key of it)

| Constant                 | Value                    | What it decides                                                                 |
| ------------------------ | ------------------------ | ------------------------------------------------------------------------------- |
| `MIN_TERMINAL_SIZE`      | `{ COLS: 80, ROWS: 20 }` | Whether a command runs **at all**. One threshold, read by two gates (below)     |
| `LOGO_MIN_TERMINAL_ROWS` | `26`                     | Whether the six-row `ASCII_LOGO` renders on the stack step. **Not a size gate** |

`MIN_TERMINAL_SIZE` is the CLI's only minimum-size _threshold_, but it is read by **two** gates —
`BaseCommand.ensureTerminalSize` before Ink mounts, and the `WizardLayout` guard on every render
(see [Terminal](#terminal) above for both, and `isTerminalLargeEnough` /
`formatTerminalTooSmallMessage`, which are the shared readers). Raising `ROWS` raises the bar for the
whole CLI, tests included.

`ROWS: 20` is measured against the real binary on the build step (the tallest step): 15–17 render
corrupt, 18 is the first clean frame, 24 comfortable. 18 is the hard correctness floor because it is
where `SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS` starts being satisfied — below it the shared scroll gate
stops clipping and the grid bleeds over its borders. 20 buys two rows above that floor while staying
under the 24-row default of common terminals.

`LOGO_MIN_TERMINAL_ROWS = 26` is deliberately **not** folded into `MIN_TERMINAL_SIZE`: raising the
gate to 26 would refuse to run in a 24-row terminal, and lowering the logo threshold to 20 brings
back the stack-step bleed. Consumer: `terminalHasRoomForLogo` in
`src/cli/components/wizard/wizard-layout.tsx`.

> **`SCROLL_VIEWPORT.MIN_TERMINAL_HEIGHT` was DELETED.** It had **zero importers in all of
> `src/`** while the live gate hardcoded its own copy — so changing the documented constant did
> nothing. It is named here only so the name is not copied back out of an older doc into code; it
> does not exist. Use `MIN_TERMINAL_SIZE.ROWS`.

`ASCII_LOGO` is a multi-line box-drawing banner string. Only `src/cli/commands/init.tsx` reads it — once rendered directly in a `<Text>`, once passed through as the wizard's `logo` prop.

`UI_SYMBOLS` and `CLI_COLORS` values are documented in detail in `reference/component-patterns.md`.

### Schema Paths

`SCHEMA_PATHS` object. Full `raw.githubusercontent.com/.../src/schemas/<suffix>` URLs for yaml-language-server `$schema` comments:

> Two of these keys — `projectConfig` and `projectSourceConfig` — point at the two **hand-maintained** schemas in `src/schemas/`; the other ten files there are generated. Only `metadata` and `customMetadata` have runtime call sites. See [features/code-generation.md](./features/code-generation.md).

| Key                   | Schema URL suffix                   |
| --------------------- | ----------------------------------- |
| `agent`               | `agent.schema.json`                 |
| `metadata`            | `metadata.schema.json`              |
| `customMetadata`      | `custom-metadata.schema.json`       |
| `marketplace`         | `marketplace.schema.json`           |
| `projectConfig`       | `project-config.schema.json`        |
| `projectSourceConfig` | `project-source-config.schema.json` |
| `stacks`              | `stacks.schema.json`                |

Helper: `yamlSchemaComment(schemaPath: string): string` generates a `# yaml-language-server: $schema=...` comment. It now lives in `src/cli/utils/yaml-schema.ts` (see YAML Loading above), not in `consts.ts`.

### Source Resolution

| Constant                      | Value                               | Purpose                            |
| ----------------------------- | ----------------------------------- | ---------------------------------- |
| `GITHUB_SOURCE.HTTPS_PREFIX`  | `https://github.com/`               | GitHub HTTPS URL prefix            |
| `GITHUB_SOURCE.GITHUB_PREFIX` | `github:`                           | GitHub shorthand prefix            |
| `GITHUB_SOURCE.GH_PREFIX`     | `gh:`                               | GitHub short prefix                |
| `DEFAULT_SKILLS_SUBDIR`       | `skills` (= `STANDARD_DIRS.SKILLS`) | Default skills subdirectory name   |
| `KEBAB_CASE_PATTERN`          | `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/`   | Strict kebab-case validation regex |
| `AUTHOR_HANDLE_PATTERN`       | `/^@[a-z][a-z0-9-]*$/`              | Author handle format (`@` + slug)  |

### Domain Configuration

| Constant                  | Value                                                                         |
| ------------------------- | ----------------------------------------------------------------------------- |
| `BUILT_IN_DOMAIN_ORDER`   | `["web", "api", "ai", "mobile", "desktop", "cli", "infra", "meta", "shared"]` |
| `DEFAULT_SCRATCH_DOMAINS` | `["web", "api", "mobile"]`                                                    |
| `FALLBACK_DOMAIN`         | `"web"` — used when no active domain resolves from wizard state               |

## Remeda Utilities (External)

Imported by 30 files under `src/cli/` : 28 production modules, one test-data
module (`lib/__tests__/mock-data/mock-matrices.ts`) and one spec (`components/wizard/step-build.test.tsx`).
Always `import { ... } from "remeda"`; there are zero namespace `* as R` imports. The named imports
actually in use across `src/cli/`:

| Function        | Usage                       |
| --------------- | --------------------------- |
| `unique()`      | Deduplicate arrays          |
| `uniqueBy()`    | Deduplicate by key          |
| `sortBy()`      | Sort with comparators       |
| `indexBy()`     | Index array into object     |
| `pipe()`        | Functional pipeline         |
| `flatMap()`     | Flat map                    |
| `filter()`      | Type-safe filter            |
| `mapValues()`   | Transform record values     |
| `difference()`  | Set difference              |
| `groupBy()`     | Group array by key          |
| `countBy()`     | Count occurrences           |
| `partition()`   | Split into pass/fail arrays |
| `zip()`         | Pair two arrays elementwise |
| `isDeepEqual()` | Structural equality check   |

(`mapToObj` and `sumBy` are no longer imported anywhere in `src/cli/`.)

## Test Mocks

| Mock File                           | Mocks                  |
| ----------------------------------- | ---------------------- |
| `src/cli/utils/__mocks__/fs.ts`     | File system operations |
| `src/cli/utils/__mocks__/logger.ts` | Logging functions      |
