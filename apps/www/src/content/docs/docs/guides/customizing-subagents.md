---
title: Customizing sub-agents
description: Eject the three layers a sub-agent is composed from — partials, templates and skills — and modify each independently.
sidebar:
  order: 4
---

Subagents are composed from three layers: partials, templates, and skills. Each layer can be ejected and modified independently.

## Ejecting

```bash
npx agents-inc eject agent-partials   # Role-specific partials (intro, workflow, output)
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

**Keeping a globally installed skill out of a project is a stack decision, not a selection one.** A global install cannot be deselected from inside a project — the wizard locks those rows. Instead, leave the skill out of the relevant agent's `stack` entry: the skill stays installed and available, but no subagent in this project receives it. See [Editing Your Config](/docs/guides/editing-config) for the stack shape.

After making changes, run `npx agents-inc compile` to rebuild your subagents.
