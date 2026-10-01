---
title: Claude or Codex
description: The provider is the coding agent your installation is for. You pick it in the web app, the folder on disk records it, and this page is what each one can and cannot do — placements and sub-agents.
sidebar:
  order: 6
---

:::note[Codex is not in a release yet]
0.164.0 installs onto Claude Code only, and has no `--provider` flag. Everything on this page about Codex describes the next release, and so do the `.agents-inc/<provider>/` folder names: 0.164.0 keeps its source folder at `.claude-src/`.
:::

An installation belongs to one **provider** — the coding agent it is for. There are two: **Claude Code** and **OpenAI Codex**.

You pick it in the [web app](/docs/editor). There is no question about it in the terminal wizard, because the choice changes one visible thing: the command the app hands you to paste.

```bash
npx agents-inc init --from Ab3xY9_Q                    # Claude Code
npx agents-inc init --from Ab3xY9_Q --provider codex   # Codex
```

Everything after that install reads the provider off the folder the install created, so no later command needs the flag — unless one scope holds an installation of each, [below](#the-folder-is-the-record).

## The folder is the record

One installation is exactly one provider, and the folder name says which:

| Provider    | Global source folder    | Project source folder        |
| ----------- | ----------------------- | ---------------------------- |
| Claude Code | `~/.agents-inc/claude/` | `<repo>/.agents-inc/claude/` |
| Codex       | `~/.agents-inc/codex/`  | `<repo>/.agents-inc/codex/`  |

**Nothing inside `config.ts` records the provider.** There is no `provider` field and there will not be one — that is what lets one saved configuration install onto either provider, and what keeps every share id ever minted working. A configuration is a list of skills and sub-agents; which agent runs them is a fact about the machine you install on.

**The two sit side by side.** A machine can hold a Claude installation and a Codex one, and so can a single repository. One project can be on Codex while another is on Claude. Each family inherits and propagates only within itself: a Claude global never reaches a Codex project.

When one scope holds **both**, the commands that change something — `edit`, `uninstall`, `share`, `eject`, `compile`, `update` — stop rather than guess, name both installations and ask for `--provider`. `doctor` and `list` keep reporting, because that state is exactly what you look at them to see: `doctor` reports it as a finding, and `list` names both above the one it is showing and tells you the flag that shows the other.

:::caution[Copying a folder does not convert an installation]
`.agents-inc/claude/` copied to `.agents-inc/codex/` is a Codex folder holding a Claude configuration that never met the Codex install's pre-flight, and nothing it installed moves. Where it asks for a placement Codex does not offer, `compile`, `edit`, `update` and `share` refuse it by name and `doctor`'s `Placements Offered` row reports it. To change provider: `npx agents-inc uninstall`, then `init --from <id> --provider <the other one>`.
:::

## What each provider does with a skill

A skill is the same content on both: the same marketplace, the same `SKILL.md`. What differs is where it can be put — the **install mode** (plugin or eject) crossed with the **scope** (global or project).

| Placement        | Claude Code                   | Codex                                                            |
| ---------------- | ----------------------------- | ---------------------------------------------------------------- |
| plugin + global  | `~/.claude/plugins/`          | `$CODEX_HOME/plugins/`, switched on in `$CODEX_HOME/config.toml` |
| eject + global   | `~/.claude/skills/<id>/`      | `$CODEX_HOME/skills/<id>/`                                       |
| eject + project  | `<repo>/.claude/skills/<id>/` | `<repo>/.agents/skills/<id>/` — a file you commit                |
| plugin + project | `<repo>/.claude/plugins/`     | **not offered**                                                  |

**Codex offers three of the four cells.** Codex installs a plugin for a machine, not for a repository: no `plugin` subcommand takes a scope, and running `codex plugin add` inside a project writes the switch to the global configuration anyway. So a configuration asking for `plugin + project` on Codex is refused — before anything is written, naming the skill and the three cells that are offered. It is never quietly turned into an ejected copy.

**A Codex project skill is a committed file rather than an install.** `<repo>/.agents/skills/<id>/SKILL.md` reaches the model in that repository and nowhere else, with no plugin, no marketplace, no trust entry and no configuration file at all. Check it in and your colleagues have it.

`<repo>/skills/` is **not** a directory Codex reads. Nothing writes there.

## What each provider does with a sub-agent

|                     | Claude Code                        | Codex                                                                   |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| Sub-agents compiled | all 18                             | **16 of 18**                                                            |
| File written        | `<scope>/.claude/agents/<name>.md` | `$CODEX_HOME/agents/<name>.toml`, or `<repo>/.codex/agents/<name>.toml` |
| Format              | Markdown with frontmatter          | an agent role definition in TOML                                        |

**Two sub-agents are absent from every Codex install: `agent-summoner` and `skill-summoner`.** They are left out for v1 because their roster mechanics on Codex are not proven. Every shipped stack lists both, so every Codex install says so — once per run, in one line naming both.

**Six settings have no Codex expression**, and the compile says so once rather than per sub-agent:

| Setting          | Why not                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Claude models    | every model a sub-agent can name is Claude's, and Codex refuses to start a role naming one. The role runs on your Codex model     |
| tool allowlists  | Codex's `tools` is a configuration struct, not a list of permitted tools. The read-only sub-agents can still edit files on Codex  |
| `permissionMode` | rejected by the parser; one unlisted key drops the whole role file                                                                |
| `isolation`      | same                                                                                                                              |
| `experimental`   | same                                                                                                                              |
| preloaded skills | `skills` on a role is a bundled-skills toggle, not a list of skills to read first. A preloaded skill is left out of the role file |

**A sub-agent's `disallowedTools` is dropped too, and the compile does not say so.** No bundled sub-agent declares one, so this reaches only a sub-agent you wrote yourself.

A sub-agent's **effort** does carry across, written as Codex's own `model_reasoning_effort` key. Its **model** does not: a role file carries none, so every sub-agent runs on the model your Codex session uses.

### A Codex project's sub-agents need the project trusted

Role files under `<repo>/.codex/agents/` reach the model only while your **global** `$CODEX_HOME/config.toml` holds a trust entry for that exact directory:

```toml
[projects."/absolute/path/to/your/repo"]
trust_level = "trusted"
```

**Four ways this fails, and every one of them is silent** — no warning from Codex, anywhere: no entry at all; `trust_level = "untrusted"`, which beats any permissive sandbox flag; a trailing slash on the path; and the entry written inside the project's own `.codex/config.toml`, which Codex refuses as self-authorisation.

So `init` and `compile` **write it for you** — not in a release yet — and print exactly what they wrote: your project, the file and the line. The rest of your configuration is left as it was. If you have already set `trust_level` for that directory to anything else, `"untrusted"` included, it is left as you set it and the install says so.

**An untrusted Codex project install is half live, which is worse than dead.** Skills at `.agents/skills` reach the model with no trust entry and no configuration file at all, while sub-agents, plugin enablement and hooks are ignored in silence. `doctor` does not check project trust — the line `init` and `compile` print is the only notice.

## What each provider cannot do

Plainly, because these are the limits most likely to be met the hard way.

### Claude Code

| Cannot                                                                | What it means                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run the completion gate of a project sub-agent in an untrusted folder | Claude Code registers a project sub-agent's hooks only after you accept the trust dialog in that folder, and the completion gate — the `Stop` hook that runs your project's typecheck — is one of them. A headless run — `claude -p`, CI, a fresh checkout nobody has opened — skips it at project scope, and looks exactly like a typecheck that passed. Opening the folder once interactively is the fix; `init` and `compile` say so while it applies |
| Have a skill that is only a committed file                            | Codex reads `<repo>/.agents/skills/` with no install of any kind. Claude Code's project skills are an install into `<repo>/.claude/`, which `init`, `edit` or `eject` performs                                                                                                                                                                                                                                                                           |

### Codex

| Cannot                                                                        | What it means                                                                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install a plugin for one project                                              | No subcommand takes a scope. `plugin + project` is refused, naming the three cells that are offered                                                           |
| Ship the two summoner sub-agents                                              | `agent-summoner` and `skill-summoner` are left out for v1                                                                                                     |
| Restrict a sub-agent's tools                                                  | `tools` is a configuration struct rather than an allowlist. `[features] shell_tool = false` is the one real limit a role file can express                     |
| Carry `permissionMode`, `isolation` or `experimental`                         | The parser rejects the whole file on any of them                                                                                                              |
| Preload a named list of skills                                                | `skills` on a role is a toggle. A preloaded skill is left out of the role file                                                                                |
| Read a project's sub-agents, plugin switches or hooks in an untrusted project | Silently. See [above](#a-codex-projects-sub-agents-need-the-project-trusted)                                                                                  |
| Be advised about permissions by this CLI                                      | The permissions guidance this CLI prints is Claude Code's `settings.json` model, which Codex does not have. Nothing is printed rather than something invented |

### Both

| Cannot                                                     | What it means                                                                                                                                                                            |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install a plugin-mode skill without the provider's own CLI | `claude` or `codex` has to be on `PATH`. The run says which one is missing and what to do about it, rather than naming the other                                                         |
| Be converted to the other provider in place                | `uninstall`, then `init --from <id> --provider <the other one>`. The installed output differs in format and location, so a convert path would have to delete the other provider's output |

## Checking which provider you are on

```bash
npx agents-inc doctor
```

The `Layout` row says which folder each scope is on. `Placements Offered` carries the two states in which no other command will act on this installation: a configuration asking for a cell its provider does not offer, and a scope holding an installation of each provider. It reports both rather than refusing, because those are exactly the states you need to be able to look at.

## Related

- [Install modes](/docs/concepts/install-modes) — plugin versus eject, the choice the placement table crosses with scope
- [Scopes and paths](/docs/configuration/scopes-and-paths) — global versus project, and where each writes
- [Sub-agent anatomy](/docs/reference/sub-agent-anatomy) — what a compiled sub-agent carries
- [Commands](/docs/reference/commands) — `--provider`, and the commands that ask for it
