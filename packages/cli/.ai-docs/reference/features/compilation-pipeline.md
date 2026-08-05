---
scope: reference
area: features
keywords:
  [
    compiler,
    templates,
    liquid,
    validation,
    output,
    plugin-ref,
    source,
    prune,
    propagation,
    config-types,
    matrixOnly,
  ]
related:
  - reference/features/agent-system.md
  - reference/features/operations-layer.md
  - reference/features/plugin-system.md
  - reference/config/config-writer.md
  - reference/commands/index.md
last_validated: 2026-07-30
---

# Compilation Pipeline

## Overview

**Purpose:** Compile agent prompt files from partials (identity, playbook, output, etc.) + skill assignments using Liquid templates.

**Entry Points:**

| Entry Point                          | File                                                          | When Called                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compileAgents()`                    | `src/cli/lib/operations/project/compile-agents.ts`            | Operations-layer wrapper (scope-filtering + delegation to `recompileAgents()`). Called directly by the `compile` and `update` commands; `init`/`edit` reach it via `compileAgentsAllScopes()` |
| `compileAgentsAllScopes()`           | `src/cli/lib/operations/project/compile-agents-all-scopes.ts` | Runs a global pass + project pass (or a single home pass), merges results. Called by `init` and `edit`                                                                                        |
| `recompilePropagatedProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Loops `recompileRegisteredProjectAgents()` over the project dirs propagation rewrote, isolating per-project failures. Called by `init` and `edit` after `writeProjectConfig()`                |
| `recompileRegisteredProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Single registered project, `scopeFilter: "project"` only. Discovers that project's skills itself and loads agent partials from the CLI                                                        |
| `recompileAgents()`                  | `src/cli/lib/agents/agent-recompiler.ts`                      | Core recompile: config load → resolve → per-agent render + scope-routed write. Called by `compileAgents()`                                                                                    |
| `compileAllAgents()`                 | `src/cli/lib/compiler.ts`                                     | Exported compiler primitive — only unit tests call it; NOT wired into any command                                                                                                             |
| `compileAllSkills()`                 | `src/cli/lib/compiler.ts`                                     | Exported compiler primitive — only unit tests call it; NOT wired into any command                                                                                                             |

## Pipeline Flow

This is the live `compile` / `init` / `edit` / `update` path. It recompiles and writes
**agents only** — skill, CLAUDE.md, and command copying happen in the install/eject
and plugin-build flows, not here.

```
1. Installation Detection
   -> detectBothInstallations() (src/cli/lib/operations/project/detect-both-installations.ts)
   -> Returns BothInstallations { global, project, hasBoth } (global/project are
      `Installation | null`, always present — never optional)
   -> `compile` builds separate passes per scope (global, project); when hasBoth,
      each pass carries a scopeFilter so a project pass cannot overwrite global agents

2. Agent Definitions Discovery
   -> loadAgentDefs() (src/cli/lib/operations/project/load-agent-defs.ts)
   -> getAgentDefinitions() (src/cli/lib/agents/agent-fetcher.ts)
   -> Returns AgentSourcePaths { agentsDir, templatesDir, sourcePath }
   -> Merges CLI built-in agents with source repository agents (source overrides CLI)

3. Skill Discovery (4-way merge)
   -> discoverInstalledSkills() (src/cli/lib/operations/skills/discover-skills.ts)
   -> 4-way merge via mergeSkills() (later sources win):
      a. Global plugins (from ~/.claude/plugins/)
      b. Global local skills (from ~/.claude/skills/, via GLOBAL_INSTALL_ROOT)
      c. Project plugins (from <projectDir>/.claude/plugins/)
      d. Project local skills (from <projectDir>/.claude/skills/, via LOCAL_SKILLS_PATH)
   -> Project wins on conflict (global-project pairs are skipped when projectDir is home)
   -> Returns DiscoveredSkills { allSkills, totalSkillCount, pluginSkillCount,
      localSkillCount, globalPluginSkillCount, globalLocalSkillCount }

