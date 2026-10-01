---
title: Scopes and paths
description: Where project scope and global scope each write, how a project config reads the global one, why globally installed items are read-only inside a project, and what the five path-override fields actually override.
sidebar:
  order: 3
---

Every skill and every sub-agent carries a `scope`, and it's the field that decides which directory tree its files land in. This page is where each scope writes, how the two configs relate, and the five fields that override a path — none of which mean what their names suggest.

## Quick start

To see what you have and where it lives:

```bash
npx agents-inc list
```

Skills and sub-agents are printed under `Project` and `Global` headings, so the scope of each is on screen. The roots those headings stand for:

| Scope     | Config                           | Compiled agents     | Ejected skills      | Plugin skills        |
| --------- | -------------------------------- | ------------------- | ------------------- | -------------------- |
| `global`  | `~/.agents-inc/claude/config.ts` | `~/.claude/agents/` | `~/.claude/skills/` | `~/.claude/plugins/` |
| `project` | `.agents-inc/claude/config.ts`   | `.claude/agents/`   | `.claude/skills/`   | `.claude/plugins/`   |

Those are a **Claude Code** installation's roots. A [Codex](/docs/configuration/providers) installation, which is not in a release yet, reads scope the same way and writes somewhere else entirely:

| Scope     | Config                          | Compiled agents            | Ejected skills        | Plugin skills          |
| --------- | ------------------------------- | -------------------------- | --------------------- | ---------------------- |
| `global`  | `~/.agents-inc/codex/config.ts` | `$CODEX_HOME/agents/`      | `$CODEX_HOME/skills/` | `$CODEX_HOME/plugins/` |
| `project` | `.agents-inc/codex/config.ts`   | `.codex/agents/` _(trust)_ | `.agents/skills/`     | — not offered          |

`$CODEX_HOME` is Codex's own state root, `~/.codex` unless that variable relocates it. _(trust)_ marks the one root whose contents are read only while your global `$CODEX_HOME/config.toml` trusts that exact project directory — the install says so when it is missing.

