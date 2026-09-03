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
last_validated: 2026-08-30
---

# Compilation Pipeline

## Overview

**Purpose:** Compile agent prompt files from partials (identity, playbook, output, etc.) + skill assignments using Liquid templates.

**Entry Points:**

| Entry Point                          | File                                                          | When Called                                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compileAgents()`                    | `src/cli/lib/operations/project/compile-agents.ts`            | Operations-layer wrapper (scope-filtering + delegation to `recompileAgents()`). Called directly by the `compile` command; `init`/`edit` reach it via `compileAgentsAllScopes()`                                                                                                                                       |
| `compileAgentsAllScopes()`           | `src/cli/lib/operations/project/compile-agents-all-scopes.ts` | Runs a global pass + project pass (or a single home pass), merges results. Called by `init` and `edit`                                                                                                                                                                                                                |
| `recompilePropagatedProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Loops `recompileRegisteredProjectAgents()` over the project dirs propagation rewrote, isolating per-project failures. **Its one production caller is `recompilePropagated` in `src/cli/lib/config-gate/recompile.ts`** — the gate runs it inside the write; commands only render the resulting `GateReport.recompile` |
| `recompileRegisteredProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Single registered project, `scopeFilter: "project"` only. Discovers that project's skills itself and loads agent partials from the CLI                                                                                                                                                                                |
| `recompileAgents()`                  | `src/cli/lib/agents/agent-recompiler.ts`                      | Core recompile: config load → resolve → per-agent render + scope-routed write. Called by `compileAgents()`                                                                                                                                                                                                            |

## Pipeline Flow

This is the live `compile` / `init` / `edit` path. It recompiles and writes
**agents only** — skill copying happens in the install/eject and plugin-build flows,
not here.

```
1. Installation Detection
   -> detectBothInstallations() (src/cli/lib/operations/project/detect-both-installations.ts)
   -> Returns BothInstallations { global, project, hasBoth } (global/project are
      `Installation | null`, always present — never optional)
   -> `compile` builds separate passes per scope (global, project); when hasBoth,
      each pass carries a scopeFilter so a project pass cannot overwrite global agents

2. Agent Definitions Discovery
   -> loadAgentDefs() (src/cli/lib/operations/project/load-agent-defs.ts) -- takes no arguments
   -> getAgentDefinitions() (src/cli/lib/agents/agent-fetcher.ts), local branch
   -> Returns AgentSourcePaths { agentsDir, sourcePath }, sourcePath = PROJECT_ROOT
   -> loadMergedAgents(sourcePath) merges loadAllAgents(PROJECT_ROOT) with
      loadAllAgents(sourcePath) -- both sides read the same directory here, so the
      merge is real and degenerate. No marketplace sub-agent enters the roster.

3. Skill Discovery (4-way merge)
   -> discoverInstalledSkills() (src/cli/lib/operations/skills/discover-skills.ts)
   -> 4-way merge via mergeSkills() (later sources win):
      a. Global plugins (from ~/.claude/plugins/)
      b. Global local skills (from ~/.claude/skills/, via globalInstallRoot())
      c. Project plugins (from <projectDir>/.claude/plugins/)
      d. Project local skills (from <projectDir>/.claude/skills/, via LOCAL_SKILLS_PATH)
   -> Project wins on conflict (global-project pairs are skipped when projectDir is home)
   -> Returns DiscoveredSkills { allSkills, totalSkillCount, pluginSkillCount,
      localSkillCount, globalPluginSkillCount, globalLocalSkillCount,
      unusableMetadata } -- the last is every installed skill whose metadata.yaml
      exists but describes no skill, from either scope

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
      - buildAgentTemplateContext() appends "Skill" to agent.tools via withSkillTool()
        (idempotent, order-stable), and takes a per-skill mapSkill that attaches pluginRef
        via pluginRefFor(skill); splits skills into preloaded vs dynamic. The flag
        it splits on was decided at config-write time by toStackAssignment()
        (packages/compile/src/seed-to-config.ts): the prior save's word for the
        triple (priorLoadState()) wins, and a triple new to the save takes the shared
        preload mapping's default (mappedLoadState() -> resolveLoadState from
        @workspace/matrix) — absent from the mapping means lazy
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

