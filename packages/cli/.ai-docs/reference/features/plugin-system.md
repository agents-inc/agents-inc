---
scope: reference
area: features
keywords:
  [
    plugins,
    manifest,
    marketplace,
    installation,
    discovery,
    per-skill-source,
    hard-error,
    installed_plugins.json,
    v2-registry,
    cross-scope-reconciliation,
    masking,
    derived-mask,
    settings.json,
  ]
related:
  - reference/features/compilation-pipeline.md
  - reference/features/skills-and-matrix.md
  - reference/commands/index.md
  - reference/concepts/scope-system.md
  - reference/concepts/tombstone-pattern.md
  - reference/config/config-writer.md
last_validated: 2026-07-30
---

# Plugin System

## Overview

**Purpose:** Discover, validate, and manage Claude Code plugins (skills and agents packaged for native installation).

**Location:** `src/cli/lib/plugins/`

## Files

| File                  | Path                                      | Purpose                                                          |
| --------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `plugin-manifest.ts`  | `src/cli/lib/plugins/plugin-manifest.ts`  | Generate plugin.json manifests                                   |
| `plugin-finder.ts`    | `src/cli/lib/plugins/plugin-finder.ts`    | Locate plugin directories and files                              |
| `plugin-info.ts`      | `src/cli/lib/plugins/plugin-info.ts`      | Plugin info formatting/display                                   |
| `plugin-validator.ts` | `src/cli/lib/plugins/plugin-validator.ts` | Validate plugin structure/content                                |
| `plugin-discovery.ts` | `src/cli/lib/plugins/plugin-discovery.ts` | Discover all installed plugins                                   |
| `plugin-settings.ts`  | `src/cli/lib/plugins/plugin-settings.ts`  | Plugin settings/paths resolution                                 |
| `plugin-ref.ts`       | `src/cli/lib/plugins/plugin-ref.ts`       | Plugin-ref construction (`{id}@{marketplace}`) and scope mapping |
| `index.ts`            | `src/cli/lib/plugins/index.ts`            | Barrel exports                                                   |

## Plugin Structure

A Claude Code plugin has this structure:

```
.claude-plugin/
  plugin.json          # Plugin manifest
skills/
  {skill-name}/
    SKILL.md           # Skill content
    metadata.yaml      # Skill metadata
agents/
  {agent-name}.md      # Compiled agent prompt
```

### Plugin Manifest (`plugin.json`)

Type: `PluginManifest` (`src/cli/types/plugins.ts`)

```typescript
type PluginManifest = {
  name: string; // kebab-case (e.g., "skill-react")
  version?: string;
  description?: string;
  author?: PluginAuthor;
  category?: string; // the skill's metadata.yaml category, carried to the marketplace entry
  keywords?: string[];
  commands?: string | string[];
  agents?: string | string[];
  skills?: string | string[];
  hooks?: string | Record<string, AgentHookDefinition[]>;
};
```

`category` is how a skill's own category reaches `marketplace.json`: `compileSkillPlugin` passes
`metadata?.category` into `generateSkillPluginManifest`, which emits it into `plugin.json`, and
`convertManifestToMarketplacePlugin` copies it onto the `MarketplacePlugin` entry. Both plugin.json
schemas carry the field (`pluginManifestObjectSchema`, from which the `.strict()` validation variant
derives), so a category-carrying manifest passes `validatePluginManifest` — and an unknown key still
does not. `src/schemas/plugin.schema.json` is generated from that same strict variant and carries the
property, so it is regenerated rather than hand-edited. The Claude CLI (v2.1.226) tolerates the extra
key: `claude plugin marketplace add`, `install` and `list` all succeed against a marketplace built
this way, and the installed cache copy of `plugin.json` keeps the field verbatim.

## Plugin Locations

All location functions are in `src/cli/lib/plugins/plugin-finder.ts`:

| Function                  | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `getUserPluginsDir()`     | User-level plugins dir                    |
| `getProjectPluginsDir()`  | Project-level plugins: `.claude/plugins/` |
| `getPluginAgentsDir()`    | Agents subdirectory within a plugin       |
| `getPluginManifestPath()` | Path to plugin.json within a plugin dir   |
| `readPluginManifest()`    | Read and parse plugin.json from a dir     |

Note: `getPluginManifestPath()` is defined once (in `plugin-finder.ts`) and re-exported via the `plugins/index.ts` barrel; the skill and agent plugin compilers (`skill-plugin-compiler.ts`, `agent-plugin-compiler.ts`) import it from `../plugins` to resolve the output manifest path.

Plugin manifest directory: `.claude-plugin/` (`PLUGIN_MANIFEST_DIR` from `src/cli/consts.ts`)

## Plugin Discovery

**Function:** `discoverAllPluginSkills(projectDir)` at `src/cli/lib/plugins/plugin-discovery.ts`

Discovers all installed skill plugins in a project directory:

1. Reads `{projectDir}/.claude/settings.json` to find enabled plugins (`getEnabledPluginKeys`)
2. Looks up install paths in the global v2 registry `~/.claude/plugins/installed_plugins.json` (`resolvePluginInstallPaths`)
3. Filters to paths whose `.claude-plugin/plugin.json` exists (`getVerifiedPluginInstallPaths`)
4. Loads skills from each verified plugin directory via `loadPluginSkills`
5. Returns `SkillDefinitionMap` (alias for `Partial<Record<SkillId, SkillDefinition>>`); later plugins override earlier

Both discovery functions swallow their own errors and degrade to an empty result — discovery is advisory, never a hard failure.

| Function                       | Returns    | Purpose                                                     |
| ------------------------------ | ---------- | ----------------------------------------------------------- |
| `discoverAllPluginSkills(dir)` | skill map  | Full skill definitions from every enabled + verified plugin |
| `listPluginNames(dir)`         | `string[]` | Verified plugin KEYS (`{id}@{marketplace}`), not bare names |

## Plugin Info

**File:** `src/cli/lib/plugins/plugin-info.ts`

| Function                      | Purpose                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `getInstallationInfo()`       | `InstallationInfo` from `detectInstallation()`, or `null` when nothing installed |
| `formatInstallationDisplay()` | Format installation info for terminal display (used by `list`)                   |

```typescript
type InstallationInfo = {
  mode: InstallMode;
  name: string;
  skillCount: number;
  agentCount: number;
  configPath: string;
  /** Every directory that actually holds compiled agents; empty when no scope has any. */
  agentDirs: string[];
};
```

**`InstallationInfo.version` was REMOVED**. It only ever held the install mode, and `formatInstallationDisplay` prefixed it with `v`, so `list` printed `Installation: agents-inc vplugin`. The mode is now rendered once from `INSTALL_MODE_LABELS[info.mode]`.

**`InstallationInfo.skillsDir` was REMOVED** too, for the reason `agentsDir` became `agentDirs`: it carried the single project-scoped directory while the count beside it spanned both scopes, so the path and the number could disagree. Nothing read it — `formatInstallationDisplay` renders `agentDirs`, `mode`, `skillCount`, `agentCount` and `configPath` and never named it. A display type does not carry a single path for an artifact that is split by scope; `resolveInstallPaths(projectDir, scope)` is what answers "where do this scope's skills live".

**Counting rules in `getInstallationInfo()`:**

| Aspect         | Rule                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scopes counted | `installedScopes()` — `["project"]` at the home root, `["global", "project"]` in a project context (a project also owns HOME)                                      |
| Skill count    | `mode === "plugin"` counts registry-discoverable skills via `discoverAllPluginSkills`; otherwise counts dirs under each `skillsDir`                                |
| Agent count    | `countCompiledAgentsPerScope()` counts `*.md` files per scope's `agentsDir`, keyed by directory                                                                    |
| `agentDirs`    | Only directories with a non-zero count — a default project install compiles every agent under HOME, so naming the project dir would name a directory never written |

## Settings Integration

**File:** `src/cli/lib/permission-checker.tsx`

`readSettingsPermissions()` reads `permissions` out of every `settings.json` / `settings.local.json` and says nothing about any other field. The file belongs to Claude Code, which adds keys on its own release schedule, so no expected-key list for it can be kept complete — the CLI consumes one key and owns none. `settingsFileSchema` models only `permissions` and passes the rest through untouched. Unknown-field warnings remain for files this CLI does own (`marketplace.json`, via `source-fetcher.ts`).

**Do not reintroduce an expected-keys allowlist here.** `warnUnknownFields(raw, EXPECTED_SETTINGS_KEYS, ...)` needs a new entry every time Claude Code — or this CLI's own plugin-install path, which writes `enabledPlugins` and `extraKnownMarketplaces` — grows one, a race the list cannot win.

`settings.local.json` wins over `settings.json` for the `permissions` block; a malformed file warns and is skipped rather than throwing.

## Plugin Validation

**Function:** `validatePlugin()` in `src/cli/lib/plugins/plugin-validator.ts`

