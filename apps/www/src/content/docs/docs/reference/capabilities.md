---
title: Capabilities
description: What you can do with Agents Inc, and whether the editor or the CLI does it — with the rule that decides why some things live in only one of them.
sidebar:
  order: 4
---

The editor at [agentsinc.sh/editor](/editor) is the front door and the `agents-inc` CLI is the engine. They are not the same tool and are not meant to be. This page lists what each one can do, area by area — and the last section says why a few things live in only one of them.

## Quick start

The editor is where you decide; the CLI is where it lands, because a web page cannot write to disk.

So the asymmetry that decides everything else is this: **the CLI is the only thing that installs.** Press Install in the editor and it hands you a command; run that command and the CLI does the writing.

The same goes for everything else that touches files — ejecting, compiling, diagnosing, removing.

**One route arrives at a selection from outside both**: the [stack-detection skill](/docs/guides/adding-to-an-existing-project) is a Claude Code plugin that produces a payload the CLI publishes, and the tables mark it where it lands rather than giving it a column. [Ways in](/docs/ways-in) sets it beside the composer and the grid.

## How to read the tables

Four markers, used the same way in every table below:

| Marker    | Means                                                                                   |
| --------- | --------------------------------------------------------------------------------------- |
| `yes`     | a control on that side does it                                                          |
| `no`      | it doesn't                                                                              |
| `by hand` | the CLI gets there, but by editing files yourself rather than through a command         |
| `n/a`     | the question doesn't apply to that side — usually because the editor never touches disk |

## Choosing what to install

