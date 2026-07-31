---
scope: reference
area: testing
keywords:
  [
    factories,
    createMockSkill,
    buildProjectConfig,
    createMockMatrix,
    helpers,
    assertions,
    content-generators,
    expected-values,
  ]
related:
  - reference/testing/infrastructure.md
  - reference/testing/mock-data.md
last_validated: 2026-07-30
---

<!-- re-validated 2026-07-30 (product v0.146.0, test-harness pass): added writeTestInstalledPluginsRegistry to the disk-writers helper table (claude CLI v2 installed_plugins.json fixture, previously undocumented); corrected the createTestSource example — the option is projectConfig, not config, and asPlugin / localSkills were omitted; replaced the invented `dirs.root` with the real TestDirs shape (tempDir, projectDir, sourceDir, skillsDir, agentsDir, pluginDir?, configDir?); re-verified the 38 factory exports and the 12 assertion helpers against source — no other drift -->

# Test Factories & Helpers

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

> **Split from:** `reference/test-infrastructure.md`. See also: [infrastructure.md](./infrastructure.md), [mock-data.md](./mock-data.md), [e2e-infrastructure.md](./e2e-infrastructure.md).

## Test Utilities (Domain-Scoped Directories)

The former monolithic `helpers.ts` has been split into three domain-scoped directories under `src/cli/lib/__tests__/`. Each has a barrel `index.ts` for imports. Tests import from `factories/`, `helpers/`, or `assertions/` as needed.

## Factory Functions (`src/cli/lib/__tests__/factories/`)

**MANDATORY: All test data must use these factories. Never construct inline.**

Barrel import: `import { createMockSkill, buildProjectConfig } from "../__tests__/factories/index.js"`

