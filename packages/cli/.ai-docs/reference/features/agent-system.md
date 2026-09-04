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
    hooks,
    isolation,
  ]
related:
  - reference/features/compilation-pipeline.md
  - reference/features/skills-and-matrix.md
  - reference/features/configuration.md
  - reference/commands/index.md
  - reference/store-map.md
  - reference/concepts/guard-pattern.md
  - reference/concepts/tombstone-pattern.md
last_validated: 2026-09-03
---

# Agent System

## Overview

**Purpose:** Agent template system that defines AI agent roles, compiles partial markdown files into full prompt documents via LiquidJS, and maps agents to wizard domains.
**Entry Point:** `src/agents/` (agent source files), `src/cli/lib/compiler.ts` (compilation)
**Key Files:** 18 agents across 6 role directories, 1 main template, 1 methodology partial, 1 JSON schema

## File Structure

```
src/agents/
  _templates/
    agent.liquid                              # Main Liquid template: frontmatter + body assembly
    methodologies/
      operating-principles.liquid             # The sole partial — renders <operating_principles>
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

Constants defined in `packages/compile/src/paths.ts` (`STANDARD_FILES`) and re-exported by `src/cli/consts.ts`, which is where CLI code imports them from.

## Agent Inventory

### developer/ (4 agents)

| Agent           | Model | Tools                               | Description                                                     |
| --------------- | ----- | ----------------------------------- | --------------------------------------------------------------- |
| `ai-developer`  | opus  | Read, Write, Edit, Grep, Glob, Bash | AI features: RAG, agent loops, tool calling, prompt engineering |
| `api-developer` | opus  | Read, Write, Edit, Grep, Glob, Bash | Backend: API routes, DB operations, auth, middleware            |
| `cli-developer` | opus  | Read, Write, Edit, Grep, Glob, Bash | CLI: commands, interactive prompts, config hierarchies          |
| `web-developer` | opus  | Read, Write, Edit, Grep, Glob, Bash | Frontend: UI components, TypeScript, styling, client state      |

### meta/ (4 agents)

| Agent               | Model | Tools                                              | Description                                                       |
| ------------------- | ----- | -------------------------------------------------- | ----------------------------------------------------------------- |
| `agent-summoner`    | opus  | Read, Write, Edit, Grep, Glob, Bash                | Creates/improves sub-agents: source layout, template, frontmatter |
| `codex-keeper`      | opus  | Read, Write, Edit, Glob, Grep, Bash                | AI-focused reference documentation                                |
| `convention-keeper` | opus  | Read, Write, Edit, Grep, Glob, Bash                | Code quality and testing standards                                |
| `skill-summoner`    | opus  | Read, Write, Edit, Grep, Glob, WebSearch, WebFetch | Creates/improves every skill, technology and methodology alike    |

**The two summoners partition by artefact, not by subject matter.** `agent-summoner` owns sub-agents
and `skill-summoner` owns skills — including methodology skills, which its own description names, so
"technology skills" is not the boundary. Neither `metadata.yaml` claims the other's artefact.

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

| Agent      | Model | Tools                  | Description                                                                                              |
| ---------- | ----- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `reviewer` | opus  | Read, Grep, Glob, Bash | Reviews any diff — one severity-disciplined gate; domain knowledge arrives via `meta-reviewing-*` skills |

**`reviewer` declares neither `Write` nor `Edit`.** Its `metadata.yaml` carries the reason in a
comment: a reviewer that can repair what it finds produces a finding nobody else reads — the
severity call, the reproduction and the decision collapse into a diff — so reporting is the whole
job. **No bundled agent declares `isolation`.** The frontmatter supports the key and a worktree
would suit a reviewing role, but this repository does not use worktrees, so the narrowed tool grant
is the whole of the separation. The narrowed grant also puts `reviewer` on the read-only side of the
[completion-gate](#the-emitted-completion-gate) rule: an agent declaring neither `Write` nor `Edit`
gets no emitted completion-gate hook.

`reviewer` is the only reviewing agent. No per-domain reviewer name (`web-reviewer`, `api-reviewer`,
`cli-reviewer`, `ai-reviewer`, `infra-reviewer`) exists in `AGENT_NAMES`, under `src/agents/`, or as
a target a roster or a prompt can delegate to — a document or stack naming one names nothing. The
prompt carries the review PROCESS — severity discipline, the cost gate, a worked zero-issue APPROVE
— and the domain checklists live in the `meta-reviewing-*` skills, loaded per diff through the
activation protocol. `pm` stands the same way for planning, with the frameworks in
`meta-planning-*`.

### tester/ (4 agents)

| Agent        | Model | Tools                               | Description                                              |
| ------------ | ----- | ----------------------------------- | -------------------------------------------------------- |
| `ai-tester`  | opus  | Read, Write, Edit, Grep, Glob, Bash | AI tests: LLM mocking, prompt regression, eval harnesses |
| `api-tester` | opus  | Read, Write, Edit, Grep, Glob, Bash | Backend tests: API endpoints, DB operations, auth flows  |
| `cli-tester` | opus  | Read, Write, Edit, Grep, Glob, Bash | CLI tests: wizard flows, commands, keyboard interactions |
| `web-tester` | opus  | Read, Write, Edit, Grep, Glob, Bash | Frontend tests: component behavior, user flows           |

**Model distribution:** every bundled `metadata.yaml` declares a `model`, and every one of them
declares `opus` — the roster is uniform. Re-derive the distribution rather than trusting the Model
columns above:

```
grep -h '^model:' $(find src/agents -name metadata.yaml) | sort | uniq -c
```

A uniform roster costs the test suite something worth knowing about: no fixture installing the
shipped agents can distinguish "the resolver read this agent's metadata" from "it answered a
hardcoded `opus`", because both produce the same frontmatter. What such a spec still catches is a
default that is DROPPED — `agent.liquid` renders `model: {{ agent.model | default: "inherit" }}`,
so a lost default reads `inherit` rather than any declared value. The distinguishing coverage has
to live where the definitions are the spec's own, which is `resolver.test.ts` and its
`RESOLVE_AGENTS_DEFINITIONS` — pinned at `opus` today, so it does not draw the distinction either.

The tables above report what each `metadata.yaml` **declares**. Every compiled agent additionally
carries `Skill`, appended by `withSkillTool` — see the `tools` footnote under
[metadata.yaml Schema](#metadatayaml-schema).

**Tool patterns:**

- Read-only agents (the four researchers and `reviewer`): Read, Grep, Glob, Bash (no Write/Edit)
- Implementation agents (developers, testers, `pm`, `agent-summoner`, `codex-keeper`, `convention-keeper`): Read, Write, Edit, Grep, Glob, Bash
- `skill-summoner` is unique: has WebSearch and WebFetch instead of Bash

**13 of the 18 declare `Write` or `Edit` and 5 do not**, which is the split the emitted completion
gate keys on. Re-derive both sides with:

```
grep -lE '^\s+- (Write|Edit)$' $(find src/agents -name metadata.yaml)
grep -LE '^\s+- (Write|Edit)$' $(find src/agents -name metadata.yaml)
```

## metadata.yaml Schema

**JSON Schema:** `src/schemas/agent.schema.json` — **generated**, not hand-written; emitted from `agentYamlGenerationSchema` by `scripts/generate-json-schemas.ts` (see [code-generation.md](./code-generation.md))
**Zod Schema:** `agentYamlConfigSchema` in `src/cli/lib/schemas.ts` (the runtime loader schema; distinct from the `agentYamlGenerationSchema` that produces the JSON Schema above)
**TypeScript Type:** `AgentYamlConfig` in `src/cli/types/agents.ts`

| Field             | Type                                    | Required | Description                                                                                                  |
| ----------------- | --------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `id`              | `AgentName` (string)                    | Yes      | Agent identifier, matches directory name                                                                     |
| `title`           | `string`                                | Yes      | Display title (e.g., "CLI Developer Agent")                                                                  |
| `description`     | `string`                                | Yes      | Brief description for Task tool                                                                              |
| `model`           | `ModelName`                             | No\*     | `"sonnet"` / `"opus"` / `"haiku"` / `"fable"` / `"inherit"`                                                  |
| `effort`          | `EffortLevel`                           | No       | `"low"` / `"medium"` / `"high"` / `"xhigh"` / `"max"` — chain owned by `model-and-effort.md`                 |
| `tools`           | `string[]`                              | Yes      | Declared tool ALLOWLIST -- see below\*\*                                                                     |
| `disallowedTools` | `string[]`                              | No       | Tools this agent cannot use                                                                                  |
| `permissionMode`  | `PermissionMode`                        | No       | `"default"` / `"acceptEdits"` / `"dontAsk"` / `"bypassPermissions"` / `"plan"` / `"delegate"`                |
| `isolation`       | `AgentIsolation`                        | No       | The single literal `"worktree"` -- see below\*\*\*                                                           |
| `hooks`           | `Record<string, AgentHookDefinition[]>` | No       | Lifecycle hooks with optional matcher and actions -- see [the completion gate](#the-emitted-completion-gate) |
| `experimental`    | `{ cacheTtl?: CacheTtl }`               | No       | Experimental frontmatter options; `cacheTtl` is the only one Claude Code documents today                     |
| `outputFormat`    | `string`                                | No       | Which output format file to use                                                                              |
| `domain`          | `Domain`                                | No       | Domain for wizard grouping                                                                                   |
| `custom`          | `boolean`                               | No       | True for agents created outside built-in vocabulary                                                          |

Both schemas carry these keys; the JSON schema additionally permits a literal `$schema` key, which
no bundled file uses — they carry a `# yaml-language-server: $schema=...` comment on line 1 instead.
The Zod loader schema is a plain `z.object`, so an unknown key is dropped silently; the JSON schema
is `additionalProperties: false`, so an editor following that comment reports one. The JSON schema
is also the stricter of the two on the shared keys — `id`, `title` and `description` carry
`minLength: 1` and `tools` carries `minItems: 1`, where the Zod loader accepts an empty string and
an empty array.

