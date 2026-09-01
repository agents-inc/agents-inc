---
title: Agents Inc
description: Documentation for Agents Inc, an agent composition framework for Claude Code that compiles atomic skills into sub-agents.
---

Agents Inc composes Claude Code sub-agents out of atomic, reusable skills. You
pick the skills matching the stack you actually work in, and they are compiled
into sub-agent files. Change a skill, recompile, and every sub-agent that uses
it is updated.

**The editor is the front door and the CLI is the engine.** You pick your
skills in the browser at [agentsinc.sh/editor](/editor); the CLI is what
writes them to disk. A browser page cannot touch your filesystem, so every
setup ends in one terminal command — the CLI is the step after the editor
rather than an alternative to it.

## Quick start

1. Open [agentsinc.sh/editor](/editor) and click a stack.
2. Press **Install**, and copy the command out of the dialog.
3. Run it from your project root.

```bash
npx agents-inc init --from Ab3xY9_Q
```

That installs the skills you picked and compiles a sub-agent for each role you
kept. [Quickstart](/docs/quickstart) walks the whole run and names every file
it leaves on disk.

:::note[Prefer the terminal?]
`npx agents-inc init` runs the same selection as a wizard — same catalogue,
same output.
:::

## Start here

- [Four ways in](/docs/ways-in) — the four routes to a selection, and which one
  suits where you are starting from. **Adding this to a codebase that already
  exists** and **starting from nothing** have a different answer each, and
  neither of them is the grid.
- [The editor](/docs/editor) — the browser front door, what each of its three
  columns holds, and the things it deliberately cannot do.
- [Quickstart](/docs/quickstart) — the whole run, from the grid to the files on
  disk.
- [Why Agents Inc](/docs/why) — the problem, the approach, and who this is not
  for. Read this first if you have not decided yet.
- [CLI or web](/docs/cli-or-web) — two ways to select, one way to install, and
  how a configuration moves between them.

## Then

The **Concepts** pages define the five words this documentation uses
constantly: [skills](/docs/concepts/skills),
[sub-agents](/docs/concepts/sub-agents), [stacks](/docs/concepts/stacks),
[install modes](/docs/concepts/install-modes) and
[scopes](/docs/concepts/scopes).

The **Guides** are task-shaped:
[global-first setup](/docs/guides/global-first-setup),
[adding to an existing project](/docs/guides/adding-to-an-existing-project),
[editing your config](/docs/guides/editing-config),
[customising sub-agents](/docs/guides/customizing-subagents),
[writing custom skills](/docs/guides/writing-custom-skills),
[creating a marketplace](/docs/guides/creating-a-marketplace) and
[documenting your codebase](/docs/guides/documenting-your-codebase).

**[Configuration](/docs/configuration)** is `.claude-src/config.ts` in full —
the [field reference](/docs/configuration/config-reference),
[scopes and paths](/docs/configuration/scopes-and-paths), and
[models and effort](/docs/configuration/models-and-effort).

**[The editor](/docs/editor)** is the browser front door:
[selecting skills](/docs/editor/selecting-skills),
[the composer](/docs/editor/composer),
[install and share](/docs/editor/install-and-share), and
[marketplaces](/docs/editor/marketplaces).

**[Recipes](/docs/recipes)** are whole tasks worked end to end — for when you
know what you want and not which commands get you there.

The **Reference** covers every [command](/docs/reference/commands),
[what each front door can do](/docs/reference/capabilities), the
[architecture](/docs/reference/architecture), and
[what a compiled sub-agent looks like](/docs/reference/sub-agent-anatomy).

**[Troubleshooting](/docs/troubleshooting)** is where a command that refused
gets explained. Start with
[common problems](/docs/troubleshooting/common-problems).

**[Resources](/docs/resources)** is everything outside this site — the CLI
repository, the changelog, and the skill catalogue itself, which lives in its
own repository at
[github.com/agents-inc/skills](https://github.com/agents-inc/skills).
