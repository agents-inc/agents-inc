# Install Modes

Agents Inc supports two install modes and two scopes. Both can be set per-skill and per-agent independently from the wizard.

## Install Modes

**Plugin** (default) — Skills are installed as Claude Code plugins in `.claude/plugins/`. No files are copied into your project. Updates are pulled directly from the source.

**Eject** — Skills are copied into `.claude/skills/` in your project directory. Use this when you want full ownership of the skill files or need to modify them.

You can switch modes after initial install using `agentsinc edit`.

## Scopes

**Project** — Skills and subagents are installed into the current project only. Configuration lives in `.claude-src/config.ts`.

**Global** — Skills and subagents are installed at the user level (`~/.claude-src/config.ts`) and available across all projects.

You can mix scopes. For example, install a base set of skills globally and override specific ones at the project level.
