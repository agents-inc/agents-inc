---
title: Customizing sub-agents
description: Eject the three layers a sub-agent is composed from — partials, templates and skills — and modify each independently.
sidebar:
  order: 4
---

Subagents are composed from three layers: partials, templates, and skills. Each layer can be ejected and modified independently, and all of it happens in the terminal — the three layers are files on disk, and the [editor](/editor) is a browser page that writes none.

**Want to see what you're changing first?** [Anatomy of a sub-agent](/docs/reference/sub-agent-anatomy) reads a compiled file top to bottom, so you can tell which of the three layers produced which part of it.

## Quick start

```bash
npx agents-inc eject agent-partials   # the five partials one sub-agent is composed from
npx agents-inc compile                # rebuild your subagents around what you changed
```

Edit the partial that carries the behaviour you want changed, recompile, and that subagent is different from the next turn on. The sections below say what each of the three layers holds, so you know which one to reach for.

## Ejecting

```bash
npx agents-inc eject agent-partials   # Role-specific partials
npx agents-inc eject templates        # Global Liquid templates shared across all subagents
npx agents-inc eject skills           # Fork skills for local editing
npx agents-inc eject all              # Everything at once
```

Run `npx agents-inc compile` after editing any ejected files to rebuild your subagents.

## Partials

Each subagent has five partials that can be customized:

- `identity.md` — Role description and identity
- `playbook.md` — Step-by-step process the agent follows
- `critical-requirements.md` — Hard rules the agent must follow
- `critical-reminders.md` — Repeated emphasis on key behaviors
- `output.md` — How the agent structures its responses

**Partials** apply to specific roles. Use these to customize how a particular subagent behaves.

## Templates

**Templates** apply globally across all subagents. Use these for shared conventions like coding style, commit formats, or project-wide rules.

## Configuration

Skill-to-subagent mappings and load behavior (preloaded vs dynamic) are configured in `.claude-src/config.ts`. Use `npx agents-inc edit` to modify selections interactively, or edit the config file directly.

:::note[The parts of a sub-agent the editor does own]
Which skills a sub-agent carries, whether it carries each one preloaded or dynamically, and its model, effort and scope are all clicks in the [editor](/editor) — that's what the roster's rows are. Model and effort in particular have no wizard control at all, so this file and the roster are the only two places they're set. Bring an installation over with `npx agents-inc edit --ui` and take it back with `edit --from <id>`.
:::

**Keeping a globally installed skill out of a project is a stack decision, not a selection one.** A global install cannot be deselected from inside a project — the wizard locks those rows. Instead, leave the skill out of the relevant agent's `stack` entry: the skill stays installed and available, but no subagent in this project receives it. See [Editing Your Config](/docs/guides/editing-config) for the stack shape.

After making changes, run `npx agents-inc compile` to rebuild your subagents.