### Compiled Output Is Not Validated

`writeCompiledAgentsByScope()` writes each rendered agent straight to disk with no structural
check — no XML tag-balance pass, no template-artifact scan, no frontmatter validation. Nothing in
the CLI inspects what it writes, and there is no module to call: the validators that once did this
for no caller were reaped, so `grep -rn 'validateCompiledAgent' src` is the check and it returns
nothing.

## Key Files

| File                                                         | Purpose                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/lib/compiler.ts`                                    | The disk half of a compile: Liquid engine, template roots, agent partial reads. Re-exports the renderers from `@workspace/compile/agent-source`, which is where the template context, the sanitizer and `renderAgent` are declared                                                                                |
| `src/cli/lib/compile-seat.ts`                                | Side-effect module handing `@workspace/compile` this CLI's console (`seatDiagnostics({ warn, verbose })`). Imported by `compiler.ts` and `configuration/config-generator.ts` — the two modules owning the seated functions. The package's default sink discards, which is the honest answer for a browser preview |
| `src/cli/lib/agents/agent-recompiler.ts`                     | Orchestrates recompilation flow                                                                                                                                                                                                                                                                                   |
| `src/cli/lib/agents/write-compiled-agents.ts`                | Per-agent render + scope-routed write (live path)                                                                                                                                                                                                                                                                 |
| `src/cli/lib/agents/agent-provenance.ts`                     | `cliVersion` — this CLI's own manifest version, which a browser has no equivalent of. The three marker functions (`provenanceMarker`, `hasProvenanceMarker`, `stampProvenanceMarker`) are declared in `@workspace/compile/agent-source` and re-exported here                                                      |
| `src/cli/lib/agents/list-compiled-agents.ts`                 | `listAgentMdFiles` / `listCompiledAgentNames` / `splitAgentsByProvenance` / `pruneStaleCompiledAgents`                                                                                                                                                                                                            |
| `src/cli/lib/agents/agent-fetcher.ts`                        | Fetches agent definitions (local or remote)                                                                                                                                                                                                                                                                       |
| `src/cli/lib/agents/agent-plugin-compiler.ts`                | Plugin-mode agent compilation (individual agent plugins)                                                                                                                                                                                                                                                          |
| `src/cli/lib/resolver.ts`                                    | Resolves skill references and agent configs                                                                                                                                                                                                                                                                       |
| `src/cli/lib/operations/project/compile-agents.ts`           | Operations layer wrapper for compilation + stale-agent prune                                                                                                                                                                                                                                                      |
| `src/cli/lib/operations/project/recompile-project-agents.ts` | Registered-project recompile + per-project failure isolation                                                                                                                                                                                                                                                      |
| `src/cli/lib/operations/project/load-agent-defs.ts`          | Operations layer for agent definition loading                                                                                                                                                                                                                                                                     |
| `src/cli/lib/operations/skills/discover-skills.ts`           | 4-way skill discovery and merge                                                                                                                                                                                                                                                                                   |

## The Provenance Marker

**Every compiled agent carries an HTML comment on the first line after its frontmatter**, naming the
generator, its version, and the fact that the file is rewritten rather than edited:

```markdown
---
name: web-developer
---

