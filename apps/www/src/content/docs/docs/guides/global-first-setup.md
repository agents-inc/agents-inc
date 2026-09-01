---
title: Global-first setup
description: Why global scope is the right default for your stack, when to reach for project scope instead, and what happens to globally installed items when you edit from inside a project.
sidebar:
  order: 1
---

Everything defaults to global scope. Your first setup — picked in the [editor](/editor) or in the terminal wizard — is your personal default stack: skills, agents, and sources that apply across all projects. Most of the time, that's all you need.

## Quick start

Open [agentsinc.sh/editor](/editor), click the stack you want, and press **Install**. There's no scope decision to make — every skill and every sub-agent rests at global until you move it. Copy the command out of the dialog and run it:

```bash
npx agents-inc init --from Ab3xY9_Q
```

Your config lands at `~/.claude-src/config.ts` and your compiled sub-agents at `~/.claude/agents/`, and every project on the machine sees them. That's the whole of a single-stack setup. The rest of this page is for when one project has to differ.

:::note[Doing this from the terminal]
`npx agents-inc init` runs the same selection as a wizard and installs at global scope the same way. `npx agents-inc edit` from `~/` changes what that global install holds.
:::

## Why global-first

It's tempting to install per-project, but that becomes a maintenance headache. You end up with the same React + Hono + Drizzle stack duplicated across every project, and updating one doesn't update the rest.

Global scope means one installation to maintain. Project scope is only for when a specific project deviates from your defaults.

## Setting up your global stack

Pick your primary technologies, sub-agents and install modes, and leave every scope word alone. `global` is where a fresh pick rests in both front doors — it's one default, read by the editor's grid, by the editor's roster and by the CLI's own decode of a shared id, so an untouched selection means the same thing wherever you made it.

Your global config lives at `~/.claude-src/config.ts`. Agents are compiled to `~/.claude/agents/`.

## When to use project scope

Use project scope when a project needs something different from your global defaults. For example, your global stack uses React but one project uses Vue — that project gets its own project-scoped config.

Two words carry that decision, and a project-scoped setup needs both. On a skill's cell in the grid, the `global` badge flips to `project`. On a sub-agent's row in the roster, the `global` word does the same. Pick only what this project adds and move every one of those words — your global install stays exactly where it is, and this project sees it as well as its own, because a project inherits global and not the other way round.

Then install from the project it's for:

```bash
cd ~/projects/vue-app
npx agents-inc init --from Ab3xY9_Q
```

Leave anything in that selection at global scope and the install is refused rather than merged, because it would be writing into a `~/.claude` that's already installed — [Editing](#editing) below is the route for a change that reaches the global side.

Project config lives at `.claude-src/config.ts` in the project directory. Project-scoped agents are compiled to `.claude/agents/` in the project. [Scopes and paths](/docs/configuration/scopes-and-paths) lists every directory each scope writes to.

:::note[Doing this from the terminal]
Press `s` on the focused row in the wizard's Skills step to flip that skill's scope. It's suppressed when you're already editing at global scope, where there's nothing to flip to.
:::

## Project skills never reach global sub-agents

Global skills reach any sub-agent; project skills reach only project ones. A global sub-agent's front-matter is written to `~/.claude`, where every project on the machine sees it, so it can't name a skill installed under one project's `.claude` — from anywhere else, that skill isn't there.

Both front doors enforce that from the same rule. Hand a project skill to a sub-agent still resting at global and the editor marks the roster row `This sub-agent must be set to project scope too`, and holds both Install and Share until you move one of the two — the sub-agent's own scope word, one line above, is the click that resolves it. `compile` states the same pair from the other side: it drops it, compiles the sub-agent without it, and says so on every run.

## What goes where

**Global** — Your default stack. The technologies you reach for on most projects, plus meta agents like `codex-keeper` and `skill-summoner` that aren't project-specific.

**Project** — Overrides. A different framework, a project-specific database, agents that need different skill mappings than your global defaults.

## Editing

**Once a global install exists, `init --from` won't touch it.** A payload carrying global-scoped content writes into your own `~/.claude`, so an installation already there is in its way even when the project you're standing in is spotless — the refusal names it and points at `uninstall`. `edit` is the command that accepts a setup already in place, in either direction:

```bash
npx agents-inc edit --ui              # publishes what's installed and opens it at agentsinc.sh/editor
npx agents-inc edit --from Ab3xY9_Q   # applies what you changed there
```

`edit --ui` prints `init --from <id>` beside the link, and that is not the command to come back with. [Switch a skill to eject](/docs/recipes/switch-a-skill-to-eject) walks the round trip once, start to finish.

`npx agents-inc edit` with no flags does the same in the terminal. From a project directory it shows both global and project skills. Global items appear as locked and **cannot be removed from a project** — space is inert on those rows and the wizard says `Global skills cannot be changed from project scope`. The global install is shared by every project, so one project must not uninstall it for the others.

To change a global item, edit at global scope: run `npx agents-inc edit` from `~/` (or from any directory without a project-scoped installation).

**Don't want a global skill in this project?** Don't deselect it — just don't hand it to this project's agents. Remove it from the agent's entry in the project's `stack` (see [Editing Your Config](/docs/guides/editing-config)) and run `npx agents-inc compile`. The skill stays installed globally; it simply isn't part of any prompt here.

**Want your own version instead?** Press `s` (scope hotkey) on the row to add a project-scoped copy alongside the global install — the row then shows both `[P]` and `[G]`.
