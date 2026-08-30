---
title: Documenting your codebase
description: Use the codex-keeper sub-agent to generate and maintain AI-focused reference documentation for your codebase, structured so other sub-agents can navigate it.
sidebar:
  order: 8
---

`codex-keeper` creates AI-focused documentation for your codebase, structured for navigation by subagents.

## Quick start

`codex-keeper` is a [sub-agent](/docs/concepts/sub-agents), so you run it from Claude Code rather than from either front door. It sits in the `meta` domain and belongs at global scope, where one install serves every repository you point it at — see [Global-first setup](/docs/guides/global-first-setup). Click its row in the [editor](https://agentsinc.sh)'s roster to pin it on, and the install command writes it to `.claude/agents/codex-keeper.md`. From the terminal, `npx agents-inc edit` adds it and recompiles in the same run. Then ask it to start:

```
@codex-keeper initialize documentation for this codebase
```

It writes to `.ai-docs/` and adds a `## Generated Documentation` section to your `CLAUDE.md`, so your other subagents know where to look. The rest of this page is what it produces and how to keep it fresh.

## What it produces

`codex-keeper` writes to `.ai-docs/` and updates your project's `CLAUDE.md` with a `## Generated Documentation` section so other subagents know where to find the docs.

| Output                          | Purpose                                                   |
| ------------------------------- | --------------------------------------------------------- |
| `.ai-docs/DOCUMENTATION_MAP.md` | Coverage index with staleness tracking and priority queue |
| `.ai-docs/reference/*.md`       | Architecture, type system, store maps, etc.               |

For complex codebases it generates a `features/` subfolder with docs by feature. Once they exist, you and your subagents can reference them by name:

```
@web-developer see X feature documentation to understand how X works, then implement Y
```

## Setting up a documentation repository

The recommended setup keeps `.ai-docs/` as a standalone repo symlinked into your project. This lets you version documentation independently, share it across team members, and separate doc history from code history.

## Keeping docs fresh

Docs drift quickly. Run `codex-keeper` weekly to catch areas that have changed. It runs on `opus`, which is what a pass over an unfamiliar codebase wants; [Models and effort](/docs/configuration/models-and-effort) is how you change that for a smaller job.

## Modes

**New documentation**: Creates docs for undocumented areas. Start here for a fresh codebase.

```
@codex-keeper initialize documentation for this codebase
```

**Update**: Refreshes all or specific docs

```
@codex-keeper update any docs that are stale
```

```
@codex-keeper the batch processing feature changed significantly, update its docs
```
