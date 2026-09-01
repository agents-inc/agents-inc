---
title: Capabilities
description: What you can do with Agents Inc, and which of the two front doors does it — with the rule that decides why some things live in only one of them.
sidebar:
  order: 4
---

Agents Inc has two front doors: the `agents-inc` CLI and the editor at [agentsinc.sh/editor](/editor). They are not the same tool and are not meant to be. This page lists what each one can do, area by area, so you can tell at a glance where to go — and the last section says why a few things live in only one of them.

## Quick start

The editor is where you decide; the CLI is where it lands. The browser holds more at once — every skill on screen, a sub-agent matrix per skill, model and effort a click each — and it can do none of it to your machine, because a web page cannot write to disk.

So the asymmetry that decides everything else is this: **the CLI is the only thing that installs.** Press Install in the editor and it hands you a command; run that command and the CLI does the writing. If you never leave the terminal, `npx agents-inc init` composes and installs in one pass, and the wizard covers most of what the editor's grid covers.

Reach for the editor when you want to see the whole catalogue, tune sub-agents, or send a setup to someone else. Reach for the CLI for anything that touches files — installing, ejecting, compiling, diagnosing, removing. [CLI or web](/docs/cli-or-web) walks through the choice in more detail.

**Two things arrive at a selection from outside both doors**, and the tables below mark them where they land rather than giving them a column: [the composer](/docs/editor/composer) is a control on the editor, and the [stack-detection skill](/docs/guides/adding-to-an-existing-project) is a Claude Code plugin that produces a payload the CLI publishes. [Four ways in](/docs/ways-in) is the page that sets all four routes side by side.

## How to read the tables

Four markers, used the same way in every table below:

| Marker    | Means                                                                                         |
| --------- | --------------------------------------------------------------------------------------------- |
| `yes`     | a control on that front door does it                                                          |
| `no`      | it doesn't                                                                                    |
| `by hand` | the CLI gets there, but by editing files yourself rather than through a command               |
| `n/a`     | the question doesn't apply to that front door — usually because the editor never touches disk |

## Choosing what to install

| Capability                                   | CLI       | Editor | Note                                                                                                                                                                                                 |
| -------------------------------------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start from a stack                           | `yes`     | `yes`  | The wizard's Stack step, or the grid at the top of Configure. The CLI drops the step entirely when the marketplace ships no stacks. See [Stacks](/docs/concepts/stacks).                             |
| Take a stack's whole roster without picking  | `yes`     | `yes`  | `A` on the wizard's Skills step. In the editor, clicking a stack cell applies it — and replaces whatever was selected.                                                                               |
| Save your own selection as a stack           | `no`      | `yes`  | **Save** stores one slot in your browser, and it appears in the grid beside the catalogue's own stacks. Nothing on the CLI side saves a stack.                                                       |
| Narrow the grid to the domains you work in   | `yes`     | `yes`  | The wizard's Domains step decides which tabs the Skills grid paints, up front. The editor renders every domain at once and narrows with a domain chip, at any point.                                 |
| Filter by domain, or search as you type      | `no`      | `yes`  | Five domain chips plus a field matching name, slug and description. The CLI's equivalent is `agents-inc search <query>`, a separate read-only command.                                               |
| Toggle individual skills                     | `yes`     | `yes`  | `SPACE` on the wizard's Skills grid; a click in the editor's.                                                                                                                                        |
| Describe a project and have skills proposed  | `no`      | `yes`  | [The composer](/docs/editor/composer) — a sentence in, skill ids and a reason back, as a proposal you apply or discard. Needs a GitHub sign-in, because it calls a model.                            |
| Have a repository read and a config proposed | `n/a`     | `n/a`  | Neither front door: the [stack-detection skill](/docs/guides/adding-to-an-existing-project) runs in Claude Code and emits a payload. The CLI turns it into an id; see the `share --stdin` row below. |
| See why a skill can't be picked              | `yes`     | `yes`  | `D` turns on compatibility labels in the wizard. In the editor a ruled-out cell is dimmed and carries the reason. Both read the same rules.                                                          |
| One-of categories evict the current pick     | `yes`     | `yes`  | Also the same rules. The editor remembers the evicted skill's whole setup, so swapping back restores it; the CLI does not.                                                                           |
| Write a skill of your own                    | `by hand` | `no`   | Drop `SKILL.md` and `metadata.yaml` into `.claude/skills/<name>/` and the CLI finds it on the next load. See [Writing custom skills](/docs/guides/writing-custom-skills).                            |
| Add a skill from a GitHub repository         | `no`      | `yes`  | **＋ Add skill** searches a federated index and fetches the whole directory, up to 256 KB. This is the intake path — see the last section.                                                           |
| Give an added skill a category               | `no`      | `yes`  | A dropdown in the same dialog, with no guessing fallback. Nothing on the CLI side creates a skill that would need one.                                                                               |
| Read an added skill's files                  | `no`      | `yes`  | The **added** tag opens the directory read-only, as plain text.                                                                                                                                      |

