---
scope: reference
area: features
keywords:
  [
    agents,
    templates,
    partials,
    liquid,
    metadata,
    compilation,
    recompile,
    pluginRef,
    curation,
    propagation,
  ]
related:
  - reference/features/compilation-pipeline.md
  - reference/features/skills-and-matrix.md
  - reference/features/configuration.md
  - reference/commands/index.md
  - reference/store-map.md
  - reference/concepts/guard-pattern.md
  - reference/concepts/tombstone-pattern.md
last_validated: 2026-07-30
---

# Agent System

## Overview

**Purpose:** Agent template system that defines AI agent roles, compiles partial markdown files into full prompt documents via LiquidJS, and maps agents to wizard domains.
**Entry Point:** `src/agents/` (agent source files), `src/cli/lib/compiler.ts` (compilation)
**Key Files:** 18 agents across 6 role directories, 1 main template, 6 methodology partials, 1 JSON schema

## File Structure

```
src/agents/
  _templates/
    agent.liquid                              # Main Liquid template assembling all partials
    methodologies/
      investigation-requirements.liquid       # "Never speculate" investigation protocol
      anti-over-engineering.liquid            # Surgical implementation, no new abstractions
      write-verification.liquid               # Re-read files after editing protocol
      success-criteria.liquid                 # Measurable "done" criteria template
      context-management.liquid               # .claude/ session continuity protocol
      improvement-protocol.liquid             # Self-improvement workflow for agents
  developer/
    ai-developer/                             # AI feature implementation
    api-developer/                            # Backend feature implementation
    cli-developer/                            # CLI feature implementation
    web-developer/                            # Frontend feature implementation
  meta/
    agent-summoner/                           # Creates/improves agents and skills
    codex-keeper/                             # AI-focused reference documentation
    convention-keeper/                        # Code quality standards
    skill-summoner/                           # Creates technology-specific skills
  planning/
    pm/                                       # Writes specs in any domain; domain frameworks arrive via meta-planning-* skills
  researcher/
    ai-researcher/                            # Read-only AI research
    api-researcher/                           # Read-only backend research
    cli-researcher/                           # Read-only CLI research
    web-researcher/                           # Read-only frontend research
  reviewer/
    reviewer/                                 # Reviews any diff; domain checklists arrive via meta-reviewing-* skills
  tester/
    ai-tester/                                # Tests AI features
    api-tester/                               # Tests backend features
    cli-tester/                               # Tests CLI features
    web-tester/                               # Tests frontend features
```

Each agent directory contains:

| File                       | Required | Constant                                  | Purpose                                              |
| -------------------------- | -------- | ----------------------------------------- | ---------------------------------------------------- |
| `metadata.yaml`            | Yes      | `STANDARD_FILES.AGENT_METADATA_YAML`      | Agent identity, model, tools (parsed by Zod schema)  |
| `identity.md`              | Yes      | `STANDARD_FILES.IDENTITY_MD`              | Role description, mission, domain scope              |
| `playbook.md`              | Yes      | `STANDARD_FILES.PLAYBOOK_MD`              | Detailed workflow, patterns, decision frameworks     |
| `output.md`                | No       | `STANDARD_FILES.OUTPUT_MD`                | Output format specification (falls back to category) |
| `critical-requirements.md` | No       | `STANDARD_FILES.CRITICAL_REQUIREMENTS_MD` | Top-of-prompt critical rules                         |
| `critical-reminders.md`    | No       | `STANDARD_FILES.CRITICAL_REMINDERS_MD`    | Bottom-of-prompt reminders                           |

Constants defined in `src/cli/consts.ts` (`STANDARD_FILES`).

## Agent Inventory

### developer/ (4 agents)

| Agent           | Model | Tools                               | Description                                                     |
| --------------- | ----- | ----------------------------------- | --------------------------------------------------------------- |
| `ai-developer`  | opus  | Read, Write, Edit, Grep, Glob, Bash | AI features: RAG, agent loops, tool calling, prompt engineering |
| `api-developer` | opus  | Read, Write, Edit, Grep, Glob, Bash | Backend: API routes, DB operations, auth, middleware            |
| `cli-developer` | opus  | Read, Write, Edit, Grep, Glob, Bash | CLI: commands, interactive prompts, config hierarchies          |
| `web-developer` | opus  | Read, Write, Edit, Grep, Glob, Bash | Frontend: UI components, TypeScript, styling, client state      |

### meta/ (4 agents)

| Agent               | Model  | Tools                                              | Description                                         |
| ------------------- | ------ | -------------------------------------------------- | --------------------------------------------------- |
| `agent-summoner`    | opus   | Read, Write, Edit, Grep, Glob, Bash                | Creates/improves agents and skills                  |
| `codex-keeper`      | opus   | Read, Write, Edit, Glob, Grep, Bash                | AI-focused reference documentation                  |
| `convention-keeper` | sonnet | Read, Write, Edit, Grep, Glob, Bash                | Code quality and testing standards                  |
| `skill-summoner`    | opus   | Read, Write, Edit, Grep, Glob, WebSearch, WebFetch | Creates technology-specific skills via web research |

### planning/ (1 agent)

| Agent | Model | Tools                               | Description                                                                         |
| ----- | ----- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| `pm`  | opus  | Read, Write, Edit, Grep, Glob, Bash | Specs for any feature; domain planning frameworks arrive via meta-planning-* skills |

### researcher/ (4 agents)

| Agent            | Model | Tools                  | Description                                                                     |
| ---------------- | ----- | ---------------------- | ------------------------------------------------------------------------------- |
| `ai-researcher`  | opus  | Read, Grep, Glob, Bash | Read-only AI research: prompt assembly, model SDKs, RAG pipelines, tool schemas |
| `api-researcher` | opus  | Read, Grep, Glob, Bash | Read-only backend research: API routes, DB schemas, auth                        |
| `cli-researcher` | opus  | Read, Grep, Glob, Bash | Read-only CLI research: command registration, flag parsing, exit codes          |
| `web-researcher` | opus  | Read, Grep, Glob, Bash | Read-only frontend research: UI patterns, design systems                        |

### reviewer/ (1 agent)

| Agent      | Model | Tools                               | Description                                                                                              |
| ---------- | ----- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `reviewer` | opus  | Read, Write, Edit, Grep, Glob, Bash | Reviews any diff — one severity-disciplined gate; domain knowledge arrives via `meta-reviewing-*` skills |

`reviewer` is the only reviewing agent. No per-domain reviewer name (`web-reviewer`, `api-reviewer`,
`cli-reviewer`, `ai-reviewer`, `infra-reviewer`) exists in `AGENT_NAMES`, under `src/agents/`, or as
a target a roster or a prompt can delegate to — a document or stack naming one names nothing. The
prompt carries the review PROCESS — severity discipline, the cost gate, a worked zero-issue APPROVE
— and the domain checklists live in the `meta-reviewing-*` skills, loaded per diff through the
activation protocol. `pm` stands the same way for planning, with the frameworks in
`meta-planning-*`.

### tester/ (4 agents)

| Agent        | Model  | Tools                               | Description                                              |
| ------------ | ------ | ----------------------------------- | -------------------------------------------------------- |
| `ai-tester`  | opus   | Read, Write, Edit, Grep, Glob, Bash | AI tests: LLM mocking, prompt regression, eval harnesses |
| `api-tester` | sonnet | Read, Write, Edit, Grep, Glob, Bash | Backend tests: API endpoints, DB operations, auth flows  |
| `cli-tester` | opus   | Read, Write, Edit, Grep, Glob, Bash | CLI tests: wizard flows, commands, keyboard interactions |
| `web-tester` | opus   | Read, Write, Edit, Grep, Glob, Bash | Frontend tests: component behavior, user flows           |

**Model distribution:** 16 agents use `opus`, 2 use `sonnet` (`convention-keeper`, `api-tester`). Every bundled `metadata.yaml` declares a `model`.

