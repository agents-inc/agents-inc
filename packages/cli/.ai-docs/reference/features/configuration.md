---
scope: reference
area: config
keywords:
  [
    config-resolution,
    config-writer,
    scope-splitting,
    config-merger,
    global-config,
    project-config,
    tombstone,
    excluded,
  ]
related:
  - reference/architecture-overview.md
  - reference/type-system.md
  - reference/wizard/state-transitions.md
  - reference/boundary-map.md
  - reference/config/scope-split.md
  - reference/config/config-writer.md
  - reference/config/config-merger.md
last_validated: 2026-07-30
---

# Configuration System

## Overview

**Purpose:** Manage project configuration, source resolution, and config persistence.

**Location:** `src/cli/lib/configuration/`

## Files

| File                     | Path                                               | Purpose                                                                                                    |
| ------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `config.ts`              | `src/cli/lib/configuration/config.ts`              | Source resolution, project source config I/O                                                               |
| `config-generator.ts`    | `src/cli/lib/configuration/config-generator.ts`    | Generate ProjectConfig from wizard, scope split                                                            |
| `config-merger.ts`       | `src/cli/lib/configuration/config-merger.ts`       | Merge wizard result with existing                                                                          |
| `config-writer.ts`       | `src/cli/lib/configuration/config-writer.ts`       | Generate TypeScript config source strings                                                                  |
| `config-types-writer.ts` | `src/cli/lib/configuration/config-types-writer.ts` | Generate config-types.ts type files                                                                        |
| `config-loader.ts`       | `src/cli/lib/configuration/config-loader.ts`       | Load TypeScript config via jiti                                                                            |
| `project-config.ts`      | `src/cli/lib/configuration/project-config.ts`      | Load and validate project config                                                                           |
| `scope-predicates.ts`    | `src/cli/lib/configuration/scope-predicates.ts`    | Shared scope/tombstone predicates (see below)                                                              |
| `define-config.ts`       | `src/cli/lib/configuration/define-config.ts`       | Type-safe `defineConfig()` helper                                                                          |
| `default-categories.ts`  | `src/cli/lib/configuration/default-categories.ts`  | Built-in category definitions — count in [skills-and-matrix.md](./skills-and-matrix.md) ("Current Counts") |
| `default-rules.ts`       | `src/cli/lib/configuration/default-rules.ts`       | Default skill rule definitions — see [built-in-catalogue.md](./built-in-catalogue.md)                      |
| `default-stacks.ts`      | `src/cli/lib/configuration/default-stacks.ts`      | Default stack definitions — see [built-in-catalogue.md](./built-in-catalogue.md)                           |
| `index.ts`               | `src/cli/lib/configuration/index.ts`               | Barrel exports                                                                                             |

**Barrel surface (`index.ts`)** — value exports only, grouped by the module each re-export block names, exhaustively and in source order: `DEFAULT_SOURCE`, `SOURCE_ENV_VAR`, `getProjectConfigPath`, `loadProjectSourceConfig`, `loadGlobalSourceConfig`, `resolveSource`, `resolveAuthor`, `resolveBranding`, `resolvePrimarySourceEntry`, `isDefaultSource`, `isLocalSource`, `isPublicCatalogueCheckout`, `offersBuiltInStacks`, `validateSourceFormat` (from `config.ts`); `generateProjectConfigFromSkills`, `buildStackProperty` (`config-generator.ts`); `mergeConfigs`, `mergeWithExistingConfig` (`config-merger.ts`); `isActiveAt`, `isGlobalTombstone`, `isProjectOwned`, `activeProjectAgentNames`, `effectivelyExcludedSkillIds` (`scope-predicates.ts`); **`ConfigLoadError`**, `configDirsInPlay`, `findConfigLoadFailures`, `loadProjectConfig`, `loadProjectConfigFromDir`, `validateProjectConfig` (`project-config.ts`); `defineConfig`; `defaultCategories`; `defaultRules`; `defaultStacks`; **`ConfigDefaultExportError`**, `loadConfig` (`config-loader.ts`); `generateProjectConfigTypesSource`, `getGlobalConfigTypesPath` (`config-types-writer.ts`).

`ConfigSchemaError` is the sibling of `ConfigDefaultExportError` and is **not** on the barrel — `configuration/config.ts` imports it by path.

**Deliberately NOT on the barrel:** `generateConfigSource`, `generateConfigTypesSource` and `regenerateConfigTypes`. They render (or render-and-write) a config pair half, and a barrel re-export would hand every command a supported way around the config-gate. They stay importable from their own modules by `config-gate/**` and `configuration/**`, eslint-enforced.

Type exports from the barrel: `BrandingConfig`, `SourceEntry`, `ResolvedConfig`, `ResolveSourceRequest`, `ResolvedBranding`, `SourceCaller`, `ProjectConfigOptions`, `MergeContext`, `MergeResult`, `AuthoritativeScope`, `LoadedProjectConfig`, `ConfigTypesBackgroundData`.

`splitConfigByScope`, `scopeEligibilityKey`, `isScopePairCompatible`, `SplitConfigResult`, `activeSkillScopeMap`, `activeAgentScopeMap`, `ScopedEntry`, `generateBlankGlobalConfigSource`, `generateBlankGlobalConfigTypesSource` and `getGlobalConfigImportPath` are exported from their own modules but NOT re-exported by the barrel — import them by path.

`writePartialProjectConfig` and `ensureBlankGlobalConfig` are **gone**, along with `config-saver.ts`. Their replacements — `writeProjectPartial`, `ensureBlankPair`, `mutateGlobal` — live in `src/cli/lib/config-gate/index.ts`.

## Config File Locations

| File                 | Path                            | Purpose                                      |
| -------------------- | ------------------------------- | -------------------------------------------- |
| Project config       | `.claude-src/config.ts`         | Skills, agents, stack, marketplace, branding |
| Project config types | `.claude-src/config-types.ts`   | Auto-generated type unions for config        |
| Global config        | `~/.claude-src/config.ts`       | Global-scope skills, agents, stack           |
| Global config types  | `~/.claude-src/config-types.ts` | Auto-generated global type unions            |

Config uses a unified `ProjectConfig` type for both marketplace-level settings (`marketplace`, `marketplaceName`, `agentsSource`, `branding`, the five directory overrides) and installation settings (`skills`, `agents`, `stack`, `selectedDomains`). Files are TypeScript (loaded via jiti), not YAML.

## Config Load Outcomes — Three States, Not Two

**File:** `src/cli/lib/configuration/project-config.ts`

`loadProjectConfigFromDir(projectDir)` distinguishes THREE outcomes. **Do not collapse the last two into `null`:** a corrupt `.claude-src/config.ts` then reads as "no config", `compile` treats the project as config-less, and every built-in agent is rebuilt.

| On disk                                                           | Outcome                                          | Signal                                                |
| ----------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| No file at `<dir>/.claude-src/config.ts`                          | `null`                                           | `verbose("Project config not found at ...")`          |
| File loads, exports an object, passes `projectConfigLoaderSchema` | `LoadedProjectConfig` (`{ config, configPath }`) | —                                                     |
| `loadConfig()` throws (syntax/evaluation error)                   | **throws `ConfigLoadError`**                     | `reason` = `getErrorMessage(error)`                   |
| Loaded value is falsy or not an object (no usable default export) | **throws `ConfigLoadError`**                     | `reason` = `"the file has no valid default export"`   |
| `projectConfigLoaderSchema.safeParse` fails                       | **throws `ConfigLoadError`**                     | `reason` = `formatZodErrors(result.error).join("; ")` |

**`ConfigLoadError`** (exported from `project-config.ts` and re-exported by `src/cli/lib/configuration/index.ts`) carries `configPath` and `reason` as readonly fields; its message is `` `Config at '${configPath}' could not be loaded: ${reason}` ``.

### The layer below: `loadConfig` and its two named errors

**File:** `src/cli/lib/configuration/config-loader.ts`

`loadConfig(configPath, schema?)` is the generic jiti loader both config readers sit on. It
distinguishes five outcomes, and **two of them are named error classes that exist so a caller can
tell "this file is broken" apart from "this file said something wrong":**

| Situation                                                      | Outcome                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| File absent                                                    | `null` (+ `verbose`)                                               |
| jiti cannot evaluate the module                                | plain `Error`, `cause` set                                         |
| Evaluated, but exports nothing (empty file, `export {}`, `{}`) | `null` (+ `verbose`) — asked BEFORE the next row                   |
| Evaluated, is an ES module, exports bindings but no `default`  | **`ConfigDefaultExportError`**                                     |
| Parsed, but `schema.safeParse` fails                           | **`ConfigSchemaError`** carrying `configPath` + formatted `issues` |

`declaresNoDefaultExport` keys on the `__esModule` marker jiti stamps on a transpiled ES module,
which is the only thing separating `export const x = {}` (a namespace whose keys are named exports)
from `module.exports = { x: {} }` (whose keys ARE the default export) — both arrive as a plain
object with no `default` key. The empty check runs first because such a file declares no exports of
any kind to have opinions about.

The two classes fault different lines of the file, which is why they are not one. A refused SHAPE
names a field the author can go and correct; a module that exports `export const skillRules = {...}`
has nothing wrong with its contents at all, and validating the module NAMESPACE against the schema
is what once told such an author a field was missing from a file they could see it in.

### `loadSourceConfig` raises every load failure — only a MISSING file is `null`