4. Agent Resolution — recompileAgents() (agent-recompiler.ts)
   -> loadProjectConfig() reads project config (.claude-src/config.ts); a corrupt
      config throws ConfigLoadError rather than reading as absent
   -> filterExcludedEntries() drops excluded skills/agents and excluded stack refs
   -> loadAllAgents() (built-in) + loadProjectAgents() (project overrides) merged
   -> resolveAgentNames() determines which agents to compile — a PRESENT config is
      authoritative over its roster even when empty (`agents: []` compiles
      zero agents; only a config-LESS load falls through to the all-agents branch)
   -> buildCompileAgents() maps config entries into CompileAgentConfig per agent
      (attaches each skill's `source` via the id-keyed sourceById map)
   -> CompileConfig is constructed inline from the agents map + name/description
   -> resolveAgents() (src/cli/lib/resolver.ts) materializes skill references
   -> For each agent: resolveAgentSkillRefs() -> resolveSkillReferences() -> Skill[]

5. Liquid Engine Setup
   -> createLiquidEngine() (src/cli/lib/compiler.ts)
   -> Template root hierarchy (first match wins):
      a. {projectDir}/.claude-src/agents/_templates/
      b. {projectDir}/.claude/templates/ (legacy)
      c. {PROJECT_ROOT}/src/agents/_templates/ (built-in, via DIRS.templates)
   -> Config: extname=".liquid", strictVariables=false, strictFilters=true

6. Per-Agent Compile + Scope-Routed Write
   -> writeCompiledAgentsByScope() (src/cli/lib/agents/write-compiled-agents.ts)
   -> For each resolved agent, calls compileAgentForPlugin() (src/cli/lib/compiler.ts):
      - readAgentFiles(): identity.md, playbook.md, output.md,
        critical-requirements.md, critical-reminders.md (STANDARD_FILES from consts.ts)
      - buildAgentTemplateContext() with a per-skill mapSkill that attaches pluginRef
        via derivePluginRef(skill); splits skills into preloaded vs dynamic
      - sanitizeCompiledAgentData(): strips Liquid syntax from metadata + skill fields +
        preloaded IDs (content fields pass through unchanged)
      - engine.renderFile("agent", data) using LiquidJS
   -> Writes each agent to its scope dir: global agents -> ~/.claude/agents/,
      project agents -> outputDir (per agentScopeMap; default "project")
   -> Per-agent failures are collected as AgentWriteOutcome[] (recompile reports &
      continues; install hard-errors on the first failure)

7. Stale-Agent Pruning — pruneStaleAgentsForPass() in compile-agents.ts
   -> Runs only on an AUTHORITATIVE pass: `outputDir` set AND no `scopeFilter`
   -> pruneStaleCompiledAgents(outputDir, keep) (src/cli/lib/agents/list-compiled-agents.ts)
      deletes every `*.md` whose basename `isAgentName()` and is NOT in
      `keep` = compiled ∪ failed for that pass
   -> Hand-authored agents are PRESERVED: a basename outside the AgentName union
      never matches the predicate (the built-in-name check is a guard, not the
      removal criterion)
```

### Exported Compiler Primitives (test-only callers)

These `src/cli/lib/compiler.ts` functions are exported and unit-tested
(`src/cli/lib/compiler.test.ts`) but have **no production caller** — the live path
above renders through `writeCompiledAgentsByScope()`, not through these:

| Primitive                    | Purpose                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `compileAllAgents()`         | Compiles + `validateCompiledAgent()`s + writes all agents to `{outputDir}/agents/` |
| `compileAllSkills()`         | Deduplicates skills across agents (uniqueBy id) and copies skill files             |
| `copyClaudeMdToOutput()`     | Copies stack CLAUDE.md to the output directory (via `resolveClaudeMd()`)           |
| `compileAllCommands()`       | Copies `*.md` from `src/commands/` to `{outputDir}/commands/`                      |
| `removeCompiledOutputDirs()` | Removes `agents/`, `skills/`, `commands/` from the output directory                |

**Output validation** (`validateCompiledAgent()` in `src/cli/lib/output-validator.ts` —
XML tag balance, template artifacts, frontmatter validity, required patterns) runs only
inside `compileAllAgents()`. The live recompile path does NOT validate compiled output.

## Key Files

| File                                                         | Purpose                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `src/cli/lib/compiler.ts`                                    | Core compilation: Liquid engine, agent/skill compile                       |
| `src/cli/lib/agents/agent-recompiler.ts`                     | Orchestrates recompilation flow                                            |
| `src/cli/lib/agents/write-compiled-agents.ts`                | Per-agent render + scope-routed write (live path)                          |
| `src/cli/lib/agents/list-compiled-agents.ts`                 | `listAgentMdFiles` / `listCompiledAgentNames` / `pruneStaleCompiledAgents` |
| `src/cli/lib/agents/agent-fetcher.ts`                        | Fetches agent definitions (local or remote)                                |
| `src/cli/lib/agents/agent-plugin-compiler.ts`                | Plugin-mode agent compilation (individual agent plugins)                   |
| `src/cli/lib/resolver.ts`                                    | Resolves skill references, agent configs, CLAUDE.md path                   |
| `src/cli/lib/output-validator.ts`                            | Validates compiled agent output                                            |
| `src/cli/lib/operations/project/compile-agents.ts`           | Operations layer wrapper for compilation + stale-agent prune               |
| `src/cli/lib/operations/project/recompile-project-agents.ts` | Registered-project recompile + per-project failure isolation               |
| `src/cli/lib/operations/project/load-agent-defs.ts`          | Operations layer for agent definition loading                              |
| `src/cli/lib/operations/skills/discover-skills.ts`           | 4-way skill discovery and merge                                            |

## Agent File Structure

Each agent has a directory with these files:

```
src/agents/{category}/{agent-name}/
  identity.md                 # Required: agent identity/role
  playbook.md                 # Required: agent workflow/process
  output.md                   # Optional: examples and output format
  critical-requirements.md    # Optional: top-of-prompt requirements
  critical-reminders.md       # Optional: bottom-of-prompt reminders
  metadata.yaml               # Agent configuration (tools, model, permissions)
```

Output format resolution falls back from agent-specific dir to parent category dir.

Agent directories are organized by category:

```
src/agents/
  _templates/                 # Liquid templates
    agent.liquid              # Main agent template
    methodologies/            # Shared methodology partials
      investigation-requirements.liquid
      anti-over-engineering.liquid
      write-verification.liquid
      success-criteria.liquid
      context-management.liquid
      improvement-protocol.liquid
  developer/
    web-developer/
    api-developer/
    cli-developer/
    ai-developer/
    web-architecture/
  reviewer/
  tester/
  planning/
  meta/
  pattern/
  researcher/
```

## Agent Template Structure

**Main template:** `src/agents/_templates/agent.liquid`

The Liquid template renders agent prompts with this structure:

1. YAML frontmatter (name, description, tools, `disallowedTools` when present, model, effort, permissionMode, preloaded skill IDs emitted under the `skills:` key). **`model` and `effort` emit asymmetrically:** `model` is unconditional with a `default: "inherit"` filter, while `effort` is wrapped in an `{% if %}` and emits no key at all when unset — see [model-and-effort.md](./model-and-effort.md).
2. `<role>` section from `identity.md`
3. `<core_principles>` (5 hardcoded principles)
4. `<methodologies>` - renders 5 methodology partials:
   - `methodologies/investigation-requirements`
   - `methodologies/anti-over-engineering`
   - `methodologies/write-verification`
   - `methodologies/success-criteria`
   - `methodologies/context-management`
5. `<critical_requirements>` from `critical-requirements.md` (if non-empty)
6. `<skill_activation_protocol>` for dynamic skills (or `<skills_note>` if all preloaded)
7. Playbook content from `playbook.md`
8. `## Standards and Conventions` static section (hardcoded in template)
9. Output content from `output.md`
10. `<critical_reminders>` from `critical-reminders.md` (if non-empty)
11. Footer reminders (display principles, re-read files)

**Note:** The `improvement-protocol.liquid` methodology partial exists in the directory but is NOT rendered in the main `agent.liquid` template (only the 5 listed above are included).

## Skill Types in Compilation

| Type      | In Compiled Agent                                    | Loaded How                       |
| --------- | ---------------------------------------------------- | -------------------------------- |
| Preloaded | Content embedded directly in .md file                | Listed in frontmatter `skills:`  |
| Dynamic   | Metadata only (id, description, usage) in skill list | Loaded via Skill tool at runtime |

Split logic in `buildAgentTemplateContext()` in `src/cli/lib/compiler.ts`.

## Output Structure

```
.claude/
  agents/
    web-developer.md        # Compiled agent prompt
    api-developer.md
    ...
  skills/
    web-framework-react/
      SKILL.md              # Skill content
      reference.md          # Optional reference
      examples/             # Optional examples dir
      scripts/              # Optional scripts dir
    ...
  commands/
    custom-command.md       # Custom command definitions
  CLAUDE.md                 # Stack-specific CLAUDE.md
```

The live `compile` command writes only `agents/` (agents-only recompile). The
`skills/`, `commands/`, and `CLAUDE.md` outputs are produced by the install/eject
flow and the stack/skill/agent plugin-build flows (`compileStackPlugin()`,
`compileSkillPlugin()`, `compileAgentPlugin()`), not by `compile`.

## Security: Liquid Injection Prevention

File: `src/cli/lib/compiler.ts`

Pattern constant: `LIQUID_SYNTAX_PATTERN`

`sanitizeLiquidSyntax()` (exported) strips individual strings of Liquid delimiters.

`sanitizeCompiledAgentData()` (exported) strips Liquid template syntax (`{{`, `}}`, `{%`, `%}`) from:

- Agent metadata: name, title, description, tools, disallowedTools, model, permissionMode
- Skill metadata: id, description, usage, pluginRef — via `sanitizeSkills()`, applied to `skills`, `preloadedSkills`, and `dynamicSkills`
- Preloaded skill IDs (`preloadedSkillIds`)

**Content fields are NOT sanitized** — identity, playbook, output, criticalRequirementsTop, and criticalReminders pass through unchanged. LiquidJS does not re-evaluate template syntax inside variable values, so double-curlies in content (e.g. a GitHub Actions `${{ secrets.X }}` snippet) are safe.

This prevents user-controlled metadata (from YAML/TS config files) from executing as Liquid template code.

## Exported Functions Reference

### compiler.ts

| Function                      | Signature                                                                                                         | Purpose                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `sanitizeLiquidSyntax()`      | `<T extends string>(value: T, fieldName: string): T`                                                              | Strip Liquid syntax from a string                                                  |
| `sanitizeCompiledAgentData()` | `(data: CompiledAgentData): CompiledAgentData`                                                                    | Sanitize all fields before template render                                         |
| `buildAgentTemplateContext()` | `(name: AgentName, agent: AgentConfig, files: AgentFiles, mapSkill?: (skill: Skill) => Skill): CompiledAgentData` | Build template data; `mapSkill` transforms each skill (used to attach `pluginRef`) |
| `compileAgentForPlugin()`     | `(name: AgentName, agent: AgentConfig, fallbackRoot: string, engine: Liquid): Promise<string>`                    | Per-skill-`pluginRef` agent render used by the live recompile + plugin paths       |
| `compileAllAgents()`          | `(resolvedAgents: Record<AgentName, AgentConfig>, ctx: CompileContext, engine: Liquid): Promise<void>`            | Compile + validate + write all agents (test-only caller)                           |
| `compileAllSkills()`          | `(resolvedAgents: Record<AgentName, AgentConfig>, ctx: CompileContext): Promise<void>`                            | Deduplicate and copy skill files                                                   |
| `copyClaudeMdToOutput()`      | `(ctx: CompileContext): Promise<void>`                                                                            | Copy stack CLAUDE.md to output                                                     |
| `compileAllCommands()`        | `(ctx: CompileContext): Promise<void>`                                                                            | Copy command \*.md files to output                                                 |
| `createLiquidEngine()`        | `(projectDir?: string): Promise<Liquid>`                                                                          | Create Liquid engine with layered roots                                            |
| `removeCompiledOutputDirs()`  | `(outputDir: string): Promise<void>`                                                                              | Remove agents/, skills/, commands/ dirs                                            |

### output-validator.ts

| Function                        | Signature                                                     | Purpose                                           |
| ------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| `checkXmlTagBalance()`          | `(content: string): string[]`                                 | Check for unclosed/extra XML tags                 |
| `checkTemplateArtifacts()`      | `(content: string): string[]`                                 | Find unprocessed {{ }} or {% %} tags              |
| `checkRequiredPatterns()`       | `(content: string): string[]`                                 | Check frontmatter, <role>, principles, min length |
| `validateFrontmatter()`         | `(content: string): { errors: string[]; warnings: string[] }` | Validate YAML frontmatter fields                  |
| `validateCompiledAgent()`       | `(content: string): ValidationResult`                         | Full validation (all checks)                      |
| `printOutputValidationResult()` | `(agentName: AgentName, result: ValidationResult): void`      | Print validation results                          |

## Plugin-Mode Compilation

For native Claude Code plugin distribution:

| Compiler                   | File                                          | Output                                                                                                                                       |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `compileSkillPlugin()`     | `src/cli/lib/skills/skill-plugin-compiler.ts` | One skill plugin dir (singular)                                                                                                              |
| `compileAllSkillPlugins()` | `src/cli/lib/skills/skill-plugin-compiler.ts` | Batch: every `SKILL.md` under a dir; returns `SkillCompilationRun { compiled, failed }`                                                      |
| `compileAgentPlugin()`     | `src/cli/lib/agents/agent-plugin-compiler.ts` | One agent plugin dir (singular). `AgentPluginOptions` shape and its single internal construction site: [leaf-exports.md](../leaf-exports.md) |
| `compileAllAgentPlugins()` | `src/cli/lib/agents/agent-plugin-compiler.ts` | Batch: every agent `.md` under a dir; returns `CompiledAgentPlugin[]`                                                                        |
| `compileStackPlugin()`     | `src/cli/lib/stacks/stack-plugin-compiler.ts` | Bundled stack plugin dir                                                                                                                     |
| `compileAgentForPlugin()`  | `src/cli/lib/compiler.ts`                     | Single agent render with per-skill `pluginRef` (used by BOTH the live recompile path and stack-plugin compile)                               |

### Batch Skill-Plugin Compilation & Command Drivers

`compileAllSkillPlugins(skillsDir, outputDir)` (`src/cli/lib/skills/skill-plugin-compiler.ts`) is the batch wrapper over the singular `compileSkillPlugin()`. It globs every `**/SKILL.md` under `skillsDir`, compiles each, and returns `SkillCompilationRun { compiled: CompiledSkillPlugin[]; failed: string[] }`. A per-skill try/catch collects failures (by directory basename) and emits a `warn()` instead of aborting the whole run — contrast the install path, which hard-errors on the first failure. `printCompilationSummary()` prints the compiled list. `compileAllAgentPlugins()` is the agent counterpart but returns a bare `CompiledAgentPlugin[]` (no `failed` list).

| Command / caller                                            | File                                    | Drives                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build plugins`                                             | `src/cli/commands/build/plugins.ts`     | `compileSkillPlugin()` (with `--skill`) or `compileAllSkillPlugins()` (default), plus `compileAllAgentPlugins()` (with `--agents-dir`). Prunes stale skill-plugin dirs after a clean full run; skips pruning when any skill fails. |
| `new marketplace`                                           | `src/cli/commands/new/marketplace.ts`   | `compileAllSkillPlugins()` to build the scaffolded marketplace's plugins, then `generateMarketplace()` + `writeMarketplace()`.                                                                                                     |
| `installStackAsPlugin()` / `compileStackToTemp()` (library) | `src/cli/lib/stacks/stack-installer.ts` | `compileStackPlugin()`. Exported from `lib/stacks` but has no wired command caller.                                                                                                                                                |

`build marketplace` (`src/cli/commands/build/marketplace.ts`) does NOT compile — it scans already-built plugin dirs and generates `marketplace.json` via `generateMarketplace()` (identity read from `package.json`).

**`compileAgentForPlugin()` vs `compileAgent()` (both in `src/cli/lib/compiler.ts`):** the live recompile/plugin path uses `compileAgentForPlugin()`; the plain `compileAgent()` is reached only via the unused `compileAllAgents()` primitive. They differ by:

- `compileAgentForPlugin()` decides `pluginRef` **per-skill** via `derivePluginRef(skill)` based on each skill's own `source` field. No agent-wide `installMode` parameter.
- Preloaded skill IDs render with `pluginRef` when attached, otherwise bare skill IDs (`buildAgentTemplateContext()`: `preloadedSkillIds = preloadedSkills.map((s) => s.pluginRef ?? s.id)`).
- Both read agent files via the shared `readAgentFiles()` helper.

### Per-Skill `pluginRef` Format

Helper: `derivePluginRef(skill: Skill): PluginSkillRef | undefined` in `src/cli/lib/compiler.ts`.
Constant: `EJECT_SOURCE = "eject"` in `src/cli/consts.ts` (imported by `compiler.ts` and `stack-plugin-compiler.ts`).

Rule (mirrors the helper body):

| `skill.source`                 | Compiled reference | Frontmatter entry |
| ------------------------------ | ------------------ | ----------------- |
| `undefined`                    | bare `${id}`       | `${id}`           |
| `"eject"` (via `EJECT_SOURCE`) | bare `${id}`       | `${id}`           |
| any other string (marketplace) | `${id}:${id}`      | `${id}:${id}`     |

`undefined` covers user-authored local skills that have no `SkillConfig` entry -- intentional fall-through, not a silent fallback. Mixed-mode agents (some skills eject, some marketplace) produce a mix of bare and qualified refs in the same frontmatter.

**Per-skill resolution at runtime:** bare refs resolve against the user's `.claude/skills/` directory; qualified `${id}:${id}` refs resolve against the Claude Code plugin registry.

### `source` Plumbing Through the Compile Path

- `SkillReference.source?: string` (`src/cli/types/skills.ts`) -- carried alongside `id`, `usage`, `preloaded`.
- `Skill.source?: string` (same file) -- propagated from `SkillReference.source` by `resolveSkillReference()` in `resolver.ts`.
- `buildCompileAgents()` in `src/cli/lib/installation/local-installer.ts` attaches each skill's `source` to its `SkillReference` from a `Map<SkillId, string>` (`sourceById`) built from `config.skills`, so downstream `resolveSkillReference` can propagate it onto the fully-resolved `Skill` consumed by `compileAgentForPlugin`.
- `compileAgentForPlugin` (in `src/cli/lib/compiler.ts`) reads `skill.source` via `derivePluginRef(skill)` -- no `installMode` parameter.

### `installMode` Removed From the Compile Path

The dead `installMode` plumbing described in finding `agent-findings/2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md` has been removed. As of the current code:

- `RecompileAgentsOptions` (`src/cli/lib/agents/agent-recompiler.ts`) has no `installMode` field; there is no `CompileAndWriteParams` type.
- `compileAndWriteAgents()` (`src/cli/lib/installation/local-installer.ts`) takes `(compileConfig, agents, localSkills, sourceResult, projectDir, agentsDir, agentScopeMap?)` -- no `installMode` param.

Per-skill `source` (via `sourceById` -> `derivePluginRef`) is the sole authority for the plugin-vs-eject reference format. `InstallMode` / `deriveInstallMode()` still exist elsewhere (install-plan logging in `init.tsx`, `wizard-store.ts`) but no longer flow into agent compilation.

### Dual-Scope `sourceById` Collapse -- Verified Unreachable in Production

The `sourceById` map in `buildCompileAgents` keys by `SkillId` alone, so a dual-scope skill (same id under `"project"` and `"global"` with different `source` values) is last-write-wins. A 2026-07-18 audit (`agent-findings/2026-07-18-sourceById-collapse-unreachable-in-production.md`) confirmed the collapse is **not reachable through any production command**:

- `init`, `edit`, and `compile` all route through `recompileAgents()`, which calls `filterExcludedEntries()` BEFORE `buildCompileAgents()`, dropping the excluded (tombstone) entry so `sourceById` never sees two entries for one id.
- Even unfiltered, `generateProjectConfigWithInlinedGlobal()` (`config-writer.ts`) emits global entries before project entries, so the active project entry (serialized last) wins -- correct in both mixed-source directions.
- The only unfiltered callers (`installEject`, `installPluginConfig` in `local-installer.ts`) are unreachable dead code.

Covered by the regression test `e2e/lifecycle/dual-scope-mixed-source-compiled-ref.e2e.test.ts`. Keying by `(id, scope)` remains a robustness follow-up.

## Operations Layer Integration

The compilation pipeline is wrapped by the operations layer for use by commands:

| Operation                            | File                                                          | Purpose                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `compileAgents()`                    | `src/cli/lib/operations/project/compile-agents.ts`            | Scope-filtering orchestrator delegating to `recompileAgents()`, then pruning stale agents on an authoritative pass |
| `compileAgentsAllScopes()`           | `src/cli/lib/operations/project/compile-agents-all-scopes.ts` | Home single-pass / project two-pass driver for `init` and `edit`                                                   |
| `recompileRegisteredProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Recompile ONE registered project at project scope                                                                  |
| `recompilePropagatedProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Loop the above over `ConfigWriteResult.propagatedProjects`                                                         |
| `loadAgentDefs()`                    | `src/cli/lib/operations/project/load-agent-defs.ts`           | Load + merge CLI/source agent definitions                                                                          |
| `discoverInstalledSkills()`          | `src/cli/lib/operations/skills/discover-skills.ts`            | 4-way skill discovery and merge                                                                                    |
| `detectBothInstallations()`          | `src/cli/lib/operations/project/detect-both-installations.ts` | Find global + project installations                                                                                |

The `compile` command (`src/cli/commands/compile.ts`) uses these operations to:

1. `detectInstallations()` — `detectBothInstallations()` wrapped in a `ConfigLoadError`
   catch. A config file that exists but cannot be parsed hard-errors with
   `EXIT_CODES.ERROR` naming the path, BEFORE any compilation or write.
   Zero installations is also a hard error (`ERROR_MESSAGES.NO_INSTALLATION`).
2. `resolveAndLogSource()` then `loadAgentDefsOrFail()`
3. `buildCompilePasses()` — one pass per detected scope. `scopeFilter` is set only
   when `hasBoth`; a single-installation run is scope-UNfiltered and therefore
   authoritative over its `outputDir` (see the pruning stage above).
4. For each pass (`runCompilePass`): discover skills -> warn about
   configured-but-missing stack skills (`warnUnresolvedStackSkills()`) ->
   compile agents via `compileAgents()` -> `refreshConfigTypes()`
5. Zero passes with skills is a hard error.

A stack-referenced skill absent from disk is dropped from the recompiled agent.
`warnUnresolvedStackSkills()` surfaces each dropped skill as a `this.warn()`, so the default output
cannot report a clean recompile of an agent that silently lost a skill.

### `compile` Regenerates `config-types.ts`

**Function:** `refreshConfigTypes()` (private on the `Compile` command) ->
`reconcileTypesFromDisk(projectDir, config, { matrix, agents }, { currentProjectDir: cwd })`
(`src/cli/lib/config-gate/index.ts`).

The documented workflow is "hand-edit `config.ts`, then run `compile`", but the unions in
`config-types.ts` are derived from `config.ts`, so a pass that left them untouched stranded
stale unions. Every pass now regenerates them for the scope it compiled, matching the wizard
write path exactly (writer selection):

| Scope                           | Writer selected by `reconcileTypesFromDisk`                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| global (`isHomeDirectory(dir)`) | `config-gate/pair-writer.ts::writeGlobalTypesHalf` — standalone unions narrowed to the config's entries                              |
| project                         | `regenerateConfigTypes` — import-and-extend from the global types (falls back to standalone when no global `config-types.ts` exists) |

**A global pass also propagates.** `config.ts` on disk is the input and is never rewritten, so there is no prior state to diff and nothing to classify — the only safe assumption is that every registered project's inlined copy of the global config is stale. The home pass therefore fans the config out to every registered project unconditionally and recompiles their agents, printing `Recompiled agents in N registered projects`; skipped projects are warned via `registeredProjectUpdateSkipped`. `currentProjectDir: cwd` excludes the project whose own pass is about to compile it. That rendering (`reportPropagation`) sits deliberately outside the refresh's `catch`: an unreachable project must not be reported as a failure to refresh the unions, which did succeed.

Contract details:

- Runs on the **early-return path too**: a pass whose scope has zero discovered skills still
  refreshes, because the persisted config — not the installed skill set — drives the unions.
- No config at the pass's `projectDir` -> `verbose()` skip, no write.
- Failure is a `this.warn(configTypesRefreshFailed(reason))`, never a hard error: the compiled
  agents are already on disk and remain valid; only the unions may still be stale.
- The matrix load uses `{ skipExtraSources: true, matrixOnly: true }`
  (`loadSkillsMatrixFromSource`, `src/cli/lib/loading/source-loader.ts`). `matrixOnly` skips the
  `fetchFromSource` clone for the default source (the matrix is the pre-computed
  `BUILT_IN_MATRIX` anyway) so `compile` stays offline on a cold cache; `sourcePath` comes back
  as `""`. `skipExtraSources` only drops the wizard's `availableSources`/`activeSource` UI
  tagging, which the config-types writer never reads — a parity test in
  `src/cli/lib/installation/local-installer.test.ts` pins the emitted types byte-identical to
  the wizard's fully tagged load.

### Global-Scoped Agents Hint

When the **Project** pass resolves zero agents, `hintGlobalScopedAgents()` reloads the project
config, counts `agents.filter(a => !a.excluded && a.scope === "global")`, and — when non-zero —
prints `globalScopedAgentsHint(count)` (`src/cli/utils/messages.ts`) after
`INFO_MESSAGES.NO_AGENTS_TO_RECOMPILE`, naming the count and pointing at the home directory.
Without it, a project whose agents are all global-scoped printed only "No agents to recompile",
which reads as a silent no-op after a global stack change.

### All-Scopes Merge (compile-agents-all-scopes.ts)

`compileAgentsAllScopes()` (`src/cli/lib/operations/project/compile-agents-all-scopes.ts`) is the entry `init` (`init.tsx`) and `edit` (`edit.tsx`) call — it wraps `compileAgents()` and branches on context:

- **Home context** (`isHomeDirectory(projectDir)`): a single `compileAgents()` pass writing to the home agents dir — no scope filter.
- **Project context**: a global pass (`projectDir: os.homedir()`, `scopeFilter: "global"`) followed by a project pass (`scopeFilter: "project"`), each writing only its own scope so the project pass cannot overwrite global agents with zero-skill versions.

The two project-context passes are combined by the private `mergeCompilationResults(...results)` helper, which `flatMap`s `compiled`, `failed`, and `warnings` across results **in pass order** (global then project). The home branch returns its single `CompilationResult` directly.

**Pruning consequence:** only the home branch is scope-UNfiltered, so only the home branch prunes stale compiled agents from its `outputDir`. Both project-context passes carry a `scopeFilter` and therefore skip pruning — see `pruneStaleAgentsForPass()` in `src/cli/lib/operations/project/compile-agents.ts`.

## Recompilation Flow (agent-recompiler.ts)

`recompileAgents()` in `agent-recompiler.ts` orchestrates the full recompilation:

1. Load project config via `loadProjectConfig()` (from `.claude-src/config.ts`), then `filterExcludedEntries()` drops excluded skills/agents and excluded stack refs
2. Load agent definitions: `loadAllAgents()` for built-in + `loadProjectAgents()` for project overrides
3. Merge: project agents override built-in agents
4. Resolve agent names via `resolveAgentNames()` — priority: explicit `options.agents` -> a PRESENT config's `agents[]` -> all source agents when `outputDir` is set -> existing compiled agents on disk. The config branch keys on **presence, not length**, so `agents: []` compiles zero agents instead of falling through to the all-agents branch
5. Discover skills if not provided: `discoverAllPluginSkills()`
6. Build compile config: `buildCompileAgents()` maps config entries to `CompileAgentConfig` per agent (partitioning known vs missing agents), then `CompileConfig` is constructed inline
7. Create Liquid engine: `createLiquidEngine()` with project template overrides
8. Resolve agents: `resolveAgents()` materializes skill references into full `AgentConfig` objects
9. Compile and write: `writeCompiledAgentsByScope()` (in `src/cli/lib/agents/write-compiled-agents.ts`) renders each agent through `compileAgentForPlugin()` and routes output by agent scope -- global agents to `~/.claude/agents/`, project agents to `outputDir`

## Install-Tail Recompile Path (local-installer.ts)

`installEject()` and `installPluginConfig()` (`src/cli/lib/installation/local-installer.ts`) share one private tail, `writeConfigAndCompileAgents()` — a **second recompile surface** distinct from the operations-layer `compileAgents()` / `recompileAgents()` path above. Both surfaces ultimately render through `writeCompiledAgentsByScope()`.

1. `writeConfigAndCompileAgents(params)` (module-private) writes scoped configs via `config-gate::writeScopedFromWizard()`, builds a `CompileConfig` whose `agents` come from `buildCompileAgents(finalConfig, agents)`, then delegates to `compileAndWriteAgents()`.
2. `compileAndWriteAgents(compileConfig, agents, localSkills, sourceResult, projectDir, agentsDir, agentScopeMap?)` (module-private) creates the Liquid engine (`createLiquidEngine()`), materializes skill references via `resolveAgents()`, and renders + scope-routes via `writeCompiledAgentsByScope()`.
3. **Failure handling differs from the operations path:** the install tail treats the first `AgentWriteOutcome` with `ok: false` as fatal and throws it (`recompileAgents()` / `compileAgents()` instead report and continue). On success it returns the compiled `AgentName[]`.
4. **It discards the `GateReport`**, so nothing renders the propagated-project recompile on this path — but the recompile itself now happens regardless, inside `writeScopedFromWizard`. What is lost is only the user-facing summary line. Immaterial today because this tail is unreachable, but it is the surface to wire if `installEject` / `installPluginConfig` ever regain a command caller.

Both functions are module-private (not exported). Their only callers — `installEject()` and `installPluginConfig()` — currently have no production command caller (the same unwired callers noted under "Dual-Scope `sourceById` Collapse" above), so this tail is presently dead code, like the exported `compileAllAgents()` / `compileAllSkills()` primitives.

## Propagated-Project Recompile

`propagateGlobalChangesToProjects()` (`src/cli/lib/config-gate/propagate.ts`) rewrites each
registered project's `config.ts` / `config-types.ts` when a global-scope config change lands, but
it does not itself re-render those projects' compiled `.claude/agents/<name>.md` files. **Its caller
inside the gate does** — this is part of the write, not a stage the command drives:

```
writeScopedFromWizard(...) | mutateGlobal(...) | reconcileTypesFromDisk(~) | propagateGlobalRemoval(...)
  -> applyConsequences(...)                    (config-gate/index.ts)
       -> propagateGlobalChangesToProjects(...)
       -> recompilePropagated(updated)         (config-gate/recompile.ts, T1 only)
  -> returns GateReport { globalWritten, changes, propagated, recompile }
       |
writeProjectConfig(...)                       (operations/project/write-project-config.ts)
  -> ConfigWriteResult.propagation
       |
init.tsx / edit.tsx / compile.ts / uninstall.tsx  (render GateReport.recompile)
  -> recompilePropagatedProjectAgents(dirs)   (operations/project/recompile-project-agents.ts)
       for each dir (sequential):
         recompileRegisteredProjectAgents(dir)
           -> discoverInstalledSkills(dir)    // explicit: without it recompileAgents falls back
           -> loadAgentDefs({ projectDir })   //   to discoverAllPluginSkills and strips every
           -> compileAgents({                 //   global-local and project-local skill
                projectDir: dir,
                sourcePath,
                skills: allSkills,
                scopeFilter: "project",
                outputDir: resolveInstallPaths(dir, "project").agentsDir,
              })
```

Contract points:

- **Project scope only.** The global agents were already recompiled by the triggering operation's
  own pass; repeating a global pass per registered project would rewrite `~/.claude/agents` once
  per project for no gain.
- **`scopeFilter: "project"` therefore also disables pruning** (see the pruning stage above) — this
  pass sees only one scope's roster and must not delete another scope's files.
- **Per-project failure isolation.** `recompilePropagatedProjectAgents` wraps each project in
  try/catch, counts it into `failedCount`, pushes `Could not recompile agents in <dir>: <reason>`
  into `warnings`, and continues. A non-empty `result.failed` from the compile also counts as a
  failed project and forwards that result's warnings. Projects are processed **sequentially** so
  the collected warnings keep a deterministic per-project order.
- **Agent partials always come from the CLI** (`getLocalAgentDefinitions()` returns
  `sourcePath: PROJECT_ROOT`), so no per-project marketplace source resolution is needed.
- Both `init` and `edit` surface each warning via `this.warn()` and then log
  `Recompiled agents in N registered projects` with a ` (M failed)` suffix when `failedCount > 0`.

Closes the gap recorded in `agent-findings/2026-07-18-propagation-skips-agent-recompile.md` and the
a stale `name:name` plugin reference after a global plugin→eject switch. The same stage is
documented from the config-write angle in `reference/config/config-writer.md` and the
agent-recompile angle in `reference/features/agent-system.md`.