**Tool patterns:**

- Read-only agents (researchers, some reviewers): Read, Grep, Glob, Bash (no Write/Edit)
- Implementation agents (developers, testers, planners): Read, Write, Edit, Grep, Glob, Bash
- `skill-summoner` is unique: has WebSearch and WebFetch instead of Bash

## metadata.yaml Schema

**JSON Schema:** `src/schemas/agent.schema.json` — **generated**, not hand-written; emitted from `agentYamlGenerationSchema` by `scripts/generate-json-schemas.ts` (see [code-generation.md](./code-generation.md))
**Zod Schema:** `agentYamlConfigSchema` in `src/cli/lib/schemas.ts` (the runtime loader schema; distinct from the `agentYamlGenerationSchema` that produces the JSON Schema above)
**TypeScript Type:** `AgentYamlConfig` in `src/cli/types/agents.ts`

| Field             | Type                  | Required | Description                                                                                   |
| ----------------- | --------------------- | -------- | --------------------------------------------------------------------------------------------- |
| `id`              | `AgentName` (string)  | Yes      | Agent identifier, matches directory name                                                      |
| `title`           | `string`              | Yes      | Display title (e.g., "CLI Developer Agent")                                                   |
| `description`     | `string`              | Yes      | Brief description for Task tool                                                               |
| `model`           | `ModelName`           | No\*     | `"sonnet"` / `"opus"` / `"haiku"` / `"fable"` / `"inherit"`                                   |
| `tools`           | `string[]`            | Yes      | Available tools (Read, Write, Edit, Grep, Glob, Bash, WebSearch, WebFetch)                    |
| `disallowedTools` | `string[]`            | No       | Tools this agent cannot use                                                                   |
| `permissionMode`  | `PermissionMode`      | No       | `"default"` / `"acceptEdits"` / `"dontAsk"` / `"bypassPermissions"` / `"plan"` / `"delegate"` |
| `hooks`           | `Record<string, ...>` | No       | Lifecycle hooks with matcher and actions                                                      |
| `outputFormat`    | `string`              | No       | Which output format file to use                                                               |
| `domain`          | `Domain`              | No       | Domain for wizard grouping                                                                    |
| `custom`          | `boolean`             | No       | True for agents created outside built-in vocabulary                                           |

\*`model` is optional in both the JSON schema (absent from its `required` list — `["id", "title", "description", "tools"]` — though constrained to the `ModelName` enum when present) and the Zod `agentYamlConfigSchema` (`modelNameSchema.exactOptional()`). `agent.liquid` defaults it to `"inherit"` at render time.

**`ModelName`** defined in `src/cli/types/matrix.ts`: `"sonnet" | "opus" | "haiku" | "fable" | "inherit"`

Full resolution chain for `model` and its `effort` sibling — precedence against config overrides, the two compile-config builders, and why `effort` emits no key when unset: [model-and-effort.md](./model-and-effort.md). **No bundled `metadata.yaml` declares `effort`.**

**`PermissionMode`** defined in `src/cli/types/matrix.ts`: `"default" | "acceptEdits" | "dontAsk" | "bypassPermissions" | "plan" | "delegate"`

**Note:** Currently, no agent metadata.yaml uses `disallowedTools`, `permissionMode`, `hooks`, `outputFormat`, `domain`, or `custom` fields -- these are supported by the schema but unused in built-in agents.

## Template Partial Structure

### Partial Files Per Agent

Each agent directory contains markdown partials read by `readAgentFiles()` in `src/cli/lib/compiler.ts`:

| Partial                    | Read Function        | Fallback                   | Template Variable               |
| -------------------------- | -------------------- | -------------------------- | ------------------------------- |
| `identity.md`              | `readFile()`         | None (required, throws)    | `{{ identity }}`                |
| `playbook.md`              | `readFile()`         | None (required, throws)    | `{{ playbook }}`                |
| `output.md`                | `readFileOptional()` | Category-level `output.md` | `{{ output }}`                  |
| `critical-requirements.md` | `readFileOptional()` | Empty string               | `{{ criticalRequirementsTop }}` |
| `critical-reminders.md`    | `readFileOptional()` | Empty string               | `{{ criticalReminders }}`       |

**Output fallback:** If an agent's own `output.md` is missing, the compiler looks for `output.md` in the parent category directory (e.g., `src/agents/developer/output.md`). Currently all 18 agents have their own `output.md`, so no fallback is used.

### What Goes in Each Partial

| Partial                    | Content                                                           | Example (codex-keeper)                                             |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `identity.md`              | Role definition, mission statement, domain scope, operating modes | "You are a documentation specialist for AI agents..."              |
| `playbook.md`              | Detailed workflow, decision trees, templates, checklists          | Documentation templates, investigation process, validation steps   |
| `output.md`                | Structured output format specification                            | Session summary format, investigation table, documentation section |
| `critical-requirements.md` | Non-negotiable rules rendered at top of prompt                    | "NEVER document based on assumptions", "MUST verify file paths"    |
| `critical-reminders.md`    | Reinforced rules rendered at bottom of prompt                     | Repetition of critical rules for instruction continuity            |

## Liquid Compilation Pipeline

### Engine Setup

**Function:** `createLiquidEngine()` in `src/cli/lib/compiler.ts`

Template root resolution order (first match wins):

| Priority | Path                                          | Purpose                 |
| -------- | --------------------------------------------- | ----------------------- |
| 1        | `{projectDir}/.claude-src/agents/_templates/` | Project-local overrides |
| 2        | `{projectDir}/.claude/templates/`             | Legacy template path    |
| 3        | `{CLI_ROOT}/src/agents/_templates/`           | Built-in templates      |

`src/agents/` is published directly AND copied to `dist/src/agents/` by tsup's `onSuccess`; the copy is a hedge against `CLI_ROOT` resolving to `<pkg>/dist`. See [build-and-packaging.md](../build-and-packaging.md).

Engine config: `.liquid` extension, `strictVariables: false`, `strictFilters: true`.

### Main Template: agent.liquid

**File:** `src/agents/_templates/agent.liquid`

The template assembles a compiled agent prompt in this order:

```
1. YAML frontmatter
   - name, description, tools, disallowedTools (conditional), model, permissionMode
   - skills (conditional: only if preloadedSkillIds exist)

2. # {{ agent.title }}
   <role>{{ identity }}</role>

3. <core_principles> (hardcoded 5 principles)
   1. Investigation First
   2. Follow Existing Patterns
   3. Minimal Necessary Changes
   4. Anti-Over-Engineering
   5. Verify Everything

4. <methodologies> (5 Liquid partials via {% render %})
   - methodologies/investigation-requirements
   - methodologies/anti-over-engineering
   - methodologies/write-verification
   - methodologies/success-criteria
   - methodologies/context-management

5. <critical_requirements> (conditional: if criticalRequirementsTop is non-empty)

6. <skill_activation_protocol> (conditional: if dynamicSkills exist)
   - 3-step protocol: EVALUATE -> ACTIVATE -> IMPLEMENT
   - Lists each dynamic skill with id, description, invoke command, usage
   OR <skills_note> if all skills are preloaded

7. {{ playbook }} (agent-specific workflow)

8. ## Standards and Conventions

9. {{ output }} (output format specification)

10. <critical_reminders> (conditional: if criticalReminders is non-empty)

11. Final instruction lines (always present):
    - "DISPLAY ALL 5 CORE PRINCIPLES..."
    - "ALWAYS RE-READ FILES AFTER EDITING..."
```

### Template Variables

