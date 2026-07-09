---
scope: reference
area: features
keywords: [compiler, templates, liquid, validation, output, plugin-ref, source]
related:
  - reference/features/agent-system.md
  - reference/features/plugin-system.md
  - reference/commands/index.md
last_validated: 2026-04-21
---

# Compilation Pipeline

**Last Updated:** 2026-04-21

## Overview

**Purpose:** Compile agent prompt files from partials (identity, playbook, output, etc.) + skill assignments using Liquid templates.

**Entry Points:**

| Entry Point          | File                                               | When Called                                                                    |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `recompileAgents()`  | `src/cli/lib/agents/agent-recompiler.ts`           | `compile` command, `edit` flow                                                 |
| `compileAllAgents()` | `src/cli/lib/compiler.ts`                          | Called by standalone compilation flow                                          |
| `compileAllSkills()` | `src/cli/lib/compiler.ts`                          | Called by standalone compilation flow                                          |
| `compileAgents()`    | `src/cli/lib/operations/project/compile-agents.ts` | Operations layer wrapper (scope-filtering + delegation to `recompileAgents()`) |

## Pipeline Flow

```
1. Installation Detection
   -> detectBothInstallations() (src/cli/lib/operations/project/detect-both-installations.ts)
   -> Returns global + project Installation objects
   -> Compile command builds separate passes per scope (global, project)

2. Agent Definitions Discovery
   -> loadAgentDefs() (src/cli/lib/operations/project/load-agent-defs.ts)
   -> getAgentDefinitions() (src/cli/lib/agents/agent-fetcher.ts)
   -> Returns AgentSourcePaths { agentsDir, templatesDir, sourcePath }
   -> Merges CLI built-in agents with source repository agents (source overrides CLI)

3. Skill Discovery (4-way merge)
   -> discoverInstalledSkills() (src/cli/lib/operations/skills/discover-skills.ts)
   -> 4-way merge:
      a. Global plugins (from ~/.claude/plugins/)
      b. Global local skills (from ~/.claude/skills/)
      c. Project plugins (from <projectDir>/.claude/plugins/)
      d. Project local skills (from <projectDir>/.claude/skills/)
   -> Later sources take precedence (project wins on conflict)

4. Agent Resolution
   -> recompileAgents() in agent-recompiler.ts
   -> loadProjectConfig() reads project config (.claude-src/config.ts)
   -> resolveAgentNames() determines which agents to compile
   -> buildCompileAgents() maps config entries into CompileAgentConfig per agent
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

6. Per-Agent Compilation
   -> readAgentFiles() (src/cli/lib/compiler.ts)
      Reads: identity.md, playbook.md, output.md, critical-requirements.md,
             critical-reminders.md
      Uses STANDARD_FILES constants from consts.ts
   -> buildAgentTemplateContext() (src/cli/lib/compiler.ts)
      Splits skills into preloaded vs dynamic
   -> sanitizeCompiledAgentData() (src/cli/lib/compiler.ts)
      Strips Liquid template syntax from all user-controlled fields
   -> engine.renderFile("agent", data) using LiquidJS

7. Output Validation
   -> validateCompiledAgent() (src/cli/lib/output-validator.ts)
   -> Checks: XML tag balance, template artifacts, frontmatter validity, required patterns

8. Skill Compilation
   -> compileAllSkills() (src/cli/lib/compiler.ts)
   -> Deduplicates across agents (uniqueBy skill ID)
   -> For folder skills: copies SKILL.md, reference.md, examples/, scripts/
   -> For single-file skills: copies as SKILL.md

9. CLAUDE.md Copy
   -> copyClaudeMdToOutput() (src/cli/lib/compiler.ts)
   -> Resolves from stack directory via resolveClaudeMd() in resolver.ts

10. Commands Copy
    -> compileAllCommands() (src/cli/lib/compiler.ts)
    -> Copies *.md from src/commands/ to output

11. Cleanup (on recompilation)
    -> removeCompiledOutputDirs() (src/cli/lib/compiler.ts)
    -> Removes agents/, skills/, commands/ from output directory
```

## Key Files