`loadSourceConfig(dir, scope)` (private in `configuration/config.ts`, reached via
`loadProjectSourceConfig` / `loadGlobalSourceConfig`) answers `null` for exactly two states: no file
on disk, and a file that evaluated and declared nothing. **Every way of failing raises** (owner
ruling 2026-08-20). Its `catch` — factored out as `readSourceConfigOrRefuse` — hands on a
self-describing refusal as itself and wraps everything else:

```ts
if (describesItsOwnFault(error)) throw error;
throw unreadableSourceConfig(error);
```

`describesItsOwnFault` admits `ConfigSchemaError` and `ConfigDefaultExportError` — the two that
fault a LINE the author can go and correct, so re-wording them would lose information.
`unreadableSourceConfig` covers the third state, a file that could not be evaluated at all: it
passes `loadConfig`'s own message (which already names the file and the parser's reason, with line
and column) to `configUnreadableError` in `utils/messages.ts`, so a `search` on a broken config
prints the same refusal and the same way out that `ensureConfigReadable` prints for the sibling
loader of the same file.

The third state used to return `null`, and `resolveSource` reads the return value alone — so a run
walked past that rung to `DEFAULT_SOURCE` and installed from a marketplace nobody named while a
config naming a private one sat unread on disk. `compile` never showed it because
`detectInstallation` refuses first; the commands that run no detection and no `ensureConfigReadable`
did, `search` among them. **Do not restore a `return null` in that catch**, and do not add a fourth
reader of this file without giving it the same posture —
`src/cli/lib/configuration/__tests__/config-readers-agree.test.ts` holds all four to the contract
and asserts the roster, so a fifth reddens it.

**Every call site chose abort or degrade**, and each says which in a comment where it stands:

| Call site                                                     | Posture                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `loadSkillsMatrixFromSource` (`loading/source-loader.ts`)     | ABORT — the marketplace every returned skill resolves against                           |
| `loadAndMergeFromBasePath` (`loading/source-loader.ts`)       | ABORT — the marketplace's own `skillsDir` / `stacksFile`                                |
| `fetchAgentDefinitionsFromRemote` (`agents/agent-fetcher.ts`) | ABORT — the fetched repository's `agentsDir`                                            |
| `isSourceRepo` (`source-validator.ts`)                        | ABORT, caught — `doctor`'s `safeCheck`; its other caller asks only where no file exists |
| `validateSource` (`source-validator.ts`)                      | ABORT, caught — `validateOneSource` turns it into an issue against that marketplace     |
| `validateRegisteredSources` (`content-validator.ts`)          | **DEGRADE** — `readsConfig: true` stands the row down; `safeCheck` backstops            |
| `resolveAndLogSource` (`commands/compile.ts`)                 | ABORT, unreachable — `detectInstallation` refuses the same file first                   |
| `ensureMinimalConfig` (`commands/eject.ts`)                   | ABORT on the global half; the project half is unreachable behind a `fileExists` guard   |
| `recordSource` (`commands/eject.ts`)                          | ABORT — see the note below                                                              |
| `mergeWithExistingConfig` (`configuration/config-merger.ts`)  | ABORT, unreachable — `loadProjectConfig` reads the same file and throws first           |

`recordSource` is the site the posture cost something real. It reads the existing config, overlays
one scalar and hands the partial to `writeProjectPartial`. The `?? {}` on that read is still there
and is correct — it is the fallback for a config that is not THERE, and the loader's raise is what
keeps it from ever seeing one that is. **Were the loader to answer `null` for an unreadable file,
that same `?? {}` would hand the writer an empty partial**, and a scalar-sized change would replace
the user's whole `config.ts` with a two-field one under an invented name and report success. It is the only read-then-write site among the
five `writeProjectPartial` / `mutateGlobal` callers; pinned by
`src/cli/lib/config-gate/__tests__/write-project-partial.test.ts`, which asserts both the refusal
and that the file on disk is unchanged, beside the empty-file control that still recovers.

`loadProjectSourceConfig` derives the scope label rather than assuming it: at the home root the file
it reads IS the global config, and a caller asking a project question there — `doctor` deciding
whether the cwd is a marketplace repository — must not be told a project config was found where none
exists. `loadOwnProjectSourceConfig` (private) goes further and returns `null` outright at the home
root, so `loadEffectiveSourceConfig` cannot label one file both `origin: "project"` and
`origin: "global"` in the same run.

### A fourth state one layer up — the config that loads and declares nothing

`detectInstallationInDir` (`installation/installation.ts`) adds a `null` of its own on top of the three above: a config that loads cleanly and declares neither skills nor agents is **content-less** and is not an installation, so `init` routes to the setup wizard instead of the dashboard. The predicate is `declaresNoContent(config)`, exported for exactly one reason — `doctor` has to ask the same question, and two surfaces answering it differently is what put `1 config validated` and `.claude-src/config.ts not found` on one screen four lines apart.

**A caller that maps a config to `null` for a reason of its own owes its consumers the reason alongside the `null`.** `detectInstallation` answers "is there an installation here", not "is there a config here"; a reporting surface that reads its `null` as the second question prints a falsehood every time the two answers differ. `doctor` therefore re-asks `loadProjectConfigFromDir(cwd)` when detection says no, and reports three distinct rows:

| State                                   | `Config Valid` row                                                    | Status |
| --------------------------------------- | --------------------------------------------------------------------- | ------ |
| No config in the cwd                    | `.claude-src/config.ts not found`                                     | fail   |
| Loads, declares no skills and no agents | `.claude-src/config.ts is valid but declares no skills and no agents` | warn   |
| Loads with content                      | `.claude-src/config.ts is valid`                                      | pass   |

The middle row is a **warning, not an error**: the file is valid and nothing needs repairing. `init` writes exactly that shape as the blank global pair (`ensureBlankPair` → `generateBlankGlobalConfigSource`) on every project setup, so the state has a legitimate producer; `init` also refuses to create one as a _project_ config, hard-erroring on a selection with no skills and no agents. An unreadable config never reaches this row — the content layer reports it and the operational layer is skipped. Pinned by `e2e/commands/doctor-corrupt-config.e2e.test.ts`.

Two lenient repairs happen only on the success path, both with a `warn()`: a missing `name` defaults to `path.basename(projectDir)`, and a missing `skills` array defaults to `[]`. `agents` is NOT defaulted by the loader.

### Who handles the throw

| Caller                                                                                         | Behaviour on `ConfigLoadError`                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `ensureConfigReadable` (`src/cli/base-command.ts`, run by `edit` + `init` as their first step) | Catches, hard-errors with `configUnreadableError(error.message)` before anything renders           |
| `compile` (`src/cli/commands/compile.ts` → `detectInstallations`)                              | Catches, hard-errors with `this.error(error.message, { exit: EXIT_CODES.ERROR })` before any write |
| `detectProject` (`src/cli/lib/operations/project/detect-project.ts`)                           | Catches, returns `null` so `doctor` reports a config problem instead of crashing                   |
| `detectInstallationInDir` (`src/cli/lib/installation/installation.ts`)                         | Does NOT catch — propagates, so no phantom eject installation is fabricated                        |
| `uninstall` — GLOBAL config (`src/cli/commands/uninstall.tsx`)                                 | A corrupt global config during deregistration is warned, never fatal                               |
| `uninstall` — PROJECT config (`loadUninstallConfig`, same file)                                | Catches `ConfigLoadError` **only**, warns, returns `null`; the uninstall proceeds and exits 0      |
| `mergeWithExistingConfig` (`config-merger.ts`)                                                 | Does NOT catch — `loadProjectConfig` throws straight through to the wizard save path               |

The two `uninstall` rows are the same posture applied at both ends, and the second one is newer. `loadUninstallConfig` narrows before swallowing:

```ts
if (!(error instanceof ConfigLoadError)) throw error;
```

so a genuine fault still propagates. Its warn text is `Could not read the project config — plugins and compiled agents it lists may be left behind: <reason>`. An unreadable config is then treated exactly like a **missing** one, because an unreadable config is precisely when a user needs to uninstall; before this, a `ConfigLoadError` escaped `run()` and the only way out was to hand-delete `.claude-src/`. Only the removal _plan_ degrades — the plugins and compiled agents the config named can no longer be identified, while file removal proceeds. Full flow in `reference/commands/index.md` → `uninstall`.

**Exhaustiveness.** Four call sites in non-test `src/` narrow on the error explicitly (`error instanceof ConfigLoadError`): `configLoadFailure` in `configuration/project-config.ts` (which `BaseCommand.ensureConfigReadable` reaches through `findConfigLoadFailures`), `compile.ts`, `detect-project.ts`, and `uninstall.tsx`'s `loadUninstallConfig`. The `uninstall` GLOBAL row is a **bare** `catch (error)` that warns on anything, so it handles a `ConfigLoadError` without naming the class. The remaining two rows (`detectInstallationInDir`, `mergeWithExistingConfig`) are statements about _absence_ of a catch and so are invisible to a grep — they are listed because propagating is itself the documented posture.

```
grep -rn 'ConfigLoadError' src --include='*.ts' --include='*.tsx' | grep -v '\.test\.' | grep -v '__tests__'
```

