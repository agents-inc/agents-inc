---
title: Sub-agents
description: What a sub-agent is, what it is compiled from, and why compiling one beats writing an agent prompt by hand.
---

:::caution[`new agent` is currently disabled]
The `npx agents-inc new agent` command referenced under [Creating your own](#creating-your-own) is switched off in the released CLI while it is being improved. Running it exits with a non-zero status and prints `The new agent command is currently disabled while being improved.` — no agent is scaffolded.

To customise a sub-agent today, run `npx agents-inc eject agent-partials` and edit the partials. See [Customizing sub-agents](/docs/guides/customizing-subagents).
:::

A **sub-agent** is a specialised assistant for Claude Code: a markdown file with frontmatter, sitting in `.claude/agents/`. Claude Code can define these by hand. Agents Inc compiles them instead.

The difference matters. A hand-written agent is a long prompt file that duplicates other agent files, goes stale, and cannot be composed. A compiled agent is assembled from parts you can change independently.

## What it is compiled from

Each sub-agent is assembled from two things:

- **Partials** — the role-specific markdown that makes this agent this agent: `identity.md`, `playbook.md`, `critical-requirements.md`, `critical-reminders.md`, `output.md`.
- **Skills** — the [skills](/docs/concepts/skills) assigned to it, which supply the actual technical expertise.

Both layers are ejectable and editable. See [Customizing sub-agents](/docs/guides/customizing-subagents).

Alongside its prose, an agent carries configuration: which model to run on, reasoning effort, which tools it may use, permission mode, and its output format. The compiler renders all of it through LiquidJS into one markdown file per agent.

## Why compile rather than write

Skills are shared between agents. `web-developer` and `web-reviewer` can both receive the React skill, from one source of truth. Update the skill, run `npx agents-inc compile`, and both agents change together. Nothing is copied by hand and nothing drifts.

## Which skills an agent receives

That mapping is the `stack` field in your `config.ts` — see [Stacks](/docs/concepts/stacks) for the shape and [Editing your config](/docs/guides/editing-config) for how to change it.

## Creating your own

`npx agents-inc new agent` scaffolds a custom sub-agent, composed from skills exactly like the built-in ones. See [Writing custom skills and sub-agents](/docs/guides/writing-custom-skills).
