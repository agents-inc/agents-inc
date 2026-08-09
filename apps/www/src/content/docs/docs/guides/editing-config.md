---
title: Editing your config
description: The shape of the generated config.ts — skills, agents, the stack mapping that decides which skills each sub-agent receives, and preloaded versus dynamic loading.
sidebar:
  order: 3
---

The config file at `.claude-src/config.ts` is the central place to manage your skills, agents, and how they connect. A global config at `~/.claude-src/config.ts` works the same way but applies across all projects.

## Structure

A generated config looks like this:

```typescript
import type {
  Domain,
  ProjectConfig,
  ProjectAgentName,
  AgentScopeConfig,
  SkillConfig,
  StackAgentConfig,
} from "./config-types"

const skills: SkillConfig[] = [
  { id: "web-framework-react", scope: "project", source: "agents-inc" },
  { id: "web-state-zustand", scope: "project", source: "agents-inc" },
  { id: "api-framework-hono", scope: "project", source: "agents-inc" },
]

const agents: AgentScopeConfig[] = [
  { name: "web-developer", scope: "project" },
  { name: "api-developer", scope: "project" },
]

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  "web-developer": {
    "web-framework": "web-framework-react",
    "web-client-state": "web-state-zustand",
  },
  "api-developer": {
    "api-api": { id: "api-framework-hono", preloaded: true },
  },
}

const selectedDomains: Domain[] = ["web", "api"]

export default {
  name: "my-project",
  source: "github:agents-inc/skills",
  skills,
  agents,
  stack,
  selectedDomains,
} satisfies ProjectConfig
```

## Skills

Each skill entry has three fields:

- **`id`** — The skill identifier (e.g., `"web-framework-react"`)
- **`scope`** — `"project"` or `"global"`
- **`source`** — `"local"` for local installs, or the marketplace name (e.g., `"agents-inc"`)

## Agents

Each agent entry has two fields:

- **`name`** — The agent name (e.g., `"web-developer"`)
- **`scope`** — `"project"` or `"global"`

## Globally Installed Items Are Read-Only in a Project

A skill or agent installed at global scope belongs to the global config, and a project may not remove it. In the wizard, pressing space on a globally installed skill or agent from inside a project does nothing and shows `Global skills cannot be changed from project scope` (or the agent equivalent). This is deliberate: the global install is shared by every project, so one project must not be able to uninstall it for the others.

**If you don't want a global skill used in a project, don't give it to that project's agents.** Curate the `stack` instead of trying to deselect the skill:

```typescript
// React is installed globally. This project's web-developer simply doesn't receive it.
const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  "web-developer": {
    "web-client-state": "web-state-zustand",
    // no "web-framework" entry — the global React skill is never handed to this agent
  },
}
```

The skill stays installed and available; it just isn't part of any agent's prompt in this project. Run `npx agents-inc compile` after editing.

To take genuine project ownership of a globally installed skill instead, press `s` (scope toggle) on its row in the wizard. That gives the project its own copy at project scope while the global install stays intact — the row then shows both `[P]` and `[G]`.

To actually uninstall a global skill or agent, edit at global scope: run `npx agents-inc edit` from your home directory (`cd ~`).

## Stack: Mapping Skills to Agents

The `stack` field controls which skills each agent receives, organized by category:

```typescript
"web-developer": {
  "web-framework": "web-framework-react",                          // Single skill
  "web-testing": ["web-testing-vitest", "web-testing-playwright"],  // Multiple skills
  "api-api": { id: "api-framework-hono", preloaded: true },        // Preloaded skill
}
```

## Preloaded vs Dynamic

Skills can be loaded in two ways:

- **Dynamic** (default) — Loaded on-demand via Claude Code's Skill tool at runtime. Keeps the agent prompt lean. Written as a bare skill id in the stack — the config never contains `preloaded: false`.
- **Preloaded** (`preloaded: true`) — Embedded directly in the compiled agent prompt. The agent has the skill content available immediately without needing to load it. Use this for core skills that the agent always needs. The object form (`{ id, preloaded: true }`) is what marks it.

## Config Types

Alongside `config.ts`, a `config-types.ts` file is auto-generated. It contains narrowed type unions for only the skills, agents, and categories you have installed. This gives you type checking when editing the config — typos in skill IDs or agent names are caught by TypeScript.

Project-level `config-types.ts` imports and extends the global types when a global installation exists.

## After Editing

Run `npx agents-inc compile` to rebuild your subagents with the updated configuration.

Compile also regenerates `config-types.ts` from your edited config at every scope it compiles (global, project, or both), so the type unions always match the skills and agents currently listed in `config.ts` — a skill you added by hand becomes a valid `SkillId`, and a removed one becomes a type error.