## Install mode and scope

Both choices are per skill, and they're independent of each other. [Install modes](/docs/concepts/install-modes) explains what each one means.

| Capability                                     | CLI   | Editor | Note                                                                                                                                                                                                           |
| ---------------------------------------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set a skill to plugin or eject                 | `yes` | `yes`  | `SPACE` on the wizard's Sources step; the `•••` options panel in the editor.                                                                                                                                   |
| Change an installed skill's mode later         | `yes` | `n/a`  | `npx agents-inc edit` copies or deletes the directory and adds or removes the plugin registration. The editor holds a declaration, so there's nothing to migrate.                                              |
| Put one skill at global scope                  | `yes` | `yes`  | `S` on the Skills step, or the scope segment in the options panel. Global is the default on both. See [Global-first setup](/docs/guides/global-first-setup).                                                   |
| Put one sub-agent at global scope              | `yes` | `yes`  | `S` on the Agents step, or the scope word on the roster row.                                                                                                                                                   |
| Catch a skill that can't reach its sub-agent   | `yes` | `yes`  | A project-scoped skill never reaches a globally-scoped sub-agent. One rule, read by both: the CLI drops the pair and warns at compile, the editor marks the row and blocks Install and Share until you fix it. |
| Fork every marketplace skill for local editing | `yes` | `n/a`  | `npx agents-inc eject skills` copies them all into `.claude/skills/`. There's no per-skill filter — for one skill, set that row to eject instead.                                                              |

## Sub-agents

| Capability                                        | CLI       | Editor | Note                                                                                                                                                                                                                                               |
| ------------------------------------------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Choose which sub-agents get compiled              | `yes`     | `yes`  | The wizard's Agents step, or clicking a name on the roster.                                                                                                                                                                                        |
| Install a sub-agent carrying no skills            | `yes`     | `yes`  | A base agent — allowed on both.                                                                                                                                                                                                                    |
| Pin a sub-agent's model                           | `by hand` | `yes`  | Click the model word to cycle `opus → fable → sonnet → haiku`. The wizard preserves a pinned model but has no control that sets one; `--from` carries one in. See [Models and effort](/docs/configuration/models-and-effort).                      |
| Pin a sub-agent's reasoning effort                | `by hand` | `yes`  | Same control, cycling `low → medium → high → xhigh → max`.                                                                                                                                                                                         |
| Give a skill to one sub-agent and not another     | `by hand` | `yes`  | The sub-agent matrix in the editor's options panel. The wizard hands every scope-compatible skill to every selected sub-agent; per-agent routing is the `stack` block in [`config.ts`](/docs/configuration/config-reference), or a shared payload. |
| Preload a skill's text instead of lazy-loading it | `by hand` | `yes`  | Cycle the matrix cell to `pre`. On the CLI side it's `preloaded: true` in `config.ts` — no flag, no key.                                                                                                                                           |
| Add a sub-agent that doesn't already exist        | `no`      | `no`   | The roster is the set of sub-agents the CLI ships. Ejecting a sub-agent's partials changes what an existing one says — see [Customizing sub-agents](/docs/guides/customizing-subagents).                                                           |
| Edit what a sub-agent says                        | `yes`     | `n/a`  | `npx agents-inc eject agent-partials` and `eject templates`, then `compile`.                                                                                                                                                                       |