<!-- Generated by agents-inc v<this CLI's package.json version> — do not edit; compile rewrites this file -->
```

`src/cli/lib/agents/agent-provenance.ts` is the one address a CLI caller reads it at, and it is a
facade over two halves. The three marker functions are declared in
`packages/compile/src/agent-source.ts`, beside `renderAgent`, which stamps the line — so the
editor's output preview draws the same first body line rather than computing it a second way. What
`agent-provenance.ts` itself declares is the half a browser has no equivalent of: `cliVersion()`.

| Export                                    | Declared in                       | Contract                                                                                                                                            |
| ----------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provenanceMarker(version)`               | `@workspace/compile/agent-source` | Composes the line. `MARKER_OPEN` / `MARKER_NOTICE` / `MARKER_CLOSE` are module-private                                                              |
| `hasProvenanceMarker(content)`            | `@workspace/compile/agent-source` | Whether this CLI compiled the file the content came from. **Position is part of the claim** — only the first body line counts                       |
| `stampProvenanceMarker(content, version)` | `@workspace/compile/agent-source` | The same content carrying exactly ONE marker, by REPLACEMENT rather than insertion                                                                  |
| `cliVersion()`                            | `lib/agents/agent-provenance.ts`  | This CLI's own published version, read once per process from `package.json` beside the code (`PROJECT_ROOT`) and memoised in a module-level promise |

**A body comment, deliberately NOT a frontmatter field.** Claude Code documents sixteen supported
frontmatter keys and says nothing about how it treats an unknown one, so a stricter release could
reject every agent this CLI has ever written. The body is free-form by contract, which makes a marker
there safe, greppable, versioned, and the do-not-edit notice at the same time.

**Recognition matches on SHAPE, not on exact text.** `isProvenanceMarker` asks only that the line
starts with `MARKER_OPEN` and ends with `MARKER_CLOSE`, so an agent compiled by any release is
recognised by any other. Matching the exact string would sweep only the agents the running version
happened to write, which is the opposite of what a sweep is for.

**Position is load-bearing.** `bodyStartIndex` returns the index past the closing frontmatter fence,
or `0` when there is no fence to find — a template override may render no frontmatter and the marker
still needs a defined home. An agent that merely QUOTES the line further down (a prompt about this
very feature, say) is the user's, and a sweep reading that as provenance would delete a file nothing
here wrote.

**Stamping is idempotent by replacement.** `stampProvenanceMarker` rewrites an existing marker line
rather than inserting beside it, so stamping twice at one version is a fixed point and a version bump
MOVES the line instead of stacking a second one under it.

**One render path, so there is no unmarked output.** Both compile entry points render through
`renderAgent` in `packages/compile/src/agent-source.ts`, whose last statement is the stamp. A
template that emits the marker itself still produces exactly one. The renderer moved out of
`src/cli/lib/compiler.ts` with the extraction and is not re-exported by it; `compiler.ts` imports
it, and so does the editor's output preview, which is what puts both behind the same stamp.

**Who reads it back.** `splitAgentsByProvenance(agentsDir)`
(`src/cli/lib/agents/list-compiled-agents.ts`) partitions a directory's `*.md` into `marked` and
`unmarked`; a file that cannot be read yields no marker and lands in `unmarked`, because "cannot prove
it is ours" and "is not ours" call for the same answer. `uninstall` is its only production consumer —
see [`reference/commands/index.md`](../commands/index.md) — where it identifies this CLI's own output
once the configuration naming the agents is gone.

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
  reviewer/
  tester/
  planning/
  meta/
  researcher/
```

## Agent Template Structure

**Main template:** `src/agents/_templates/agent.liquid`

The Liquid template renders agent prompts with this structure:

1. YAML frontmatter (name, description, tools, `disallowedTools` when present, model, effort, permissionMode, preloaded skill IDs emitted under the `skills:` key). **`tools` is an allowlist and always carries `Skill`:** an agent declaring the key gets only what it names, and `withSkillTool` appends `Skill` to whatever the `metadata.yaml` declared — see [agent-system.md](./agent-system.md#metadatayaml-schema). **`model` and `effort` emit asymmetrically:** `model` is unconditional with a `default: "inherit"` filter, while `effort` is wrapped in an `{% if %}` and emits no key at all when unset — see [model-and-effort.md](./model-and-effort.md).
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

**The `skills:` key and the `Skill` tool are independent.** `skills:` preloads content into the
agent's startup context and grants no tool; the `Skill` tool in the `tools:` allowlist is what lets
the agent load one at runtime, and a dynamic skill has nothing but that route. `withSkillTool`
(`packages/compile/src/agent-source.ts`) grants it to every compiled agent — see
[agent-system.md](./agent-system.md#metadatayaml-schema).

Split logic in `buildAgentTemplateContext()` in `packages/compile/src/agent-source.ts`, re-exported
by `src/cli/lib/compiler.ts`. Which side a skill lands on is the stack assignment's `preloaded`
flag, resolved when the config was written by `toStackAssignment()` in
`packages/compile/src/seed-to-config.ts` — module-private there: an explicit prior entry
beats the mapping, the mapping beats lazy. `priorLoadState()` reads the prior stack entry — a bare
`{ id }` read back off disk is curated lazy, not silence — and a triple with no prior entry takes
`mappedLoadState()`, which resolves catalog skill ids on roster agents through `resolveLoadState`
(`@workspace/matrix`, the same `PRELOAD_DEFAULTS` table the editor's default assignments read);
local skills, marketplace skills and hand-written agents have no entry to match and are lazy by
rule.

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
```