| File                                                | Purpose                                                  |
| --------------------------------------------------- | -------------------------------------------------------- |
| `src/cli/lib/compiler.ts`                           | Core compilation: Liquid engine, agent/skill compile     |
| `src/cli/lib/agents/agent-recompiler.ts`            | Orchestrates recompilation flow                          |
| `src/cli/lib/agents/agent-fetcher.ts`               | Fetches agent definitions (local or remote)              |
| `src/cli/lib/agents/agent-plugin-compiler.ts`       | Plugin-mode agent compilation (individual agent plugins) |
| `src/cli/lib/resolver.ts`                           | Resolves skill references, agent configs, CLAUDE.md path |
| `src/cli/lib/output-validator.ts`                   | Validates compiled agent output                          |
| `src/cli/lib/operations/project/compile-agents.ts`  | Operations layer wrapper for compilation                 |
| `src/cli/lib/operations/project/load-agent-defs.ts` | Operations layer for agent definition loading            |
| `src/cli/lib/operations/skills/discover-skills.ts`  | 4-way skill discovery and merge                          |

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

1. YAML frontmatter (name, description, tools, model, permissionMode, preloaded skillIds)
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

## Security: Liquid Injection Prevention

File: `src/cli/lib/compiler.ts`

Pattern constant: `LIQUID_SYNTAX_PATTERN`

`sanitizeLiquidSyntax()` (exported) strips individual strings of Liquid delimiters.

`sanitizeCompiledAgentData()` (exported) strips Liquid template syntax (`{{`, `}}`, `{%`, `%}`) from:

- Agent metadata: name, title, description, tools, disallowedTools, model, permissionMode
- Skill metadata: id, description, usage, pluginRef (via `sanitizeSkills()`)
- File content: identity, playbook, output, criticalRequirementsTop, criticalReminders
- Preloaded skill IDs

This prevents user-controlled data (from YAML/TS config files) from executing as Liquid template code.

## Exported Functions Reference

### compiler.ts

| Function                      | Signature                                                                                              | Purpose                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `sanitizeLiquidSyntax()`      | `<T extends string>(value: T, fieldName: string): T`                                                   | Strip Liquid syntax from a string             |
| `sanitizeCompiledAgentData()` | `(data: CompiledAgentData): CompiledAgentData`                                                         | Sanitize all fields before template render    |
| `buildAgentTemplateContext()` | `(name: AgentName, agent: AgentConfig, files: AgentFiles): CompiledAgentData`                          | Build template data from agent files + skills |
| `compileAllAgents()`          | `(resolvedAgents: Record<AgentName, AgentConfig>, ctx: CompileContext, engine: Liquid): Promise<void>` | Compile + validate + write all agents         |
| `compileAllSkills()`          | `(resolvedAgents: Record<AgentName, AgentConfig>, ctx: CompileContext): Promise<void>`                 | Deduplicate and copy skill files              |
| `copyClaudeMdToOutput()`      | `(ctx: CompileContext): Promise<void>`                                                                 | Copy stack CLAUDE.md to output                |
| `compileAllCommands()`        | `(ctx: CompileContext): Promise<void>`                                                                 | Copy command \*.md files to output            |
| `createLiquidEngine()`        | `(projectDir?: string): Promise<Liquid>`                                                               | Create Liquid engine with layered roots       |
| `removeCompiledOutputDirs()`  | `(outputDir: string): Promise<void>`                                                                   | Remove agents/, skills/, commands/ dirs       |

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

| Compiler                  | File                                          | Output                                           |
| ------------------------- | --------------------------------------------- | ------------------------------------------------ |
| `compileSkillPlugin()`    | `src/cli/lib/skills/skill-plugin-compiler.ts` | Individual skill plugin dirs                     |
| `compileAgentPlugin()`    | `src/cli/lib/agents/agent-plugin-compiler.ts` | Individual agent plugin dirs                     |
| `compileStackPlugin()`    | `src/cli/lib/stacks/stack-plugin-compiler.ts` | Bundled stack plugin dir                         |
| `compileAgentForPlugin()` | `src/cli/lib/stacks/stack-plugin-compiler.ts` | Single agent for plugin mode (handles pluginRef) |

**Plugin-mode difference:** `compileAgentForPlugin()` in `stack-plugin-compiler.ts` differs from the standard `compileAgent()` in `compiler.ts` by:

- Deciding `pluginRef` **per-skill** via `derivePluginRef(skill)` based on each skill's own `source` field (D-217). No agent-wide `installMode` parameter.
- Using `pluginRef` for preloaded skill IDs in frontmatter when attached; otherwise bare skill IDs.
- Reading agent files directly (not via `readAgentFiles()` helper).

### D-217 Per-Skill `pluginRef` Format

Helper: `derivePluginRef(skill: Skill): PluginSkillRef | undefined` in `stack-plugin-compiler.ts`.
Constant: `EJECT_SOURCE = "eject"` in the same file.

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
- `buildCompileAgents()` in `local-installer.ts` attaches each skill's `source` to its `SkillReference` from a `Map<SkillId, string>` (`sourceById`) built from `config.skills`, so downstream `resolveSkillReference` can propagate it onto the fully-resolved `Skill` consumed by `compileAgentForPlugin`.
- `compileAgentForPlugin` reads `skill.source` via `derivePluginRef(skill)` -- no `installMode` parameter.

### Vestigial `installMode` in Wrappers

`compileAgentForPlugin` no longer accepts `installMode`, but two wrappers still carry it on their surfaces (finding `agent-findings/2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md`):

- `compileAndWriteAgents` in `local-installer.ts` -- positional `installMode?: InstallMode` param, unused inside the body. Call sites in `installEject`/`installPluginConfig` still pass `deriveInstallMode(finalConfig.skills)`.
- `CompileAndWriteParams` / `RecompileAgentsOptions` in `agent-recompiler.ts` -- `installMode?: InstallMode` field, threaded from `options.installMode ?? deriveInstallMode(filteredConfig?.skills ?? [])`, then dropped at the call boundary.

Dead plumbing -- scheduled for a companion cleanup. When documenting or validating install-mode behaviour, ignore these wrapper params; the per-skill `source` is authoritative.

### Dual-Scope Latent Issue (0.140.0 Changelog)

The `sourceById` map in `buildCompileAgents` keys by `SkillId` alone. When the same skill id is installed twice under different scopes (`"project"` and `"global"`) with different `source` values, the second entry's `source` overwrites the first (last-write-wins). Known latent issue -- no real-world reports; tracked as a deferred task.

## Operations Layer Integration

The compilation pipeline is wrapped by the operations layer for use by commands:

| Operation                   | File                                                          | Purpose                                                        |
| --------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| `compileAgents()`           | `src/cli/lib/operations/project/compile-agents.ts`            | Scope-filtering orchestrator delegating to `recompileAgents()` |
| `loadAgentDefs()`           | `src/cli/lib/operations/project/load-agent-defs.ts`           | Load + merge CLI/source agent definitions                      |
| `discoverInstalledSkills()` | `src/cli/lib/operations/skills/discover-skills.ts`            | 4-way skill discovery and merge                                |
| `detectBothInstallations()` | `src/cli/lib/operations/project/detect-both-installations.ts` | Find global + project installations                            |

The `compile` command (`src/cli/commands/compile.ts`) uses these operations to:

1. Detect both global and project installations
2. Build separate compile passes per scope (global, project)
3. For each pass: discover skills -> compile agents via `compileAgents()` with `scopeFilter`

## Recompilation Flow (agent-recompiler.ts)

`recompileAgents()` in `agent-recompiler.ts` orchestrates the full recompilation:

1. Load project config via `loadProjectConfig()` (from `.claude-src/config.ts`)
2. Load agent definitions: `loadAllAgents()` for built-in + `loadProjectAgents()` for project overrides
3. Merge: project agents override built-in agents
4. Resolve agent names (from explicit list, config, or existing agents on disk)
5. Discover skills if not provided: `discoverAllPluginSkills()`
6. Build compile config: `buildCompileAgents()` maps config entries to `CompileAgentConfig` per agent, then `CompileConfig` is constructed inline
7. Create Liquid engine: `createLiquidEngine()` with project template overrides
8. Resolve agents: `resolveAgents()` materializes skill references into full `AgentConfig` objects
9. Compile and write: `compileAndWriteAgents()` routes output by agent scope (global vs project)
