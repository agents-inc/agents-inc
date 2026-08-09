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
    config-gate,
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
  - reference/component-patterns.md
last_validated: 2026-07-30
---

# Architecture Overview

## Project Identity

| Field       | Value                                                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package     | `agents-inc`                                                                                                                                                                                                                                                                                                                                                             |
| Version     | See `packages/cli/package.json`                                                                                                                                                                                                                                                                                                                                          |
| Binary      | `package.json` `bin` registers **two** names for `dist/index.js` — `agents-inc` (primary) and `agentsinc` (kept so existing global installs keep working), so a global install answers to either spelling. `oclif.bin` / `oclif.dirname` are the single name `agents-inc`. User-facing messages promote `npx agents-inc` via `CLI_INVOKE_COMMAND` in `src/cli/consts.ts` |
| Type        | ESM (`"type": "module"` in package.json)                                                                                                                                                                                                                                                                                                                                 |
| Entry Point | `src/cli/index.ts` (runs oclif with `run()`)                                                                                                                                                                                                                                                                                                                             |
| Build       | tsup -> `dist/` — entry contract, publish surface and the `oclif` block: [build-and-packaging.md](./build-and-packaging.md)                                                                                                                                                                                                                                              |
| Test Runner | Vitest (`vitest.config.ts`) with 3 projects: unit, integration, commands                                                                                                                                                                                                                                                                                                 |
| Runtime     | Node.js, floor `>=22` in `engines` (Ink 7 requires it — CI pins Node 22 in all three jobs, and the E2E harness spawns the CLI with the runner's Node). Also Bun-compatible based on test helpers                                                                                                                                                                         |

## Technology Stack

| Layer             | Library              | Version     | Purpose                                      |
| ----------------- | -------------------- | ----------- | -------------------------------------------- |
| CLI Framework     | oclif                | @oclif/core | Command parsing, flags, plugins, hooks       |
| Terminal UI       | Ink + React          | ink v7      | Interactive wizard, prompts, terminal render |
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
  config-exports.ts         # Public API re-exports for agents-inc/config
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
    uninstall.tsx           # Uninstall project or global install (manifest removal unconditional; no `--all`)
    update.ts               # Refresh the configured marketplaces
    validate.ts             # Validate installation
  components/               # Ink React components
    render.ts               # THE ONLY caller of ink's render(). Every Ink render in the CLI goes
                            #   through it — never `import { render } from "ink"` in a command or a
                            #   component. When the destination stream is a TTY it passes
                            #   `interactive: true`, so a real terminal beats Ink's CI guess; off-TTY
                            #   it passes nothing and Ink's own detection stands. An explicit
                            #   `interactive` from the caller always wins (spread order).
                            #   Five call sites: commands/{init,edit,list}, common/prompt-confirm.tsx,
                            #   wizard/run-wizard-session.tsx
    common/                 # Shared UI: confirm, prompt-confirm, select-list, spinner
    hooks/                  # React hooks for wizard behavior (hook table: reference/component-patterns.md)
    themes/                 # Ink theme (CLI_COLORS -> theme)
    wizard/                 # Wizard step components + utilities
      scroll-affordance.tsx # ScrollAffordance — shared "N more above / N more below" overflow hint
      summary-panel.tsx     # SummaryPanel — the ONE skills/agents summary, rendered by BOTH
                            #   wizard-layout.tsx (the `I` overlay) and step-confirm.tsx.
      wizard-layout.tsx     # Chrome + the in-render terminal-size guard (section 18)
  hooks/
    init.ts                 # oclif init hook: resolves source, attaches to config
  lib/                      # Core business logic (no UI)
    agents/                 # Agent fetching, compilation, recompilation
      list-compiled-agents.ts # listAgentMdFiles() — on-disk compiled-agent enumeration
    config-gate/            # The ONLY code allowed to write ~/.claude-src/{config,config-types}.ts (index.ts is its whole public surface)
      index.ts              # writeScopedFromWizard(), writeScopeConfigTypes(), reconcileTypesFromDisk(),
                            #   mutateGlobal(), propagateGlobalRemoval(), ensureBlankPair()
                            #   — the SIX entries that mint the gate token, each around its whole flow.
                            #   writeProjectPartial() mints nothing and refuses $HOME instead.
                            #   Also lazyGateDeps(), applyMigratedGlobalSources(), and the re-exports mergeGlobalConfigs +
                            #   normalizeProjectPath (a pure matcher — writes nothing)
      pair-writer.ts        # writeGlobalPair(), writeGlobalConfigHalf(), writeGlobalTypesHalf(),
                            #   ensureBlankPair() — write-if-changed.
                            #   REQUIRES the gate token (asserted in writeIfChanged); mints none
      classify.ts           # classifyGlobalChange() -> GlobalChangeSet; consequenceTier() -> T1..T4
      propagate.ts          # propagateGlobalChangesToProjects(), writeProjectConfigPair(), pruneGlobalEntriesFromRegisteredProjects(),
                            #   resolveEffectiveGlobalConfig(), mergeGlobalConfigs(), register/deregisterProjectPath(),
                            #   reconcileProjectSplitAgainstGlobal() (section 16), buildProjectTypesExtras()
      recompile.ts          # recompilePropagated() — lazy import of operations/project/recompile-project-agents
      gate-token.ts         # AsyncLocalStorage write privilege + GlobalPairWriteViolation
      deps.ts               # GateDeps — loaded matrix/agents, or loaders a no-consequence tier never calls
    configuration/          # Config loader/merger/writer/generator/config-types-writer/project-config/default-*
      project-config.ts     # loadProjectConfigFromDir(), loadProjectConfig(), validateProjectConfig(), ConfigLoadError
      scope-predicates.ts   # isActiveAt(), isGlobalTombstone(), isProjectOwned(), activeAgentScopeMap()
      define-config.ts      # defineConfig() helper re-exported through agents-inc/config
      default-categories.ts # defaultCategories — category definitions, pinned 1:1 against the generated `Category` union
    installation/           # Install mode detection, local installer, mode migrator
      installation.ts       # detectInstallation(), detectProjectInstallation(), detectGlobalInstallation(), getInstallationOrThrow(), deriveInstallMode()
      install-base-dir.ts   # resolveInstallPaths(projectDir, scope), installBaseDir() — scope-aware base dir
      is-home-directory.ts  # isHomeDirectory() — symlink-safe global-install-root check
      local-installer.ts    # installEject(), installPluginConfig(), buildAndMergeConfig(), buildCompileAgents(),
                            #   buildAgentScopeMap() — every config-pair writer lives in config-gate/
      mode-migrator.ts      # detectMigrations(), executeMigration() — install-mode migration
    loading/                # YAML/frontmatter loading, source fetching, multi-source
      source-loader.ts      # loadSkillsMatrixFromSource() — SourceLoadOptions: skipExtraSources, matrixOnly, devMode
    matrix/                 # Skills matrix loading, resolving, health checks
      matrix-provider.ts    # getSkillById(), getSkillBySlug() asserting lookups
      skill-resolution.ts   # synthesizeCategory(), mergeMatrixWithSkills() — resolveRelationships is internal
    operations/             # Composable building blocks for CLI commands
      source/               # loadSource(), ensureMarketplace(), requireMarketplace()
      skills/               # discoverInstalledSkills(), copyLocalSkills(), installPluginSkills(), uninstallPluginSkills(), pluginInstallFailureError()
      project/              # detectProject(), detectBothInstallations(), writeProjectConfig(), compileAgents(), compileAgentsAllScopes(), loadAgentDefs()
        recompile-project-agents.ts # recompileRegisteredProjectAgents(), recompilePropagatedProjectAgents()
    plugins/                # Plugin discovery, validation, manifest, settings
      plugin-settings.ts    # getEnabledPluginKeys(), getInstalledPluginsRegistryPath(), listRegisteredPluginInstalls(), resolvePluginInstallPaths(), getVerifiedPluginInstallPaths()
    skills/                 # Skill fetching, copying, metadata, source switching, local loader, plugin compiler
    stacks/                 # Stack loading, installing, plugin compilation
    testing/                # Support for the test infrastructure itself, not for any command
      dist-staleness.ts     # assertDistIsFresh() — the vitest.global-setup.ts guard's whole body
    wizard/                 # Build step logic + session diff (pure functions): validateBuildStep(), computeScopeDiff(), skillSlotKey(), agentSlotKey(), deriveScopeBadges(), formatScopeTag(), orderDomains(), buildCategoriesForDomain()
    compiler.ts             # Liquid template engine, agent/skill compilation
    exit-codes.ts           # Named EXIT_CODES constants
    marketplace-generator.ts # Marketplace.json generation
    metadata-keys.ts        # Metadata key constants
    output-validator.ts     # Compiled agent output validation
    permission-checker.tsx  # Claude Code permissions check
    resolver.ts             # Skill/agent reference resolution
    schema-validator.ts     # Zod error formatting (formatZodErrors, formatZodIssue)
    schemas.ts              # ALL Zod schemas + validateSkillMetadata(), splitMetadataValidationIssues(), validateNestingDepth()
    source-validator.ts     # Source directory validation (incl. checkDirNameMatchesSkillId — directory name vs SKILL.md machine id)
    validate-kebab-name.ts  # Kebab-case entity name validation (validateKebabCaseName)
    validation-result.ts    # ValidationResult factories (validResult, invalidResult, mergeValidationResults)
    versioning.ts           # Content hashing for versioning
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
    string.ts               # truncateText(), toTitleCase() string utilities
    terminal.ts             # clearTerminalScreen(), isTerminalLargeEnough(),
                            #   formatTerminalTooSmallMessage() — the shared size gate (section 18)
    type-guards.ts          # isCategory(), isDomain(), isAgentName(), isCategoryPath(), isSkillId(), isSkillSlug(), isSkillAssignment(), isRecord()
    typed-object.ts         # typedEntries(), typedKeys(), typedValues(), typedFromEntries()
    yaml-schema.ts          # yamlSchemaComment(), stripYamlSchemaComment()
    __mocks__/              # Vitest mocks for fs and logger
```

## Data Flow Overview

```
User runs command (e.g., `agents-inc init`)
  |
  v
oclif init hook (hooks/init.ts)
  -> resolveSource() -> ResolvedConfig attached to oclif config
  |
  v
Command.run() (commands/init.tsx)
  -> loadSource() operation (wraps loadSkillsMatrixFromSource()) -> SourceLoadResult (matrix + sourceConfig)
  -> runWizardSession({ hydrate, props }) (components/wizard/run-wizard-session.tsx)
       -> render(<Wizard version logo installedSkillIds initialAgents startupMessages />)
  |
  v
Wizard (Ink/React UI)
  -> Imports matrix from matrix-provider.ts (not via props)
  -> Zustand store (useWizardStore) manages step-by-step state
  -> Steps: stack -> domains -> build -> sources -> agents -> confirm (WizardStep / WIZARD_STEP_ORDER in wizard-store.ts)
  -> The info panel (I) is the only overlay; the marketplace-sources settings screen was withdrawn
     with the marketplace axis. See features/wizard-flow.md
  -> Returns WizardResultV2
  |
  v
Installation (commands use operations layer as composable building blocks)
  -> Operations: loadSource(), detectProject(), copyLocalSkills(), installPluginSkills()
  -> writeProjectConfig() builds and merges the final config
  -> config-gate::writeScopedFromWizard() splits config into global + project scopes
       -> classifyGlobalChange() decides the consequence tier (T1..T4)
       -> reconcileProjectSplitAgainstGlobal() masks colliding global entries (section 16)
       -> propagateGlobalChangesToProjects() rewrites each registered project's config
       -> recompilePropagated() recompiles those projects' agents INSIDE the write
       -> returns GateReport { globalWritten, changes, propagated, recompile }
  -> compileAgents() / compileAgentsAllScopes() compiles agent prompts for this install
  -> init.tsx / edit.tsx render GateReport.recompile — the work is already done
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
  - no flags: it declares no baseFlags. --source belongs to `init` alone
    (owner ruling 2026-08-09) and is declared in commands/init.tsx
  - init() lifecycle -> super.init() + ensureTerminalSize()
      (blocks until the terminal meets MIN_TERMINAL_SIZE, 80x20 in consts.ts.
       This is the STARTUP gate, not the only one -- WizardLayout enforces the
       same constant every render. See section 18. Uses clearTerminal() ->
       clearTerminalScreen() from utils/terminal.ts)
  - sourceConfig getter (from init hook)
  - handleError() -> this.error() with EXIT_CODES.ERROR
  - requireMarketplaceOrExit() -> requireMarketplace() (operations/source/require-marketplace.ts)
  - logSuccess(), logWarning(), logInfo()
```

Commands are discovered via oclif pattern strategy from `dist/commands/`.

### 2. Init Hook

File: `src/cli/hooks/init.ts`

Runs before every command. For `init` alone it extracts `--source` / `-s` from raw argv (before oclif parses); it then calls `resolveSource()` with the caller identity (`"init"` for the init command, `"stored"` for every other) and attaches `ResolvedConfig` to the oclif config object.

### 3. Source Resolution Precedence

```
--source flag > CC_SOURCE env var > .claude-src/config.ts (project) > ~/.claude-src/config.ts (global) > default (github:agents-inc/skills)
      \________________________/
        init only — the flag is declared by `init` and nothing else, and the env
        var is read only for `caller: "init"`. Every later command starts at the
        project config.
```

Implemented in: `src/cli/lib/configuration/config.ts` (`resolveSource()`)

### 4. Install Modes

| Mode   | Skills Location                                   | Agents Location   | Config Location         |
| ------ | ------------------------------------------------- | ----------------- | ----------------------- |
| eject  | `.claude/skills/`                                 | `.claude/agents/` | `.claude-src/config.ts` |
| plugin | Claude plugin cache                               | `.claude/agents/` | `.claude-src/config.ts` |
| mixed  | `.claude/skills/` (eject) + plugin cache (plugin) | `.claude/agents/` | `.claude-src/config.ts` |

Detection: `src/cli/lib/installation/installation.ts` — `detectInstallation()`, `detectProjectInstallation()`

Scope-aware config splitting: `writeScopedFromWizard()` in `src/cli/lib/config-gate/index.ts` splits config into global and project-scoped files.

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

Union types (`SkillId`, `SkillSlug`, `Category`, `Domain`, `AgentName`) are auto-generated from the skills source into `src/cli/types/generated/source-types.ts`. Run `bun run generate:types` to regenerate. Both generators, their checked-in output and the fact that neither runs in any gate: [features/code-generation.md](./features/code-generation.md).

Runtime type guards in `src/cli/utils/type-guards.ts` (`isCategory()`, `isDomain()`, `isAgentName()`, `isCategoryPath()`, `isSkillId()`, `isSkillSlug()`) validate strings against these generated arrays. The same file also exports `isSkillAssignment()` and `isRecord()` for structural checks.

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

**Config-types writer selection rule:** There are two writers for `config-types.ts`:

- `pair-writer.ts`'s `writeGlobalTypesHalf()` (over `generateConfigTypesSource()`) — standalone unions, narrowed to the config being written. ONLY for the GLOBAL `~/.claude-src/config-types.ts`, and reachable only from inside `config-gate/`.
- `regenerateConfigTypes()` in `config-types-writer.ts` — emits the global-aware branch (imports `GlobalSkillId`/`GlobalAgentName`/`GlobalDomain`/`GlobalCategory` from the global types, extends them with every literal the sibling `config.ts` holds — see `buildProjectTypesExtras`). ALWAYS use this for any PROJECT `<projectDir>/.claude-src/config-types.ts`.

The rule is now structural rather than advisory: `regenerateConfigTypes` throws `GlobalPairWriteViolation` if handed the home directory, and the standalone renderer is private to `pair-writer.ts`. The former `writeStandaloneConfigTypes` export no longer exists.

**Scope-dispatching entry points:** `config-gate::reconcileTypesFromDisk(projectDir, config, deps, opts?)` applies the rule from one place — the standalone half at `$HOME`, `regenerateConfigTypes()` otherwise. `commands/compile.ts` calls it once per compile pass (including the early-return pass where the scope has no installed skills, since the config — not the discovered skills — drives the unions) so the documented "hand-edit `config.ts`, then run `compile`" workflow refreshes the type unions instead of stranding them. A failed refresh downgrades to a warning (`configTypesRefreshFailed()` in `utils/messages.ts`); the compiled agents are already written. At `$HOME` it ALSO fans the config out to every registered project and recompiles their agents — a hand edit leaves no prior state to classify against, so the only safe assumption is that every inlined copy is stale.

### 11. Scope System (Project vs Global)

> **Detailed documentation:** See [concepts/scope-system.md](./concepts/scope-system.md) for the full cross-cutting reference.

Skills and agents can exist at two scopes:

| Scope     | Skills Path                    | Agents Path                    | Config Path                          |
| --------- | ------------------------------ | ------------------------------ | ------------------------------------ |
| `project` | `{projectDir}/.claude/skills/` | `{projectDir}/.claude/agents/` | `{projectDir}/.claude-src/config.ts` |
| `global`  | `~/.claude/skills/`            | `~/.claude/agents/`            | `~/.claude-src/config.ts`            |

**Path resolution:** `resolveInstallPaths(projectDir, scope)` in `src/cli/lib/installation/install-base-dir.ts` returns the correct base directory (`os.homedir()` for global, `projectDir` for project).

**Config splitting:** `writeScopedFromWizard()` in `src/cli/lib/config-gate/index.ts` splits a unified `ProjectConfig` into separate global and project config files. Project config imports from and extends the global config.

**Skill/agent scope:** Each `SkillConfig` and `AgentScopeConfig` carries a `scope: "project" | "global"` field (in `src/cli/types/config.ts`). During installation, skills are split by scope before path-dependent operations (copy, delete, install).

**Wizard enforcement:** When editing from project scope (`isEditingFromGlobalScope === false`), the wizard blocks changes to globally-installed skills/agents with a toast message. This holds in **every** flow — there is no `isInitMode` bypass; `isEditingFromGlobalScope` is the only exemption. A domain deselect is a view filter rather than a refusal: it drops only project-owned entries and leaves inherited global entries byte-identical.

### 12. Excluded Tombstone Pattern

> **Detailed documentation:** See [concepts/tombstone-pattern.md](./concepts/tombstone-pattern.md) for the full cross-cutting reference.

When a project needs to override (disable) a globally-installed skill or agent without removing it from the global config, it uses an **excluded tombstone**: a config entry with `excluded: true`.

**Types:** `SkillConfig.excluded?: boolean` and `AgentScopeConfig.excluded?: boolean` in `src/cli/types/config.ts`.

**How tombstones are created:**

| Producer                                                              | File                       | When                                                                                                                                                                                           |
| --------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toggleSkillScope()` (G→P)                                            | `stores/wizard-store.ts`   | Moving a globally-installed skill to project scope adds `{ id, scope: "global", excluded: true, source }`, gated on `wasInstalledGlobally` so a fresh init toggle mints no spurious tombstone. |
| `toggleAgentScope()` (G→P)                                            | `stores/wizard-store.ts`   | Agent mirror of the above.                                                                                                                                                                     |
| dual-scope restore (`reconcileSkillConfigs`, `restoreDualScopeAgent`) | `stores/wizard-store.ts`   | Re-selecting an inherited-global row whose snapshot holds a tombstone re-creates BOTH the project entry and the global tombstone, so the row renders `[P][G]` again (Scenario B).              |
| `maskCollidingGlobalSkills()` / `maskCollidingGlobalAgents()`         | `config-gate/propagate.ts` | System-derived masks written at project-config write time (see section 16).                                                                                                                    |

**What no longer creates a tombstone:**

- `applySkillRemoval()` — a globally-installed skill the project does not own now **survives** a deselect verbatim (`survivesRemoval()`); it is neither dropped nor masked. Editing from global scope passes `installedSkillConfigs: null`, making the removal a genuine uninstall.
- `applyAgentToggle()` — toggling a globally-installed agent off at project scope is **refused** by `toggleAgent` with the `GLOBAL_AGENTS_LOCKED` toast before `applyAgentToggle` runs.
- `toggleDomain()` — a domain deselect is a **view filter**: it hides the domain's skills and drops only project-owned entries, leaving global entries byte-identical. Agent-roster rebuilds merge rather than replace (`survivesRosterRebuild()`), so a globally-installed agent outside the selected domains' roster is never silently uninstalled.

**How tombstones are consumed:**

- Tombstoned entries are skipped during compilation (not compiled into agent prompts)
- Re-selecting a tombstoned skill/agent clears the `excluded` flag (restores it)
- `toggleSkillScope()` P→G unconditionally drops any excluded global tombstone for that id — an active entry at global scope supersedes a tombstone at the same scope
- `retainProjectOwnedSkills()` / `retainProjectOwnedAgents()` drop a tombstone whose global entry no longer exists
- `dropOrphanedDerivedMasks()` drops a mask once the collision that would re-derive it is gone (section 16)

**Provenance note:** a derived mask and a user-authored tombstone are byte-identical on disk (`{ id, scope: "global", excluded: true }`). No store path can mint the second kind on its own, so every _bare_ mask is system-derived by construction — which is what lets the self-heal generalise from "only exclusive+required categories" to "keep it only while the collision still exists".

### 13. Per-Skill Source

The authoritative plugin-reference format is **per-skill**, not per-agent.

- `SkillConfig.source: string` in `src/cli/types/config.ts` is the source of truth: `"eject"` means local filesystem; any other value is a marketplace name (e.g., `"agents-inc"`).
- Compiled agent skill refs are derived per-skill by `derivePluginRef()` (an internal function in `src/cli/lib/compiler.ts`) as `${id}:${id}`, emitted only when the skill's own `source` is a marketplace name (not `undefined` and not `"eject"`). The per-skill `source` gates whether a plugin ref is emitted — it is not part of the ref string. There is no whole-agent `installMode`.
- Mixed installs are expressed by different `source` values across the skills of a single agent.
- Plugin install shell commands still use the registration form `{skillId}@{marketplace}`; the compiled-agent body uses the `${id}:${id}` pluginRef form.
- Hard-error contract: if `installPluginSkills` returns non-empty `failed`, the command MUST hard-error before writing config (`init.tsx::installPluginsStep`, `edit.tsx::applyPluginChanges`) — no silent plugin→eject fallback.

### 14. Projects Array Lifecycle (Global Config Only)

`ProjectConfig.projects?: string[]` in `src/cli/types/config.ts` tracks per-project install paths registered against the global config.

- Only meaningful in the GLOBAL config (`~/.claude-src/config.ts`). Project configs never carry `projects`.
- A project init appends the project directory (`registerProjectPath()`, internal to `config-gate/propagate.ts`); a project uninstall always removes it (`config-gate::mutateGlobal({ kind: "deregister-project" })`, called unconditionally by `commands/uninstall.tsx` — a failure warns, never aborts).
- `propagateGlobalChangesToProjects()` in `config-gate/propagate.ts` iterates `projects` to rewrite each registered project's pair through the shared `writeProjectConfigPair()` (`writeConfigFile` + `regenerateConfigTypes`, per the writer-selection rule above) when the global unions change.
- `pruneGlobalEntriesFromRegisteredProjects()` in `config-gate/propagate.ts` is the GLOBAL-uninstall path: it re-enters `propagateGlobalChangesToProjects()` with an emptied global config (`skills: []`, `agents: []`) so every inlined global row, tombstone and per-agent stack ref is pruned from each registered project, and each project's `config-types.ts` is regenerated. It must run AFTER the global `.claude-src` manifest is removed so the regenerated project types fall back to the standalone form instead of importing from a deleted global `config-types.ts`. Unreachable projects come back in `skipped`, never thrown.

**A write that propagates recompiles the propagated projects itself**, inside `config-gate`, and returns a `GateReport` whose `recompile` field the command renders. Callers cannot forget it, because there is nothing left for them to do — a config-only propagation would leave each registered project's compiled `.claude/agents/<name>.md` referencing a removed or re-scoped global skill.

| Function                             | File                                                 | Behavior                                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `recompileRegisteredProjectAgents()` | `lib/operations/project/recompile-project-agents.ts` | Recompiles ONE registered project at `scopeFilter: "project"`. Passes discovered `skills` explicitly so global-local/project-local skills are not stripped.                 |
| `recompilePropagatedProjectAgents()` | `lib/operations/project/recompile-project-agents.ts` | Loops the above over every propagated dir sequentially with per-project failure isolation; returns `PropagatedRecompileSummary { recompiledCount, failedCount, warnings }`. |

Scope is project-only by design: the global agents were already recompiled by the triggering operation's own pass.

### 15. Stack Grouping System

Stacks can be organized into visual groups in the stack selection screen.

**Type:** `Stack.group?: string` and `ResolvedStack.group?: string` in `src/cli/types/matrix.ts`.

**UI grouping:** `groupStacks()` in `src/cli/components/wizard/stack-selection.tsx` sorts stacks into `StackGroup[]` objects. Groups are ordered by `GROUP_ORDER` (React first, then CLI, then alphabetical). Ungrouped stacks go into an "Other Frameworks" section. If no stacks have a `group` field, the list renders flat without headers.

**Agent preselection from stacks:** Selecting a stack is a two-step flow. `selectStack(stackId)` in `wizard-store.ts` resets the stack-scoped state (wipes `selectedAgents`, `agentConfigs`, `skillConfigs`, `domainSelections`). The `stack-selection.tsx` component then derives the stack's agent keys via `typedKeys<AgentName>(focusedStack.skills)` and calls `preselectAgentsFromStack(stackAgents)`, which sets `selectedAgents` and `agentConfigs`(merging stack agents with any `globalAgentPreselections` and preserving dual-scope tombstones), ensuring agent selection matches the stack definition.

### 16. Cross-Scope Reconciliation at Project-Config Write Time

Two production call sites write a project `config.ts` with the global config inlined (`writeConfigFile(..., { isProjectConfig: true, globalConfig })`). Both now run ONE shared reconciliation step immediately before the write, so config semantics are enforced at the write boundary rather than only in wizard keypress handlers.

**Entry point:** `reconcileProjectSplitAgainstGlobal(projectSplit, globalConfig, matrix)` in `src/cli/lib/config-gate/propagate.ts` — exported only far enough for `config-gate/index.ts` to call it, and not re-exported from the gate's barrel.

**Applied at:**

| Write site                                  | File                       | Why it needs reconciliation                                                                       |
| ------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `propagateGlobalChangesToProjects()`        | `config-gate/propagate.ts` | A global change fans out into a registered project that may already own a colliding skill/agent.  |
| project branch of `writeScopedFromWizard()` | `config-gate/index.ts`     | An ordinary project `init`/`edit` performed while the colliding skill is already active globally. |

**What it does, in order:**

1. **Self-heal** — `dropOrphanedDerivedMasks()` (skills) and `dropOrphanedDerivedAgentMasks()` (agents) remove a mask whose collision has cleared, so the global install becomes visible again. Runs BEFORE masking so a stale mask is not immediately re-derived and the masking step's `alreadyTombstoned` guard only sees warranted tombstones.
2. **Mask** — `maskCollidingGlobalSkills()` / `maskCollidingGlobalAgents()` add `{ ...globalEntry, excluded: true }` for each live global entry the project cannot show alongside what it owns.

**Collision kinds** (`buildProjectCollisionTest()`, shared by both the producer and the self-heal so they cannot disagree):

| Kind         | Applies to      | Condition                                                                                                                                                 |
| ------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IDENTITY** | skills + agents | The project owns the same id/name at project scope.                                                                                                       |
| **CATEGORY** | skills only     | The project owns a DIFFERENT active skill in the same category AND the merged matrix declares that category `exclusive: true`. Agents have no categories. |

**Contracts:**

- `isExclusiveCategory()` reads `exclusive` from the **merged matrix** passed in (not `defaultCategories`), so a source repo's category overrides are honoured. An **undeclared** flag is treated as non-exclusive — deliberately unlike the wizard renderer's `cat.exclusive ?? true` default, because a rule that masks persisted entries must only fire on a flag the data actually carries.
- `categoryOfSkill()` returns `undefined` for a skill absent from the matrix or sitting in the `local` pseudo-category — a custom skill never throws and never participates in category rules.
- Masking is **project-local**: the global config passed in is read, never rewritten. A tombstone never lands in `~/.claude-src/config.ts`.
- Idempotent: a skill the project already tombstones is skipped.
- The project's own skill **wins locally**. This is deliberately asymmetric with the guard that refuses a user-initiated exclusive swap over a globally-locked skill: there the user is displacing a shared install, whereas here a global install has landed on top of existing project state, and letting global win would silently uninstall the user's own skill.

Supporting reconcilers in the same module: `retainProjectOwnedSkills()` / `retainProjectOwnedAgents()` (drop tombstones whose global entry is gone), `computeRemovedGlobalSkillIds()` + `retainReconciledStack()` (drop stack refs to global skills removed at global scope).

### 17. Config Load Failure Is an Error, Not `null`

`loadProjectConfigFromDir()` in `src/cli/lib/configuration/project-config.ts` distinguishes two previously-conflated outcomes:

| Situation                                                                             | Result                                       |
| ------------------------------------------------------------------------------------- | -------------------------------------------- |
| Config file does not exist                                                            | `null` (legitimate "not installed")          |
| File exists but jiti load throws / no object default export / loader-schema violation | throws `ConfigLoadError(configPath, reason)` |

`ConfigLoadError` is exported from `configuration/project-config.ts` (re-exported via `lib/configuration/index.ts`). Caller contract:

| Caller                      | File                                       | Handling                                                                               |
| --------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `compile`                   | `commands/compile.ts`                      | Hard-errors before any write (`detectInstallations()` catches and calls `this.error`). |
| `detectProject()`           | `lib/operations/project/detect-project.ts` | Converts to `null` so `doctor` / `edit` report a config problem rather than crashing.  |
| `detectInstallationInDir()` | `lib/installation/installation.ts`         | No longer fabricates an installation from an unloadable config.                        |
| `uninstall`                 | `commands/uninstall.tsx`                   | `deregisterProjectPath()` failure (incl. `ConfigLoadError`) warns and continues.       |

A content-less config (no skills and no agents) reads as **not installed**, so `init` routes to the setup wizard instead of the dashboard.

### 18. Terminal-Size Gate: Two Enforcement Points, One Constant

The CLI refuses to run below a minimum terminal geometry. This is an architectural concern rather than a UI detail because it is enforced in **two places on opposite sides of the Ink mount**. `SCROLL_VIEWPORT` in `consts.ts` carries only the viewport-clipping values — the threshold is not one of them, so do not reintroduce a second copy of it there.

**Single source of truth:** `MIN_TERMINAL_SIZE` (`COLS: 80`, `ROWS: 20`) in `src/cli/consts.ts`.

**Shared helpers:** `isTerminalLargeEnough(columns, rows)` and `formatTerminalTooSmallMessage(columns)` in `src/cli/utils/terminal.ts`. Both gates call both — the threshold and the user-facing wording each exist once.

| Enforcement point                  | File                                          | Lifecycle position          | Behaviour when too small                                                                                              |
| ---------------------------------- | --------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `BaseCommand.ensureTerminalSize()` | `src/cli/base-command.ts`                     | `init()`, before Ink mounts | Clears the screen, prints the message, then **blocks** on a `resize` listener + 500 ms poll until the terminal grows  |
| `WizardLayout` guard               | `src/cli/components/wizard/wizard-layout.tsx` | Every render, after mount   | **Replaces** the wizard tree with `TerminalTooSmall`; restores the wizard, selections intact, when the terminal grows |

**Why two.** The startup gate runs once and cannot see a window shrunk mid-session. The render guard cannot run before Ink mounts. Neither subsumes the other.

**Why the render guard replaces rather than overlays.** Ink lays out a still-mounted subtree at the small size regardless of what is drawn on top, so an overlay would leave squeezed wizard content bleeding underneath the message. `WizardLayout` returns early instead of compositing.

**Resize reactivity** comes from `useTerminalDimensions()` (`src/cli/components/hooks/use-terminal-dimensions.ts`), which subscribes to stdout `resize` and falls back to 80x24 when stdout is not a TTY.

**`LOGO_MIN_TERMINAL_ROWS` (26) is NOT a third gate.** It decides only whether the stack step's six-row ASCII logo renders inside a terminal that already cleared `MIN_TERMINAL_SIZE`. Conflating the two regresses in both directions: raising `MIN_TERMINAL_SIZE.ROWS` to 26 refuses to run in the still-common 24-row terminal, and lowering the logo threshold to 20 brings back the bleed. Both constants carry their measurement tables inline in `consts.ts`.
