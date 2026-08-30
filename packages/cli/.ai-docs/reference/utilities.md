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
    catalog-json,
    generated-at-build,
    enumeration-drift,
  ]
related:
  - reference/architecture-overview.md
  - reference/dependency-graph.md
  - reference/testing/infrastructure.md
  - reference/component-patterns.md
  - reference/features/configuration.md
  - reference/commands/index.md
last_validated: 2026-08-18
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
| `open-url.ts`     | `src/cli/utils/open-url.ts`     | Hand a link to the platform's link opener   |
| `read-stream.ts`  | `src/cli/utils/read-stream.ts`  | `readAllOf` — a readable's whole text       |
| `string.ts`       | `src/cli/utils/string.ts`       | `truncateText`, `toTitleCase`, `bytewise`   |
| `terminal.ts`     | `src/cli/utils/terminal.ts`     | Clear screen/scrollback + size-gate helpers |
| `type-guards.ts`  | `src/cli/utils/type-guards.ts`  | Runtime type narrowing for union types      |
| `typed-object.ts` | `src/cli/utils/typed-object.ts` | Type-safe Object.entries/keys/values        |
| `yaml-schema.ts`  | `src/cli/utils/yaml-schema.ts`  | yaml-language-server schema comment helpers |

Exit codes live outside `utils/`: `src/cli/lib/exit-codes.ts` (`EXIT_CODES` constant). Base-command and commands import from there, not from `utils/`.

| `EXIT_CODES` key          | Value |
| ------------------------- | ----- |
| `SUCCESS`                 | 0     |
| `ERROR`                   | 1     |
| `INVALID_ARGS`            | 2     |
| `NETWORK_ERROR`           | 3     |
| `CANCELLED`               | 4     |
| `COMPLETED_WITH_FAILURES` | 5     |

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

Three, exhaustive — `exec.ts` exports no other type.

| Type                  | Fields                             |
| --------------------- | ---------------------------------- |
| `ExecResult`          | `stdout`, `stderr`, `exitCode`     |
| `ClaudeConfigOptions` | `configDir?`                       |
| `MarketplaceInfo`     | `name`, `source`, `repo?`, `path?` |

`ClaudeConfigOptions` is what pins the `claude` binary's own state for a caller that must not read
the developer's real `~/.claude`: every config-touching wrapper takes it, and the E2E smoke suite
(`e2e/smoke/home-isolation.smoke.test.ts`) passes one so a spec that spawns the third-party binary
names the config directory it spawns against. Re-exported for tests from
`e2e/helpers/test-utils.ts` alongside `MarketplaceInfo`.

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

## Opening a Link

### `src/cli/utils/open-url.ts`

Hands a URL to whatever the platform opens links with. **No dependency backs this** — all three
platforms are one-line shell-outs to something the operating system already ships.

| Export                                | Signature                                      | Purpose                                                                           |
| ------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `browserOpenerCommand(platform, url)` | `(NodeJS.Platform, string) => OpenerCommand`   | The command this platform opens a link with. Pure, so it is testable per-platform |
| `openUrl(url)`                        | `(string) => Promise<OpenUrlResult>`           | Runs that command through `execCommand`                                           |
| type `OpenerCommand`                  | `{ command: string; args: string[] }`          | The shell-out one platform answers with                                           |
| type `OpenUrlResult`                  | `{ ok: true } \| { ok: false; error: string }` | **Never a throw** — see below                                                     |

| `process.platform` | Command    | Args                       |
| ------------------ | ---------- | -------------------------- |
| `darwin`           | `open`     | `[url]`                    |
| `win32`            | `cmd`      | `["/c", "start", "", url]` |
| anything else      | `xdg-open` | `[url]`                    |

**Windows goes through `cmd` because `start` is a shell builtin rather than a program**, and the
empty string after it is `start`'s TITLE argument: without one, `start` reads the first quoted
argument it is given as the window title and opens nothing.

**The URL travels as its own argv entry and no shell is spawned.** `execCommand` spawns without a
shell, so the argument vector is the whole of the injection guard — there is no string for a link
to break out of.

**Failure is reported, never thrown.** A machine with no browser, no desktop session or no opener
at all is a legitimate place to run this CLI, and the link is already printed by the time this
runs. A non-zero exit and a spawn error each produce their own `{ ok: false, error }` sentence.

**Production consumer:** `src/cli/commands/edit.tsx` (`edit --ui`).

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

| Function             | Signature                                       | Purpose                                                                 |
| -------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| `readFile()`         | `(filePath: string) => Promise<string>`         | Read file as UTF-8                                                      |
| `readFileSafe()`     | `(filePath, maxSizeBytes) => Promise<string>`   | Read with size limit (DoS prevention)                                   |
| `readFileOptional()` | `(filePath, fallback?) => Promise<string>`      | Read or return fallback                                                 |
| `fileExists()`       | `(filePath: string) => Promise<boolean>`        | Check file/dir existence                                                |
| `directoryExists()`  | `(dirPath: string) => Promise<boolean>`         | Check directory existence                                               |
| `listDirectories()`  | `(dirPath: string) => Promise<string[]>`        | List subdirectories                                                     |
| `glob()`             | `(pattern, cwd, { dot? }) => Promise<string[]>` | Fast-glob file matching (`onlyFiles: true`)                             |
| `writeFile()`        | `(filePath, content) => Promise<void>`          | Write file (ensures parent dir)                                         |
| `ensureDir()`        | `(dirPath: string) => Promise<void>`            | Create directory recursively                                            |
| `remove()`           | `(filePath: string) => Promise<void>`           | Remove file/directory                                                   |
| `isDirectoryEmpty()` | `(dirPath: string) => Promise<boolean>`         | True when the directory holds nothing **or** cannot be read at all      |
| `removeDirIfEmpty()` | `(dir: string) => Promise<boolean>`             | Removes `dir` when it exists and holds nothing; returns whether it went |
| `copy()`             | `(src, dest) => Promise<void>`                  | Copy file/directory                                                     |
| `isPathWithin()`     | `(child: string, parent: string) => boolean`    | Lexical containment check (no symlink resolution)                       |