\*`model` is optional in both the JSON schema (absent from its `required` list — `["id", "title", "description", "tools"]` — though constrained to the `ModelName` enum when present) and the Zod `agentYamlConfigSchema` (`modelNameSchema.exactOptional()`). `agent.liquid` defaults it to `"inherit"` at render time.

\*\*`tools` is an **allowlist, not a menu**: a sub-agent that declares the key gets only what it
names, and one that omits the key inherits every tool available to sub-agents. Enumerating tools is
therefore what opts an agent OUT of the default grant. `Skill` is a listable member of that
allowlist — Claude Code's sub-agent documentation shows `tools: Read, Grep, Glob, Bash, Edit, Write,
Skill`.

No bundled `metadata.yaml` names `Skill`. `withSkillTool` (`packages/compile/src/agent-source.ts`,
module-private) appends it inside `buildAgentTemplateContext`, so **every** compiled agent's
frontmatter carries `Skill` whatever its metadata declared — including the read-only researchers,
because loading a skill grants no write access. The append is idempotent (a definition already
naming `Skill` is returned by identity) and order-stable (declared tools keep their order, the grant
goes last), so compiling twice is a fixed point and the grant never reorders a declared list — and a
`metadata.yaml` that does name `Skill` is redundant rather than wrong.

\*\*\*`isolation` is a **union of one**: `AGENT_ISOLATIONS` in `src/cli/types/matrix.ts` is
`["worktree"]`, and `agentIsolationSchema` in `src/cli/lib/schemas.ts` reads it as
`z.enum(AGENT_ISOLATIONS)` — the bridge form its four siblings use, and the only one that moves with
the array; see [core-types.md](../types/core-types.md#agentisolation-srcclitypesmatrixts) for why a
`satisfies` clause over a literal did not. The absent case is deliberately not a member — an agent with no `isolation` shares
the session's working tree, which is the default the key opts out of — so the day a second mode is
documented the compiler names every site that has to decide about it. `agent.liquid` wraps the key
in `{% if agent.isolation %}`, so an unset agent emits no key at all.

**Declaring `skills:` does not grant the `Skill` tool.** The two keys are complementary and
independent: `skills:` preloads that skill's content into the agent's startup context, while the
`Skill` tool is what lets the agent invoke a skill at runtime. An agent can declare `skills:`, carry
the `<skill_activation_protocol>` instructing it to invoke the Skill tool, and still have no way to
load one.

**`ModelName`** defined in `src/cli/types/matrix.ts`: `"sonnet" | "opus" | "haiku" | "fable" | "inherit"`

Full resolution chain for `model` and its `effort` sibling — precedence against config overrides, the two compile-config builders, and why `effort` emits no key when unset: [model-and-effort.md](./model-and-effort.md).

**`PermissionMode`** defined in `src/cli/types/matrix.ts`: `"default" | "acceptEdits" | "dontAsk" | "bypassPermissions" | "plan" | "delegate"`

**`AgentIsolation`** defined in `src/cli/types/matrix.ts`: the single literal `"worktree"`.

**`CacheTtl`** defined in `src/cli/types/matrix.ts`: `"5m" | "1h"`. It is the sole member of
`experimental`'s `{ cacheTtl?: CacheTtl }` shape (`BaseAgentFields["experimental"]` in
`src/cli/types/agents.ts`).

**Field usage across the 18 bundled agents.** Every one declares `id`, `title`, `description`,
`model` and `tools`. Nothing bundled declares `effort`, `disallowedTools`, `permissionMode`,
`isolation`, `experimental`, `hooks`, `outputFormat`, `domain` or `custom`; the
schema supports them, and `loadAgentsFromDir` and `resolveAgents` carry every one of them from
`metadata.yaml` to the template, but no shipped agent sets them. Re-derive both halves with:

```
grep -l '^isolation:' $(find src/agents -name metadata.yaml)
grep -lE '^(effort|disallowedTools|permissionMode|hooks|experimental|outputFormat|domain|custom):' $(find src/agents -name metadata.yaml)
```

**Every optional field is spread CONDITIONALLY on the way through**, in both
`loadAgentsFromDir` (`src/cli/lib/loading/loader.ts`) and `resolveAgents`
(`src/cli/lib/resolver.ts`), and each carries a comment saying why. An explicit `undefined` is not
the same as an absent key here: `agent.liquid` branches on presence, so an emitted `hooks:
undefined` would render an empty frontmatter key. The gate does not ride on that: `prepareForRender`
composes it into `agent.hooks` via `withCompletionGate` on the data path, rather than the template
reaching it through an `{% elsif %}`, so spreading an explicit `undefined` into that merge changes
nothing for the gate — but the empty-key half is unchanged and the comments in both functions still
hold.

Each function has a paired spec — `describe("fields the template reads")` in `resolver.test.ts` and
its equivalent in `loader.test.ts`: one asserting a definition declaring every optional field
arrives with all of them, and one asserting an absent field stays absent rather than arriving as an
explicit `undefined`. The loader's roster is `model`, `effort`, `disallowedTools`,
`permissionMode`, `isolation`, `hooks`; the resolver's is the last four, since `model` and `effort`
reach it through `agentConfig.X ?? definition.X` and are covered by the precedence specs beside
it.

**Nothing mechanically catches a NEW field being dropped.** Both rosters are literal key lists
inside the test files, so a seventh key added to `agentYamlConfigSchema` and forgotten in either
function type-checks, lints and passes — the schema is the only place the full key set is stated,
and neither function nor either spec is derived from it. Adding a field to the schema means adding
it to `loadAgentsFromDir`, to `resolveAgents`, to `agent.liquid`, and to both rosters, by hand.

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
| 3        | `{PROJECT_ROOT}/src/agents/_templates/`       | Built-in templates      |

`src/agents/` is published directly AND copied to `dist/src/agents/` by tsup's `onSuccess`; the copy is a hedge against `CLI_ROOT` resolving to `<pkg>/dist`. See [build-and-packaging.md](../build-and-packaging.md).

Engine config: `.liquid` extension, `strictVariables: false`, `strictFilters: true`.

### Main Template: agent.liquid

**File:** `src/agents/_templates/agent.liquid`

The template assembles a compiled agent prompt in this order:

```
1. YAML frontmatter, in emission order
   - name
   - description              (always; `| json`, so a description containing a colon,
                              a `#` or a leading dash stays valid YAML)
   - tools                    (always; joined with ", " — always carries Skill)
   - disallowedTools          (conditional: size > 0)
   - model                    (always; `| default: "inherit"`)
   - effort                   (conditional: {% if agent.effort %})
   - permissionMode           (always; `| default: "default"`)
   - isolation                (conditional: {% if agent.isolation %})
   - experimental             (conditional: {% if agent.experimental %}, `| json`)
   - hooks                    (conditional: {% if agent.hooks %}, `| json` — carries the
                              completion gate whenever `prepareForRender` composed one in via
                              `withCompletionGate`, before the template ever sees `agent.hooks`)
   - skills                   (conditional: preloadedSkillIds.size > 0)