The live `compile` command writes only `agents/` (agents-only recompile). `skills/` is
produced by the install/eject flow and the skill/agent plugin-build flows
(`compileSkillPlugin()`, `compileAgentPlugin()`), not by `compile`. Nothing in the CLI
writes a `commands/` directory or a stack `CLAUDE.md` into the output.

## Security: Liquid Injection Prevention

File: `packages/compile/src/agent-source.ts`, re-exported by `src/cli/lib/compiler.ts` so no CLI
call site moved. The editor renders through the same sanitiser.

Pattern constant: `LIQUID_SYNTAX_PATTERN` — module-private there.

`sanitizeLiquidSyntax()` strips individual strings of Liquid delimiters, and reports each strip
through the seated diagnostics sink (`diagnostics().warn`), which is why a CLI run says what it
removed and a browser preview silently discards.

`sanitizeCompiledAgentData()` strips Liquid template syntax (`{{`, `}}`, `{%`, `%}`) from:

- Agent metadata: name, title, description, tools, disallowedTools, model, **effort**, permissionMode — the optional four (`disallowedTools`, `model`, `effort`, `permissionMode`) are conditionally spread, so an absent field is not written back as `undefined`
- Skill metadata: id, description, usage, pluginRef — via `sanitizeSkills()`, applied to `skills`, `preloadedSkills`, and `dynamicSkills`
- Preloaded skill IDs (`preloadedSkillIds`)

**Content fields are NOT sanitized** — identity, playbook, output, criticalRequirementsTop, and criticalReminders pass through unchanged. LiquidJS does not re-evaluate template syntax inside variable values, so double-curlies in content (e.g. a GitHub Actions `${{ secrets.X }}` snippet) are safe.

This prevents user-controlled metadata (from YAML/TS config files) from executing as Liquid template code.

## Exported Functions Reference

### compiler.ts

| Function                      | Signature                                                                                                      | Purpose                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `sanitizeLiquidSyntax()`      | `<T extends string>(value: T, fieldName: string): T`                                                           | Strip Liquid syntax from a string                                                                                                        |
| `sanitizeCompiledAgentData()` | `(data: CompiledAgentData): CompiledAgentData`                                                                 | Sanitize all fields before template render                                                                                               |
| `buildAgentTemplateContext()` | `(name: string, agent: AgentConfig, files: AgentFiles, mapSkill?: (skill: Skill) => Skill): CompiledAgentData` | Build template data; appends `Skill` to `agent.tools` via `withSkillTool`; `mapSkill` transforms each skill (used to attach `pluginRef`) |
| `compileAgentForPlugin()`     | `(name: AgentName, agent: AgentConfig, fallbackRoot: string, engine: Liquid): Promise<string>`                 | Per-skill-`pluginRef` agent render used by the live recompile + plugin paths                                                             |
| `createLiquidEngine()`        | `(projectDir?: string): Promise<Liquid>`                                                                       | Create Liquid engine with layered roots                                                                                                  |

## Plugin-Mode Compilation

For native Claude Code plugin distribution:

| Compiler                   | File                                          | Output                                                                                                                                       |
| -------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `compileSkillPlugin()`     | `src/cli/lib/skills/skill-plugin-compiler.ts` | One skill plugin dir (singular)                                                                                                              |
| `compileAllSkillPlugins()` | `src/cli/lib/skills/skill-plugin-compiler.ts` | Batch: every `SKILL.md` under a dir; returns `SkillCompilationRun { compiled, failed }`                                                      |
| `compileAgentPlugin()`     | `src/cli/lib/agents/agent-plugin-compiler.ts` | One agent plugin dir (singular). `AgentPluginOptions` shape and its single internal construction site: [leaf-exports.md](../leaf-exports.md) |
| `compileAllAgentPlugins()` | `src/cli/lib/agents/agent-plugin-compiler.ts` | Batch: every agent `.md` under a dir; returns `CompiledAgentPlugin[]`                                                                        |
| `compileAgentForPlugin()`  | `src/cli/lib/compiler.ts`                     | Single agent render with per-skill `pluginRef`; the live recompile path's single-agent primitive                                             |

### Batch Skill-Plugin Compilation & Command Drivers

`compileAllSkillPlugins(skillsDir, outputDir)` (`src/cli/lib/skills/skill-plugin-compiler.ts`) is the batch wrapper over the singular `compileSkillPlugin()`. It globs every `**/SKILL.md` under `skillsDir`, compiles each, and returns `SkillCompilationRun { compiled: CompiledSkillPlugin[]; failed: string[] }`. A per-skill try/catch collects failures (by directory basename) and emits a `warn()` instead of aborting the whole run — contrast the install path, which hard-errors on the first failure. `printCompilationSummary()` prints the compiled list. `compileAllAgentPlugins()` is the agent counterpart but returns a bare `CompiledAgentPlugin[]` (no `failed` list).

