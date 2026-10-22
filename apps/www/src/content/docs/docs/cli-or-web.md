---
title: CLI or web
description: How a configuration moves from either one to the other.
---

The editor is the front door and the CLI is the engine. Your browser cannot
write to `.claude/`, so the editor installs nothing: it hands you a short id,
and `init --from <id>` does the install.

An id is the only thing that crosses between them, and it crosses in both
directions.

## Same catalogue

The web app does not maintain its own list of skills. It vendors the CLI's
generated catalogue.

## Web to CLI

1. Configure your selection at [agentsinc.sh/editor](/editor) and open
   the install dialog.
2. The dialog mints an id as it opens and shows you the command with the id in
   it, click-to-copy:

   ```bash
   npx agents-inc init --from Ab3xY9_Q
   ```

3. Run it. The CLI fetches the configuration, installs it, and compiles your
   sub-agents.

Some details that matter if you are relying on this:

- **The id is the configuration's own hash** — eight base64url characters of
  the payload's SHA-256. The same selection always mints the same id, so
  re-opening the dialog is idempotent and a stored configuration can never
  change underneath its id.
- **`init --from` runs headless.** It does not need a terminal, so it works
  over a pipe and in CI. `edit --from` needs one whenever it changes
  something, because it confirms before removing anything.
- **`init --from` refuses an existing installation.** Installing a shared
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
configuration.

```bash
npx agents-inc share
```

That reads the skills, sub-agents and per-agent curation installed in the
current directory, publishes them as one configuration, and prints the id with
both things you can do with it — `init --from <id>` on another machine, or
`agentsinc.sh/editor/?fromId=<id>` in a browser.

To go straight to the browser, `edit` does the same mint and prints the same
id and destinations, then, at a terminal, opens the editor on the id, so the
installation you are standing in becomes the selection loaded there:

```bash
npx agents-inc edit
```

Nothing on disk is touched by either. A configuration is read, not rewritten.

**A skill you wrote by hand does not travel.** Ownership is decided by the
provenance key the CLI stamps into every skill directory it writes, so one you
authored in `.claude/skills/` stays.
It is not refused, just out of scope — and `edit --from` reads that same
judgement, so a configuration that never mentioned your skill is never read as
an instruction to delete it.

To bring the browser's changes back, `edit --from <id>`. That direction is
destructive by design and confirms first: a shared configuration states a whole
roster, so whatever it leaves out is removed (from a project, only the
project's own entries), and every removal is named before anything is written.
Two things it refuses to drop quietly — a skill you authored in this
installation, and a skill this catalogue cannot place — are kept and reported
instead.

**The same id, either way round.** `share` and `edit` mint through one
reader, so one directory has one id, and the id is still the configuration's
own hash. Sharing an unchanged installation twice returns what it returned the
first time.

## Where to start

**Don't reach for the grid first if the project already exists.** A repository has
already made these decisions, and transcribing them into a grid is the slowest
route to a selection you could have had read off the code — see [Adding to an
existing project](/docs/guides/adding-to-an-existing-project). If it does not
exist yet, describe it to [the composer](/docs/editor/composer) instead.

The choice does not change the install. Every route ends at
`npx agents-inc init --from <id>` (with `--provider codex` for Codex), and the
next page you want is
[Quickstart](/docs/quickstart), which covers what lands on disk once it runs.

After that install, the CLI does things the editor has no answer for at all:
`compile`, `doctor`, `update`, `eject`, `uninstall`, and any hand
edit of `.agents-inc/claude/config.ts`. None of it has a browser equivalent — the
editor never touches a filesystem and never runs a command.

For the whole picture rather than the headline,
[Capabilities](/docs/reference/capabilities) lists what the editor and the CLI
each do, area by area, and
[Where the CLI stops on purpose](/docs/reference/capabilities#where-the-cli-stops-on-purpose)
explains why a few things live in only one of them.
