# Editing Your Config

The config file at `.claude-src/config.ts` is the central place to manage your skills, agents, and how they connect. A global config at `~/.claude-src/config.ts` works the same way but applies across all projects.

## Structure

A generated config looks like this:

```typescript
import type {
  AgentScopeConfig,
  Domain,
  ProjectAgentName,
  ProjectConfig,
  SelectedAgentName,
  SkillConfig,
  StackAgentConfig,
} from "./config-types";

const skills: SkillConfig[] = [
  { id: "web-framework-react", scope: "project", source: "agents-inc" },
  { id: "web-state-zustand", scope: "project", source: "agents-inc" },
  { id: "api-framework-hono", scope: "project", source: "agents-inc" },
];

const agents: AgentScopeConfig[] = [
  { name: "web-developer", scope: "project" },
  { name: "api-developer", scope: "project" },
];

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  "web-developer": {
    "web-framework": "web-framework-react",
    "web-client-state": "web-state-zustand",
  },
  "api-developer": {
    "api-api": { id: "api-framework-hono", preloaded: true },
  },
};

const domains: Domain[] = ["web", "api"];

const selectedAgents: SelectedAgentName[] = ["web-developer", "api-developer"];

export default {
  name: "my-project",
  source: "github:agents-inc/skills",
  skills,
  agents,
  stack,
  domains,
  selectedAgents,
} satisfies ProjectConfig;
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

- **Dynamic** (default) — Loaded on-demand via Claude Code's Skill tool at runtime. Keeps the agent prompt lean.
- **Preloaded** (`preloaded: true`) — Embedded directly in the compiled agent prompt. The agent has the skill content available immediately without needing to load it. Use this for core skills that the agent always needs.

## Config Types

Alongside `config.ts`, a `config-types.ts` file is auto-generated. It contains narrowed type unions for only the skills, agents, and categories you have installed. This gives you type checking when editing the config — typos in skill IDs or agent names are caught by TypeScript.

Project-level `config-types.ts` imports and extends the global types when a global installation exists.

## After Editing

Run `agentsinc compile` to rebuild your subagents with the updated configuration.
