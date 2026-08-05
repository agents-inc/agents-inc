---
scope: reference
area: architecture
keywords: [imports, dependencies, commands, operations, lib, utils, config-gate]
related:
  - reference/architecture-overview.md
  - reference/boundary-map.md
  - reference/features/operations-layer.md
last_validated: 2026-08-01
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
```

**Allowed dependency directions:**

| From       | May import from                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Commands   | Operations, Lib, Components, Stores (one edge -- see below), Utils, Types, consts                                                     |
| Operations | Lib, Utils, Types, consts, Components (type-only)                                                                                     |
| Components | Stores, Lib (matrix-provider, wizard, configuration, feature-flags, loading), Utils, Types, consts                                    |
| Stores     | Lib (matrix-provider, installation, configuration, wizard), Utils, Types, consts, Components (type)                                   |
| Lib        | Other Lib subdirs, Utils, Types, consts, Components (type-only, 3 edges below); operations only via lazy `await import`, never static |
| Utils      | consts, Types (none currently)                                                                                                        |
| Types      | (leaf -- no internal imports)                                                                                                         |

**Commands -> Stores is no longer an empty edge.** `commands/list.tsx` imports `hydrateWizardStore` from `stores/wizard-store.ts` and seeds the store before rendering `SkillAgentSummary`, which reads its diff state from the store rather than from props. It is the only such edge (`grep -rn 'stores/' src/cli/commands` at time of writing returns exactly one production hit). `init` and `edit` still route all store access through `components/wizard/run-wizard-session.tsx`, so the rule "the wizard component mediates store access" holds for the wizard flow specifically -- but not for the CLI as a whole. See [Command -> Store Imports](#command---store-imports).

**Anti-pattern:** Lib modules MUST NOT statically import the operations layer (operations sit above lib and import back into it, so a static edge forms a load-time cycle that corrupts Vitest module mocks). When a lib function must reuse an operations helper it uses a lazy `await import(...)` inside the function body -- `installEject()` in `installation/local-installer.ts` imports `copyLocalSkills` that way (finding). `configuration/config-types-writer.ts` uses the same lazy technique for `loading/source-loader` + `loading/loader`; those are lib->lib, deferred for cost rather than to break a cycle. Those three are the only `await import(` call sites in `src/cli/lib/`.

**Type-only edges that cross a layer downward.** Three lib modules and the store import a shape that a component owns. All four are `import type` -- no runtime edge, no load-time cycle, so they do not violate the direction rules:

| Importer                                         | Imports from                      | Types                           |
| ------------------------------------------------ | --------------------------------- | ------------------------------- |
| `lib/wizard/build-step-logic.ts`                 | `components/wizard/category-grid` | `CategoryRow`, `CategoryOption` |
| `lib/operations/project/write-project-config.ts` | `components/wizard/wizard`        | `WizardResultV2`                |
| `lib/installation/local-installer.ts`            | `components/wizard/wizard`        | `WizardResultV2`                |
| `stores/wizard-store.ts`                         | `components/wizard/source-grid`   | `SourceOption`, `SourceRow`     |

---

## Command -> Operations Map

Each command and which operations it imports from `lib/operations/`.

| Command             | File                            | Operations Imported                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `init`              | `commands/init.tsx`             | `loadSource`, `loadAgentDefs`, `copyLocalSkills`, `installPluginSkills`, `pluginInstallFailureError`, `writeProjectConfig`, `compileAgentsAllScopes`, **`recompilePropagatedProjectAgents`**, `discoverInstalledSkills` (marketplace via inherited `requireMarketplaceOrExit`)                                           |
| `edit`              | `commands/edit.tsx`             | `detectProject`, `loadSource`, `copyLocalSkills`, `installPluginSkills`, `pluginInstallFailureError`, `uninstallPluginSkills`, `loadAgentDefs`, `writeProjectConfig`, `compileAgentsAllScopes`, **`recompilePropagatedProjectAgents`**, `discoverInstalledSkills` (marketplace via inherited `requireMarketplaceOrExit`) |
| `compile`           | `commands/compile.ts`           | `detectBothInstallations`, `loadAgentDefs`, `compileAgents`, `discoverInstalledSkills`                                                                                                                                                                                                                                   |
| `update`            | `commands/update.tsx`           | `loadSource`, `compareSkillsWithSource`, `compileAgents`, `collectScopedSkillDirs`, `findSkillMatch`, `discoverInstalledSkills`, **`recompilePropagatedProjectAgents`** (`update` refreshes every registered project's agents, not just the cwd's)                                                                       |
| `doctor`            | `commands/doctor.ts`            | `loadSource`, `detectProject`                                                                                                                                                                                                                                                                                            |
| `search`            | `commands/search.ts`            | `loadSource`                                                                                                                                                                                                                                                                                                             |
| `eject`             | `commands/eject.ts`             | `loadSource`                                                                                                                                                                                                                                                                                                             |
| `list`              | `commands/list.tsx`             | (none)                                                                                                                                                                                                                                                                                                                   |
| `uninstall`         | `commands/uninstall.tsx`        | `loadAgentDefs`(agent defs for the global-uninstall project-pruning pass)                                                                                                                                                                                                                                                |
| `validate`          | `commands/validate.ts`          | (none)                                                                                                                                                                                                                                                                                                                   |
| `import skill`      | `commands/import/skill.ts`      | (none)                                                                                                                                                                                                                                                                                                                   |
| `new skill`         | `commands/new/skill.ts`         | (none)                                                                                                                                                                                                                                                                                                                   |
| `new agent`         | `commands/new/agent.tsx`        | (none)                                                                                                                                                                                                                                                                                                                   |
| `new marketplace`   | `commands/new/marketplace.ts`   | (none)                                                                                                                                                                                                                                                                                                                   |
| `build plugins`     | `commands/build/plugins.ts`     | (none)                                                                                                                                                                                                                                                                                                                   |
| `build marketplace` | `commands/build/marketplace.ts` | (none)                                                                                                                                                                                                                                                                                                                   |

---

## Command -> Direct Lib Imports (bypassing Operations)

Commands that import directly from `lib/` modules in addition to (or instead of) operations. `lib/exit-codes` is excluded as it is a leaf constant module used by nearly all commands.

| Command             | Direct Lib Imports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`              | `lib/loading/` (SourceLoadResult type), `lib/plugins/plugin-info` (getInstallationInfo), `lib/configuration/project-config` (loadProjectConfig, loadProjectConfigFromDir), `lib/installation/` (InstallMode type, detectInstallation, detectGlobalInstallation, deriveInstallMode, resolveInstallPaths, buildAgentScopeMap, isHomeDirectory, INSTALL_MODE_LABELS), `lib/permission-checker` (checkPermissions), **`lib/config-gate/`** (GateReport type), **`lib/seed/`** (fetchSeedConfig from `fetch-seed`, seedToWizardResult from `seed-to-wizard`)                                                                                                                                        |
| `edit`              | `lib/installation/` (detectMigrations, executeMigration, isHomeDirectory, installBaseDir, resolveInstallPaths, Installation type), **`lib/config-gate/`** (applyMigratedGlobalSources, mutateGlobal, GateReport type), `lib/matrix/matrix-provider` (matrix, getSkillById, getSkillDisplayName), `lib/configuration/scope-predicates` (activeAgentScopeMap, isActiveAt), `lib/configuration/` (loadProjectConfigFromDir), `lib/loading/` (SourceLoadResult type), `lib/plugins/` (discoverAllPluginSkills, buildMarketplacePluginRef, toClaudePluginScope), `lib/skills/` (deleteLocalSkill, migrateLocalSkillScope), `lib/wizard/` (formatScopeTag)                                           |
| `compile`           | `lib/configuration` (**ConfigLoadError**, effectivelyExcludedSkillIds, loadProjectConfig, loadProjectConfigFromDir, resolveSource), `lib/stacks` (getStackSkillIds), `lib/loading` (**loadSkillsMatrixFromSource**), `lib/installation` (Installation type), **`lib/config-gate/`** (reconcileTypesFromDisk, GateReport type)                                                                                                                                                                                                                                                                                                                                                                  |
| `doctor`            | `lib/configuration` (effectivelyExcludedSkillIds, validateProjectConfig), `lib/matrix/matrix-provider` (matrix), `lib/skills` (discoverLocalSkills), `lib/stacks` (getStackSkillIds), `lib/agents` (filterExcludedEntries, listAgentMdFiles), `lib/plugins` (getVerifiedPluginInstallPaths, parseMarketplacePluginRef), `lib/installation` (isHomeDirectory, installBaseDir, resolveInstallPaths)                                                                                                                                                                                                                                                                                              |
| `eject`             | `lib/configuration/` (resolveSource, loadProjectSourceConfig, **getProjectConfigPath**), **`lib/config-gate/`** (ensureBlankPair, lazyGateDeps, mutateGlobal, writeProjectPartial), `lib/installation/` (isHomeDirectory), `lib/matrix/matrix-provider` (matrix), `lib/skills/` (copySkillsToLocalFlattened), `lib/loading/` (SourceLoadResult type)                                                                                                                                                                                                                                                                                                                                           |
| `search`            | `lib/configuration/` (resolveAllSources), `lib/loading/` (fetchFromSource, parseFrontmatter), `lib/metadata-keys` (**IMPORT_DEFAULTS**)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `update`            | `lib/skills/` (injectForkedFromMetadata, SkillComparisonResult type), `lib/loading/source-loader` (**SourceLoadResult** type), **`lib/config-gate/`** (normalizeProjectPath), **`lib/configuration/project-config`** (loadProjectConfigFromDir) — both added by the registered-project refresh                                                                                                                                                                                                                                                                                                                                                                                                 |
| `uninstall`         | `lib/plugins/` (listPluginNames, getProjectPluginsDir, buildMarketplacePluginRef, parseMarketplacePluginRef, toClaudePluginScope), `lib/skills/` (readForkedFromMetadata), `lib/agents/` (listAgentMdFiles), `lib/installation/` (isHomeDirectory, resolveInstallPaths), **`lib/config-gate/`** (lazyGateDeps, mutateGlobal, propagateGlobalRemoval), `lib/loading` (loadSkillsMatrixFromSource), `lib/configuration/project-config` (**ConfigLoadError**, loadProjectConfigFromDir)                                                                                                                                                                                                           |
| `list`              | `lib/plugins/` (getInstallationInfo, formatInstallationDisplay), `lib/installation/installation` (detectInstallation, INSTALL_MODE_LABELS), `lib/configuration/project-config` (loadProjectConfig)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `validate`          | `lib/plugins/` (validateAllPlugins, **validatePlugin**, printPluginValidationResult, validateSkillFrontmatter, validateAgentFrontmatter, getUserPluginsDir, getProjectPluginsDir, **getInstalledPluginsRegistryPath**, **listRegisteredPluginInstalls**, ResolvedPlugin type), `lib/source-validator` (validateSource), `lib/configuration/` (isLocalSource, resolveAllSources, SourceEntry type), `lib/installation/` (resolveInstallPaths, isHomeDirectory), `lib/agents/` (listAgentMdFiles), `lib/schemas` (**splitMetadataValidationIssues**, validateSkillMetadata) — no longer imports `lib/schema-validator`                                                                           |
| `import skill`      | `lib/loading/` (fetchFromSource), `lib/schemas` (importedSkillMetadataSchema), `lib/skills/skill-metadata` (writeMetadataYaml), `lib/versioning` (getCurrentDate, computeFileHash), `lib/metadata-keys` (IMPORT_DEFAULTS), `utils/string` (toTitleCase), `utils/yaml-schema` (stripYamlSchemaComment)                                                                                                                                                                                                                                                                                                                                                                                          |
| `new skill`         | `lib/configuration/` (resolveAuthor), `lib/configuration/config-loader` (loadConfig), `lib/configuration/config-types-writer` (loadConfigTypesDataInBackground), **`lib/config-gate/`** (writeScaffoldedEntityTypes), `lib/schemas` (skillCategoriesFileSchema), `lib/feature-flags` (FEATURE_FLAGS, featureDisabledError), `lib/versioning` (computeSkillFolderHash), `lib/installation/` (detectInstallation), `lib/metadata-keys` (LOCAL_DEFAULTS), `lib/skills/generators` (generateSkillCategoriesTs, generateSkillRulesTs, buildCategoryEntry, formatTsExport), `lib/validate-kebab-name` (validateKebabCaseName), `utils/string` (toTitleCase), `utils/yaml-schema` (yamlSchemaComment) |
| `new agent`         | `lib/installation/` (resolveInstallPaths), `lib/configuration/` (resolveSource), `lib/configuration/config-types-writer` (loadConfigTypesDataInBackground, ConfigTypesBackgroundData type), **`lib/config-gate/`** (writeScaffoldedEntityTypes), `lib/feature-flags` (FEATURE_FLAGS, featureDisabledError), `lib/schemas` (modelNameSchema), `lib/agents/` (getAgentDefinitions)                                                                                                                                                                                                                                                                                                               |
| `new marketplace`   | `lib/marketplace-generator` (generateMarketplace, writeMarketplace), **`lib/config-gate/`** (writeMarketplaceScaffoldConfig, writeScaffoldedEntityTypes), `lib/configuration/config-types-writer` (loadConfigTypesDataInBackground), `lib/feature-flags` (FEATURE_FLAGS, featureDisabledError), `lib/validate-kebab-name` (validateKebabCaseName), `lib/skills/skill-plugin-compiler` (compileAllSkillPlugins), `lib/skills/generators` (generateSkillCategoriesTs, generateSkillRulesTs), `lib/metadata-keys` (LOCAL_DEFAULTS)                                                                                                                                                                |
| `build plugins`     | `lib/skills` (compileAllSkillPlugins, compileSkillPlugin, printCompilationSummary), `lib/agents` (compileAllAgentPlugins, printAgentCompilationSummary), `lib/plugins` (readPluginManifest)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `build marketplace` | `lib/marketplace-generator` (generateMarketplace, writeMarketplace, getMarketplaceStats), `lib/validate-kebab-name` (validateKebabCaseName)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Two command-module edges sit outside the layer model.** `commands/new/marketplace.ts` imports `resolveAuthorOrDefault` and `scaffoldSkillFiles` from its sibling `commands/new/skill.ts` (marketplace scaffolding reuses the skill scaffolder), and `hooks/init.ts` imports `runDashboardFlow` from `commands/init.js` (the oclif init hook routes a bare invocation to the dashboard). Both are command-to-command; neither goes through operations or lib.

---

## Command -> Store Imports

| Command | Store Import                                 | Why                                                                                                                                                                                                     |
| ------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`  | `stores/wizard-store` (`hydrateWizardStore`) | `SkillAgentSummary` reads installed/diff state from the store, not from props, so `list` must seed the store before rendering it. Renders no wizard, so there is no `runWizardSession` to do it for it. |

No other command imports a store. `init` and `edit` reach the store only through `components/wizard/run-wizard-session.tsx`, which calls the same `hydrateWizardStore` on their behalf.

---

## Command -> Component Imports

Commands that render Ink components.

| Command     | Components Imported                                                                                                                                                                                                                                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`      | `components/wizard/run-wizard-session` (runWizardSession), `components/wizard/wizard` (WizardResultV2 type), `components/hooks/use-terminal-dimensions` (**useTerminalDimensions**), `components/common/select-list` (SelectList), `components/common/prompt-confirm` (promptValue), `components/common/spinner` (Spinner) |
| `edit`      | `components/wizard/run-wizard-session` (runWizardSession), `components/wizard/wizard` (WizardResultV2 type), `components/common/spinner` (Spinner)                                                                                                                                                                         |
| `list`      | `components/wizard/skill-agent-summary` (SkillAgentSummary)                                                                                                                                                                                                                                                                |
| `update`    | `components/common/confirm` (Confirm), `components/common/prompt-confirm` (promptConfirm)                                                                                                                                                                                                                                  |
| `uninstall` | `components/common/confirm` (Confirm), `components/common/prompt-confirm` (promptConfirm)                                                                                                                                                                                                                                  |
| `new agent` | `components/common/prompt-confirm` (promptValue); otherwise inline Ink components + `@inkjs/ui` TextInput                                                                                                                                                                                                                  |

Note: `init` and `edit` render the wizard through `components/wizard/run-wizard-session.tsx` (`runWizardSession`) rather than importing the `Wizard` component directly — they only import the `WizardResultV2` type from `components/wizard/wizard`.

Note: `search` was rewritten to use `@oclif/table` and no longer renders Ink components. The `components/skill-search/` directory was removed.

Note: `init` is the only command that imports a component **hook** (`useTerminalDimensions`). Its dashboard view is declared inline in `init.tsx` rather than as a component file, so it consumes the hook directly instead of through a wizard component.

---

## Operations -> Lib Map

Each operation file and which lib modules it wraps.

### Source Operations (`lib/operations/source/`)

| Operation            | File                            | Lib Modules Used                                                                                                                           |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `loadSource`         | `source/load-source.ts`         | `lib/loading/` (loadSkillsMatrixFromSource, SourceLoadResult type), `utils/logger` (enableBuffering, drainBuffer, disableBuffering)        |
| `ensureMarketplace`  | `source/ensure-marketplace.ts`  | `lib/loading/` (fetchMarketplace), `utils/exec` (claudePluginMarketplaceExists, claudePluginMarketplaceAdd, claudePluginMarketplaceUpdate) |
| `requireMarketplace` | `source/require-marketplace.ts` | `source/ensure-marketplace` (ensureMarketplace) — resolves-or-errors wrapper used by `BaseCommand.requireMarketplaceOrExit()`              |

### Project Operations (`lib/operations/project/`)

| Operation                                                               | File                                   | Lib Modules Used                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detectProject`                                                         | `project/detect-project.ts`            | `lib/installation/` (detectInstallation, Installation type), `lib/configuration/` (**ConfigLoadError**, loadProjectConfig)                                                                                                                                                                                                                                                                                 |
| `detectBothInstallations`                                               | `project/detect-both-installations.ts` | `lib/installation/` (detectGlobalInstallation, detectProjectInstallation, **isHomeDirectory**, Installation type)                                                                                                                                                                                                                                                                                          |
| `compileAgents`                                                         | `project/compile-agents.ts`            | `lib/agents/` (recompileAgents), `lib/agents/list-compiled-agents` (**pruneStaleCompiledAgents**), `lib/configuration/` (loadProjectConfigFromDir), `lib/installation/` (buildAgentScopeMap)                                                                                                                                                                                                               |
| `compileAgentsAllScopes`                                                | `project/compile-agents-all-scopes.ts` | `project/compile-agents` (compileAgents, CompilationResult type), `lib/installation/` (isHomeDirectory, resolveInstallPaths) — fans compileAgents out across project + global scopes; used by `init`/`edit`                                                                                                                                                                                                |
| `recompileRegisteredProjectAgents` / `recompilePropagatedProjectAgents` | `project/recompile-project-agents.ts`  | `project/compile-agents` (compileAgents, CompilationResult type), `project/load-agent-defs` (loadAgentDefs), `skills/` (discoverInstalledSkills), `lib/installation/` (resolveInstallPaths), `utils/errors` (getErrorMessage) — the deepest operation-to-operation composition in the layer. Its only caller is `lib/config-gate/recompile.ts`, via a lazy `await import(...)` (the lib → operations rule) |
| `writeProjectConfig`                                                    | `project/write-project-config.ts`      | `lib/installation/` (buildAndMergeConfig, resolveInstallPaths, **isHomeDirectory**), `lib/loading/` (**loadMergedAgents**, SourceLoadResult type), `lib/configuration/` (**AuthoritativeScope** type), **`lib/config-gate/`** (ensureBlankPair, writeScopedFromWizard, GateReport type), `components/wizard/wizard` (WizardResultV2 type) — returns `ConfigWriteResult.propagation: GateReport`            |
| `loadAgentDefs`                                                         | `project/load-agent-defs.ts`           | `lib/agents/` (getAgentDefinitions), `lib/loading/` (**loadMergedAgents**)                                                                                                                                                                                                                                                                                                                                 |

### Skills Operations (`lib/operations/skills/`)

| Operation                 | File                                  | Lib Modules Used                                                                                                                                                 |
| ------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `discoverInstalledSkills` | `skills/discover-skills.ts`           | `lib/plugins/` (discoverAllPluginSkills), `lib/loading/` (**loadSkillsFromDir**), `lib/installation/is-home-directory` (**isHomeDirectory**)                     |
| `copyLocalSkills`         | `skills/copy-local-skills.ts`         | `lib/installation/` (resolveInstallPaths), `lib/skills/` (copySkillsToLocalFlattened, **deleteLocalSkill**), `lib/loading/source-loader` (SourceLoadResult type) |
| `compareSkillsWithSource` | `skills/compare-skills.ts`            | `lib/skills/` (compareLocalSkillsWithSource), `skills/collect-scoped-skill-dirs` (**collectScopedSkillDirs** — sibling operation)                                |
| `collectScopedSkillDirs`  | `skills/collect-scoped-skill-dirs.ts` | `lib/installation/is-home-directory` (**isHomeDirectory**); otherwise `utils/fs` directly                                                                        |
| `findSkillMatch`          | `skills/find-skill-match.ts`          | `lib/skills/` (SkillComparisonResult type only)                                                                                                                  |
| `installPluginSkills`     | `skills/install-plugin-skills.ts`     | `lib/plugins/` (**buildMarketplacePluginRef**, **toClaudePluginScope**), `utils/exec` (claudePluginInstall)                                                      |
| `uninstallPluginSkills`   | `skills/uninstall-plugin-skills.ts`   | `lib/plugins/` (**buildMarketplacePluginRef**, **toClaudePluginScope**), `utils/exec` (claudePluginUninstall)                                                    |

**`loadAllAgents` vs `loadMergedAgents`.** Both are exported from `lib/loading/index.ts` and neither operation uses the first. `loadAgentDefs` and `writeProjectConfig` call **`loadMergedAgents`** (source agents merged with project overrides). `loadAllAgents` is lib-internal in practice — its only production callers are `lib/loading/loader.ts` itself, `lib/loading/source-loader.ts` and `lib/agents/agent-recompiler.ts`. Picking the wrong one silently drops project-local agent overrides.

**`isHomeDirectory` is imported by deep path, not through the barrel.** `discover-skills.ts` and `collect-scoped-skill-dirs.ts` both import from `lib/installation/is-home-directory.js` directly rather than `lib/installation/index.js`, avoiding pulling the whole installation barrel (and `local-installer.ts` with it) into the skills-discovery path.

---

## Shared Utility Consumers

### `utils/exec.ts` (Claude CLI wrappers)

| Layer      | Consumer Files                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Commands   | `commands/uninstall.tsx`, `commands/edit.tsx`, `commands/new/agent.tsx`                                                                 |
| Operations | `operations/skills/install-plugin-skills.ts`, `operations/skills/uninstall-plugin-skills.ts`, `operations/source/ensure-marketplace.ts` |
| Lib        | `lib/installation/mode-migrator.ts`, `lib/stacks/stack-installer.ts`                                                                    |

Total: 8 production consumers

### `utils/fs.ts` (file system helpers)

| Layer    | Consumer Count | Notable Consumers                                                                                                                                                                                                                               |
| -------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands | 13             | edit, uninstall, update, search, eject, doctor, import/skill, new/marketplace, new/skill, new/agent, etc.                                                                                                                                       |
| Lib      | 39             | Nearly all lib subdirs (incl. operations/): compiler, loading/_, configuration/_, installation/_, skills/_, plugins/_, stacks/_, agents/\*, resolver, versioning, schema-validator, source-validator, permission-checker, marketplace-generator |

Total: 52 production consumers (most-used utility in the project)

### `utils/logger.ts` (warn, verbose, log, message buffering)

| Layer      | Consumer Count | Notable Consumers                                                                                                                                                                          |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Commands   | 8              | build/marketplace, build/plugins, compile, doctor, edit, import/skill, init, new/skill                                                                                                     |
| Components | 3              | wizard/wizard-layout.tsx, wizard/wizard.tsx, wizard/step-settings.tsx                                                                                                                      |
| Stores     | 1              | wizard-store.ts                                                                                                                                                                            |
| Lib        | 43             | Nearly all lib subdirs (incl. operations/): compiler, loading/_, configuration/_, installation/_, skills/_, plugins/_, stacks/_, agents/_, matrix/_, schemas, output-validator, versioning |

Total: 55 production consumers (most-used utility overall)

### `utils/errors.ts` (getErrorMessage)

| Layer      | Consumer Count | Notable Consumers                                                                                                                                   |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commands   | 13             | base-command, build/marketplace, **compile**, doctor, edit, import/skill, init, new/agent, new/marketplace, new/skill, uninstall, update, validate  |
| Components | 2              | hooks/use-source-operations.ts, wizard/step-settings.tsx                                                                                            |
| Operations | 3              | project/recompile-project-agents.ts, skills/install-plugin-skills.ts, skills/uninstall-plugin-skills.ts                                             |
| Lib        | 19             | compiler, loading/_, configuration/_ (incl. project-config), installation/_, skills/_, plugins/_, stacks/_, agents/\*, versioning, source-validator |

Total: 37 production consumers

### `utils/messages.ts` (ERROR_MESSAGES, SUCCESS_MESSAGES, STATUS_MESSAGES, INFO_MESSAGES)

| Layer    | Consumer Files                                                                         |
| -------- | -------------------------------------------------------------------------------------- |
| Commands | `init`, `edit`, `compile`, `uninstall`, `update`, `search`, `import/skill`, `validate` |

Total: 8 consumers (commands only -- messages are a presentation concern)

### `utils/typed-object.ts` (typedEntries, typedKeys)

| Layer      | Consumer Count | Notable Consumers                                                                                                                 |
| ---------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Commands   | 3              | eject, edit, search                                                                                                               |
| Operations | 2              | discover-skills, compare-skills                                                                                                   |
| Components | 3              | wizard/domain-selection, wizard/stack-selection, wizard/step-agents                                                               |
| Stores     | 1              | wizard-store.ts                                                                                                                   |
| Lib        | 18             | compiler, matrix/_, loading/_, configuration/_, installation/_, stacks/_, agents/_, plugins/\*, resolver, wizard/build-step-logic |

Total: 27 production consumers

### `utils/string.ts` (truncateText, toTitleCase)

| Layer      | Consumer Files                                       |
| ---------- | ---------------------------------------------------- |
| Commands   | `import/skill`, `new/skill`, `search`                |
| Components | `wizard/step-agents.tsx`                             |
| Lib        | `matrix/skill-resolution.ts`, `skills/generators.ts` |

Total: 6 production consumers (`toTitleCase` now lives here — moved out of `lib/skills/generators`; `truncateText` still used by `search` after the `@oclif/table` rewrite that removed `skill-search/`)

### `utils/type-guards.ts` (isCategory, isDomain, isAgentName, isCategoryPath, isSkillId, isSkillSlug, isSkillAssignment, isRecord)

| Layer      | Consumer Files                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Components | `wizard/utils.ts`, `wizard/step-agents.tsx`                                                                                                                                                                |
| Lib        | `agents/list-compiled-agents.ts`, `configuration/config-writer.ts`, `loading/source-fetcher.ts`, `permission-checker.tsx`, `plugins/plugin-validator.ts`, `source-validator.ts`, `stacks/stacks-loader.ts` |

Total: 9 production consumers (`wizard-store.ts` no longer imports type guards)

### `utils/frontmatter.ts` (extractFrontmatter)

| Layer | Consumer Files                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| Lib   | `agents/agent-plugin-compiler.ts`, `loading/loader.ts`, `plugins/plugin-validator.ts`, `output-validator.ts` |

Total: 4 production consumers

### `utils/terminal.ts` (clearTerminalScreen, isTerminalLargeEnough, formatTerminalTooSmallMessage)

| Layer      | Consumer Files                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Commands   | `base-command.ts` (all three), `commands/init.tsx` (`clearTerminalScreen`)                       |
| Components | `components/wizard/wizard-layout.tsx` (`isTerminalLargeEnough`, `formatTerminalTooSmallMessage`) |

Total: 3 production consumers

`isTerminalLargeEnough` and `formatTerminalTooSmallMessage` were added.0 and are the reason this module now has a **component** consumer. The terminal-size minimum is enforced at two points that must not drift:

| Enforcement point                  | File                                  | When it runs                                                                          |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `BaseCommand.ensureTerminalSize()` | `base-command.ts`                     | Once in `init()`, before Ink mounts; blocks until the terminal grows                  |
| `WizardLayout` size guard          | `components/wizard/wizard-layout.tsx` | Every render, off `useTerminalDimensions()`; replaces the wizard tree while too small |

Both read `MIN_TERMINAL_SIZE` from `consts.ts` through the same two helpers, so the threshold and the message exist in one place each. Neither may hardcode its own copy: a threshold duplicated in the startup gate leaves the constant in `consts.ts` with zero importers, so editing the documented constant changes nothing.

### `utils/yaml-schema.ts` (yamlSchemaComment, stripYamlSchemaComment)

| Layer    | Consumer Files                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------ |
| Commands | `commands/new/skill.ts` (yamlSchemaComment), `commands/import/skill.ts` (stripYamlSchemaComment) |
| Lib      | `lib/skills/skill-plugin-compiler.ts`, `lib/skills/skill-metadata.ts`                            |

Total: 4 production consumers

### ~~`utils/yaml.ts`~~ (DELETED)

Removed -- was dead code with zero production importers. Production YAML loading uses `parseYaml()` + `schema.safeParse()` directly.

---

## Store -> Lib Dependencies

The wizard store (`stores/wizard-store.ts`) imports from:

| Lib Module                              | Imports                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `lib/installation/index.ts`             | `InstallMode` (type only)                                                                                                 |
| `lib/installation/installation.ts`      | `deriveInstallMode` (aliased `sharedDeriveInstallMode`)                                                                   |
| `lib/matrix/matrix-provider.ts`         | `matrix`, `getSkillById`, `getCategoryDomain`                                                                             |
| `lib/configuration/scope-predicates.ts` | `isActiveAt`, `isGlobalTombstone`, `isProjectOwned`                                                                       |
| `lib/wizard/`                           | `buildCategoriesForDomain`, `isCompatibleWithSelectedFrameworks`, `FRAMEWORK_CATEGORY_ID`, `orderDomains`, `skillSlotKey` |

Plus one **type-only edge back into components**: `import type { SourceOption, SourceRow } from "../components/wizard/source-grid.js"`. This is the store consuming a row shape the component owns; it carries no runtime import, so it does not violate the store->components direction ban. It is one of four such edges — see the type-only edge table under the layer diagram.

`skillSlotKey` is load-bearing: `lib/wizard/scope-diff.ts` (the confirm step's `computeScopeDiff`) and the store's Sources-tab collectors both build their keys with it, so the two surfaces cannot drift apart on what "the same slot" means (D-278).

`agentSlotKey` is exported alongside it from `lib/wizard/scope-diff.ts` but has **no consumer outside its own module** — grepped at time of writing, every call site is inside `scope-diff.ts`. It is exported ahead of a second caller on purpose: routing through it from the start is what the skill side did not do, and re-deriving on `name` alone is how that side drifted. Treat its zero-consumer state as intended, not as dead code.

---

## Component -> Lib Dependencies (production only)

| Component                               | Lib Module                         | Import                                                                    |
| --------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `hooks/use-build-step-props.ts`         | `lib/matrix/matrix-provider`       | `matrix`                                                                  |
| `hooks/use-category-grid-input.ts`      | `lib/feature-flags`                | `FEATURE_FLAGS`(gates the `F` filter-incompatible keypress)               |
| `hooks/use-framework-filtering.ts`      | `lib/wizard/`                      | `buildCategoriesForDomain`                                                |
| `hooks/use-source-grid-search-modal.ts` | `lib/matrix/matrix-provider`       | `matrix`                                                                  |
| `hooks/use-source-operations.ts`        | `lib/configuration/source-manager` | `addSource`, `removeSource`                                               |
| `wizard/wizard-layout.tsx`              | `lib/feature-flags`                | `FEATURE_FLAGS`                                                           |
| `wizard/hotkeys.ts`                     | `lib/feature-flags`                | `FEATURE_FLAGS` (gates `isInfoPanelAvailable` and the filter hotkey)      |
| `wizard/domain-selection.tsx`           | `lib/matrix/matrix-provider`       | `matrix`                                                                  |
| `wizard/step-agents.tsx`                | `lib/matrix/matrix-provider`       | `matrix`                                                                  |
| `wizard/step-agents.tsx`                | `lib/wizard/`                      | `deriveScopeBadges`, `formatScopeTag`                                     |
| `wizard/step-sources.tsx`               | `lib/feature-flags`                | `FEATURE_FLAGS`                                                           |
| `wizard/step-sources.tsx`               | `lib/configuration/`               | `resolveAllSources`                                                       |
| `wizard/step-sources.tsx`               | `lib/loading/multi-source-loader`  | `searchExtraSources`                                                      |
| `wizard/stack-selection.tsx`            | `lib/matrix/matrix-provider`       | `matrix`                                                                  |
| `wizard/category-grid.tsx`              | `lib/matrix/matrix-provider`       | `getSkillById`                                                            |
| `wizard/source-grid.tsx`                | `lib/matrix/matrix-provider`       | `getSkillById`                                                            |
| `wizard/skill-agent-summary.tsx`        | `lib/matrix/matrix-provider`       | `getSkillDisplayName`                                                     |
| `wizard/skill-agent-summary.tsx`        | `lib/wizard/`                      | `computeScopeDiff`; `AgentDiffRow`, `DiffRowStatus`, `SkillDiffRow` types |
| `wizard/wizard.tsx`                     | `lib/matrix/`                      | `validateSelection`                                                       |
| `wizard/wizard.tsx`                     | `lib/matrix/matrix-provider`       | `getSkillById`, `findStack`                                               |
| `wizard/utils.ts`                       | `lib/matrix/matrix-provider`       | `findStack`                                                               |
| `wizard/utils.ts`                       | `lib/wizard/`                      | `orderDomains`                                                            |
| `wizard/step-settings.tsx`              | `lib/configuration/source-manager` | `getSourceSummary`, `SourceSummary`                                       |
| `wizard/step-settings.tsx`              | `lib/configuration/config`         | `DEFAULT_SOURCE`                                                          |

**`wizard/wizard.tsx` does not import `FEATURE_FLAGS`.** The flag checks live behind `isInfoPanelAvailable()` in `wizard/hotkeys.ts`, which carries that edge. `wizard.tsx`'s lib edges are matrix-only.

**Neither summary surface has a lib edge.** `wizard/step-confirm.tsx` imports only `ink` and `SummaryPanel`; its whole body is a `useInput` claiming `Enter` and `Esc`, deliberately disjoint from the `↑`/`↓` that `SummaryPanel` owns. `wizard/summary-panel.tsx` imports no lib module either: it composes `SkillAgentSummary` (which owns the `computeScopeDiff` call), `ScrollAffordance` and the `usePanelScroll` hook, and reaches `findStack` indirectly through `getStackName` in `wizard/utils.ts` (which carries the edge, listed above). `SummaryPanel` is rendered by two surfaces — `wizard/wizard-layout.tsx` (the `I` overlay) and `wizard/step-confirm.tsx` — which is what makes the two agree by construction.

**Shared overflow component:** `wizard/scroll-affordance.tsx` (`ScrollAffordance`) is consumed by exactly two components — `wizard/source-grid.tsx` and `wizard/summary-panel.tsx`. It imports only `ink` and `SCROLL_VIEWPORT` from `consts.ts` — no lib edge. `hooks/use-section-scroll.ts` and `hooks/use-panel-scroll.ts` produce the `hidden{Above,Below}` counts it renders (the former also read by `category-grid.tsx`, which discards them by design), and `use-section-scroll.ts` reads `SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS` from the same constant block, but neither imports the component.

---

## Key Observations

1. **`init` and `edit` are the heaviest commands** -- each imports 8-10 operations plus 6-7 direct lib modules. They orchestrate the full install/edit pipeline.

2. **Operations layer is NOT exhaustive** -- many commands bypass operations and import lib directly (`validate`, `list`, `import skill`, `new *`, `build *`). These are typically simpler commands or marketplace tooling commands. `uninstall` is now a partial adopter: it takes `loadAgentDefs` from operations while everything else it needs comes straight from lib.

3. **`lib/matrix/matrix-provider.ts` is the most cross-cutting lib module** -- imported by commands, components, stores, and other lib modules. It provides the global matrix singleton.

4. **Components access lib through a narrow set of modules.** The complete set, from the table above: `matrix/matrix-provider`, `matrix/index`, `lib/wizard/`, `feature-flags`, `configuration/source-manager`, `configuration/index`, `configuration/config`, `loading/multi-source-loader`. Grepped at time of writing, no component imports from `installation/`, `plugins/`, `skills/`, `stacks/`, `agents/`, `compiler.ts` or `schemas.ts`.

5. **`utils/fs.ts` and `utils/logger.ts` are the most-used utilities** at 52 and 55 production consumers respectively. They are consumed at every layer.

6. **`utils/yaml.ts` has been removed** -- was dead code with zero production importers.

7. **`utils/messages.ts` is a command-only concern** -- no lib, operations, or component file imports it.

8. **`lib/configuration/config-types-writer` is a gate-driven dependency** -- `new skill`, `new agent` and `new marketplace` reach it only for `loadConfigTypesDataInBackground` and route every write through `config-gate::writeScaffoldedEntityTypes`; `regenerateConfigTypes` itself is import-restricted to `config-gate/**` + `configuration/**` and throws `GlobalPairWriteViolation` if handed `$HOME`. The standalone renderer for the global half is private to `config-gate/pair-writer.ts`.

9. **There is no `build stack` subcommand and no `commands/build/stack.tsx`** -- stack compilation runs as part of `build plugins` via `lib/stacks/`.

10. **`search` renders no Ink** -- it uses `@oclif/table`'s `printTable`. There is no `components/skill-search/` directory.

11. **`new skill`, `new agent`, `new marketplace` are feature-gated at entry** -- each command's `run()` begins with `if (!FEATURE_FLAGS.NEW_*_COMMAND) this.error(featureDisabledError("new ..."))`. All three `NEW_*_COMMAND` flags default `false` in `lib/feature-flags.ts`, so these commands hard-exit before doing any work. The shared `featureDisabledError(commandName)` message factory lives alongside the flags in the same file (see the direct-lib-import rows above where each command imports `FEATURE_FLAGS, featureDisabledError`).

12. **Operation-to-operation composition happens in four operations, not one.** Verified by grep of relative sibling imports across `lib/operations/` at time of writing:

    | Operation                              | Imports from siblings                                       | Shape                                                              |
    | -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
    | `project/recompile-project-agents.ts`  | `compileAgents`, `loadAgentDefs`, `discoverInstalledSkills` | Deepest composite — one call recompiles a whole registered project |
    | `project/compile-agents-all-scopes.ts` | `compileAgents`                                             | Fan-out across scopes                                              |
    | `skills/compare-skills.ts`             | `collectScopedSkillDirs`                                    | Reuses the scope-split directory walk                              |
    | `source/require-marketplace.ts`        | `ensureMarketplace`                                         | Resolves-or-errors wrapper                                         |

    Every other operation wraps lib directly.

13. **The uninstall command reaches deepest into `lib/config-gate/`** -- `propagateGlobalRemoval` (global) + `mutateGlobal({ kind: "deregister-project" })` (project) + `lazyGateDeps`, plus `isHomeDirectory` / `resolveInstallPaths` from `lib/installation/` and `loadSkillsMatrixFromSource` from `lib/loading/`. There is no `uninstallProject` operation; the removal plan, the plugin teardown and the registered-project pruning all live in the command. The pruning also recompiles the pruned projects' agents, inside the gate, reported back through `GateReport.recompile`.

14. **`commands/compile.ts` depends on `lib/loading/` and `lib/config-gate/reconcileTypesFromDisk`.** This is the `config-types.ts` refresh pass; it uses `matrixOnly: true` so the `lib/loading/` edge does not make compile network-dependent. The gate edge also makes `compile` at `$HOME` a propagating command: it fans the hand-edited global config out to every registered project and recompiles their agents.

14a. **`commands/update.tsx` is a fan-out command.** It imports `recompilePropagatedProjectAgents` from `lib/operations/`, `normalizeProjectPath` from `lib/config-gate/` and `loadProjectConfigFromDir` from `lib/configuration/project-config`. The fan-out is the CONTENT twin of the gate's CONFIG fan-out: `update` rewrites the skill directories every registered project compiled its agents from, so it reuses the gate's own recompile helper. It deliberately does **not** go through config-gate and writes no pair — a skill's content changes nothing any config declares — which is why `normalizeProjectPath` had to be exported from the gate as a pure matcher (it writes nothing, so exporting it hands out no privilege).

14b. **`commands/init.tsx` is the sole consumer of `lib/seed/`**, importing `fetchSeedConfig` (`fetch-seed`) and `seedToWizardResult` (`seed-to-wizard`). The contract is documented in [features/seed-contract.md](./features/seed-contract.md) (wire format, version-discard policy, the payload -> `WizardResultV2` mapping, and the `--from` consumer path).

15. **`utils/terminal.ts` spans the pre-Ink / in-render divide by design.** Its consumers sit on both sides of the Ink mount — `base-command.ts` runs before Ink exists, `components/wizard/wizard-layout.tsx` runs on every render. Six utils modules have component consumers (`errors`, `logger`, `typed-object`, `string`, `type-guards`, `terminal`); what distinguishes this one is that both consumers implement the _same_ rule, so `utils/` is the only layer both can reach without one importing the other. See the `utils/terminal.ts` section above.

16. **Rebuild these tables by diffing, never by checking the rows already written.** A dead import survives a row-by-row validation pass and a missing import is invisible to one — both defects come from validating the doc's rows against source instead of diffing source's edges against the doc's rows. Grep every `import` in the owned directory and diff the edge set.

---

## Related Documentation

- [Architecture Overview](./architecture-overview.md) -- Directory structure, data flow, technology stack
- [Commands Reference](./commands/index.md) -- Command flags, exit codes, flow descriptions
- [Utilities Reference](./utilities.md) -- Detailed function signatures for all utils
- [Store Map](./store-map.md) -- WizardState shape, actions, consumers
