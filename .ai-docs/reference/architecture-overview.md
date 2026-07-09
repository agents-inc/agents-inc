---
scope: reference
area: architecture
keywords:
  [
    scope,
    directory-structure,
    data-flow,
    entry-points,
    tombstone,
    stack-grouping,
    config-writer,
    per-skill-source,
    writer-selection,
  ]
related:
  - reference/architecture/dependency-graph.md
  - reference/architecture/boundary-map.md
  - reference/features/configuration.md
  - reference/features/operations-layer.md
  - reference/config/config-writer.md
  - reference/concepts/tombstone-pattern.md
  - reference/concepts/scope-system.md
  - reference/commands/index.md
last_validated: 2026-04-21
---

# Architecture Overview

**Last Updated:** 2026-04-21

## Project Identity

| Field       | Value                                                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package     | `@agents-inc/cli`                                                                                                                                                         |
| Version     | 0.141.0                                                                                                                                                                   |
| Binary      | `agentsinc` (registered global bin, `package.json` `bin`/`oclif.bin`); user-facing messages promote `npx @agents-inc/cli` via `CLI_INVOKE_COMMAND` in `src/cli/consts.ts` |
| Type        | ESM (`"type": "module"` in package.json)                                                                                                                                  |
| Entry Point | `src/cli/index.ts` (runs oclif with `run()`)                                                                                                                              |
| Build       | tsup -> `dist/`                                                                                                                                                           |
| Test Runner | Vitest (`vitest.config.ts`) with 3 projects: unit, integration, commands                                                                                                  |
| Runtime     | Node.js (also Bun-compatible based on test helpers)                                                                                                                       |

## Technology Stack

| Layer             | Library              | Version     | Purpose                                      |
| ----------------- | -------------------- | ----------- | -------------------------------------------- |
| CLI Framework     | oclif                | @oclif/core | Command parsing, flags, plugins, hooks       |
| Terminal UI       | Ink + React          | ink v5      | Interactive wizard, prompts, terminal render |
| State Management  | Zustand              | v5          | Wizard state store                           |
| Schema Validation | Zod                  | v4.3.6      | YAML/JSON parse boundaries                   |
| Template Engine   | LiquidJS             | -           | Agent prompt compilation                     |
| Config Loader     | jiti                 | -           | TypeScript config file loading at runtime    |
| YAML              | yaml                 | -           | Config/matrix/metadata parsing               |
| Utilities         | Remeda               | v2.33.6     | Functional array/object utilities            |
| File System       | fs-extra + fast-glob | -           | File operations and globbing                 |
| Testing           | Vitest               | -           | Unit, integration, and command tests         |

## Directory Structure