| Command / caller | File                                | Drives                                                                                                                                                                                                                             |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build plugins`  | `src/cli/commands/build/plugins.ts` | `compileSkillPlugin()` (with `--skill`) or `compileAllSkillPlugins()` (default), plus `compileAllAgentPlugins()` (with `--agents-dir`). Prunes stale skill-plugin dirs after a clean full run; skips pruning when any skill fails. |

`build marketplace` (`src/cli/commands/build/marketplace.ts`) does NOT compile — it scans already-built plugin dirs and generates `marketplace.json` via `generateMarketplace()` (identity read from `package.json`).

**`compileAgentForPlugin()` (`src/cli/lib/compiler.ts`) is the only single-agent render**, shared by the live recompile path and the plugin-build path. There is no second agent-render entry point — do not look for a plain `compileAgent()`.

- It decides `pluginRef` **per-skill** via `pluginRefFor(skill)` based on each skill's own `source` field. No agent-wide `installMode` parameter.
- Preloaded skill IDs render with `pluginRef` when attached, otherwise bare skill IDs (`buildAgentTemplateContext()`: `preloadedSkillIds = preloadedSkills.map((s) => s.pluginRef ?? s.id)`).
- It reads agent partials through the module-private `readAgentFiles()` helper.

### Per-Skill `pluginRef` Format

Helper: `pluginRefFor(skill: Skill): { pluginRef?: PluginSkillRef }` in `packages/compile/src/agent-source.ts` — exported there, imported by `src/cli/lib/compiler.ts` and by the editor's `output-preview.ts`, and not re-exported by either. It returns a **spreadable partial**, not the ref itself, so the caller writes `{ ...skill, ...pluginRefFor(skill) }` and an ejected skill contributes no key at all. There is no `derivePluginRef` — do not look for one.
Constant: `EJECT_SOURCE = "eject"` in `src/cli/consts.ts`.

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
- `compileAgentForPlugin` (in `src/cli/lib/compiler.ts`) reads `skill.source` via `pluginRefFor(skill)` -- no `installMode` parameter.

### `installMode` Is Not An Input To The Compile Path

Aggregate `installMode` never reaches agent compilation — per-skill `source` decides the reference format, so no wrapper on the way in carries the mode:

- `RecompileAgentsOptions` (`src/cli/lib/agents/agent-recompiler.ts`) has no `installMode` field; there is no `CompileAndWriteParams` type.

Per-skill `source` (via `sourceById` -> `pluginRefFor`) is the sole authority for the plugin-vs-eject reference format. `InstallMode` / `deriveInstallMode()` still exist elsewhere (install-plan logging in `init.tsx`, `wizard-store.ts`) but no longer flow into agent compilation.

### Dual-Scope `sourceById` Collapse -- Verified Unreachable in Production

The `sourceById` map in `buildCompileAgents` keys by `SkillId` alone, so a dual-scope skill (same id under `"project"` and `"global"` with different `origin` values) is last-write-wins. The collapse is **not reachable through any production command**:

- `recompileAgents()` (`src/cli/lib/agents/agent-recompiler.ts`) is the **only production caller** of `buildCompileAgents`, and it calls `filterExcludedEntries()` first, dropping the excluded (tombstone) entry so `sourceById` never sees two entries for one id. `init`, `edit` and `compile` all route through it.
- Even unfiltered, `generateProjectConfigWithInlinedGlobal()` (module-private in `packages/compile/src/config-source.ts`) emits global entries before project entries, so the active project entry (serialized last) wins -- correct in both mixed-source directions.

Covered by the regression test `e2e/lifecycle/dual-scope-mixed-source-compiled-ref.e2e.test.ts`. Keying by `(id, scope)` remains a robustness follow-up.

## Operations Layer Integration

The compilation pipeline is wrapped by the operations layer for use by commands:

| Operation                            | File                                                          | Purpose                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `compileAgents()`                    | `src/cli/lib/operations/project/compile-agents.ts`            | Scope-filtering orchestrator delegating to `recompileAgents()`, then pruning stale agents on an authoritative pass                                                                                                  |
| `compileAgentsAllScopes()`           | `src/cli/lib/operations/project/compile-agents-all-scopes.ts` | Home single-pass / project two-pass driver for `init` and `edit`                                                                                                                                                    |
| `recompileRegisteredProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Recompile ONE registered project at project scope                                                                                                                                                                   |
| `recompilePropagatedProjectAgents()` | `src/cli/lib/operations/project/recompile-project-agents.ts`  | Loop the above over `GateReport.propagated.updated`, driven by the gate's `recompilePropagated`. There is no `ConfigWriteResult.propagatedProjects` field — the operations result carries `propagation: GateReport` |
| `loadAgentDefs()`                    | `src/cli/lib/operations/project/load-agent-defs.ts`           | Load + merge CLI/source agent definitions                                                                                                                                                                           |
| `discoverInstalledSkills()`          | `src/cli/lib/operations/skills/discover-skills.ts`            | 4-way skill discovery and merge                                                                                                                                                                                     |
| `detectBothInstallations()`          | `src/cli/lib/operations/project/detect-both-installations.ts` | Find global + project installations                                                                                                                                                                                 |

The `compile` command (`src/cli/commands/compile.ts`) uses these operations to:

1. `detectInstallations()` — `detectBothInstallations()` wrapped in a `ConfigLoadError`
   catch. A config file that exists but cannot be parsed hard-errors with
   `EXIT_CODES.ERROR` naming the path, BEFORE any compilation or write.
   Zero installations is also a hard error (`ERROR_MESSAGES.NO_INSTALLATION`).
2. `resolveAndLogSource()` then `loadAgentDefsOrFail()`
3. `buildCompilePasses()` — the ONE pass this invocation owns. A project
   installation at `cwd` makes the run project-scope: the project pass alone,
   writing nothing outside that project. Only where no project installation is in
   play — the home directory, or a directory with no config of its own — is the
   global pass reached. `scopeFilter: "project"` is set on the project pass when
   `hasBoth` (the project config inlines the global entries, so an unfiltered pass
   would write global-scoped agents into the project); a lone global pass is
   scope-UNfiltered and therefore authoritative over its `outputDir` (see the
   pruning stage above).
