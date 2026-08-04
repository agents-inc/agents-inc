---
title: Resources
description: The skills marketplace, the CLI repository and the changelog — where to go when you have left the documentation behind.
---

## Skills repository

[github.com/agents-inc/skills](https://github.com/agents-inc/skills)

The official marketplace and the default source the CLI reads from. It holds the skill catalogue itself — 222 skills across web, API, AI, mobile, infrastructure, shared tooling and meta practices, each one covering the patterns, conventions, anti-patterns and edge cases for a single technology.

Go there to:

- **Browse the catalogue** before you run `init`, and see exactly what exists for your stack.
- **Read a skill's source.** Every skill is plain markdown: `SKILL.md` plus a `metadata.yaml`, with optional `reference.md` and `examples/`.
- **Contribute one.** The repository ships a `skill-summoner` agent that researches current best practice and writes a fully structured skill package. It works from `.claude/agents/` without a CLI install.

Skills can also be installed straight from Claude Code, without the CLI:

```bash
/plugin marketplace add agents-inc/skills
/plugin install <skill-name>@agents-inc
```

## CLI repository

[github.com/agents-inc/agents-inc](https://github.com/agents-inc/agents-inc)

The source for `agents-inc` — the wizard, the compiler, and this site. MIT licensed. Issues and pull requests are welcome here.

## Changelog

[packages/cli/CHANGELOG.md](https://github.com/agents-inc/agents-inc/blob/main/packages/cli/CHANGELOG.md)

A summary index of every release, following [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic versioning. Each release also has fuller notes in its own file under [`changelogs/`](https://github.com/agents-inc/agents-inc/tree/main/packages/cli/changelogs).