## Installing and sharing

| Capability                                        | CLI   | Editor | Note                                                                                                                                                                                                                         |
| ------------------------------------------------- | ----- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install onto this machine                         | `yes` | `n/a`  | The editor cannot write to disk. Its Install dialog is an inventory and a command — there's no Install button in it.                                                                                                         |
| Mint a shareable id                               | `yes` | `yes`  | `npx agents-inc share`, or **Share**, which copies a `?fromId=` link. The id is the configuration's own hash, so re-sharing something unchanged returns the same id.                                                         |
| Install a shared configuration                    | `yes` | `n/a`  | `npx agents-inc init --from <id>`, into a directory with no install. It runs headless, over a pipe and in CI.                                                                                                                |
| Apply a shared configuration over an existing one | `yes` | `n/a`  | `npx agents-inc edit --from <id>`, which also removes what the payload leaves out. It needs a terminal and refuses on a pipe, because it asks you to confirm the removals.                                                   |
| Open a shared configuration to look at it         | `no`  | `yes`  | `?fromId=` is an address rather than a one-shot import, so a reload reopens the same thing. Your own configuration is untouched while it's on screen.                                                                        |
| Preview the files an install would write          | `no`  | `yes`  | **Preview generated code** renders from the same code the CLI writes with. The CLI has no dry run.                                                                                                                           |
| Carry a skill's own files inside a shared link    | `yes` | `yes`  | An added skill travels as its bytes, so `init --from` writes it without ever reaching GitHub. `share` reads those directories back out, so an installation holding one can be re-shared.                                     |
| Mint an id from a payload you already hold        | `yes` | `no`   | `cat proposal.json \| npx agents-inc share --stdin`, for anything that produces a configuration but can't apply one — the [stack-detection skill](/docs/guides/adding-to-an-existing-project) is the producer it exists for. |
| Open the editor from the terminal                 | `yes` | `n/a`  | `npx agents-inc edit --ui` publishes this installation and opens it. `--ui --from <id>` opens that id instead and touches nothing local.                                                                                     |

[Share with a teammate](/docs/recipes/share-with-a-teammate) runs the round trip end to end.

## Marketplaces

| Capability                                        | CLI       | Editor | Note                                                                                                                                                                                                                                            |
| ------------------------------------------------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install from a marketplace other than the default | `yes`     | `yes`  | `npx agents-inc init --marketplace github:acme/skills`, or `CC_MARKETPLACE`. In the editor, the **Marketplace** button at the foot of the column.                                                                                               |
| Change an installed project's marketplace         | `by hand` | `yes`  | `--marketplace` belongs to `init` alone — every later command reads the ref the install recorded. Edit `marketplace` in `.claude-src/config.ts` to move one.                                                                                    |
| Hold several marketplaces and switch between them | `no`      | `yes`  | The editor keeps every ref it has loaded, each with its own credential, and offers a switch button per saved one. An installation names a single marketplace.                                                                                   |
| Reach a private repository                        | `yes`     | `yes`  | `export GIGET_AUTH=<token>` for the CLI; a personal access token per marketplace for the editor, which stays in your browser and never reaches the Agents Inc worker. See [Use a private marketplace](/docs/recipes/use-a-private-marketplace). |
| See what a switch would cost before it happens    | `n/a`     | `yes`  | The editor names the skills a switch would drop and asks a second time before it does.                                                                                                                                                          |
| Refresh what a marketplace holds                  | `yes`     | `n/a`  | `npx agents-inc update`, once per marketplace your config names. Ejected skills are copies you own and are never touched.                                                                                                                       |
| Scaffold a marketplace of your own                | `yes`     | `n/a`  | `npx agents-inc new marketplace <name>`. See [Creating a marketplace](/docs/guides/creating-a-marketplace).                                                                                                                                     |
| Build and publish one                             | `yes`     | `n/a`  | `npx agents-inc build plugins`, then `npx agents-inc build marketplace`.                                                                                                                                                                        |

## Inspecting and maintaining

Everything here reads or writes your machine, so all of it is the CLI's. [Commands](/docs/reference/commands) has the flags.