Validates:

- Plugin structure via `validatePluginStructure()` (manifest dir exists) — exported
- Plugin manifest via `validatePluginManifest()` (valid JSON, required fields) — exported
- Skill files via `validatePluginSkillFiles()` (SKILL.md has valid frontmatter) — **private**, runs only when the manifest declares `skills`
- Agent files via `validatePluginAgentFiles()` (agent .md files have valid frontmatter) — **private**, runs only when the manifest declares `agents`

A `pluginPath` that no longer exists on disk fails `validatePluginStructure()` and surfaces as an invalid plugin rather than a crash — this is what lets `doctor`'s plugins content check walk registry-recorded install paths directly.

Individual frontmatter validators (exported):

- `validateSkillFrontmatter()` - Validate a single SKILL.md file
- `validateAgentFrontmatter()` - Validate a single agent .md file

**Function:** `validateAllPlugins()` - Validate all plugins in a directory.

**Function:** `printPluginValidationResult()` - Format validation results for display.

## Manifest Generation

| Function                        | Purpose                               |
| ------------------------------- | ------------------------------------- |
| `generateSkillPluginManifest()` | Generate manifest for a skill plugin  |
| `generateAgentPluginManifest()` | Generate manifest for an agent plugin |
| `writePluginManifest()`         | Write plugin.json to disk             |

Options types:

- `SkillManifestOptions`
- `AgentManifestOptions`

## Stack Plugin Compilation — there is none

**A stack is never bundled as a plugin.** The only two plugin kinds this CLI builds are skill
plugins and agent plugins (Manifest Generation above); there is no third builder, no
`stack-installer.ts`, and no manifest shape for a stack. The check is that no module named for one
exists and nothing imports one:

```
ls src/cli/lib/stacks/
grep -rn 'StackPlugin\|stack-installer' src e2e scripts
```

Stacks reach a project through the **install path** instead: `loadStackById` (`lib/stacks/`) is
called from `local-installer.ts`, whose `existingStack` is merged into the config the wizard result
produces, and the agents that result names compile through `writeCompiledAgentsByScope`. See
[compilation-pipeline.md](./compilation-pipeline.md).

## Stale Plugin Pruning (`build plugins`)

**File:** `src/cli/commands/build/plugins.ts` (the `build plugins` command; no `--marketplace` — it reads a local directory).

After a clean full-scan skill compile (`compileAllSkillPlugins`), `pruneStaleSkillPlugins(outputDir, expectedSkillPlugins)` deletes plugin directories in `outputDir` that no longer map to a compiled skill. Guards:

- **Only skill plugins are pruned.** A directory is skipped when it has no `plugin.json` (`readPluginManifest()` returns `null`) or when the manifest declares `agents` (agent plugins are out of this run's authority).
- **Pruning is skipped entirely** (`compileSkills()` returns `null`) in single-skill mode (`--skill`, which would wipe every other plugin) or when any skill failed to compile (a failed skill is indistinguishable from a removed one, so the expected set would be incomplete).

## Plugin Settings and the claude CLI v2 Registry

**File:** `src/cli/lib/plugins/plugin-settings.ts`

| Function                                      | Purpose                                                                                        | On failure                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `getEnabledPluginKeys(projectDir)`            | Keys whose value is `true` in `{projectDir}/.claude/settings.json` -> `enabledPlugins`         | `verbose()` + `[]`                               |
| `getInstalledPluginsRegistryPath(pluginsDir)` | `{pluginsDir}/installed_plugins.json`                                                          | n/a (pure path)                                  |
| `listRegisteredPluginInstalls(pluginsDir)`    | EVERY install recorded in that registry, flattened to unique `(pluginKey, installPath)` pairs  | **throws** — the registry is the source of truth |
| `resolvePluginInstallPaths(keys, projectDir)` | Resolve the given keys against `getUserPluginsDir()`'s registry, one pick per key              | `verbose()` + `[]`                               |
| `getVerifiedPluginInstallPaths(projectDir)`   | `getEnabledPluginKeys` -> `resolvePluginInstallPaths` -> keep only paths whose manifest exists | `verbose()` + `[]`                               |

Types:

- `PluginKey` — `string`. Format `{plugin-name}@{marketplace}` (deliberately not a union: plugin and marketplace names are user-extensible).
- `ResolvedPlugin` — `{ pluginKey: PluginKey; installPath: string }`.

### `installed_plugins.json` (v2 registry layout)

claude CLI >= 2.1.220 records installs in `{pluginsDir}/installed_plugins.json` and installs under a `cache/<marketplace>/<plugin>/<version>/` layout, so the plugin directories are NOT direct children of the plugins dir any more. The Zod schemas at this parse boundary are `installedPluginsSchema` (top-level, `.passthrough()`) wrapping `pluginInstallationSchema` (per-record, plain `z.object`):

```typescript
{
  version: number,                 // 2
  plugins: Record<PluginKey, Array<{
    scope: "user" | "project" | "local",
    projectPath?: string,
    installPath: string,           // required
    version: string,               // required
    installedAt: string,           // required
    lastUpdated?: string,
    gitCommitSha?: string,
  }>>
}
```

**Selection precedence** (`pickInstallation`, private): this project's own `scope: "project"` record whose `projectPath === projectDir` wins; otherwise the `scope: "user"` record. No other scope is picked.

**Asymmetry to know:** `resolvePluginInstallPaths` always reads `getUserPluginsDir()`'s registry (`~/.claude/plugins/`), while `getEnabledPluginKeys` reads the settings file under the directory it is handed. `getVerifiedPluginInstallPaths(baseDir)` therefore means "plugins enabled at `baseDir`, resolved through the single global registry" — which is what the doctor check relies on when it passes a per-scope `installBaseDir`.

**Error policy split:** `listRegisteredPluginInstalls` throws on an unreadable or schema-invalid registry (callers treat it as authoritative), whereas `resolvePluginInstallPaths` degrades to `[]` (it feeds advisory discovery).

Test helper: `writeTestInstalledPluginsRegistry(pluginsDir, installPathsByKey)` in `src/cli/lib/__tests__/helpers/disk-writers.ts` writes this shape.

## Marketplace

### Marketplace Type (`src/cli/types/plugins.ts`)

```typescript
type Marketplace = {
  $schema?: string;
  name: string;
  version: string;
  description?: string;
  owner: MarketplaceOwner;
  metadata?: MarketplaceMetadata;
  plugins: MarketplacePlugin[];
};
```

### Marketplace Generation

**File:** `src/cli/lib/marketplace-generator.ts`

Generates `marketplace.json` from a source directory containing skills. Exports: `generateMarketplace()` (build the `Marketplace` object), `writeMarketplace()` (write it to disk), `getMarketplaceStats()` (the total plus a per-`category` breakdown, which `build marketplace` prints as `Category breakdown:`), and the two namespace guards below. An entry carrying no `category` — a plugin authored outside this CLI — falls into an `uncategorized` bucket.

### Namespace guards

**A plugin's `name` in `marketplace.json` is a skill id**, so the same namespace rule that governs
skill ids governs what this module will emit. Two exported guards enforce it, and `build marketplace`
calls them in this order:

| Guard                                        | Answers                                             | Returns                                       |
| -------------------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| `validateMarketplaceName(name, packageName)` | Is this marketplace claiming a reserved namespace?  | The refusal text, or `null`                   |
| `validateSkillIdNamespace(marketplace)`      | Does every plugin name begin `<marketplace-name>-`? | The refusal text listing offenders, or `null` |

`RESERVED_MARKETPLACE_NAMES` is `[DEFAULT_PUBLIC_SOURCE_NAME, "external", "local"]`. The public
catalogue is exempted by **package identity** — `packageName === PUBLIC_CATALOGUE_PACKAGE` — never by
the name a manifest claims. `validateSkillIdNamespace` then reads its own exemption off the NAME, and
is only safe because the first guard already gated that name on package identity. Do not reorder or
split them. The rule itself, the reserved names and the load-side half:
[`skills-and-matrix.md` § The Skill-Id Namespace](./skills-and-matrix.md); the command's flags and
exit codes: [`reference/commands/index.md`](../commands/index.md).

### The manifest a build is allowed to write

`build marketplace` refuses when what it is about to write is a manifest this CLI cannot read back,
and every refusal lands before `writeMarketplace`, so a refused build writes nothing:

| Condition                                                                           | Read from               | Where                       | Refusal                                                                                  |
| ----------------------------------------------------------------------------------- | ----------------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `owner.name` would be empty — no `author`, or an `author` string parsing to no name | `package.json` `author` | identity, pre-scan          | `marketplaceOwnerHasNoName`, `EXIT_CODES.ERROR`                                          |
| the name is not kebab-case — an npm scoped name such as `@scope/thing` is the case  | `package.json` `name`   | identity, pre-scan          | `marketplaceNameNotPublishable`, `EXIT_CODES.ERROR`, naming every offending character    |
| the scan found no plugins at all                                                    | the plugins directory   | after `generateMarketplace` | `noPluginsToPublish`, `EXIT_CODES.ERROR`, naming the directory scanned and both ways out |

The first two sit in `loadMarketplaceIdentity` beside the reserved-name check; the third cannot be
known until the scan has run, which is why it sits with the scan rather than beside them. The first
two refusal builders live in `src/cli/utils/messages.ts`; `noPluginsToPublish` is local to the
command, having one caller and composing nothing another surface must agree with. A `--name`
override is judged by the same `validateKebabCaseName` rule and refused separately with
`EXIT_CODES.INVALID_ARGS`, because an argument the author typed is one they can retype while a
derived name is a fact about their package — its way out is the flag, not a package rename.

**These are producer-side enforcement of what the consumer already refuses, and the correspondence
is close to exact.** Of the constraints `marketplaceSchema` places on a manifest —
`name.min(1).regex(KEBAB_CASE_PATTERN)`, `version.min(1)`, `owner.name.min(1)` (via
`marketplaceOwnerSchema`) and `plugins.min(1)` — three have a matching pre-write refusal in the table
above, so the same file cannot be written by this command and then thrown on by `fetchMarketplace`
reading it. `claude plugin marketplace add` holds its own half, rejecting `/`, `\`, `.` and `..` in a
marketplace name.

**`version` is the one that does not correspond.** `packageJsonSchema` types it `z.string()` with no
minimum, and `generateMarketplace` defaults it with `??`, which an empty string passes through — so
a package.json carrying `"version": ""` produces a manifest this CLI writes and then throws on.

### A marketplace name is kebab-case on LOAD as well as on publish

`marketplaceSchema.name` in `src/cli/lib/schemas.ts` is
`z.string().min(1).regex(KEBAB_CASE_PATTERN, …)`, so a `marketplace.json` whose name is not
kebab-case is refused when it is READ — not only when this CLI would write one. The rule is
lowercase letters, numbers and hyphens, starting with a letter; `KEBAB_CASE_PATTERN` in
`src/cli/consts.ts` is the single definition and additionally forbids a doubled or trailing hyphen.

**Both directions of the rule are the same constant**, which is the point: the emit side reaches it
through `validateKebabCaseName` (`src/cli/lib/validate-kebab-name.ts`), called by
`resolvePublishableName` in `src/cli/commands/build/marketplace.ts`, and the load side through the
`regex` check above, called from `fetchMarketplace` in `src/cli/lib/loading/source-fetcher.ts` via
`marketplaceSchema.safeParse`. A manifest this CLI publishes is therefore always one it can read
back, and a third-party manifest is held to what Claude Code will register it under rather than to
something only this CLI cares about.

Two authoring consequences:

| Situation                                              | What happens                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| A hand-written `marketplace.json` named `@scope/thing` | Refused at load. The remedy is renaming the manifest's `name`, not a flag — nothing overrides a load |
| A manifest built by `build marketplace`                | Cannot reach this refusal: `resolvePublishableName` already refused the same name pre-write          |

The refusal text is `MARKETPLACE_NAME_REFUSAL` in `schemas.ts`, worded to match
`marketplaceNameNotPublishable` in `src/cli/utils/messages.ts` so the two directions of one rule
cannot come to say different things. It is attached as a `message` on the `regex` check rather than
written as a `refine` on purpose — a refinement is unrepresentable in JSON Schema, and
`src/schemas/marketplace.schema.json` would silently lose the `pattern` an editor validates against.

### Marketplace Commands (via Claude CLI)

Executed through `src/cli/utils/exec.ts`:

| Function                            | Shell Command                                                                                                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claudePluginInstall()`             | `claude plugin install {ref} --scope {scope}` — one call per skill, at that skill's own scope                                                                                                                                                              |
| `claudePluginUninstall()`           | `claude plugin uninstall {name} --scope {scope}` (swallows "not installed"/"not found")                                                                                                                                                                    |
| `claudePluginUninstallBestEffort()` | Calls `claudePluginUninstall({ref})` on the primary scope then the fallback scope, swallowing errors on each. **Sole production caller: `uninstallPlugins()` in `src/cli/commands/uninstall.tsx`** — `mode-migrator.ts` moved to a scope-precise uninstall |
| `claudePluginMarketplaceList()`     | `claude plugin marketplace list --json`                                                                                                                                                                                                                    |
| `claudePluginMarketplaceExists()`   | Checks if marketplace is registered (calls List)                                                                                                                                                                                                           |
| `claudePluginMarketplaceAdd()`      | `claude plugin marketplace add {source}`                                                                                                                                                                                                                   |
| `claudePluginMarketplaceRemove()`   | `claude plugin marketplace remove {name}`                                                                                                                                                                                                                  |
| `claudePluginMarketplaceUpdate()`   | `claude plugin marketplace update {name}`                                                                                                                                                                                                                  |
| `isClaudeCLIAvailable()`            | `claude --version` (returns boolean)                                                                                                                                                                                                                       |

`claudePluginInstall()` and `claudePluginUninstall()` accept a `scope: ClaudePluginScope` (`"project" | "user"`, defined in `src/cli/types/config.ts`) and a `projectDir` parameter. User-scoped operations run from `os.homedir()` via `resolvePluginCwd()` (scope `"user"` -> `os.homedir()`, else `projectDir`) so Claude CLI writes to `~/.claude/settings.json`. All inputs validated for injection prevention (`validatePluginPath()` / `validatePluginName()`) before execution. A non-zero exit throws `Plugin installation failed: <stderr or stdout>`.

### What each skill is installed with

**One `claude plugin install` per skill, never a batch**, and the scope is read per skill rather than passed once for the call. `installPluginSkills` (`operations/skills/install-plugin-skills.ts`) loops `config.skills` filtered to `origin !== EJECT_SOURCE` and for each one:

| Argument  | Built by                                           | Value                                                           |
| --------- | -------------------------------------------------- | --------------------------------------------------------------- |
| the ref   | `buildMarketplacePluginRef(skill.id, marketplace)` | `{skillId}@{marketplace}` — a bare id matches no registry entry |
| `--scope` | `toClaudePluginScope(skill.scope)`                 | `"global"` -> `user`; `"project"` and `undefined` -> `project`  |
| the cwd   | `resolvePluginCwd(scope, projectDir)`              | `os.homedir()` for `user`, `projectDir` otherwise               |

Passing one uniform scope for a mixed list is the defect this shape prevents: a project-context run installs a global-scoped skill at Claude **user** scope and a project-scoped one at **project** scope, in the same loop.

**There is no plugin-to-eject fallback, and adding one is forbidden.** A per-skill failure is captured into `PluginInstallResult.failed` and the function itself never throws — so the CALLER carries the obligation: it must hard-error with `pluginInstallFailureError(failed.length)` at `EXIT_CODES.ERROR` **before** any config is written. Falling back to eject, or writing config anyway, leaves `config.ts` claiming `origin: "<marketplace>"` for a skill that was never installed. Uninstall failures are diagnostic-only; install failures are not.

**A second refusal fires before anything is attempted.** `unbackedPluginSkillIds(skills, matrix)` names skills asking for plugin install that no marketplace carries — `isLocalSource`-style locality is read through `isLocalOnlySkill`, the same predicate the Sources grid uses to decide whether to offer the plugin cell at all. Its message is deliberately **not** `pluginInstallFailureError`: "refresh the marketplace and check the id" are impossible instructions for a skill the user wrote themselves, so `unbackedPluginInstallError(ids)` says to set it to Local or publish it instead.

### `ClaudeConfigOptions` — driving a foreign Claude installation

Every `claude plugin` wrapper in `exec.ts` takes an optional trailing `options?: ClaudeConfigOptions`, which is `{ configDir?: string }`. When set, `configDirEnv` puts `CLAUDE_CONFIG_DIR=<dir>` on the child process's environment; when absent it contributes nothing at all, so the call inherits its process's environment untouched.

`configDir` redirects the **entire** Claude config tree — the marketplace registry, the installed-plugin registry and user settings all move with it — and `CLAUDE_CONFIG_DIR` takes precedence over `HOME` in the Claude CLI, so it overrides an exported `HOME` rather than merely competing with it. That is what lets a test drive a real `claude` binary without touching the machine running it. Nothing under `src/cli/commands/` passes it today — re-derive with `grep -rn 'configDir' src/cli`, which finds only the unrelated `loadStacks(configDir, …)` parameter; every caller that does pass it lives under `e2e/`.

## Plugin Reference Formats

Two distinct plugin-ref shapes exist. They are NOT interchangeable -- each is consumed by a different system.

| Form                      | Where                                                           | Who emits                                       | Who consumes                                                              | Purpose                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `{skillId}@{marketplace}` | `installPluginSkills`, `uninstallPluginSkills`, `mode-migrator` | `buildMarketplacePluginRef()` (`plugin-ref.ts`) | `claude plugin install` / `claude plugin uninstall` shell commands        | Tells Claude CLI which marketplace to pull the plugin from (same qualified ref for install AND uninstall -- bare ids do not match the registry) |
| `${id}:${id}`             | `compileAgentForPlugin` via `pluginRefFor`                      | `compiler.ts` (both functions live here)        | Rendered agent prompt (frontmatter `skills:` + body `skill:` invocations) | Tells Claude Code that a referenced skill is plugin-installed (vs ejected)                                                                      |

**`plugin-ref.ts` helpers** (`src/cli/lib/plugins/plugin-ref.ts`, re-exported via `plugins/index.ts`):

- `buildMarketplacePluginRef(id, marketplace)` -> `${id}@${marketplace}` -- the registry form the Claude CLI expects.
- `parseMarketplacePluginRef(ref)` -> skill id (returns the whole string when no `@` is present) -- inverse of the above.
- `toClaudePluginScope(scope)` -> `ClaudePluginScope` -- maps cc `SkillScope` to Claude CLI scope (`"global"` -> `"user"`; anything else, including `undefined` -> `"project"`).

`pluginRefFor(skill)` (private to `src/cli/lib/compiler.ts`) returns `{}` — no `pluginRef` key — when `skill.source` is `"eject"` (`EJECT_SOURCE`) or `undefined`, producing a bare id in the compiled agent output. User-authored local skills (no `SkillConfig` entry, therefore no `source`) legitimately fall through to bare id -- this is the expected path, not a silent fallback.

**`SkillReference.source` and `SkillConfig.origin` are the same value under two names.** The config type calls the field `origin`; `buildCompileAgents` threads it onto each `SkillReference` as `source`, and the compiler reads it there. Grep for whichever name the layer you are in uses — a search for `.source` misses every config-side site and a search for `.origin` misses every compiler-side one.

### Verified benign: `sourceById` id-keyed map vs dual-scope same-id skills

`buildCompileAgents` (`local-installer.ts`) builds `sourceById = new Map<SkillId, string>(config.skills.map((s) => [s.id, s.origin]))` keyed by `SkillId` alone. The config's dual-scope compound key is `(id, scope)`, so a last-write-wins map could theoretically stamp the wrong `source` onto a compiled `SkillReference` when the same id appears twice (e.g. active project-eject entry + global tombstone with a different source).

**The collapse is NOT reachable through any production command.** Two independent safeguards prevent it:

1. **Tombstones are filtered before `buildCompileAgents` in every live path.** `init`, `edit`, and `compile` all route through the operations-layer `compileAgents` -> `recompileAgents`, which calls `filterExcludedEntries(projectConfig)` (`agent-recompiler.ts`) -- keeping only `!s.excluded` skills -- BEFORE `buildCompileAgents`. The tombstone is dropped, so `sourceById` never sees two entries for one id.
2. **Config ordering makes last-write-wins safe even without the filter.** `generateProjectConfigWithInlinedGlobal` (`config-writer.ts`) always emits global entries first, project (active) entries second; the active project entry (serialized last) wins the map.

Empirically confirmed by the E2E regression test `e2e/lifecycle/dual-scope-mixed-source-compiled-ref.e2e.test.ts`, which compiles a genuine dual-scope mixed-source config via `cc compile` and asserts the correct per-scope ref format in both directions. The format decision itself is `pluginRefFor` in `compiler.ts` (`source === undefined || "eject"` -> bare id; otherwise `id:id`).

## Installation Modes

### Plugin Mode

Skills installed as Claude Code plugins, agents compiled to `.claude/agents/`.

**Entry point:** `BaseCommand.installPluginSkillsReported()` (`src/cli/base-command.ts`), reached
from `init.tsx` directly and from `applyPluginChanges()` in `edit.tsx`.

### Eject Mode

Skills copied locally via eject workflow.

**Entry point:** `copyLocalSkills()` (`src/cli/lib/operations/skills/copy-local-skills.ts`), reached
via `copyEjectSkillsStep()` in `init.tsx` and directly from `applyPluginChanges()` in `edit.tsx`.

Both modes then share the same tail: `writeProjectConfig()`
(`src/cli/lib/operations/project/write-project-config.ts`) followed by
`compileAgentsAllScopes()` (`src/cli/lib/operations/project/compile-agents-all-scopes.ts`), which
compiles agents through `compileAgents` -> `recompileAgents`. There is no separate install-side
compile surface.

### Scope-Aware Installation

`writeScopedFromWizard()` in `src/cli/lib/config-gate/index.ts` is the single scope-splitting writer. Signature:

```typescript
writeScopedFromWizard(args: WizardWriteArgs): Promise<GateReport>

type WizardWriteArgs = {
  finalConfig: ProjectConfig;
  matrix: MergedSkillsMatrix;
  agents: Partial<Record<AgentName, AgentDefinition>>;
  projectDir: string;
  projectConfigPath: string;
  projectInstallationExists: boolean;
  /** How much of what it can see this session owns. Read by the PROJECT branch only. */
  authoritativeScope?: AuthoritativeScope;
};

type GateReport = {
  /** True when either half of the global pair was actually rewritten. */
  globalWritten: boolean;
  /** What moved between the config on disk and the one written. */
  changes: GlobalChangeSet;
  /** Registered project dirs this write's propagation rewrote, and the ones it
   *  could not reach. */
  propagated: { updated: string[]; skipped: string[] };
  /** The recompile the GATE already performed in `propagated.updated`. */
  recompile: {
    rewrittenCount: number;
    unchangedCount: number;
    failedCount: number;
    warnings: string[];
  };
};
```

- Global-scoped skills/agents go to `~/.claude-src/config.ts` and `~/.claude/agents/`
- Project-scoped skills/agents go to `{projectDir}/.claude-src/config.ts` and `{projectDir}/.claude/agents/`

**Two branches, keyed on `isHomeDirectory(projectDir)`:**

| Branch                   | Behaviour                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home root (global scope) | Classify against the config on disk -> `writeGlobalPair(finalConfig)` (both halves, write-if-changed) -> propagate to every entry in `finalConfig.projects` -> recompile those projects                                |
| Project context          | `splitConfigByScope(finalConfig)` -> `resolveEffectiveGlobalConfig` (merge + register) -> classify -> conditional global pair write -> propagate + recompile per the tier -> **reconcile** -> `writeProjectConfigPair` |

**`authoritativeScope` is read by the project branch only.** It is handed to `resolveEffectiveGlobalConfig` -> `mergeConfigs`, and decides whether the global config is made to MATCH this session (`"all"`) or merely absorb it (`"owned"`); `undefined` (init) keeps the additive default. The home branch writes the whole global config from `finalConfig` either way, so the word does not reach it. **It protects a config ROW, not the disk** — see [`concepts/scope-system.md`](../concepts/scope-system.md) § Two enforcement points, which owns that distinction.

**Project-branch write gate:** the project `config.ts` is written when `projectInstallationExists` OR the reconciled project split has any skills/agents. Creating a project config holding only `import globalConfig` + `{ ...globalConfig }` is pointless, so that case is skipped with a `verbose()` note.

**`writeScopedFromWizard` has exactly one caller:** `writeProjectConfig()`
(`src/cli/lib/operations/project/write-project-config.ts`). `init` and `edit` reach the gate only
through it.

It passes `!isHomeDirectory(projectDir)` as `projectInstallationExists`. In the project branch that argument is therefore always `true`, so the `hasProjectItems` disjunct and the skip branch are unreachable in production — the parameter name describes an intent no caller supplies. `writeProjectConfig` re-exposes the result as `ConfigWriteResult.propagation`.

Key config-write functions, now in `src/cli/lib/config-gate/` (`index.ts` is the module's only public surface; nothing below is re-exported by `installation/index.ts`):

| Function                                                                   | Exported | Purpose                                                                                           |
| -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| `setConfigMetadata()` (`local-installer.ts`)                               | yes      | Set source/marketplace/domains on config                                                          |
| `buildAndMergeConfig()` (`local-installer.ts`)                             | yes      | Build config from wizard and merge with existing                                                  |
| `buildCompileAgents()` (`local-installer.ts`)                              | yes      | Build agent compile config from `ProjectConfig`                                                   |
| `buildAgentScopeMap()` (`local-installer.ts`)                              | yes      | Map agent names to their scope (`activeAgentScopeMap`)                                            |
| `writeScopedFromWizard()`                                                  | gate     | Split and write configs by scope; propagates, recompiles, returns `GateReport`                    |
| `reconcileTypesFromDisk()`                                                 | gate     | Regenerate one scope's `config-types.ts` from its persisted config (used by `compile`)            |
| `mutateGlobal()` / `propagateGlobalRemoval()` / `ensureBlankPair()`        | gate     | Typed global mutation; global-uninstall prune + recompile; blank-pair creation                    |
| `writeProjectPartial()`                                                    | gate     | Project-only config writes; throws `GlobalPairWriteViolation` at `$HOME`                          |
| `mergeGlobalConfigs()`                                                     | gate     | Additive merge of new global items into the existing global config (never removes)                |
| `writeConfigFile()`                                                        | private  | Write config.ts using `generateConfigSource()`                                                    |
| `writeProjectConfigPair()`                                                 | private  | The ONE writer of a project's `config.ts` + `config-types.ts`, used by both emitting sites        |
| `propagateGlobalChangesToProjects()`                                       | private  | Rewrite every registered project's `config.ts` + `config-types.ts` against fresh global data      |
| `pruneGlobalEntriesFromRegisteredProjects()`                               | private  | Global-uninstall variant: propagates an EMPTIED global config so all global rows/tombstones drop  |
| `registerProjectPath()`                                                    | private  | Maintain the global `projects[]` registry (deregistration is `mutateGlobal`'s own mutation)       |
| `resolveEffectiveGlobalConfig()`                                           | private  | Merge + register; returns `{ config, globalDataChanged, changed }`                                |
| `reconcileProjectSplitAgainstGlobal()`                                     | private  | Cross-scope masking + self-heal — see Cross-Scope Reconciliation below                            |
| `classifyGlobalChange()` / `consequenceTier()`                             | private  | Decide what a write owes: T1 propagate+recompile, T2 config-half fan-out, T3 nothing, T4 no write |
| `writeGlobalPair()` / `writeGlobalConfigHalf()` / `writeGlobalTypesHalf()` | private  | The only writers of `~/.claude-src/config.ts` and `config-types.ts`; token-held, write-if-changed |
| `buildProjectTypesExtras()`                                                | private  | Input for `regenerateConfigTypes` (project extends global unions)                                 |

Path resolution lives outside both modules: `resolveInstallPaths(projectDir, scope)` (returns `InstallPaths`), `installBaseDir()`, `getProjectConfigPath()` in `src/cli/lib/installation/install-base-dir.ts`, and `isHomeDirectory()` in `src/cli/lib/installation/is-home-directory.ts`.

### Propagation Then Recompile

`propagateGlobalChangesToProjects()` rewrites a registered project's `config.ts` and `config-types.ts` but **never touches its compiled `.claude/agents/*.md`**. On its own that leaves the compiled agents emitting whatever skill-reference form the OLD global data dictated — so a global plugin-to-eject switch left stale `name:name` plugin references in every registered project.

The recompile is **inside the write**, not caller-side: a caller that must remember to recompile is a caller that can forget, and two did (`edit`'s project-context source migration, the global `uninstall`).

| Step | Symbol                                   | File                                                         | Role                                                                                                                                                                             |
| ---- | ---------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `propagateGlobalChangesToProjects(...)`  | `src/cli/lib/config-gate/propagate.ts`                       | Rewrites each registered project's pair; returns `{ updated, skipped }`                                                                                                          |
| 2    | `recompilePropagated(updated)`           | `src/cli/lib/config-gate/recompile.ts`                       | Runs in the same call, for a T1 change only; lazily imports the operation below                                                                                                  |
| 3    | `recompilePropagatedProjectAgents(dirs)` | `src/cli/lib/operations/project/recompile-project-agents.ts` | Sequential loop with per-project failure isolation; returns `PropagatedRecompileSummary`                                                                                         |
| 4    | `recompileRegisteredProjectAgents(dir)`  | same file                                                    | Recompiles ONE project's **project-scoped** agents (global agents were already done by the triggering operation's own pass)                                                      |
| —    | Renderers                                | `init.tsx`, `edit.tsx`, `compile.ts`, `uninstall.tsx`        | Each prints `GateReport.recompile`; the work is already done. `edit` prints `registered project(s)`, the others `registered projects` — both forms are asserted by e2e constants |

`recompileRegisteredProjectAgents` passes `skills` explicitly (from `discoverInstalledSkills`) — without it `recompileAgents` falls back to `discoverAllPluginSkills`, which sees plugin skills only and would strip every global-local and project-local skill from the compiled agents.

`PropagatedRecompileSummary` — `{ rewrittenCount: number; unchangedCount: number; failedCount: number; warnings: string[] }`. A project the fan-out visited whose agents all came back byte-identical is `unchangedCount`, not a recompile.

### Detection

**Function:** `detectInstallation(projectDir?)` in `src/cli/lib/installation/installation.ts`

Returns `Installation` — `{ mode, configPath, agentsDir, skillsDir, projectDir }`.

Detection logic:

1. Check for project-level installation via `detectProjectInstallation()`
2. If not found, fall back to global installation via `detectGlobalInstallation()`
3. Both delegate to the private `detectInstallationInDir(dir)`

`detectInstallationInDir` returns `null` in exactly three cases, and **throws in a fourth**:

| Case                                              | Result                                                                              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `.claude-src/config.ts` absent                    | `null`                                                                              |
| File vanished between `fileExists` and the load   | `null`                                                                              |
| Config declares neither skills nor agents         | `null` — content-less configs are not installations, so `init` routes to the wizard |
| Config present but unparseable / schema-violating | `ConfigLoadError` propagates out of `loadProjectConfigFromDir`                      |

The last row keeps a corrupt config distinguishable from "no config" — collapsing the two detects a phantom eject installation and makes `compile` rebuild every built-in agent. `compile` hard-errors before any write, `detectProject` converts the error to `null` so `doctor` and `edit` report a config problem, and detection no longer fabricates an installation.

`skillsDir` is `.claude/plugins` in `"plugin"` mode and `.claude/skills` otherwise (mixed mode has local skills on disk, so it uses the eject-mode directory).

Install mode is derived at runtime from the skills array via `deriveInstallMode()`:

- Empty skills array = `"eject"` mode (default)
- All `origin: "eject"` = `"eject"` mode
- All non-eject origins = `"plugin"` mode
- Mixed = `"mixed"` mode

**per-skill `source` is authoritative for compilation:** Aggregate `installMode` is a UI/logging convenience, NOT the input that drives agent compilation. `compileAgentForPlugin` (`src/cli/lib/compiler.ts`) calls `pluginRefFor(skill)` for each `SkillReference` and attaches `pluginRef` only when `skill.source` is a non-eject, non-undefined marketplace name. Mixed-mode agents (plugin and eject skills under the same agent) and dual-scope skills (same id, different scope, different sources) each render correctly from per-skill `source`.

**`installMode` reaches only its genuine consumers:** no compile-path wrapper carries the mode. `RecompileAgentsOptions` (`agent-recompiler.ts`) has no `installMode` parameter and there is no `CompileAndWriteParams` type. Aggregate `installMode` lives in exactly two places: `init.tsx` computes `deriveInstallMode(activeSkills)` to drive the install plan/logging (`logInstallPlan`, and whether `copyEjectSkillsStep` runs), and `SkillSource.installMode?` (`src/cli/types/matrix.ts`) is a per-source UI descriptor.

## Cross-Scope Reconciliation (Masking)

**File:** `src/cli/lib/config-gate/propagate.ts`. Every reconciliation helper named below is **module-private** — none is exported through `config-gate/index.ts`, and `installation/index.ts` no longer re-exports anything in this area. The two write sites (`propagateGlobalChangesToProjects`, the project branch of `writeScopedFromWizard`) both funnel into the shared `writeProjectConfigPair`.

### Why it exists

Two production call sites write a project `config.ts` with the global config inlined (`writeConfigFile(..., { isProjectConfig: true, globalConfig })`). Both must reconcile the project's own entries against the live global config first, or the project ends up with **one id active at both scopes** — and, when category exclusivity is involved, two live skills in a category that permits one. Symptoms observed against the built CLI: the wizard showed both selected, the next save seeded both into a fresh agent stack, and the compiled agent was instructed to load two frameworks — while `doctor` reported the install clean and exited 0 through both of its layers, because neither the content checks nor the operational checks read config semantics.

| Write site                                                      | Reconciled                                          |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `propagateGlobalChangesToProjects()` (a global change fans out) | yes — via `reconcileProjectSplitAgainstGlobal`      |
| project branch of `writeScopedFromWizard()`                     | yes — via the SAME helper (previously: none at all) |

The "previously: none at all" is the whole defect: that branch handed `splitConfigByScope`'s raw output straight to the inlining writer, so a project owning a skill at project scope while the same id was active globally got TWO active entries in its own `config.ts` — no propagation involved and no category rule needed. [agent-system.md](./agent-system.md) → "Global-Agent Propagation" carries the full account. The companion defect was that category exclusivity had a single enforcement point, `toggleTechnology` — a keypress handler — so any write path not driven by a keystroke could seat two skills in a category that permits one. It is enforced on the write path now, in two places: `buildProjectCollisionTest` (`config-gate/propagate.ts`) counts an occupied exclusive category as a masking collision, and `compactCategoryAssignments` (`configuration/config-writer.ts`) throws rather than emit a category the config cannot express, since dropping the extra would write a config that does not match what was selected. Both read `exclusive` from the merged matrix and deliberately treat a category the matrix does not DECLARE as non-exclusive; `use-build-step-props.ts` defaults an undeclared category to exclusive (`cat?.exclusive ?? true`) and that asymmetry is intended — a rule that masks or rejects PERSISTED entries may only fire on a flag the data actually carries.

### Entry point

```typescript
reconcileProjectSplitAgainstGlobal(
  projectSplit: ProjectConfig,
  globalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): ProjectConfig
```

Order is fixed and load-bearing — **self-heal runs BEFORE masking on both axes**, so a mask whose collision has cleared is removed rather than immediately re-derived, and masking's `alreadyTombstoned` guard only sees still-warranted tombstones:

1. `dropOrphanedDerivedMasks(projectSplit.skills, matrix)` -> `healedSkills`
2. `dropOrphanedDerivedAgentMasks(projectSplit.agents)` -> `healedAgents`
3. `skills: [...healedSkills, ...maskCollidingGlobalSkills(healedSkills, globalConfig, matrix)]`
4. `agents: [...healedAgents, ...maskCollidingGlobalAgents(healedAgents, globalConfig)]`

**Masking is PROJECT-LOCAL.** The `globalConfig` argument is read, never rewritten — a tombstone never belongs in `~/.claude-src/config.ts`.

### Collision kinds

`buildProjectCollisionTest(projectOwnedSkills, matrix)` returns the single `(id) => boolean` predicate shared by the mask producer AND the self-heal, so the two can never disagree about what a mask means.

| Kind         | Condition                                                                                                        | Applies to                              | Task |
| ------------ | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---- |
| **IDENTITY** | The project owns the same id/name at project scope (`isActiveAt(entry, "project")`)                              | skills AND agents                       |
| **CATEGORY** | The project owns a DIFFERENT active skill in the same category and the matrix declares that category `exclusive` | skills only — agents have no categories |

Supporting helpers:

| Helper                                    | Rule                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `categoryOfSkill(id, matrix)`             | `matrix.skills[id]?.category`; `undefined` when the id is absent from the matrix OR sits in `LOCAL_PSEUDO_CATEGORY`. Never throws. |
| `isExclusiveCategory(category, matrix)`   | `matrix.categories[category]?.exclusive === true` — read from the MERGED matrix so a source repo's overrides are honoured          |
| `activeProjectCategories(skills, matrix)` | Categories occupied by an active project-scoped skill                                                                              |

**A category the matrix does not carry is deliberately NOT treated as exclusive.** The wizard's toggle handler defaults the same lookup the other way — `matrix.categories[categoryId]?.exclusive ?? true` in `src/cli/components/hooks/use-build-step-props.ts`, the only site left that defaults it — but a rule that MASKS persisted entries must only fire on a category the data actually carries. Neither site defaults an absent FIELD: `CategoryDefinition.exclusive` is a non-optional `boolean` at every producer and at both parse boundaries. A custom skill absent from the matrix therefore participates in identity collisions only, and never throws. `LOCAL_PSEUDO_CATEGORY` (`"local"`, from `src/cli/consts.ts`) is excluded from category rules entirely.

### Mask producers

| Function                                                        | Emits                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `maskCollidingGlobalSkills(projectOwned, globalConfig, matrix)` | For each `isActiveAt(globalEntry, "global")` skill that collides and is not `alreadyTombstoned`: `{ ...globalEntry, excluded: true }` |
| `maskCollidingGlobalAgents(projectOwned, globalConfig)`         | Agent mirror, IDENTITY only                                                                                                           |

Tombstones are **spread from the global entry**, so they carry the global install's `origin`. A skill the project merely inherits (no active project-scope entry, no exclusive-category collision) is skipped — it stays a single active global entry. An id the project already tombstones is skipped, which is what makes re-running idempotent.

**Push-side symmetry:** because the tombstone is synthesized on the write/push side rather than at deselect time, a project that owned a skill or agent at project scope now gets its global tombstone when the same id **later** becomes active globally. Global-first and project-first installs therefore agree, and both render `[P][G]`.

### Self-heal (mask lifetime)

| Function                                               | Retention test                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `dropOrphanedDerivedMasks(projectOwnedSkills, matrix)` | Keep a global tombstone iff `buildProjectCollisionTest` still returns true for its id |
| `dropOrphanedDerivedAgentMasks(projectOwnedAgents)`    | Keep iff an active project-scoped agent of the same name still exists                 |

A derived mask and a user-authored tombstone are byte-identical on disk (`{ id, scope: "global", excluded: true }`). The wizard cannot mint the second kind: a project-scope deselect of a globally-installed item is refused, and a domain deselect only drops what the project owns. The one remaining user route to a global tombstone is the `s` scope toggle (G->P), which always pairs it with an active project entry for the same id — an IDENTITY collision. Every **bare** mask is therefore machine-derived by construction, which is what lets the retention rule collapse to a single test.

This generalised the earlier rule, which was narrowed to categories declared BOTH `exclusive` AND `required` precisely because provenance was ambiguous. That narrowing bought the distinction by category class: the only-skill guard refuses to empty such a category, so a lone tombstone there could only be machine-derived — at the price of a mask persisting in an OPTIONAL exclusive category after its collision cleared, leaving the user to re-select by hand. The narrowing and that trade-off are both gone; [tombstone-pattern.md](../concepts/tombstone-pattern.md) → "Creation outside the wizard — derived conflict masks" carries the full account.

### Deliberate asymmetry with the exclusive-swap guard

The project's own skill **wins locally**. This is intentionally the opposite of the wizard guard: `toggleTechnology` refuses a user-initiated exclusive swap that would displace a globally-locked skill (`wouldDropLockedSkill` -> `TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED`).

| Situation                                                                    | Winner           | Rationale                                                        |
| ---------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------- |
| User actively swaps to a different skill in an exclusive category (wizard)   | global (refused) | The user is displacing a shared install every project sees       |
| A global install lands on top of pre-existing project state (reconciliation) | project (masked) | Letting global win would silently uninstall the user's own skill |

Both are consistent with the rule that a globally installed item is immutable from project scope: reconciliation **masks** the global entry in the project's config, it never removes it from the global config.

### Companion retain/prune helpers (propagation path only)

These run in `propagateGlobalChangesToProjects` before the shared reconciliation:

| Function                                                         | Purpose                                                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `retainProjectOwnedSkills(skills, globalConfig)`                 | Keep project-scoped entries + tombstones whose global entry is still active; drop tombstones for removed globals |
| `retainProjectOwnedAgents(agents, globalConfig)`                 | Agent mirror                                                                                                     |
| `computeRemovedGlobalSkillIds(priorProjectSkills, globalConfig)` | Ids the project inherited from global, no longer active globally, and not owned at project scope                 |
| `retainReconciledStack(stack, removedGlobalSkillIds)`            | Drop only those ids from per-agent stack assignments; returns the input unchanged when nothing was removed       |
| `globalHasActiveSkill()` / `globalHasActiveAgent()`              | `isActiveAt(entry, "global")` probes against the live global config                                              |

Predicates come from `src/cli/lib/configuration/scope-predicates.ts`: `isActiveAt`, `isGlobalTombstone`, `isProjectOwned`, `activeProjectAgentNames`, `activeAgentScopeMap`, `effectivelyExcludedSkillIds`.

## Mode Migration

**File:** `src/cli/lib/installation/mode-migrator.ts`
(Re-exported from `src/cli/lib/installation/index.ts`)

Handles skill source and scope migrations when editing an installation:

| Function                                           | Purpose                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------- |
| `detectMigrations()`                               | Compare old/new `SkillConfig[]` to detect source/scope changes             |
| `executeMigration(plan, projectDir, sourceResult)` | Execute per-skill migration: copy/delete locals, install/uninstall plugins |

`executeMigration` takes `sourceResult` (a `SourceLoadResult`) because plugin install/uninstall needs `sourceResult.marketplace` to build qualified refs. A missing marketplace is handled asymmetrically: the `toEject` branch warns and skips its (diagnostic-only) plugin uninstalls, whereas the `toPlugin` branch throws before any destructive step -- plugin install intent is inviolable, so it fails while the ejected working copies are still intact rather than deleting them and demoting the failure to a warning.

Types:

- `SkillMigration` - Single skill migration with `id`, `oldSource`/`newSource`, `oldScope`/`newScope`
- `MigrationPlan` - Contains `toEject`, `toPlugin`, `scopeChanges` arrays
- `MigrationResult` - `{ ejectCopies: EjectCopyResult; pluginInstalls: PluginInstallResult; warnings: string[] }`. Both halves report structurally and in the same shape: `EjectCopyResult` is `{ copied: SkillId[]; failed: Array<{ id, error }> }` and `PluginInstallResult` (`operations/skills/install-plugin-skills.ts`) is `{ installed: Array<{ id, ref }>; failed: Array<{ id, error }> }`, so one command surface can narrate a migration's plugin half exactly as it narrates a fresh install. `warnings` carries the diagnostic-only plugin-uninstall failures from the toEject direction and nothing else

Migration splits skills by scope before copying (project skills to `{projectDir}/.claude/skills/`, global to `~/.claude/skills/`). Plugin refs are qualified via `buildMarketplacePluginRef(migration.id, sourceResult.marketplace)`. The toPlugin branch installs each plugin BEFORE deleting its ejected working copy (`deleteEjectedWorkingCopy()`), so a failed install destroys nothing -- per-skill failures accumulate in `MigrationResult.pluginInstalls.failed` for the caller to hard-error on. The toEject branch is the mirror: `copyMigratedSkillsToLocal` writes every local copy first and names the ones it could not in `MigrationResult.ejectCopies.failed`, and only the migrations whose copy LANDED have their plugin registration dropped.

**the toEject uninstall is SCOPE-PRECISE.** It calls `claudePluginUninstall(pluginRef, toClaudePluginScope(migration.oldScope), projectDir)`, targeting the migration's own registered scope, and NOT `claudePluginUninstallBestEffort()`. A both-scopes sweep would also drop a same-id plugin registered at the OTHER Claude scope — e.g. switching a project to eject would uninstall the still-registered global/user-scope plugin that other projects depend on. The registered scope is unambiguous here, so it is targeted exactly; `claudePluginUninstall` still swallows "not installed" / "not found".

Two scope-keyed skips guard the global registration in both directions:

| Branch     | Skip condition                                    | Reason                                                                                           |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `toEject`  | `oldScope === "global" && newScope === "project"` | The global plugin must remain for other projects; the project tombstone already masks it locally |
| `toPlugin` | same condition, in `deleteEjectedWorkingCopy()`   | The global ejected copy must remain for other projects                                           |

### Plugin Scope Migration (edit command)

`executeMigration` handles SOURCE changes (eject <-> plugin). SCOPE changes (project <-> global) for plugin-mode skills use a separate engine local to the `edit` command:

**Function:** `migratePluginSkillScopes(scopeChanges, skills, marketplace, projectDir)` in `src/cli/commands/edit.tsx` (exported `@internal` for testing). Iterates `Map<SkillId, ScopeChange>`, skips eject-mode skills (those route through `migrateLocalSkillScope` in the same command), and for each plugin-mode skill installs the marketplace-qualified ref (`buildMarketplacePluginRef(skillId, marketplace)`) at the new Claude scope (`toClaudePluginScope(change.to)`):

- **project -> global:** uninstall the `"project"`-scope registration, then install at `"user"` scope.
- **global -> project:** keep the global registration (other projects still need it), just install the added project scope.

**Type:** `PluginScopeMigrationResult` — `{ migrated: SkillId[], failed: Array<{ id: SkillId; error: string }> }`. Per-skill install/uninstall errors accumulate in `failed`; the caller (`applyScopeChanges` in `edit.tsx`) reports each through `reportIncompleteWork`, which warns AND ends the run on `EXIT_CODES.COMPLETED_WITH_FAILURES`. It is not the diagnostic a bare uninstall failure is: the call installs at the new scope, so a failure leaves the skill registered at neither. The marketplace is resolved first via `requireMarketplaceOrExit()`, and only when at least one plugin-mode scope change exists.

## Operations Layer (Plugin Operations)

Plugin-related operations extracted to `src/cli/lib/operations/`:

### Install Plugin Skills

**File:** `src/cli/lib/operations/skills/install-plugin-skills.ts`

**Function:** `installPluginSkills(skills, marketplace, projectDir)` -- Installs non-local skills as Claude CLI plugins. Filters to `origin !== EJECT_SOURCE`, builds refs via `buildMarketplacePluginRef(skill.id, marketplace)`, routes by `toClaudePluginScope(skill.scope)` (`"global"` -> `"user"` CLI scope, otherwise `"project"`). Errors from `claudePluginInstall` are captured per-skill; the function itself never throws.

**Type:** `PluginInstallResult` -- `{ installed: Array<{ id: SkillId; ref: string }>, failed: Array<{ id: SkillId; error: string }> }`

**Helper:** `pluginInstallFailureError(failedCount)` (exported from the same file) returns the canonical hard-error message callers pass to `this.error()`: _"Failed to install N plugin skill(s). Plugin install intent could not be honored. Verify the skill id matches the marketplace, run '<CLI_INVOKE_COMMAND> update' to refresh the marketplace, or switch affected skills to eject mode."_

**Hard-error contract (callers):** When `PluginInstallResult.failed` is non-empty, the run MUST `this.error(pluginInstallFailureError(...), { exit: EXIT_CODES.ERROR })` BEFORE `writeConfigAndCompile` runs — a new caller inherits that rather than writing its own copy. Otherwise `config.ts` claims plugin installation for skills that `claude plugin install` rejected, producing orphan entries that no `cc` command can self-heal (`detectInstallation` trusts `config.ts`). Enforced once, in `BaseCommand.reportPluginInstalls`, which every per-skill install site reaches: `handleInstallation` (`init.tsx`), `applyPluginChanges` (newly-added skills, `edit.tsx`), and `applyMigrations` (eject->plugin migrations, `edit.tsx` — the same guard covers the migration path via `MigrationResult.pluginInstalls.failed`). Uninstall failures are diagnostic-only (no orphan state). See the CLAUDE.md rule ("NEVER let plugin install per-skill failures silently produce orphan config entries").

### Uninstall Plugin Skills

**File:** `src/cli/lib/operations/skills/uninstall-plugin-skills.ts`

**Function:** `uninstallPluginSkills(skillIds, oldSkills, marketplace, projectDir)` -- Uninstalls plugins using scope from the OLD config entries (`toClaudePluginScope(oldSkills.find(s => s.id === skillId)?.scope)`; the new config has no entry for removed skills). Each ref is qualified via `buildMarketplacePluginRef(skillId, marketplace)` so it matches the form used at install time -- bare skill ids silently no-op against the registry.

**Type:** `PluginUninstallResult` -- `{ uninstalled: SkillId[], failed: Array<{ id: SkillId; error: string }> }`

**Install/uninstall symmetry.** The `marketplace` parameter was added so uninstall qualifies refs identically to install. Four call sites once passed a bare `skillId`; because the registry key IS the qualified ref, those uninstalls silently no-op'd — "not installed" is swallowed — leaving orphaned plugin registrations behind every migration, scope change and edit-time removal. Nothing caught it: both `claudePluginInstall` and `claudePluginUninstall` take the ref as a plain `string` (`pluginPath` / `pluginName`), so a bare id type-checks, and the `.mock.calls` assertions faithfully recorded the bare ids, so the tests stayed green while the product leaked.

**Which uninstall helper to use:**

| Situation                                                                           | Helper                                   | Why                                                                                    |
| ----------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Registered scope is KNOWN (old config entry, migration plan)                        | `claudePluginUninstall(ref, scope, dir)` | Scope-precise. A both-scopes sweep would also drop a same-id plugin at the other scope |
| Registered scope is genuinely AMBIGUOUS (`uninstall` cleaning up re-scoped plugins) | `claudePluginUninstallBestEffort()`      | Tries primary then fallback, swallowing both — one caller only                         |

### Ensure Marketplace

**File:** `src/cli/lib/operations/source/ensure-marketplace.ts`

**Function:** `ensureMarketplace(sourceResult)` -- Registers or updates the marketplace with the Claude CLI. Lazy-resolves marketplace name via `fetchMarketplace()` if `sourceResult.marketplace` is undefined; mutates `sourceResult.marketplace` in place. If lazy resolution fails, returns `{ marketplace: null, registered: false }` (callers then hard-error via `requireMarketplaceOrExit()` in `base-command.ts`, which wraps the operations-layer `requireMarketplace()` and calls `this.error()` on an unresolved marketplace -- see `init.tsx` and `edit.tsx`). On update failure, warns and continues with cached version. Silent operation otherwise -- callers decide logging.

**Type:** `MarketplaceResult` -- `{ marketplace: string | null, registered: boolean }`

Uses `claudePluginMarketplaceExists()`, `claudePluginMarketplaceAdd()`, and `claudePluginMarketplaceUpdate()` from exec.ts.

## Plugin Registry Verification

Plugin-mode skills leave no files under `.claude/skills/` — they live in the Claude plugin registry (`installed_plugins.json` + `settings.json`). Three independent code paths reconcile installed plugins against that registry.

### Doctor `Plugins` Content Check

**Function:** `validatePluginsDirectory(pluginsDir)` in `src/cli/lib/content-validator.ts` — module-private, reached through the exported `validateInstalledPlugins(projectDir)`, which runs it over `getUserPluginsDir()` and — outside the home root — `getProjectPluginsDir(cwd)`. It is the `Plugins` row of `doctor`'s content layer, the first of its two layers.

Resolution order per plugins directory:

| Step | Condition                                                                    | Action                                                                                  |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1    | Directory absent                                                             | `NOTHING_VALIDATED` — count 0, zero issues                                              |
| 2    | `installed_plugins.json` exists                                              | `validateRegistryPlugins()` — validate each recorded `installPath`                      |
| 3    | Registry records ZERO installs (`validateRegistryPlugins` -> `undefined`)    | Fall through to the direct-children scan                                                |
| 4    | Registry unreadable / schema-invalid (`listRegisteredPluginInstalls` throws) | One **error** issue against the registry file itself, count stays 0 — no scan around it |
| 5    | No registry                                                                  | `findPluginDirectories()` + `validateAllPlugins()` (older / manual layouts)             |

**The pass must not inspect only direct children of the plugins directory** — that makes the claude CLI >= 2.1.220 cache layout invisible and leaves installed plugins unvalidated. A recorded `installPath` that no longer exists surfaces as an invalid plugin through `validatePlugin`'s structure check.

Every row returns a `ContentValidation` (`count`, `issues`, `notes`); `doctor` maps it onto the same `CheckResult` shape its operational rows use, so one formatter and one exit code cover both layers. `doctor` itself has `static flags = {}` — it is a zero-flag command, as the `validate` it absorbed was.

### Doctor `Plugins Installed` Operational Check

**Function:** `checkPluginSkillsInstalled(config, projectDir)` in `src/cli/commands/doctor.ts` (check `kind: "plugins"`, labelled "Plugins Installed"). This is the second layer — it runs only when every content check above passed.

Filters `config.skills` to `origin !== EJECT_SOURCE`, groups them by `installBaseDir(projectDir, scope)`, and for each base dir reads the registry via `getVerifiedPluginInstallPaths(baseDir)` and maps each `ResolvedPlugin.pluginKey` through `parseMarketplacePluginRef()` back to a bare skill id. Any plugin-mode config skill whose id is absent from the registry is reported as `warn` ("N skills not installed as plugins"). Registry membership, not disk existence, is the source of truth for plugin-mode skills.

### CLI-Installed Key Derivation (uninstall)

**Function:** `getCliInstalledPluginKeys(config)` in `src/cli/commands/uninstall.tsx` (exported `@internal` for testing). Returns the `Set<string>` of registry keys this CLI installed, used by `detectUninstallTarget()` to narrow `listPluginNames()` to CLI-owned plugins (`cliPluginNames`) so uninstall never removes plugins the user installed by hand.

For each `config.skills` entry it emits the primary key `buildMarketplacePluginRef(skill.id, skill.origin)`, plus a marketplace variant `buildMarketplacePluginRef(skill.id, config.marketplaceName)` when `marketplaceName` is set and differs from both `skill.origin` and `EJECT_SOURCE` (covers plugins registered under the marketplace's own name while config recorded a differing `origin`).

**The variant keys on `marketplaceName`, not `marketplace`.** They are different fields: `marketplace` is the ref the user gave (a path or `github:` URL), `marketplaceName` is the name that marketplace's own manifest claims — and it is the name the Claude CLI registry keys plugins under. Reading the ref here builds a key no registry entry can match. The derivation therefore depends on `marketplaceName` surviving the merge: `mergeGlobalConfigs` must not drop it from the global config written during a project-scope init, or `uninstall --yes --all` at the home root finds no CLI-owned plugins, leaves every plugin registered, and then deletes the config that recorded them.

## Barrel Exports

### `src/cli/lib/plugins/index.ts`

| Source module         | Re-exported symbols                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin-manifest.ts`  | `SkillManifestOptions`, `AgentManifestOptions`, `generateSkillPluginManifest`, `generateAgentPluginManifest`, `writePluginManifest`                                                    |
| `plugin-ref.ts`       | `buildMarketplacePluginRef`, `parseMarketplacePluginRef`, `toClaudePluginScope`                                                                                                        |
| `plugin-finder.ts`    | `getUserPluginsDir`, `getProjectPluginsDir`, `getPluginAgentsDir`, `getPluginManifestPath`, `readPluginManifest`                                                                       |
| `plugin-info.ts`      | `InstallationInfo`, `getInstallationInfo`, `formatInstallationDisplay`                                                                                                                 |
| `plugin-validator.ts` | `validatePluginStructure`, `validatePluginManifest`, `validateSkillFrontmatter`, `validateAgentFrontmatter`, `validatePlugin`, `validateAllPlugins`, `printPluginValidationResult`     |
| `plugin-discovery.ts` | `discoverAllPluginSkills`, `listPluginNames`                                                                                                                                           |
| `plugin-settings.ts`  | `PluginKey`, `ResolvedPlugin`, `getEnabledPluginKeys`, `getInstalledPluginsRegistryPath`, `listRegisteredPluginInstalls`, `resolvePluginInstallPaths`, `getVerifiedPluginInstallPaths` |

### `src/cli/lib/installation/index.ts`

| Source module          | Re-exported symbols                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `installation.ts`      | `InstallMode`, `Installation`, `declaresNoContent`, `detectGlobalInstallation`, `INSTALL_MODE_LABELS`, `INSTALL_MODE_DESCRIPTIONS`, `detectInstallation`, `detectProjectInstallation`, `deriveInstallMode` |
| `local-installer.ts`   | `buildAndMergeConfig`, `setConfigMetadata`, `buildCompileAgents`, `buildAgentScopeMap` — **no config-pair writer is re-exported here**; that surface is `src/cli/lib/config-gate/index.ts`                 |
| `install-base-dir.ts`  | `installBaseDir`, `resolveInstallPaths`, `InstallPaths`                                                                                                                                                    |
| `is-home-directory.ts` | `isHomeDirectory`                                                                                                                                                                                          |
| `mode-migrator.ts`     | `EjectCopyResult`, `SkillMigration`, `MigrationPlan`, `MigrationResult`, `detectMigrations`, `ejectCopyFailureError`, `executeMigration`                                                                   |

**Exported by the module but deliberately absent from the barrel** — importers take these by direct path, or not at all:

| Symbol                                                                                                                                                                                                                                                                                                         | Module                     | Note                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| `mergeGlobalConfigs`                                                                                                                                                                                                                                                                                           | `config-gate/index.ts`     | Re-exported from the gate as a pure function                              |
| `getProjectConfigPath`                                                                                                                                                                                                                                                                                         | `install-base-dir.ts`      | Direct-path import                                                        |
| Every reconciliation helper (`reconcileProjectSplitAgainstGlobal`, `maskColliding*`, `dropOrphanedDerived*`, `retainProjectOwned*`, `retainReconciled*`, `buildProjectCollisionTest`, `categoryOfSkill`, `isExclusiveCategory`, `activeProjectCategories`, `computeRemovedGlobalSkillIds`, `globalHasActive*`) | `config-gate/propagate.ts` | Gate-private — eslint bans importing any `config-gate/*` file but `index` |

## Known Limitations

| Limitation                                  | Anchor                                                                                                                                                   | Detail                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Exclusive-category swap over a global skill | `maskCollidingGlobalSkills` / `reconcileProjectSplitAgainstGlobal` (`config-gate/propagate.ts`) vs `toggleTechnology` (`src/cli/stores/wizard-store.ts`) | The masking machinery is only reachable from ONE ordering — the project already owned the conflicting skill and a global install landed on top. The wizard cannot express the opposite intent: the exclusive-swap guard computes `wouldDropLockedSkill` from `isGloballyLockedSkill` and returns `TOAST_MESSAGES.GLOBAL_SKILLS_LOCKED`, so a project with a global React cannot choose Angular at all. |

Two confirm-step display quirks that were open against this area are now closed inside `computeScopeDiff` (`lib/wizard/scope-diff.ts`), and both are worth knowing because the shapes that produced them still exist. An UNRECONCILED both-scopes config could list one skill under Global as both unchanged and removed — an inherited global the project claims WITHOUT a tombstone occupies no slot in current, so it was admitted as inherited and matched as removed at once; `removedGlobalSkills` and `uniqueExcludedGlobalSkills` now both dedupe against `inheritedSkillIdSet`, so the Global section renders at most one row per skill. And a dropped mask was reported as a removal — removal candidates now come from the ACTIVE baseline alone, so a baseline tombstone is never one, because it masked a global install rather than being one and its slot held nothing to delete. `scope-diff.test.ts` pins both against a control ("a global entry nothing claims any more" still reports the removal), which is what separates the guards from a diff that has stopped reporting removals at all.