The rest of that output holds no fifth posture: the class definition and its three throw sites plus `findConfigLoadFailures` (`configuration/project-config.ts`), the barrel re-export (`configuration/index.ts`), `toUnreadableConfigIssue` in `lib/content-validator.ts` — a type-only use that renders an already-collected failure as `doctor`'s content-layer row rather than catching one — and three explanatory comments, in `installation.ts`, `configuration/config-merger.ts` and `utils/messages.ts`.

**`edit` and `init` never reach the rows below them.** `ensureConfigReadable` runs first in both commands and refuses an unreadable config outright, so `detectProject`'s `null` no longer stands in for one there (it still does for `doctor`), and `mergeWithExistingConfig`'s propagation is unreachable from a wizard save. Both configs a run reads are checked — the project's own and, from a project, the global one every project write inlines — because a corrupt GLOBAL config with an intact project config otherwise carried the whole wizard before failing at the write. There are no versioned migrations: the message says to recreate the configuration, names `uninstall` (which deliberately tolerates the same corruption, two rows below) and the editor URL. Full wording contract: `reference/commands/index.md` → "Unreadable configs are recreated, not edited".

`loadProjectConfig(projectDir)` layers a home-directory fallback on top: project dir first, then `os.homedir()` when `projectDir` is not already home. Both legs can throw `ConfigLoadError`.

### Content-less config is not an installation

`detectInstallationInDir` returns `null` when a successfully-loaded config declares `skills.length === 0` AND `(agents ?? []).length === 0`. A manifest with no content no longer counts as an installation, so `init` routes to the setup wizard rather than the dashboard. `skills` is read directly (the loader defaults it); `agents` is guarded with `?? []` because the loader does not default it.

## Key Types

### ProjectConfig (`src/cli/types/config.ts`)

Unified configuration type. Stores both source-resolution fields and installed skill/agent data.

**Seventeen fields, exhaustively.** This document owns the field list; no other doc restates it.

```typescript
type ProjectConfig = {
  name: string; // required
  description?: string;
  agents: AgentScopeConfig[]; // required
  skills: SkillConfig[]; // required
  author?: string;
  stack?: Record<string, StackAgentConfig>;
  marketplace?: string; // the marketplace ref (path or URL) — NOT `source`
  marketplaceName?: string; // the name that marketplace's own manifest gives it
  agentsSource?: string;
  selectedDomains?: Domain[];
  branding?: BrandingConfig;
  skillsDir?: string;
  agentsDir?: string;
  stacksFile?: string;
  categoriesFile?: string;
  rulesFile?: string;
  projects?: string[]; // global config only
};
```

**There is no `source` field, and there has not been one since the rename.** `projectConfigLoaderSchema` and `projectSourceConfigSchema` both sit behind `renamedFieldGuard`, whose `RENAMED_CONFIG_FIELDS = { source: "marketplace" }` makes a saved config carrying the old key a hard parse failure with the rename spelled out — not a silent fall-through. The skill-entry twin is `RENAMED_SKILL_ENTRY_FIELDS = { source: "origin" }`. Both refusals read the RAW document rather than parse output, because both loader schemas are `.passthrough()` (a stale top-level key would survive as unrecognised data) and the `skills` array is declared (a stale key on an entry would be stripped before any refinement ran) — either way the run would look under the new name, find nothing, and install from the default marketplace instead of the one the config named.

**`marketplace` and `marketplaceName` are two fields, not one.** The first is the ref the install reads from; the second is what that marketplace's own manifest calls itself, which is knowable only once it has been fetched — which is why it cannot fold into the first. `uninstall` reads `marketplaceName` to build the `<id>@<marketplace name>` registry key.

**Six of the seventeen are not declared by `projectConfigLoaderSchema`.** `branding`, `skillsDir`, `agentsDir`, `stacksFile`, `categoriesFile` and `rulesFile` appear on the type and on `projectSourceConfigSchema` (the scalar-only loader `config.ts` uses) but not on the full loader's `projectConfigFields`. They survive a full load anyway because that object is `.passthrough()`, and they survive a re-emit because `canonicalizeFieldOrder` in `config-writer.ts` appends every key `CANONICAL_FIELD_ORDER` does not name after the ones it does. So they round-trip — as passthrough data, in arrival order, with no schema validating their shape on the full-config path.

`ProjectConfig` has no `version` field — no reader consumes it, so it is not emitted or parsed. It also has no `selectedAgents` field: the selected-agent set is derived from the non-excluded `agents` rows via `activeAgentNames` in `src/cli/lib/configuration/scope-predicates.ts` (both the emitted `SelectedAgentName` union and wizard hydration read it from there).

### SkillConfig (`src/cli/types/config.ts`)

```typescript
type SkillConfig = {
  id: SkillId;
  scope: SkillScope; // "project" | "global"
  origin: string; // "eject" (the project's own copy) | a marketplace name
  excluded?: boolean;
};
```

**The provenance field is `origin`, not `source`.** A config carrying `source` on a skill entry is refused by name — see `RENAMED_SKILL_ENTRY_FIELDS` above. `SkillReference.source` and `Skill.source` (`src/cli/types/skills.ts`) keep the old spelling on the COMPILE side and are fed from `SkillConfig.origin` by `buildCompileAgents`; the two names are one value at two layers, and only the config layer was renamed.

### AgentScopeConfig (`src/cli/types/config.ts`)

```typescript
type AgentScopeConfig = {
  name: AgentName;
  scope: SkillScope; // "project" | "global"
  model?: ModelName; // overrides the model in the agent's own metadata
  effort?: EffortLevel; // overrides the reasoning effort in the agent's own metadata
  excluded?: boolean;
};
```

`model` and `effort` are per-agent overrides of the agent definition's own values, absent meaning "keep the metadata default". They are NOT part of the merge's compound identity key, so a key match replaces the whole entry — see [config-merger.md](../config/config-merger.md) and [model-and-effort.md](./model-and-effort.md).

### ResolvedConfig (`src/cli/lib/configuration/config.ts`)

```typescript
type ResolvedConfig = {
  source: string;
  sourceOrigin: "flag" | "env" | "project" | "global" | "default";
  marketplace?: string;
};
```

## Default Category Definitions

**File:** `src/cli/lib/configuration/default-categories.ts`
**Export:** `defaultCategories` — `Record<Category, CategoryDefinition>` asserted with `as const satisfies`, so a category present in the generated `Category` union but absent here is a `tsc --noEmit` TS1360 failure.

**Count: 102 definitions**, one per member of the generated `CATEGORIES` tuple in `src/cli/types/generated/source-types.ts` (`export type Category = (typeof CATEGORIES)[number]`). 35 are `exclusive: true`; 6 are `required: true`.

**The file must stay exhaustive.** With members missing, the `satisfies` assertion fails to type-check and every undefined category is auto-synthesized at load time by `synthesizeCategory` in `src/cli/lib/matrix/skill-resolution.ts` — `displayName` from `toTitleCase(category)` ("Api Graphql"), `description` `"Auto-generated category for <id>"`, `exclusive: false`, `required: false`, `order: 999` (`AUTO_SYNTH_ORDER`). That placeholder shape is what the wizard actually rendered. The 38 added definitions are derived from the marketplace matrix; 11 of them are exclusive.

### Per-domain breakdown

| Domain    | Categories | `order` range | `exclusive: true`                                                                                                                                                                                                                 | `required: true`               |
| --------- | ---------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `web`     | 33         | 1–33          | `web-framework`, `web-meta-framework`, `web-routing`, `web-client-state`, `web-server-state`, `web-graphql-client`, `web-form-library`, `web-e2e`, `web-ui-kit`, `web-docs`, `web-i18n`, `web-realtime`, `web-editor`, `web-maps` | `web-framework`, `web-styling` |
| `api`     | 21         | 1–21          | `api-api`, `api-sql-engine`, `api-orm`, `api-document`, `api-kv`, `api-db-host`, `api-baas`, `api-auth`, `api-cms`, `api-search`, `api-vector-db`, `api-graphql`                                                                  | `api-api`                      |
| `mobile`  | 15         | 1–15          | `mobile-navigation`, `mobile-styling`, `mobile-ui-components`                                                                                                                                                                     | `mobile-framework`             |
| `desktop` | 12         | 1–12          | `desktop-framework`, `desktop-packaging`                                                                                                                                                                                          | `desktop-framework`            |
| `ai`      | 5          | 1–5           | —                                                                                                                                                                                                                                 | —                              |
| `infra`   | 5          | 1–5           | `infra-iac`                                                                                                                                                                                                                       | —                              |
| `shared`  | 5          | 1–5           | `shared-task-runner`, `shared-lint`                                                                                                                                                                                               | —                              |
| `meta`    | 4          | 1–4           | —                                                                                                                                                                                                                                 | —                              |
| `cli`     | 2          | 1–2           | `cli-framework`                                                                                                                                                                                                                   | `cli-framework`                |

### Ordering rule

`order` is **importance-first within the domain**, not alphabetical and not source-literal order. Object-literal key order in the file is alphabetical after each domain's anchor entry, so the two diverge — read `order`, never position. Examples: `infra-iac` is declared after `infra-containers` but carries `order: 4` to its `5`; `mobile-animation` is the second `mobile` key in the file but carries `order: 6`. The `mobile`, `desktop` and `infra` groups were renumbered importance-first when their definitions were added (`mobile-framework` 1 → `mobile-navigation` 2 → `mobile-styling` 3 → … → `mobile-deployment` 15).

### Quirks worth knowing before editing

