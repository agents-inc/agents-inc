---
title: Editing your config
description: The shape of the generated config.ts — skills, agents, the stack mapping that decides which skills each sub-agent receives, and preloaded versus dynamic loading.
sidebar:
  order: 3
---

The config file at `.claude-src/config.ts` is where an installation's skills, agents and the connections between them are written down. A global config at `~/.claude-src/config.ts` works the same way but applies across all projects.

:::note[Most of this file is a click in the editor]
Install mode, scope, which sub-agents carry a skill, whether each carries it preloaded or dynamically, every sub-agent's model and effort, and the marketplace the whole thing reads from all have controls in the [editor](/editor) — and **Preview generated code** draws the `config.ts` they produce, from the same renderers the installer writes with, before anything is written. This page is for the hand edit: something the editor has no control for, or an installation already on disk that you'd rather change in place than round-trip.
:::

## Quick start

Open `.claude-src/config.ts`, change the `stack` entry for the sub-agent you care about, and rebuild:

```bash
npx agents-inc compile
```

`stack` maps a sub-agent to a category to the skills it receives, and it's the field worth editing by hand — the rest of the file is written for you. The generated `config-types.ts` beside it narrows every id to what you actually installed, so a mistyped skill id is a TypeScript error in your editor before `compile` ever sees it. Every field the file accepts is listed in the [config reference](/docs/configuration/config-reference).

## Structure

A generated config looks like this:

<!-- prettier-ignore -->
```typescript
import type {
  Domain,
  ProjectConfig,
  ProjectAgentName,
  AgentScopeConfig,
  SkillConfig,
  StackAgentConfig,
} from './config-types'

const skills: SkillConfig[] = [
  { id: 'web-framework-react', scope: 'project', origin: 'agents-inc' },
  { id: 'web-state-zustand', scope: 'project', origin: 'agents-inc' },
  { id: 'api-framework-hono', scope: 'project', origin: 'agents-inc' },
]

const agents: AgentScopeConfig[] = [
  { name: 'web-developer', scope: 'project' },
  { name: 'api-developer', scope: 'project' },
]

const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'api-developer': { 'api-api': { id: 'api-framework-hono', preloaded: true } },
  'web-developer': {
    'web-framework': 'web-framework-react',
    'web-client-state': 'web-state-zustand',
  },
}

const selectedDomains: Domain[] = ['web', 'api']

export default {
  name: 'my-project',
  agents,
  skills,
  selectedDomains,
  stack,
  marketplace: 'github:agents-inc/skills',
} satisfies ProjectConfig
```

Both generated files arrive already formatted — single quotes, no semicolons, trailing commas, a 100-column width — so running Prettier over them with those settings changes nothing.

The order is the writer's rather than the order you selected things in: the top-level fields, the keys inside `stack` and the keys inside each entry are all placed in a fixed order. Two configs holding the same values are therefore the same file, which is what keeps an edit that changed one skill from rewriting lines about the others.

## Skills

Each skill entry carries three required fields and one optional one:

- **`id`** — The skill identifier (e.g., `'web-framework-react'`)
- **`scope`** — `'project'` or `'global'`
- **`origin`** — `'eject'` when the skill was copied into the project's own `.claude/skills/`, or the marketplace name (e.g., `'agents-inc'`) when it is installed as a plugin
- **`excluded`** — Optional. A tombstone rather than a deletion: the entry stays on record and the skill is treated as not installed. This is how a project masks a global install without removing it for every other project.

The field is `origin`, not `source`. A config that still spells a skill entry's provenance `source`, or that carries a top-level `source` instead of `marketplace`, is refused at load with the rename named — the CLI does not read the old key and does not fall back to it.

## Agents

Each agent entry carries two required fields and three optional ones:

- **`name`** — The agent name (e.g., `'web-developer'`)
- **`scope`** — `'project'` or `'global'`
- **`model`** — Optional. Overrides the model the agent's own metadata names.
- **`effort`** — Optional. Overrides the reasoning effort the agent's own metadata names.
- **`excluded`** — Optional. The same tombstone the skill entries use.

Which values `model` and `effort` accept, and what each does, is in [Models and effort](/docs/configuration/models-and-effort).

## Globally Installed Items Are Read-Only in a Project

A skill or agent installed at global scope belongs to the global config, and a project may not remove it. In the wizard, pressing space on a globally installed skill or agent from inside a project does nothing and shows `Global skills cannot be changed from project scope` (or the agent equivalent). This is deliberate: the global install is shared by every project, so one project must not be able to uninstall it for the others.

**If you don't want a global skill used in a project, don't give it to that project's agents.** Curate the `stack` instead of trying to deselect the skill:

<!-- prettier-ignore -->
```typescript
// React is installed globally. This project's web-developer simply doesn't receive it.
const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'web-developer': {
    'web-client-state': 'web-state-zustand',
    // no 'web-framework' entry — the global React skill is never handed to this agent
  },
}
```

The skill stays installed and available; it just isn't part of any agent's prompt in this project. Run `npx agents-inc compile` after editing.

To take genuine project ownership of a globally installed skill instead, press `s` (scope toggle) on its row in the wizard. That gives the project its own copy at project scope while the global install stays intact — the row then shows both `[P]` and `[G]`.

To actually uninstall a global skill or agent, edit at global scope: run `npx agents-inc edit` from your home directory (`cd ~`).

## Stack: Mapping Skills to Agents

The `stack` field controls which skills each agent receives, organized by category:

<!-- prettier-ignore -->
```typescript
'web-developer': {
  // Single skill
  'web-framework': 'web-framework-react',
  // Multiple skills
  'web-testing': ['web-testing-vitest', 'web-testing-react-testing-library'],
  // Preloaded skill
  'api-api': { id: 'api-framework-hono', preloaded: true },
}
```

:::note[The same mapping in the editor]
Two surfaces write it. A skill's `•••` panel opens a matrix of implementation domains against roles, and each cell cycles blank → `lazy` → `pre` — which is this field's three states, including the object form below. The roster's skill rows do the same one pairing at a time: click a row to switch that copy off without removing the skill anywhere else, or click its `pre` / `lazy` word to change how that one sub-agent loads it.
:::

## Preloaded vs Dynamic

Skills can be loaded in two ways:

- **Dynamic** (default) — Loaded on-demand via Claude Code's Skill tool at runtime. Keeps the agent prompt lean. Written as a bare skill id in the stack — the config never contains `preloaded: false`.
- **Preloaded** (`preloaded: true`) — Named in the compiled agent's frontmatter `skills:` list, which is the key Claude Code reads when it starts the agent. The skill is there from the first turn without the agent having to ask for it, which is what you want for the one or two skills the agent always needs. The object form (`{ id, preloaded: true }`) is what marks it; a dynamic skill is listed in the agent's skill-activation protocol instead.

## Config Types

Alongside `config.ts`, a `config-types.ts` file is auto-generated. It contains narrowed type unions for only the skills, agents, and categories you have installed. This gives you type checking when editing the config — typos in skill IDs or agent names are caught by TypeScript.

Project-level `config-types.ts` imports and extends the global types when a global installation exists.

## After Editing

Run `npx agents-inc compile` to rebuild your subagents with the updated configuration.

Compile also regenerates `config-types.ts` from your edited config at every scope it compiles (global, project, or both), so the type unions always match the skills and agents currently listed in `config.ts` — a skill you added by hand becomes a valid `SkillId`, and a removed one becomes a type error.

For the same edit walked start to finish, see [Give one agent a skill](/docs/recipes/give-one-agent-a-skill).
