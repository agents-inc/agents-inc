---
scope: reference
area: architecture
keywords: [imports, dependencies, commands, operations, lib, utils, config-gate]
related:
  - reference/architecture-overview.md
  - reference/boundary-map.md
  - reference/features/operations-layer.md
last_validated: 2026-08-30
---

# Dependency Graph

**Purpose:** Maps how the major layers of the codebase depend on each other, which commands use which operations, and which operations wrap which lib modules. Use this to understand import boundaries and find the right layer for new code.

---

## Layer Diagram

```
                     +--------------------+
                     |     Commands       |   src/cli/commands/
                     | (oclif entry pts)  |
                     +----+-----------+---+
                          |           |
            +-------------+           +------------+
            |                                      |
            v                                      v
  +-------------------+                 +---------------------+
  |    Operations     |                 |     Components      |  src/cli/components/
  | (composable ops)  |                 |   (Ink React UI)    |
  | src/cli/lib/      |                 +----------+----------+
  |   operations/     |                            |
  +--------+----------+                            v
           |                             +-------------------+
           v                             |      Stores       |  src/cli/stores/
  +-------------------+                  | (Zustand state)   |
  |       Lib         |                  +--------+----------+
  | (business logic)  |                           |
  | src/cli/lib/      |                           v
  |   agents/         |             +----------------------------+
  |   configuration/  | <----------+     Lib (matrix, wizard,    |
  |   installation/   |            |     configuration, etc.)    |
  |   loading/        |            +----------------------------+
  |   matrix/         |
  |   plugins/        |
  |   seed/           |
  |   skills/         |
  |   stacks/         |
  |   wizard/         |
  +--------+----------+
           |
           v
  +-------------------+     +-------------------+
  |      Types        |     |      Utils        |  src/cli/utils/
  | src/cli/types/    |     | (cross-cutting)   |
  +-------------------+     +-------------------+
           |
           v
  +--------------------------------------------------+
  |  @workspace/{compile,matrix,api,api-mocks}        |  devDependencies, bundled by tsup
  |  pure renderers, catalogue + seed schema,         |
  |  typed worker client, msw handlers                |
  +--------------------------------------------------+
```

**The four workspace packages sit BELOW everything in this package.** They import nothing from
`src/cli/`; the traffic is one-way. `consts.ts` re-exports `@workspace/compile`'s path vocabulary,
`lib/compiler.ts` re-exports its agent renderers and sanitizers, and
`lib/configuration/config-writer.ts` and `config-types-writer.ts` re-export its config renderers, so
the call sites inside this package are unchanged and the edge is invisible from them. Re-derive:
`grep -rn '@workspace/' src/cli --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`.

**Allowed dependency directions:**

| From       | May import from                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Commands   | Operations, Lib, Components, Stores (one edge -- see below), Utils, Types, consts                                                     |
| Operations | Lib, Utils, Types, consts, Components (type-only)                                                                                     |
| Components | Stores, Lib (matrix-provider, wizard, configuration, loading), Utils, Types, consts                                                   |
| Stores     | Lib (matrix-provider, installation, configuration, wizard), Utils, Types, consts, Components (type)                                   |
| Lib        | Other Lib subdirs, Utils, Types, consts, Components (type-only, 3 edges below); operations only via lazy `await import`, never static |
| Utils      | consts, Types, and other Utils — two edges: `exec` -> `logger` + `errors`, `open-url` -> `exec` + `errors`                            |
| Types      | (leaf -- no internal imports)                                                                                                         |