- `api` runs 1–21 with no gaps: the two it used to skip closed when the six-way data split renumbered the domain. Nothing depends on contiguity either way — `order` is only a sort key.
- `mobile-framework` is `required: true` but `exclusive: false` — the only domain-anchor "framework" category that permits multiple selections.
- `api-api` is the one API-framework category and holds all five frameworks, Elysia included. Its id does not match the `api-framework-*` skill-id prefix its members carry; the rename that would align them is deliberately a separate item, and any `*-framework` suffix rule reads all five as something else in the meantime.

### A category id is a migration surface, and splitting one is a hand edit in four places

`defaultCategories` is not the only place a category id is written down. Four hand-maintained
`Set<string>` literals classify skills BY category id, deciding what kind of thing a skill is:

| Set                      | File                                                         | Decides                                                              |
| ------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `BREADTH_CATEGORIES`     | `packages/matrix/src/read-model/assignment-defaults.test.ts` | Which categories describe what a project is BUILT WITH               |
| `FRAMEWORK_CATEGORIES`   | `packages/matrix/src/read-model/preload-defaults.test.ts`    | The kinds a session is written IN, which earn the reviewer's prompt  |
| `STATE_CATEGORIES`       | `packages/matrix/src/read-model/preload-defaults.test.ts`    | The planning column's other half — where the project keeps its state |
| `AI_PLATFORM_CATEGORIES` | `packages/matrix/src/read-model/preload-defaults.test.ts`    | The AI domain's answer to the two kinds above                        |

They are ids rather than a suffix rule on purpose — `api-api` is the API-framework category, so any
`*-framework` match reads all five API frameworks as something else.

**Splitting a category is a migration for every set that names the parent.** The parent id survives
the split, so each set stays type-correct and keeps matching — it just stops matching the skills
that moved to the successor id it has never heard of. `Set<string>` is the type, not `Set<Category>`,
so `tsc` has nothing to say about an omission, and the assertion that eventually fails names a
**skill**, not the category that moved: a skill whose row never changed reads as a data violation.
Splitting `web-meta-framework` into `web-docs`, and `web-server-state` into `web-graphql-client` and
`web-rpc`, took exactly this shape.

The check is a grep for the parent id before the split lands:

```
grep -rn '"web-server-state"' packages/matrix/src packages/cli/src
```

Each set carries a comment recording that a member is there because its kind was split out of a
parent already in the set, rather than because a new kind joined the column — the distinction the
next reader needs to decide whether the row belongs.

### The four sets encode two kinds of claim — automatic breadth vs designated breadth

The four sets above classify skills by category id, but they do not all support the same test. A
category-level invariant normally runs in both directions — every member of the category names the
flavor, and nothing outside it does — and three of the four are exactly that:
`BREADTH_CATEGORIES` is `FRAMEWORK_CATEGORIES` and `STATE_CATEGORIES` unioned for the resolved side,
so it restates their claim rather than adding one. The fourth is a different kind of claim, and
reading it as a third copy of the same rule is what quietly retires the invariant.

| Kind                   | Meaning                                                           | Forward pin (every member names it) | Reverse pin (nothing else does) |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------- | ------------------------------- |
| **Automatic breadth**  | every skill in the category is breadth                            | on the category                     | on the category                 |
| **Designated breadth** | the owner ruled the category eligible; not every member qualifies | on an explicit **id list**          | on the category                 |

`FRAMEWORK_CATEGORIES`, `STATE_CATEGORIES` and their union `BREADTH_CATEGORIES` are automatic. A
session is written IN those kinds, so a new skill joins the `planning` column by arriving in the
category and both directions read the same predicate — the kind is the whole rule, and ids stay out
of the test.

`AI_PLATFORM_CATEGORIES` is designated. The AI domain has no framework category at all, and what an
AI project is built on is the provider SDK plus the orchestration framework — but `ai-provider` also
holds the capability skills (`ai-provider-claude-vision`, `ai-provider-elevenlabs`,
`ai-provider-openai-whisper`), which the ruling deliberately leaves off the column: which speech model
a feature calls is what a spec asks about when it touches that feature, not what every session opens
with.

**The reverse pin may be widened for a designated category; the forward pin may not.** Widening
"planning nowhere but a framework or a state kind" to admit the two AI categories is correct.
Widening "every entry in these kinds names planning" would demand a `planning` row on
`ai-provider-elevenlabs` the moment anyone gave that skill a row for any reason.

**What the widening opens is closed by id, because the catalogue carries no field separating a
platform skill from a capability one.** `preload-defaults.test.ts` collects every AI-domain row naming
`planning` and `toStrictEqual`s it against `AI_PLATFORM_SKILLS` — the eight ids the ruling names, five
provider SDKs and three orchestration frameworks — so a ninth AI row gaining `planning` fails by id
whatever category it sits in. `assignment-defaults.test.ts` pins the resolved side as the same
hybrid: the PM's whole eager column `toStrictEqual`s the automatic categories expanded to ids plus
those eight, and a case beside it asserts the three capability skills are reached and lazy, which is
the counterweight that makes the exclusion a claim rather than an omission.

**The trigger rule: any breadth ruling that names ids rather than a kind is a designated-breadth
ruling and owes the id pin.** Without it the category invariant still passes and no longer says
anything.

```
grep -rn 'AI_PLATFORM_SKILLS\|AI_PLATFORM_CATEGORIES' packages/matrix/src
```

The id list is declared once per test file, because the two suites judge different artefacts — the
shipped table and the resolved assignment. So a new designated category owes **both** a `*_CATEGORIES`
set for the reverse pin and an id list for the forward one; a category set arriving on its own is the
shape this rule exists to catch.

### Two boundaries parse a stack, and only one of them may reconcile it

`src/cli/lib/stacks/stacks-loader.ts` exports two normalizers whose names read as a general/specific
pair — `normalizeAgentConfig` takes one agent's block, `normalizeStackRecord` takes every agent's
block by calling it. The pair is a **trust** distinction, not a scope one:

| Entry point                                    | Normalizer             | What the category key IS                       | Reconciled |
| ---------------------------------------------- | ---------------------- | ---------------------------------------------- | ---------- |
| `loadStacks` — a source's `config/stacks.ts`   | `normalizeAgentConfig` | the author's heading for the agent prompt      | No         |
| `loadProjectConfigFromDir` — a user's config   | `normalizeStackRecord` | where the CLI stored the skill's live category | Yes        |
| `withNormalizedStack` — the config gate's door | `normalizeStackRecord` | same                                           | Yes        |

**Authored data is read as written; persisted data is reconciled against the live catalogue.** A
source's `stacks.ts` ships alongside the catalogue it references, so there is no drift to reconcile
and nothing to overrule — and the built-in stacks and several fixtures deliberately group
cross-category skills under one heading, because `resolveAgentConfigToSkills` turns that key into the
compiled agent's `usage:` line. A user's `.claude-src/config.ts` was written by an older version of
the catalogue and the user cannot be asked to migrate it, so `rekeyToLiveCategories` — applied inside
`normalizeStackRecord` and nowhere else — re-keys each entry under the category the catalogue names
today.

**The hazard is that the two look interchangeable.** Applying a drift fix one call deeper, in
`normalizeAgentConfig`, is the obvious place if you are reading names rather than callers; it
compiles, type-checks, and silently rewrites every stack author's grouping. `stacks-loader.test.ts`
is the only thing that catches it — "does not re-key a source stack's authored grouping" is the
authored half, and the `normalizeStackRecord` cases beside it are the persisted half.

```
grep -rn 'normalizeStackRecord\|normalizeAgentConfig' src --include='*.ts' --include='*.tsx'
```

`normalizeStackRecord` has two production callers outside the loader —
`src/cli/lib/configuration/project-config.ts` and `src/cli/lib/config-gate/index.ts` — and
`normalizeAgentConfig` has none: its only production callers are `loadStacks` and
`normalizeStackRecord`, both inside `stacks-loader.ts`. A third `normalizeStackRecord` caller is a new
persisted-config door and owes the same reasoning. A first `normalizeAgentConfig` caller elsewhere is
a claim that some other input is authored, which is the one worth arguing about.

**The rule underneath both rows: a category id inside persisted user data is a storage key, not
identity.** The skill id is identity. Any lookup keyed by category is reconciled once at load, never
at each consumer — so a change to the category vocabulary has one place to satisfy rather than a list
of consumers to audit. [`reference/boundary-map.md`](../boundary-map.md) § 2.2 tabulates both entry
points as callers of one `loadConfig` mechanism and marks which trust posture each caller is; of its
six rows only `loadStacks` and `loadProjectConfigFromDir` reach a normalizer at all. The
normalizers, their callers and the specs holding each half are this table's, and that document
points back here for them.

The names do not carry the distinction — a reader meets it first in the doc comment on
`normalizeStackRecord`, which calls itself "the PERSISTED-CONFIG boundary" and states which entry
points reach it.

### Merge and consumption

`loadSkillsMatrixFromSource` in `src/cli/lib/loading/source-loader.ts` builds the matrix's `categories` as `{ ...defaultCategories, ...sourceCategories }` when the source repo ships `skill-categories.ts`, otherwise uses `defaultCategories` verbatim. **A source repo's override wins**, which is why write-time rules read `exclusive` off the merged matrix rather than off `defaultCategories` (see `isExclusiveCategory` in `src/cli/lib/config-gate/propagate.ts`).