4. For each pass (`runCompilePass`): discover skills (`discoverAllSkills()`, which
   REFUSES the run via `refuseUnusableSkillMetadata()` when `unusableMetadata` is
   non-empty — before a count is printed, an agent is written or the unions are
   regenerated) -> warn about configured-but-missing stack skills
   (`warnUnresolvedStackSkills()`) and scope-dropped stack pairs
   (`warnScopeDroppedStackPairs()`) -> compile agents via `compileAgents()` ->
   `refreshConfigTypes()`
5. Zero passes with skills is a hard error (`ERROR_MESSAGES.NO_SKILLS_TO_COMPILE`).
   The pass list itself comes from the module-private `buildCompilePasses()`.

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

**A global pass also propagates — and only a global pass can.** `config.ts` on disk is the input and is never rewritten, so there is no prior state to diff and nothing to classify — the only safe assumption is that every registered project's inlined copy of the global config is stale. The global pass therefore fans the config out to every registered project unconditionally and recompiles their agents, printing `propagatedRecompileSummary` — `Recompiled agents in N registered projects, M unchanged`; skipped projects are warned via `registeredProjectUpdateSkipped`. A project pass reaches none of it: `reconcileTypesFromDisk` returns before the fan-out for any non-home `projectDir`, and a project-scope run has no global pass beside it — propagation is a global operation's consequence, and a compile inside a project is not one. `currentProjectDir: cwd` excludes whatever directory the command was run from, which is its own subject. That rendering (`reportPropagation`) sits deliberately outside the refresh's `catch`: an unreachable project must not be reported as a failure to refresh the unions, which did succeed.

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
init.tsx / edit.tsx / compile.ts / uninstall.tsx  (RENDER GateReport.recompile — they call nothing)

... and the loop the gate already ran, expanded:
recompilePropagated(updated)                  (config-gate/recompile.ts, lazy import)
  -> recompilePropagatedProjectAgents(dirs)   (operations/project/recompile-project-agents.ts)
       for each dir (sequential):
         recompileRegisteredProjectAgents(dir)
           -> discoverInstalledSkills(dir)    // explicit: without it recompileAgents falls back
           -> loadAgentDefs()                 //   to discoverAllPluginSkills and strips every
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
- **Three counters, not two.** It returns
  `PropagatedRecompileSummary = { rewrittenCount, unchangedCount, failedCount, warnings }`. A
  project that neither failed nor produced a non-empty `result.rewritten` counts as
  `unchangedCount` — it was visited and left alone, which is a different fact from being
  recompiled and the one a single count could not tell apart. There is no `recompiledCount`.
- **The commands do not drive this loop.** Its only production caller is `recompilePropagated` in
  `src/cli/lib/config-gate/recompile.ts`, which the gate runs inside `applyConsequences` on a T1
  tier. `init`, `edit`, `compile` and `uninstall` render the summary the gate hands back; the
  earlier contract, where the write returned directories for the caller to recompile, is what
  left `edit`'s source migration and the global `uninstall` behind.
- **Agent partials always come from the CLI** (`getLocalAgentDefinitions()` returns
  `sourcePath: PROJECT_ROOT`), so no per-project marketplace source resolution is needed.
- All four fan-out commands (`init`, `edit`, `compile`, `uninstall`) surface each warning via
  `this.warn()` and then log `Recompiled agents in N registered projects, M unchanged` with a
  ` (K failed)` suffix when `failedCount > 0` — one `BaseCommand.reportPropagatedRecompile`, not a
  copy per command.

Without this fan-out a registered project's compiled `.claude/agents/<name>.md` keeps the roster it
was last compiled with until someone runs a command inside that project — including a stale
`name:name` plugin reference after a global plugin→eject switch, whose `config.ts` is already
correct while the compiled agent is not. The same stage is documented from the config-write angle
in `reference/config/config-writer.md` and the agent-recompile angle in
`reference/features/agent-system.md`.