| Capability                          | CLI   | Editor | Note                                                                                                                                                                                                          |
| ----------------------------------- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| See what's installed                | `yes` | `n/a`  | `npx agents-inc list`. It falls back to the global installation when the directory has no project one.                                                                                                        |
| Diagnose a broken installation      | `yes` | `n/a`  | `npx agents-inc doctor` checks config validity, skill resolution, agent compilation, orphans, plugin registration and marketplace reachability. See [Common problems](/docs/troubleshooting/common-problems). |
| Rebuild sub-agents from your config | `yes` | `n/a`  | `npx agents-inc compile`, one scope per run. `edit` recompiles every scope the directory owns in one pass.                                                                                                    |
| Search the catalogue                | `yes` | `yes`  | `npx agents-inc search <query>` matches id, name, slug, description and category, across the marketplace plus the local skills already on disk. In the editor, the search field filters the grid.             |
| Remove everything                   | `yes` | `n/a`  | `npx agents-inc uninstall`. It works even on a config it can't read, and says what it kept.                                                                                                                   |

## Where the CLI stops on purpose

A gap between the two columns isn't automatically a defect. The two front doors are held to one rule, and the rule is about direction of travel.

**The CLI has to consume anything the editor produces.** A configuration the editor mints and the CLI can't install is a bug and gets fixed as one. That's why a skill you added from GitHub travels inside the shared link as its own files rather than as a reference — so `init --from` can write it on a machine that has never heard of that repository.

**It doesn't have to author what the editor authors.** Adding a skill from a repository is the editor's job, and so is the category dropdown that comes with it, because nothing on the CLI side creates a skill that would need one. Composing a setup you can see all of is what a browser is good at; the terminal doesn't have to match it control for control.

One more row is settled the same way. External skills install by ejecting on both sides — the CLI refuses a payload that asks for one as a plugin, rather than quietly changing the mode.

`agents-inc new skill` and `new agent` were both removed when the editor became the intake path, and they're **not** the same case: `new agent` isn't coming back, because a sub-agent is composed from partials and skills and ejecting the built-in partials already gives you what a scaffold would have written. `new skill` is deferred rather than declined — if it returns it will mimic the editor's intake flow rather than invent a second one. [Writing custom skills and sub-agents](/docs/guides/writing-custom-skills) covers what to do meanwhile.

### Asymmetries with nothing ruled either way

Some rows differ without a decision behind them, and this page won't pretend otherwise. Model, effort, per-agent routing and preloading are one click each in the editor's roster and hand-edits in `config.ts` on the CLI side. The wizard preserves each of these when it finds one already set, and carries them in from a shared id, but has no control that sets one. Saving your own stack, holding more than one marketplace, and previewing the files an install would write are editor-only for the same reason: nobody has built the terminal half.

Built-in stacks are an open question rather than a settled split. They ship with the CLI, while a marketplace's own stacks live in its `config/stacks.ts` — which is why the wizard's Stack step disappears against a marketplace that ships none. Whether the built-in set stays is undecided.

### What can't make the round trip

`npx agents-inc share` refuses outright rather than dropping a value quietly, and it refuses over four things: a marketplace it can't name, a sub-agent pinned to `inherit`, a project-scoped skill assigned to a global-scoped sub-agent, and a carried skill it can't carry. Refusing is the right behaviour for each — leaving a model out would mean "keep the sub-agent's own default", which is a different instruction from `inherit`.

One field goes the other way, and it's worth knowing before you rely on it: `agentsSource` is **dropped silently**. The shared-configuration format has no word for it and nothing refuses over it. Nothing in the CLI reads the field either, so in practice you lose nothing — see [Fields that are accepted but inert](/docs/configuration/config-reference#fields-that-are-accepted-but-inert).

## Related

- [CLI or web](/docs/cli-or-web) — the same choice, argued rather than tabulated.
- [Commands](/docs/reference/commands) — every command, flag and exit code.
- [The editor](/docs/editor) — what each part of the Configure screen does.
- [Config reference](/docs/configuration/config-reference) — every field the `by hand` rows point at.
- [Recipes](/docs/recipes) — short end-to-end runs of several capabilities above.