The definitions are pinned by `src/cli/lib/configuration/__tests__/default-categories.test.ts`, which asserts `EXPECTED_CATEGORY_COUNT = 102` and `typedKeys(defaultCategories).sort()` equals `CATEGORIES.sort()`, so the table and the generated union cannot drift apart again.

### An unknown category's `exclusive` — two different defaults

| Reader                                                                         | Undeclared `exclusive` treated as | Why                                                                                           |
| ------------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `use-build-step-props.ts` (`matrix.categories[categoryId]?.exclusive ?? true`) | `true` (radio)                    | Safer default for an unknown category                                                         |
| `isExclusiveCategory` in `config-gate/propagate.ts` (`?.exclusive === true`)   | `false`                           | A rule that MASKS persisted config entries must only fire on a flag the data actually carries |

This asymmetry is deliberate; do not "fix" one to match the other.

## Scope Predicates

**File:** `src/cli/lib/configuration/scope-predicates.ts`

Shared predicates over scoped config entries (`{ scope?, excluded? }`), consumed by the merger, generator, writer, and installer so scope/tombstone logic has a single definition.

Eight exported functions, exhaustively — bound to the module by `scripts/check-enumeration-drift.ts`:

| Export                          | Purpose                                                                                                                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isActiveAt(entry, scope)`      | Non-excluded entry at the given scope                                                                                                                                                                                                                                                   |
| `isGlobalTombstone(entry)`      | `scope === "global"` + `excluded` (tombstone masking a global install)                                                                                                                                                                                                                  |
| `isProjectOwned(entry)`         | Project-scoped entry OR the project's own global tombstone (inherited global-active entries are not owned)                                                                                                                                                                              |
| `activeProjectAgentNames()`     | Names of active project-scoped agents                                                                                                                                                                                                                                                   |
| `activeAgentNames()`            | Names of every non-excluded agent, at EITHER scope — the config's own record of who is selected, now that no flat `selectedAgents` list is persisted. Read by the emitted `SelectedAgentName` union and by wizard agent hydration, which is why it is exported ahead of a second caller |
| `activeSkillScopeMap()`         | `Map<SkillId, SkillScope>` of active (non-excluded) skills                                                                                                                                                                                                                              |
| `activeAgentScopeMap()`         | `Map<AgentName, SkillScope>` of active (non-excluded) agents                                                                                                                                                                                                                            |
| `effectivelyExcludedSkillIds()` | Ids whose every entry is excluded (a dual-scope excluded-global + active-project pair is NOT excluded)                                                                                                                                                                                  |

`ScopedEntry` is the shared `{ scope?: SkillScope; excluded?: boolean }` shape. Five of the eight — `isActiveAt`, `isGlobalTombstone`, `isProjectOwned`, `activeProjectAgentNames`, `effectivelyExcludedSkillIds` — are re-exported from `index.ts`; `activeAgentNames`, `activeSkillScopeMap` and `activeAgentScopeMap` are import-by-path only.

## Source Resolution

**Function:** `resolveSource(request)` in `src/cli/lib/configuration/config.ts`

**Precedence (highest to lowest):**

1. `--marketplace` flag value (`request.flag`)
2. `CC_MARKETPLACE` environment variable (`SOURCE_ENV_VAR`) — **`init` only**
3. `.claude-src/config.ts` **`marketplace`** field (project-level)
4. `~/.claude-src/config.ts` **`marketplace`** field (global-level)
5. `DEFAULT_SOURCE` — `github:agents-inc/skills`, composed from `GITHUB_SOURCE.GITHUB_PREFIX`

**The flag is `--marketplace` and the variable is `CC_MARKETPLACE`.** Neither `--source` nor
`CC_SOURCE` exists; the config field they wrote to is `marketplace`, and a saved config still
naming it `source` is refused outright (see `RENAMED_CONFIG_FIELDS` under `ProjectConfig` above).
The exported constant is still spelled `SOURCE_ENV_VAR` — the identifier kept the old word, its
value did not.

**The top two rungs belong to `init`** (owner ruling 2026-08-09). Naming a marketplace is an
install-time decision, so `--marketplace` is declared by `init` alone and `CC_MARKETPLACE` is read
only when the caller says it is `init`. That caller identity is a parameter, not an ambient guess:
`request.caller: SourceCaller` is `"init"` or `"stored"`, and every command after the install asks
as `"stored"`.

A `"stored"` caller may still pass `flag` when it is reading a marketplace it already knows —
`doctor` validating a marketplace repository points the loader at a path. What `init` alone gets is
the ambient environment.

**The two rungs also fail differently, deliberately.** A marketplace this run NAMED goes through
`assertNamedSourceUsable`, which THROWS on an empty or unusable value — somebody typed it, so
falling through would install from a place they did not name. `CC_MARKETPLACE` goes through
`readEnvSource`, where unset, empty and unusable all `warn()` and fall through to the next rung —
the environment is ambient, so an exported value nobody meant for this run must not be able to fail
it.

**`ResolvedConfig.marketplace` is the NAME, not the ref.** Every `resolveSource` return carries
`...(marketplaceName !== undefined && { marketplace: marketplaceName })`, read off the effective
config's `marketplaceName`, while `source` carries the ref the rung supplied. The two keys are
therefore not the same axis, and the result type's `marketplace` is absent whenever no config named
one — including on the `flag` and `env` rungs.

**Source validation:** `validateSourceFormat()` in `src/cli/lib/configuration/config.ts`

Validates:

- No null bytes (bypass prevention)
- Max length 512 chars
- Remote sources: valid URL/shorthand, no path traversal, no private IPs
- Local sources: no control chars, no UNC paths

**Source classification:** `isLocalSource()` in `src/cli/lib/configuration/config.ts` - Returns `true` for paths starting with `/` or `.`, `false` for remote protocols. Rejects `..` and `~` in non-remote sources.

## Config Generation

**Function:** `generateProjectConfigFromSkills()` in `src/cli/lib/configuration/config-generator.ts`

Generates `ProjectConfig` from wizard result:

- Maps domain selections to flat skill list
- Builds stack property from agent-skill mappings
- Resolves agent names from selected domains

Required when the `selectedAgents` option (a wizard-supplied `AgentName[]`, not a config field) is non-empty: callers must pass `skillConfigs` (one `SkillConfig` per selected skill) and `agentConfigs` (one `AgentScopeConfig` per selected agent). `getScopeOrThrow` hard-errors on any missing entry — no silent scope defaulting.

**Per-agent curation options** (opt-in via `newlyAddedSkillIds`):

| Option                   | Type                                           | Effect                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `newlyAddedSkillIds`     | `readonly SkillId[]`                           | Skills new to this session (vs prior `existing.config.skills`). Opting in (even as `[]`) activates per-agent curation preservation: skills absent from an existing agent's prior stack are only appended when in this set. |
| `scopeEligibilityGained` | `ReadonlySet<string>`                          | `(agent, skillId)` pairs whose scope-compatibility flipped to compatible this session. Admits scope-flip cases that a skill-id-only diff misses. Keys built via `scopeEligibilityKey(agent, skillId)`.                     |
| `existingStack`          | `Partial<Record<AgentName, StackAgentConfig>>` | Prior stack entries. Used to preserve per-agent curation and inherit `preloaded` flags.                                                                                                                                    |

When `newlyAddedSkillIds === undefined`, `shouldIncludeTriple` returns `true` unconditionally — which is not seed-everything, because `isPreservedOrRelevant` runs after it either way. See "Which agents a skill lands on" below.

**Function:** `scopeEligibilityKey()` in `src/cli/lib/configuration/config-generator.ts` - Encodes `(agent, skillId)` as `` `${agent}|${skillId}` `` for set-membership lookups.

**Function:** `buildStackProperty()` in `src/cli/lib/configuration/config-generator.ts` - Builds the `stack` record in config from a loaded Stack definition.

**Function:** `splitConfigByScope()` in `src/cli/lib/configuration/config-generator.ts` - Splits a `ProjectConfig` into global and project partitions by skill/agent scope. Returns `SplitConfigResult` (`{ global: ProjectConfig; project: ProjectConfig }`). Partitions:

- **skills** by `scope` + `excluded` (excluded globals route to project split as tombstones)
- **agents** by `scope` + `excluded` (excluded globals route to project as overrides)
- **stack** by agent partition first, then global agents' entries are further split per-skill so a global agent never carries project skill ids; **both** halves always carry a `stack` key, `{}` when the derivation yielded nothing
- **selectedDomains** carried to BOTH halves by the `...config` spread — a project owns its own domain selection rather than inheriting the global one. See [scope-split.md](../config/scope-split.md) → "Scalar / Array Fields"

> **Full partition rules, delta pipeline, and decision tables:** see [../config/scope-split.md](../config/scope-split.md).

### Which agents a skill lands on — taxonomy, not catalogue membership

`buildAgentStack` in `config-generator.ts` runs three filters over every `(agent, category, skillId)`
triple, in this order: `isScopeCompatible`, then `shouldIncludeTriple` (per-agent curation, above), then
`isPreservedOrRelevant`. The third is the one that decides reach for a skill arriving this session,
and it is two-tier:

- **A triple the prior save already carries rides through verbatim**, cross-domain included. That is
  the user's curation, and the relevance rule never reclaims it — `priorLoadState` answering anything
  at all is the whole test.
- **A triple arriving this session lands only where the shared resolver targets it.** `isRelevantPair`
  calls `resolveAssignment` from `@workspace/matrix` (`read-model/assignment-defaults.ts`) — the same
  targeting the editor's default assignments read, so a pick lands on the same agents from either
  front door.

**What the resolver is told is decided by `taxonomyOrIdOf`, and this is the part worth reading before
assuming anything about custom or marketplace skills.** When `getCategoryDomain(category)` (from
`matrix/matrix-provider.ts`) answers a domain, the skill is handed over as
`{ id, domainId, categoryId }` — its own stated taxonomy, out of the LOADED matrix — and the resolver
places it on that domain's agents whatever marketplace shipped it and whether or not the vendored
catalogue has ever heard of the id. Catalogue membership is not what decides reach.

The id goes over alone in exactly one case: the category the loaded matrix carries names no domain,
so there is no taxonomy to state. The resolver then falls back to its own catalogue lookup, and for a
namespaced or user-written id that lookup misses, so the skill reaches nobody as a new triple —
relevance unknown, and assignment is the user's to make rather than a broadcast's. A category with no
domain is reported in its own right by `checkMatrixHealth` (`lib/matrix/matrix-health-check.ts`).

**Eagerness is a separate question and it IS catalogue-keyed.** `mappedLoadState` guards on
`isSkillId` before consulting `resolveLoadState`, and the preload rows are the shipped catalogue's own
ids, so a skill outside the generated union is `"lazy"` by construction: `toStackAssignment` writes a
bare `{ id }` for it. A non-catalogue skill can therefore be targeted exactly like a catalogue one and
still never be preloaded.

Four `it`s in `config-generator.test.ts` pin the four outcomes and are the place to read the contract
as executable statements: a category naming no domain reaches no agent; a marketplace-namespaced
skill reaches its own domain's agents; a custom skill in a real category does the same; and a prior
outside-catalogue entry is kept verbatim.

### Skill Config Construction in Wizard Store

**Function:** `buildSkillConfigForId()` in `src/cli/stores/wizard-store.ts`

Builds a `SkillConfig` for a resolved skill ID, preferring saved config values. When duplicate entries exist for the same skill ID (e.g., both global and project scoped), the project-scoped entry takes precedence:

```typescript
const saved =
  savedConfigs?.find((sc) => sc.id === id && !sc.excluded && sc.scope === "project") ??
  savedConfigs?.find((sc) => sc.id === id && !sc.excluded);
