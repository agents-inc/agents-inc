---
title: Installing and sharing
description: The install dialog and the command it hands you, what an id guarantees, the output preview that shows every file before one is written, and the round trip back from an installation.
sidebar:
  order: 4
---

The editor can't write to your disk, so the end of every session is a short id and a command that carries it. This page covers the install dialog, the preview that shows you exactly what the command will write, and the two ways a configuration travels — to a machine, and to another person.

## Quick start

Press **Install** at the foot of the roster, click the command block to copy it, then run it from your project root.

```bash
cd ~/code/your-project        # the folder holding package.json
npx agents-inc init --from Ab3xY9_Q
```

The dialog says the same two steps, with the id filled in.

## The install dialog

Its subtitle names what you're installing _from_: `marketplace <ref> · stack <name>`.

**Two panes.** On the left, **Skills** — grouped `Project` and `Global` by each skill's own scope, each row the skill's name plus `plugin` or `eject`. A skill you added yourself has its name as a button, so you can read its files from inside the list of what's about to be written to your disk. On the right, **Agents** — the same project/global split, each row reading `web · developer`, with `no skills — base agent` on one you pinned on without assigning anything.

**Two steps.** The first is `cd` to your project root, explained as the folder holding `package.json` because project-scoped skills are written relative to it. The second names what the installer writes — `.claude-src/config.ts` and sub-agent front-matter, the ejected skills into `.claude/skills/`, the rest linked as plugins, and anything global into `~/.claude` — and then gives you the command.

**Click the command block to copy it.** The line beneath it says what just happened, one phrase per ending:

| Line                                                  | Means                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `preparing your id`                                   | The id is still being minted.                                                                   |
| `click to copy`                                       | Ready.                                                                                          |
| `copied`                                              | On your clipboard.                                                                              |
| `out of date — reload the page for an id`             | This tab is running a build older than the service. Reload; re-opening the dialog won't help.   |
| `id unavailable — this command starts a fresh wizard` | The id couldn't be stored. The command is still valid — it just starts the wizard from nothing. |
| `offline — this command starts a fresh wizard`        | Same, with the network as the cause.                                                            |

Where no id could be minted the command degrades to a bare `npx agents-inc init` rather than a broken one.

**There's no Install button.** Installing is a CLI action, so the dialog's job is to tell you exactly what you're about to get and hand you the command. The only control is Close. Its footer counts the whole thing — `N skills · M sub-agents · K ejected` — and reminds you that `npx agents-inc edit` changes it later.

## What an id is

An id is the configuration's own content address: a SHA-256 of the serialized payload, base64url, first eight characters. Four things follow from that, and they're worth knowing if you're relying on ids.

- **The same configuration always mints the same id.** Opening the install dialog twice on an unchanged selection returns what it returned the first time, and costs a read rather than a write.
- **A stored configuration can never change underneath its id.** The id _is_ the bytes, so there's nothing for anyone to edit in place.
- **The id is minted when the dialog opens**, because it has to be on screen to be read. Copying it is a separate act that can fail on its own.
- **It's the same id either way round.** `share` and `edit --ui` in the CLI mint through the same reader, so one installation has one id.

[CLI or web](/docs/cli-or-web) carries the rest of the contract — how `--from` behaves headless, what happens to ids the catalogue no longer knows, and why an older payload version fails loudly.

## The output preview

**Preview generated code** sits between Share and Install, because you preview and then you install. It opens a dialog called **Output preview** showing every file the install would write, before one of them is.

**On the left, a tree.** Up to two roots — `~/` and `./` — and a root nothing is written to isn't drawn at all. Under each, `.claude-src/` with `config.ts` and `config-types.ts`, `.claude/` with `agents/<name>.md` and `skills/<id>/`, and a group called `plugin skills`. That last one is a group rather than a directory, deliberately: a plugin skill has no path under either root, so giving it one would be a lie. Each row carries a marker:

| Marker   | Means                                                                       |
| -------- | --------------------------------------------------------------------------- |
| `new`    | A file the install writes.                                                  |
| `plugin` | A reference. Nothing is written for it.                                     |
| `eject`  | A directory copied verbatim, drawn amber because you chose to own the copy. |

Flip a sub-agent's scope word in the roster and reopen the preview: its `.md` has moved from one root to the other.

**On the right, the file's actual bytes**, syntax-highlighted. Every one of them comes out of the same renderers the CLI's write path calls, so this isn't a mock-up of the output — it's the output. A skill you added from somebody else's repository is rendered as plain text with no grammar run over it and no markdown renderer anywhere on the path.

**The footer says what the sheet is a preview of**, and it's specific on purpose: `N files · M ejected · agents-inc v<version>`, then _"what installing this configuration on a machine with no existing agents-inc installation writes. The project directory's name, and its relative import to the global config, are computed on that machine — named here rather than guessed. Drawn against the catalogue on screen, which a machine carrying its own local skills does not have."_

Install onto a machine that already has agents-inc and the existing config is merged rather than replaced — that part happens on your machine, and the preview says so.

The button is disabled until something is selected, and a configuration the CLI would refuse — a project skill on a global sub-agent — shows the refusal naming every unwritable pair rather than drawing a quieter configuration than the one on screen.

## Sharing a link

**Share** copies a link rather than a command: the same id, in the form `agentsinc.sh/?fromId=<id>`. Opening it loads that configuration into the editor. Use it to hand a selection to somebody to look at or adjust; the install dialog is what you use to actually install.

The button is the only feedback the panel has, so it says which ending happened:

| Label                     | Means                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Link copied`             | Stored and on your clipboard.                                                                                 |
| `Link made, copy refused` | The id is real and the configuration is stored — only the write to your clipboard was turned down.            |
| `Out of date — reload`    | This tab is running an older build. The only one of these that stays on screen, because reloading is the fix. |
| `Sharing failed`          | The service refused it.                                                                                       |
| `Offline — try again`     | Nothing reached the service.                                                                                  |

**`fromId` is an address, not a one-shot command.** It's read on every load, so reloading a shared link reopens it rather than reverting to your own configuration. Clicking **Configure** in the nav rail clears it and gets you back to your own. A dead or unreadable link says so and leaves whatever you had configured alone.

Share is disabled with nothing selected, and disabled while any sub-agent scope error stands — a link minted from one of those would fail on the recipient, which is worse than no link.

## Coming back the other way

The id flow runs both directions, so starting in the terminal doesn't lock you out of the grid.

```bash
npx agents-inc share      # print the id for what is installed here
npx agents-inc edit --ui  # the same mint, opened in the editor instead of printed
npx agents-inc edit --from <id>   # bring a configuration from the editor back to disk
```

`share` and `edit --ui` read the installation in the current directory and touch nothing. `edit --from` is the destructive direction and confirms first: a shared configuration states a whole roster, so whatever it leaves out is removed, and every removal is named before anything is written. [CLI or web](/docs/cli-or-web) covers the two things it refuses to drop quietly.

## Related

- [The editor](/docs/editor) — the roster footer these buttons live on.
- [Reference: commands](/docs/reference/commands) — every flag on `init`, `edit` and `share`.