`isPathWithin()` is a pure/synchronous path helper (does not touch the filesystem). Callers: `src/cli/lib/skills/skill-copier.ts`, `src/cli/lib/skills/local-skill-mover.ts`.

**`removeDirIfEmpty()` measures FILESYSTEM emptiness, never roster emptiness.** A scope directory
(`.claude/skills/`, `.claude/agents/`) is an artefact of what it holds, so the removal that empties
it takes it too — but a hand-authored agent or any other user-owned file keeps it alive, whatever a
config says. It composes `directoryExists()` then `isDirectoryEmpty()` then `remove()`, so an absent
directory returns `false` (nothing was removed) while an unreadable one returns `true` from
`isDirectoryEmpty()` alone. Callers: `src/cli/commands/uninstall.tsx`,
`src/cli/lib/skills/local-skill-mover.ts`, `src/cli/lib/operations/project/remove-compiled-agents.ts`.
`isDirectoryEmpty()` has one caller of its own — `src/cli/commands/new/marketplace.ts`, which asks it
of a directory it is about to write into.

**`glob()` serves two uses and `dot` is what tells them apart.** A scan LOOKING FOR known filenames
wants the default (`dot: false`) — fast-glob skips dotfiles, which is right when nothing is being
reproduced. A read REPRODUCING a directory faithfully wants `{ dot: true }`, or a `.` file the
write side accepts is dropped on the way back out, silently. The one caller of the second kind is
`readSkillTree` in `src/cli/lib/seed/external-skills.ts`, which reads a carried skill's whole
directory back onto the wire.

## Logger

### `src/cli/utils/logger.ts`

| Function       | Signature                                      | Visibility      | Purpose                       |
| -------------- | ---------------------------------------------- | --------------- | ----------------------------- |
| `log(msg)`     | `(msg: string) => void`                        | Always          | User-facing progress output   |
| `warn(msg)`    | `(msg: string, options?: WarnOptions) => void` | Always          | Issues user should know about |
| `verbose(msg)` | `(msg: string) => void`                        | Only if enabled | Diagnostic/debug info         |
| `setVerbose()` | `(enabled: boolean) => void`                   | N/A             | Enable/disable verbose mode   |

### `WarnOptions` type (`src/cli/utils/logger.ts`)

The `warn()` function accepts an optional second parameter. When `suppressInTest: true` is set and `process.env.VITEST` is truthy, the warning is silently dropped. This prevents noisy test output for expected warnings.

### Startup Message Buffering

Before Ink takes over the terminal, `warn()` output written to the console would be cleared by Ink's screen reset. Buffer mode captures those messages into an in-memory `StartupMessage[]` array instead of writing to stderr, so the caller can hand them to the wizard. **Buffer mode is process-wide**, so a throw while it is on swallows every later `warn()` in the run. Both production windows close on the throwing path as well as the returning one — `hydrateIntoStartupBand` with a `finally`, `loadSource` with a `catch` that disables and rethrows.

| Function             | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `enableBuffering()`  | Start capturing warn() messages in buffer |
| `drainBuffer()`      | Return captured messages and clear buffer |
| `disableBuffering()` | Stop buffering and clear buffer           |

**Type:** `StartupMessage = { level: "info" | "warn" | "error"; text: string }`

**Used by — two windows, in sequence, both feeding one band.**

1. `src/cli/lib/operations/source/load-source.ts` (when its `captureStartupMessages` option is set) calls `enableBuffering()` to capture `warn()` output during skill loading, then `drainBuffer()` + `disableBuffering()` to return the captured messages as `startupMessages: StartupMessage[]`. `src/cli/commands/init.tsx` and `src/cli/commands/edit.tsx` receive that array.
2. `hydrateIntoStartupBand()` in `src/cli/components/wizard/run-wizard-session.tsx` opens a second window around `hydrateWizardStore()` and returns `[...loaded, ...drained]`. It is a second window rather than the first one held open because `enableBuffering()` resets the buffer, and because one window spanning both modules could not carry a `finally` over the command's own `this.error()` paths. The store warns during hydration (`resolveSkillForPopulation` in `src/cli/stores/wizard-store.ts`), and by then the load's buffer is drained, so a warning raised there has no surface but this band.