| Capability                                   | CLI       | Editor | Note                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start from a stack                           | `no`      | `yes`  | The stack grid in Configure. See [Stacks](/docs/concepts/stacks).                                                                                                                                                                                                                 |
| Take a stack's whole roster without picking  | `no`      | `yes`  | In the editor, clicking a stack cell applies it — and replaces whatever was selected.                                                                                                                                                                                             |
| Save your own selection as a stack           | `no`      | `yes`  | **Save** keeps the selection under a name — as many as you like — and each appears in the grid beside the catalogue's own stacks. Nothing on the CLI side saves a stack.                                                                                                          |
| Toggle individual skills                     | `no`      | `yes`  | A click in the editor's grid.                                                                                                                                                                                                                                                     |
| Describe a project and have skills proposed  | `no`      | `yes`  | [The composer](/docs/editor/composer) — a sentence in, skill ids and a reason back, as a proposal you apply or discard. Needs a GitHub sign-in, because it calls a model.                                                                                                         |
| Have a repository read and a config proposed | `n/a`     | `n/a`  | Neither: the [stack-detection skill](/docs/guides/adding-to-an-existing-project) runs in Claude Code and emits a payload. The CLI turns it into an id; see the `share --stdin` row below.                                                                                         |
| See why a skill can't be picked              | `no`      | `yes`  | In the editor a ruled-out cell is dimmed and carries the reason.                                                                                                                                                                                                                  |
| One-of categories evict the current pick     | `no`      | `yes`  | The editor remembers the evicted skill's whole setup, so swapping back restores it.                                                                                                                                                                                               |
| Write a skill of your own                    | `by hand` | `no`   | Drop `SKILL.md` and `metadata.yaml` into `.claude/skills/<name>/` and the CLI finds it on the next load; a sub-agent gets it only once [`stack`](/docs/configuration/config-reference#stack-in-detail) names it. See [Writing custom skills](/docs/guides/writing-custom-skills). |
| Add a skill from a GitHub repository         | `no`      | `yes`  | **＋ Add skill** searches a federated index and fetches the whole directory, up to 256 KB. This is the intake path — see the last section.                                                                                                                                        |
| Give an added skill a category               | `no`      | `yes`  | A dropdown in the same dialog, with no guessing fallback. Nothing on the CLI side creates a skill that would need one.                                                                                                                                                            |
| Read an added skill's files                  | `no`      | `yes`  | The **added** tag opens the directory read-only, as plain text.                                                                                                                                                                                                                   |

## Install mode and scope

Both choices are per skill, and they're independent of each other. [Install modes](/docs/concepts/install-modes) explains what each one means.

| Capability                                     | CLI   | Editor | Note                                                                                                                                                                                                           |
| ---------------------------------------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set a skill to plugin or eject                 | `no`  | `yes`  | The `•••` options panel in the editor.                                                                                                                                                                         |
| Change an installed skill's mode later         | `yes` | `n/a`  | `npx agents-inc edit --from <id>` copies or deletes the directory and adds or removes the plugin registration. The editor holds a declaration, so there's nothing to migrate.                                  |
| Put one skill at global scope                  | `no`  | `yes`  | The scope segment in the options panel. Global is the default. See [Global-first setup](/docs/guides/global-first-setup).                                                                                      |
| Put one sub-agent at global scope              | `no`  | `yes`  | The scope pair on its sub-agent card.                                                                                                                                                                          |
| Catch a skill that can't reach its sub-agent   | `yes` | `yes`  | A project-scoped skill never reaches a globally-scoped sub-agent. One rule, read by both: the CLI drops the pair and warns at compile, the editor marks the row and blocks Install and Share until you fix it. |
| Fork every marketplace skill for local editing | `yes` | `n/a`  | `npx agents-inc eject skills` copies them all into `.claude/skills/`. There's no per-skill filter — for one skill, set that row to eject instead.                                                              |
| Choose which provider an installation is for   | `yes` | `yes`  | The provider cards in step 01, resting on Claude. Codex reaches the CLI as `--provider codex` in the command Install hands you; the flag needs `--from`. See [Claude or Codex](/docs/configuration/providers). |
| Install a skill as a plugin, for one project   | `yes` | `yes`  | On Claude. **Codex offers three of the four cells** and refuses this one by name, because it installs plugins for a machine rather than for a repository.                                                      |

## Sub-agents

| Capability                                        | CLI       | Editor | Note                                                                                                                                                                                                                             |
| ------------------------------------------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Choose which sub-agents get compiled              | `by hand` | `yes`  | Clicking a name on the roster.                                                                                                                                                                                                   |
| Install a sub-agent carrying no skills            | `yes`     | `yes`  | A base agent — allowed on both.                                                                                                                                                                                                  |
| Pin a sub-agent's model                           | `by hand` | `yes`  | The model row on its sub-agent card. `--from` carries one in. See [Models and effort](/docs/configuration/models-and-effort).                                                                                                    |
| Pin a sub-agent's reasoning effort                | `by hand` | `yes`  | The effort track on the same card, `low` to `max`.                                                                                                                                                                               |
| Give a skill to one sub-agent and not another     | `by hand` | `yes`  | The sub-agent matrix in the editor's options panel. Per-agent routing is the `stack` block in [`config.ts`](/docs/configuration/config-reference), or a shared payload.                                                          |
| Preload a skill's text instead of lazy-loading it | `by hand` | `yes`  | Cycle the matrix cell to `pre`. On the CLI side it's `preloaded: true` in `config.ts` — no flag, no key.                                                                                                                         |
| Add a sub-agent that doesn't already exist        | `no`      | `no`   | The roster is the set of sub-agents the CLI ships. Ejecting a sub-agent's partials changes what an existing one says — see [Customizing sub-agents](/docs/guides/customizing-subagents).                                         |
| Edit what a sub-agent says                        | `yes`     | `n/a`  | `npx agents-inc eject agent-partials` and `eject templates`, then `compile`.                                                                                                                                                     |
| Compile all eighteen sub-agents                   | `yes`     | `n/a`  | On Claude. **A Codex installation compiles sixteen** — `agent-summoner` and `skill-summoner` are left out for v1. Both render disabled with the reason in the editor, and stay in the payload so an id works on either provider. |
| Restrict which tools a sub-agent may use          | `yes`     | `n/a`  | On Claude, through the compiled `tools` list. **A Codex role file cannot express a tool allowlist** — `[features] shell_tool = false` is the one limit it has. See [Claude or Codex](/docs/configuration/providers).             |

## Installing and sharing

| Capability                                        | CLI   | Editor | Note                                                                                                                                                                                                                         |
| ------------------------------------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install onto this machine                         | `yes` | `n/a`  | The editor cannot write to disk. Its Install dialog is an inventory and a command — there's no Install button in it.                                                                                                         |
| Mint a shareable id                               | `yes` | `yes`  | `npx agents-inc share`, or **Share**, which copies a `?fromId=` link. The id is the configuration's own hash, so re-sharing something unchanged returns the same id.                                                         |
| Install a shared configuration                    | `yes` | `n/a`  | `npx agents-inc init --from <id>`, into a directory with no install. It runs headless, over a pipe and in CI.                                                                                                                |
| Apply a shared configuration over an existing one | `yes` | `n/a`  | `npx agents-inc edit --from <id>`, which also removes what the payload leaves out. It needs a terminal and refuses on a pipe, because it asks you to confirm the removals.                                                   |
| Open a shared configuration to look at it         | `no`  | `yes`  | `?fromId=` is an address rather than a one-shot import, so a reload reopens the same thing. Your own configuration is untouched while it's on screen.                                                                        |
| Preview the files an install would write          | `no`  | `yes`  | **Preview** renders from the same code the CLI writes with. The CLI has no dry run.                                                                                                                                          |
| Carry a skill's own files inside a shared link    | `yes` | `yes`  | An added skill travels as its bytes, so `init --from` writes it without ever reaching GitHub.                                                                                                                                |
| Mint an id from a payload you already hold        | `yes` | `no`   | `cat proposal.json \| npx agents-inc share --stdin`, for anything that produces a configuration but can't apply one — the [stack-detection skill](/docs/guides/adding-to-an-existing-project) is the producer it exists for. |
| Open the editor from the terminal                 | `yes` | `n/a`  | A bare `npx agents-inc edit` publishes this installation and opens it, and a bare `init` opens the editor where nothing is installed. `edit --ui --from <id>` opens that id instead and touches nothing local.               |

[Share with a teammate](/docs/recipes/share-with-a-teammate) runs the round trip end to end.

## Marketplaces

| Capability                                        | CLI       | Editor | Note                                                                                                                                                                                                                                            |
| ------------------------------------------------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install from a marketplace other than the default | `yes`     | `yes`  | `npx agents-inc init --from <id> --marketplace github:acme/skills`, or `CC_MARKETPLACE`. In the editor, **Marketplace** in the nav rail.                                                                                                        |
| Change an installed project's marketplace         | `by hand` | `yes`  | `--marketplace` belongs to `init` alone — every later command reads the ref the install recorded. Edit `marketplace` in the installation's `config.ts` to move one.                                                                             |
| Hold several marketplaces and switch between them | `no`      | `yes`  | The editor keeps every ref it has loaded, each with its own credential, and offers a switch button per saved one. An installation names a single marketplace.                                                                                   |
| Reach a private repository                        | `yes`     | `yes`  | `export GIGET_AUTH=<token>` for the CLI; a personal access token per marketplace for the editor, which stays in your browser and never reaches the Agents Inc worker. See [Use a private marketplace](/docs/recipes/use-a-private-marketplace). |
| See what a switch would cost before it happens    | `n/a`     | `yes`  | The editor names the skills a switch would drop and asks a second time before it does.                                                                                                                                                          |
| Refresh what a marketplace holds                  | `yes`     | `n/a`  | `npx agents-inc update`, once per marketplace your config names. Ejected skills are copies you own and are never touched.                                                                                                                       |
| Scaffold a marketplace of your own                | `yes`     | `n/a`  | `npx agents-inc new marketplace <name>`. See [Creating a marketplace](/docs/guides/creating-a-marketplace).                                                                                                                                     |
| Build and publish one                             | `yes`     | `n/a`  | `npx agents-inc build plugins`, then `npx agents-inc build marketplace`.                                                                                                                                                                        |

## Inspecting and maintaining

Everything here reads or writes your machine, so all of it is the CLI's. [Commands](/docs/reference/commands) has the flags.

| Capability                          | CLI   | Editor | Note                                                                                                                                                                                                                                                                        |
| ----------------------------------- | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| See what's installed                | `yes` | `n/a`  | `npx agents-inc list`. It falls back to the global installation when the directory has no project one.                                                                                                                                                                      |
| Diagnose a broken installation      | `yes` | `n/a`  | `npx agents-inc doctor` checks config validity, the source-folder layout, the placements the provider offers, skill resolution, agent compilation, orphans, plugin registration and marketplace reachability. See [Common problems](/docs/troubleshooting/common-problems). |
| Rebuild sub-agents from your config | `yes` | `n/a`  | `npx agents-inc compile`, one scope per run.                                                                                                                                                                                                                                |
| Search the catalogue                | `yes` | `yes`  | `npx agents-inc search <query>` matches id, name, slug, description and category, across the marketplace plus the local skills already on disk. In the editor, the search field filters the grid.                                                                           |
| Remove everything                   | `yes` | `n/a`  | `npx agents-inc uninstall`. It works even on a config it can't read.                                                                                                                                                                                                        |

## Where the CLI stops on purpose

A gap between the two columns isn't automatically a defect. The editor and the CLI are held to one rule, and the rule is about direction of travel.

**The CLI has to consume anything the editor produces.** A configuration the editor mints and the CLI can't install is a bug and gets fixed as one. That's why a skill you added from GitHub travels inside the shared link as its own files rather than as a reference — so `init --from` can write it on a machine that has never heard of that repository.

**It doesn't have to author what the editor authors.** Adding a skill from a repository is the editor's job, and so is the category dropdown that comes with it, because nothing on the CLI side creates a skill that would need one. Choosing a setup is the editor's job too, so a `no` or `by hand` against a choice in the tables above is this rule rather than a gap.

One more row is settled the same way. External skills install by ejecting on both sides — the CLI refuses a payload that asks for one as a plugin, rather than quietly changing the mode.

`agents-inc new skill` and `new agent` were both removed when the editor became the intake path, and they're **not** the same case: `new agent` isn't coming back, because a sub-agent is composed from partials and skills and ejecting the built-in partials already gives you what a scaffold would have written. `new skill` is deferred rather than declined — if it returns it will mimic the editor's intake flow rather than invent a second one. [Writing custom skills and sub-agents](/docs/guides/writing-custom-skills) covers what to do meanwhile.

### Asymmetries with nothing ruled either way

Some rows differ without a decision behind them, and this page won't pretend otherwise. Holding more than one marketplace and previewing the files an install would write are editor-only because nobody has built the terminal half.

Built-in stacks are an open question rather than a settled split. They ship with the CLI, while a marketplace's own stacks live in its `config/stacks.ts`. Whether the built-in set stays is undecided.

### What can't make the round trip

`npx agents-inc share` refuses outright rather than dropping a value quietly, and it refuses over four things: a marketplace it can't name, a sub-agent pinned to `inherit`, a project-scoped skill assigned to a global-scoped sub-agent, and an ejected skill — one added in the editor included, since it installs as a local copy. Refusing is the right behaviour for each — leaving a model out would mean "keep the sub-agent's own default", which is a different instruction from `inherit`.

## Related

- [CLI or web](/docs/cli-or-web) — how a configuration moves from one to the other.
- [Commands](/docs/reference/commands) — every command, flag and exit code.
- [The editor](/docs/editor) — what each part of the Configure screen does.
- [Config reference](/docs/configuration/config-reference) — every field the `by hand` rows point at.
- [Recipes](/docs/recipes) — short end-to-end runs of several capabilities above.