| Factory                                  | File                    | Purpose                              | Signature                                              |
| ---------------------------------------- | ----------------------- | ------------------------------------ | ------------------------------------------------------ |
| `createMockSkill()`                      | `skill-factories.ts`    | Create a ResolvedSkill mock          | `(id, overrides?) => ResolvedSkill`                    |
| `createMockExtractedSkill()`             | `skill-factories.ts`    | Create ExtractedSkillMetadata        | `(id, overrides?) => ExtractedSkillMetadata`           |
| `createMockSkillEntry()`                 | `skill-factories.ts`    | Create a Skill entry                 | `(id, preloaded?, overrides?) => Skill`                |
| `createMockSkillDefinition()`            | `skill-factories.ts`    | Create a SkillDefinition mock        | `(id, overrides?) => SkillDefinition`                  |
| `createMockSkillAssignment()`            | `skill-factories.ts`    | Create a SkillAssignment mock        | `(id, preloaded?) => SkillAssignment`                  |
| `sa()`                                   | `skill-factories.ts`    | Terse alias of the above             | `(id, preloaded?) => SkillAssignment`                  |
| `createMockCopiedSkill()`                | `skill-factories.ts`    | Create a CopiedSkill record mock     | `(id, overrides?) => CopiedSkill`                      |
| `createMockMultiSourceSkill()`           | `skill-factories.ts`    | Create multi-source ResolvedSkill    | `(id, sources, overrides?) => ResolvedSkill`           |
| `createMockSkillSource()`                | `skill-factories.ts`    | Create a SkillSource mock            | `(type, overrides?) => SkillSource`                    |
| `createTestSkill()`                      | `skill-factories.ts`    | Create a TestSkill for disk tests    | `(id, description, overrides?) => TestSkill`           |
| `testSkillToResolvedSkill()`             | `skill-factories.ts`    | Convert TestSkill to ResolvedSkill   | `(skill, overrides?) => ResolvedSkill`                 |
| `createMockAgent()`                      | `agent-factories.ts`    | Create an AgentDefinition mock       | `(name, overrides?) => AgentDefinition`                |
| `createMockAgentConfig()`                | `agent-factories.ts`    | Create an AgentConfig mock           | `(name, skills?, overrides?) => AgentConfig`           |
| `createMockCompiledAgentData()`          | `agent-factories.ts`    | Create CompiledAgentData mock        | `(overrides?) => CompiledAgentData`                    |
| `createMockMatrix()`                     | `matrix-factories.ts`   | Create a MergedSkillsMatrix mock     | `(...skills) => MergedSkillsMatrix`                    |
| `createMatrixFromTestSkills()`           | `matrix-factories.ts`   | Build matrix from TestSkill array    | `(skills, toResolvedOverrides?) => MergedSkillsMatrix` |
| `buildCategoryMap()`                     | `matrix-factories.ts`   | Widen partial category defs to map   | `(defs) => Record<Category, CategoryDefinition>`       |
| `createComprehensiveMatrix()`            | `matrix-factories.ts`   | Full matrix with 8 skills + stacks   | `(overrides?) => MergedSkillsMatrix`                   |
| `createBasicMatrix()`                    | `matrix-factories.ts`   | Minimal matrix with 5 skills         | `(overrides?) => MergedSkillsMatrix`                   |
| `createMockMatrixConfig()`               | `matrix-factories.ts`   | Create decomposed matrix config      | `(categories, overrides?) => MockMatrixConfig`         |
| `createMockCategory()`                   | `category-factories.ts` | Create a CategoryDefinition mock     | `(id, displayName, overrides?) => CategoryDefinition`  |
| `buildSourceConfig()`                    | `config-factories.ts`   | Create source config object          | `(overrides?) => Record<string, unknown>`              |
| `buildProjectConfig()`                   | `config-factories.ts`   | Create a ProjectConfig mock          | `(overrides?) => ProjectConfig`                        |
| `buildWizardResult()`                    | `config-factories.ts`   | Create a WizardResultV2 mock         | `(skills, overrides?) => WizardResultV2`               |
| `buildAgentConfigs()`                    | `config-factories.ts`   | Create AgentScopeConfig array        | `(agentNames, overrides?) => AgentScopeConfig[]`       |
| `buildSourceResult()`                    | `config-factories.ts`   | Create a SourceLoadResult mock       | `(matrix, sourcePath, overrides?) => SourceLoadResult` |
| `initMatrixAndSource()`                  | `config-factories.ts`   | initializeMatrix + buildSourceResult | `(matrix, sourcePath, overrides?) => SourceLoadResult` |
| `buildTestProjectConfig()`               | `config-factories.ts`   | Create TestProjectConfig             | `(agents, skills, overrides?) => TestProjectConfig`    |
| `createMockResolvedStack()`              | `stack-factories.ts`    | Create a ResolvedStack mock          | `(id, name, overrides?) => ResolvedStack`              |
| `createMockStack()`                      | `stack-factories.ts`    | Create a Stack mock                  | `(id, config) => Stack`                                |
| `createMockRawStacksConfig()`            | `stack-factories.ts`    | Create raw stacks config (2-stack)   | `() => RawStacksConfig`                                |
| `createMockRawStacksConfigWithArrays()`  | `stack-factories.ts`    | Raw stacks with array categories     | `() => RawStacksConfig`                                |
| `createMockRawStacksConfigWithObjects()` | `stack-factories.ts`    | Raw stacks with object assignments   | `() => RawStacksConfig`                                |
| `createCompileContext()`                 | `plugin-factories.ts`   | Create a CompileContext mock         | `(overrides?) => CompileContext`                       |
| `createMockCompileConfig()`              | `plugin-factories.ts`   | Create a CompileConfig mock          | `(agents, overrides?) => CompileConfig`                |
| `createMockCompiledStackPlugin()`        | `plugin-factories.ts`   | Create a CompiledStackPlugin mock    | `(overrides?) => CompiledStackPlugin`                  |
| `createMockMarketplace()`                | `plugin-factories.ts`   | Create a Marketplace mock            | `(plugins?) => Marketplace`                            |
| `createMockMarketplacePlugin()`          | `plugin-factories.ts`   | Create a MarketplacePlugin mock      | `(name, source?, category?) => MarketplacePlugin`      |

## Helper Functions (`src/cli/lib/__tests__/helpers/`)

Barrel import: `import { runCliCommand, writeTestSkill } from "../__tests__/helpers/index.js"`. Exception: `extractNamedSection` / `extractScopeSections` are imported directly from `config-source-sections.js` (not re-exported by the barrel).

