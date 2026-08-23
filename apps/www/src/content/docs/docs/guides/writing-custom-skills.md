---
title: Writing custom skills and sub-agents
description: Write your own skills and sub-agents to extend the framework with project-specific knowledge.
sidebar:
  order: 5
---

Create your own skills and subagents to extend the framework with project-specific knowledge.

Both are written by hand, and the route for each is `eject` — start from a working copy of a
built-in and edit it. The `new skill` and `new agent` commands that used to sit on this page are
gone, and they are gone for different reasons: **skill scaffolding is deferred**, and will mimic
the [editor](https://agentsinc.sh)'s intake flow when it arrives rather than inventing a second
one, so it waits for that flow to settle; **sub-agent scaffolding is not coming back at all** — a
sub-agent is composed from partials and skills, so ejecting the built-in partials already gives you
the whole of what a scaffold would have written.

One thing the browser does do today, and it is import rather than authoring: the
[editor](https://agentsinc.sh)'s **Add skill** dialog searches GitHub for skills that already
exist, carries the chosen one's contents inline in the configuration it hands you, and
`init --from <id>` installs it alongside the catalogue's own. That covers a skill somebody has
already written. A skill only you have needs the rest of this page.

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