```

Falls back to `scope: saved?.scope ?? "global"` and `origin: saved?.origin ?? defaultOriginFor(matrix.skills[id])`, where `defaultOriginFor` returns `EJECT_SOURCE` for a skill the matrix flags local, otherwise `primarySourceName(skill) ?? DEFAULT_PUBLIC_SOURCE_NAME`. The field is `origin`; `resolveEffectiveSource` still exists in `wizard-store.ts` but no longer serves this builder.

## Config Merging

> **Full merge contract, compound keys, authoritative-scope, and tombstone flow:** see [../config/config-merger.md](../config/config-merger.md).

**Function:** `mergeWithExistingConfig(newConfig, context: MergeContext)` in `src/cli/lib/configuration/config-merger.ts`

`MergeContext = { projectDir; authoritativeScope?: "all" | "owned" }`. When `edit` command modifies skills:

- Loads existing full config; when present, calls `mergeConfigs()` with the context's `authoritativeScope`
- Preserves user customizations (`name`, `description`, `author`, `agentsSource`, `marketplaceName` unconditionally; `marketplace` fill-only) and the global `projects` registry — the per-field rules are in [config-merger.md](../config/config-merger.md)
- Falls back to copying `author`/`agentsSource` from a legacy source stub when no full config exists (`merged: false`, no `mergeConfigs` call)

**Pure merge function:** `mergeConfigs(newConfig, existingConfig, options?)` in `src/cli/lib/configuration/config-merger.ts`

- **Replace-on-match**: `newConfig` is authoritative for every `name`/`id` it references; five identity fields (`name`, `description`, `author`, `agentsSource`, `marketplaceName`) are carried from existing unconditionally, while `marketplace` is fill-only — preserved only when `newConfig.marketplace` is undefined, which is how `init --marketplace` repoints an existing install. There is no `source` field
- Agents and skills are keyed by a **compound key** (`id:scope[:excluded]`), so dual-scope active/tombstone pairs coexist and scope migrations drop stale rows
- Stack: `newConfig.stack` wins whenever defined; existing stack is kept only when `newConfig.stack` is undefined
- `authoritativeScope` (Scenario C): a full `cc edit` drops in-authority entries that are absent from `newConfig`. A skill the wizard could not resolve from the loaded source is absent for a different reason than a deselection, but drops on the same terms — `edit` names it and says why
- `existingConfig.projects` is preserved when `newConfig` carries none — `newConfig` never carries one, because the `projects` array is maintained exclusively by `registerProjectPath` and the gate's `deregister-project` mutation

**"Absent from `newConfig`" does not mean "deselected" for a globally installed item under `authoritativeScope: "owned"`.** A project-scope edit cannot produce that absence: the wizard guards refuse the deselect and `applySkillRemoval` leaves an inherited global-active entry byte-identical. An absent global entry therefore reflects a global-scope change or a legacy config. Full contract: [../config/config-merger.md](../config/config-merger.md).

## Config I/O

| Function                      | Purpose                                                                                                                                   | File                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `loadProjectSourceConfig()`   | Load .claude-src/config.ts (partial)                                                                                                      | `config.ts`                                        |
| `loadGlobalSourceConfig()`    | Load ~/.claude-src/config.ts (partial)                                                                                                    | `config.ts`                                        |
| `loadProjectConfig()`         | Load + validate with global fallback; **throws `ConfigLoadError`** on a corrupt file at either leg                                        | `project-config.ts`                                |
| `loadProjectConfigFromDir()`  | Load + validate from specific dir only; `null` only when the file is MISSING, **throws `ConfigLoadError`** when it exists but is unusable | `project-config.ts`                                |
| `validateProjectConfig()`     | Validate an already-loaded value: `projectConfigLoaderSchema` plus required `name` and `agents`                                           | `project-config.ts`                                |
| `generateConfigSource()`      | Generate TypeScript source string                                                                                                         | `config-writer.ts`                                 |
| `loadConfig()`                | Generic TypeScript config loader (jiti)                                                                                                   | `config-loader.ts`                                 |
| `defineConfig()`              | Type-safe config helper (identity fn)                                                                                                     | `define-config.ts`                                 |
| `getProjectConfigPath()`      | Build absolute path to project config                                                                                                     | `install-base-dir.ts` (re-exported by `config.ts`) |
| `resolvePrimarySourceEntry()` | The one marketplace as a `SourceEntry` — the shape `search` and `doctor` list sources in                                                  | `config.ts`                                        |
| `resolveAuthor()`             | Resolve author from effective config                                                                                                      | `config.ts`                                        |
| `writeProjectPartial()`       | Write a partial PROJECT config, filling defaults; refuses `$HOME`                                                                         | `config-gate/index.ts`                             |

## Config Writer

**File:** `src/cli/lib/configuration/config-writer.ts`

Replaced the former `writeProjectSourceConfig()`. **Renders only — writes nothing** since the config-gate landed.

| Function                                 | Purpose                                       |
| ---------------------------------------- | --------------------------------------------- |
| `generateConfigSource()`                 | Main entry: generates config.ts source string |
| `generateBlankGlobalConfigSource()`      | Blank global config (empty arrays)            |
| `generateBlankGlobalConfigTypesSource()` | Blank config-types.ts (all types = `never`)   |
| `getGlobalConfigImportPath()`            | Returns absolute path to `~/.claude-src/`     |

The `generateConfigSource()` function accepts an optional `ConfigSourceOptions` parameter:

- When `isProjectConfig: true` (no `globalConfig`): generates a config that imports from the global config and spreads global arrays into skills, agents, and selectedDomains.
- When `isProjectConfig: true` with `globalConfig` provided: generates a self-contained config snapshot via `generateProjectConfigWithInlinedGlobal()`. Both global and project entries for the same skill ID are preserved (no deduplication). Global entries appear under a `// global` comment, project entries under `// project`. Excluded global entries (tombstones) replace their active global counterparts in the global section while the active project entry appears separately in the project section. Stack entries are filtered to project-scoped agents only.

## Config Types Writer

**File:** `src/cli/lib/configuration/config-types-writer.ts`

Generates `config-types.ts` files with typed union types narrowed to installed items. Every
exported function, exhaustively — the same list [config-writer.md](../config/config-writer.md)
carries, and both are bound to the module by `scripts/check-enumeration-drift.ts`:

| Function                             | Purpose                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `getGlobalConfigTypesPath()`         | Absolute path to the global config-types.ts when it exists, else `null`                   |
| `assembleConfigTypesSource()`        | The single emission template all three writers route through                              |
| `buildConfigTypesBackgroundData()`   | The one constructor for `ConfigTypesBackgroundData`, beside the type it builds            |
| `regenerateConfigTypes()`            | Full regeneration; throws `GlobalPairWriteViolation` at `$HOME`                           |
| `generateConfigTypesSource()`        | Standalone config-types.ts, narrowed to a config when passed one, else to the full matrix |
| `deriveCategories()`                 | `SkillId[]` → the categories the matrix places them in, minus `LOCAL_PSEUDO_CATEGORY`     |
| `deriveDomains()`                    | `Category[]` → the domains the matrix gives them                                          |
| `generateProjectConfigTypesSource()` | Project config-types.ts extending the global one                                          |