| Variable                  | Source                                | Type                            |
| ------------------------- | ------------------------------------- | ------------------------------- |
| `agent.name`              | `AgentConfig.name`                    | `string`                        |
| `agent.description`       | `AgentConfig.description`             | `string`                        |
| `agent.title`             | `AgentConfig.title`                   | `string`                        |
| `agent.tools`             | `AgentConfig.tools`                   | `string[]`                      |
| `agent.disallowedTools`   | `AgentConfig.disallowedTools`         | `string[]`                      |
| `agent.model`             | `AgentConfig.model`                   | `ModelName`                     |
| `agent.permissionMode`    | `AgentConfig.permissionMode`          | `PermissionMode`                |
| `identity`                | Content of `identity.md`              | `string`                        |
| `playbook`                | Content of `playbook.md`              | `string`                        |
| `output`                  | Content of `output.md`                | `string`                        |
| `criticalRequirementsTop` | Content of `critical-requirements.md` | `string`                        |
| `criticalReminders`       | Content of `critical-reminders.md`    | `string`                        |
| `preloadedSkillIds`       | Skill IDs for frontmatter             | `(SkillId \| PluginSkillRef)[]` |
| `dynamicSkills`           | Skills loaded via Skill tool          | `Skill[]`                       |
| `preloadedSkills`         | Preloaded skills in full — unrendered | `Skill[]`                       |

### Compilation Flow

**There is one agent-render entry point:** `compileAgentForPlugin()` in
`src/cli/lib/compiler.ts`. It attaches a per-skill `pluginRef` via
`buildAgentTemplateContext`'s `mapSkill` transform, then sanitizes and renders. Its only caller is
`writeCompiledAgentsByScope()` (`src/cli/lib/agents/write-compiled-agents.ts`), which in turn has a
single driver, `recompileAgents` (`src/cli/lib/agents/agent-recompiler.ts`).

**Per-agent compilation (`compileAgentForPlugin`):**

```
1. readAgentFiles(name, agent, fallbackRoot) resolves the agent source dir:
   (agent.sourceRoot || fallbackRoot) / (agent.agentBaseDir || DIRS.agents) / (agent.path || name)
2. Read identity.md, playbook.md (required), output.md, critical-requirements.md, critical-reminders.md
   - output.md falls back to parent category directory if missing from agent directory
3. buildAgentTemplateContext(name, agent, files, mapSkill):
   - mapSkill spreads pluginRefFor(skill) onto each skill, attaching pluginRef (-- see below)
   - split skills into preloaded (s.preloaded) and dynamic
   - preloadedSkillIds = preloadedSkills.map(s => s.pluginRef ?? s.id)
4. sanitizeCompiledAgentData(data) strips Liquid delimiters from all user-controlled fields
5. renderAgent: engine.renderFile("agent", sanitizedData) -> rendered markdown,
   then stampProvenanceMarker(rendered, await cliVersion())
```

**Both entry points render through `renderAgent`** (`packages/compile/src/agent-source.ts`), so no path writes a compiled agent this
CLI cannot later recognise as its own. The marker is an HTML comment on the first line after the
frontmatter — deliberately not a frontmatter key, because Claude Code's tolerance of unknown keys is
undocumented. Full contract: [`compilation-pipeline.md` § The Provenance Marker](./compilation-pipeline.md).

**Batch compilation (`recompileAgents` -> `writeCompiledAgentsByScope`):**

```
for each (name, agent) in resolvedAgents:
  1. compileAgentForPlugin(name, agent, sourcePath, engine) -> output string
  2. scope = agentScopeMap.get(name) ?? UNROUTED_AGENT_SCOPE ("project")
  3. rewritten = !holdsExactly(targetPath, output)   -- read-compare before writing
  4. if rewritten: writeFile to the global agents dir (scope "global") or projectAgentsDir
  5. record an AgentWriteOutcome
       ({ name, ok: true, scope, targetDir, rewritten } | { name, ok: false, error })
```

Per-agent failures are collected as `AgentWriteOutcome[]`; the caller owns the policy — `recompileAgents` reports and continues. `writeCompiledAgentsByScope` performs **no structural validation** of what it writes; `validateCompiledAgent` in `src/cli/lib/output-validator.ts` has no caller outside its own test file.

**Writes are skipped when the bytes already match, and the summaries say so.** `holdsExactly(filePath, content)` (file-local) is `fileExists && readFile === content`. Skipping the write is what gives "unchanged" a checkable meaning: an agent reported unchanged keeps its mtime, and an mtime is the only trace a rewrite with identical bytes leaves anywhere. The flag propagates outward unchanged in name:

| Carrier                         | Field                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `AgentWriteOutcome` (ok branch) | `rewritten: boolean`                                                           |
| `RecompileAgentsResult`         | `rewritten: AgentName[]` — `compiled` minus `rewritten` is the unchanged count |
| `CompilationResult`             | `rewritten: AgentName[]` — an empty `rewritten` changed nothing on disk        |
| `PropagatedRecompileSummary`    | `rewrittenCount`, `unchangedCount`, `failedCount`                              |

Two summary builders read them, both in `src/cli/utils/messages.ts`. `recompileSummary(rewritten, unchanged, subject)` emits `N <subject> rewritten, M unchanged` — `subject` is the caller's noun, because `compile` reports per scope pass ("global agents") and `edit` reports the whole run's ("agents"). `propagatedRecompileSummary(rewritten, unchanged, failed)` emits `Recompiled agents in N registered projects, M unchanged` plus a ` (K failed)` suffix when any failed. The count these replaced was the roster the pass walked, so a run that rewrote nothing and a run that rewrote everything printed the same sentence.

`recompileAgents` also logs one per-agent line, `  Rewrote: <name> (<scope> -> <dir>)` or `  Unchanged: <name> (...)`.

**`UNROUTED_AGENT_SCOPE` is a routing answer, not a selection default.** `"project"` here means "the directory the caller named in `projectAgentsDir`" — the only defensible target for a write with no `agentScopeMap` entry (no map passed at all, or a hand-authored agent under `.claude/agents/` with no config row). It is deliberately **not** `DEFAULT_SELECTION_OPTIONS.scope` from `@workspace/matrix`, which says what an untouched _pick_ installs as; adopting that here would relocate the agents of every caller that never asked for global routing into `~/.claude/agents`.

### Per-Skill Plugin Reference Format

**Function:** `pluginRefFor(skill)` -- exported from `packages/compile/src/agent-source.ts`, which `src/cli/lib/compiler.ts` imports and the editor's `output-preview.ts` imports directly. Guards on `EJECT_SOURCE` (`"eject"`, from `consts.ts`), and returns a spreadable partial -- `{}` for an ejected skill, so no `pluginRef` key is attached at all.

**Rule:** Each skill's own `source` field on its `SkillReference` decides its rendered form in the compiled agent's `skills:` frontmatter. (`SkillReference.source` is the compiler-side name for what `SkillConfig` calls `origin`; `buildCompileAgents` threads one onto the other.) A skill renders as `${id}:${id}` (plugin form) only when its source is an explicit non-eject marketplace identifier. `undefined` source (user-authored local skills with no `SkillConfig` entry) and `"eject"` both render as bare `id` (eject form).

| `skill.source` value   | Rendered form in frontmatter |
| ---------------------- | ---------------------------- |
| `undefined`            | `${id}` (bare)               |
| `"eject"`              | `${id}` (bare)               |
| `"<marketplace-name>"` | `${id}:${id}` (plugin form)  |

**Implication:** Mixed-mode agents (some skills ejected, some installed as plugin from a marketplace) render a mixed-form `skills:` array. There is no uniform-`installMode` plumbing: `RecompileAgentsOptions` carries no `installMode` field and `compileAgentForPlugin` accepts none -- per-skill `source` is the sole authority.

**E2E coverage:** `e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts`.

### Sanitization

**Function:** `sanitizeCompiledAgentData()` in `src/cli/lib/compiler.ts`
**Pattern:** `LIQUID_SYNTAX_PATTERN = /\{\{|\}\}|\{%|%\}/g`

Strips Liquid delimiters from user-controlled **metadata** fields:

