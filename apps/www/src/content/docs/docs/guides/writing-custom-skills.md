---
title: Writing custom skills and sub-agents
description: Scaffold your own skills and sub-agents to extend the framework with project-specific knowledge.
sidebar:
  order: 5
---

:::caution[Both commands on this page are currently disabled]
`new skill` and `new agent` are switched off in the released CLI while they are being improved. Running either one exits with a non-zero status and prints `The <name> command is currently disabled while being improved.` — nothing is scaffolded.

Until they are switched back on:

- **Skills** — run `npx agents-inc eject skills` to get editable copies of the catalogue's skills, or create the two files shown below by hand. `npx agents-inc import skill <repo>` also still works for pulling skills out of a GitHub repository — see [Importing skills](/docs/guides/importing-skills).
- **Sub-agents** — run `npx agents-inc eject agent-partials` and edit the partials of an existing sub-agent. See [Customizing sub-agents](/docs/guides/customizing-subagents).

The commands are being improved, not removed. Everything below describes how they behave and will be accurate again once they return.
:::

Create your own skills and subagents to extend the framework with project-specific knowledge.

## Skills

```bash
npx agents-inc new skill
```

Scaffolds a new skill with the required file structure:

```
skills/{skill-name}/
  SKILL.md         # Skill content
  metadata.yaml    # Name, domain, category, relationships
```

You can also iterate on existing skills by ejecting them first (`npx agents-inc eject skills`) and modifying the local copies. The `skill-summoner` subagent can help you author and refine skills.

## Subagents

```bash
npx agents-inc new agent
```

Scaffolds a new subagent with `identity.md`, `playbook.md`, and optionally `output.md` / `critical-requirements.md`. Custom subagents are composed from skills just like the built-in ones.

The `agent-summoner` subagent can help you design and build new agents.

## After creating

Run `npx agents-inc compile` to rebuild your subagents with the new skills or agents included.
