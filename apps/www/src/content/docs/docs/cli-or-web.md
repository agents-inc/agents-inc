---
title: CLI or web
description: The terminal wizard and the web editor are the same catalogue and the same output. How a configuration moves from either one to the other.
---

There are two surfaces you can select skills in, and one way to install what
you selected. They are two front doors onto one thing — **same catalogue, same
output** — and the confusion worth clearing up before anything else is that they
are not two complete paths. Selecting is the part that differs. Installing is
the CLI, every time.

:::note[Two more routes arrive at a selection without you making one]
This page compares the two surfaces you _select_ in. It is not the whole set of
ways to _reach_ a selection: [the composer](/docs/editor/composer) takes a
sentence describing the project, and the [stack-detection
skill](/docs/guides/adding-to-an-existing-project) reads a repository you
already have. Both write into one of the two surfaces below and then leave
through the same install command, so everything on this page holds for them
too. [Four ways in](/docs/ways-in) sets all four side by side.
:::

|                     | Web editor                        | Terminal wizard                 |
| ------------------- | --------------------------------- | ------------------------------- |
| How you start it    | [agentsinc.sh/editor](/editor)    | `npx agents-inc init`           |
| Where you select    | Visual grid in the browser        | Ink UI in your terminal         |
| What it hands you   | An id                             | Its own confirm step            |
| What writes to disk | `npx agents-inc init --from <id>` | The same `init` run, on confirm |

The editor is the front door and the CLI is the engine. Your browser cannot
write to `.claude/`, so the editor installs nothing: it hands you a short id,
and `init --from <id>` does the install. The terminal wizard skips the id
because it is already standing where the files go, and mints one on demand with
`share` when you want to leave. Either way you run a CLI command — the wizard
is another way to select, not a way to skip the install.

An id is the only thing that crosses between them, and it crosses in both
directions.

## Same catalogue

The web app does not maintain its own list of skills. It vendors the CLI's
generated catalogue, and because both now live in one repository, the
catalogue and the code it is generated from move in the same commit — CI
regenerates and fails if the checked-in copy has drifted. There is no window in
which the grid can offer a skill the CLI does not have.

## Web to CLI

1. Configure your selection at [agentsinc.sh/editor](/editor) and open
   the install dialog.
2. The dialog mints an id as it opens and shows you the command with the id in
   it, click-to-copy:

   ```bash
   npx agents-inc init --from Ab3xY9_Q
   ```

3. Run it. The CLI fetches the configuration, installs it, and compiles your
   sub-agents — the same pipeline `init` uses after the wizard, just with the
   selection coming from somewhere else.

Some details that matter if you are relying on this:

- **The id is the configuration's own hash** — eight base64url characters of
  the payload's SHA-256. The same selection always mints the same id, so
  re-opening the dialog is idempotent and a stored configuration can never
  change underneath its id.
- **`--from` runs headless.** It does not open the wizard and does not need a
  terminal, so it works over a pipe and in CI.
- **`--from` refuses an existing installation.** Installing a shared
  configuration is a fresh setup rather than a merge, so `init --from` in an
  already-installed directory stops and names the config it found rather than
  writing over it. To bring an id into a setup that already exists, the command
  is `edit --from <id>` — see [CLI to web](#cli-to-web) below.
- **Unknown ids are skipped, not fatal.** If the configuration names a skill or
  a sub-agent this catalogue no longer has, the CLI names what it dropped and
  installs the rest. Ids are catalogue slugs rather than positions, so a
  configuration survives the catalogue changing around it.
- **Only the current payload version decodes.** The contract is versioned and
  the CLI accepts one version. An id minted against an older one fails loudly
  rather than being guessed at.
- **The store is a small service**, not part of the CLI:
  `POST https://api.agentsinc.sh/configs` writes, `GET /configs/:id` reads.

## Web to web

The roster's **Share** button copies a link rather than a command — the same
id, in the form `agentsinc.sh/editor/?fromId=<id>`. Opening it loads that
configuration into the editor. That is for handing a selection to another
person to look at or adjust; the install dialog is what you use to actually
install it.

A dead or unreadable link says so and leaves whatever you had configured
alone.

## CLI to web

The id flow runs both directions. An installation can be minted back into a
configuration, so starting in the terminal does not lock you out of the grid.

```bash
npx agents-inc share
```

That reads the skills, sub-agents and per-agent curation installed in the
current directory, publishes them as one configuration, and prints the id with
both things you can do with it — `init --from <id>` on another machine, or
`agentsinc.sh/editor/?fromId=<id>` in a browser.

If you want the browser rather than the id, `edit --ui` is the same mint with a
different ending — instead of printing the id it opens it, so the installation
you are standing in becomes the selection loaded in the editor:

```bash
npx agents-inc edit --ui
```

Nothing on disk is touched by either. A configuration is read, not rewritten.

**A skill you wrote by hand does not travel.** Ownership is decided by the
provenance key the CLI stamps into every skill directory it writes, so an
ejected or carried skill goes and one you authored in `.claude/skills/` stays.
It is not refused, just out of scope — and `edit --from` reads that same
judgement, so a configuration that never mentioned your skill is never read as
an instruction to delete it.

To bring the browser's changes back, `edit --from <id>`. That direction is
destructive by design and confirms first: a shared configuration states a whole
roster, so whatever it leaves out is removed, and every removal is named before
anything is written. Two things it refuses to drop quietly — a skill you
authored in this installation, and a skill this catalogue cannot place — are
kept and reported instead.

**The same id, either way round.** `share` and `edit --ui` mint through one
reader, so one directory has one id, and the id is still the configuration's
own hash. Sharing an unchanged installation twice returns what it returned the
first time.

## Which one to select in

**Start in the editor.** It lays the whole catalogue out at once, it is what
you hand to somebody else when you want them to look before anyone installs
anything, and several choices exist nowhere else: a sub-agent's model and
reasoning effort, which sub-agents carry which skill and whether each copy is
preloaded, and a skill from outside the catalogue.

**Reach for the terminal wizard** when a browser is not available or not
wanted — CI, a remote machine, a container — or when you are already in the
project and want this over with.

**Reach for neither first if the project already exists.** A repository has
already made these decisions, and transcribing them into a grid is the slowest
route to a selection you could have had read off the code — see [Adding to an
existing project](/docs/guides/adding-to-an-existing-project). If it does not
exist yet, describe it to [the composer](/docs/editor/composer) instead. Both
land you in the editor with a selection to correct rather than one to build.

The choice does not change the install. Both end at `npx agents-inc init`, and
the next page you want either way is [Quickstart](/docs/quickstart), which
covers what lands on disk once it runs.

After that install, the CLI does things the editor has no answer for at all:
`compile`, `doctor`, `update`, `eject`, `uninstall`, `search`, and any hand
edit of `.claude-src/config.ts`. None of it has a browser equivalent — the
editor never touches a filesystem and never runs a command.

For the whole picture rather than the headline,
[Capabilities](/docs/reference/capabilities) lists what each front door can do,
area by area, and the last section on it explains why a few things live in only
one of them.