:::note[If your install says `.claude-src/`]
`.agents-inc/<provider>/` is not in a release yet: 0.164.0 writes `.claude-src/`. An installation on `.claude-src/` keeps it — every command reads **and writes** it there, and **no command moves it**. Everywhere this documentation writes `.agents-inc/claude/`, read `.claude-src/` if that is what your project holds. From the next release, `npx agents-inc doctor` warns about it; [moving it by hand](#moving-an-installation-off-claude-src) is what clears the warning.
:::

**Changing a `scope` value by hand doesn't move anything.** It edits the manifest, not the disk. Press `s` on the row in `npx agents-inc edit` instead — that runs the install at the new scope.

:::note[Doing this from the editor]
Both halves are controls there, and nothing has to move because nothing has landed yet. A skill's `project`/`global` badge sits on its cell in the grid, repeated as **Install scope** in the panel behind its `•••` button; a sub-agent's scope is the word on its roster row. `npx agents-inc init --from <id>` writes what you picked straight into `config.ts`.
:::

## Why global is the default

Global scope is where everything lands unless you say otherwise, and [Global-first setup](/docs/guides/global-first-setup) makes the case for keeping it that way. Project scope is for the project that deviates: a different framework, a database only this repository uses, a sub-agent that needs a different skill mapping.

## How a project config reads the global one

A project's `config.ts` is written with the global installation inlined into it. The `skills` and `agents` arrays carry both, under `// global` and `// project` section comments:

<!-- prettier-ignore -->
```typescript
const skills: SkillConfig[] = [
  // global
  { id: 'web-framework-react', scope: 'global', origin: 'agents-inc' },
  // project
  { id: 'web-testing-vitest', scope: 'project', origin: 'agents-inc' },
]
```

So a project file describes the whole picture, not just its own half. Two things stay behind in the global file: `stack` entries for global-scoped sub-agents, and the `projects` array. A project's `stack` is filtered to its own project-scoped sub-agents.

`config-types.ts` follows the same split. The project's imports the global type unions and extends them, so a project-only skill is a valid `SkillId` there and nowhere else.

**Two settings resolve differently across the two files.** `marketplace` and `author` resolve per **file** — if a project config exists at all, its values win and the global one isn't consulted. `branding` resolves per **field**: a project that says nothing about branding inherits the global name rather than falling back to the shipped default. That distinction is deliberate, and [Models and effort](/docs/configuration/models-and-effort#branding) has the reasoning.

## Globally installed items are read-only inside a project

A skill or sub-agent installed at global scope belongs to the global config, and a project may not remove it. In the wizard, space is inert on those rows and it says `Global skills cannot be changed from project scope`. The global install is shared by every project, so one project must not be able to uninstall it for the others.

You have three ways forward, and only the third actually uninstalls anything:

- **Don't hand it to this project's sub-agents.** Leave the skill out of the relevant entry in `stack`. It stays installed and no prompt here mentions it.
- **Take your own copy.** Press `s` on the row to add a project-scoped copy alongside the global install — the row then shows both `[P]` and `[G]`.
- **Actually remove it.** Run `npx agents-inc edit` from your home directory, where the global config is the one being edited.

**What the config writes for the first option is a tombstone**: a `{ scope: 'global', excluded: true }` entry in the project file. It masks the global item for this project and leaves every other project untouched. An active entry for the same id at project scope overrules it — which is what the second option writes.

## The scope rule compile enforces

A global-scoped sub-agent only carries global-scoped skills. Since `config.ts` is hand-editable, you can write the pair it forbids, and `compile` won't silently honor it — the reference is dropped and each offending pair is named:

```
Sub-agent 'web-developer' cannot carry project-scoped skill 'web-testing-vitest' — global-scoped sub-agents only carry global-scoped skills.
```

Nothing in `config.ts` is rewritten, so the row survives and the warning repeats until you fix it. Move the skill to global scope, or move the sub-agent to project scope.

**The editor holds the same rule up front.** Each offending row carries a marker whose tooltip reads `This sub-agent must be set to project scope too`, Share is disabled, and the Install button counts what's left to move instead of what would install — `2 sub-agents need project scope` in place of its usual inventory. So a configuration built there can't carry the pair as far as an install, and `config.ts` is where one comes from.

## The `projects` registry

`projects` is a `string[]` and it appears in the global config only — a project emission strips it. It's the list of project directories the global installation knows about, and it's how a change made at global scope reaches them.

**You don't maintain it.** Installing into a project registers that project's real path, with symlinks resolved, and entries whose `.agents-inc/claude/config.ts` no longer exists are dropped on the next write. `uninstall` deregisters.

**What it buys you**: running `npx agents-inc compile` from your home directory rewrites each registered project's `config.ts` and `config-types.ts` so the inlined global half is current, and recompiles them. Without the registry a global change would be invisible to every project until you visited it.

A registered project the fan-out can't reach is warned by name and the run continues. The type unions at the scope you compiled were still written.

## Moving an installation off `.claude-src/`

**Not in a release yet, and not something to do on 0.164.0** — that release reads `.claude-src/` alone, so a folder moved for it is an installation it can no longer find.

From the next release, `doctor` warns on each scope still on the old folder, and says what to do:

```
    Layout                  !  This project is on .claude-src/, which this CLI goes on reading and writing — move its contents into .agents-inc/claude/ by hand to be on the current layout
```

The warning is the whole consequence: nothing stops working, and no command moves the folder. To move one, in the scope's own root — the project directory, or your home directory for the global installation:

```bash
mkdir -p .agents-inc
mv .claude-src .agents-inc/claude
npx agents-inc compile
```

**Move it, don't copy it.** While a scope holds both folders, `init`, `edit`, `compile`, `update` and `eject` refuse with `Refusing to write while two source folders are on disk.`, after a line naming the folder being read and asking you to move what you want to keep into it and delete the other. Nothing merges them. `doctor` still reports, as a failed `Layout` row.

**`compile` is part of the move.** A project's `config-types.ts` imports the global one's by a relative path, which the move changes, and `compile` rewrites it. After moving the global folder, `compile` from your home directory rewrites the projects in [the `projects` registry](#the-projects-registry); any other project with its own config needs its own `compile`.

**Check your `.gitignore` before you commit.** A rule ignoring `.agents-inc/` hides the moved config, and the commit records only the deletion of `.claude-src/`. `git check-ignore -v .agents-inc/claude/config.ts` prints the rule if there is one.

## The five path overrides

`skillsDir`, `agentsDir`, `stacksFile`, `categoriesFile` and `rulesFile` are the five fields whose names suggest they configure your installation. **They don't.** Every one of them is read from a _marketplace repository's_ own `.agents-inc/config.ts` — the config in the repository the CLI is fetching skills _from_. Note the missing provider segment: a source repo's config is provider-neutral, because `skillsDir` and `stacksFile` describe that repository's own layout and have nothing to do with which assistant installs from it. Setting one in your own project config changes nothing about your project.

| Field            | What a marketplace declares with it | Default                      | Read?                  |
| ---------------- | ----------------------------------- | ---------------------------- | ---------------------- |
| `skillsDir`      | where its skills live               | `src/skills`                 | Yes                    |
| `stacksFile`     | where its stacks file lives         | `config/stacks.ts`           | Yes                    |
| `agentsDir`      | where its sub-agent partials live   | `src/agents`                 | No — never reached     |
| `categoriesFile` | where its categories file lives     | `config/skill-categories.ts` | No — the path is fixed |
| `rulesFile`      | where its relationship rules live   | `config/skill-rules.ts`      | No — the path is fixed |

`agentsDir` is declared but unreachable: sub-agent definitions ship with the CLI and are never fetched from a marketplace, so the branch that would read it has no caller. `categoriesFile` and `rulesFile` load, validate and survive a rewrite, and nothing consults them — the categories and rules files are looked for at their fixed paths.

**An unreadable source config aborts rather than defaulting.** If a marketplace's own config can't be read, the run stops. Falling back to `src/skills` for a marketplace that says its skills are elsewhere would walk an empty tree and report the catalog as empty, which looks like a marketplace with no skills rather than a config that failed to load.

## When overriding one is the right move

Only when you're **authoring a marketplace** whose layout differs from the scaffold. `npx agents-inc new marketplace <name>` writes `src/skills/`, `config/stacks.ts`, `config/skill-categories.ts` and `config/skill-rules.ts` — keep that layout and you never need these fields. Reach for `skillsDir` or `stacksFile` when you're adapting an existing repository whose skills already live somewhere else, rather than moving them to suit the defaults.

They go in the marketplace repository's own `.agents-inc/config.ts`, and once committed they apply to everyone who installs from it. That name is not in a release yet — 0.164.0 reads `.claude-src/config.ts` alone. A repository still declaring `.claude-src/config.ts` is read there indefinitely, and there is no plan to stop: the CLI can never move a folder in a repository it only reads, and an author who moved it would break every consumer on an older CLI. **The scaffold deliberately doesn't write that file** — a config manifest in a repository of skills makes `doctor` diagnose an installation that isn't there — so adding one is a decision, and the standard layout is the reason you rarely need to. See [Creating a marketplace](/docs/guides/creating-a-marketplace).
