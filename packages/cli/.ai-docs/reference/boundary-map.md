---
scope: reference
area: architecture
keywords: [boundaries, input, parse, write, exec, security, config-gate, privileged-zone]
related:
  - reference/architecture-overview.md
  - reference/type-system.md
  - reference/features/configuration.md
last_validated: 2026-07-30
---

# Boundary Map

## Overview

**Purpose:** Identifies all system boundaries where external data enters or leaves the CLI, and documents what validation/sanitization exists at each boundary.

**Key Files:**

| File                                               | Purpose                                                                                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/base-command.ts`                          | Shared command behaviour (error handling, terminal-geometry startup gate) — no flags: it declares no `baseFlags`                                                            |
| `src/cli/commands/init.tsx`                        | `--marketplace` flag definition — the one command that carries it                                                                                                           |
| `src/cli/hooks/init.ts`                            | The bare-invocation dashboard, and nothing else — it parses no argv and resolves no marketplace (section 1.2)                                                               |
| `src/cli/utils/terminal.ts`                        | Terminal-geometry predicate + message shared by both size gates (section 1.4)                                                                                               |
| `src/cli/utils/exec.ts`                            | Shell execution boundary, input validation                                                                                                                                  |
| `src/cli/utils/fs.ts`                              | `readFileSafe()` with size limits; `writeFile()` holds the runtime tripwire on the global config pair (section 3.4a)                                                        |
| `src/cli/lib/config-gate/`                         | The only code permitted to write `~/.claude-src/config.ts` + `config-types.ts` — `index.ts` is its whole public surface (section 3.4a)                                      |
| `src/cli/lib/schemas.ts`                           | All Zod schemas for parse boundaries + metadata issue splitting (schema count lives in `reference/types/zod-schemas.md`, which owns it)                                     |
| `src/cli/lib/configuration/config.ts`              | Source validation (`validateSourceFormat`); `.claude-src/config.ts` SETTINGS load boundary — raises for a corrupt-but-present config                                        |
| `src/cli/lib/configuration/config-loader.ts`       | jiti TypeScript config loading                                                                                                                                              |
| `src/cli/lib/configuration/project-config.ts`      | `.claude-src/config.ts` ROSTER load boundary; `ConfigLoadError` for corrupt-but-present configs                                                                             |
| `src/cli/lib/configuration/config-writer.ts`       | Config file generation                                                                                                                                                      |
| `src/cli/lib/configuration/config-types-writer.ts` | A re-export barrel: the renderers from `@workspace/compile/config-types-source`, the disk half from `config-types-io.ts`. It declares nothing of its own                    |
| `src/cli/lib/installation/local-installer.ts`      | Config build/merge + agent compilation; writes no config file                                                                                                               |
| `src/cli/lib/loading/source-loader.ts`             | Source fetch/network boundary; `matrixOnly` + `skipExtraSources` opt-outs                                                                                                   |
| `src/cli/lib/compiler.ts`                          | Reads agent partials off disk, resolves template roots, re-exports the sanitizers. Sanitization, render and pluginRef derivation are `packages/compile/src/agent-source.ts` |
| `src/cli/lib/skills/skill-copier.ts`               | Path traversal prevention                                                                                                                                                   |
| `src/cli/lib/plugins/plugin-settings.ts`           | Claude settings/registry JSON parsing (`installed_plugins.json` v2 registry)                                                                                                |
| `src/cli/lib/plugins/plugin-finder.ts`             | Plugin manifest JSON parsing                                                                                                                                                |
| `src/cli/lib/plugins/plugin-validator.ts`          | Plugin/skill/agent frontmatter validation                                                                                                                                   |
| `src/cli/lib/source-validator.ts`                  | Source directory validation (`checkDirNameMatchesSkillId` compares dir name to the SKILL.md machine id)                                                                     |
| `src/cli/commands/share.ts`                        | The piped-payload boundary — the one document a producer outside this repository writes (section 1.5)                                                                       |
| `src/cli/commands/uninstall.tsx`                   | Filesystem DELETE boundary (plugins, skills, agents, config manifest) + registry deregistration                                                                             |
| `src/cli/consts.ts`                                | File size limit constants                                                                                                                                                   |

---

## 1. CLI Input Boundaries

### 1.1 `init`'s Flag: `--marketplace`

| Property       | Value                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| **Location**   | `src/cli/commands/init.tsx`                                                               |
| **Direction**  | IN                                                                                        |
| **Data**       | Skills source path or URL                                                                 |
| **Validation** | oclif `Flags.string()` (accepts any string), then `validateSourceFormat()` in `config.ts` |
| **Schema**     | None (string flag); validated by `validateSourceFormat()`                                 |

**`init` is the only command that declares `--marketplace` / `-m`** (owner ruling 2026-08-09).
Naming a marketplace is an install-time decision; every later command resolves the marketplace that
install recorded (project config → global config → default), so the flag is declared in `init.tsx`
and nowhere else. `BaseCommand` declares no `baseFlags` at all. The re-derivation is
`grep -rn "marketplace: Flags" src/cli/commands`, which reports exactly one line.

Passing `--marketplace` to any other command is refused by the parser (`Nonexistent flag:
--marketplace`, exit 2). The withdrawn `--source` / `-s` spellings are refused by **every** command,
`init` included — see the callout in [commands/index.md](./commands/index.md#command-architecture). Both
halves are pinned by `e2e/commands/source-flag-is-init-only.e2e.test.ts`, which asserts the refused
commands as a set rather than one specimen.

### 1.2 Init Hook: Not an Input Boundary

`src/cli/hooks/init.ts` reads no input. Its whole body branches on `options.id === undefined` — no
command named — and calls `runDashboardFlow` from `commands/init.js`, exiting `EXIT_CODES.SUCCESS`
if the dashboard was shown. It parses no argv, resolves no marketplace, and attaches nothing to the
oclif config. `BaseCommand` has no `sourceConfig` getter either.

The marketplace flag reaches `resolveSource()` through oclif's own parse instead: `init.tsx` passes
`flags.marketplace` to `loadSkillsMatrixFromSource` as `sourceFlag`, alongside `caller: "init"`.
That caller identity is what makes `init` the one command `resolveSource` reads `CC_MARKETPLACE` for
(`SOURCE_ENV_VAR` in `configuration/config.ts` — the identifier kept the old word, its value did
not); every other site passes `caller: "stored"`. Re-derive:

```
grep -rn 'resolveSource(' src --include='*.ts' --include='*.tsx' --exclude='*.test.ts'
```

The section is kept rather than deleted because the argv extraction it used to describe is the
obvious place to look for pre-parse validation, and there is none to find.

### 1.3 Per-Command Flag Definitions

Every command extends `BaseCommand` and defines `static flags`. oclif handles type coercion, required validation, and enum constraints.

| Command             | File                            | Flags                                                                                                                                   |
| ------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `init`              | `commands/init.tsx`             | `--marketplace` / `-m` (string, the only command that has it), `--from` (string), `--ui` (boolean)                                      |
| `edit`              | `commands/edit.tsx`             | `--ui` (boolean), `--from` (string), `--project-setup` (boolean, hidden internal flag `EDIT_PROJECT_SETUP_FLAG`)                        |
| `compile`           | `commands/compile.ts`           | `--verbose` (boolean)                                                                                                                   |
| `list`              | `commands/list.tsx`             | (none); alias `ls`                                                                                                                      |
| `eject`             | `commands/eject.ts`             | `type` (**positional, optional**, enum: `agent-partials` \| `templates` \| `skills` \| `all`); `--force` (boolean), `--output` (string) |
| `search`            | `commands/search.ts`            | `query` (positional, required); no flags                                                                                                |
| `share`             | `commands/share.ts`             | `--stdin` (boolean) — the piped-payload boundary, section 1.5                                                                           |
| `new marketplace`   | `commands/new/marketplace.ts`   | `name` (positional); no flags                                                                                                           |
| `update`            | `commands/update.ts`            | (none) — a marketplace refresh takes no argument and confirms nothing                                                                   |
| `uninstall`         | `commands/uninstall.tsx`        | `--yes` / `-y` (boolean). **`--all` was removed** — manifest removal is now unconditional.                                              |
| `doctor`            | `commands/doctor.ts`            | (none) — the zero-flag command the former `validate` folded into                                                                        |
| `build plugins`     | `commands/build/plugins.ts`     | `--agents-dir` (string), `--output-dir` (string), `--skill` (string), `--verbose` (boolean)                                             |
| `build marketplace` | `commands/build/marketplace.ts` | `--name` (string), `--plugins-dir` (string), `--output` (string), `--verbose` (boolean)                                                 |

**`eject`'s positional `type` is the only enum-constrained arg in the CLI.** oclif rejects a value outside `EJECT_TYPES` (`agent-partials`, `templates`, `skills`, `all`, declared module-private in `commands/eject.ts`) at parse time, before `run()`. It is optional — omitting it is valid and handled inside the command.

**Validation pattern:** oclif validates flag types, required status, and enum `options` at parse time. String flags pass through without content validation -- downstream code validates semantics (e.g., `validateSourceFormat` for source strings).

> **This table exists to place oclif parsing on the boundary map, not to be the flag reference.** [`commands/index.md`](./commands/index.md) is canonical for signatures. If the two disagree, `commands/index.md` wins — that is what happened, when this table understated the flag inheritance and omitted `eject`'s positional arg while `commands/index.md` had both right.

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

### 1.5 `share`'s Flag: `--stdin`

The only boundary where the CLI parses a document a **producer outside this repository** wrote. Everything else in section 1 is a flag, an argv token or an environment reading; this is a whole configuration arriving on a pipe, and the producer it exists for — the `meta-config-stack-detect` skill — ships from a different repository on a different cadence.

| Property       | Value                                                                                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Location**   | `src/cli/commands/share.ts` → `src/cli/lib/seed/read-piped-payload.ts`                                                                                                                                                                                                                  |
| **Direction**  | IN (pipe)                                                                                                                                                                                                                                                                               |
| **Data**       | A `SeedPayload` as JSON, unbounded length, from an untrusted author                                                                                                                                                                                                                     |
| **Validation** | `readPipedPayload` — non-empty, then `JSON.parse` behind a `JsonRead` verdict, then `installableSeedPayloadSchema.safeParse`                                                                                                                                                            |
| **Schema**     | `installableSeedPayloadSchema` (`@workspace/matrix/seed`) — the WRITE schema, the one the store's `POST /configs` declares. Deliberately **not** the base `seedPayloadSchema` that `fetch-seed.ts` applies to a downloaded payload: this is a write gate, and the two are not the same. |

**Boundary contracts:**

- **Every refusal happens before the POST**, and the assertion that proves it is the store's empty request log rather than an exit code. The free tier allows a thousand writes a day against a hundred times that in reads, so a write is the scarce half and one spent on a payload the decoder cannot read buys a dead link.
- **Three failures are told apart, because they are three different mistakes**: nothing arrived (`NOTHING_PIPED`), what arrived is not JSON, or it is JSON the contract will not take. A single "invalid input" would leave the caller guessing which.
- **stdin being a TTY is refused separately** (`STDIN_IS_A_TERMINAL`), above the read. Without it the command waits on a terminal nobody is typing into, which is a hang rather than an error.
- **The schema travels with the code that POSTs, and that is the whole reason this boundary exists here** rather than in the producer. `SEED_VERSION` is a `z.literal`, so a producer hardcoding the wire shape emits payloads the store refuses the day it moves; `AGENTS_INC_API_URL` exists so tests never touch the network and a hardcoded URL ignores it; and the caller's user-agent is what separates an install from a look.
- **A local gate reading the READ schema is a local gate that passes what the edge refuses.** The one rule the two schemas differ by is the scope-reach rule — a project-scoped skill assigned to a sub-agent resting at global has nowhere to be written — and it is the whole gap: while this boundary read the base schema, that single payload passed here and came back from the POST as a bare `HTTP 400`. It is not an exotic shape, because `agents` is sparse and an absent entry rests on the shared default of `global`. Reading the same schema the store writes with is what makes this boundary's promise — every local failure failing before a write is spent — true rather than nearly true. See [features/seed-contract.md § Two schemas](./features/seed-contract.md#two-schemas-one-for-reading-and-one-for-writing).
- **No installation is read on this path.** A bare `share` resolves one the way every command does — project, then global — so without the branch, sharing a piped payload from an empty directory would publish whatever the machine has installed. `e2e/commands/share-stdin.e2e.test.ts` asserts the posted body holds only what was piped.

---

## 2. File System Parse Boundaries (Data IN)

### 2.1 YAML Parse Pattern

**There is no `src/cli/utils/yaml.ts` and no `safeLoadYamlFile`.** Production code imports `parse as parseYaml` from the `yaml` package directly and applies the same validation pattern inline at each call site:

`readFileSafe()` (size limit) -> `parseYaml()` -> `schema.safeParse()`

Default size limit: `MAX_CONFIG_FILE_SIZE` (1 MB, in `consts.ts`).

### 2.2 TypeScript Config via `loadConfig` (jiti)

| Property       | Value                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Location**   | `src/cli/lib/configuration/config-loader.ts`                                                                                                                                                                                                                                                                                                                   |
| **Direction**  | IN                                                                                                                                                                                                                                                                                                                                                             |
| **Data**       | `.claude-src/config.ts`, plus `config/stacks.ts`, `config/skill-categories.ts`, `config/skill-rules.ts` — **paths in a skills-source / marketplace repo, not in this repository** (this repo has no `config/` directory; the CLI's own fallbacks are `lib/configuration/default-*.ts`, see [features/built-in-catalogue.md](./features/built-in-catalogue.md)) |
| **Validation** | Optional Zod schema via `schema.safeParse()`                                                                                                                                                                                                                                                                                                                   |
| **Mechanism**  | jiti dynamic import with module cache disabled, alias for `agents-inc/config`                                                                                                                                                                                                                                                                                  |

Callers. **The `Wrote it` column is a trust boundary, not a provenance note** — see the split below
the table:

| Caller                       | File                              | Schema Used                                            | Wrote it        |
| ---------------------------- | --------------------------------- | ------------------------------------------------------ | --------------- |
| `loadProjectConfigFromDir()` | `configuration/project-config.ts` | `projectConfigLoaderSchema` (via raw load + safeParse) | The CLI         |
| `loadSourceConfig()`         | `configuration/config.ts`         | `projectSourceConfigSchema`                            | The CLI         |
| `validateTsConfig()`         | `source-validator.ts` (internal)  | Passed by caller for each config file                  | A source author |
| `loadSkillCategories()`      | `matrix/matrix-loader.ts`         | `skillCategoriesFileSchema`                            | A source author |
| `loadSkillRules()`           | `matrix/matrix-loader.ts`         | `skillRulesFileSchema`                                 | A source author |
| `loadStacks()`               | `stacks/stacks-loader.ts`         | `stacksConfigSchema`                                   | A source author |

**This is one mechanism with two trust postures, and the column above is which.** Data a source
AUTHOR wrote is read as written; data the CLI PERSISTED is reconciled against the live catalogue
before any consumer sees it. A source repo's `config/*.ts` ships alongside the catalogue it
references, so a stack author who groups cross-category skills under one heading meant that heading;
a user's `.claude-src/config.ts` was written by an older catalogue and cannot be asked to migrate, so
its category keys are re-keyed to what the catalogue names today. Treating the two alike is not a
type error and not a test failure — it compiles, and it silently rewrites every stack author's
grouping.

`loadSourceConfig()` is private and covers BOTH public settings readers — `loadProjectSourceConfig(dir)`
and `loadGlobalSourceConfig()` differ only in the directory and the scope label they hand it. It is
the CLI's own file and takes the same missing-vs-corrupt posture as the roster loader beside it: a
file that is not there answers `null`, and every way of failing to load one that IS there raises.
`features/configuration.md` § `loadSourceConfig` holds the per-call-site abort/degrade table.

The two normalizers that carry the split, their callers and the specs holding each half are owned by
[`features/configuration.md`](./features/configuration.md) § the persisted/authored table. This
document states only that the boundary divides here, so § 3.4a's config-gate door and
`loadProjectConfigFromDir` above are the same posture and `loadStacks` is not. Of the six rows,
only those two reach a normalizer at all: `loadStacks` runs `normalizeAgentConfig`,
`loadProjectConfigFromDir` runs `normalizeStackRecord`, and the other four read what they parsed.

**Missing vs corrupt:** `loadProjectConfigFromDir()` returns `null` **only** when the config file does not exist. Once the file exists, three failure modes throw `ConfigLoadError(configPath, reason)` instead of degrading to `null`:

| Failure                                     | Reason string source                       |
| ------------------------------------------- | ------------------------------------------ |
| jiti load throws (syntax/eval error)        | `getErrorMessage(error)`                   |
| Result is not an object (no default export) | `"the file has no valid default export"`   |
| `projectConfigLoaderSchema` rejects it      | `formatZodErrors(result.error).join("; ")` |

Two non-fatal repairs still happen after a successful parse: a missing `name` warns and defaults to `path.basename(projectDir)`; a missing `skills` warns and defaults to `[]`.

Caller handling of `ConfigLoadError` is tabulated in `architecture-overview.md` section 17.

### 2.3 Direct YAML Parse + Zod safeParse (Production Call Sites)

| File                              | What Is Parsed                           | Schema Used                                                                                                             |
| --------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `matrix/matrix-loader.ts`         | `metadata.yaml` per skill                | `matrixRawMetadataSchema` (`lib/schemas.ts`; stricter than `skillMetadataLoaderSchema` — requires `author`, `category`) |
| `skills/skill-plugin-compiler.ts` | `metadata.yaml` for skill compilation    | `skillMetadataLoaderSchema`                                                                                             |
| `skills/skill-metadata.ts`        | `metadata.yaml` for local skill metadata | `localSkillMetadataSchema`                                                                                              |
| `skills/skill-metadata.ts`        | `metadata.yaml` for fork injection       | `localSkillMetadataSchema`                                                                                              |
| `source-validator.ts`             | `metadata.yaml` for strict validation    | `metadataValidationSchema` / `customMetadataValidationSchema`                                                           |
| `agents/agent-plugin-compiler.ts` | Agent `.md` frontmatter                  | `agentFrontmatterValidationSchema`                                                                                      |

### 2.4 JSON Parse Boundaries (Production)

Re-derive the roster rather than reading the rows — one grep answers it, and the list has gained
four sites and lost two since it was last written:

```
grep -rn 'JSON.parse(' src/cli --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude-dir=__tests__
```

| File                            | What Is Parsed                                       | Validation After Parse                                                                                            |
| ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `utils/exec.ts`                 | Claude CLI JSON stdout (`marketplace list --json`)   | `marketplaceInfoListSchema.safeParse()` (Zod; returns `[]` on failure)                                            |
| `plugins/plugin-finder.ts`      | `plugin.json` manifest                               | `pluginManifestSchema.parse()` (throws on failure)                                                                |
| `plugins/plugin-validator.ts`   | `plugin.json` for validation                         | `pluginManifestValidationSchema.safeParse()`                                                                      |
| `plugins/plugin-validator.ts`   | `plugin.json` as raw Record                          | Type assertion only (`loadManifestForValidation()`)                                                               |
| `plugins/plugin-settings.ts`    | `<pluginsDir>/installed_plugins.json` (registry)     | `installedPluginsSchema.safeParse()` — throws, see 2.6                                                            |
| `plugins/plugin-settings.ts`    | `.claude/settings.json`                              | `pluginSettingsSchema.safeParse()`                                                                                |
| `plugins/plugin-settings.ts`    | `~/.claude/plugins/installed_plugins.json`           | `installedPluginsSchema.safeParse()` — degrades to `[]`, see 2.6                                                  |
| `permission-checker.tsx`        | `.claude/settings.json` permissions block            | `settingsFileSchema.safeParse()`; a malformed file warns and is skipped                                           |
| `agents/agent-provenance.ts`    | this CLI's OWN `package.json`, for its version       | `ownPackageJsonSchema.safeParse()`; throws when it cannot be read                                                 |
| `configuration/config.ts`       | a source repo's `package.json`, for its `name`       | `packageIdentitySchema.safeParse()`; unparseable answers `null`                                                   |
| `commands/build/marketplace.ts` | the project `package.json`, for marketplace identity | `packageJsonSchema.safeParse()`; a parse failure exits with the cause                                             |
| `versioning.ts`                 | `plugin.json` for version check                      | `pluginManifestSchema.parse()`                                                                                    |
| `loading/source-fetcher.ts`     | `marketplace.json` from fetched source               | `validateNestingDepth()` + `marketplaceSchema.safeParse()`                                                        |
| `loading/source-fetcher.ts`     | the cached revalidation record                       | `parseJsonOrUndefined()` — a corrupt record re-fetches rather than failing                                        |
| `seed/read-piped-payload.ts`    | a `SeedPayload` off stdin                            | `installableSeedPayloadSchema.safeParse()` behind a `JsonRead` verdict — the WRITE schema, not the base one (1.5) |

`marketplace-generator.ts` and `schema-validator.ts` were rows here and are not parse sites: the
generator reaches `plugin.json` through `readPluginManifest()` in `plugins/plugin-finder.ts`, and
`schema-validator.ts` formats Zod issues and parses nothing. `config-gate/classify.ts` calls
`JSON.parse(JSON.stringify(config))` and is not a boundary either — it is a deep clone of a value
this process built.

### 2.5 File Size Enforcement

| Constant                    | Value  | File        | Used By                                                    |
| --------------------------- | ------ | ----------- | ---------------------------------------------------------- |
| `MAX_CONFIG_FILE_SIZE`      | 1 MB   | `consts.ts` | `permission-checker.tsx`, `plugin-settings.ts`             |
| `MAX_PLUGIN_FILE_SIZE`      | 1 MB   | `consts.ts` | `plugin-finder.ts`, `plugin-validator.ts`, `versioning.ts` |
| `MAX_MARKETPLACE_FILE_SIZE` | 10 MB  | `consts.ts` | `source-fetcher.ts`                                        |
| `MAX_JSON_NESTING_DEPTH`    | 10     | `consts.ts` | `source-fetcher.ts` (marketplace.json)                     |
| `MAX_MARKETPLACE_PLUGINS`   | 10,000 | `consts.ts` | `source-fetcher.ts` (`fetchMarketplace`)                   |

All enforced via `readFileSafe()` in `utils/fs.ts` which checks `stats.size` before reading.

### 2.6 Claude CLI Plugin Registry (`installed_plugins.json`)

The claude CLI (>= 2.1.220) records installs in `<pluginsDir>/installed_plugins.json` and lays plugins out under `cache/<marketplace>/<plugin>/<version>/` rather than as direct children of the plugins directory. Two readers with **deliberately different failure contracts** exist in `src/cli/lib/plugins/plugin-settings.ts`:

| Function                         | Path                                                   | On unreadable / schema-invalid registry                                | Consumers                         |
| -------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------- |
| `listRegisteredPluginInstalls()` | `getInstalledPluginsRegistryPath(pluginsDir)`          | **Throws** — the registry is the source of truth for what is installed | `lib/content-validator.ts`        |
| `resolvePluginInstallPaths()`    | `getInstalledPluginsRegistryPath(getUserPluginsDir())` | `verbose()` + returns `[]` (best-effort resolution)                    | `getVerifiedPluginInstallPaths()` |

Both use `readFileSafe(MAX_CONFIG_FILE_SIZE)` -> `JSON.parse()` -> `installedPluginsSchema.safeParse()`. `listRegisteredPluginInstalls()` flattens `plugins[key][]` to unique `(pluginKey, installPath)` pairs across all scopes; `resolvePluginInstallPaths()` picks one installation per key via `pickInstallation()` (this project's `scope: "project"` entry wins, else the `scope: "user"` entry).

**Fallback ladder for `doctor`'s plugins content check** (`validateRegistryPlugins()` in `src/cli/lib/content-validator.ts`, reached through `validateInstalledPlugins()`):

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

Every production site that passes it, and what each one wants a matrix for. Re-derive the membership
with
`grep -rn 'matrixOnly: true' src/cli --include='*.ts' --include='*.tsx' --exclude='*.test.ts'`; the
full caller roster including the sites that pass neither flag is
[skills-and-matrix.md § Call sites](./features/skills-and-matrix.md), and the two tables move
together:

| Caller                                                    | Options                                    | Purpose                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Compile.seatMatrixForPass()`                             | `skipExtraSources: true, matrixOnly: true` | Seat the `matrix` singleton for the pass AND return the catalogue, which `refreshConfigTypes()` is handed as a parameter while the render path reads the seat.       |
| `withCatalogueSeatedFor()` in `loading/catalogue-seat.ts` | `skipExtraSources: true, matrixOnly: true` | Seat ONE registered project's own catalogue for the duration of a fan-out body, then restore the caller's. Reached from `propagate.ts` and the propagated recompile. |
| `Uninstall.prepareGlobalPropagation()`                    | `skipExtraSources: true, matrixOnly: true` | Capture the pre-removal global data. The catalogue half reaches no reader — `propagateGlobalRemoval` passes only `deps.agents` on.                                   |
| `lazyGateDeps()` in `config-gate/index.ts`                | `skipExtraSources: true, matrixOnly: true` | Load the matrix a consequence tier needs, through the lazy `await import` that keeps lib off operations.                                                             |

Both combinations are byte-identical to the wizard's fully-tagged load for config-types purposes — neither the config-types writer nor the agent render path reads the extra-source annotations. Pinned by the `skipExtraSources` parity test in `src/cli/lib/installation/local-installer.test.ts`.

---

## 3. File System Write Boundaries (Data OUT)

### 3.1 Config Writer

`configuration/config-writer.ts` **writes nothing** — every export returns a string. The only code that puts either half of the global config pair on disk is `src/cli/lib/config-gate/` (see 3.4a).

| Function                                 | Declared in                              | Reached through                        | What It Writes   |
| ---------------------------------------- | ---------------------------------------- | -------------------------------------- | ---------------- |
| `generateConfigSource()`                 | `@workspace/compile/config-source`       | `configuration/config-writer.ts`       | Returns a string |
| `generateBlankGlobalConfigSource()`      | `@workspace/compile/config-source`       | `configuration/config-writer.ts`       | Returns a string |
| `generateBlankGlobalConfigTypesSource()` | `@workspace/compile/config-types-source` | `configuration/config-types-writer.ts` | Returns a string |
| `getGlobalConfigImportPath()`            | `configuration/config-writer.ts`         | itself                                 | Returns a path   |

**`config-writer.ts` declares exactly one function of its own** — `getGlobalConfigImportPath()`,
which is the one thing the shared package cannot hold, being derived from `os.homedir()`. Everything
else in it is a re-export, which is what puts the editor's output preview behind the same renderer
rather than a second copy of it.

The renderers strip undefined values with `JSON.parse(JSON.stringify(x))` before emitting TypeScript
source.

### 3.2 Config Types Writer

`configuration/config-types-writer.ts` is the surface every caller reads, and it declares nothing:
the renderers come from `@workspace/compile/config-types-source` and the disk half from
`configuration/config-types-io.ts`. The **Declared in** column is what a rename or a deletion would
move; the module column above it would not change.

| Function                             | Declared in                              | What It Writes                                                             | Where                                   |
| ------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------- |
| `writeGlobalTypesHalf()`             | `config-gate/pair-writer.ts`             | Standalone union types narrowed to the config (global path only)           | `~/.claude-src/config-types.ts`         |
| `regenerateConfigTypes()`            | `configuration/config-types-io.ts`       | Project config-types.ts; emits import-from-global when global exists       | `<project>/.claude-src/config-types.ts` |
| `generateConfigTypesSource()`        | `@workspace/compile/config-types-source` | Standalone union source string                                             | Returns string                          |
| `generateProjectConfigTypesSource()` | `@workspace/compile/config-types-source` | Project source extending global types via `import type`                    | Returns string                          |
| `buildConfigTypesBackgroundData()`   | `configuration/config-types-io.ts`       | (reads the matrix and the CLI's own sub-agent roster)                      | Returns `ConfigTypesBackgroundData`     |
| `getGlobalConfigTypesPath()`         | `configuration/config-types-io.ts`       | (reads, not writes)                                                        | `~/.claude-src/config-types.ts`         |
| `reconcileTypesFromDisk()`           | `config-gate/index.ts`                   | Scope-dispatching entry — applies the writer-selection rule from one place | Whichever scope's `config-types.ts`     |

**Writer Selection Rule:** Project path writes go through `regenerateConfigTypes()` — it detects an existing global install and emits `import type { SkillId as GlobalSkillId, ... } from "<relpath>/config-types"` instead of duplicating global unions. Global path writes go through `config-gate/pair-writer.ts`. The rule is enforced, not advised: `regenerateConfigTypes()` throws `GlobalPairWriteViolation` when handed the home directory, and the standalone renderer is private to `pair-writer.ts`.

`reconcileTypesFromDisk(projectDir, config, deps, opts?)` holds the dispatch: `isHomeDirectory(projectDir)` -> standalone half, otherwise import-and-extend. `commands/compile.ts` calls it once per compile pass, including the pass that found no installed skills — the persisted config, not the discovered skills, drives the unions. At `$HOME` it also fans the config out to every registered project and recompiles their agents, unconditionally: a hand-edited `config.ts` leaves no prior state to classify against.

### 3.3 Skill Copier

| Function                       | File                     | What It Writes                                    | Where                        |
| ------------------------------ | ------------------------ | ------------------------------------------------- | ---------------------------- |
| `copySkillsToLocalFlattened()` | `skills/skill-copier.ts` | Skill directories (SKILL.md, metadata.yaml, etc.) | `.claude/skills/<skill-id>/` |

Path traversal validation via `validateSkillPath()` in `skill-copier.ts` -- resolves paths and verifies they stay within the expected parent directory.

Function-level inventory and the copy layering (`copySkillTo`, `copySkill`, `copySkillFromSource`, and the two flattened branches that stamp no `forkedFrom` provenance): [skills/skill-primitives.md](./skills/skill-primitives.md).

### 3.4 Local Installer

**`local-installer.ts` touches no filesystem write boundary at all** — it imports no `fs` surface. It builds and merges configs (`buildAndMergeConfig`, `setConfigMetadata`, `buildCompileAgents`, `buildAgentScopeMap`) and hands them on; every scoped-config writer lives in `config-gate/`, and compiled agent markdown is written by `writeCompiledAgentsByScope()` (§3.5).

### 3.4a The config-gate — the only writer of the global pair

**Privileged zone:** `src/cli/lib/config-gate/**`, plus `configuration/config-types-io.ts` (which the gate drives, through the `config-types-writer.ts` barrel) and `utils/fs.ts` (which holds the tripwire). Nothing else in `src/` may write `~/.claude-src/config.ts` or `~/.claude-src/config-types.ts`.

| Function                                     | File                         | What It Writes                                                                                      | Where                                 |
| -------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `writeGlobalPair()`                          | `config-gate/pair-writer.ts` | Both halves from one config, each skipped when its bytes are unchanged                              | `~/.claude-src/`                      |
| `writeGlobalConfigHalf()`                    | `config-gate/pair-writer.ts` | The config half alone (scalar / registration mutations)                                             | `~/.claude-src/config.ts`             |
| `ensureBlankPair()`                          | `config-gate/pair-writer.ts` | Blank `config.ts` + `config-types.ts` when none exists                                              | `~/.claude-src/`                      |
| `writeScopedFromWizard()`                    | `config-gate/index.ts`       | Scoped config pairs (global + project), then propagates and recompiles                              | `.claude-src/` per scope              |
| `writeProjectConfigPair()`                   | `config-gate/propagate.ts`   | ONE project's `config.ts` + `config-types.ts` from the same effective config                        | `<project>/.claude-src/`              |
| `propagateGlobalChangesToProjects()`         | `config-gate/propagate.ts`   | Re-writes the pair for every registered project                                                     | each tracked project's `.claude-src/` |
| `pruneGlobalEntriesFromRegisteredProjects()` | `config-gate/propagate.ts`   | Same, with an EMPTIED global config so every inlined global row, tombstone and stack ref is dropped | each tracked project's `.claude-src/` |
| `writeProjectPartial()`                      | `config-gate/index.ts`       | A PROJECT `config.ts` from a `Partial<ProjectConfig>`; throws at `$HOME`                            | `<project>/.claude-src/config.ts`     |

**Enforcement (four layers):** (1) neither `installation/index.ts` nor `configuration/index.ts` re-exports a pair writer, and `configuration/config-saver.ts` is deleted; (2) eslint bans importing `config-gate/*` other than `index*` (statically and via `ImportExpression`), bans importing any `writeFile`-family symbol from `fs`/`node:fs`/`fs/promises`/`node:fs/promises`/`fs-extra` outside `utils/fs.ts`, and restricts the pair renderers to `config-gate/**` + `configuration/**`; (3) `utils/fs.ts::writeFile` resolves its target and calls `assertGateToken` when it is either pair path, throwing `GlobalPairWriteViolation`; (4) `src/cli/lib/__tests__/config-gate-enforcement.test.ts` pins the barrel deletions by name, exercises the real `writeFile` inside and outside `withGateToken`, asserts the three `$HOME` refusals, proves the private `pair-writer` refuses a caller that reached it by dynamic import, and source-scans `src/**` for any file holding both a write primitive and a pair reference. **Its spec count is owned by [config/config-writer.md](config/config-writer.md#enforcement--four-layers) and deliberately not restated here.**

**A clean lint run does not prove layer (2) still works.** A guard ESLint has quietly stopped understanding reports nothing, which looks exactly like a guard with nothing to report. Layers (1), (3) and (4) are all exercised by `config-gate-enforcement.test.ts`; layer (2) is **half** covered, and which half matters.

| Rule family in layer (2)                                           | Automated proof                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `no-restricted-syntax` — the vacuous-comparison selectors          | `src/cli/lib/__tests__/spec-gates.test.ts`, per zone, both directions |
| `no-restricted-imports` — private-module, raw-write, pair-renderer | **None.** Hand check on any ESLint major upgrade                      |
| `no-restricted-syntax` — the `config-gate/*` dynamic-import ban    | **None.** Hand check on any ESLint major upgrade                      |

`spec-gates.test.ts` loads the real `eslint.config.js` — it does not restate the selectors — and lints one real file per zone that configures `no-restricted-syntax` separately: `e2e/assertions/four-surfaces.ts` (the spec zone, which declares the rule for the task-ID bans and so keeps the selectors only by restating them), `src/cli/lib/content-validator.ts` (an ordinary type-checked CLI source, the zone that also carries the config-gate import bans) and `src/cli/lib/config-gate/index.ts`. **The third is there because every block above it excludes the gate directory, so the gate inherits no `no-restricted-syntax` at all and its block restates the selectors from scratch.** Each shape is asserted in both directions: the zone must report against the verdict written in the vacuous form, and must stay silent on the same verdict written in a form the code can falsify — without the second half, a zone ESLint could not parse would read as passing.

For the two uncovered families the check is still by hand: write a throwaway file that violates every guard at once, lint it, confirm each one fires, delete the file. The guard most exposed to a parser change is the `no-restricted-syntax` selector catching dynamic imports of `config-gate/*`, whose regex contains a unicode escape. **Run this check on any ESLint major upgrade**; the guards enforce real invariants and their silence is not evidence.

**`no-restricted-imports` and `no-restricted-syntax` both take options, and a rule's options are not merged across flat-config blocks — the last block naming it for a file owns all of them.** That is why each nested zone restates every restriction it still owes rather than inheriting it, and why a zone added below them inherits nothing by default. Read the zones off the config rather than counting them here — one of them was re-pointed from `config-types-writer.ts` to `config-types-io.ts` when the renderers moved into `@workspace/compile`:

````
grep -n 'files:' packages/cli/eslint.config.js
``` `packages/eslint-config/base.js`'s `no-self-compare` is the counter-example that makes the rule legible: it takes no options, so it merges, which is exactly why it could move to the shared base while these could not.

**Return-channel contract:** every gate entry returns a `GateReport { globalWritten, changes, propagated: { updated, skipped }, recompile }`. It is a **record of completed work**, not a to-do list: a write that propagates has already recompiled the propagated projects' agents. `skipped` is surfaced to the user by `commands/uninstall.tsx` and `commands/compile.ts` via `registeredProjectUpdateSkipped()`; `init.tsx` and `edit.tsx` render only the recompile summary.

**Ordering constraint:** `pruneGlobalEntriesFromRegisteredProjects()` must run **after** the global `.claude-src` manifest is deleted, so each project's regenerated `config-types.ts` falls back to the standalone form instead of importing from a now-missing global `config-types.ts`.

### 3.5 Compiler Agent Output

| Function                       | File                              | What It Writes                               | Where                                                                                                                          |
| ------------------------------ | --------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `compileAgentForPlugin()`      | `compiler.ts`                     | Compiled agent markdown via Liquid templates | Returns string (caller writes)                                                                                                 |
| `writeCompiledAgentsByScope()` | `agents/write-compiled-agents.ts` | The rendered agent markdown                  | `<name>.md` under the global or project agents dir, per `agentScopeMap`; skipped when the bytes already match (`holdsExactly`) |

Template root resolution in `createLiquidEngine()` in `compiler.ts`: checks local `.claude-src/agents/_templates/`, legacy `.claude/templates/`, then CLI built-in `DIRS.templates`.

### 3.6 Per-Skill Source Propagation

| Function               | File                              | Input                            | Output                                                                                                   |
| ---------------------- | --------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pluginRefFor()`       | `@workspace/compile/agent-source` | `Skill.source` (per-skill field) | a spreadable partial: `{ pluginRef }` holding `${id}:${id}` when non-eject/non-undefined, `{}` otherwise |
| `buildCompileAgents()` | `installation/local-installer.ts` | `SkillConfig.origin` per entry   | `SkillReference.source` carrying the same value                                                          |

**Contract:** `SkillConfig.origin` on each skill config entry is authoritative for that skill's install mode; the compile side reads the same value as `Skill.source`, which `buildCompileAgents` puts there. A skill renders a plugin reference (`${id}:${id}`) only when `skill.source` is defined and not `"eject"`. `undefined` (user-authored local skills, which have no `SkillConfig` entry) and `"eject"` both fall through to bare id. There is no agent-level `installMode` override.

### 3.7 Skill Metadata Injection

| Function                     | File                       | What It Writes                        | Where                   |
| ---------------------------- | -------------------------- | ------------------------------------- | ----------------------- |
| `injectForkedFromMetadata()` | `skills/skill-metadata.ts` | Updated metadata.yaml with forkedFrom | Skill's `metadata.yaml` |

### 3.8 Config-Semantics Boundary: Cross-Scope Reconciliation

A **write-time invariant boundary**, distinct from the schema boundaries above: it does not validate incoming bytes, it enforces that the config the CLI is about to emit is semantically coherent across scopes. Both project-config write paths must reconcile; with only one doing so, `doctor` reported clean and exited 0 — in both its layers — on a config carrying two live skills in an exclusive category.

| Property       | Value                                                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Location**   | `src/cli/lib/config-gate/propagate.ts`                                                                                                                                         |
| **Function**   | `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)` (gate-private)                                                                                        |
| **Direction**  | OUT (pre-write)                                                                                                                                                                |
| **Applied at** | `propagateGlobalChangesToProjects()` **and** the project branch of `writeScopedFromWizard()` — both, unconditionally, immediately before the shared `writeProjectConfigPair()` |
| **Invariant**  | A project's `config.ts` may not hold a live global entry that collides with what the project owns at project scope                                                             |

**Collision test** (`buildProjectCollisionTest()`, shared by the mask producer and the self-heal):

| Kind         | Applies to      | Condition                                                                                                                  |
| ------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **IDENTITY** | skills + agents | The project owns the same id/name at project scope                                                                         |
| **CATEGORY** | skills only     | The project owns a DIFFERENT active skill in the same category AND the **merged matrix** declares `exclusive: true` for it |

**Boundary contracts:**

- **Read the merged matrix, not `defaultCategories`** — `isExclusiveCategory()` honours a source repo's category overrides.
- **A category the matrix does not carry is NOT exclusive.** The wizard's toggle handler defaults the same absent-category lookup the other way (`matrix.categories[categoryId]?.exclusive ?? true` in `components/hooks/use-build-step-props.ts`); a rule that masks _persisted_ entries deliberately does not. Both defaults turn on an absent **category**, never on an absent **field** — `CategoryDefinition.exclusive` is a non-optional `boolean` at every producer and at both parse boundaries, so there is no such thing as a category that carries no flag.
- **Never throws on a custom skill.** `categoryOfSkill()` returns `undefined` for an id absent from the matrix or sitting in the `local` pseudo-category.
- **Global config is read-only here.** Masks are applied to the project split only — a tombstone is never written into `~/.claude-src/config.ts`.
- **Idempotent**, and self-healing: `dropOrphanedDerivedMasks()` / `dropOrphanedDerivedAgentMasks()` run BEFORE masking so a mask whose collision cleared is removed rather than re-derived.

### 3.9 Filesystem Delete Boundary (`uninstall`)

`src/cli/commands/uninstall.tsx` removes CLI-managed content. Everything it deletes is enumerated up-front by `detectUninstallTarget(projectDir)` and rendered by the shared pure builder `buildRemovalPlan(target)`, which both the `--yes` plain-text plan (`printRemovalPlan`) and the Ink `UninstallConfirm` component consume, so the two renderings stay byte-identical.

| Section header       | What is deleted                                                                                                                  | Matching rule                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Plugins:`           | `<pluginsDir>/<pluginName>` + `claude plugin uninstall`                                                                          | `getCliInstalledPluginKeys(config)` — `id@source` and the `id@marketplace` variant |
| `CLI-managed files:` | `<skillsDir>/<dir>` where `metadata.yaml` carries `forkedFrom`; `<agentsDir>/<name>.md` where the basename is in `config.agents` | `readForkedFromMetadata()`; `listAgentMdFiles()`                                   |
| `Config:`            | `.claude-src/config.ts`, `.claude-src/config-types.ts`                                                                           | **Unconditional** — no flag gates it                                               |

**Deletion contracts:**

- `.claude-src/` itself is removed only once empty (`removeDirIfEmpty`); user-owned content there (e.g. ejected templates) keeps it alive. `.claude/` follows the same rule and reports "Kept `.claude/` (contains user content)" otherwise.
- A skill directory without a `forkedFrom` marker is **skipped with a warning** — user-created content is never deleted.
- Plugin uninstall derives its scope per skill (`toClaudePluginScope(skillConfig?.scope)`) and goes through `claudePluginUninstallBestEffort()`, which tries the fallback scope too.
- **A project uninstall always deregisters** itself from the global `projects[]` registry (`mutateGlobal({ kind: "deregister-project" })`). A failure there — missing, project-less, or `ConfigLoadError`-corrupt global config — **warns and continues**; it may never fail the uninstall.
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

| Property         | Value                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Location**     | `src/cli/lib/configuration/config.ts`                                                                                  |
| **Entry points** | `resolveSource()`, `resolvePrimarySourceEntry()`                                                                       |
| **Applied to**   | `init --marketplace` flag, `CC_MARKETPLACE` env var (`SOURCE_ENV_VAR` in `config.ts`), config file `marketplace` field |

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

| Property     | Value                                                 |
| ------------ | ----------------------------------------------------- |
| **Location** | `packages/compile/src/agent-source.ts`                |
| **Function** | `sanitizeCompiledAgentData()`                         |
| **Pattern**  | `LIQUID_SYNTAX_PATTERN`: `\{\{ \| \}\} \| \{% \| %\}` |

**This boundary is no longer inside `packages/cli`.** `src/cli/lib/compiler.ts` re-exports
`sanitizeCompiledAgentData` and `sanitizeLiquidSyntax` so every CLI caller reads them where it
always did, but the declaration and the pattern are in the shared package — which is also what puts
the editor's output preview behind the same sanitizer rather than a second copy of it.

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

### 5.7 Terminal Control Characters in Foreign Text OUT

| Property     | Value                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| **Location** | `src/cli/utils/string.ts`                                                |
| **Function** | `stripTerminalControls()`, and `truncateText()` which calls it first     |
| **Applied to** | Any text this CLI did not author, on its way to a terminal             |

**5.1's `CONTROL_CHAR_PATTERN` is the other direction and does not cover this.** That one refuses a
control character in a source string on its way INTO `spawn()`; this one strips control characters
out of foreign text on its way OUT to a screen. A refusal is right for an argument, because the CLI
chooses whether to run the command at all; it is wrong for a message, because refusing to print an
honest multi-line zod refusal is worse than printing it inert.

**Three chokepoints, and nothing renders foreign text past them:**

| Chokepoint              | File                       | What it holds                                                            |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------ |
| `truncateText`          | `utils/string.ts`          | Foreign text that also needs a bound — strips BEFORE it measures         |
| `getErrorMessage`       | `utils/errors.ts`          | Every catch block, because a parser writes its input into what it throws |
| `formatZodIssue`        | `lib/schema-validator.ts`  | Every Zod reporter — the path, the unrecognised keys, and the message    |

`formatZodIssue` earns its place because every part of the sentence it builds comes out of the
REFUSED DOCUMENT rather than out of the schema: a path segment and an unrecognised key are keys the
document chose, and the message quotes the value it received. It sanitises at the renderer rather
than at its callers, of which there are around twenty and a new one is a normal thing to add.

**Stripping before truncating is a correctness requirement.** A cut taken first can land inside an
escape sequence, and the fragment it leaves is one a terminal holds open — reading the ellipsis and
whatever the caller prints next as the missing parameters. `truncateText` owns the order precisely
because there is a wrong way round to do it.

**Newline and tab survive; carriage return does not.** The permitted cases are the point: a
multi-line zod message is what the store really writes on the share route, and a sanitiser strict
enough to flatten it mangles every honest refusal to stop a rare hostile one. Carriage return alone
returns the cursor to column zero and lets what follows overwrite the line the CLI just printed in
its own voice, which is the reproduction this exists for.

**The reachable route is a supported input rather than an attack**: `--marketplace` takes a
stranger's repository, and an unsanitised `displayName` carrying an erase-line and a carriage return
repaints a `search` row — `@oclif/table` sizes the column on the escape bytes as well, so the border
moves too. `toResultRow` in `src/cli/commands/search.ts` sanitises all five cells, and its `id` and
`category` fields are typed `string` rather than `SkillId` / `CategoryPath` for that reason: a
sanitised value is no longer known to be in either union.

This is the CLI half of a threat the editor settles differently, by rendering the same foreign text
through a React-escaped `<pre>`.

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

Fetch and cache mechanics behind this boundary (the local/remote fork, the cache key, giget replication): [features/source-fetch-and-cache.md](./features/source-fetch-and-cache.md).

### 6.5 Shared Seed Config Fetch (`init --from`, `edit --from`)

| Property       | Value                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Location**   | `src/cli/lib/seed/fetch-seed.ts`                                                                                                                                      |
| **Direction**  | IN, and OUT into the terminal on a refusal — see below                                                                                                                |
| **Data**       | JSON seed payload from `AGENTS_INC_API_URL` (default `https://api.agentsinc.sh`); `fetchSeedConfig` is called from `commands/init.tsx` and `commands/edit.tsx`         |
| **Validation** | `seedPayloadSchema.safeParse()` — version-pinned (`z.literal(SEED_VERSION)`), unknown keys stripped                                                                   |
| **Mechanism**  | The typed worker client `createApiClient` from `@workspace/api`, built once at module scope with `credentials: "omit"`; never throws — every failure is returned as a message (`FetchSeedResult` union) |

**A refused read is quoted back into the terminal, which makes this an OUT boundary as well as an
IN one.** On any non-2xx but 404, `refusalMessage` reads the response body and repeats it after the
status. Three things bound what a remote body can put on a user's screen, and one status never
reaches the arm at all:

- **`arrivedAsText`** — the body is read at all only where `content-type` starts with `QUOTABLE_TYPE`
  (`text/plain`), which is the shape the worker's `getConfig` writes every one of its own refusals
  in. Anything else came from a proxy, a WAF, a captive portal or a gateway answering in the store's
  place, and its answer is markup rather than prose.
- **`EXPLANATION_BUDGET`** — `120` characters, clipped by `truncateText`.
- **Attribution** — what survives is printed as `The store said: …`, never in the CLI's own voice.
- **404 never reaches the arm.** It is held out ahead of it under `NO_SUCH_CONFIG`, because the CLI's
  own sentence names the id the caller typed and the store's (`No config under this id`) does not.

**A content-type header is not proof of provenance** — a hostile or interposed answer may claim any
type it likes — so the budget and the attribution are the actual containment, not the check.

The outbound half of the same boundary (`publish-seed.ts`, `POST /configs`) reads **two** shapes
rather than one, because that route answers in two: the validator's envelope as `application/json`,
matched by `refusalSchema` and read a second level in for the issues Zod rendered into its `message`
field, and the worker's own sentences as `text/plain`, gated by that module's own `arrivedAsText`. A
gate on the content type alone would throw the envelope away, and a gate on the shape alone would
throw the prose away. Its budget is its own — `EXPLANATION_BUDGET` is `300` there — because a budget
measures a ROUTE and neither number travels between them. It carries one bound the inbound half does
not: **`restatesItsOwnStatus`**, which drops a `text/plain` body equal to `STATUS_CODES[status]`
case-insensitively, so a refusal that only re-says its own reason phrase adds nothing to the number
printed beside it. And 409 answers in the CLI's own words without reading a body at all.

The wire contract, the version-discard policy and the payload -> `WizardResultV2` mapping: [features/seed-contract.md](./features/seed-contract.md).

### 6.6 Marketplace Generation

| Function                                        | File                       | Direction                                           |
| ----------------------------------------------- | -------------------------- | --------------------------------------------------- |
| `readPluginManifest()`                          | `plugins/plugin-finder.ts` | IN (reads plugin manifests to generate marketplace) |
| (output written by `build marketplace` command) |                            | OUT (writes `marketplace.json`)                     |

---

## 7. Schema Reference

**These three tables are the boundary-relevant subset, not the roster.**
[types/zod-schemas.md](./types/zod-schemas.md) owns every schema in `src/cli/lib/schemas.ts` and the
count; the building blocks that compose into the schemas below — the hook records, `pluginAuthorSchema`,
`sourceRevalidationSchema` — are there and deliberately not here.

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
| `stacksConfigSchema`           | `schemas.ts`                 | `config/stacks.ts`                   |
| `skillCategoriesFileSchema`    | `schemas.ts`                 | `config/skill-categories.ts`         |
| `skillRulesFileSchema`         | `schemas.ts`                 | `config/skill-rules.ts`              |
| `agentYamlConfigSchema`        | `schemas.ts`                 | Agent YAML definition                |

### Strict Schemas (Validation Boundaries)

Used for validation commands and build-time checks. Reject unknown fields via `.strict()`.

| Schema                             | File         | Used For                                   |
| ---------------------------------- | ------------ | ------------------------------------------ |
| `pluginManifestValidationSchema`   | `schemas.ts` | `agents-inc doctor` plugin validation      |
| `skillFrontmatterValidationSchema` | `schemas.ts` | SKILL.md strict validation                 |
| `agentFrontmatterValidationSchema` | `schemas.ts` | Agent frontmatter strict validation        |
| `metadataValidationSchema`         | `schemas.ts` | Published skill metadata strict validation |
| `customMetadataValidationSchema`   | `schemas.ts` | Custom skill metadata validation           |
| `agentYamlGenerationSchema`        | `schemas.ts` | Source agent `metadata.yaml` validation    |
| `stackConfigValidationSchema`      | `schemas.ts` | Published stack config validation          |

### Utility Schemas (Shared Building Blocks)

| Schema                   | File         | Used In                                                                                                  |
| ------------------------ | ------------ | -------------------------------------------------------------------------------------------------------- |
| `skillSlugSchema`        | `schemas.ts` | `z.enum(SKILL_SLUGS)` over the generated array                                                           |
| `categoryPathSchema`     | `schemas.ts` | Known category, "local", or kebab-case                                                                   |
| `modelNameSchema`        | `schemas.ts` | `z.enum(MODEL_NAMES)` — five members, see [features/model-and-effort.md](./features/model-and-effort.md) |
| `effortLevelSchema`      | `schemas.ts` | `z.enum(EFFORT_NAMES)`                                                                                   |
| `permissionModeSchema`   | `schemas.ts` | `z.enum(PERMISSION_MODES)`                                                                               |
| `skillAssignmentSchema`  | `schemas.ts` | Skill assignment objects                                                                                 |
| `stackAgentConfigSchema` | `schemas.ts` | Per-agent stack categories                                                                               |

**`SkillId`, `Domain`, `Category` and `AgentName` have no schema of their own.** `schemas.ts`
imports exactly two generated union arrays — `SKILL_SLUGS` and `CATEGORIES` — and every other union
crosses this boundary as an inline `z.string() as z.ZodType<...>` cast inside the object schema that
consumes it. Reasoning and the full inventory are in
[types/zod-schemas.md](./types/zod-schemas.md), which owns the schema roster.

````

grep -n 'as z.ZodType<\(SkillId\|Domain\|Category\|AgentName\)>' src/cli/lib/schemas.ts

```

### Helper Functions

| Function                          | File                  | Purpose                                                                                                                           |
| --------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `formatZodErrors()`               | `schema-validator.ts` | Format Zod issues to string array                                                                                                 |
| `formatZodIssue()`                | `schema-validator.ts` | Render one Zod issue path-first, **with every part of the sentence through `stripTerminalControls`** — see [5.7](#57-terminal-control-characters-in-foreign-text-out) |
| `formatZodIssues()`               | `schemas.ts`          | Join formatted issues into one `"; "`-separated string                                                                            |
| `validateSkillMetadata()`         | `schemas.ts`          | Selects `customMetadataValidationSchema` vs `metadataValidationSchema` via `isCustomMetadata()` — the one place that policy lives |
| `splitMetadataValidationIssues()` | `schemas.ts`          | Splits strict-metadata issues into hard `errors` and advisory `warnings`                                                          |
| `isCustomMetadata()`              | `schemas.ts`          | True for custom (non-marketplace) skill metadata                                                                                  |
| `validateNestingDepth()`          | `schemas.ts`          | Check JSON nesting depth                                                                                                          |
| `warnUnknownFields()`             | `schemas.ts`          | Log warnings for unexpected fields                                                                                                |

**Advisory-vs-hard metadata split:** an over-length `cliDescription` is the **only** advisory violation. `skillMetadataBaseSchema` (shared by `metadataValidationSchema` and `customMetadataValidationSchema`) keeps `.min(1).max(CLI_DESCRIPTION_MAX_LENGTH)` — 60, module-private in `schemas.ts` — as the declared contract. But the runtime loader schemas accept any length and the value only feeds wizard description text, so `splitMetadataValidationIssues()` in `schemas.ts` — the splitter `doctor`'s skills content check and `validateSource()` both call — reports the `too_big` issue as a warning carrying the actual character count. `isOverLengthCliDescription()` matches on `code === "too_big"` at path `["cliDescription"]` exactly; an **empty** `cliDescription` trips `min(1)` and stays an error, as does every other issue. A skill is `valid` iff the hard-error list is empty.

**Skill-directory-name rule:** `checkDirNameMatchesSkillId()` in `source-validator.ts` compares the directory name against the skill's **machine id from `SKILL.md` frontmatter**, not against `displayName`. It runs independently of whether `metadata.yaml` validated, and an unreadable/invalid `SKILL.md` frontmatter yields a "Cannot verify directory name" issue rather than a false mismatch.

**Parse-failure causes are reported inconsistently across `source-validator.ts` phases.** Two of its `catch` blocks bound the error and discarded it; both now interpolate `getErrorMessage(error)`:

| Phase                                       | Message                                                           | Carries cause? |
| ------------------------------------------- | ----------------------------------------------------------------- | -------------- |
| `metadata.yaml` parse (skills phase 2)      | `Failed to parse YAML: <cause>`                                   | Yes            |
| Cross-reference load (categories/rules)     | `Cross-reference validation skipped: failed to load ...: <cause>` | Yes            |
| `validateYamlFiles()` (config/stacks files) | `Failed to parse YAML`                                            | **No**         |

`validateYamlFiles` uses a bare `catch {`, so it binds nothing and a linter cannot see it — which is why it falls outside the pass that fixed the other two. **Known gap, recorded not fixed.** The consequence at this boundary: an invalid `config/stacks.ts` or `config/skill-categories.ts` reports only the failure category, while an invalid `metadata.yaml` reports the YAML parser's line and column. Do not read "Failed to parse YAML" as a uniform contract.

---

## 8. Boundary Pattern Summary

### Data IN: Validation Chain

All data entering the system follows one of these validated paths:

```

CLI flags --> oclif type checking --> downstream semantic validation (validateSourceFormat)
YAML files --> readFileSafe(sizeLimit) --> parseYaml() --> schema.safeParse()
JSON files --> readFileSafe(sizeLimit) --> JSON.parse() --> schema.safeParse() or schema.parse()
TS configs --> fileExists() --> jiti.import() --> optional schema.safeParse()
(project config: missing => null; present-but-broken => throw ConfigLoadError)
Plugin registry --> readFileSafe(MAX_CONFIG_FILE_SIZE) --> JSON.parse() --> installedPluginsSchema.safeParse()
(listRegisteredPluginInstalls THROWS on invalid; resolvePluginInstallPaths degrades to [])
Shell output --> JSON.parse(stdout) --> marketplaceInfoListSchema.safeParse() (Zod)

```

### Data OUT: Generation Chain

```

Project config --> reconcileProjectSplitAgainstGlobal() (self-heal masks, then mask collisions)
--> writeProjectConfigPair() --> JSON.parse(JSON.stringify(x)) to strip undefined
--> generateConfigSource() --> writeFile()
Global pair --> config-gate/index.ts entry opens withGateToken(...) around the whole flow
--> classifyGlobalChange() (tier T1..T4) --> writeIfChanged() --> writeFile()
--> propagateGlobalChangesToProjects() --> recompilePropagated() [T1]
Config types --> reconcileTypesFromDisk
--> {pair-writer.renderStandaloneTypes | regenerateConfigTypes} --> writeFile()
Agent data --> sanitizeCompiledAgentData() --> Liquid template rendering --> writeFile()
Skill files --> validateSkillPath() (traversal check) --> copy()
Shell commands --> validate{PluginPath|PluginName|MarketplaceSource}() --> spawn() with args array
Deletions --> detectUninstallTarget() --> buildRemovalPlan() --> confirm --> remove() + removeDirIfEmpty()

```

### Shell-Output Boundaries (Now Zod-Validated)

| Location                                     | Handling                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claudePluginMarketplaceList()` in `exec.ts` | JSON.parse of Claude CLI stdout, then `marketplaceInfoListSchema.safeParse()` (`z.ZodType<MarketplaceInfo[]>`); returns `[]` and warns on failure |

The prior gap (only `Array.isArray()`, no schema) is closed — the Claude CLI marketplace-list output is now validated per-element by a Zod array schema. This boundary is low-risk regardless since the data comes from the locally-installed Claude CLI binary (trusted source), not from user or network input.
```
