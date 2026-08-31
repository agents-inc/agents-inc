---
title: The editor
description: The web editor at agentsinc.sh — the loop from stack to installed, what each of the three columns holds, what survives a reload, and the things it deliberately cannot do.
sidebar:
  order: 1
---

The editor is the browser front door onto the same catalogue the CLI reads. Pick a stack, click the skills you want, decide which sub-agents carry them, and it hands you a command to run. [CLI or web](/docs/cli-or-web) has the full comparison — the short of it is that the editor is the one that shows you the whole catalogue at once, and the one you can hand to somebody else.

**You do not have to build the selection yourself.** [The composer](/docs/editor/composer) at the foot of the roster takes a sentence describing your project and proposes the skills for it; for a project that already exists, the [stack-detection skill](/docs/guides/adding-to-an-existing-project) reads the repository and proposes one from the code. Both leave you here, in the grid, with something to correct rather than something to assemble.

## Quick start

1. Open [agentsinc.sh](https://agentsinc.sh).
2. Click a stack in the grid at the top. Its skills are selected and handed to the sub-agents that want them.
3. Press **Install** at the foot of the right-hand column.
4. Copy the command out of the dialog and run it from your project root.

```bash
npx agents-inc init --from Ab3xY9_Q
```

That's the loop. Everything below refines step 2 and step 3.

**Opening it from a terminal.** `npx agents-inc init --ui` prints the address and then tries to open a browser at it, which is worth knowing over SSH or on a machine with no desktop session — the link still works when the browser doesn't. On its own it opens the bare catalogue and carries nothing across, so it's a shortcut to the address rather than a separate path. `npx agents-inc init --ui --from <id>` opens a shared id instead, which is how you look at somebody's configuration before installing it.

## The screen

Three columns. Both outer ones are pinned to the viewport and only the middle one scrolls.

| Column | What it holds                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Left   | The nav rail — the `a-i` monogram links home, **Configure** is the screen you're on, **Docs** and **Settings** are routes with nothing behind them yet, **Sign in** sits at the foot — replaced by your name and **Sign out** once you are — and a **Github** link below that. |
| Middle | The stack grid, the filter bar, and every skill in the catalogue laid out in cells under its domain. The **Marketplace** button floats over its foot.                                                                                                                          |
| Right  | The roster — every sub-agent there is, with the skills each one carries listed underneath, and the four buttons that do something with all of it.                                                                                                                              |

Two headings divide the middle column: **choose your stack** over the grid, and **then customise `<stack name>`** — or **then pick your skills** before you've chosen one — over everything else. The `−` button beside the first one folds the grid away. Folding it doesn't unpick anything: the stack stays chosen, the heading below still names it, and Install writes exactly what it would have written.

The editor wants a wide window. The page grid has a fixed minimum width and no layout beneath it, so a narrow window scrolls sideways rather than reflowing.

## Stacks

The grid's first cell is **Start from scratch**, which is the state a first visit opens in — nothing selected, every sub-agent off. After it come the catalogue's own stacks, each cell naming the stack and the first few skills in it. Clicking one applies it whole. See [Stacks](/docs/concepts/stacks) for what a stack is.

**Switching between stacks with an untouched selection prompts nothing** — a stack's own expansion isn't something you chose, so there's nothing to lose. Once you've edited away from it, though — a changed install mode or scope, a changed assignment, any per-agent decision — switching asks first: _"Switch to `<name>`?"_, with **Keep my setup** and **Switch**, and a sentence counting the skills, options and assignments it would discard.

**Save** in the roster footer snapshots the current selection into the grid as a cell called **Saved stack**, sitting right after Start from scratch. It's a starting point like any other stack from then on. Signed out there's one slot, so saving again overwrites it. Signed in, the grid shows your account's saved stacks instead — as many as you like, on any machine — and the local slot is kept rather than shown. Either way it's recognized as the stack you're on by the selection _being_ the snapshot rather than by any id — a snapshot taken from scratch lights up its own cell rather than Start from scratch.

Save uses the same serialization Share does, so a saved stack and a shared link can never restore different things.

## The roster

The right column groups every sub-agent under sticky bands. The control in its header reads `domain ▾` or `scope ▾` and switches between the two bandings: by domain, or by where each agent's file is written — `~/.claude · global` and `./.claude · project`, global first. Each band's right edge reads `N of M`, and clicking a band collapses it.

**Every sub-agent is listed whether it's on or off.** An agent is on when it holds at least one enabled skill; clicking its name pins it to the opposite of whatever it works out to. So you can switch on an agent that carries nothing — it reads `no skills — base agent`, and installs as front-matter alone — or switch off one that carries plenty.

Three words on each agent row cycle when clicked.

| Word   | Cycles                              | Where it rests                                           |
| ------ | ----------------------------------- | -------------------------------------------------------- |
| model  | `opus → fable → sonnet → haiku`     | whatever the sub-agent's own metadata names, or `sonnet` |
| effort | `low → medium → high → xhigh → max` | `medium`, and turns amber the moment it leaves it        |
| scope  | `project ⇄ global`                  | `global`                                                 |

Under each agent sits one row per skill it carries. Hover or put focus anywhere in that agent's block and two more things appear on the right of every row: a load word — `pre` or `lazy`, click to flip it for this agent alone — and, when the skill reaches more than one switched-on agent, a count that opens a list naming all of them. Clicking a row itself switches that copy off without removing it; it stays listed, recessed.

**A project skill on a sub-agent resting at global cannot install.** That row gets a `!` marker whose text is the fix — _"This sub-agent must be set to project scope too"_ — Install and Share both stay disabled while any of them stand, and a line at the top of the middle column counts them: _"Install is blocked: N sub-agents need project scope. Look for the marked rows under Sub-agents, or set the skill itself to global."_ Both ways out are real: flip each marked sub-agent to project scope, or set the skill back to global. The disabled Install button repeats the count as its own label. The CLI refuses that pair outright, so a link minted from one would fail on whoever you sent it to.

The footer holds **Save**, **Share**, **Preview generated code** and **Install**, in that order. The first three are disabled until something is selected. [Installing and sharing](/docs/editor/install-and-share) covers the last three.

## What survives a reload

Four slots in this browser's own storage, plus the URL — and, once you sign in, your saved stacks on the server.

| What               | Holds                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your configuration | the stack, every selected skill with its install mode, scope and sub-agent assignments, the options you set on skills you _haven't_ selected, and every per-agent model, effort, scope and pin |
| Your saved stack   | the one snapshot Save wrote                                                                                                                                                                    |
| Your marketplaces  | every marketplace a load has succeeded against, and the token that reached it                                                                                                                  |
| Arrangement        | which roster bands are collapsed, whether you're grouped by domain or scope, and whether the stack grid is folded                                                                              |

The filter state — the search text, the domain chip, the **Selected** chip — lives in the URL along with `fromId`, so a filtered grid is an address you can send.

**What doesn't survive**: a skill you added from GitHub this session, and any selection naming one. Nor do open dialogs, open options panels or pending confirmations. Closing the tab keeps your stack, your skills, their options, every sub-agent decision and your saved marketplaces — but not an added skill, unless you saved it as a stack or shared it first. [Selecting skills](/docs/editor/selecting-skills) says why that one is different.

The configuration slot is versioned and has no migrations. A blob written against a different version of the format is discarded rather than guessed at, and the discard is reported.

## What the editor doesn't do

**It can't write to your disk.** A browser has no access to `.claude/` or `~/.claude-src/`, and that is the whole reason an id exists: the editor publishes your configuration, hands you eight characters, and the CLI does the install. There's deliberately no Install button inside the install dialog — installing is a CLI action, so the only control there is Close.

**It doesn't read an installation you already have.** Everything on screen starts from nothing, from a stack, or from an id. To bring an existing installation into the grid, mint it first with `npx agents-inc share` or `npx agents-inc edit --ui` — see [CLI or web](/docs/cli-or-web).

**You can use all of this without an account**, and the CLI resolves a shared link without one too. Signing in with GitHub is what makes saved stacks outlive the browser and what unlocks [the composer](/docs/editor/composer), which calls a model and so needs somebody to attribute the cost to. Your configuration lives in this browser, and so does any marketplace token — a private catalogue is fetched straight from GitHub, so a token never leaves the browser at all. The one thing stored elsewhere is the payload behind an id, and that's written only when you open the install dialog or press Share.

## Related

- [Selecting skills](/docs/editor/selecting-skills) — the grid, the filters, and the per-skill options panel.
- [Installing and sharing](/docs/editor/install-and-share) — the install dialog, the id, the output preview and the round trip back.
- [Marketplaces in the editor](/docs/editor/marketplaces) — pointing the grid at a catalogue other than the default.