**Commands -> Stores is no longer an empty edge.** `commands/list.tsx` imports `hydrateWizardStore` from `stores/wizard-store.ts` and seeds the store before rendering `SkillAgentSummary`, which reads its diff state from the store rather than from props. It is the only such edge (`grep -rn 'stores/' src/cli/commands` at time of writing returns exactly one production hit). `init` and `edit` still route all store access through `components/wizard/run-wizard-session.tsx`, so the rule "the wizard component mediates store access" holds for the wizard flow specifically -- but not for the CLI as a whole. See [Command -> Store Imports](#command---store-imports).

**Anti-pattern:** Lib modules MUST NOT statically import the operations layer (operations sit above lib and import back into it, so a static edge forms a load-time cycle that corrupts Vitest module mocks). When a lib function must reuse an operations helper it uses a lazy `await import(...)` inside the function body -- `config-gate/recompile.ts` imports `recompile-project-agents` (the whole reason that file exists), and `config-gate/index.ts`'s `lazyGateDeps` imports `operations/project/load-agent-defs`. The same file uses the technique once more for `loading/source-loader`; that one is lib->lib, deferred for cost rather than to break a cycle. `configuration/config-types-writer.ts` is no longer on this list at all -- it is now a pure re-export barrel over `@workspace/compile/config-types-source` and `configuration/config-types-io.ts`, with no imports of its own. Re-derive the census rather than carrying it:

```
grep -rn 'await import(' src/cli/lib --include='*.ts' --include='*.tsx' --exclude='*.test.ts'
```

**Type-only edges that cross a layer downward.** Lib modules, the store and `base-command.ts` import shapes a component owns. Every one is `import type` -- no runtime edge, no load-time cycle, so none violates the direction rules:

| Importer                                         | Imports from                      | Types                           |
| ------------------------------------------------ | --------------------------------- | ------------------------------- |
| `lib/wizard/build-step-logic.ts`                 | `components/wizard/category-grid` | `CategoryRow`, `CategoryOption` |
| `lib/wizard/agent-roster.ts`                     | `components/wizard/checkbox-grid` | `CheckboxItem`                  |
| `lib/operations/project/write-project-config.ts` | `components/wizard/wizard`        | `WizardResultV2`                |
| `lib/installation/local-installer.ts`            | `components/wizard/wizard`        | `WizardResultV2`                |
| `lib/seed/seed-apply.ts`                         | `components/wizard/wizard`        | `WizardResultV2`                |
| `base-command.ts`                                | `components/wizard/wizard`        | `WizardResultV2`                |
| `stores/wizard-store.ts`                         | `components/wizard/source-grid`   | `SourceOption`, `SourceRow`     |

Re-derive with
`grep -rn 'import type .* from .*components/' src/cli/lib src/cli/stores src/cli/base-command.ts`.

---

## Command -> Operations Map

Each command and which operations it imports from `lib/operations/`.

| Command             | File                            | Operations Imported                                                                                                                                                                                                                                                                                         |
| ------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`              | `commands/init.tsx`             | `loadSource`, `loadAgentDefs`, `copyLocalSkills`, `writeProjectConfig`, `compileAgentsAllScopes`, `discoverInstalledSkills` (+ `CompilationResult` / `SkillCopyResult` types). Plugin install and the marketplace both arrive through `BaseCommand` — see the note below                                    |
| `edit`              | `commands/edit.tsx`             | `detectProject`, `loadSource`, `copyLocalSkills`, `uninstallPluginSkills`, `loadAgentDefs`, `writeProjectConfig`, `compileAgentsAllScopes`, `discoverInstalledSkills`, `removeCompiledAgents` (+ `AgentDefs` / `ConfigWriteResult` / `RemoveCompiledAgentsOptions` types). Plugin install via `BaseCommand` |
| `compile`           | `commands/compile.ts`           | `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`                                                                                                                                                                                                                      |
| `update`            | `commands/update.ts`            | (none -- it wraps `claude plugin marketplace update`; nothing the operations layer offers is on that path)                                                                                                                                                                                                  |
| `doctor`            | `commands/doctor.ts`            | `loadSource`, `detectProject`                                                                                                                                                                                                                                                                               |
| `search`            | `commands/search.ts`            | `loadSource`                                                                                                                                                                                                                                                                                                |
| `eject`             | `commands/eject.ts`             | `loadSource`                                                                                                                                                                                                                                                                                                |
| `list`              | `commands/list.tsx`             | (none)                                                                                                                                                                                                                                                                                                      |
| `uninstall`         | `commands/uninstall.tsx`        | `loadAgentDefs`(agent defs for the global-uninstall project-pruning pass)                                                                                                                                                                                                                                   |
| `build plugins`     | `commands/build/plugins.ts`     | (none)                                                                                                                                                                                                                                                                                                      |
| `build marketplace` | `commands/build/marketplace.ts` | (none)                                                                                                                                                                                                                                                                                                      |
| `share`             | `commands/share.ts`             | (none) — it reads `lib/seed/` directly                                                                                                                                                                                                                                                                      |
| `new marketplace`   | `commands/new/marketplace.ts`   | (none)                                                                                                                                                                                                                                                                                                      |

**`installPluginSkills` and `pluginInstallFailureError` are reached through `BaseCommand`, not imported by any command.** `base-command.ts` wraps them in `installPluginSkillsReported()`, which reports per-skill results and hard-errors before any config write when the operation returns a non-empty `failed`. `init` and `edit` call that method; neither names the operation. **`recompilePropagatedProjectAgents` is imported by no command either** — its only caller is `lib/config-gate/recompile.ts`, through a lazy `await import(...)`.

---

## Command -> Direct Lib Imports (bypassing Operations)

Commands that import directly from `lib/` modules in addition to (or instead of) operations. `lib/exit-codes` is excluded as it is a leaf constant module used by nearly all commands.

| Command             | Direct Lib Imports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`              | `lib/loading/` (SourceLoadResult type), `lib/plugins/plugin-info` (getInstallationInfo), `lib/configuration/project-config` (loadProjectConfig), `lib/configuration/config` (resolveBranding), `lib/installation/` (InstallMode type, detectInstallation, detectGlobalInstallation, detectProjectInstallation, deriveInstallMode, resolveInstallPaths, buildAgentScopeMap, isHomeDirectory, INSTALL_MODE_LABELS, INSTALL_MODE_DESCRIPTIONS), `lib/permission-checker` (checkPermissions), **`lib/seed/`** (fetchSeedConfig from `fetch-seed`, registerExternalSkills + writeExternalSkills + ExternalSkillInstall type from `external-skills`, seedToWizardResult + SeedMapping type from `seed-to-wizard`). **No `config-gate` edge** — the `GateReport` it renders reaches it through `BaseCommand.reportPropagatedRecompile()`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `edit`              | `lib/installation/` (detectMigrations, executeMigration, ejectCopyFailureError, isHomeDirectory, installBaseDir, resolveInstallPaths, EjectCopyResult + Installation types, INSTALL_MODE_DESCRIPTIONS), **`lib/config-gate/`** (applyMigratedGlobalSources, mutateGlobal, normalizeProjectPath), `lib/matrix/matrix-provider` (matrix, getSkillById, getSkillDisplayName), `lib/configuration/scope-predicates` (activeAgentNames, activeAgentScopeMap, isActiveAt), `lib/configuration/` (AuthoritativeScope type, loadProjectConfigFromDir), `lib/loading/` (SourceLoadResult type), `lib/plugins/` (discoverAllPluginSkills, buildMarketplacePluginRef, toClaudePluginScope), `lib/skills/` (deleteLocalSkill, migrateLocalSkillScope, unresolvedSkillRemovalReasons), `lib/wizard/` (formatScopeTag), **`lib/seed/`** (seedPayloadForInstallation + skillsAuthoredHere from `installation-payload`, publishSeedConfig from `publish-seed`, fetchSeedConfig from `fetch-seed`, registerExternalSkills + writeExternalSkills + ExternalSkillInstall type from `external-skills`, seedToWizardResult + SeedMapping type from `seed-to-wizard`, reconcileSharedConfig + KeptFromRoundTrip type from `seed-apply`) — the round trip's two directions, `--ui` out and `--from` in |
| `compile`           | `lib/configuration` (**ConfigLoadError**, effectivelyExcludedSkillIds, isActiveAt, loadProjectConfig, loadProjectConfigFromDir, resolveSource), `lib/stacks` (getStackSkillIds, resolveAgentConfigToSkills), `lib/loading` (**loadSkillsMatrixFromSource**, UnusableSkillMetadata type), `lib/installation` (Installation type), **`lib/config-gate/`** (reconcileTypesFromDisk, GateReport type)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `doctor`            | `lib/configuration` (effectivelyExcludedSkillIds, loadProjectConfigFromDir, validateProjectConfig, getProjectConfigPath, SOURCE_ENV_VAR, ResolvedConfig type), `lib/matrix/matrix-provider` (matrix), `lib/skills` (discoverLocalSkills), `lib/stacks` (getStackSkillIds), `lib/agents` (filterExcludedEntries, listAgentMdFiles), `lib/plugins` (getVerifiedPluginInstallPaths, parseMarketplacePluginRef), `lib/installation` (declaresNoContent, isHomeDirectory, installBaseDir, resolveInstallPaths), `lib/source-validator` (isSourceRepo), **`lib/content-validator`** (listInstalledArtifacts, validateInstalledAgents, validateInstalledPlugins, validateInstalledSkills, validateProjectConfigFile, validateRegisteredSources, ContentIssue and ContentValidation types) — the content layer absorbed from the former `validate` command                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `eject`             | `lib/configuration/` (resolveSource, loadProjectSourceConfig, **getProjectConfigPath**), **`lib/config-gate/`** (ensureBlankPair, lazyGateDeps, mutateGlobal, writeProjectPartial), `lib/installation/` (isHomeDirectory), `lib/matrix/matrix-provider` (matrix), `lib/skills/` (copySkillsToLocalFlattened), `lib/loading/` (SourceLoadResult type)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `search`            | `lib/operations/` (loadSource) — and nothing else. The matrix `loadSource` returns already carries the local skills merged in, so the whole catalog is one load                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `update`            | `lib/configuration/` (loadProjectConfig) — and nothing else. Its Claude CLI calls go straight to `utils/exec` (claudePluginMarketplaceUpdate, isClaudeCLIAvailable)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `uninstall`         | `lib/plugins/` (listPluginNames, getProjectPluginsDir, buildMarketplacePluginRef, parseMarketplacePluginRef, toClaudePluginScope), `lib/skills/` (readForkedFromMetadata), `lib/agents/` (listAgentMdFiles, splitAgentsByProvenance), `lib/installation/` (isHomeDirectory, resolveInstallPaths), **`lib/config-gate/`** (lazyGateDeps, mutateGlobal, propagateGlobalRemoval), `lib/loading` (loadSkillsMatrixFromSource), `lib/configuration/project-config` (**ConfigLoadError**, loadProjectConfigFromDir)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `list`              | `lib/plugins/` (getInstallationInfo, formatInstallationDisplay), `lib/installation/installation` (detectInstallation, INSTALL_MODE_LABELS), `lib/configuration/project-config` (loadProjectConfig)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `build plugins`     | `lib/skills` (compileAllSkillPlugins, compileSkillPlugin, printCompilationSummary), `lib/agents` (compileAllAgentPlugins, printAgentCompilationSummary), `lib/plugins` (readPluginManifest)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `share`             | **`lib/seed/`** (seedPayloadForInstallation from `installation-payload`, publishSeedConfig from `publish-seed`, readPipedPayload + STDIN_IS_A_TERMINAL + PipedPayload type from `read-piped-payload`) — and nothing else from `lib/`, though it also takes `utils/read-stream` (readAllOf). It mints an id for what is installed here and reports it; `edit --ui` mints the same id from the same first two calls and opens it instead, and `--stdin` replaces the first with a payload read off the pipe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `new marketplace`   | `lib/marketplace-generator` (validateMarketplaceName), `lib/marketplace-scaffold` (exampleSkillId, writeMarketplaceScaffold), `lib/validate-kebab-name` (validateKebabCaseName)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `build marketplace` | `lib/marketplace-generator` (generateMarketplace, writeMarketplace, getMarketplaceStats, validateMarketplaceName, validateSkillIdNamespace), `lib/loading` (loadMarketplaceMatrix), `lib/validate-kebab-name` (validateKebabCaseName)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**One command-module edge sits outside the layer model.** `hooks/init.ts` imports `runDashboardFlow` from `commands/init.js` (the oclif init hook routes a bare invocation to the dashboard). It is command-to-command; it goes through neither operations nor lib.

---

## Command -> Store Imports

| Command | Store Import                                 | Why                                                                                                                                                                                                     |
| ------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`  | `stores/wizard-store` (`hydrateWizardStore`) | `SkillAgentSummary` reads installed/diff state from the store, not from props, so `list` must seed the store before rendering it. Renders no wizard, so there is no `runWizardSession` to do it for it. |

No other command imports a store. `init` and `edit` reach the store only through `components/wizard/run-wizard-session.tsx`, which calls the same `hydrateWizardStore` on their behalf.

---

## Command -> Component Imports

Commands that render Ink components.

| Command     | Components Imported                                                                                                                                                                                                                                                                                                                                                               |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`      | `components/render` (**render**), `components/wizard/run-wizard-session` (runWizardSession), `components/wizard/wizard` (WizardResultV2 type), `components/hooks/use-terminal-dimensions` (**useTerminalDimensions**), `components/common/select-list` (SelectList, SelectListItem type), `components/common/prompt-confirm` (promptValue), `components/common/spinner` (Spinner) |
| `edit`      | `components/render` (**render**), `components/wizard/run-wizard-session` (runWizardSession), `components/wizard/wizard` (WizardResultV2 type), `components/common/spinner` (Spinner), `components/common/removal-plan-confirm` (**RemovalPlanConfirm**, RemovalPlanSection type), `components/common/prompt-confirm` (promptConfirm)                                              |
| `list`      | `components/render` (**render**), `components/wizard/skill-agent-summary` (SkillAgentSummary)                                                                                                                                                                                                                                                                                     |
| `uninstall` | `components/common/removal-plan-confirm` (**RemovalPlanConfirm**, RemovalPlanSection type), `components/common/prompt-confirm` (promptConfirm)                                                                                                                                                                                                                                    |

Note: `init` and `edit` render the wizard through `components/wizard/run-wizard-session.tsx` (`runWizardSession`) rather than importing the `Wizard` component directly — they only import the `WizardResultV2` type from `components/wizard/wizard`. `runWizardSession` does **not** import `render` either: it mounts the wizard through `promptValue`, which owns the render call. `uninstall` is the one Ink-rendering command with no `components/render` edge, because `promptConfirm` mounts for it.

Note: `search` was rewritten to use `@oclif/table` and no longer renders Ink components. The `components/skill-search/` directory was removed.

Note: `init` is the only command that imports a component **hook** (`useTerminalDimensions`). Its dashboard view is declared inline in `init.tsx` rather than as a component file, so it consumes the hook directly instead of through a wizard component.

---

## Operations -> Lib Map

Each operation file and which lib modules it wraps.

### Source Operations (`lib/operations/source/`)

| Operation            | File                            | Lib Modules Used                                                                                                                                                                                    |
| -------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadSource`         | `source/load-source.ts`         | `lib/loading/` (loadSkillsMatrixFromSource, SourceLoadResult type), `lib/configuration/` (SourceCaller type), `utils/logger` (enableBuffering, drainBuffer, disableBuffering, StartupMessage type)  |
| `ensureMarketplace`  | `source/ensure-marketplace.ts`  | `lib/loading/` (fetchMarketplace), `utils/exec` (claudePluginMarketplaceExists, claudePluginMarketplaceAdd, claudePluginMarketplaceUpdate), `utils/logger` (warn), `utils/errors` (getErrorMessage) |
| `requireMarketplace` | `source/require-marketplace.ts` | `source/ensure-marketplace` (ensureMarketplace) — resolves-or-errors wrapper used by `BaseCommand.requireMarketplaceOrExit()`                                                                       |

### Project Operations (`lib/operations/project/`)

| Operation                                                               | File                                   | Lib Modules Used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detectProject`                                                         | `project/detect-project.ts`            | `lib/installation/` (detectInstallation, Installation type), `lib/configuration/` (**ConfigLoadError**, loadProjectConfig)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `detectBothInstallations`                                               | `project/detect-both-installations.ts` | `lib/installation/` (detectGlobalInstallation, detectProjectInstallation, **isHomeDirectory**, Installation type)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `compileAgents`                                                         | `project/compile-agents.ts`            | `project/remove-compiled-agents` (**pruneCompiledAgents**), `lib/agents/` (recompileAgents), `lib/configuration/` (loadProjectConfigFromDir), `lib/installation/` (buildAgentScopeMap). The `pruneStaleCompiledAgents` call moved down: `remove-compiled-agents.ts` is what imports it from `lib/agents/list-compiled-agents`                                                                                                                                                                                                          |
| `compileAgentsAllScopes`                                                | `project/compile-agents-all-scopes.ts` | `project/compile-agents` (compileAgents, CompilationResult type), `lib/installation/` (isHomeDirectory, resolveInstallPaths) — fans compileAgents out across project + global scopes; used by `init`/`edit`                                                                                                                                                                                                                                                                                                                            |
| `recompileRegisteredProjectAgents` / `recompilePropagatedProjectAgents` | `project/recompile-project-agents.ts`  | `project/compile-agents` (compileAgents, CompilationResult type), `project/load-agent-defs` (loadAgentDefs), `skills/` (discoverInstalledSkills), `lib/installation/` (resolveInstallPaths), **`lib/loading/catalogue-seat`** (withCatalogueSeatedFor — imported by module path, not through the `lib/loading/` barrel), `utils/errors` (getErrorMessage) — the deepest operation-to-operation composition in the layer. Its only caller is `lib/config-gate/recompile.ts`, via a lazy `await import(...)` (the lib → operations rule) |
| `writeProjectConfig`                                                    | `project/write-project-config.ts`      | `lib/installation/` (buildAndMergeConfig, resolveInstallPaths, **isHomeDirectory**), `lib/loading/` (SourceLoadResult type), `lib/configuration/` (**AuthoritativeScope** type), **`lib/config-gate/`** (ensureBlankPair, writeScopedFromWizard, GateReport type), `project/load-agent-defs` (**loadAgentDefs**, AgentDefs type), `utils/fs` (ensureDir), `components/wizard/wizard` (WizardResultV2 type) — returns `ConfigWriteResult.propagation: GateReport`                                                                       |
| `loadAgentDefs`                                                         | `project/load-agent-defs.ts`           | `lib/agents/` (getAgentDefinitions), `lib/loading/` (**loadMergedAgents**)                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### Skills Operations (`lib/operations/skills/`)

| Operation                 | File                                | Lib Modules Used                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discoverInstalledSkills` | `skills/discover-skills.ts`         | `lib/plugins/` (discoverAllPluginSkills), `lib/loading/` (**loadSkillsFromDir**, LoadedSkills + UnusableSkillMetadata types), `lib/installation/is-home-directory` (**isHomeDirectory**), `utils/logger` (verbose), `utils/typed-object` |
| `copyLocalSkills`         | `skills/copy-local-skills.ts`       | `lib/installation/` (resolveInstallPaths), `lib/skills/` (copySkillsToLocalFlattened, **deleteLocalSkill**), `lib/loading/source-loader` (SourceLoadResult type)                                                                         |
| `installPluginSkills`     | `skills/install-plugin-skills.ts`   | `lib/plugins/` (**buildMarketplacePluginRef**, **toClaudePluginScope**), `lib/loading/multi-source-loader` (**isLocalOnlySkill**), `utils/exec` (claudePluginInstall), `utils/errors` (getErrorMessage)                                  |
| `uninstallPluginSkills`   | `skills/uninstall-plugin-skills.ts` | `lib/plugins/` (**buildMarketplacePluginRef**, **toClaudePluginScope**), `utils/exec` (claudePluginUninstall), `utils/errors` (getErrorMessage)                                                                                          |

**`loadAllAgents` vs `loadMergedAgents`.** Both are exported from `lib/loading/index.ts` and neither operation calls the first. **`loadAgentDefs` is the only operation that calls `loadMergedAgents`** (source agents merged with project overrides) — `writeProjectConfig` reaches it indirectly now, by importing `loadAgentDefs` from its sibling rather than the loader directly. `loadAllAgents` is lib-internal in practice; re-derive its callers rather than trusting a list:

```
grep -rn 'loadAllAgents' src/cli --include='*.ts' --include='*.tsx' --exclude='*.test.ts'
```

Picking the wrong one silently drops project-local agent overrides.

**`isHomeDirectory` is imported by deep path, not through the barrel.** `discover-skills.ts` imports from `lib/installation/is-home-directory.js` directly rather than `lib/installation/index.js`, avoiding pulling the whole installation barrel (and `local-installer.ts` with it) into the skills-discovery path.

---

## Shared Utility Consumers

### `utils/exec.ts` (Claude CLI wrappers)

| Layer      | Consumer Files                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Commands   | `commands/uninstall.tsx`, `commands/edit.tsx`, `commands/update.ts`                                                                     |
| Operations | `operations/skills/install-plugin-skills.ts`, `operations/skills/uninstall-plugin-skills.ts`, `operations/source/ensure-marketplace.ts` |
| Lib        | `lib/installation/mode-migrator.ts`                                                                                                     |
| Utils      | `utils/open-url.ts` — it spawns the platform's link opener through `execCommand`                                                        |

Total: 8 production consumers. `exec.ts` itself imports `utils/logger` and `utils/errors`, so the
utils layer is not flat — see the direction table above.

### `utils/fs.ts` (file system helpers)

| Layer      | Consumer Count | Notable Consumers                                                                                                                                                                                                                      |
| ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands   | 6              | build/marketplace, build/plugins, doctor, eject, new/marketplace, uninstall — **not `edit`**, which reaches disk through lib and operations only                                                                                       |
| Operations | 3              | project/remove-compiled-agents, project/write-project-config, skills/copy-local-skills                                                                                                                                                 |
| Lib        | 37             | compiler, config-gate/_, configuration/_, content-validator, loading/_, installation/_, marketplace-generator, marketplace-scaffold, matrix/_, plugins/_, seed/_, skills/_, agents/_, source-validator, versioning, permission-checker |

Total: 46 production consumers (most-used utility in the project)

### `utils/logger.ts` (warn, verbose, log, message buffering)

| Layer      | Consumer Count | Notable Consumers                                                                                                                                                                                              |
| ---------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands   | 6              | base-command, build/marketplace, build/plugins, compile, edit, init — **not `doctor`**, which reports through its own row builders                                                                             |
| Components | 3              | wizard/run-wizard-session.tsx, wizard/wizard-layout.tsx, wizard/wizard.tsx                                                                                                                                     |
| Stores     | 1              | wizard-store.ts                                                                                                                                                                                                |
| Operations | 3              | skills/discover-skills, source/ensure-marketplace, source/load-source                                                                                                                                          |
| Utils      | 1              | exec.ts                                                                                                                                                                                                        |
| Lib        | 35             | compile-seat, compiler, config-gate/_, configuration/_, installation/_, loading/_, marketplace-generator, matrix/_, plugins/_, resolver, schemas, skills/_, stacks/_, agents/_, versioning, permission-checker |

Total: 49 production consumers

### `utils/errors.ts` (getErrorMessage)

| Layer      | Consumer Count | Notable Consumers                                                                                                                                                                                                                        |
| ---------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands   | 9              | base-command, build/marketplace, compile, doctor, edit, **eject**, init, uninstall, update                                                                                                                                               |
| Components | 0              | —                                                                                                                                                                                                                                        |
| Operations | 5              | project/recompile-project-agents, project/remove-compiled-agents, skills/install-plugin-skills, skills/uninstall-plugin-skills, source/ensure-marketplace                                                                                |
| Utils      | 2              | exec.ts, open-url.ts                                                                                                                                                                                                                     |
| Lib        | 24             | agents/_, config-gate/propagate, configuration/_ (incl. project-config), content-validator, installation/mode-migrator, loading/_, matrix/matrix-loader, plugins/_, seed/_, skills/_, source-validator, stacks/stacks-loader, versioning |

Total: 40 production consumers

### `utils/messages.ts` (the four message tables, `SHARED_CONFIG_APPLY`, `UNINSTALL_PLAN`, and the builders)

| Layer    | Consumer Files                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| Commands | `base-command`, `build/marketplace`, `compile`, `edit`, `eject`, `init`, `search`, `share`, `uninstall`, `update` |
| Lib      | `lib/configuration/config.ts`, `lib/loading/source-fetcher.ts`, `lib/seed/installation-payload.ts`                |

Total: 13 consumers. **Not the command layer alone.** Three lib modules print through it: the seed producer reuses `ERROR_MESSAGES.NO_INSTALLATION` so `share` and `edit --ui` refuse in the same words every other command does, the source fetcher owns the revalidation notice that has to go out before the download starts rather than after, and the settings reader owns `configUnreadableError` — the same wording `BaseCommand.ensureConfigReadable` prints for the roster loader.

### `utils/typed-object.ts` (typedEntries, typedKeys)

| Layer      | Consumer Count | Notable Consumers                                                                                                                                                                             |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands   | 3              | edit, eject, search                                                                                                                                                                           |
| Components | 3              | wizard/domain-selection, wizard/stack-selection, wizard/step-agents                                                                                                                           |
| Stores     | 1              | wizard-store.ts                                                                                                                                                                               |
| Operations | 1              | skills/discover-skills                                                                                                                                                                        |
| Lib        | 18             | agents/_, config-gate/propagate, configuration/config-types-io, installation/local-installer, loading/_, matrix/_, plugins/_, resolver, seed/_, stacks/stacks-loader, wizard/build-step-logic |

Total: 26 production consumers

### `utils/open-url.ts` (browserOpenerCommand, openUrl)

| Layer    | Consumer Files                                              |
| -------- | ----------------------------------------------------------- |
| Commands | `edit` (`--ui`), `init` (the editor link off the dashboard) |

Total: 2 production consumers. A leaf over a leaf: the command -> `utils/open-url` -> `utils/exec`. No dependency is added for it — the three platform openers are shell-outs to something the OS already ships, and the URL travels as its own argv entry with no shell, so the argument vector is the whole injection guard.

### `utils/string.ts` (truncateText, toTitleCase)

| Layer      | Consumer Files                                            |
| ---------- | --------------------------------------------------------- |
| Commands   | `search`                                                  |
| Components | `wizard/step-agents.tsx`                                  |
| Lib        | `matrix/matrix-resolver.ts`, `matrix/skill-resolution.ts` |

Total: 4 production consumers

### `utils/type-guards.ts` (isCategory, isDomain, isAgentName, isCategoryPath, isSkillId, isSkillSlug, isSkillAssignment, isRecord)

| Layer      | Consumer Files                                                                                                                                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Components | `wizard/step-agents.tsx`, `wizard/utils.ts`                                                                                                                                                                                                                 |
| Lib        | `agents/list-compiled-agents.ts`, `configuration/config-loader.ts`, `loading/source-fetcher.ts`, `loading/source-loader.ts`, `matrix/matrix-health-check.ts`, `plugins/plugin-validator.ts`, `schemas.ts`, `source-validator.ts`, `stacks/stacks-loader.ts` |

Total: 11 production consumers. `configuration/config-writer.ts` and `config-generator.ts` are no
longer among them — the config renderers moved to `@workspace/compile`, which carries its own guards.

### `utils/frontmatter.ts` (extractFrontmatter)

| Layer | Consumer Files                                                                        |
| ----- | ------------------------------------------------------------------------------------- |
| Lib   | `agents/agent-plugin-compiler.ts`, `loading/loader.ts`, `plugins/plugin-validator.ts` |

Total: 3 production consumers. `output-validator.ts` was a fourth until it was deleted as unreached.

### `utils/terminal.ts` (clearTerminalScreen, isTerminalLargeEnough, formatTerminalTooSmallMessage)

| Layer      | Consumer Files                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Commands   | `base-command.ts` (all three), `commands/init.tsx` (`clearTerminalScreen`)                       |
| Components | `components/wizard/wizard-layout.tsx` (`isTerminalLargeEnough`, `formatTerminalTooSmallMessage`) |

Total: 3 production consumers

`isTerminalLargeEnough` and `formatTerminalTooSmallMessage` are why this module has a **component** consumer. The terminal-size minimum is enforced at two points that must not drift:

| Enforcement point                  | File                                  | When it runs                                                                          |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `BaseCommand.ensureTerminalSize()` | `base-command.ts`                     | Once in `init()`, before Ink mounts; blocks until the terminal grows                  |
| `WizardLayout` size guard          | `components/wizard/wizard-layout.tsx` | Every render, off `useTerminalDimensions()`; replaces the wizard tree while too small |

Both read `MIN_TERMINAL_SIZE` from `consts.ts` through the same two helpers, so the threshold and the message exist in one place each. Neither may hardcode its own copy: a threshold duplicated in the startup gate leaves the constant in `consts.ts` with zero importers, so editing the documented constant changes nothing.

### `utils/yaml-schema.ts` (yamlSchemaComment, stripYamlSchemaComment)

| Layer    | Consumer Files                                                        |
| -------- | --------------------------------------------------------------------- |
| Commands | _(none)_                                                              |
| Lib      | `lib/skills/skill-plugin-compiler.ts`, `lib/skills/skill-metadata.ts` |

Total: 2 production consumers

### ~~`utils/yaml.ts`~~ (DELETED)

Removed -- was dead code with zero production importers. Production YAML loading uses `parseYaml()` + `schema.safeParse()` directly.

---

## Store -> Lib Dependencies

The wizard store (`stores/wizard-store.ts`) imports from:

| Lib Module                              | Imports                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `lib/installation/index.ts`             | `InstallMode` (type only)                                                                         |
| `lib/installation/installation.ts`      | `deriveInstallMode` (aliased `sharedDeriveInstallMode`)                                           |
| `lib/matrix/matrix-provider.ts`         | `matrix`, `getSkillById`, `getCategoryDomain`                                                     |
| `lib/configuration/scope-predicates.ts` | `isActiveAt`, `isGlobalTombstone`, `isProjectOwned`                                               |
| `lib/loading/multi-source-loader.ts`    | `isLocalOnlySkill`                                                                                |
| `lib/wizard/`                           | `agentSlotKey`, `buildCategoriesForDomain`, `firstFocusableAgent`, `orderDomains`, `skillSlotKey` |

Plus one **type-only edge back into components**: `import type { SourceOption, SourceRow } from "../components/wizard/source-grid.js"`. This is the store consuming a row shape the component owns; it carries no runtime import, so it does not violate the store->components direction ban. It is one of four such edges — see the type-only edge table under the layer diagram.

`skillSlotKey` is load-bearing: `lib/wizard/scope-diff.ts` (the confirm step's `computeScopeDiff`) and the store's Sources-tab collectors both build their keys with it, so the two surfaces cannot drift apart on what "the same slot" means.

`agentSlotKey` is exported alongside it from `lib/wizard/scope-diff.ts` and **the store is now its second caller** — it builds the store's own agent slot sets and its tombstone filter, so the confirm step's diff and the store's roster rebuild cannot disagree about what "the same agent slot" means. It was exported ahead of that caller on purpose: routing through it from the start is what the skill side did not do, and re-deriving on `name` alone is how that side drifted. The census is one command:

```
grep -rn 'agentSlotKey' src/cli --include='*.ts' --include='*.tsx' --exclude='*.test.ts'
```

---

## Component -> Lib Dependencies (production only)

| Component                        | Lib Module                   | Import                                                                                                                |
| -------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `hooks/use-build-step-props.ts`  | `lib/matrix/matrix-provider` | `matrix`                                                                                                              |
| `hooks/use-category-rows.ts`     | `lib/wizard/`                | `buildCategoriesForDomain`                                                                                            |
| `wizard/domain-selection.tsx`    | `lib/matrix/matrix-provider` | `matrix`                                                                                                              |
| `wizard/step-agents.tsx`         | `lib/matrix/matrix-provider` | `matrix`                                                                                                              |
| `wizard/step-agents.tsx`         | `lib/wizard/`                | `BUILT_IN_AGENT_GROUPS`, `BUILT_IN_AGENT_IDS`, `deriveScopeBadges`, `formatScopeTag`; `AgentGroup`, `AgentItem` types |
| `wizard/stack-selection.tsx`     | `lib/matrix/matrix-provider` | `matrix`                                                                                                              |
| `wizard/category-grid.tsx`       | `lib/matrix/matrix-provider` | `getSkillById`                                                                                                        |
| `wizard/source-grid.tsx`         | `lib/matrix/matrix-provider` | `getSkillById`                                                                                                        |
| `wizard/skill-agent-summary.tsx` | `lib/matrix/matrix-provider` | `getSkillDisplayName`                                                                                                 |
| `wizard/skill-agent-summary.tsx` | `lib/wizard/`                | `computeScopeDiff`; `AgentDiffRow`, `DiffRowStatus`, `SkillDiffRow` types                                             |
| `wizard/wizard.tsx`              | `lib/matrix/`                | `validateSelection`                                                                                                   |
| `wizard/wizard.tsx`              | `lib/matrix/matrix-provider` | `getSkillById`, `findStack`                                                                                           |
| `wizard/utils.ts`                | `lib/matrix/matrix-provider` | `findStack`                                                                                                           |
| `wizard/utils.ts`                | `lib/wizard/`                | `orderDomains`                                                                                                        |

**Neither summary surface has a lib edge.** `wizard/step-confirm.tsx` imports only `ink` and `SummaryPanel`; its whole body is a `useInput` claiming `Enter` and `Esc`, deliberately disjoint from the `↑`/`↓` that `SummaryPanel` owns. `wizard/summary-panel.tsx` imports no lib module either: it composes `SkillAgentSummary` (which owns the `computeScopeDiff` call), `ScrollAffordance` and the `usePanelScroll` hook, and reaches `findStack` indirectly through `getStackName` in `wizard/utils.ts` (which carries the edge, listed above). `SummaryPanel` is rendered by two surfaces — `wizard/wizard-layout.tsx` (the `I` overlay) and `wizard/step-confirm.tsx` — which is what makes the two agree by construction.

**Shared overflow component:** `wizard/scroll-affordance.tsx` (`ScrollAffordance`) is consumed by exactly two components — `wizard/source-grid.tsx` and `wizard/summary-panel.tsx`. It imports only `ink` and `SCROLL_VIEWPORT` from `consts.ts` — no lib edge. `hooks/use-section-scroll.ts` and `hooks/use-panel-scroll.ts` produce the `hidden{Above,Below}` counts it renders (the former also read by `category-grid.tsx`, which discards them by design), and `use-section-scroll.ts` reads `SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS` from the same constant block, but neither imports the component.

---

## Key Observations

1. **`init` and `edit` are the heaviest commands.** Both take more operations and more direct lib modules than anything else, and `edit` additionally owns both directions of the shared-configuration round trip. Re-derive the weights from the two tables above rather than carrying a pair of numbers here; the rows move whenever either command gains a collaborator.

2. **Operations layer is NOT exhaustive** -- many commands bypass operations and import lib directly (`list`, `build *`). These are typically simpler commands or marketplace tooling commands. `uninstall` is now a partial adopter: it takes `loadAgentDefs` from operations while everything else it needs comes straight from lib.

3. **`lib/matrix/matrix-provider.ts` is the most cross-cutting lib module** -- imported by commands, components, stores, and other lib modules. It provides the global matrix singleton.

4. **Components access lib through a narrow set of modules.** The complete set, from the table above: `matrix/matrix-provider`, `matrix/index`, `lib/wizard/`. Re-derive rather than trusting it — this is the claim that goes stale first, because a component reaching one module more is a one-line diff:

   ```
   grep -rn "from \".*lib/" src/cli/components --include='*.ts' --include='*.tsx' --exclude='*.test.ts*'
   ```

5. **`utils/fs.ts` and `utils/logger.ts` are the most-used utilities**, and each is consumed at every layer that exists above it. Their totals are stated once, in their own sections above.

6. **`utils/yaml.ts` and `lib/output-validator.ts` have both been removed** -- each was dead code with zero production importers. Nothing replaced either; the frontmatter and logger tables above lost a consumer rather than gaining a substitute.

7. **`utils/messages.ts` is NOT a command-only concern.** Three lib modules import it; the section above names them and says why each one owns wording a command would otherwise duplicate.

8. **There is no `build stack` subcommand and no `commands/build/stack.tsx`** -- stack compilation runs as part of `build plugins` via `lib/stacks/`.

9. **`search` renders no Ink** -- it uses `@oclif/table`'s `printTable`. There is no `components/skill-search/` directory.

10. **Operation-to-operation composition happens in five operations, not one.** Re-derive the set rather than reading the rows — sibling imports are relative, so one grep answers it:

    ```
    grep -rn "from \"\.\./\|from \"\./" src/cli/lib/operations --include='*.ts' --exclude='*.test.ts' | grep -v 'lib/\|utils/\|types/\|consts'
    ```

    | Operation                              | Imports from siblings                                       | Shape                                                              |
    | -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
    | `project/recompile-project-agents.ts`  | `compileAgents`, `loadAgentDefs`, `discoverInstalledSkills` | Deepest composite — one call recompiles a whole registered project |
    | `project/write-project-config.ts`      | `loadAgentDefs`                                             | Resolves the roster it is about to write                           |
    | `project/compile-agents.ts`            | `pruneCompiledAgents`                                       | Prunes what the compile pass no longer emits                       |
    | `project/compile-agents-all-scopes.ts` | `compileAgents`                                             | Fan-out across scopes                                              |
    | `source/require-marketplace.ts`        | `ensureMarketplace`                                         | Resolves-or-errors wrapper                                         |

    Every other operation wraps lib directly.

10a. **`lib/loading/catalogue-seat.ts` is imported by module path from BOTH layers, and by neither barrel.** `withCatalogueSeatedFor` is the one helper that puts a named project's catalogue in the module-level singleton, runs a body against it, and restores the caller's seat. Its two call sites straddle the layer line — `lib/config-gate/propagate.ts` (`propagateToProject`) and `lib/operations/project/recompile-project-agents.ts` — which is why it is a module of its own rather than a private helper in either. `lib/loading/index.ts` does not re-export it, so a barrel import will not find it. One grep is the census:

    ```
    grep -rn 'withCatalogueSeatedFor' src --include='*.ts' --include='*.tsx'
    ```

11. **The uninstall command reaches deepest into `lib/config-gate/`** -- `propagateGlobalRemoval` (global) + `mutateGlobal({ kind: "deregister-project" })` (project) + `lazyGateDeps`, plus `isHomeDirectory` / `resolveInstallPaths` from `lib/installation/` and `loadSkillsMatrixFromSource` from `lib/loading/`. There is no `uninstallProject` operation; the removal plan, the plugin teardown and the registered-project pruning all live in the command. The pruning also recompiles the pruned projects' agents, inside the gate, reported back through `GateReport.recompile`.

12. **`commands/compile.ts` depends on `lib/loading/` and `lib/config-gate/reconcileTypesFromDisk`.** This is the `config-types.ts` refresh pass; it uses `matrixOnly: true` so the `lib/loading/` edge does not make compile network-dependent. The gate edge also makes `compile` at `$HOME` a propagating command: it fans the hand-edited global config out to every registered project and recompiles their agents.

14a. **`commands/update.ts` is the shallowest command in the tree.** One configuration import (`loadProjectConfig`) and two `utils/exec` calls, and that is the whole of it: no operation, no config-gate edge, no component. It wraps `claude plugin marketplace update` for the marketplaces its config names. It fans out to nothing, because a compiled sub-agent references a plugin skill by pointer — refreshed marketplace content reaches every project that installed the plugin without a single compiled agent changing — and it rewrites no skill directory, because an ejected skill is a copy its user owns.

14b. **`lib/seed/` has three command consumers, not one.** `init` takes the inbound half (`fetchSeedConfig`, `seedToWizardResult`, and the external-skill writers); `share` takes the outbound half plus the piped reader; `edit` takes both, because `--ui` publishes and `--from` applies. The contract is documented in [features/seed-contract.md](./features/seed-contract.md) (wire format, version-discard policy, the payload -> `WizardResultV2` mapping, and the `--from` consumer path).

13. **`utils/terminal.ts` spans the pre-Ink / in-render divide by design.** Its consumers sit on both sides of the Ink mount — `base-command.ts` runs before Ink exists, `components/wizard/wizard-layout.tsx` runs on every render. Five utils modules have component consumers (`logger`, `string`, `terminal`, `type-guards`, `typed-object` — **not `errors`**, which has none); what distinguishes this one is that both its consumers implement the _same_ rule, so `utils/` is the only layer both can reach without one importing the other. See the `utils/terminal.ts` section above.

14. **Rebuild these tables by diffing, never by checking the rows already written.** A dead import survives a row-by-row validation pass and a missing import is invisible to one — both defects come from validating the doc's rows against source instead of diffing source's edges against the doc's rows. Grep every `import` in the owned directory and diff the edge set.

---

## Related Documentation

- [Architecture Overview](./architecture-overview.md) -- Directory structure, data flow, technology stack
- [Commands Reference](./commands/index.md) -- Command flags, exit codes, flow descriptions
- [Utilities Reference](./utilities.md) -- Detailed function signatures for all utils
- [Store Map](./store-map.md) -- WizardState shape, actions, consumers