- `agent.name`, `agent.title`, `agent.description`
- `agent.tools[]`, `agent.disallowedTools[]`
- `agent.model`, `agent.permissionMode`
- Per-skill `id`, `description`, `usage`, `pluginRef` (via `sanitizeSkills`)
- `preloadedSkillIds[]`

**Content fields are passed through unchanged** -- `identity`, `playbook`, `output`, `criticalRequirementsTop`, `criticalReminders`, and each skill's `content`. LiquidJS does not re-evaluate template syntax inside variable values, so double-curlies in content (e.g. GitHub Actions `${{ secrets.X }}`) are safe.

## Methodology Templates

**Directory:** `src/agents/_templates/methodologies/`

All methodology partials are rendered via `{% render %}` tags in `agent.liquid` and included in every compiled agent.

| Template                            | XML Tag                         | Purpose                                                    |
| ----------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| `investigation-requirements.liquid` | `<investigation_requirement>`   | "Never speculate" protocol: list files, read, verify       |
| `anti-over-engineering.liquid`      | `<anti_over_engineering>`       | Surgical implementation: no new abstractions, use existing |
| `write-verification.liquid`         | `<write_verification_protocol>` | Re-read files after editing, verify changes exist          |
| `success-criteria.liquid`           | `<success_criteria_template>`   | Measurable "done" criteria with SMART template             |
| `context-management.liquid`         | `<context_management>`          | .claude/ session files for cross-session continuity        |
| `improvement-protocol.liquid`       | `<improvement_protocol>`        | Self-improvement workflow when agents update own config    |

**Note:** `improvement-protocol.liquid` exists in the methodologies directory but is NOT rendered by `agent.liquid`. Only the 5 listed in the `{% render %}` tags are included in compiled agents.

## AgentName Type Relationship

### Generated Union Type

**File:** `src/cli/types/generated/source-types.ts`

```typescript
export const AGENT_NAMES = [
  "agent-summoner",
  "ai-developer",
  "ai-researcher",
  "ai-tester",
  "api-developer",
  "api-researcher",
  "api-tester",
  "cli-developer",
  "cli-researcher",
  "cli-tester",
  "codex-keeper",
  "convention-keeper",
  "pm",
  "reviewer",
  "skill-summoner",
  "web-developer",
  "web-researcher",
  "web-tester",
] as const;

export type AgentName = (typeof AGENT_NAMES)[number];
```

Every agent directory under `src/agents/` is represented; the union size is owned by
[type-system.md](../type-system.md) ("Counts").

### Re-export Chain

```
src/cli/types/generated/source-types.ts  -- defines AGENT_NAMES and AgentName
  -> src/cli/types/agents.ts             -- re-exports AgentName (type) and AGENT_NAMES (value)
     -> src/cli/types/index.ts            -- barrel re-exports AgentName type (export type *)
                                             AGENT_NAMES value is NOT barrel-exported;
                                             consumers import from agents.ts or source-types.ts directly
```

### Wizard Domain Mapping

**File:** `src/cli/stores/wizard-store.ts`

```typescript
const DOMAIN_AGENTS: Partial<Record<Domain, AgentName[]>> = {
  web: ["web-developer", "web-researcher", "web-tester", "pm", "reviewer"],
  api: ["api-developer", "api-researcher", "api-tester", "pm", "reviewer"],
  cli: ["cli-developer", "cli-tester", "cli-researcher", "pm", "reviewer"],
  ai: ["ai-developer", "ai-researcher", "ai-tester", "pm", "reviewer"],
};
```

Four of the nine `Domain` members are keyed, each with the three agents sharing its `<domain>-` name
prefix plus the cross-domain `pm` and `reviewer` — every domain rosters both, and
`preselectAgentsFromDomains` dedupes the union when several selected domains bring them. The five
remaining domains (`desktop`, `infra`, `meta`, `mobile`, `shared`) have no entry, so selecting them
preselects nothing.

**Which agents no domain preselects, and which the grid does not offer at all, are owned by
`src/cli/lib/wizard/agent-roster.test.ts` and are deliberately not restated here.** Two named
lists there hold them — `AGENTS_NO_DOMAIN_PRESELECTS` and `AGENTS_WITH_NO_GRID_ROW` — each
asserted with `toStrictEqual` against `AGENT_NAMES` filtered by `DOMAIN_AGENTS` and
`BUILT_IN_AGENT_IDS` respectively, and each carrying, in its own docblock, the reason its members
are excused. Read the membership there.

**The list belongs in a spec rather than in prose because it is an assertion of ABSENCE**, which
`scripts/check-enumeration-drift.ts` cannot falsify: giving an agent a grid row moves no symbol
name, so a paragraph naming the gap stays green whether or not it is still true. `tsc` cannot hold
it either, and only in one direction — deleting an agent directory takes its name out of the
`AgentName` union, so a stale entry fails to compile, while ADDING one produces no error anywhere.
The suite is what fails, on the line that owns the name.

A stack can name any agent, and naming one installs it: domain derivation runs only on the from-scratch path, so a chosen stack's `agents` keys are the roster the install gets and `DOMAIN_AGENTS` is not consulted — `preselectAgentsFromDomains` is a no-op once a stack is chosen. A grid row is how the user then adds or drops one.

### Wizard Selection Grid (`BUILT_IN_AGENT_GROUPS`)

