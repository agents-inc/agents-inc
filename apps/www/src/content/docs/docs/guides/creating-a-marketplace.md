---
title: Creating a marketplace
description: Build a personal or org-level marketplace of skills curated for your own conventions, and distribute it to your team.
sidebar:
  order: 7
---

Build a personal or org-level marketplace with skills curated for your conventions.

## Getting Started

A marketplace is an ordinary Git repository, so you create one by hand. There is no scaffolding
command: the one that used to be here was withdrawn rather than left broken, and a replacement is
planned.

Four things make a directory a marketplace the CLI can read:

```
package.json                  # name, version and description are required; author is optional
config/skill-categories.ts    # the categories your skills fall into
config/skill-rules.ts         # the relationships between them
config/stacks.ts              # the stacks the wizard offers
src/skills/{skill-name}/      # at least one skill — SKILL.md + metadata.yaml
```

Copy the shapes of those four config files from the public marketplace at
[agents-inc/skills](https://github.com/agents-inc/skills), which is the reference implementation of
every one of them. `npx agents-inc doctor` reads a marketplace and reports what is missing or
malformed, so run it against your directory before pointing a project at it.

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