The concatenated array is threaded through `src/cli/components/wizard/wizard.tsx` to the `WizardLayout` `startupMessages` prop (`src/cli/components/wizard/wizard-layout.tsx`), which paints it as a band between the tab bar and the step — see [component-patterns.md](./component-patterns.md#wizardlayout-startup-message-band). There is no Ink `<Static>` block; the band is in the live frame.

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

- `src/cli/lib/matrix/skill-resolution.ts`
- `src/cli/components/wizard/step-agents.tsx`

### `bytewise()` (`src/cli/utils/string.ts`)

```typescript
function bytewise(a: string, b: string): number;
```

Compares two strings by UTF-16 code unit, returning `-1`, `0` or `1`. It is the ordering every generator whose output somebody commits must sort by, per `standards/clean-code-standards.md` -> 17.3.

`localeCompare` called with no locale argument reads the process's default collation, and Node takes that from `LC_ALL` / `LANG`. Real locales disagree with code units over ordinary kebab-case names: Lithuanian and Latvian place `y` immediately after `i`, so both order the shipped categories `mobile-styling` before `mobile-storage` where code units order them the other way. A generated file sorted with `localeCompare` therefore regenerates to different bytes on a contributor's machine whose desktop locale differs, producing a pure-reordering diff.

**Used by:**

- `scripts/generate-source-types.ts` -- `src/cli/types/generated/` (skills, agents, grouped maps)
- `scripts/generate-matrix-package.ts` -- the `AGENT_DEFINITIONS` entries vendored into `packages/matrix`
- `src/cli/lib/configuration/config-types-writer.ts` -- the `StackAgentConfig` category keys in a project's `config-types.ts`

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

**Callers:** `src/cli/lib/skills/skill-plugin-compiler.ts`, `src/cli/lib/skills/skill-metadata.ts`.

## User-Facing Messages

### `src/cli/utils/messages.ts`

Static user-facing strings live in constant objects plus one bare string constant; strings that
interpolate a runtime value are exported as **functions** instead (see below).

**The roster is owned by [`commands/index.md`](./commands/index.md) and is not restated here** —
which objects exist, which one is a bare string, and how many there are. That document's table is
bound to the module's whole `export const` list by `scripts/check-enumeration-drift.ts`, so an
object added or removed reddens there. A count written a second time here could not.

The table below is a KEY list, not the roster: each row is exhaustive over its own object's keys, in
source order, and each is separately bound to that object by the same script — so a key added or
renamed fails the `scripts/` suite rather than sitting here uncontested. Nothing binds which objects
have a row, so read the roster from `commands/index.md` rather than from this table's first column —
and **an object with no row here has its keys stated there instead**. That document's table is bound
to the module's whole `export const` list AND carries a bound key row per object, so it is a
superset of this one by construction; this one is where an object's keys are repeated for the
convenience of a reader already in the utilities document, never where their absence means anything.

| Object                | Keys                                                                                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERROR_MESSAGES`      | `UNKNOWN_ERROR`, `UNKNOWN_ERROR_SHORT`, `NO_INSTALLATION`, `FAILED_RESOLVE_SOURCE`, `FAILED_LOAD_AGENT_PARTIALS`, `FAILED_COMPILE_AGENTS`, `CLAUDE_CLI_NOT_FOUND`, `NO_SKILLS_TO_COMPILE`                                                                                                    |
| `SUCCESS_MESSAGES`    | `UNINSTALL_COMPLETE`, `PLUGIN_COMPILE_COMPLETE`                                                                                                                                                                                                                                              |
| `STATUS_MESSAGES`     | `INSTALLING_PLUGINS`, `LOADING_SKILLS`, `LOADING_MARKETPLACE_SOURCE`, `RECOMPILING_AGENTS`, `COMPILING_AGENTS`, `DISCOVERING_SKILLS`, `RESOLVING_SOURCE`, `RESOLVING_MARKETPLACE_SOURCE`, `LOADING_AGENT_PARTIALS`, `FETCHING_REPOSITORY`, `COPYING_SKILLS`, `MARKETPLACE_HAS_NEWER_CONTENT` |
| `INFO_MESSAGES`       | `NO_CHANGES_MADE`, `RUN_COMPILE`, `NO_AGENTS_TO_RECOMPILE`, `NO_PLUGIN_INSTALLATION`, `NO_LOCAL_INSTALLATION`, `CONFIG_TYPES_REFRESHED`, `EJECTED_SKILLS_USER_OWNED`, `NO_PLUGIN_MARKETPLACES`, `AGENT_PARTIALS_CUSTOMIZABLE`                                                                |
| `SHARED_CONFIG_APPLY` | `PREVIEW_HEADING`, `SKILLS_HEADING`, `AGENTS_HEADING`, `GLOBAL_SKILLS_HEADING`, `GLOBAL_AGENTS_HEADING`, `NOTHING_REMOVED`, `CONFIRM` — the fixed text of `edit --from`'s removal plan                                                                                                       |
| `UNINSTALL_PLAN`      | `PREVIEW_HEADING`, `PLUGINS_HEADING`, `CLI_MANAGED_FILES_HEADING`, `CONFIG_HEADING` — read by BOTH uninstall renderers (`--yes` printer and confirm UI), so the preview a user approves and a `--yes` run's list cannot drift                                                                |

**The two `GLOBAL_*` headings on `SHARED_CONFIG_APPLY` are what a PROJECT run prints instead**, for
entries that live at global scope. They exist only there: at the home directory every entry is
global, so a heading saying so would label the whole list with the one fact the location already
states. `globalRemovalSections(...)` in `src/cli/commands/edit.tsx` emits them over the half
`splitRemovalsByScope` found active at global scope — see
[`commands/edit.md`](./commands/edit.md).

**Two independent gates, and neither subsumes the other.** `src/cli/utils/messages.test.ts` pins the
first four key lists with `toStrictEqual`, and also asserts non-empty string values everywhere and a
trailing `...` on every `STATUS_MESSAGES` value — that gate judges the SOURCE and says nothing about
this document. `scripts/check-enumeration-drift.ts` judges this document against the source and says
nothing about the values. The spec covers neither `SHARED_CONFIG_APPLY` nor `UNINSTALL_PLAN` nor the
message-builder functions below; the drift registry covers every object in the table above and the
builders. A key added to `SHARED_CONFIG_APPLY` and left out of this table therefore fails
`vitest run scripts/` and nothing else — which is how the two `GLOBAL_*` headings above sat
undocumented in two documents at once until 2026-08-18.

### Message builder functions

Exported from the same file, exhaustive and in source order. Used where the string embeds a count,
a path, an id or an error reason — so they cannot live in a `const` object. Several return a
multi-line string (`\n`-joined) or a `string[]`, because oclif hard-wraps a single long line.

| Function                                                   | Signature                                              | Where it prints                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `initSucceeded(brandingName)`                              | `(string) => string`                                   | `init`'s closing line, under the name the run prints itself as. A builder rather than a constant because `branding.name` is per-installation and cannot be baked in at module load; `init` resolves it once on its own spine through `BaseCommand.resolveBrandingName`                                                              |
| `notInstalledHere(brandingName)`                           | `(string) => string`                                   | What `uninstall` reports over a directory holding nothing of this CLI's, under that same resolved name. A builder for the same reason, and it matters more here — `uninstall` heads its output with the configured name and signs off with it, so a constant would put the shipped name between two lines saying the configured one |
| `pluginsInstalled(count)`                                  | `(number) => string`                                   | Closing line of a plugin install, wherever one runs                                                                                                                                                                                                                                                                                 |
| `localSkillsCopied(count)`                                 | `(number) => string`                                   | What an eject copy did. A count and NO destination — copies split between the project dir and `$HOME` by each skill's scope, so one path would misname the other half                                                                                                                                                               |
| `recompileSummary(rewritten, unchanged, subject)`          | `(number, number, string) => string`                   | A recompile pass as two numbers rather than one, so a run that rewrote nothing and one that rewrote everything no longer print the same sentence. `subject` differs per caller (`compile` says "global agents", `edit` says "agents")                                                                                               |
| `propagatedRecompileSummary(rewritten, unchanged, failed)` | `(number, number, number) => string`                   | The same distinction for the fan-out across every OTHER registered project                                                                                                                                                                                                                                                          |
| `agentsNotCompiled(agentNames)`                            | `(readonly AgentName[]) => string`                     | The sub-agents a recompile pass could not write, named rather than counted. Read off the pass's `failed` roster, never off the `warnings` beside it — a scope with nothing to compile contributes a warning that is not a failure                                                                                                   |
| `completedWithFailures(failures)`                          | `(readonly IncompleteWork[]) => string`                | The ending `edit` prints when its work landed and part of it did not: each failure with the one command that finishes it. The only place a non-zero exit from a command that COMPLETED is explained                                                                                                                                 |
| `skillAssignedToNoAgent(skillId)`                          | `(SkillId) => string`                                  | An installed, actively-selected skill no sub-agent's stack carries. The only surface that reports it — every other one calls the run clean                                                                                                                                                                                          |
| `scopeBlockedStackAssignment(agentNames, skillId)`         | `(AgentName[], SkillId) => string`                     | The reason behind the above when it is the scope rule. Shared by the save path (`init`/`edit`) and `compile`, so one verdict has one spelling                                                                                                                                                                                       |
| `globalScopedAgentsHint(count)`                            | `(number) => string`                                   | `compile` — project pass resolved zero project agents but the config declares global-scope ones. Singular/plural aware                                                                                                                                                                                                              |
| `marketplacesRefreshed(count)`                             | `(number) => string`                                   | `update` summary after every marketplace its config named was refreshed                                                                                                                                                                                                                                                             |
| `marketplaceRefreshFailed(marketplace, reason)`            | `(string, string) => string`                           | `update` — one marketplace the Claude CLI could not refresh                                                                                                                                                                                                                                                                         |
| `sourceUnreachableUsingCache(source)`                      | `(string) => string`                                   | A remote source could not be reached to revalidate and the cached copy was used anyway. The load SUCCEEDS, so the line's whole job is to name what the user got                                                                                                                                                                     |
| `marketplacesRefreshFailed(marketplaces)`                  | `(string[]) => string`                                 | `update` fatal summary; each cause was already warned individually, this is what makes the run exit non-zero                                                                                                                                                                                                                        |
| `marketplaceOwnerHasNoName(packageJsonPath)`               | `(string) => string`                                   | `build marketplace`'s refusal when package.json names no author. Refused rather than warned: `marketplaceOwnerSchema` requires `owner.name`, so a manifest written without one is a file this CLI's own reader rejects                                                                                                              |
| `marketplaceHasNoVersion(packageJsonPath)`                 | `(string) => string`                                   | `build marketplace`'s refusal when `version` in package.json is empty. `marketplaceSchema` requires `min(1)` and nothing upstream did, so `""` reached the manifest and the build exited 0 on a file its own reader refuses                                                                                                         |
| `marketplaceNameNotPublishable(name, packageJsonPath)`     | `(string, string) => string`                           | `build marketplace`'s refusal when the name read from package.json is not kebab-case. Names every offending character, because an npm scoped name gives an author two edits to make and the rule alone gives them none; the way out is `--name`, not a package rename                                                               |
| `configTypesRefreshFailed(reason)`                         | `(string) => string`                                   | `Compile.refreshConfigTypes` catch — compiled agents are written, only the type unions may be stale                                                                                                                                                                                                                                 |
| `registeredProjectsUpdated(count)`                         | `(number) => string`                                   | `uninstall` — summary after a global uninstall pruned inlined global entries. Singular/plural aware                                                                                                                                                                                                                                 |
| `registeredProjectUpdateSkipped(projectPath)`              | `(string) => string`                                   | `uninstall` — one registered project was unreachable; the uninstall continues                                                                                                                                                                                                                                                       |
| `skillMetadataUnusableDetail(entry)`                       | `(UnusableSkillMetadata) => string`                    | The file and the reason behind the two refusals below, **logged** rather than carried in the error: oclif hard-wraps error text, and a path broken across two lines cannot be copied                                                                                                                                                |
| `skillMetadataUnusableError(entries)`                      | `(UnusableSkillMetadata[]) => string`                  | `compile` met an installed skill whose `metadata.yaml` describes no skill. Refuses rather than skips, because the same file is refused by the discovery that regenerates `config-types.ts`                                                                                                                                          |
| `savedSkillMetadataUnusableError(entries)`                 | `(UnusableSkillMetadata[]) => string`                  | The same verdict raised by `init`/`edit`, where the cost differs: the entry would otherwise be dropped from `config.ts` and reported as a removal nobody asked for                                                                                                                                                                  |
| `sharedConfigDestinations(id)`                             | `(string) => string[]`                                 | The two lines a freshly minted id can be acted on by (`init --from <id>`, `editorConfigUrl(id)`). ONE definition, printed by BOTH minting commands — `share` and `edit --ui`                                                                                                                                                        |
| `sharedConfigExistingInstall(configPath)`                  | `(string) => string`                                   | `init --from` refusal: this directory is already installed                                                                                                                                                                                                                                                                          |
| `sharedConfigGlobalInstall(configPath)`                    | `(string) => string`                                   | `init --from` refusal: the project is clean but the payload writes global-scoped content into an already-installed `~/.claude`                                                                                                                                                                                                      |
| `sharedConfigProjectScopeAtHome(skillIds, agentNames)`     | `(readonly SkillId[], readonly AgentName[]) => string` | `init --from` and `edit --from` at `$HOME` with project-scoped entries, through the one inherited `refuseProjectScopedContentAtHome`. **Not** a greenfield refusal and says nothing about `uninstall` — the payload is installable and the LOCATION is not. Every offender named                                                    |
| `skippedUnknownSkills(skillIds)`                           | `(readonly string[]) => string`                        | The ids a decode could not place, NAMED rather than counted. One definition because both `init --from` and `edit --from` report it                                                                                                                                                                                                  |
| `skippedUnknownAgents(agentNames)`                         | `(readonly string[]) => string`                        | The sub-agent half of the above, judged against `AGENT_NAMES`                                                                                                                                                                                                                                                                       |
| `carriedSkillsWritten(skillIds)`                           | `(readonly string[]) => string`                        | What a shared configuration brought with it rather than named — the only place a user learns what arrived inside the configuration itself                                                                                                                                                                                           |
| `sharedConfigNeedsTerminal(id)`                            | `(string) => string`                                   | `edit --from` refusal with no TTY. Names `init --from` as the headless alternative, which removes nothing                                                                                                                                                                                                                           |
| `globallyInstalledRemoved(otherProjects)`                  | `(readonly string[]) => string`                        | `edit --from` removal plan: the consequence of removing globally installed entries from inside a project. Nothing is refused — the reach is counted AND named, because "2 other projects" cannot be weighed against anything and a path can. Printed only from a project                                                            |
| `authoredHereKept(skillIds)`                               | `(readonly SkillId[]) => string`                       | `edit --from` removal plan: skills the round trip does not own (`forkedFrom` absent), so no shared configuration ever carried them                                                                                                                                                                                                  |
| `unplaceableKept(skillIds)`                                | `(readonly SkillId[]) => string`                       | `edit --from` removal plan: skills this configuration NAMES that this catalogue cannot place. The remedy is the catalogue rather than the skill, which is what separates it from the two above                                                                                                                                      |
| `configUnreadableError(configLoadFailure)`                 | `(string) => string`                                   | `BaseCommand.ensureConfigReadable` — `edit`/`init` met a config that exists but cannot be loaded. Takes a `ConfigLoadError` message (file + reason already in it) and adds the ways forward: `uninstall` then `init`, the editor at `EDITOR_URL` plus `init --from <id>`, and `doctor`                                              |
| `registeredProjectsUpdateFailed(reason)`                   | `(string) => string`                                   | `Uninstall.prepareGlobalPropagation` catch — no registered project could be updated; the uninstall still completes                                                                                                                                                                                                                  |
| `unmarkedAgentsKept(agentsDir, count)`                     | `(string, number) => string`                           | Uninstall plan AND summary, from the one plan, for agent files carrying no provenance marker. Printed both before the confirm and after the removal so the two cannot disagree                                                                                                                                                      |
| `localSkillsRemoval(skillsDir)`                            | `(string) => string`                                   | Uninstall plan line for the local skills directory — "(matching the marketplace)", because only skills whose `forked-from` metadata names one are removed                                                                                                                                                                           |
| `compiledAgentsRemoval(agentsDir)`                         | `(string) => string`                                   | Uninstall plan line for the compiled agents directory, marking it the CLI's to delete                                                                                                                                                                                                                                               |

`INFO_MESSAGES.CONFIG_TYPES_REFRESHED` is the success counterpart to `configTypesRefreshFailed()`;
both interpolate `STANDARD_FILES.CONFIG_TYPES_TS` rather than hardcoding `config-types.ts`.

## Constants Reference (`src/cli/consts.ts`)

**Fifteen of the names below are declared in `packages/compile/src/paths.ts` and re-exported by
`consts.ts`, which is still the one address every CLI call site reads them at.** The re-exported
set is `CLAUDE_DIR`, `CLAUDE_SRC_DIR`, `CLI_INVOKE_COMMAND`, `DEFAULT_PLUGIN_NAME`,
`DEFAULT_PUBLIC_SOURCE_NAME`, `DIRS`, `EJECT_SOURCE`, `GLOBAL_CONFIG_NAME`, `LOCAL_PSEUDO_CATEGORY`,
`LOCAL_SKILLS_PATH`, `PLUGIN_MANIFEST_FILE`, `SKILLS_DIR_PATH`, `SOURCE_SRC_DIR`, `STANDARD_DIRS`
and `STANDARD_FILES` — so the `DIRS`, `STANDARD_FILES` and `STANDARD_DIRS` tables below are the
package's whole, and the Paths table is split between the two files. What `consts.ts` still
declares is the half that reads the machine: `PROJECT_ROOT` (derived with
`fileURLToPath(import.meta.url)` at module load), `globalInstallRoot()`, `cacheRoot()` and the
plugin/marketplace names. Re-derive the split rather than carrying it:

```
sed -n '/^export {/,/@workspace\/compile/p' src/cli/consts.ts
```

**`scripts/check-enumeration-drift.ts` reads the package, not this file.** Its registry points at
`../compile/src/paths.ts` for these rows, with the reason written above the constant — no call site
moved, but the declarations these rows enumerate did. A row added to a table below has to be added
against the package's declaration to be gated.

### Paths

| Constant                   | Value                        | Purpose                                                                                                                                                                                                         |
| -------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PROJECT_ROOT`             | CLI package root             | Base for template resolution                                                                                                                                                                                    |
| `globalInstallRoot()`      | `os.homedir()`               | Root for global installations. A FUNCTION, not a constant: a value frozen at module load is the home of whichever process first imported `consts.ts` — see below                                                |
| `CLAUDE_DIR`               | `.claude`                    | Claude config directory                                                                                                                                                                                         |
| `CLAUDE_SRC_DIR`           | `.claude-src`                | Source config directory                                                                                                                                                                                         |
| `PLUGINS_SUBDIR`           | `plugins`                    | Plugins subdirectory                                                                                                                                                                                            |
| `PLUGIN_MANIFEST_DIR`      | `.claude-plugin`             | Plugin manifest directory                                                                                                                                                                                       |
| `PLUGIN_MANIFEST_FILE`     | `plugin.json`                | Plugin manifest filename                                                                                                                                                                                        |
| `MARKETPLACE_JSON`         | `marketplace.json`           | Marketplace manifest filename                                                                                                                                                                                   |
| `CATALOG_JSON`             | `catalog.json`               | The catalogue a marketplace publishes **beside** its manifest — see below                                                                                                                                       |
| `GENERATED_AT_BUILD`       | `build`                      | The word a written-to-disk matrix stamps into `generatedAt` in place of a timestamp — see below                                                                                                                 |
| `PUBLIC_CATALOGUE_PACKAGE` | `@agents-inc/skills`         | The package identity that exempts the public catalogue from the reserved-name guard. Behaviour is owned by [features/plugin-system.md](./features/plugin-system.md)                                             |
| `PLUGINS_DIST_PATH`        | `dist/plugins`               | Compiled plugin output dir (marketplace-relative)                                                                                                                                                               |
| `DEFAULT_PLUGIN_NAME`      | `agents-inc`                 | Default plugin name                                                                                                                                                                                             |
| `cacheRoot()`              | `~/.cache/agents-inc`        | Source cache directory, read at call time for `globalInstallRoot()`'s reason. Consumed by `lib/loading/source-fetcher.ts`; layout in [features/source-fetch-and-cache.md](./features/source-fetch-and-cache.md) |
| `SKILL_CATEGORIES_PATH`    | `config/skill-categories.ts` | Skill categories config file                                                                                                                                                                                    |
| `SKILL_RULES_PATH`         | `config/skill-rules.ts`      | Skill rules config file                                                                                                                                                                                         |
| `STACKS_FILE_PATH`         | `config/stacks.ts`           | Stacks config file                                                                                                                                                                                              |
| `SOURCE_SRC_DIR`           | `src`                        | Source root dir inside a marketplace/source repo                                                                                                                                                                |
| `SKILLS_DIR_PATH`          | `src/skills`                 | Skills source directory (`${SOURCE_SRC_DIR}/skills`)                                                                                                                                                            |
| `LOCAL_SKILLS_PATH`        | `.claude/skills`             | Local skills directory                                                                                                                                                                                          |
| `EJECT_SOURCE`             | `eject`                      | Synthetic source name for ejected (copied) skills                                                                                                                                                               |
| `LOCAL_PSEUDO_CATEGORY`    | `local`                      | Pseudo-category for local skills (not a `Category`)                                                                                                                                                             |
| `GLOBAL_CONFIG_NAME`       | `global`                     | `name` field written into a global-scope config                                                                                                                                                                 |
| `EDIT_PROJECT_SETUP_FLAG`  | `project-setup`              | Hidden `edit` flag marking the setup half of `init`                                                                                                                                                             |

Helper: `marketplaceManifestPath(dir: string): string` joins `dir` + `PLUGIN_MANIFEST_DIR` + `MARKETPLACE_JSON`.

**`globalInstallRoot()` and `cacheRoot()` are functions because a constant here freezes a home.**
Both were `export const … = os.homedir()` and both settled on whichever home was in force when
`consts.ts` was first imported. `runCliCommand` drives oclif through `dist/`, a second module graph
imported by whichever spec runs a command first, so the value became that spec's fake home and every
later spec in the file read and wrote under a directory its own `afterEach` had removed — succeeding,
into the wrong tree. In the `src` graph it was worse: `consts.ts` is imported while vitest collects,
before any hook redirects the home, so a unit test reading either constant read the developer's own.
Every other home-dir reader already called `os.homedir()` at call time — `installBaseDir`,
`isHomeDirectory`, `globalPairPaths` — and `src/cli/lib/__tests__/home-dir-read-at-call-time.test.ts`
refuses the frozen declaration shape anywhere in `src/cli/`.

**`MARKETPLACE_JSON` and `CATALOG_JSON` answer different questions and are not interchangeable.**
`marketplace.json` lists what a marketplace **installs**; `catalog.json` lists what it **offers** —
its whole matrix as JSON, in the shape `@workspace/matrix`'s `matrixSchema` describes. The editor
fetches the catalogue directly and parses it with that schema, so nothing between the two transforms
it.

**`GENERATED_AT_BUILD` is why a regenerated matrix is not a diff of pure noise.** A matrix built in
memory carries an ISO timestamp in `generatedAt`; one WRITTEN to disk carries this fixed word
instead. A recorded moment would make every regeneration a diff even when nothing about the matrix
moved — costing the vendored `src/cli/types/generated/matrix.ts` a pull request of noise, and costing
`catalog.json` its cache, because a file whose bytes always change can never answer a conditional
request. Nothing reads the field back. Both emitters stamp it and they are the only two places a
matrix becomes a file: `scripts/generate-source-types.ts` and `build marketplace`.

### Directory Constants

`DIRS` object:

| Key         | Value                   | Purpose                   |
| ----------- | ----------------------- | ------------------------- |
| `agents`    | `src/agents`            | Agent templates directory |
| `skills`    | `src/skills`            | Skills source directory   |
| `stacks`    | `src/stacks`            | Stacks config directory   |
| `templates` | `src/agents/_templates` | Agent templates           |

### Standard Files and Dirs

`STANDARD_FILES` constant. All well-known filenames, keyed without the object prefix so the list is
readable as an enumeration — bound to source by `scripts/check-enumeration-drift.ts`:

| Key                        | Value                      |
| -------------------------- | -------------------------- |
| `SKILL_MD`                 | `SKILL.md`                 |
| `METADATA_YAML`            | `metadata.yaml`            |
| `METADATA_JSON`            | `metadata.json`            |
| `CONFIG_YAML`              | `config.yaml`              |
| `SKILL_CATEGORIES_TS`      | `skill-categories.ts`      |
| `SKILL_RULES_TS`           | `skill-rules.ts`           |
| `AGENT_METADATA_YAML`      | `metadata.yaml`            |
| `PLUGIN_JSON`              | `plugin.json`              |
| `CONFIG_TS`                | `config.ts`                |
| `CONFIG_TYPES_TS`          | `config-types.ts`          |
| `CLAUDE_MD`                | `CLAUDE.md`                |
| `README_MD`                | `README.md`                |
| `REFERENCE_MD`             | `reference.md`             |
| `IDENTITY_MD`              | `identity.md`              |
| `PLAYBOOK_MD`              | `playbook.md`              |
| `OUTPUT_MD`                | `output.md`                |
| `CRITICAL_REQUIREMENTS_MD` | `critical-requirements.md` |
| `CRITICAL_REMINDERS_MD`    | `critical-reminders.md`    |
| `SETTINGS_JSON`            | `settings.json`            |
| `SETTINGS_LOCAL_JSON`      | `settings.local.json`      |
| `PACKAGE_JSON`             | `package.json`             |

`METADATA_YAML` and `AGENT_METADATA_YAML` are deliberately the same value under two keys — a skill's
and a sub-agent's metadata file share a filename and nothing else, and one key would make a call
site's subject unreadable.

`STANDARD_DIRS` constant, same convention:

| Key         | Value       |
| ----------- | ----------- |
| `EXAMPLES`  | `examples`  |
| `SCRIPTS`   | `scripts`   |
| `SKILLS`    | `skills`    |
| `AGENTS`    | `agents`    |
| `TEMPLATES` | `templates` |

**This table's Value column is bound too, not just its keys** — the row is registered as pairs, so a
wrong directory name reddens where a keys-only binding would report the table as agreeing. Its
neighbour above is not, and the reason is in the source rather than in the document: `STANDARD_FILES`
binds `METADATA_YAML`, `AGENT_METADATA_YAML` and `PLUGIN_JSON` to identifiers rather than to string
literals, which the reader refuses to guess at. Same for `DIRS` (`skills` holds `SKILLS_DIR_PATH`),
`SCHEMA_PATHS` (templates with a substitution, and a value column stating the suffix), `EXIT_CODES`
(numeric) and `UI_SYMBOLS` (the members bound to the module-private `CHECK_GLYPH` / `EN_DASH_GLYPH`,
and a value column written as prose).

### Branding and Naming

| Constant                     | Value                                                              | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLI_INVOKE_COMMAND`         | `npx agents-inc`                                                   | Promoted invocation prefix shown in user-facing messages. `package.json` `bin` registers BOTH `agents-inc` and `agentsinc` for `dist/index.js`; `oclif.bin` is `agents-inc` alone. **Convention (recorded beside the constant in `consts.ts`): every user-facing instruction in this repo — messages, docs, code comments, agent playbooks — writes commands in this `npx agents-inc <cmd>` form. Prose that merely NAMES a command ("the `agents-inc list` table") does not.**   |
| `EDITOR_URL`                 | `https://agentsinc.sh`                                             | The editor — where a configuration is built without the wizard and handed to `init --from <id>`. The editor Worker's custom domain (`apps/editor/wrangler.jsonc`); its config store `https://api.agentsinc.sh` is spelled separately in `src/cli/lib/seed/fetch-seed.ts` as `SEED_API_URL`, which is env-overridable while this is not                                                                                                                                            |
| `DEFAULT_BRANDING.NAME`      | `Agents Inc.`                                                      | The name a run prints itself under when no configuration supplies one — the FALLBACK, not the value every surface prints. `branding.name` in `.claude-src/config.ts` replaces it at `doctor`'s, `eject`'s and `uninstall`'s headers, `uninstall`'s sign-off, `init`'s closing line and the dashboard summary's title; this constant is what `resolveBranding` yields where that key is absent and what `BaseCommand.resolveBrandingName` degrades to over a config it cannot read |
| `DEFAULT_PUBLIC_SOURCE_NAME` | `agents-inc` (= `DEFAULT_PLUGIN_NAME`)                             | Fallback marketplace/source name                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SOURCE_DISPLAY_NAMES`       | `{ public: "Public", eject: "Eject", "agents-inc": "Agents Inc" }` | Inline human-readable source type labels                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `INSTALL_MODES`              | `["eject", "plugin"]`                                              | The two install modes a Sources row offers, in the order the grid renders them                                                                                                                                                                                                                                                                                                                                                                                                    |
| `INSTALL_MODE_CELL_LABELS`   | `{ eject: "Local", plugin: "Plugin" }`                             | How the Sources grid captions its two cells — where the skill will LIVE, not what the mode does to the files (`INSTALL_MODE_LABELS`) nor what an `origin` VALUE is called (`SOURCE_DISPLAY_NAMES`)                                                                                                                                                                                                                                                                                |
| `DEFAULT_VERSION`            | `1.0.0`                                                            | Default skill version                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `DEFAULT_DISPLAY_VERSION`    | `0.0.0`                                                            | Indicates no version explicitly set                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ALL_SKILLS_EJECTED_LABEL`   | `All skills ejected`                                               | Summary-panel `Marketplace` row when no skill has a marketplace source (distinct state from an empty set, which falls back to the public default)                                                                                                                                                                                                                                                                                                                                 |

Helper: `editorConfigUrl(id: string): string` -> `` `${EDITOR_URL}/?fromId=${encodeURIComponent(id)}` `` — the editor page that reopens a shared configuration. **Exported before it had a second caller, and it now has two:** `share` prints it (through `sharedConfigDestinations` in `utils/messages.ts`) and `edit --ui` hands it to `openUrl`. Two surfaces each building their own query string is how one ends up pointing at a page the other never opens.

`ALL_SKILLS_EJECTED_LABEL` has exactly one production consumer: `formatSkillMarketplaces(skillConfigs: SkillConfig[])` in `src/cli/components/wizard/summary-panel.tsx`. Three distinct cases, in source order:

| Input                            | Output                                                |
| -------------------------------- | ----------------------------------------------------- |
| `skillConfigs.length === 0`      | `formatSourceDisplayName(DEFAULT_PUBLIC_SOURCE_NAME)` |
| every `origin` is `EJECT_SOURCE` | `ALL_SKILLS_EJECTED_LABEL`                            |
| any marketplace-sourced skill    | its marketplace name(s), sorted, joined with `" · "`  |

The label derives from `SkillConfig.origin`, not from a store field. A `Marketplace` row reading a store field no code ever writes prints the hardcoded public default instead — do not reintroduce one. Tombstoned (`excluded`) entries count toward the marketplace names, because one still records a real global install.

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

The members of `UI_SYMBOLS`, exhaustive and in source order: `CHEVRON`, `CHEVRON_SPACER`, `SELECTED`, `UNSELECTED`, `CURRENT`, `SKIPPED`, `DISCOURAGED`, `DISABLED`, `LOCK`, `EJECT`, `BULLET`, `SCROLL_UP`, `SCROLL_DOWN`, `CHECK`, `CROSS`, `REMOVED`, `ADDED`.

Two key pairs share one glyph and are kept apart so call sites express intent: `SELECTED` and `CHECK` share a checkmark via the module-private `CHECK_GLYPH`, and `SKIPPED` and `DISABLED` share an en dash via `EN_DASH_GLYPH`. Neither glyph constant is exported.

#### Shared diff markers

`UI_SYMBOLS.ADDED` (ASCII `+`) and `UI_SYMBOLS.REMOVED` (ASCII `-`) are the added / pending-removal
diff markers, deliberately shared by the two surfaces that render a session diff so they cannot
drift apart:

| Consumer                                            | Surface                 | Usage                                               |
| --------------------------------------------------- | ----------------------- | --------------------------------------------------- |
| `src/cli/components/wizard/skill-agent-summary.tsx` | Confirm-step info panel | `DIFF_PREFIX` record keyed by `DiffRowStatus`       |
| `src/cli/components/wizard/source-grid.tsx`         | Sources step            | `row.disabled` -> `REMOVED`, `row.added` -> `ADDED` |

The `unchanged` marker is `UI_SYMBOLS.BULLET`. The **mode-changed** marker is a bare `"~ "` string
literal in `skill-agent-summary.tsx`'s `DIFF_PREFIX` — it is _not_ a `UI_SYMBOLS` member.

The keys of `CLI_COLORS`, exhaustive and in source order: `PRIMARY`, `SUCCESS`, `ERROR`, `WARNING`, `INFO`, `NEUTRAL`, `FOCUS`, `UNFOCUSED`, `WHITE`, `BLACK`, `DIM`, `GRAY_1`, `LABEL_BG`, `TOAST_BG`, `TOAST_FG`, `HOVER_BG`.

The keys of `SCROLL_VIEWPORT`, exhaustive and in source order, with each value in parentheses: `SCROLL_INDICATOR_HEIGHT` (1), `CATEGORY_NAME_LINES` (2), `CATEGORY_MARGIN_LINES` (1), `MIN_VIEWPORT_ROWS` (5).

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

| Constant                      | Value                             | Purpose                            |
| ----------------------------- | --------------------------------- | ---------------------------------- |
| `GITHUB_SOURCE.HTTPS_PREFIX`  | `https://github.com/`             | GitHub HTTPS URL prefix            |
| `GITHUB_SOURCE.GITHUB_PREFIX` | `github:`                         | GitHub shorthand prefix            |
| `GITHUB_SOURCE.GH_PREFIX`     | `gh:`                             | GitHub short prefix                |
| `KEBAB_CASE_PATTERN`          | `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` | Strict kebab-case validation regex |
| `AUTHOR_HANDLE_PATTERN`       | `/^@[a-z][a-z0-9-]*$/`            | Author handle format (`@` + slug)  |

### Domain Configuration

| Constant                  | Value                                                           |
| ------------------------- | --------------------------------------------------------------- |
| `DEFAULT_SCRATCH_DOMAINS` | `["web", "api", "mobile"]`                                      |
| `FALLBACK_DOMAIN`         | `"web"` — used when no active domain resolves from wizard state |

The canonical domain display order is no longer a `consts.ts` export: the CLI
imports `DOMAIN_ORDER` from `@workspace/matrix`
(`packages/matrix/src/read-model/domains.ts`), the same surface the editor
reads.

## Remeda Utilities (External)

Re-derive the importer list with `grep -rl 'from "remeda"' src/cli`; only three of the files it
returns are not production modules — `lib/__tests__/mock-data/mock-matrices.ts` and
`lib/__tests__/content-generators.ts` (both test support) and `components/wizard/step-build.test.tsx`
(a spec). **No file total is written here**: it moves on any import added anywhere under `src/cli/`,
which is a file no documentation pass is looking at, and it has already drifted once.

Always `import { ... } from "remeda"`; there are zero namespace `* as R` imports. The named imports
actually in use across `src/cli/`:

| Function        | Usage                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------- |
| `unique()`      | Deduplicate arrays                                                                        |
| `uniqueBy()`    | Deduplicate by key                                                                        |
| `sortBy()`      | Sort with comparators                                                                     |
| `indexBy()`     | Index array into object                                                                   |
| `pipe()`        | Functional pipeline                                                                       |
| `flatMap()`     | Flat map                                                                                  |
| `filter()`      | Type-safe filter                                                                          |
| `mapValues()`   | Transform record values                                                                   |
| `difference()`  | Set difference                                                                            |
| `groupBy()`     | Group array by key                                                                        |
| `countBy()`     | Count occurrences                                                                         |
| `partition()`   | Split into pass/fail arrays                                                               |
| `zip()`         | Pair two arrays elementwise                                                               |
| `isDeepEqual()` | Structural equality check                                                                 |
| `omit()`        | Drop named keys from a record — test support only (`lib/__tests__/content-generators.ts`) |

(`mapToObj` and `sumBy` are no longer imported anywhere in `src/cli/`.)

## Test Mocks

| Mock File                           | Mocks                  |
| ----------------------------------- | ---------------------- |
| `src/cli/utils/__mocks__/fs.ts`     | File system operations |
| `src/cli/utils/__mocks__/logger.ts` | Logging functions      |