```
src/cli/
  index.ts                  # CLI entry: oclif run()
  base-command.ts           # BaseCommand class (shared flags, error handling)
  config-exports.ts         # Public API re-exports for @agents-inc/cli/config
  consts.ts                 # ALL global constants (paths, colors, symbols, limits)
  commands/                 # oclif command classes (one per CLI command)
    build/                  # Build subcommands (marketplace, plugins) — no `stack` subcommand
    import/                 # Import subcommands (skill)
    new/                    # New subcommands (agent, marketplace, skill) — all feature-gated
    compile.ts              # Compile agents from installed skills
    doctor.ts               # Health check
    edit.tsx                # Edit installed skills (wizard re-entry, per-agent scope)
    eject.ts                # Eject skills/templates to local filesystem
    init.tsx                # Initialize project (wizard)
    list.tsx                # Show installation information (Ink component)
    search.ts               # Search for skills across sources (plain ts, no Ink)
    uninstall.tsx           # Uninstall from project
    update.tsx              # Update skills
    validate.ts             # Validate installation
  components/               # Ink React components
    common/                 # Shared UI: confirm, message, select-list, spinner
    hooks/                  # React hooks for wizard behavior
    skill-search/           # Skill search modal
    themes/                 # Ink theme (CLI_COLORS -> theme)
    wizard/                 # Wizard step components + utilities
  hooks/
    init.ts                 # oclif init hook: resolves source, attaches to config
  lib/                      # Core business logic (no UI)
    agents/                 # Agent fetching, compilation, recompilation
    configuration/          # Config loader/saver/merger/writer/generator/source-manager/config-types-writer/project-config/default-*
    installation/           # Install mode detection, local installer, mode migrator
    loading/                # YAML/frontmatter loading, source fetching, multi-source
    matrix/                 # Skills matrix loading, resolving, health checks
      matrix-provider.ts    # getSkillById(), getSkillBySlug() asserting lookups
      skill-resolution.ts   # synthesizeCategory(), mergeMatrixWithSkills() — resolveRelationships is internal
    operations/             # Composable building blocks for CLI commands
      source/               # loadSource(), ensureMarketplace()
      skills/               # discoverSkills(), copyLocalSkills(), installPluginSkills(), uninstallPluginSkills(), compareSkills()
      project/              # detectProject(), detectBothInstallations(), writeProjectConfig(), compileAgents(), loadAgentDefs()
    plugins/                # Plugin discovery, validation, manifest, settings
    skills/                 # Skill fetching, copying, metadata, source switching, local loader, plugin compiler
    stacks/                 # Stack loading, installing, plugin compilation
    wizard/                 # Build step logic (pure functions)
    compiler.ts             # Liquid template engine, agent/skill compilation
    exit-codes.ts           # Named EXIT_CODES constants
    feature-flags.ts        # Runtime feature flags (SOURCE_SEARCH, SOURCE_CHOICE, INFO_PANEL, *_COMMAND gates)
    metadata-keys.ts        # Metadata key constants
    output-validator.ts     # Compiled agent output validation
    permission-checker.tsx  # Claude Code permissions check
    resolver.ts             # Skill/agent reference resolution
    schema-validator.ts     # JSON Schema validation
    schemas.ts              # ALL Zod schemas
    source-validator.ts     # Source directory validation
    versioning.ts           # Content hashing for versioning
    marketplace-generator.ts # Marketplace.json generation
    __tests__/              # Integration + journey tests + shared factories / helpers / fixtures / mock-data
  stores/
    wizard-store.ts         # Zustand wizard state + actions
  types/                    # TypeScript type definitions
    index.ts                # Re-exports all type modules
    agents.ts               # Agent types (AgentName, AgentConfig, etc.)
    config.ts               # Config types (ProjectConfig, CompileConfig)
    matrix.ts               # Matrix types (Domain, Category, ResolvedSkill, etc.)
    plugins.ts              # Plugin types (PluginManifest, Marketplace)
    skills.ts               # Skill types (SkillId, SkillFrontmatter, etc.)
    stacks.ts               # Stack types (Stack, StackAgentConfig)
    generated/              # Auto-generated types from skills source
      source-types.ts       # SkillId, SkillSlug, Category, Domain, AgentName unions + arrays
      matrix.ts             # BUILT_IN_MATRIX constant with full category/skill data
  utils/                    # Cross-cutting utilities
    errors.ts               # getErrorMessage()
    exec.ts                 # Shell command execution (claude plugin install/uninstall)
    frontmatter.ts          # YAML frontmatter extraction
    fs.ts                   # File system wrappers (fs-extra + fast-glob)
    logger.ts               # log(), warn(), verbose(), setVerbose()
    messages.ts             # All user-facing message constants
    string.ts               # truncateText() string utility
    type-guards.ts          # isCategory(), isDomain(), isAgentName(), isCategoryPath()
    typed-object.ts         # typedEntries(), typedKeys()
    __mocks__/              # Vitest mocks for fs and logger
```

## Data Flow Overview