2. Provenance marker — an HTML comment on the first body line, stamped after
   the render by stampProvenanceMarker() rather than emitted by the template

3. # {{ agent.title }}

4. <role>{{ identity }}</role>

5. <operating_principles>  — one {% render %} of methodologies/operating-principles

6. <critical_requirements> (conditional: criticalRequirementsTop non-empty)

7. {{ playbook }} (agent-specific workflow)

8. <critical_reminders> (conditional: criticalReminders non-empty)

9. {{ output }} (conditional: output non-empty)

10. <system-reminder> — the trailing volatile block, and the last thing in the file
    - "Compiled by {{ generatorVersion }}."
    - exactly one of three branches:
        <skill_activation_protocol>  when dynamicSkills.size > 0
        <skills_note>                when there are none but preloadedSkillIds.size > 0
        <skills_note>                when neither — "No skills are configured for this agent"
```

**The body is split into a stable prefix and a volatile suffix, and the split is the point.** A
compiled agent IS a sub-agent's system prompt, so everything before the `<system-reminder>` is the
cacheable prompt prefix of every invocation of that agent. The two things that move independently
of the agent's role — the generator version and the per-install skill roster — are the only things
inside the block, so a release bump or a skill added to one agent's stack invalidates nothing
above it. `agent-baseline-is-slim-and-positively-framed.test.ts` is what catches a regression: it
asserts the compiled body closes with the volatile block and nothing follows it, and that the
generator version appears inside the block and nowhere in the prefix.

**The list above is exhaustive.** The rendered body carries no `<core_principles>` block, no
`<methodologies>` wrapper, no `## Standards and Conventions` heading, and no instruction lines
after `<critical_reminders>` — everything between `<role>` and the trailing block is items 5
through 9 above and nothing else. The whole baseline is the one `<operating_principles>` partial,
in ordinary prose rather than numbered principles. `<skill_activation_protocol>` is one paragraph
plus a bullet per skill (id, description, invoke command, usage), and it lives inside the trailing
block rather than mid-body because the per-install skill roster is volatile.

