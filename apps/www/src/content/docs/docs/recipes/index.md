---
title: Recipes
description: Six task-shaped pages that each finish one job — handing a sub-agent a skill, taking local ownership of one, sharing a setup, pointing at your own catalogue, running headless in CI, and tuning a sub-agent's model.
sidebar:
  order: 0
---

A recipe finishes a task. A guide teaches a subject — [Editing your config](/docs/guides/editing-config) walks the whole config file, and [Install modes](/docs/concepts/install-modes) explains what plugin and eject mean. A recipe assumes you already know why you're here, gets you to a working result, and names the one place people go wrong.

Each one links back to the page that explains the machinery rather than explaining it again.

All but the CI one start in the editor, with a command at the end to write the result, so each page leads with that route. What sits underneath varies: sometimes it's the same job done in the wizard, and sometimes — routing a skill to one sub-agent, pinning a model — the wizard has no control for it at all and the terminal route is a hand edit of `.claude-src/config.ts`. Each page says which.

## Quick start

Pick the job you came for.

| Recipe                                                                       | What it does                                                                      |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Give one sub-agent a skill](/docs/recipes/give-one-agent-a-skill)           | Route a skill to a single sub-agent so the others don't get it.                   |
| [Switch a skill from plugin to eject](/docs/recipes/switch-a-skill-to-eject) | Take local ownership of a skill's files so you can modify them.                   |
| [Share a setup with a teammate](/docs/recipes/share-with-a-teammate)         | Mint an id from a setup, and know what travels with it.                           |
| [Use a private marketplace](/docs/recipes/use-a-private-marketplace)         | Point an installation at your own catalogue, from the editor or the CLI.          |
| [Run Agents Inc in CI](/docs/recipes/compile-in-ci)                          | Which commands are safe headless, and what a script should check.                 |
| [Tune a sub-agent's model](/docs/recipes/tune-an-agents-model)               | Set model and thinking effort per sub-agent, and see where the default came from. |
