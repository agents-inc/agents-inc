---
title: Quickstart
description: Run npx agents-inc init, walk the six wizard steps, and see exactly which files land on disk.
---

## Before you start

You need [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
installed. Everything Agents Inc produces is a Claude Code sub-agent file or a
Claude Code plugin.

Nothing needs to be installed globally. `npx` fetches the CLI for you.

## Run it

```bash
npx agents-inc init
```

Run it from your home directory if you want a setup shared across every
project, or from a project directory if you want this project only. Global is
the recommended starting point — see
[Global-first setup](/docs/guides/global-first-setup).

<!--
  WALKTHROUGH VIDEO PLACEHOLDER.

  A recorded walkthrough of `init` exists and is embedded in the CLI's README
  (packages/cli/README.md, under "Walkthrough (recommended)") as a GitHub
  user-attachment URL. That URL only renders inside GitHub, so it cannot simply
  be pasted here.

  What belongs in this slot: the same walkthrough, re-hosted somewhere this
  site can embed it, placed immediately after the `init` command above and
  before the wizard steps — the reader has just been told what to type and has
  not yet been told what they will see.
-->

## What the wizard asks

The wizard has six steps. You can go back at any point.

1. **Stack** — pick a pre-built stack, or "Start from scratch". A stack is a
   named selection of skills for a common setup; picking one gives you a
   starting point rather than a blank grid. See
   [Stacks](/docs/concepts/stacks).
2. **Domains** — which areas you are configuring: web, api, cli, mobile,
   shared, and so on. This decides which categories the next step shows you.
3. **Build** — the skill grid, organised by category. This is the main step:
   one framework, one styling approach, one test runner, and so on. Categories
   marked exclusive take a single choice.
4. **Sources** — where each skill comes from, if you have more than one source
   registered. With only the default catalogue there is nothing to decide here.
5. **Agents** — which sub-agents to compile from what you just selected.
6. **Confirm** — the summary. Nothing is written until you accept it.

If you take a stack's defaults without customising, the middle steps are
skipped.

## What exists afterwards

Take the wording of the summary the CLI prints seriously — it names the exact
directories it wrote to, and where those are depends on the scope you chose.

**Your configuration**, in `.claude-src/`:

| File              | What it is                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `config.ts`       | Plain TypeScript, meant to be hand-edited. Your skills, your sub-agents, and the skill-to-agent `stack` mapping. |
| `config-types.ts` | Generated. Type unions narrowed to what you actually installed, so a mistyped skill id is a type error.          |

At global scope these live at `~/.claude-src/`.

**Your compiled sub-agents**, in `.claude/agents/` — one markdown file per
sub-agent. These are build outputs. Editing them directly works until the next
compile overwrites them; to change a sub-agent for real, see
[Customizing subagents](/docs/guides/customizing-subagents).

**Your skills**, in one of two places depending on install mode:

- **Plugin** (the default) — installed as Claude Code plugins under
  `.claude/plugins/`. Nothing is copied into your project.
- **Eject** — copied into `.claude/skills/`, yours to modify.

Mode is chosen per skill, so a real installation is often mixed. See
[Install modes](/docs/concepts/install-modes).

## The next command

Open `.claude-src/config.ts`, change something, and run:

```bash
npx agents-inc compile
```

`compile` is the command you will run most. It rebuilds every sub-agent from
the current config and is non-interactive, so it is safe in scripts and CI.
[Editing your config](/docs/guides/editing-config) covers what is worth
changing in there — mainly the `stack` mapping, which decides which skills each
sub-agent receives, and whether each one is preloaded into the prompt or loaded
on demand.

## When something looks wrong

```bash
npx agents-inc doctor
```

Health checks over the installation: config parses, skills resolve, sub-agents
compiled, no orphans, source reachable. It exits non-zero if any check fails.

`npx agents-inc list` shows what is installed. The full set is in the
[commands reference](/docs/reference/commands).

## Changing your mind

```bash
npx agents-inc edit
```

Re-opens the wizard with your current selections loaded, shows a diff at the
confirm step, and on confirm reinstalls, rewrites the config and recompiles.

To pull newer skill content from the source, `npx agents-inc update`. It shows
a diff, asks for confirmation, and recompiles afterwards.
