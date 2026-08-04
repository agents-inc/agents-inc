---
title: Creating a marketplace
description: Build a personal or org-level marketplace of skills curated for your own conventions, and distribute it to your team.
sidebar:
  order: 7
---

:::caution[`new marketplace` is currently disabled]
The scaffolding command below is switched off in the released CLI while it is being improved. Running it exits with a non-zero status and prints `The new marketplace command is currently disabled while being improved.` — no directory is created.

A marketplace is an ordinary Git repository, so you can still build one by hand: create `config/skill-categories.ts`, `config/skill-rules.ts`, `config/stacks.ts`, a `package.json` with `name`, `version` and `description`, and at least one skill under `src/skills/`. Everything from **Workflow** onwards — including `build marketplace` and `build plugins` — works today.

The command is being improved, not removed.
:::

Build a personal or org-level marketplace with skills curated for your conventions.

## Getting Started

```bash
npx agents-inc new marketplace
```

Scaffolds a marketplace repository with the required structure and metadata.

## Workflow

1. Start with existing skills from the public marketplace or write your own
2. Iterate on skills using the `skill-summoner` subagent to align them with your project conventions
3. Build the marketplace index:

```bash
npx agents-inc build marketplace
```

This generates `marketplace.json`, the index that the CLI reads when installing from your marketplace.

4. Point projects at your marketplace by adding it as a custom source during `npx agents-inc init` or `npx agents-inc edit`

## Distribution

Marketplaces are Git repositories. Share them by giving your team access to the repo. Skills and stacks can also be packaged as Claude Code plugins:

```bash
npx agents-inc build plugins    # Package individual skills and agents
```