**File:** `src/cli/lib/wizard/agent-roster.ts`, beside `BUILT_IN_AGENT_IDS` and
`firstFocusableAgent()` — not in the component that renders it, because the grid is not the only
surface that must know which row it opens on: the store seeds `focusedAgentId` from the same roster
before the first frame, so a keystroke buffered ahead of that frame resolves the agent the user is
looking at. `src/cli/components/wizard/step-agents.tsx` imports it and holds `buildAgentGroups`.
**Constant:** `BUILT_IN_AGENT_GROUPS` -- the fixed inventory of built-in agents rendered as the checkbox grid in `StepAgents` (the wizard's agent-selection step). Distinct from `DOMAIN_AGENTS` (`wizard-store.ts`): `DOMAIN_AGENTS` drives auto-preselection from chosen domains, while `BUILT_IN_AGENT_GROUPS` is the ordered set of rows the user can navigate and toggle with SPACE.

| Group label | Agent ids (grid order)                                               |
| ----------- | -------------------------------------------------------------------- |
| `Web`       | `web-developer`, `web-researcher`, `web-tester`                      |
| `API`       | `api-developer`, `api-researcher`, `api-tester`                      |
| `AI`        | `ai-developer`, `ai-researcher`, `ai-tester`                         |
| `CLI`       | `cli-developer`, `cli-tester`, `cli-researcher`                      |
| `Meta`      | `pm`, `reviewer`, `agent-summoner`, `skill-summoner`, `codex-keeper` |

**17 grid rows.** The four domain groups each list the same three implementation agents as that
domain's `DOMAIN_AGENTS` entry (orderings differ in places); the cross-domain `pm` and `reviewer` —
which every `DOMAIN_AGENTS` entry also names — have their single grid rows at the head of the
`Meta` group. Which `AgentName` members have no row here is
`AGENTS_WITH_NO_GRID_ROW` in `src/cli/lib/wizard/agent-roster.test.ts`, which owns that list — see
[Wizard Domain Mapping](#wizard-domain-mapping) above for why it lives in a spec rather than in a
sentence.

**Custom-agent groups (`buildAgentGroups(matrix)`):** Beyond the fixed inventory, `buildAgentGroups` appends groups for custom agents. It collects `unique(matrix.suggestedStacks.flatMap((stack) => typedKeys(stack.skills)))`, filters to ids absent from `BUILT_IN_AGENT_IDS` (a `Set` of every `BUILT_IN_AGENT_GROUPS` item id), and groups each by its explicit `matrix.agentDefinedDomains?.[id]` (from `metadata.yaml`, when the id is in the `AgentName` union) or a kebab-prefix fallback (`id.split("-")[0]`), labelled via `getDomainDisplayName()` (`src/cli/components/wizard/utils.ts`). When no custom agents exist, `buildAgentGroups` returns `BUILT_IN_AGENT_GROUPS` unchanged.

## Key Types

| Type                  | File                              | Purpose                                                |
| --------------------- | --------------------------------- | ------------------------------------------------------ |
| `AgentName`           | `types/generated/source-types.ts` | Union type of known agent IDs                          |
| `AgentYamlConfig`     | `types/agents.ts`                 | Parsed metadata.yaml structure                         |
| `AgentDefinition`     | `types/agents.ts`                 | Agent definition with path/source metadata             |
| `AgentConfig`         | `types/agents.ts`                 | Fully resolved config with skills list                 |
| `BaseAgentFields`     | `types/agents.ts`                 | Shared fields across AgentDefinition/Config/YamlConfig |
| `AgentFrontmatter`    | `types/agents.ts`                 | Compiled .md frontmatter format                        |
| `CompiledAgentData`   | `types/agents.ts`                 | All data needed for template rendering                 |
| `AgentSourcePaths`    | `types/agents.ts`                 | Directory paths for agent loading                      |
| `AgentHookAction`     | `types/agents.ts`                 | Hook action (command/script/prompt)                    |
| `AgentHookDefinition` | `types/agents.ts`                 | Hook with optional file matcher                        |

## Key Functions

| Function                             | File                                                                 | Signature                                                                                                                                           |
| ------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadAllAgents()`                    | `lib/loading/loader.ts`                                              | `(projectRoot: string) => Promise<Partial<Record<AgentName, AgentDefinition>>>`                                                                     |
| `loadProjectAgents()`                | `lib/loading/loader.ts`                                              | `(projectDir) => Promise<Partial<Record<AgentName, AgentDefinition>>>`                                                                              |
| `readAgentFiles()`                   | `lib/compiler.ts` (file-local)                                       | `(name, agent, projectRoot) => Promise<AgentFiles>`                                                                                                 |
| `buildAgentTemplateContext()`        | `@workspace/compile/agent-source` (re-exported by `lib/compiler.ts`) | `(name, agent, files, mapSkill?) => CompiledAgentData`                                                                                              |
| `sanitizeCompiledAgentData()`        | `@workspace/compile/agent-source` (re-exported by `lib/compiler.ts`) | `(data: CompiledAgentData) => CompiledAgentData`                                                                                                    |
| `compileAgentForPlugin()`            | `lib/compiler.ts`                                                    | `(name, agent, fallbackRoot, engine) => Promise<string>`                                                                                            |
| `pluginRefFor()`                     | `@workspace/compile/agent-source` (not re-exported)                  | `(skill: Skill) => { pluginRef?: PluginSkillRef }`                                                                                                  |
| `renderAgent()`                      | `@workspace/compile/agent-source` (not re-exported)                  | `(engine, data) => Promise<string>` — the one render path both entry points take                                                                    |
| `writeCompiledAgentsByScope()`       | `lib/agents/write-compiled-agents.ts`                                | `(params) => Promise<AgentWriteOutcome[]>` (per-scope compile + write loop)                                                                         |
| `listCompiledAgentNames()`           | `lib/agents/list-compiled-agents.ts`                                 | `(agentsDir: string) => Promise<AgentName[]>` (compiled `.md` filenames minus extension; backs `resolveAgentNames` priority 4)                      |
| `listAgentMdFiles()`                 | `lib/agents/list-compiled-agents.ts`                                 | `(agentsDir: string) => Promise<string[]>` (`*.md` glob; also used by `doctor`, `content-validator`, `uninstall`, `agent-plugin-compiler`)          |
| `pruneStaleCompiledAgents()`         | `lib/agents/list-compiled-agents.ts`                                 | `(agentsDir: string, keep: ReadonlySet<AgentName>) => Promise<void>` (stale-agent prune)                                                            |
| `compileAgents()`                    | `lib/operations/project/compile-agents.ts`                           | `(options: CompileAgentsOptions) => Promise<CompilationResult>` (recompile wrapper + prune)                                                         |
| `compileAgentsAllScopes()`           | `lib/operations/project/compile-agents-all-scopes.ts`                | `(options: CompileAllScopesOptions) => Promise<CompilationResult>` (multi-pass driver)                                                              |
| `recompileRegisteredProjectAgents()` | `lib/operations/project/recompile-project-agents.ts`                 | `(projectDir: string) => Promise<CompilationResult>`(project scope only)                                                                            |
| `recompilePropagatedProjectAgents()` | `lib/operations/project/recompile-project-agents.ts`                 | `(projectDirs: string[]) => Promise<PropagatedRecompileSummary>`(per-project failure isolation)                                                     |
| `reconcileTypesFromDisk()`           | `lib/config-gate/index.ts`                                           | `(projectDir, config, deps, opts?) => Promise<GateReport>` (scope-correct `config-types.ts` refresh; used by `compile`; fans out at `$HOME`)        |
| `recompileAgents()`                  | `lib/agents/agent-recompiler.ts`                                     | `(options: RecompileAgentsOptions) => Promise<RecompileAgentsResult>`                                                                               |
| `buildAgentScopeMap()`               | `lib/installation/local-installer.ts`                                | `(config: ProjectConfig) => Map<AgentName, SkillScope>`                                                                                             |
| `filterExcludedEntries()`            | `lib/agents/agent-recompiler.ts`                                     | `(config: ProjectConfig) => ProjectConfig`                                                                                                          |
| `shouldIncludeTriple()`              | `@workspace/compile/seed-to-config` (module-private)                 | `(agent, category, skillId, inputs) => boolean`                                                                                                     |
| `buildAgentStack()`                  | `@workspace/compile/seed-to-config` (module-private)                 | `(agent, inputs) => StackAgentConfig \| undefined`                                                                                                  |
| `scopeEligibilityKey()`              | `lib/configuration/config-generator.ts`                              | `(agent, skillId) => string` (key builder)                                                                                                          |
| `isScopeCompatible()`                | `@workspace/compile/seed-to-config` (module-private)                 | `(skillId, agent, skillScope, agentScope) => boolean`                                                                                               |
| `propagateGlobalChangesToProjects()` | `lib/config-gate/propagate.ts`                                       | `(globalConfig, matrix, agents, currentProjectDir?) => Promise<{updated, skipped}>`                                                                 |
| `mergeGlobalConfigs()`               | `lib/config-gate/propagate.ts`                                       | `(existing, incoming) => {config, changed}` (dedup-merge)                                                                                           |
| `createLiquidEngine()`               | `lib/compiler.ts`                                                    | `(projectDir?) => Promise<Liquid>`                                                                                                                  |
| `sanitizeLiquidSyntax()`             | `@workspace/compile/agent-source` (re-exported by `lib/compiler.ts`) | `(value, fieldName) => sanitized string`                                                                                                            |
| `getAgentDefinitions()`              | `lib/agents/agent-fetcher.ts`                                        | `(remoteSource?: string) => Promise<AgentSourcePaths>` — the remote branch and its production-unreachability: [leaf-exports.md](../leaf-exports.md) |
| `loadAgentDefs()`                    | `lib/operations/project/load-agent-defs.ts`                          | `() => Promise<AgentDefs>` — no parameter; agent partials ship with the CLI, so the local branch is the only one it asks for                        |

## Recompile Flow

**Function:** `recompileAgents()` in `src/cli/lib/agents/agent-recompiler.ts`

Recompile is the primary agent-refresh path invoked after any config mutation (`cc edit`, skill install, source switching, global-propagation). Commands reach it through the operations-layer feeders: `compileAgentsAllScopes()` (used by `init` and `edit`, runs a home pass or a global+project pass pair) and `compileAgents()` (used directly by `compile` and `update`, and per-pass by `compileAgentsAllScopes` — a thin wrapper that auto-builds the `agentScopeMap` via `buildAgentScopeMap` when `scopeFilter` is set). `recompileAgents` loads the project's `ProjectConfig`, filters excluded entries via `filterExcludedEntries()`, resolves the agent set, merges project and built-in agent definitions (project wins on conflict), resolves skill references, then hands the resolved agents to `writeCompiledAgentsByScope()` -- which calls `compileAgentForPlugin()` and writes each agent to its scope's directory.

**Agent name resolution priority** (in `resolveAgentNames`):

1. `options.agents` (explicit caller list)
2. `projectConfig.agents` (from saved config, name-only) -- **the branch keys on config PRESENCE, not `agents.length`**. A present config is authoritative over its roster even when the roster is empty, so `agents: []` resolves to zero agents. Keying on `projectConfig?.agents?.length` was the bug: an empty list fell through to priority 3 and a global install compiled every built-in agent.
3. All available agents from source when `outputDir` is set -- reached only on a config-LESS load
4. Directory scan of existing `{pluginDir}/agents/*.md` files -- `getExistingAgentNames()` calls `listCompiledAgentNames(getPluginAgentsDir(pluginDir))` (`src/cli/lib/agents/list-compiled-agents.ts`), which globs `*.md` via `listAgentMdFiles()` and strips the extension so each compiled filename becomes an `AgentName` (boundary cast -- custom marketplace agents may fall outside the union)

**Corrupt-config behaviour:** `loadProjectConfig()` returns `null` only for a MISSING config. A config file that exists but cannot be evaluated, has no valid default export, or fails the loader schema throws `ConfigLoadError` (`src/cli/lib/configuration/project-config.ts`) carrying `configPath` and `reason`. That error propagates out of `recompileAgents` rather than degrading to the config-less priority-3 branch, which is what previously resurrected every built-in agent.

**Agent-set merge:** `allAgents = { ...builtinAgents, ...projectAgents }` -- project agents (loaded from `.claude-src/agents/` via `loadProjectAgents`) override built-ins with the same ID.

**Per-agent stack filter:** `buildCompileAgents(filteredConfig, allAgents)` returns entries for every agent in the config, but only the agents in the resolved `agentNames` set are compiled. Without this filter, a project pass would compile global agents without their stack (since the project config omits global agent stack entries) and overwrite correctly-compiled global agent files.

### Stale-Agent Pruning

**Functions:** `pruneStaleAgentsForPass()` (file-local in `src/cli/lib/operations/project/compile-agents.ts`) -> `pruneStaleCompiledAgents(agentsDir, keep)` (`src/cli/lib/agents/list-compiled-agents.ts`).

Compiled-agent writes are purely additive: `writeCompiledAgentsByScope` writes the agents it was given and never removes anything, so an agent deselected from `config.ts` left its `.md` on disk indefinitely and Claude Code kept loading it.

**When pruning runs:** only when `compileAgents()` was called with an `outputDir` AND **no** `scopeFilter` — an authoritative pass whose resolved roster is the complete set for that directory.

| Caller                                                | `outputDir` | `scopeFilter`    | Prunes? |
| ----------------------------------------------------- | ----------- | ---------------- | ------- |
| `compile` with a single installation                  | set         | none             | yes     |
| `compile` with `hasBoth` (one filtered pass)          | set         | project          | no      |
| `compileAgentsAllScopes` home branch                  | set         | none             | yes     |
| `compileAgentsAllScopes` project branch (both passes) | set         | global / project | no      |
| `recompileRegisteredProjectAgents`                    | set         | project          | no      |

A scope-FILTERED pass sees only one scope's roster, so deleting from its `outputDir` could remove another scope's files, which is why such a pass never prunes.

**Keep set:** `compiled ∪ failed` for that pass. A failed agent is retained deliberately — a render failure must not also delete the previously good artifact.

**Hand-authored agents are preserved.** The predicate is `isAgentName(basename) && !keep.has(basename)`: a file whose basename is not a built-in `AgentName` never matches, so the built-in-name check is a guard, never the removal criterion.

### Multi-Scope Compilation (`compileAgentsAllScopes`)

**File:** `src/cli/lib/operations/project/compile-agents-all-scopes.ts`
**Options:** `CompileAllScopesOptions` = `{ projectDir, sourcePath, skills: SkillDefinitionMap, agentScopeMap: Map<AgentName, SkillScope> }`

`compileAgentsAllScopes()` is the driver `init` (`init.tsx`) and `edit` (`edit.tsx`) use to refresh every scope the current context owns. It dispatches on `isHomeDirectory(projectDir)`:

| Context            | Passes                   | Per-pass `compileAgents()` args                                                                                                                                                                                                                        |
| ------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Home (`cwd === ~`) | 1 (single)               | `projectDir`, `outputDir = resolveInstallPaths(projectDir, "project").agentsDir` -- no `scopeFilter`                                                                                                                                                   |
| Project            | 2 (global, then project) | Global: `projectDir = os.homedir()`, `outputDir = resolveInstallPaths(os.homedir(), "global").agentsDir`, `scopeFilter: "global"`. Project: `projectDir`, `outputDir = resolveInstallPaths(projectDir, "project").agentsDir`, `scopeFilter: "project"` |

Each project-context pass is `scopeFilter`-restricted so the project pass cannot overwrite a global agent with a zero-skill version (the project config omits global agents' stacks -- see **Per-agent stack filter** above). Results merge in **pass order** (global first, project second) via the file-local `mergeCompilationResults()`, which concatenates the `compiled`, `failed`, and `warnings` arrays with `flatMap`. The per-pass `compileAgents()` wrapper (`src/cli/lib/operations/project/compile-agents.ts`) auto-builds `agentScopeMap` from the loaded config via `buildAgentScopeMap()` when `scopeFilter` is set and no map was supplied.

### Configured-but-Missing Stack Skills

Before each `compile` pass, `warnUnresolvedStackSkills()` in `src/cli/commands/compile.ts` loads the project config and computes `getStackSkillIds(config.stack)` (`src/cli/lib/stacks/stacks-loader.ts`) minus `effectivelyExcludedSkillIds(config.skills)`, then emits a visible `this.warn("Skill '<id>' is configured but was not found — agents will be compiled without it.")` for every stack skill absent from the discovered `SkillDefinitionMap`. The resolver drops such skills from every agent that references them; the drop was previously only a `verbose()` log, so the default output claimed a clean recompile of an agent that no longer matched `config.ts`. Shipped. See [Compilation Pipeline](./compilation-pipeline.md) and [Commands](../commands/index.md) for the full flow.

## Agent Scope Routing

**Type:** `agentScopeMap?: Map<AgentName, SkillScope>` on `RecompileAgentsOptions` (`SkillScope = "project" | "global"`, from `types/config.ts`). Built from a project's `ProjectConfig` by `buildAgentScopeMap()`.

When `writeCompiledAgentsByScope()` writes a compiled agent, `agentScopeMap.get(name) ?? "project"` decides the target directory:

| Scope       | Target directory                                                              |
| ----------- | ----------------------------------------------------------------------------- |
| `"project"` | `projectAgentsDir` = `outputDir ?? getPluginAgentsDir(pluginDir)`             |
| `"global"`  | `resolveInstallPaths(os.homedir(), "global").agentsDir` (`~/.claude/agents/`) |

Only the project directory is created eagerly: `recompileAgents` `ensureDir`s `agentsDir` before handing it over. `writeCompiledAgentsByScope` creates neither target up front — `writeFile` makes a target's parent on the way past, so each directory appears exactly when an agent routes into it, and a wholly project-scoped pass leaves no empty `~/.claude/agents/` behind in a home with no global install.

**Why it matters:** A single `recompileAgents()` invocation can produce a mixed batch of project and global agents. Global-scoped agents must land at the global filesystem location so Claude Code picks them up for every project; project-scoped agents stay project-local.

## Per-Agent Curation Preservation

**Function:** `shouldIncludeTriple(agent, category, skillId, inputs)` in `packages/compile/src/seed-to-config.ts` — module-private there, and `configuration/config-generator.ts` re-exports it under no name, so the only CLI-side address for the behaviour is `generateProjectConfigFromSkills`, which drives it

**Problem:** `buildAgentStack()` rebuilds every agent's stack membership from ownership rules on every save. Without a preservation rule, any user curation of `stack.<agent>` (removing a skill from a specific agent's stack) is silently reverted on the next save.

**Rule:** When `inputs.newlyAddedSkillIds !== undefined` (opt-in by supplying the delta set to `generateProjectConfigFromSkills`), a `(agent, category, skillId)` triple is included only when:

1. The agent has no prior stack entry (seed branch -- new agent this session); OR
2. The triple was already present in `existingStack[agent][category]` (idempotent keep); OR
3. The skill is in `newlyAddedSkillIds` (session-level top-level addition); OR
4. The `(agent, skillId)` key is in `scopeEligibilityGained` (scope-compat flip made it reachable this session).

Otherwise the triple is **omitted**, respecting the user's prior per-agent curation removal.

**Legacy path:** When `newlyAddedSkillIds` is `undefined`, this gate is disabled — every id reaching it passes. That is not the same as landing on every agent, because `buildAgentStack` applies a further filter after this one; [scope-split.md](../config/scope-split.md) owns what the two do together.

**Scope-eligibility key:** `scopeEligibilityKey(agent, skillId)` encodes `(agent, skillId)` as `"${agent}|${skillId}"` for set-membership lookups. Admits scope-flip cases that a skill-id-only diff cannot express.

**Scope filter runs first:** `isScopeCompatible()` (project skills never reach global agents) filters before `shouldIncludeTriple()`. `isScopeCompatible()` resolves both the skill's and the agent's scope via `getScopeOrThrow()` -- a missing scope entry throws instead of silently defaulting to `"project"` (guards against Bug 1-class regressions). `shouldIncludeTriple()` runs on the already-scope-filtered ids and does not call `getScopeOrThrow()`.

**The invariant `getScopeOrThrow` enforces:** `selectedAgents` and `agentConfigs` are NOT parallel arrays, and every selected agent must have a non-excluded `AgentScopeConfig`. `resolveActiveAgentConfigs` states it positively — it indexes only the non-excluded configs and throws `selected agent '<name>' has no non-excluded AgentScopeConfig in agentConfigs` when a selected name is missing from that index — while `excludedAgentConfigs` carries the tombstones through separately into `finalAgentConfigs`. The throw was once reachable: a global-scope deselect used to leave the name in `selectedAgents` while rewriting its config entry to `{ excluded: true }`, so the stack builder asked for a scope the active map no longer held, and the command layer degraded the error to a warning — the wizard finished and `config.ts` was silently not updated. It is unreachable now because the store stopped producing that input, not because the guard was relaxed: `applyAgentToggle` deselects by clean removal from both `selectedAgents` and `agentConfigs`, and `restoreDualScopeAgent` / `toggleAgentScope` always keep an active entry beside any tombstone.

## Global-Agent Propagation

**Function:** `mergeGlobalConfigs(existing, incoming)` in `src/cli/lib/config-gate/propagate.ts`

A project-context edit that promotes an agent to global persists it as a new global `agents` row — `mergeGlobalConfigs` appends active incoming agents whose `name` is not already in the existing global config. There is no flat selected-agent list to merge: `ProjectConfig` carries none, and the selected-agent set is derived from the non-excluded `agents` rows via `activeAgentNames` in `src/cli/lib/configuration/scope-predicates.ts`. The one selection list the merge does union is `selectedDomains`:

```
mergedSelectedDomains = [...new Set([...(existing.selectedDomains ?? []), ...(incoming.selectedDomains ?? [])])]
```

The `changed` flag flips when the merged list differs from the existing list via `isDeepEqual` (among the other terms — see [config-merger.md](../config/config-merger.md)).

**Downstream propagation:** `propagateGlobalChangesToProjects(globalConfig, matrix, agents, currentProjectDir?)` iterates `globalConfig.projects` (registered project paths), skips the currently-installing project, and for each remaining project:

1. Loads `existingProject.config`.
2. Reconciles the project's own entries against the now-current global data into a `projectSplit`:
   - `retainProjectOwnedSkills` / `retainProjectOwnedAgents` keep project-scoped entries and keep a global tombstone (`scope === "global" && excluded`) only while the masked global entry is still active — stale tombstones for a since-removed global item are dropped (Scenario C).
   - `retainReconciledStack` prunes stack assignments that reference a global skill removed at global scope (ids from `computeRemovedGlobalSkillIds`).
   - `reconcileProjectSplitAgainstGlobal` then self-heals and re-masks on BOTH axes. `dropOrphanedDerivedAgentMasks` (the agent mirror of `dropOrphanedDerivedMasks`) runs FIRST and drops a global agent tombstone that no longer has an active project-scoped agent of the same name to justify it, so the global agent becomes visible again instead of staying masked forever. `maskCollidingGlobalAgents` then re-derives a mask for every live global agent the project DOES own at project scope, producing the `[P][G]` pair. Self-heal before mask means a cleared collision is removed rather than immediately re-derived, and the producer's `alreadyTombstoned` guard only sees warranted tombstones. Agents have no categories, so identity is the only collision kind (skills additionally collide on exclusive categories).
3. Rewrites BOTH halves of the project's pair in one call — `writeProjectConfigPair(projectPath, projectSplit, globalConfig, matrix, agents)` — which emits `config.ts` with re-inlined global data and then `config-types.ts` via `regenerateConfigTypes()` with `buildConfigTypesBackgroundData(matrix, agents)` and `buildProjectTypesExtras(inlinedProjectView(projectSplit, globalConfig), matrix)`, so the types name every literal the sibling config holds. The import-from-global form is emitted, not the standalone-inlined one.
4. Records the path in `updated[]`; an unreachable or failing project goes to `skipped[]` and never aborts the loop.
5. The gate then recompiles every path in `updated[]` itself, for a T1 change(below).

**Both project-config write sites share one reconciliation step and one writer.** `reconcileProjectSplitAgainstGlobal` is called immediately before `writeProjectConfigPair` in this propagation path AND immediately before the same call in the project branch of `writeScopedFromWizard`. The second site previously handed `splitConfigByScope`'s raw output straight to the inlining writer with no reconciliation at all, so a project owning a skill at project scope while the same id was active globally ended up with two active entries — one id active at both scopes, with no propagation involved and no category rule needed to reproduce it. The asymmetry was easy to miss by reading either site alone: the propagation path's reconciliation sat in named `retain*` helpers directly above it, so the pattern looked established, while the other path reached the same writer through a differently-named local with no helper call whose absence anyone would notice.

**Why `regenerateConfigTypes` is necessary:** A global-scope install would otherwise overwrite each project's import-form types with the standalone form. `e2e/lifecycle/project-tracking-propagation.e2e.test.ts` pins both halves — the project's `config-types.ts` must still be the import-and-extend form after a `cc edit` at `$HOME`, and it must differ from the pre-edit bytes, so a propagation that never fired cannot pass the assertion vacuously.

**The propagation guard depends on the merge preserving `projects`:** `mergeConfigs()` in `src/cli/lib/configuration/config-merger.ts` carries the field forward (`if (existingConfig.projects && !newConfig.projects) merged.projects = existingConfig.projects`), so a HOME-context edit still reaches `writeScopedFromWizard` with a populated `finalConfig.projects` for `if (finalConfig.projects?.length)` to fire on.

## Propagated-Project Agent Recompile

`propagateGlobalChangesToProjects` rewrites each registered project's `config.ts` and `config-types.ts` but still does not itself recompile that project's `.claude/agents/<name>.md`. **Its caller inside the gate does** — that is no longer the command's job:

1. `applyConsequences` (`config-gate/index.ts`) drives both steps for a T1 change: `propagateGlobalChangesToProjects(...)` then `recompilePropagated(propagated.updated)`. The **home** branch propagates whenever `finalConfig.projects` is non-empty (no change gate beyond the tier — a home write is always a global write); the **project** branch propagates when the classified change is T1 or T2 and `effectiveGlobalConfig.projects?.length`. `reconcileTypesFromDisk` at `$HOME` (the `compile` path) propagates unconditionally, since a hand-edited config offers nothing to classify against.
2. `recompilePropagated` (`config-gate/recompile.ts`) lazily imports the operation below, because a static `lib → operations` import would form a load-time cycle.
3. `recompilePropagatedProjectAgents` (`operations/project/recompile-project-agents.ts`) loops **sequentially** over the dirs, calling `recompileRegisteredProjectAgents(dir)` inside a try/catch, and returns `PropagatedRecompileSummary { rewrittenCount, unchangedCount, failedCount, warnings }` — which becomes `GateReport.recompile`.
4. `writeProjectConfig()` surfaces the whole report as `ConfigWriteResult.propagation`; `init.tsx`, `edit.tsx`, `compile.ts` and `uninstall.tsx` **render** it. Nothing they can forget leaves an agent stale.
5. `recompileRegisteredProjectAgents(dir)` runs `discoverInstalledSkills(dir)` + `loadAgentDefs()`, then `compileAgents({ scopeFilter: "project", outputDir: resolveInstallPaths(dir, "project").agentsDir, skills: allSkills, ... })`. `loadAgentDefs` takes no `dir`: agent partials always come from the CLI's own installation, so `sourcePath` is `PROJECT_ROOT` whichever project is being recompiled.

Contract points:

- **Project scope only.** The global agents were already recompiled by the triggering operation's own pass; a per-project global pass would rewrite `~/.claude/agents` once per registered project for no gain.
- **`skills` is passed explicitly.** Without it `recompileAgents` falls back to `discoverAllPluginSkills`, which sees plugin skills only and would silently strip every global-local and project-local skill from the compiled agents.
- **Agent partials always come from the CLI** — `getLocalAgentDefinitions()` returns `sourcePath: PROJECT_ROOT`, so no per-project marketplace source resolution is needed.
- **Failure isolation.** A thrown error becomes `failedCount++` plus a `Could not recompile agents in <dir>: <reason>` warning; a non-empty `result.failed` also counts as failed and forwards that result's warnings. Neither aborts the loop.
- Because the pass is scope-filtered, it does **not** prune stale agents.

## Agent Loading Flow

```
1. loadAgentDefs()  (operations/project/load-agent-defs.ts)
   |
   +-> getAgentDefinitions()  (agents/agent-fetcher.ts)
   |   Called with no argument, so always getLocalAgentDefinitions()
   |   Returns AgentSourcePaths { agentsDir, sourcePath } where sourcePath === PROJECT_ROOT
   |
   +-> loadMergedAgents(sourcePath)  (loading/loader.ts)
       Loads in parallel via Promise.all:
         loadAllAgents(PROJECT_ROOT)  -> built-in CLI agents
         loadAllAgents(sourcePath)    -> the same directory, because sourcePath IS PROJECT_ROOT
       Each globs **/metadata.yaml and parses with agentYamlConfigSchema
       Merge: { ...cliAgents, ...sourceAgents }
       The merge is real and degenerate: one caller, one directory, one answer
```

`loadMergedAgents` is a general primitive and would merge a marketplace's own `src/agents/` if
handed one, but `loadAgentDefs` is its only production caller and answers the CLI's own root as the
"source" — so the merge is CLI-only in practice.

### Which definitions feed a generated `config-types.ts`

**CLI-only, from `loadAgentDefs`, on every path** (owner ruling 2026-08-21). The emitted
`AgentName` union asks each name whether the loaded roster DECLARES it, and answers by sectioning
the union under `// Custom` or `// Marketplace`; `SelectedAgentName` and `ProjectAgentName` are
narrowed from the config's own rows. So a roster that included a marketplace's sub-agents would
mark the same name differently depending on which command wrote the file, and would admit a
literal that nothing downstream can honour: agent partials resolve under `getLocalAgentDefinitions`
and `AGENT_NAMES` is generated by `scripts/generate-source-types.ts` from the CLI's `src/agents/`
alone.

| Producer                                             | How it reaches the emitted unions                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `writeProjectConfig` (`operations/project/`)         | `init` and `init --from`; hands `agents` to `writeScopedFromWizard`       |
| `edit.tsx`                                           | one `loadAgentDefs()`, passed to `writeProjectConfig` as `agentDefs`      |
| `compile.ts`                                         | `loadAgentDefsOrFail()` -> `reconcileTypesFromDisk`'s `deps.agents`       |
| `uninstall.tsx`                                      | the `agents` half of its global propagation data                          |
| `lazyGateDeps` (`config-gate/index.ts`)              | loaded only when classification says the write regenerates types          |
| `loadConfigTypesDataInBackground` (`configuration/`) | loads the MATRIX from the marketplace and the roster from `loadAgentDefs` |

`src/cli/lib/__tests__/config-types-agent-defs-agree.test.ts` is the gate: it rosters every
production module that reads sub-agent definitions off disk, states each one's posture, and asserts
the roster against a walk of `src/cli` — so a new producer cannot land unjudged.

## Related Documentation

- [Compilation Pipeline](./compilation-pipeline.md) -- Full compilation flow including skills
- [Configuration](./configuration.md) -- `generateProjectConfigFromSkills`, scope split, config I/O
- [Operations Layer](./operations-layer.md) -- `compileAgents` / `compileAgentsAllScopes` / `recompileRegisteredProjectAgents` wrapping `recompileAgents` (there is no `installOperation`; that name never existed in `src/cli/lib/operations/`)
- [Plugin System](./plugin-system.md) -- How skills are discovered and assigned to agents
- [Wizard Flow](./wizard-flow.md) -- How agents are selected in the wizard (DOMAIN_AGENTS, selection grid)
- [Type System](../type-system.md) -- AgentName union type and generated types
- [Store Map](../store-map.md) -- `toggleAgent` / `toggleAgentScope` actions, `agentConfigs` / `selectedAgents` / `installedAgentConfigs` state, agent scope predicates
- [Guard Pattern](../concepts/guard-pattern.md) -- Global Agent Toggle Guard (`isActiveGlobal`) and the two dual-scope branches that run before it (SPACE is inert on a live `[P][G]`; `restoreDualScopeAgent` rebuilds the pair on re-select; `s`/`toggleAgentScope` is the sole collapse)
- [Tombstone Pattern](../concepts/tombstone-pattern.md) -- `applyAgentToggle`, `collectTombstones`, dual-scope `[P][G]` collapse/restore mechanics

## Invariants Worth Restating

- **`selectedAgents` and `agentConfigs` may disagree** (excluded tombstones). Derive the active
  agent set from `agentConfigs.filter((a) => !a.excluded)`, never from `selectedAgents`.
- **Every bare `{ scope: "global", excluded: true }` entry is machine-derived**, so
  `dropOrphanedDerivedMasks` / `dropOrphanedDerivedAgentMasks` retain a mask if and only if the
  collision that would re-derive it still exists.
- **Both project-config write sites** (`propagateGlobalChangesToProjects` and the project branch of
  `writeScopedFromWizard`) call the shared `reconcileProjectSplitAgainstGlobal` immediately before
  the shared `writeProjectConfigPair`.
- **SPACE on a live `[P][G]` agent is inert**; the `[P][G] -> [G]` collapse is `toggleAgentScope`'s
  `s` toggle, and it lives in the `toggleAgent` action rather than the `applyAgentToggle` leaf
  helper.