```
User runs command (e.g., `agentsinc init`)
  |
  v
oclif init hook (hooks/init.ts)
  -> resolveSource() -> ResolvedConfig attached to oclif config
  |
  v
Command.run() (commands/init.tsx)
  -> loadSkillsMatrixFromSource() -> SourceLoadResult (matrix + sourceConfig)
  -> render(<Wizard projectDir={...} marketplaceLabel={...} />)
  |
  v
Wizard (Ink/React UI)
  -> Imports matrix from matrix-provider.ts (not via props)
  -> Zustand store (useWizardStore) manages step-by-step state
  -> Steps: stack -> domains -> build -> sources -> agents -> confirm
  -> Returns WizardResultV2
  |
  v
Installation (commands use operations layer as composable building blocks)
  -> Operations: loadSource(), detectProject(), copyLocalSkills(), installPluginSkills()
  -> writeProjectConfig() generates config via generateConfigSource()
  -> compileAgents() compiles agent prompts
  -> writeScopedConfigs() splits config into global + project scopes
  |
  v
Compilation (lib/compiler.ts)
  -> readAgentFiles() -> agent partials (identity.md, playbook.md, etc.)
  -> buildAgentTemplateContext() -> CompiledAgentData
  -> sanitizeCompiledAgentData() -> prevent Liquid injection
  -> Liquid engine renders agent.liquid template
  -> Output: .claude/agents/{name}.md
```

## Key Architectural Patterns

### 1. oclif Command Pattern

Every command extends `BaseCommand` in `src/cli/base-command.ts`.

```
BaseCommand provides:
  - baseFlags: --source
  - sourceConfig getter (from init hook)
  - handleError() -> this.error() with EXIT_CODES.ERROR
  - logSuccess(), logWarning(), logInfo()
```

Commands are discovered via oclif pattern strategy from `dist/commands/`.

### 2. Init Hook

File: `src/cli/hooks/init.ts`

Runs before every command. Extracts `--source` / `-s` from raw argv (before oclif parses), calls `resolveSource()`, attaches `ResolvedConfig` to oclif config object.

### 3. Source Resolution Precedence

```
--source flag > CC_SOURCE env var > .claude-src/config.ts (project) > ~/.claude-src/config.ts (global) > default (github:agents-inc/skills)
```

Implemented in: `src/cli/lib/configuration/config.ts` (`resolveSource()`)

### 4. Install Modes

| Mode   | Skills Location                                   | Agents Location   | Config Location         |
| ------ | ------------------------------------------------- | ----------------- | ----------------------- |
| eject  | `.claude/skills/`                                 | `.claude/agents/` | `.claude-src/config.ts` |
| plugin | Claude plugin cache                               | `.claude/agents/` | `.claude-src/config.ts` |
| mixed  | `.claude/skills/` (eject) + plugin cache (plugin) | `.claude/agents/` | `.claude-src/config.ts` |

Detection: `src/cli/lib/installation/installation.ts` — `detectInstallation()`, `detectProjectInstallation()`

Scope-aware config splitting: `writeScopedConfigs()` in `src/cli/lib/installation/local-installer.ts` splits config into global and project-scoped files.

### 5. Liquid Template Compilation

Agent prompts are compiled from partials using LiquidJS.

Template root resolution order (first match wins):

1. `{project}/.claude-src/agents/_templates/`
2. `{project}/.claude/templates/` (legacy)
3. `{CLI_ROOT}/templates/` (built-in)

Implemented in: `src/cli/lib/compiler.ts` (`createLiquidEngine()`)

### 6. Zod Schema Validation

All YAML/JSON parse boundaries use Zod schemas from `src/cli/lib/schemas.ts`.

Pattern: Lenient "loader" schemas with `.passthrough()` at parse boundaries, strict schemas for validation. Bridge pattern: `z.ZodType<ExistingType>` ensures Zod output matches TypeScript interfaces.

Production code calls `parseYaml()` + `schema.safeParse()` directly at individual call sites.

### 7. Generated Types

Union types (`SkillId`, `SkillSlug`, `Category`, `Domain`, `AgentName`) are auto-generated from the skills source into `src/cli/types/generated/source-types.ts`. Run `bun run generate:types` to regenerate.