### The Emitted Completion Gate

**Owned by [`compilation-pipeline.md` § the emitted frontmatter](./compilation-pipeline.md)** — the
`withCompletionGate` merge, the `COMPLETION_GATE_COMMAND` shell line, why it is a stop hook rather
than a sentence in a prompt, why the emitted key is `Stop` where the log says `SubagentStop`, why a
project-scope install can have its hooks skipped entirely, and why it is inert in a project with no
npm. What belongs
here is the AGENT side of it: which of the eighteen bundled agents get one, and what a
`metadata.yaml` does to change that.

`hooks` is the only frontmatter key an agent can receive without declaring anything, so a bundled
`metadata.yaml` puts itself in one of four states:

| What the `metadata.yaml` does                                      | What the compiled agent carries                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| declares `Stop` or `SubagentStop`, and `tools` names Write or Edit | its own — **a stated gate replaces the emitted one**                |
| declares only NON-gate events, and `tools` names Write or Edit     | the gate **and** what it declared, merged per event                 |
| no gate declared, and `tools` names Write or Edit                  | a `Stop` hook running `COMPLETION_GATE_COMMAND`                     |
| neither Write nor Edit                                             | exactly what it declared, and no `hooks:` key when it declared none |

The merge is per EVENT, so a project's completion gate is its own to state and nothing else it
declares costs it one: an agent wanting a formatter alongside the standard checks writes the
formatter and keeps the gate, and an agent meaning to own its checks declares a stop hook
specifically. **Both stop spellings count as declaring one**, because Claude Code converts a
frontmatter `Stop` to `SubagentStop` when it registers a sub-agent's hooks — they are one event on
that path, so the compile must not emit its own beside a project's. **13 of the 18 bundled agents receive the emitted gate** — every one but the four
researchers and `reviewer`, none of which declares `Write` or `Edit`. No bundled agent declares
`hooks` at all, so no bundled agent is in the first two rows. The two `grep` invocations that derive
both sides of the split are under [Agent Inventory](#agent-inventory).

**The first row alone is not the whole rule.** A `metadata.yaml` that declares only non-gate events
— a `PostToolUse` formatter, say — does not fall into the first row: it keeps the emitted gate
merged in beside what it declared, which is the second row's whole point.

**Two facts about the emitted gate belong to the agent side and are owned in
[`compilation-pipeline.md`](./compilation-pipeline.md):** the key it emits is `Stop`, which Claude
Code converts to `SubagentStop` when it registers a sub-agent's hooks — so a compiled agent reads
`Stop:` while a log says `SubagentStop`, and both are correct. And the gate only RUNS at project
scope in a project whose trust dialog was accepted; at global scope the trust check passes unconditionally, though `disableAllHooks` and the stop-hook block cap still apply — `compilation-pipeline.md` carries both. Both were read
out of the shipped binary at 2.1.259 on 2026-09-03 rather than from documentation.

**Narrowing an agent's `tools` therefore silently changes what stops it.** Dropping `Write` and
`Edit` from a `metadata.yaml` — which is a statement about capability — also removes that agent's
completion gate, because the gate keys on exactly those two tool names. That is correct for a
reviewer, which has nothing to typecheck, and it is a trap for any narrowing done for another
reason.

### Template Variables

| Variable                  | Source                                   | Type                                    |
| ------------------------- | ---------------------------------------- | --------------------------------------- |
| `agent.name`              | `AgentConfig.name`                       | `string`                                |
| `agent.description`       | `AgentConfig.description`                | `string`                                |
| `agent.title`             | `AgentConfig.title`                      | `string`                                |
| `agent.tools`             | `AgentConfig.tools`, `Skill` appended    | `string[]`                              |
| `agent.disallowedTools`   | `AgentConfig.disallowedTools`            | `string[]`                              |
| `agent.model`             | `AgentConfig.model`                      | `ModelName`                             |
| `agent.effort`            | `AgentConfig.effort`                     | `EffortLevel`                           |
| `agent.permissionMode`    | `AgentConfig.permissionMode`             | `PermissionMode`                        |
| `agent.isolation`         | `AgentConfig.isolation`                  | `AgentIsolation`                        |
| `agent.experimental`      | `AgentConfig.experimental`               | `{ cacheTtl?: CacheTtl }`               |
| `agent.hooks`             | `AgentConfig.hooks` merged with the gate | `Record<string, AgentHookDefinition[]>` |
| `identity`                | Content of `identity.md`                 | `string`                                |
| `playbook`                | Content of `playbook.md`                 | `string`                                |
| `output`                  | Content of `output.md`                   | `string`                                |
| `criticalRequirementsTop` | Content of `critical-requirements.md`    | `string`                                |
| `criticalReminders`       | Content of `critical-reminders.md`       | `string`                                |
| `preloadedSkillIds`       | Skill IDs for frontmatter                | `(SkillId \| PluginSkillRef)[]`         |
| `dynamicSkills`           | Skills loaded via Skill tool             | `Skill[]`                               |
| `preloadedSkills`         | Preloaded skills in full — unrendered    | `Skill[]`                               |
| `generatorVersion`        | `renderAgent`'s `version` argument       | `string`                                |

**`generatorVersion` is the only row that is not a field of `CompiledAgentData`.** Every other row is
spread from the sanitized `CompiledAgentData`; this one is added by `renderAgent` at the call to
`engine.renderFile`. It is an ARGUMENT rather than a read, because the CLI takes it from its own
`package.json` via `cliVersion()` and a browser has no manifest to read — the editor's preview passes
`CORPUS_CLI_VERSION`, the release its vendored corpus was cut at.

**There is no `completionGateCommand` variable.** The gate is composed into `agent.hooks` on the
data path, by `prepareForRender` via `withCompletionGate`, rather than reached through a template
`{% elsif %}` — so the command reaches the template inside `agent.hooks`, having passed
`sanitizeHooks` like any other hook.

### Compilation Flow

**The CLI has one agent-render entry point:** `compileAgentForPlugin()` in
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
   - withSkillTool(agent) appends "Skill" to agent.tools unless already present
   - mapSkill spreads pluginRefFor(skill) onto each skill, attaching pluginRef (-- see below)
   - split skills into preloaded (s.preloaded) and dynamic
   - preloadedSkillIds = preloadedSkills.map(s => s.pluginRef ?? s.id)
4. renderAgent(engine, data, await cliVersion()) does the rest, all of it:
     - prepareForRender(data) composes the gate into agent.hooks, then sanitizes:
         sanitizeCompiledAgentData({...data, agent: withCompletionGate(data.agent)})
     - adds generatorVersion (sanitized) to the render data
     - engine.renderFile("agent", ...) -> rendered markdown
     - stampProvenanceMarker(rendered)   -- no version argument
```

`compileAgentForPlugin` never calls the sanitiser itself; `renderAgent` owns it, which is what
makes the sanitised render unbypassable from either front door.

**Both front doors render through `renderAgent`** (`packages/compile/src/agent-source.ts`) — this
one and the editor's `packages/compile/src/preview.ts` — so no path writes a compiled agent this
CLI cannot later recognise as its own. The marker is an HTML comment on the first line after the
frontmatter — deliberately not a frontmatter key, because Claude Code's tolerance of unknown keys is
undocumented. Full contract: [`compilation-pipeline.md` § The Provenance Marker](./compilation-pipeline.md).

**The marker carries no version.** `provenanceMarker()` and `stampProvenanceMarker(content)` both
take no arguments, and the marker's bytes are constant across releases — a constraint, not an
accident. The marker is the first cacheable byte of every invocation of a sub-agent, so anything
release-varying in it invalidates the prompt prefix of all eighteen agents on every publish, for a
string nothing reads back. The version travels as `generatorVersion` inside the trailing
`<system-reminder>` block instead, where a change to it costs nothing. Two properties keep older
files readable: `hasProvenanceMarker` matches on SHAPE
(`startsWith(MARKER_OPEN) && endsWith(MARKER_CLOSE)`) rather than on exact text, so an agent
compiled by any release is recognised by any other; and `stampProvenanceMarker` is idempotent by
REPLACEMENT rather than insertion, so a file on disk whose marker spells a version is rewritten to
the constant form rather than gaining a second marker beside it.

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

Per-agent failures are collected as `AgentWriteOutcome[]`; the caller owns the policy — `recompileAgents` reports and continues. `writeCompiledAgentsByScope` performs **no structural validation** of what it writes, and no module in the CLI does it either — the validators that once did it for no caller were reaped, so `grep -rn 'validateCompiledAgent' src` is the check and it returns nothing.

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

**Function:** `pluginRefFor(skill)` -- exported from `packages/compile/src/agent-source.ts`, which `src/cli/lib/compiler.ts` imports and the editor's `output-preview.ts` imports directly. Guards on `EJECT_SOURCE` (`"eject"`, from `packages/compile/src/paths.ts`, which `src/cli/consts.ts` re-exports for CLI callers), and returns a spreadable partial -- `{}` for an ejected skill, so no `pluginRef` key is attached at all.

**Rule:** Each skill's own `source` field on its `SkillReference` decides its rendered form in the compiled agent's `skills:` frontmatter. (`SkillReference.source` is the compiler-side name for what `SkillConfig` calls `origin`; `buildCompileAgents` threads one onto the other.) A skill renders as `${id}:${id}` (plugin form) only when its source is an explicit non-eject marketplace identifier. `undefined` source (user-authored local skills with no `SkillConfig` entry) and `"eject"` both render as bare `id` (eject form).

| `skill.source` value   | Rendered form in frontmatter |
| ---------------------- | ---------------------------- |
| `undefined`            | `${id}` (bare)               |
| `"eject"`              | `${id}` (bare)               |
| `"<marketplace-name>"` | `${id}:${id}` (plugin form)  |

**Implication:** Mixed-mode agents (some skills ejected, some installed as plugin from a marketplace) render a mixed-form `skills:` array. There is no uniform-`installMode` plumbing: `RecompileAgentsOptions` carries no `installMode` field and `compileAgentForPlugin` accepts none -- per-skill `source` is the sole authority.

**E2E coverage:** `e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts`.

### Sanitization

**Function:** `sanitizeCompiledAgentData()` — declared in `packages/compile/src/agent-source.ts`, re-exported by `src/cli/lib/compiler.ts`
**Pattern:** `LIQUID_SYNTAX_PATTERN = /\{\{|\}\}|\{%|%\}/g` — module-private in that package module, exported by nothing

Strips Liquid delimiters from user-controlled **metadata** fields:

- `agent.name`, `agent.title`, `agent.description`
- `agent.tools[]`, `agent.disallowedTools[]`
- `agent.model`, `agent.effort`, `agent.permissionMode`, `agent.isolation`
- `agent.experimental` (via `sanitizeExperimental`)
- `agent.hooks` (via `sanitizeHooks`)
- Per-skill `id`, `description`, `usage`, `pluginRef` (via `sanitizeSkills`), across all three of
  `skills`, `preloadedSkills` and `dynamicSkills`
- `preloadedSkillIds[]`

`generatorVersion` is sanitized too, but at the `renderAgent` call rather than here — it is not a
field of `CompiledAgentData`, so `sanitizeCompiledAgentData` never sees it.

**The list above is exhaustive by construction, and its omissions are silent.** The function is a
spread followed by overrides — `...data.agent` copies the whole definition through, and each
rendered field is then named in a conditional spread that replaces it. `sanitizeHooks`,
`sanitizeExperimental` and `sanitizeSkills` are the same shape one level down. So a field the
template renders and the sanitiser does not name is not left `undefined` and produces no type error;
it is forwarded verbatim, and only the rendered output shows it. `hooks` and `experimental` both
reached the template before they reached this list. Adding a frontmatter key to `agent.liquid`
therefore obliges a line here in the same change.

**`sanitizeHooks` covers the one part of a definition that renders as an EXECUTABLE.** A
stop hook's `command` is a shell line Claude Code runs when the sub-agent finishes, and
an agent definition can arrive from a marketplace, so those strings are as author-controlled as
`agent.name` beside them. `sanitizeHooks` walks the record and strips Liquid syntax from the event
name, each definition's `matcher`, and each action's `type`, `command`, `script` and `prompt` —
`type` unconditionally, the other three spread only when present so an absent one is not
materialised as `undefined`. This is
not a substitute for trusting the source — a marketplace whose agents you compile can name any
command it likes, which is a property of installing an agent rather than of this function. What it
closes is the narrower hole of a hook string carrying template syntax into a render.

**Content fields are passed through unchanged** -- `identity`, `playbook`, `output`, `criticalRequirementsTop`, `criticalReminders`, and each skill's `content`. LiquidJS does not re-evaluate template syntax inside variable values, so double-curlies in content (e.g. GitHub Actions `${{ secrets.X }}`) are safe.

## Methodology Templates

**Directory:** `src/agents/_templates/methodologies/` — **one file.**

| Template                      | XML Tag                  | Purpose                                                                                           |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `operating-principles.liquid` | `<operating_principles>` | The whole baseline: reading, re-derivation and corrections, matching, class census, and carry-out |

It is rendered by the single `{% render "methodologies/operating-principles" %}` in `agent.liquid`
and is therefore in every compiled agent. There is no unrendered partial: the directory holds
exactly the file the template names, so `ls src/agents/_templates/methodologies/` is the roster.

**Its five paragraphs are the baseline, in ordinary prose**, each opening with a bolded imperative:

| Opening                                               | What it binds                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work from what you have read.                         | Open the files a task names before claiming anything about them; name a file you need and have not got                                                                                                                                                                                                                       |
| Treat a specification as a claim.                     | Re-derive every path, symbol, signature and count; stop on an item the tree does not match and report it with the command and its output — **never inventing work to make the instruction true, and never quietly widening it**. Corrections are a required report field, written out as "nothing" when nothing proved false |
| Match what is already there.                          | Reach for the existing utility, pattern or shape; a new abstraction earns its place by being asked for                                                                                                                                                                                                                       |
| Change what the task names.                           | Census the class a defect belongs to and state the search and its result, including an empty one; name the test, type or check that would catch a future violation, or say plainly that nothing would                                                                                                                        |
| Carry three things out of every task, in your report: | Decisions and why, gotchas hit, and work deliberately left with what stopped it — a project gets the files it asked for and no others                                                                                                                                                                                        |

The last row is why a compiled agent's own prose routes a finding through its report rather than to
disk. `reviewer`'s `Findings Capture` section says so outright — an anti-pattern, a missing standard
or convention drift travels back inside the review under the severity it earns — and it has no
choice, because its grant carries no `Write` or `Edit`; see [Agent Inventory](#agent-inventory).

`agent-baseline-is-slim-and-positively-framed.test.ts`
(`src/cli/lib/__tests__/`) is what holds the shape: it asserts the baseline stays within a byte
budget, states what to do rather than what to refrain from, and carries its emphasis in ordinary
sentences.

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
| `AgentIsolation`      | `types/matrix.ts`                 | Union of one: `"worktree"`                             |

## Key Functions

| Function                             | File                                                                                         | Signature                                                                                                                                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadAllAgents()`                    | `lib/loading/loader.ts`                                                                      | `(projectRoot: string) => Promise<Partial<Record<AgentName, AgentDefinition>>>`                                                                                                                                                             |
| `loadProjectAgents()`                | `lib/loading/loader.ts`                                                                      | `(projectDir) => Promise<Partial<Record<AgentName, AgentDefinition>>>`                                                                                                                                                                      |
| `readAgentFiles()`                   | `lib/compiler.ts` (file-local)                                                               | `(name, agent, projectRoot) => Promise<AgentFiles>`                                                                                                                                                                                         |
| `buildAgentTemplateContext()`        | `@workspace/compile/agent-source` (re-exported by `lib/compiler.ts`)                         | `(name, agent, files, mapSkill?) => CompiledAgentData`                                                                                                                                                                                      |
| `sanitizeCompiledAgentData()`        | `@workspace/compile/agent-source` (re-exported by `lib/compiler.ts`)                         | `(data: CompiledAgentData) => CompiledAgentData`                                                                                                                                                                                            |
| `compileAgentForPlugin()`            | `lib/compiler.ts`                                                                            | `(name, agent, fallbackRoot, engine) => Promise<string>`                                                                                                                                                                                    |
| `pluginRefFor()`                     | `@workspace/compile/agent-source` (not re-exported)                                          | `(skill: Skill) => { pluginRef?: PluginSkillRef }`                                                                                                                                                                                          |
| `renderAgent()`                      | `@workspace/compile/agent-source` (not re-exported)                                          | `(engine, data, version) => Promise<string>` — the one render path both entry points take; `version` is an argument because a browser has no manifest to read                                                                               |
| `writeCompiledAgentsByScope()`       | `lib/agents/write-compiled-agents.ts`                                                        | `(params) => Promise<AgentWriteOutcome[]>` (per-scope compile + write loop)                                                                                                                                                                 |
| `listCompiledAgentNames()`           | `lib/agents/list-compiled-agents.ts`                                                         | `(agentsDir: string) => Promise<AgentName[]>` (compiled `.md` filenames minus extension; backs `resolveAgentNames` priority 4)                                                                                                              |
| `listAgentMdFiles()`                 | `lib/agents/list-compiled-agents.ts`                                                         | `(agentsDir: string) => Promise<string[]>` (`*.md` glob; also used by `doctor`, `content-validator`, `uninstall`, `agent-plugin-compiler`)                                                                                                  |
| `pruneStaleCompiledAgents()`         | `lib/agents/list-compiled-agents.ts`                                                         | `(agentsDir: string, keep: ReadonlySet<AgentName>) => Promise<void>` (stale-agent prune)                                                                                                                                                    |
| `compileAgents()`                    | `lib/operations/project/compile-agents.ts`                                                   | `(options: CompileAgentsOptions) => Promise<CompilationResult>` (recompile wrapper + prune)                                                                                                                                                 |
| `compileAgentsAllScopes()`           | `lib/operations/project/compile-agents-all-scopes.ts`                                        | `(options: CompileAllScopesOptions) => Promise<CompilationResult>` (multi-pass driver)                                                                                                                                                      |
| `recompileRegisteredProjectAgents()` | `lib/operations/project/recompile-project-agents.ts`                                         | `(projectDir: string) => Promise<CompilationResult>`(project scope only)                                                                                                                                                                    |
| `recompilePropagatedProjectAgents()` | `lib/operations/project/recompile-project-agents.ts`                                         | `(projectDirs: string[]) => Promise<PropagatedRecompileSummary>`(per-project failure isolation)                                                                                                                                             |
| `reconcileTypesFromDisk()`           | `lib/config-gate/index.ts`                                                                   | `(projectDir, config, deps, opts?) => Promise<GateReport>` (scope-correct `config-types.ts` refresh; used by `compile`; fans out at `$HOME`)                                                                                                |
| `recompileAgents()`                  | `lib/agents/agent-recompiler.ts`                                                             | `(options: RecompileAgentsOptions) => Promise<RecompileAgentsResult>`                                                                                                                                                                       |
| `buildAgentScopeMap()`               | `lib/installation/local-installer.ts`                                                        | `(config: ProjectConfig) => Map<AgentName, SkillScope>`                                                                                                                                                                                     |
| `filterExcludedEntries()`            | `lib/agents/agent-recompiler.ts`                                                             | `(config: ProjectConfig) => ProjectConfig`                                                                                                                                                                                                  |
| `shouldIncludeTriple()`              | `@workspace/compile/seed-to-config` (module-private)                                         | `(agent, category, skillId, inputs) => boolean`                                                                                                                                                                                             |
| `buildAgentStack()`                  | `@workspace/compile/seed-to-config` (module-private)                                         | `(agent, inputs) => StackAgentConfig \| undefined`                                                                                                                                                                                          |
| `scopeEligibilityKey()`              | `@workspace/compile/seed-to-config` (re-exported by `lib/configuration/config-generator.ts`) | `(agent, skillId) => string` (key builder)                                                                                                                                                                                                  |
| `isScopeCompatible()`                | `@workspace/compile/seed-to-config` (module-private)                                         | `(skillId, agent, skillScope, agentScope) => boolean`                                                                                                                                                                                       |
| `propagateGlobalChangesToProjects()` | `lib/config-gate/propagate.ts`                                                               | `(globalConfig, agents, currentProjectDir?, options?) => Promise<PropagationResult>` — **no catalogue parameter**; each project's own is loaded per project by `withCatalogueSeatedFor`. `options.regenerateTypes: false` is the T2 fan-out |
| `mergeGlobalConfigs()`               | `lib/config-gate/propagate.ts`                                                               | `(existing, incoming) => {config, changed}` (dedup-merge)                                                                                                                                                                                   |
| `createLiquidEngine()`               | `lib/compiler.ts`                                                                            | `(projectDir?) => Promise<Liquid>`                                                                                                                                                                                                          |
| `sanitizeLiquidSyntax()`             | `@workspace/compile/agent-source` (re-exported by `lib/compiler.ts`)                         | `(value, fieldName) => sanitized string`                                                                                                                                                                                                    |
| `sanitizeHooks()`                    | `@workspace/compile/agent-source` (module-private)                                           | `(hooks) => hooks` — the only definition fields that render as an executable; called by `sanitizeCompiledAgentData`                                                                                                                         |
| `provenanceMarker()`                 | `@workspace/compile/agent-source`                                                            | `() => string` — **no argument**; the marker's bytes are constant across releases                                                                                                                                                           |
| `stampProvenanceMarker()`            | `@workspace/compile/agent-source`                                                            | `(content: string) => string` — **no version argument**; idempotent by replacement                                                                                                                                                          |
| `hasProvenanceMarker()`              | `@workspace/compile/agent-source`                                                            | `(content: string) => boolean` — matches on SHAPE and on POSITION (first body line), so a quoted marker further down is not provenance                                                                                                      |
| `getAgentDefinitions()`              | `lib/agents/agent-fetcher.ts`                                                                | `(remoteSource?: string) => Promise<AgentSourcePaths>` — the remote branch and its production-unreachability: [leaf-exports.md](../leaf-exports.md)                                                                                         |
| `loadAgentDefs()`                    | `lib/operations/project/load-agent-defs.ts`                                                  | `() => Promise<AgentDefs>` — no parameter; agent partials ship with the CLI, so the local branch is the only one it asks for                                                                                                                |

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

**Functions:** `pruneStaleAgentsForPass()` (file-local in `src/cli/lib/operations/project/compile-agents.ts`) -> `pruneCompiledAgents({ agentsDir, keep })` (`src/cli/lib/operations/project/remove-compiled-agents.ts`) -> `pruneStaleCompiledAgents(agentsDir, keep)` (`src/cli/lib/agents/list-compiled-agents.ts`) followed by `tidyEmptiedAgentsDir(agentsDir)`. The middle hop is what pairs the prune with the directory tidy, so a pass that removed the last compiled agent does not leave an empty `agents/` behind — and emptiness there is FILESYSTEM emptiness, so a hand-authored agent or any other user-owned file keeps the directory alive whatever a config says.

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

**Downstream propagation:** `propagateGlobalChangesToProjects(globalConfig, agents, currentProjectDir?)` iterates `globalConfig.projects` (registered project paths), skips the currently-installing project, and for each remaining project:

0. Seats that project's OWN catalogue. `propagateToProject` wraps every step below in `withCatalogueSeatedFor(projectPath, body)` (`src/cli/lib/loading/catalogue-seat.ts`), which loads the project's catalogue with `{ skipExtraSources: true, matrixOnly: true }`, hands it to the body as `catalogue`, and restores the caller's seat in a `finally`. **There is deliberately no catalogue PARAMETER on this function**, because a parameter beside a per-project seat could only ever be the wrong one — which is what every caller used to pass. A project whose catalogue cannot be loaded throws out of the load (deliberately outside the `try`, so there is no seat to restore) and lands in `skipped` through the loop's own catch.
1. Loads `existingProject.config`.
2. Reconciles the project's own entries against the now-current global data into a `projectSplit`:
   - `retainProjectOwnedSkills` / `retainProjectOwnedAgents` keep project-scoped entries and keep a global tombstone (`scope === "global" && excluded`) only while the masked global entry is still active — stale tombstones for a since-removed global item are dropped (Scenario C).
   - `retainReconciledStack` prunes stack assignments that reference a global skill removed at global scope (ids from `computeRemovedGlobalSkillIds`).
   - `reconcileProjectSplitAgainstGlobal` then self-heals and re-masks on BOTH axes. `dropOrphanedDerivedAgentMasks` (the agent mirror of `dropOrphanedDerivedMasks`) runs FIRST and drops a global agent tombstone that no longer has an active project-scoped agent of the same name to justify it, so the global agent becomes visible again instead of staying masked forever. `maskCollidingGlobalAgents` then re-derives a mask for every live global agent the project DOES own at project scope, producing the `[P][G]` pair. Self-heal before mask means a cleared collision is removed rather than immediately re-derived, and the producer's `alreadyTombstoned` guard only sees warranted tombstones. Agents have no categories, so identity is the only collision kind (skills additionally collide on exclusive categories).
3. Rewrites BOTH halves of the project's pair in one call — `writeProjectConfigPair(projectPath, projectSplit, globalConfig, matrix, agents)` — which emits `config.ts` with re-inlined global data and then `config-types.ts` via `regenerateConfigTypes()` with `buildConfigTypesBackgroundData(matrix, agents)` and `buildProjectTypesExtras(inlinedProjectView(projectSplit, globalConfig), matrix)`, so the types name every literal the sibling config holds. The import-from-global form is emitted, not the standalone-inlined one. **The writer's shape is unchanged, but on this path its `matrix` argument is the project's OWN seated catalogue** — the value `withCatalogueSeatedFor` handed the body — rather than the triggering command's. `reconcileAgainstGlobal` above takes the same value, and the config half's writer reads the seated singleton directly, so all three readers are on one catalogue.
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

**CLI-only, from `loadAgentDefs`, on every path.** The emitted
`AgentName` union asks each name whether the loaded roster DECLARES it, and answers by sectioning
the union under `// Custom` or `// Marketplace`; `SelectedAgentName` and `ProjectAgentName` are
narrowed from the config's own rows. So a roster that included a marketplace's sub-agents would
mark the same name differently depending on which command wrote the file, and would admit a
literal that nothing downstream can honour: agent partials resolve under `getLocalAgentDefinitions`
and `AGENT_NAMES` is generated by `scripts/generate-source-types.ts` from the CLI's `src/agents/`
alone.

| Producer                                     | How it reaches the emitted unions                                    |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `writeProjectConfig` (`operations/project/`) | `init` and `init --from`; hands `agents` to `writeScopedFromWizard`  |
| `edit.tsx`                                   | one `loadAgentDefs()`, passed to `writeProjectConfig` as `agentDefs` |
| `compile.ts`                                 | `loadAgentDefsOrFail()` -> `reconcileTypesFromDisk`'s `deps.agents`  |
| `uninstall.tsx`                              | the `agents` half of its global propagation data                     |
| `lazyGateDeps` (`config-gate/index.ts`)      | loaded only when classification says the write regenerates types     |

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
