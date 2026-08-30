---
title: Switch a skill from plugin to eject
description: Take local ownership of one skill's content so you can modify it — what the switch copies, what it removes, and what you give up by owning it.
sidebar:
  order: 2
---

A plugin skill is served by its marketplace and refreshed from it. Ejecting copies that skill's files into `.claude/skills/` and makes them yours to edit. Do it when the skill is nearly right and you need to change the content; [Install modes](/docs/concepts/install-modes) covers the choice itself.

## Quick start

Every skill's cell in the editor carries a `plugin` / `eject` badge. Click it to read `eject`, and the command the editor hands you copies that skill's files into `.claude/skills/` rather than registering it as a plugin. The same control sits in the skill's `•••` options panel under **Install mode** — [Selecting skills](/docs/editor/selecting-skills) covers the rest of that panel. A skill you added from outside the catalogue has no plugin form at all, so its badge is fixed at `eject` and the panel's `plugin` option is disabled.

For a skill that's already installed, the editor is a round trip, and the two commands aren't the same one:

```bash
npx agents-inc edit --ui         # publishes this installation and opens it at agentsinc.sh
npx agents-inc edit --from <id>  # applies what you changed there
```

`edit --ui` prints `init --from <id>` beside the link, but that command is greenfield-only and refuses a directory that already carries an installation. `edit --from <id>` is the one that comes back.

:::note[Doing this from the terminal]
`npx agents-inc edit` does it in one command, with no round trip. On the Sources step, move to the skill's row and press SPACE on its `Local` cell, then confirm the edit. The switch is reported as it happens:

```
Switching 1 skill(s) to Eject (copy to .claude/skills/)
Copied 1 local skill(s)
```

:::

Either way the files land at `.claude/skills/<skill-id>/` — `SKILL.md` and `metadata.yaml`, plus whatever else that skill ships. Edit them and run `npx agents-inc compile`.

## What changes

|                     | Before                                                   | After                                              |
| ------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| Content             | served by the marketplace, through Claude's plugin store | `.claude/skills/<id>/` under the skill's own scope |
| Config entry        | `origin: 'agents-inc'`                                   | `origin: 'eject'`                                  |
| Plugin registration | registered with Claude Code                              | dropped, once the copy has landed                  |
| Compiled sub-agent  | invokes the skill by its plugin ref                      | invokes it by its bare id                          |

The copy also gets a `forkedFrom` block written into its `metadata.yaml`, recording the id, a hash of the source content and the date. That block is what later lets `uninstall` remove the directory and `share` carry its bytes — a skill directory without one is treated as your own work and left alone.

The order matters and it is deliberate: the copy is written first, and the plugin registration is dropped only for skills whose copy landed. A failed copy leaves the plugin install exactly as it was.

## What you give up

`npx agents-inc update` refreshes the marketplaces this installation reads and never touches an ejected skill. It says so before it does anything:

```
Ejected skills are yours to own — 'npx agents-inc update' does not change them.
```

So upstream fixes and additions stop arriving for that skill. Merging them back is a manual diff against the marketplace.

## Switching back deletes the local copy

Going the other way — the badge back to `plugin`, or `Local` back to `Plugin` in the wizard — installs the plugin first and deletes the working copy the moment that skill's plugin registers. Anything you edited is gone. Copy the directory somewhere else first if you want to keep it.

## `eject skills` is a different command

`npx agents-inc eject skills` copies the **whole** marketplace into `.claude/skills/` in the directory you run it from, and changes no `origin` in your config, so it isn't the way to switch one skill's install mode. It's for taking a readable copy of a catalogue. The same command ejects the other two layers a sub-agent is built from — see [Customizing sub-agents](/docs/guides/customizing-subagents).

## A global install can't be switched from a project

A skill installed at global scope is inherited inside a project, and its row is locked — the install-mode cell does nothing there. Run `npx agents-inc edit` from your home directory to switch it for every project. [Global-first setup](/docs/guides/global-first-setup) explains why the lock exists.
