---
title: Agents Inc
description: Documentation for Agents Inc, an agent composition framework for Claude Code that compiles atomic skills into sub-agents.
---

Agents Inc composes Claude Code sub-agents out of atomic, reusable skills. You
pick the skills matching the stack you actually work in, and the CLI compiles
them into sub-agent files. Change a skill, recompile, and every sub-agent that
uses it is updated.

```bash
npx agents-inc init
```

## Start here

- [Why Agents Inc](/docs/why) — the problem, the approach, and who this is not
  for. Read this first if you have not decided yet.
- [Quickstart](/docs/quickstart) — what `init` asks, and what exists on disk
  afterwards.
- [CLI or web](/docs/cli-or-web) — the terminal wizard and the web
  editor, and how a configuration moves between them.

## Then

The **Concepts** pages define the four words this documentation uses
constantly: [skills](/docs/concepts/skills),
[sub-agents](/docs/concepts/sub-agents), [stacks](/docs/concepts/stacks) and
[install modes](/docs/concepts/install-modes).

The **Guides** are task-shaped: setting up global-first, editing your config,
customising sub-agents, writing and importing skills.

The **Reference** covers every [command](/docs/reference/commands) and the
[architecture](/docs/reference/architecture).

The skill catalogue lives in its own repository at
[github.com/agents-inc/skills](https://github.com/agents-inc/skills).
