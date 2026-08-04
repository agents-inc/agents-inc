# D-52: Expand `new agent` Command - Config Lookup + Compile-on-Demand

## Implementation Overview

Replace `loadMetaAgent` with a simple fallback chain: check the project's `config.yaml` for an existing agent-summoner (plugin or local install) and use it directly if found; if not, compile one on-demand from the CLI's built-in `src/agents/meta/agent-summoner/` partials. Output location is auto-detected — marketplace source directory → `src/agents/{name}/`, consumer project → `.claude-src/agents/{name}/`. No interactive destination prompt. Generic error on failure. About 2 files changed in the CLI repo; no skills repo changes needed.

## Summary of Changes (2026-02-26 Revision)

The `new agent` command resolves agent-summoner through a simple fallback chain: (1) check the project's `config.yaml` for an existing agent-summoner (plugin or local install), (2) if not found, compile one on-demand from the CLI's built-in `src/agents/meta/agent-summoner/` partials. Output location is auto-detected: marketplace source directory → `src/agents/{name}/`, consumer project → `.claude-src/agents/{name}/`. No interactive destination prompt. Generic error on failure.

---

## Open Questions (All Resolved)

1. **What source hosts the agent-summoner partials?**
   **RESOLVED:** Look for agent partials locally first (project's installed agents), then fall back to the CLI's own built-in `src/agents/` directory. The skills repo does NOT need to host agent-summoner — the CLI already has them.

2. **Should agent-summoner get project-specific skills during on-demand compilation?**
   **RESOLVED:** Check the project's `config.yaml` for an existing agent-summoner first. If one exists (whether installed as a plugin or locally), use it directly — no compilation needed. Only if no agent-summoner is found in config do we fall back to the CLI's built-in agent partials and compile one on-demand.

3. **How does the marketplace destination option interact with source resolution?**
   **RESOLVED:** No interactive destination prompt. Auto-detect based on context: if the user is working in a marketplace source directory, output to `{sourcePath}/src/agents/{name}/`. If working in a regular consumer project, output to `.claude-src/agents/{name}/`. No checkbox or `--destination` flag needed.

4. **What happens if compile fails (e.g., source unreachable, partials missing)?**
   **RESOLVED:** Generic failure message. No elaborate error suggestions or recovery hints.

---

## Current State Analysis

### How `new agent` works today

**File:** `src/cli/commands/new/agent.tsx`

The command flow is:

1. **Parse args/flags**: Requires `name` arg, optional `--purpose`, `--non-interactive`, `--refresh`, `--source` (inherited from `BaseCommand.baseFlags`).

2. **Check Claude CLI**: Calls `isClaudeCLIAvailable()` -- the command spawns `claude` with `--agents` to invoke the meta-agent, so it requires Claude CLI installed.

3. **Collect purpose**: If `--purpose` not provided, renders an Ink `PurposeInput` component for interactive text entry. Supports ESC to cancel.

4. **Resolve source**: Calls `resolveSource(flags.source, projectDir)` (precedence: flag > env > project > default).

5. **Load meta-agent** (`loadMetaAgent`): This is the critical function:

   ```
   loadMetaAgent(projectDir, sourceConfig.source, flags.refresh)
   ```

   It tries two locations:
   - **Local compiled agent**: `{projectDir}/.claude/agents/agent-summoner.md`
   - **Remote source compiled agent**: Calls `getAgentDefinitions(source, { forceRefresh, projectDir })`, then checks `{sourcePath}/.claude/agents/agent-summoner.md`

   If neither exists, throws: `"Agent 'agent-summoner' not found. Run 'compile' first to generate agents."`

6. **Parse compiled agent**: `parseCompiledAgent(content)` extracts frontmatter (description, model, tools) and body (prompt) from the compiled `.md` file using `gray-matter`.

7. **Build prompt**: `buildAgentPrompt(name, purpose, outputDir)` creates a structured prompt telling the meta-agent what to create.

8. **Invoke meta-agent**: `invokeMetaAgent(agentDef, prompt, nonInteractive)` spawns `claude --agents <json> --agent agent-summoner` with the parsed agent definition.

### Where agent-summoner source lives today

**Directory:** `src/agents/meta/agent-summoner/`

Files:

- `agent.yaml` (12 lines) -- id, title, description, model: opus, tools: Read/Write/Edit/Grep/Glob/Bash
- `intro.md` (835 bytes) -- Agent identity and modes
- `workflow.md` (48,662 bytes) -- Comprehensive workflow for create/improve/compliance modes
- `critical-requirements.md` (1,712 bytes) -- 16 emphatic requirements
- `critical-reminders.md` (1,792 bytes) -- 17 emphatic reminders
- `examples.md` (4,183 bytes) -- Create and improve examples
- `output-format.md` (2,330 bytes) -- Structured output template

These are _agent partials_ -- raw building blocks that the `compile` command assembles into a single `agent-summoner.md` compiled agent file.

### How `new skill` works (for comparison)

**File:** `src/cli/commands/new/skill.ts`

`new skill` does NOT use an AI meta-agent. It directly generates scaffold files:

- `generateSkillMd(name)` -- creates a template SKILL.md
- `generateMetadataYaml(name, author, category, contentHash)` -- creates metadata.yaml

This is purely template-based, no AI involvement. Skill-summoner should follow the same compile-on-demand pattern as agent-summoner (see below).

### How the skills repo is structured

**Directory:** `/home/vince/dev/skills/`

- `.claude-plugin/marketplace.json` -- Plugin manifest listing all published skills
- `src/skills/` -- Skill source directories (SKILL.md + metadata.yaml each)
- `dist/plugins/` -- Built/compiled plugin output
- No `src/agents/` directory exists (needs to be added)
- No `.claude-src/` config exists

---

## The Problem

### Primary failure scenario

When a user runs `agentsinc new agent my-agent` in a project that:

1. Has NOT run `agentsinc compile` yet (no `.claude/agents/agent-summoner.md` locally)
2. Uses the default source (`github:agents-inc/skills`)

The `loadMetaAgent` function fails because:

1. No local compiled agent exists
2. The skills repo has no compiled agents
3. Error: `"Agent 'agent-summoner' not found. Run 'compile' first to generate agents."`

### Why this is a problem

- **Bad first-time experience**: Users want to run `new agent` as one of their first commands.
- **Source mismatch**: The default source points to the skills repo, which has no agents. Agent partials live in the CLI repo.
- **The local fallback is fragile**: Even when agents ARE compiled locally, they may be stale.

### Output destination problem

Today, `new agent` outputs to... somewhere the meta-agent decides. The output should go to `.claude-src/agents/` -- the standard location for agent partial files (the building blocks). If the directory doesn't exist, create it.

### No marketplace integration

There's no option for users to add the newly created agent directly to their connected marketplace source. The agent always stays in the project directory.

---

## Design: Config Lookup + Compile-on-Demand Fallback

### Core Principle

The `new agent` command resolves agent-summoner through a simple fallback chain. It does NOT require the skills repository to host agent-summoner — the CLI already has the partials built in. The command auto-detects output location based on context.

### Architecture

```
Resolution order for agent-summoner:
  1. Check project config.yaml for an agent-summoner
     (could be a plugin install or local install — use it directly)
  2. If not found, compile from CLI's built-in partials:
     src/agents/meta/agent-summoner/ → compile on-demand → in-memory

Output location auto-detection:
  - Working in a marketplace source dir → {sourcePath}/src/agents/{name}/
  - Working in a consumer project     → {projectDir}/.claude-src/agents/{name}/
```

### Command Flow (Revised)

```
agentsinc new agent my-agent
  |
  +-> Parse args/flags (name, --purpose, --source, etc.)
  |
  +-> Check Claude CLI availability
  |
  +-> Collect purpose (interactive or --purpose flag)
  |
  +-> Resolve agent-summoner:
  |     1. Read project config.yaml
  |     2. Look for agent-summoner in config (plugin or local)
  |     3. If found → use it (already compiled)
  |     4. If not found → compile from CLI's built-in src/agents/meta/agent-summoner/
  |     5. Parse compiled agent (frontmatter + prompt body)
  |
  +-> Auto-detect output directory:
  |     - Marketplace context: {sourcePath}/src/agents/{name}/
  |     - Project context: {projectDir}/.claude-src/agents/{name}/
  |
  +-> Build prompt (agent name, purpose, output directory)
  |
  +-> Invoke meta-agent (spawn claude with agent-summoner)
  |     Agent-summoner creates agent partial files in output directory
  |
  +-> Success message with next steps
  |
  +-> On failure: generic error message
```

### Output Directory

Auto-detected based on context:

**Consumer project** → `.claude-src/agents/{name}/`:

```
.claude-src/agents/my-agent/
  agent.yaml          # Agent metadata (id, title, model, tools)
  intro.md            # Agent identity and role
  workflow.md          # Agent workflow steps
  critical-requirements.md  # Emphatic requirements (if applicable)
  ...                  # Other partials as needed
```

**Marketplace source directory** → `src/agents/{name}/`:

```
{sourcePath}/src/agents/my-agent/
  agent.yaml
  intro.md
  workflow.md
  ...
```

If the output directory does not exist, create it (and parent directories if needed).

### Agent-Summoner Resolution Details

The resolution chain replaces the current `loadMetaAgent` fallback:

1. **Check config.yaml**: Read the project's config and look for an agent-summoner entry (could be a plugin install or a locally installed agent). If found, use it directly — it's already compiled.
2. **Compile from CLI built-ins**: If no agent-summoner in config, use the CLI's own `src/agents/meta/agent-summoner/` partials. Call `compileAgentForPlugin()` with an empty skills list — agent-summoner's meta-agent function doesn't depend on project-specific skills.
3. **Use compiled output**: The compiled `.md` content is passed directly to `parseCompiledAgent()` and then to `invokeMetaAgent()`. No need to write it to disk.

### Skill-Summoner: Same Pattern

Skill-summoner should follow the identical resolution pattern:

1. Check config.yaml for an existing skill-summoner
2. Fall back to CLI's built-in `src/agents/meta/skill-summoner/` partials
3. Compile on-demand and spawn via Claude CLI

This is a separate task but should follow the same architecture.

---

## Step-by-Step Implementation Plan

### Phase 1: Agent-Summoner Resolution in `new agent`

**Goal:** Replace `loadMetaAgent` with config-lookup + compile-on-demand fallback.

1. **New function `resolveMetaAgent(projectDir, agentName)`:**
   - Read project's `config.yaml`
   - Look for `agentName` in the configured agents
   - If found (plugin or local install): read the compiled `.md` file, return content
   - If not found: locate CLI's built-in partials at `src/agents/meta/{agentName}/`
   - Compile using `compileAgentForPlugin()` with empty skills list
   - Return compiled content string

2. **Replace `loadMetaAgent`** in `agent.tsx`:
   - Remove the two-location fallback chain (local compiled + remote compiled)
   - Replace with: `const compiledContent = await resolveMetaAgent(projectDir, "agent-summoner")`
   - Parse and invoke as before: `parseCompiledAgent(compiledContent)` -> `invokeMetaAgent(...)`

3. **Update `buildAgentPrompt`:**
   - Output directory is auto-detected (see Phase 2)
   - Prompt tells agent-summoner to create partial files (agent.yaml, intro.md, workflow.md, etc.)
   - Prompt includes the output path

### Phase 2: Auto-Detect Output Directory

**Goal:** Output to the correct location based on context.

1. **Detect context:**
   - If the current project IS a marketplace source (has `src/agents/` or marketplace config indicators), output to `{sourcePath}/src/agents/{name}/`
   - Otherwise, output to `{projectDir}/.claude-src/agents/{name}/`

2. **Ensure directory exists:**

   ```typescript
   await ensureDir(outputDir)
   ```

3. **Remove `--destination` flag and interactive prompt** — no user choice needed.

### Phase 3: Tests

1. **Unit test `resolveMetaAgent`:**
   - Test: agent-summoner exists in config → uses it directly
   - Test: agent-summoner not in config → compiles from CLI built-ins
   - Test: CLI built-in partials missing → generic error
   - Test: plugin-installed agent-summoner → uses plugin version

2. **Unit test output directory auto-detection:**
   - Test: marketplace context → outputs to `src/agents/{name}/`
   - Test: consumer project → outputs to `.claude-src/agents/{name}/`
   - Test: output directory created if missing

3. **Unit test `buildAgentPrompt` (updated):**
   - Test: prompt includes correct output directory
   - Test: prompt instructs creation of partial files

4. **Integration tests:**
   - Test: fresh project with no agent-summoner in config → compiles and invokes
   - Test: project with agent-summoner plugin → uses plugin version
   - Test: generic error on failure

### Phase 4: (Future) Skill-Summoner Same Pattern

Separate task, but the architecture is:

1. Check config.yaml for existing skill-summoner
2. Fall back to CLI's built-in `src/agents/meta/skill-summoner/` partials
3. Compile on-demand and spawn via Claude CLI

---

## Edge Cases

### Compilation failure

- Generic error message. No elaborate recovery suggestions.

### Output directory doesn't exist

- The command creates the output directory (and parent directories) before invoking the meta-agent.
- Uses `ensureDir()` from existing FS utilities.

### Agent name collision

- If the output directory already exists, prompt the user: "Agent '{name}' already exists. Overwrite?"
- `--force` flag skips the prompt and overwrites.
- In `--non-interactive` mode without `--force`, error out.

### Agent-summoner in config is a plugin

- If the project has agent-summoner installed as a plugin, use the plugin's compiled output directly. No recompilation needed.

### Agent-summoner in config is a local install

- If the project has a locally installed agent-summoner (e.g., via eject), use it directly. No recompilation needed.

### No agent-summoner anywhere

- If not in config AND CLI built-in partials are somehow missing (corrupted install), generic error.

---

## Files Changed Summary

### CLI Repo (`/home/vince/dev/cli`)

| File                                              | Action                                                                                                   | Lines (est.)      |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------- |
| `src/cli/commands/new/agent.tsx`                  | Modify: replace `loadMetaAgent` with `resolveMetaAgent`, auto-detect output dir, remove `--purpose` flag | ~50 lines changed |
| `src/cli/commands/new/agent.test.ts` (new/extend) | Test config lookup, compile fallback, output directory auto-detection                                    | ~100 lines        |

### No Skills Repo Changes

Agent-summoner partials stay in the CLI repo at `src/agents/meta/agent-summoner/`. No changes to the skills repo needed.

---

## Complexity Assessment

**Overall: Low-Medium**

The core changes are:

1. **Config lookup** -- read config.yaml, check for agent-summoner. Low complexity.
2. **Compile fallback** -- use existing `compileAgentForPlugin()` with CLI's built-in partials. Moderate complexity from wiring.
3. **Auto-detect output directory** -- check if working in marketplace vs project context. Low complexity.

Risks:

- `compileAgentForPlugin()` may have dependencies that expect full project context (Liquid engine, template resolution). Need to verify it works with minimal context.

Mitigations:

- Read `compileAgentForPlugin()` signature and test with empty skills list before full implementation.