When a global installation exists, project `config-types.ts` imports from global and extends with project-only types. Types are narrowed to only installed items (not the full matrix).

### Writer selection rule

When writing a PROJECT `config-types.ts` (`<projectDir>/.claude-src/config-types.ts` where `projectDir` is not the global install root), the import-from-global writer `regenerateConfigTypes` applies. When writing the GLOBAL `config-types.ts` (`~/.claude-src/config-types.ts`), the standalone unions apply — emitted only by `config-gate/pair-writer.ts`. The rule is structural: `regenerateConfigTypes` throws `GlobalPairWriteViolation` at `$HOME`, and the standalone renderer is private to the gate (the former `writeStandaloneConfigTypes` export is gone).

In `config-gate/`:

- `writeScopedFromWizard` project branch → `writeProjectConfigPair` → `regenerateConfigTypes(projectDir, ...)`.
- `writeScopedFromWizard` home branch / project-branch global write → `writeGlobalPair` → `pair-writer`'s standalone renderer.
- `propagateGlobalChangesToProjects` per-project loop → the SAME `writeProjectConfigPair`.
- `reconcileTypesFromDisk(projectDir, config, deps, opts?)` — the scope-dispatching entry: `isHomeDirectory(projectDir)` → standalone half, otherwise `regenerateConfigTypes`. The single entry point for callers holding a persisted config and only its scope.

Helpers `buildConfigTypesBackgroundData(matrix, agents)` (beside the type, in `configuration/config-types-writer.ts`) and `buildProjectTypesExtras(config, matrix)` (`config-gate/propagate.ts`) feed already-loaded matrix/agent data into `regenerateConfigTypes` without re-loading. The detailed call-site table and rationale live in [../config/config-writer.md](../config/config-writer.md).

### `compile` regenerates `config-types.ts`

The documented workflow is "hand-edit `config.ts`, then run `compile`", so a compile pass that leaves the unions untouched strands them. `Compile.refreshConfigTypes` (`src/cli/commands/compile.ts`) runs once per compile pass:

1. `loadProjectConfigFromDir(pass.projectDir)` — a `null` (no config) skips the refresh with a `verbose()` line.
2. `loadSkillsMatrixFromSource({ sourceFlag, projectDir, skipExtraSources: true, matrixOnly: true })` — `matrixOnly` skips the source clone for the default source so compile stays offline on a cold cache.
3. `reconcileTypesFromDisk(pass.projectDir, loaded.config, { matrix, agents: pass.agents }, { currentProjectDir: cwd })`.

The unions follow the **config**, not the discovered skills: `runCompilePass` calls `refreshConfigTypes` in the `totalSkillCount === 0` early-return branch as well, before returning `false`. A failure downgrades to `this.warn(configTypesRefreshFailed(...))` — the compiled agents are already written and remain valid.

**A home-directory pass also propagates.** `config.ts` on disk is the input and is never rewritten (a hand edit must survive the compile), which means there is no prior state to diff against and nothing to classify. The only safe assumption is that every registered project's inlined copy of the global config is stale, so the home pass fans it out unconditionally and recompiles those projects' agents, printing `propagatedRecompileSummary` through `BaseCommand.reportPropagatedRecompile` — `Recompiled agents in N registered projects, M unchanged`. `currentProjectDir: cwd` keeps the home pass out of the project whose own pass is about to compile it. Skipped projects are warned via `registeredProjectUpdateSkipped`; that rendering sits deliberately outside the refresh's `catch`, so an unreachable project is not reported as a failure to refresh the unions.

`skipExtraSources: true` is not a divergence from the wizard's fully tagged load: extra-source loading only annotates `availableSources` / `activeSource` for wizard UI tagging, which the config-types writer never reads. Byte-identity is pinned by the `skipExtraSources` parity test in `local-installer.test.ts`.

### A global uninstall regenerates every registered project's types

`pruneGlobalEntriesFromRegisteredProjects(globalConfig, matrix, agents)` (in `config-gate/propagate.ts`, reached through the `propagateGlobalRemoval` entry point) re-enters `propagateGlobalChangesToProjects` with an emptied global config (`skills: []`, `agents: []`), so every global skill/agent reads as removed: inlined global rows and their tombstones drop out of each project's `config.ts`, and each project's `config-types.ts` is regenerated.

`uninstall.tsx` calls `propagateGlobalRemoval` from `updateRegisteredProjects`, AFTER the global `.claude-src` manifest is removed, so the regenerated project types fall back to the standalone form instead of importing a deleted global `config-types.ts`. The data it needs (`globalConfig.projects`, matrix, agent defs) is captured by `prepareGlobalPropagation` BEFORE the removal, since source resolution reads the config being deleted. Unreachable projects are warned (`registeredProjectUpdateSkipped`) and never abort the uninstall. **The prune now also recompiles the pruned projects' agents** — they were compiled against the global rows this uninstall just removed — and `uninstall.tsx` renders `GateReport.recompile` after the `registeredProjectsUpdated` line. `propagateGlobalRemoval` writes no pair: the pair it would derive from has just been deleted, which is why it is its own entry point rather than a flag on a writing one.

## Scope-Aware Config Splitting

> **Detailed documentation:** See [concepts/scope-system.md](../concepts/scope-system.md) for the full cross-cutting scope reference.

Config supports `"project"` and `"global"` scopes on both skills and agents. During installation:

1. `splitConfigByScope()` partitions the merged config into global and project parts
2. `writeScopedFromWizard()` in `config-gate/index.ts` writes:
   - Global config to `~/.claude-src/config.ts` (standalone)
   - Project config to `{projectDir}/.claude-src/config.ts` (imports from global)
3. Config-types files are split similarly: global gets standalone types, project extends global

`writeScopedFromWizard` returns a `GateReport` = `{ globalWritten, changes, propagated: { updated, skipped }, recompile }`. It is a record of completed work, not a to-do list: the registered projects a global change fanned out into have **already** had their agents recompiled by the time it resolves (see "Propagated-project recompilation" below).

When installing from the home directory (not a project), a single standalone config is written.

## Cross-Scope Reconciliation Before Every Project Write

**Function:** `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)` in `src/cli/lib/config-gate/propagate.ts`

Two production paths write a project `config.ts` with the global config inlined. Both must reconcile: handing the raw `splitConfigByScope` output straight to the writer means a project owning a skill at project scope while the same id (or a different skill in the same exclusive category) is active globally ended up with **two active entries** in its own config. `doctor` passed on that state in both of its layers — neither its content checks nor its operational checks read config semantics.

One shared step now runs immediately before BOTH writes:

| Write site                                                  | Reconciliation call                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `writeScopedFromWizard` project branch (ordinary init/edit) | `reconcileProjectSplitAgainstGlobal(projectSplitConfig, effectiveGlobalConfig, matrix)` |
| `propagateGlobalChangesToProjects` per-project loop         | `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)`                |

**Contract:**

