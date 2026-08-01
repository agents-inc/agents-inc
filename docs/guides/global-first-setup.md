# Global-First Setup

Everything defaults to global scope. Your first `agents-inc init` sets up your personal default stack — skills, agents, and sources that apply across all projects. Most of the time, that's all you need.

## Why global-first

It's tempting to install per-project, but that becomes a maintenance headache. You end up with the same React + Hono + Drizzle stack duplicated across every project, and updating one doesn't update the rest.

Global scope means one installation to maintain. Project scope is only for when a specific project deviates from your defaults.

## Setting up your global stack

Run `agents-inc init` from any directory. Select your primary technologies, agents, and sources. Everything installs at global scope by default.

Your global config lives at `~/.claude-src/config.ts`. Agents are compiled to `~/.claude/agents/`.

## When to use project scope

Use project scope when a project needs something different from your global defaults. For example, your global stack uses React but one project uses Vue — that project gets its own project-scoped config.

```bash
cd ~/projects/vue-app
agents-inc init
```

Toggle specific skills and agents to project scope using the scope hotkey in the wizard. Only override what differs — everything else falls through to global.

Project config lives at `.claude-src/config.ts` in the project directory. Project-scoped agents are compiled to `.claude/agents/` in the project.

## What goes where

**Global** — Your default stack. The technologies you reach for on most projects, plus meta agents like `codex-keeper` and `skill-summoner` that aren't project-specific.

**Project** — Overrides. A different framework, a project-specific database, agents that need different skill mappings than your global defaults.

## Editing

`agents-inc edit` from a project directory shows both global and project skills. Global items appear as locked and **cannot be removed from a project** — space is inert on those rows and the wizard says `Global skills cannot be changed from project scope`. The global install is shared by every project, so one project must not uninstall it for the others.

To change a global item, edit at global scope: run `agents-inc edit` from `~/` (or from any directory without a project-scoped installation).

**Don't want a global skill in this project?** Don't deselect it — just don't hand it to this project's agents. Remove it from the agent's entry in the project's `stack` (see [Editing Your Config](./editing-config.md)) and run `agents-inc compile`. The skill stays installed globally; it simply isn't part of any prompt here.

**Want your own version instead?** Press `s` (scope hotkey) on the row to add a project-scoped copy alongside the global install — the row then shows both `[P]` and `[G]`.
