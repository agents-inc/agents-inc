---
title: Scopes
description: Project versus global — what each one means, why global is the default, and the one pairing the CLI refuses to write.
---

Every skill and every sub-agent is installed at one of two scopes: **global**, shared by every project on the machine, or **project**, belonging to one directory. Scope is set per skill and per sub-agent, independently of [install mode](/docs/concepts/install-modes), and it decides who can see the thing you installed.

## Quick start

Global is the default on both front doors, and most of the time it's the one you want. Your React + Hono setup is the same in every project, so installing it once at global scope means one thing to maintain instead of one copy per repository.

In the editor, scope is a badge on a skill's cell and a word on a sub-agent's roster row — click either to flip it. Reach for project scope only where a project genuinely differs from your defaults.

:::note[From the terminal]
`S` on the focused row flips scope, on the Skills step and the Agents step alike. [Global-first setup](/docs/guides/global-first-setup) walks the whole decision as a task.
:::

## What each scope means

|                     | Global                             | Project                       |
| ------------------- | ---------------------------------- | ----------------------------- |
| Config              | `~/.claude-src/config.ts`          | `.claude-src/config.ts`       |
| Compiled sub-agents | `~/.claude/agents/`                | `.claude/agents/`             |
| Who sees it         | every project on the machine       | this directory only           |
| Good for            | the stack you reach for by default | the one project that deviates |

You can mix freely. A common shape is a global base with a project overriding the one thing it does differently — global React everywhere, plus project-scoped Vue in the one app that uses it.

## The one pairing that's refused

This is the rule worth knowing before you hand-edit anything:

**Global reaches everywhere, so a project sub-agent can carry a global skill. A global sub-agent can't carry a project skill.**

Only that one direction is blocked. The other three pairings all write fine.

| Skill scope | Sub-agent scope | Writes? |
| ----------- | --------------- | ------- |
| global      | global          | yes     |
| global      | project         | yes     |
| project     | project         | yes     |
| **project** | **global**      | **no**  |

The reason is visibility rather than policy. A global sub-agent's file is written to `~/.claude/agents/`, where every project on the machine reads it — while a project-scoped skill is installed under one project's `.claude/`. A global sub-agent carrying a project skill would name something that doesn't exist from anywhere else on the machine, so the pairing is refused rather than written and left to break.

`compile` drops the pair, compiles the sub-agent without it, and says so on every run. It doesn't rewrite your config, so the warning repeats until you fix it:

```
Sub-agent 'web-developer' cannot carry project-scoped skill 'web-testing-vitest' — global-scoped sub-agents only carry global-scoped skills.
```

Two ways out: move the skill to global scope, or pin the sub-agent to the project. The editor marks the offending row and blocks Install and Share until you pick one, so this is a warning you can only hit from a hand edit or a shared configuration.

**One definition, read by both front doors.** The rule lives in `packages/matrix/src/seed.ts` and the CLI, the editor and the shared-configuration format all read it from there rather than restating it — it used to exist as three verbatim copies in three workspaces, which is exactly the drift a shared contract prevents.

## Global entries are read-only inside a project

`npx agents-inc edit` from a project shows global skills and sub-agents alongside the project's own, and locks them. Space is inert on those rows and the wizard says `Global skills cannot be changed from project scope`. One project must not uninstall something every other project is using.

To change a global item, edit at global scope — run `edit` from your home directory, or from any directory that has no project installation of its own.

**Don't want a global skill in this project?** Don't try to deselect it. Leave it out of the relevant sub-agent's `stack` entry instead: the skill stays installed and available, and no sub-agent here receives it. [Give one sub-agent a skill](/docs/recipes/give-one-agent-a-skill) does exactly that.

## Related

- [Global-first setup](/docs/guides/global-first-setup) — the same decision as a task, with what goes where.
- [Scopes and paths](/docs/configuration/scopes-and-paths) — every directory each scope writes to, the `projects` registry, and the path overrides.
- [Install modes](/docs/concepts/install-modes) — the other per-skill choice, and independent of this one.
