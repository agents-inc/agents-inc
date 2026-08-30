---
title: Sub-agents
description: What a sub-agent is, what it is compiled from, and why compiling one beats writing an agent prompt by hand.
---

A **sub-agent** is a specialised assistant for Claude Code: a markdown file with frontmatter, sitting in `.claude/agents/`. Claude Code can define these by hand. Agents Inc compiles them instead.

The difference matters. A hand-written agent is a long prompt file that duplicates other agent files, goes stale, and cannot be composed. A compiled agent is assembled from parts you can change independently.

## Quick start

You use a compiled sub-agent the way Claude Code uses any sub-agent — by name:

```
@web-developer add optimistic updates to the cart
```

The file behind that name is `.claude/agents/web-developer.md`, or `~/.claude/agents/web-developer.md` for a global install. `npx agents-inc compile` rewrites it from your config, so open it afterwards and you can read exactly what the agent was told. [Anatomy of a sub-agent](/docs/reference/sub-agent-anatomy) walks one of those files field by field.

## What it is compiled from

Each sub-agent is assembled from two things:

- **Partials** — the role-specific markdown that makes this agent this agent: `identity.md`, `playbook.md`, `critical-requirements.md`, `critical-reminders.md`, `output.md`.
- **Skills** — the [skills](/docs/concepts/skills) assigned to it, which supply the actual technical expertise.

Both layers are ejectable and editable. See [Customizing sub-agents](/docs/guides/customizing-subagents).

Alongside its prose, an agent carries configuration: which model to run on, reasoning effort, which tools it may use, permission mode, and its output format. The compiler renders all of it through LiquidJS into one markdown file per agent. Model and effort are the two you are most likely to want to change. In the [editor](/docs/editor) they are the two words on the agent's row in the roster, and each click steps to the next value. In `config.ts` they are two fields on the agent's entry — see [Models and effort](/docs/configuration/models-and-effort).

## Why compile rather than write

Skills are shared between agents. `web-developer` and `web-tester` can both receive the React skill, from one source of truth. Update the skill, run `npx agents-inc compile`, and both agents change together. Nothing is copied by hand and nothing drifts.

The `reviewer` is the sharpest example. It is a single agent that reviews every domain — there is no per-domain reviewer — and the domain knowledge a per-domain roster would have duplicated lives in `meta-reviewing-*` skills instead, loaded lazily to match the diff under review.

## Which skills an agent receives

That mapping is the `stack` field in your `config.ts`. In the editor you set it by clicking: a skill's `•••` panel carries a **Sub-agents** matrix whose cells step that sub-agent's copy of the skill through unassigned, dynamic and preloaded, and under each sub-agent in the roster its skills are rows you can switch off one at a time. The wizard has no equivalent — from the terminal it is a hand edit followed by `npx agents-inc compile`. See [Stacks](/docs/concepts/stacks) for the shape and [Editing your config](/docs/guides/editing-config) for the fields.

## Creating your own

Run `npx agents-inc eject agent-partials` and edit the partials, or copy them into a directory of your own. A custom sub-agent is composed from skills exactly like the built-in ones. See [Writing custom skills and sub-agents](/docs/guides/writing-custom-skills).
