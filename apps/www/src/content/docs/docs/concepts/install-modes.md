---
title: Install modes
description: Plugin versus eject, and project versus global — the two independent choices that decide where a skill's files live and who can see them.
---

Agents Inc supports two install modes and two scopes. Both can be set per-skill and per-agent independently from the wizard.

## Install Modes

**Plugin** (default) — Skills are installed as Claude Code plugins, registered in Claude's own plugin store (`~/.claude/plugins/` for global scope, your project's `.claude/plugins/` for project scope). No files are copied into your project source. Updates are pulled directly from the source.

**Eject** — Skills are copied into `.claude/skills/` in your project directory. Use this when you want full ownership of the skill files or need to modify them.

You can switch modes after initial install using `npx agents-inc edit`.

## Scopes

**Project** — Skills and subagents are installed into the current project only. Configuration lives in `.claude-src/config.ts`.

**Global** — Skills and subagents are installed at the user level (`~/.claude-src/config.ts`) and available across all projects.

You can mix scopes. For example, install a base set of skills globally and override specific ones at the project level.

## Related

- [Global-first setup](/docs/guides/global-first-setup) — why global is the right default, and what happens to global entries when you edit from inside a project.
- [Customizing sub-agents](/docs/guides/customizing-subagents) — ejecting is not only for skills; partials and templates eject too.