Runtime type guards in `src/cli/utils/type-guards.ts` (`isCategory()`, `isDomain()`, `isAgentName()`, `isCategoryPath()`) validate strings against these generated arrays.

The `src/cli/types/generated/matrix.ts` file contains the full `BUILT_IN_MATRIX` constant with all category and skill data.

### 8. Matrix Provider and Skill Resolution

`src/cli/lib/matrix/matrix-provider.ts` provides safe skill lookups:

- `getSkillById(id)` — asserting lookup by SkillId
- `getSkillBySlug(slug)` — asserting lookup by SkillSlug

`src/cli/lib/matrix/skill-resolution.ts` exports `synthesizeCategory()` and `mergeMatrixWithSkills()`. The unified `resolveRelationships()` traversal is module-private and invoked inside `mergeMatrixWithSkills()`.

### 9. Security Measures

- Source validation: `validateSourceFormat()` in `src/cli/lib/configuration/config.ts`
  - Blocks null bytes, UNC paths, private IPs, path traversal
  - Validates remote and local source formats
- Liquid injection prevention: `sanitizeCompiledAgentData()` in `src/cli/lib/compiler.ts`
  - Strips `{{`, `}}`, `{%`, `%}` from all user-controlled fields
- File size limits: `MAX_MARKETPLACE_FILE_SIZE`, `MAX_PLUGIN_FILE_SIZE`, `MAX_CONFIG_FILE_SIZE` in `src/cli/consts.ts`
- Command injection prevention: Input validation in `src/cli/utils/exec.ts`

### 10. Config Writer

`src/cli/lib/configuration/config-writer.ts` — `generateConfigSource()` generates TypeScript config files from `ProjectConfig` objects. Supports standalone configs and project configs that import/extend global configs.

Key function: `generateConfigSource(config, options?)`. When `options.isProjectConfig` is true, generates config that imports from the global `~/.claude-src/config` and spreads global arrays.

**Config-types writer selection rule (D-228):** There are two writers for `config-types.ts`:

- `writeStandaloneConfigTypes()` / `generateConfigTypesSource()` in `local-installer.ts` + `config-types-writer.ts` — inlines full unions. ONLY for the GLOBAL `~/.claude-src/config-types.ts`.
- `regenerateConfigTypes()` in `config-types-writer.ts` — emits the global-aware branch (imports `GlobalSkillId`/`GlobalAgentName`/`GlobalDomain`/`GlobalCategory` from the global types, extends with project-only items). ALWAYS use this for any PROJECT `<projectDir>/.claude-src/config-types.ts`.

Never call `writeStandaloneConfigTypes` for a project path — it bypasses the import-from-global branch and produces duplicated standalone unions (D-216 / D-228 regression).

### 11. Scope System (Project vs Global)

> **Detailed documentation:** See [concepts/scope-system.md](./concepts/scope-system.md) for the full cross-cutting reference.

Skills and agents can exist at two scopes:

| Scope     | Skills Path                    | Agents Path                    | Config Path                          |
| --------- | ------------------------------ | ------------------------------ | ------------------------------------ |
| `project` | `{projectDir}/.claude/skills/` | `{projectDir}/.claude/agents/` | `{projectDir}/.claude-src/config.ts` |
| `global`  | `~/.claude/skills/`            | `~/.claude/agents/`            | `~/.claude-src/config.ts`            |

**Path resolution:** `resolveInstallPaths(projectDir, scope)` in `src/cli/lib/installation/local-installer.ts` returns the correct base directory (`os.homedir()` for global, `projectDir` for project).

**Config splitting:** `writeScopedConfigs()` in `src/cli/lib/installation/local-installer.ts` splits a unified `ProjectConfig` into separate global and project config files. Project config imports from and extends the global config.

**Skill/agent scope:** Each `SkillConfig` and `AgentScopeConfig` carries a `scope: "project" | "global"` field (in `src/cli/types/config.ts`). During installation, skills are split by scope before path-dependent operations (copy, delete, install).

