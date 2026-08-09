---
title: Writing custom skills and sub-agents
description: Write your own skills and sub-agents to extend the framework with project-specific knowledge.
sidebar:
  order: 5
---

Create your own skills and subagents to extend the framework with project-specific knowledge.

Both are written by hand. The scaffolding commands that used to sit on this page were withdrawn
rather than left broken; a replacement for skills is planned.

## Skills

Start from a copy rather than a blank page:

```bash
npx agents-inc eject skills
```

That writes editable copies of the catalogue's skills into your project, and each one is a working
example of the shape a skill has to take. A skill is two files in a directory:

```
skills/{skill-name}/
  SKILL.md         # Skill content
  metadata.yaml    # Name, domain, category, relationships
```

Both files are required — the loader validates the pair and `npx agents-inc doctor` reports either
one missing. The `skill-summoner` subagent can help you author and refine skills.

## Subagents

```bash
npx agents-inc eject agent-partials
```

A sub-agent is composed from partials — `identity.md`, `playbook.md`, and optionally `output.md` /
`critical-requirements.md` — so ejecting the built-in ones gives you a set to edit or to copy into a
new directory of your own. See [Customizing sub-agents](/docs/guides/customizing-subagents).

## After creating

Run `npx agents-inc compile` to rebuild your subagents with the new skills or agents included.
