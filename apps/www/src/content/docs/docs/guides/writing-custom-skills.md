---
title: Writing custom skills and sub-agents
description: Write your own skills and sub-agents to extend the framework with project-specific knowledge.
sidebar:
  order: 5
---

Create your own skills and subagents to extend the framework with project-specific knowledge.

**If somebody has already written it, import it rather than writing it again.** The
[editor](/editor)'s **Add skill** dialog searches GitHub for skills that already
exist, carries the chosen one's contents inline in the configuration it hands you, and
`init --from <id>` installs it alongside the catalogue's own. A skill from outside the catalogue
always installs by ejecting, so it arrives as a copy you own rather than a pointer at somebody
else's repository. That is the whole of the browser's part in this — import, never authoring.

A skill only you have is written by hand, and the route for that is `eject` — start from a working
copy of a built-in and edit it. The `new skill` and `new agent` commands that used to sit on this
page are gone, and they are gone for different reasons: **skill scaffolding is deferred**, and will
mimic the editor's intake flow when it arrives rather than inventing a second one, so it waits for
that flow to settle; **sub-agent scaffolding is not coming back at all** — a sub-agent is composed
from partials and skills, so ejecting the built-in partials already gives you the whole of what a
scaffold would have written.

## Quick start

```bash
npx agents-inc eject skills           # working copies of the catalogue's skills, under .claude/skills/
npx agents-inc eject agent-partials   # the partials each built-in sub-agent is composed from
npx agents-inc compile                # rebuild your sub-agents around whatever you changed
```

Each of those copies a working example onto disk — the shape the loader is going to hold you to.
The two sections below say what lands where, and what has to be true of it.

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

A sub-agent is composed from five partials — `identity.md`, `playbook.md`,
`critical-requirements.md`, `critical-reminders.md` and `output.md` — so ejecting the built-in ones
gives you a set to edit or to copy into a new directory of your own. See
[Customizing sub-agents](/docs/guides/customizing-subagents) for what each one carries, and
[Anatomy of a sub-agent](/docs/reference/sub-agent-anatomy) for where each ends up in the compiled
file.

## After creating

Run `npx agents-inc compile` to rebuild your subagents with the new skills or agents included.