**Wizard enforcement:** When editing from project scope (`isEditingFromGlobalScope === false`), the wizard blocks changes to globally-installed skills/agents with a toast message. The `isInitMode` flag bypasses this guard during fresh initialization.

### 12. Excluded Tombstone Pattern

> **Detailed documentation:** See [concepts/tombstone-pattern.md](./concepts/tombstone-pattern.md) for the full cross-cutting reference.

When a project needs to override (disable) a globally-installed skill or agent without removing it from the global config, it uses an **excluded tombstone**: a config entry with `excluded: true`.

**Types:** `SkillConfig.excluded?: boolean` and `AgentScopeConfig.excluded?: boolean` in `src/cli/types/config.ts`.

**How tombstones are created:**

- **Skill removal** (`applySkillRemoval()` in `wizard-store.ts`): When deselecting a globally-installed skill, instead of removing the config entry, it sets `excluded: true`. Project-scoped skills are simply removed.
- **Agent toggle off** (`applyAgentToggle()` in `wizard-store.ts`): When toggling off a globally-installed agent, it marks the config entry as `excluded: true` and keeps the agent in `selectedAgents` (so the global config stays correct for other projects).
- **Scope toggle** (`toggleSkillScope()` in `wizard-store.ts`): Moving a globally-installed skill from global to project scope adds an excluded tombstone for the global entry.

**How tombstones are consumed:**

- Tombstoned entries are skipped during compilation (not compiled into agent prompts)
- Re-selecting a tombstoned skill/agent clears the `excluded` flag (restores it)
- The `toggleSkillScope()` action checks for existing excluded entries to allow undo of scope overrides

### 13. Per-Skill Source (D-217)

The authoritative plugin-reference format is **per-skill**, not per-agent.

- `SkillConfig.source: string` in `src/cli/types/config.ts` is the source of truth: `"eject"` means local filesystem; any other value is a marketplace name (e.g., `"agents-inc"`).
- Compiled agent skill refs are derived per-skill as `${source}:${skillId}` — not from any whole-agent `installMode`.
- There is no agent-level install mode. Mixed installs are expressed by different `source` values across the skills of a single agent.
- Plugin install shell commands still use the registration form `{skillId}@{marketplace}`; only the compiled-agent body uses `${source}:${skillId}`.
- Hard-error contract: if `installPluginSkills` returns non-empty `failed`, the command MUST hard-error before writing config (`init.tsx::installPluginsStep`, `edit.tsx::applyPluginChanges`) — no silent plugin→eject fallback (D-229).

### 14. Projects Array Lifecycle (Global Config Only)

`ProjectConfig.projects?: string[]` in `src/cli/types/config.ts` tracks per-project install paths registered against the global config.

- Only meaningful in the GLOBAL config (`~/.claude-src/config.ts`). Project configs never carry `projects`.
- A project init appends the project directory; uninstall removes it.
- `propagateGlobalChangesToProjects()` in `local-installer.ts` iterates `projects` to rewrite each project's `config-types.ts` when the global unions change. Each per-project rewrite goes through `regenerateConfigTypes()` (per the writer-selection rule above).

### 15. Stack Grouping System

Stacks can be organized into visual groups in the stack selection screen.

**Type:** `Stack.group?: string` and `ResolvedStack.group?: string` in `src/cli/types/matrix.ts`.

**UI grouping:** `groupStacks()` in `src/cli/components/wizard/stack-selection.tsx` sorts stacks into `StackGroup[]` objects. Groups are ordered by `GROUP_ORDER` (React first, then CLI, then alphabetical). Ungrouped stacks go into an "Other Frameworks" section. If no stacks have a `group` field, the list renders flat without headers.

**Agent preselection from stacks:** `populateFromStack()` in `wizard-store.ts` now derives `selectedAgents` and `agentConfigs` from the stack's agent keys (via `Object.keys(stack.agents).filter(isAgentName)`), ensuring agent selection matches the stack definition.