- **Masks** a live global entry (`{ ...globalEntry, excluded: true }`, so the mask carries the global install's `origin`) on an IDENTITY collision — the project owns the same id/name at project scope — for skills AND agents (`maskCollidingGlobalSkills`, `maskCollidingGlobalAgents`).
- **Additionally masks** a live global skill when the project owns a DIFFERENT active skill in the same category and the merged matrix declares that category `exclusive`. Skills only: agents have no categories, so `maskCollidingGlobalAgents` is identity-only.
- **Drops** a mask once its collision clears (`dropOrphanedDerivedMasks`, `dropOrphanedDerivedAgentMasks`). Self-heal runs BEFORE masking on both axes, so a cleared collision is removed rather than immediately re-derived, and masking's `alreadyTombstoned` guard only sees warranted tombstones.
- **Idempotent** — an id the project already tombstones is skipped.
- Reads `exclusive` from the **merged matrix** (`isExclusiveCategory`), so a source repo's category override is honoured. An **undeclared** flag is treated as non-exclusive.
- **Never throws** on a custom skill absent from the matrix: `categoryOfSkill` returns `undefined` for a missing entry and for `LOCAL_PSEUDO_CATEGORY`, and neither participates in category rules.
- **Project-local only.** The global config passed in is read, never rewritten — a tombstone is never written into `~/.claude-src/config.ts`.

**The project's own skill wins locally.** This is deliberately asymmetric with `toggleTechnology`'s exclusive-swap guard, which refuses a user-initiated swap over a globally-locked skill: there the user is displacing a shared install, whereas here a global install landed on top of pre-existing project state and letting it win would silently uninstall the user's own skill.

**Mask lifetime.** No store path can mint a BARE global tombstone — a project-scope deselect of a globally installed item is refused, and a domain deselect only drops what the project owns. The single remaining user route (`s`, G→P) always pairs the tombstone with an active project entry, i.e. an identity collision. Every bare mask is therefore system-derived by construction, and the retention test is one rule: **keep a mask only while the collision that would re-derive it still holds**, in `required` and optional categories alike. This replaced the earlier `exclusive && required` narrowing, which existed only because a derived mask and a deliberate exclusion were indistinguishable on disk.

## Propagated-Project Recompilation

Propagation itself rewrites a registered project's `config.ts` / `config-types.ts` but never its compiled `.claude/agents/*.md`. **The gate does that step, not the caller**: `config-gate/recompile.ts` runs `recompilePropagatedProjectAgents(projectDirs)` (`src/cli/lib/operations/project/recompile-project-agents.ts`, imported lazily to avoid the lib → operations cycle) over `propagated.updated`, and the result lands on `GateReport.recompile` for the command to render. The earlier contract returned the directories for the caller to recompile — which only `init` and `edit`'s wizard tail ever did, leaving `edit`'s source migration and the global `uninstall` behind.

`recompileRegisteredProjectAgents(projectDir)` recompiles **project scope only** (`scopeFilter: "project"`) — the global agents were already recompiled by the triggering operation's own pass. It passes `discoverInstalledSkills(projectDir).allSkills` explicitly so global-local and project-local skills are not stripped. `recompilePropagatedProjectAgents` loops sequentially with per-project failure isolation, returning `PropagatedRecompileSummary = { rewrittenCount, unchangedCount, failedCount, warnings }`. A project whose agents all came back byte-identical counts as `unchangedCount`, not as a recompile — there is no `recompiledCount` field.

## Branding / White-Labeling

**Function:** `resolveBranding()` in `src/cli/lib/configuration/config.ts`

Supports custom branding via `.claude-src/config.ts`:

```typescript
export default {
  name: "my-project",
  skills: [],
  agents: [],
  branding: {
    name: "Acme Dev Tools",
    tagline: "Custom development agents",
  },
} satisfies ProjectConfig;
```

Falls back to `DEFAULT_BRANDING` from `src/cli/consts.ts`:

- Name: "Agents Inc."
- Tagline: "AI-powered development tools"

**The fallback is per-FILE, not per-field.** `loadEffectiveSourceConfig` answers with the project's
OWN config where it has one and the global config otherwise, and `resolveBranding` reads `branding`
off whichever of the two it was handed. A project config that exists and declares no `branding`
therefore resolves to `DEFAULT_BRANDING` — the global config's branding is not consulted behind it.
The global rung is reached only by a directory holding no `.claude-src/config.ts` of its own, and
`loadOwnProjectSourceConfig` excludes the home root from counting as one, so the same file is never
read as both rungs in a run.

### Who reads `branding.name`

Two readers, and every site that prints the configured name goes through one of them.

| Reader                                        | Reaches                                | What it names                                                                                                                                                                                                                                                                        |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BaseCommand.resolveBrandingName(projectDir)` | `doctor`, `eject`, `uninstall`, `init` | `doctor`'s `<name> Doctor` header and `eject`'s `<name> Eject` header; `uninstall`'s `<name> Uninstall` header, its `notInstalledHere()` line, its `<name> has been uninstalled.` sign-off and its `not created by <name> CLI` skip warning; `init`'s `initSucceeded()` closing line |
| `getDashboardData(projectDir)`                | the bare invocation's dashboard        | `DashboardData.name`, carried on the data rather than read by the formatter, which `formatDashboardText` prints as the summary's first line                                                                                                                                          |

`init` and `uninstall` resolve the name once onto a `brandingName` field on the command and print
from that; `doctor` and `eject` resolve it inline into the header call.

**The dashboard's name reaches the non-interactive path only.** `showDashboard` prints
`formatDashboardText(data)` when `process.stdin.isTTY` is false, and on a TTY renders the
`Dashboard` component instead — which is handed `onSelect` and `onCancel` and never `data`, so it
paints `ASCII_LOGO`. What an interactive user sees at that prompt does not follow `branding.name`.

### The two postures, and why they differ

`loadSourceConfig` raises for a config that EXISTS and cannot be evaluated — the standing rule that
such a file is raised, never reported as absence. That rule is stated once above, for that
function's own callers; `resolveBranding` inherits it, so each of ITS callers chooses abort or
degrade in turn and says which in a comment where it stands.

**`resolveBrandingName` degrades.** It catches, reports the cause through `verbose()` and returns
`DEFAULT_BRANDING.NAME`. Three of its four commands have to survive an unreadable config precisely
because that state is their subject: `doctor`'s whole job is naming it, `uninstall` is the way out
of it, and `eject` already catches the same fault one method down so an ejection that landed is
never reported as a run that did nothing. A heading is decoration, and refusing over one would turn
the branding wiring into a new way for an unreadable config to abort three commands that survive it
today. The cause is not swallowed — the command's own config reader reports it in full where the
user can act on it, and reporting it twice would put a warning about the configuration above the
one line that has to be the first thing on screen. `init` is the fourth caller and cannot reach the
catch at all: `ensureConfigReadable` has already refused every config this would read.

**`getDashboardData` aborts**, calling `resolveBranding` with no catch. Abort is already in force
there rather than newly chosen: the `loadProjectConfig` beside it in the same `Promise.all` raises
over the same file, so a configuration that cannot be evaluated fails the call whether branding is
read or not. Nothing is degraded that was not already, and the dashboard is reached only once an
installation has been detected.

### `tagline` has no reader anywhere

`resolveBranding` resolves it and nothing consumes the field. The docstring on `BrandingConfig`
(`src/cli/types/config.ts`) and on `projectSourceConfigSchema` (`src/cli/lib/schemas.ts`) both say
"Custom tagline shown in wizard header" — and the wizard header is `WizardLayout`, which paints
`ASCII_LOGO` (on the stack step, where the terminal clears `LOGO_MIN_TERMINAL_ROWS`) and then
`WizardTabs`, and no tagline on any step. `DEFAULT_BRANDING.TAGLINE` is likewise reached only
by `resolveBranding` itself. A configured tagline is accepted by the schema, published in
`src/schemas/project-source-config.schema.json`, round-tripped as passthrough data and never
printed.

## Schema Validation

Config files are validated at parse boundaries using Zod schemas from `src/cli/lib/schemas.ts`:

| Schema                      | Purpose                                 |
| --------------------------- | --------------------------------------- |
| `projectSourceConfigSchema` | Lenient loader for source config fields |
| `projectConfigLoaderSchema` | Lenient loader for full ProjectConfig   |

Schema URLs defined in `SCHEMA_PATHS` in `src/cli/consts.ts`.

## Operations Layer: writeProjectConfig

**File:** `src/cli/lib/operations/project/write-project-config.ts`

The operations layer provides `writeProjectConfig()` as a high-level orchestrator that runs the full config pipeline:

1. `buildAndMergeConfig()` -- generates config from wizard result, merges with existing (threads `authoritativeScope` and `wizardResult.unresolvableSkillIds` into `mergeWithExistingConfig`)
2. Agent load -- uses pre-loaded `options.agents` when provided, otherwise `loadMergedAgents(sourceResult.sourcePath)` for config-types generation
3. `config-gate::ensureBlankPair()` -- ensures the global config pair exists (when in project context)
4. `config-gate::writeScopedFromWizard()` -- writes config.ts and config-types.ts split by scope, fans global changes out to registered projects and recompiles their agents

| Type                   | Name                  | Purpose                                                                                                    |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ConfigWriteOptions`   | Input options type    | wizardResult, sourceResult, projectDir, sourceFlag, agents, authoritativeScope                             |
| `ConfigWriteResult`    | Return type           | config, configPath, wasMerged, existingConfigPath, filesWritten, **propagation: GateReport**               |
| `writeProjectConfig()` | Orchestrator function | Builds, merges, and writes project config (init/edit); `filesWritten` is 4 in a project context, 2 at home |

`propagation` is the `GateReport` returned verbatim by `writeScopedFromWizard`; `init.tsx` and `edit.tsx` **render** it — the recompile it describes already ran inside the write. The result carries no `globalConfigPath` — the field was declared, never populated and never read, and has been deleted.

Used by `init.tsx` and `edit.tsx` commands. Replaces inlined config writing logic with a single operation call.

**Corrupt-config propagation:** step 1 reaches `mergeWithExistingConfig` → `loadProjectConfig`, which throws `ConfigLoadError` on an unparseable config rather than returning `null`. Neither `mergeWithExistingConfig` nor `writeProjectConfig` catches it, so a wizard save against a corrupt on-disk config fails loudly instead of silently treating the config as absent and rewriting it from scratch.

## Plugin Install Failure Semantics

Plugin install intent is inviolable: when `installPluginSkills` returns a non-empty `failed` array, both `init.tsx::handleInstallation` and `edit.tsx::applyPluginChanges` reach `BaseCommand.reportPluginInstalls`, which emits per-skill warnings and then hard-errors via `this.error(..., { exit: EXIT_CODES.ERROR })` BEFORE `writeConfigAndCompile` runs. This prevents `config.ts` from being written with orphan entries that claim skills are installed when `claude plugin install` rejected them.

The same guard covers the eject→plugin scope-migration path: `edit.tsx::applyScopeChanges` runs `executeMigration()` (`mode-migrator.ts`), which returns `pluginInstalls.failed` for any skill whose plugin install failed mid-migration; when that array is non-empty, `edit.tsx` hard-errors via `this.error(pluginInstallFailureError(...), { exit: EXIT_CODES.ERROR })` before `writeConfigAndCompile`, matching the added-skill path. `ejectCopies.failed` is the plugin→eject mirror and refuses on the same terms, through `reportEjectCopies` and `ejectCopyFailureError(...)` — a different sentence for a different remedy, but the same rule: an intent this run could not honour stops it before any config records the intent.

Uninstall failures are diagnostic-only — they do not produce orphan state and do not trigger a hard-error. This is the "No Plugin-to-Eject Fallback" / orphan-config invariant codified in CLAUDE.md (Data Integrity).