| Helper                                | File                        | Purpose                                                                                                                                                                                                                                                                                 |
| ------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLI_ROOT`                            | `cli-runner.ts`             | Root path constant for CLI commands                                                                                                                                                                                                                                                     |
| `runCliCommand()`                     | `cli-runner.ts`             | Run CLI command, capture stdout/stderr/error                                                                                                                                                                                                                                            |
| `readTestYaml<T>()`                   | `config-io.ts`              | Read and parse YAML test file                                                                                                                                                                                                                                                           |
| `readTestJson<T>()`                   | `config-io.ts`              | Read and parse JSON test file                                                                                                                                                                                                                                                           |
| `readTestTsConfig<T>()`               | `config-io.ts`              | Load TS config file via jiti                                                                                                                                                                                                                                                            |
| `writeTestTsConfig()`                 | `config-io.ts`              | Write a config.ts file to a project directory                                                                                                                                                                                                                                           |
| `writeTestPackageJson()`              | `config-io.ts`              | Write package.json (marketplace identity)                                                                                                                                                                                                                                               |
| `normalizeGlobalConfig()`             | `config-comparison.ts`      | Order-INSENSITIVE config-text normalizer (strips `projects` line, sorts lines)                                                                                                                                                                                                          |
| `writeTestSkill()`                    | `disk-writers.ts`           | Write SKILL.md + metadata.yaml to dir                                                                                                                                                                                                                                                   |
| `writeSourceSkill()`                  | `disk-writers.ts`           | Write skill to source directory structure                                                                                                                                                                                                                                               |
| `writeTestAgent()`                    | `disk-writers.ts`           | Write agent metadata.yaml to dir                                                                                                                                                                                                                                                        |
| `writeSourceAgent()`                  | `disk-writers.ts`           | Write agent to source directory structure                                                                                                                                                                                                                                               |
| `createImportSource()`                | `disk-writers.ts`           | Write an import-source skill directory                                                                                                                                                                                                                                                  |
| `writeTestInstalledPluginsRegistry()` | `disk-writers.ts`           | Write a claude CLI v2 `installed_plugins.json` under a plugins dir. Takes `Record<"<plugin>@<marketplace>", installPaths[]>` and emits one user-scoped install record per path — the shape `claude plugin install` (>= 2.1.220) writes for its cache layout. Returns the registry path. |
| `writeTestPluginManifest()`           | `disk-writers.ts`           | Write a `.claude-plugin/plugin.json` manifest to dir. Pretty (2-space) by default; pass `{ pretty: false }` for compact-form call sites.                                                                                                                                                |
| `createTestDirs()`                    | `test-dir-setup.ts`         | Create plugin test directory structure                                                                                                                                                                                                                                                  |
| `cleanupTestDirs()`                   | `test-dir-setup.ts`         | Clean up plugin test directory structure                                                                                                                                                                                                                                                |
| `setupIsolatedHome()`                 | `isolated-home.ts`          | Isolate cwd + HOME + project dir per test                                                                                                                                                                                                                                               |
| `useFakeHome()`                       | `isolated-home.ts`          | beforeEach/afterEach fake-HOME lifecycle wrapper                                                                                                                                                                                                                                        |
| `silenceConsole()`                    | `silence-console.ts`        | Suppress console output during a test body                                                                                                                                                                                                                                              |
| `buildSkillConfig()`                  | `wizard-simulation.ts`      | Create a single SkillConfig                                                                                                                                                                                                                                                             |
| `buildSkillConfigs()`                 | `wizard-simulation.ts`      | Create SkillConfig array                                                                                                                                                                                                                                                                |
| `simulateSkillSelections()`           | `wizard-simulation.ts`      | Simulate user skill selections                                                                                                                                                                                                                                                          |
| `buildWizardResultFromStore()`        | `wizard-simulation.ts`      | Build WizardResultV2 from store                                                                                                                                                                                                                                                         |
| `extractSkillIdsFromAssignment()`     | `wizard-simulation.ts`      | Extract IDs from stack assignment                                                                                                                                                                                                                                                       |
| `extractNamedSection()`               | `config-source-sections.ts` | Extract a named config.ts const block                                                                                                                                                                                                                                                   |
| `extractScopeSections()`              | `config-source-sections.ts` | Split a section into global/project parts                                                                                                                                                                                                                                               |
| `parseTestFrontmatter()`              | `index.ts`                  | Lightweight frontmatter parser for assertions                                                                                                                                                                                                                                           |

## Assertion Helpers (`src/cli/lib/__tests__/assertions/`)

Barrel import: `import { assertConfigIntegrity, expectCompiledAgents } from "../__tests__/assertions/index.js"`

| Helper                       | File                    | Purpose                          |
| ---------------------------- | ----------------------- | -------------------------------- |
| `expectConfigSkills()`       | `config-assertions.ts`  | Assert expected skills in config |
| `expectConfigAgents()`       | `config-assertions.ts`  | Assert expected agents in config |
| `expectFullConfig()`         | `config-assertions.ts`  | Assert full config structure     |
| `expectSkillConfigs()`       | `config-assertions.ts`  | Assert skill config entries      |
| `expectAgentConfigs()`       | `config-assertions.ts`  | Assert agent config entries      |
| `expectConfigOnDisk()`       | `config-assertions.ts`  | Assert config file on disk       |
| `assertConfigIntegrity()`    | `config-assertions.ts`  | Assert config file integrity     |
| `parseCompiledAgent()`       | `agent-assertions.ts`   | Parse compiled agent output      |
| `expectAgentCompilation()`   | `agent-assertions.ts`   | Assert agent was compiled        |
| `expectValidAgentMarkdown()` | `agent-assertions.ts`   | Assert valid agent markdown      |
| `expectCompiledAgents()`     | `agent-assertions.ts`   | Assert multiple agents compiled  |
| `expectInstallResult()`      | `install-assertions.ts` | Assert installation result       |

## FS Utilities (`src/cli/lib/__tests__/test-fs-utils.ts`)

| Helper              | Purpose                   |
| ------------------- | ------------------------- |
| `createTempDir()`   | Create temp directory     |
| `cleanupTempDir()`  | Remove temp directory     |
| `fileExists()`      | Check if file exists      |
| `directoryExists()` | Check if directory exists |

## Expected Values (`src/cli/lib/__tests__/expected-values.ts`)

Canonical expected value constants for test assertions:

| Export            | Purpose                                                                      |
| ----------------- | ---------------------------------------------------------------------------- |
| `EXPECTED_AGENTS` | Agent name lists per domain (WEB, API, CLI, WEB_AND_API, ALL)                |
| `EXPECTED_SKILLS` | Skill ID lists per fixture (WEB_DEFAULT, API_DEFAULT, WEB_AND_API, ALL_TEST) |

## Content Generators (`src/cli/lib/__tests__/content-generators.ts`)

Pure content renderers for test file generation:

| Function               | Purpose                                                 |
| ---------------------- | ------------------------------------------------------- |
| `renderSkillMd()`      | Generate SKILL.md with frontmatter                      |
| `renderMetadataYaml()` | Generate skill metadata.yaml from `SkillMetadataFields` |
| `renderAgentYaml()`    | Generate agent source metadata.yaml                     |
| `renderAgentMd()`      | Generate installed agent markdown (`.claude/agents/*`)  |
| `renderConfigTs()`     | Generate config.ts with export                          |
| `renderCategoriesTs()` | Generate categories config                              |
| `renderRulesTs()`      | Generate rules config                                   |

**`renderMetadataYaml()` contract:** `contentHash` is a required field on `SkillMetadataFields` and is emitted unconditionally; `author` is also always emitted (defaults to `@test`). Fields are written in a fixed order the caller cannot influence — `custom`, `domain`, `author`, `displayName`, `category`, `slug`, `cliDescription`, `usageGuidance`, `contentHash`, `forkedFrom` — and a trailing newline is always appended. A fixture that must omit `contentHash`, drop `author`, or use a different field order cannot use this renderer (known carve-out: `outdatedForkMetadata` in `e2e/interactive/update.e2e.test.ts`).

## Test Source Factory (`src/cli/lib/__tests__/fixtures/create-test-source.ts`)

Creates complete project directory structures for integration tests:

```typescript
import { createTestSource } from "../fixtures/create-test-source.js";

const dirs = await createTestSource({
  skills: [...],         // TestSkill[]        — source skills under <sourceDir>/src/skills/
  agents: [...],         // TestAgent[]        — source agents
  stacks: [...],         // TestStack[]        — writes config/stacks.ts
  matrix: {...},         // Partial<TestMatrix>
  projectConfig: {...},  // TestProjectConfig  — writes <projectDir>/.claude-src/config.ts
  pluginManifest: {...}, // TestPluginManifest
  localSkills: [...],    // TestSkill[]        — writes into <projectDir>/.claude/skills/
  asPlugin: true,        // build as a plugin structure under .claude/plugins/<plugin-name>
});
```

`TestSourceOptions` field names are load-bearing: the project config option is **`projectConfig`**, not `config`.

`TestDirs` (the return shape) is `{ tempDir, projectDir, sourceDir, skillsDir, agentsDir, pluginDir?, configDir? }`. There is no `root` / `skills` / `agents` / `config` field. `cleanupTestSource(dirs)` tears the whole tree down.

The module also re-exports the file-IO helpers used alongside it: `readTestFile`, `readTestYaml`, `readTestJson`, `writeTestFile`, `writeTestYaml`, `fileExists`, `directoryExists`.
