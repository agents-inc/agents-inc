---
title: CLI or web
description: The terminal wizard and the web editor are the same catalogue and the same output. How a configuration moves from one to the other, and which direction is not built yet.
---

There are two ways to select skills. They are two front doors onto one thing,
and the confusion is worth clearing up before anything else: **same catalogue,
same output, pick whichever you prefer.**

|                  | Terminal wizard         | Web editor                           |
| ---------------- | ----------------------- | ------------------------------------ |
| How you start it | `npx agents-inc init`   | [agentsinc.sh](https://agentsinc.sh) |
| Where you select | Ink UI in your terminal | Visual grid in the browser           |
| What it produces | The installation itself | An id you hand to the CLI            |

Neither is the "real" one. The web editor does not install anything —
your browser cannot write to `.claude/` — so it hands you a short id, and
`init --from <id>` does the install. The terminal wizard skips the id because
it is already where the files go.

## Same catalogue

The web app does not maintain its own list of skills. It vendors the CLI's
generated catalogue, and because both now live in one repository, the
catalogue and the code it is generated from move in the same commit — CI
regenerates and fails if the checked-in copy has drifted. There is no window in
which the grid can offer a skill the CLI does not have.

## Web to CLI, the round trip that exists

1. Configure your selection at [agentsinc.sh](https://agentsinc.sh) and open
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
- **`--from` overrides an existing installation.** A bare `init` in an
  already-installed directory shows the dashboard instead; an id is an explicit
  instruction to install _that_ configuration, so it does not divert.
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
id, in the form `agentsinc.sh/?fromId=<id>`. Opening it loads that
configuration into the editor. That is for handing a selection to another
person to look at or adjust; the install dialog is what you use to actually
install it.

A dead or unreadable link says so and leaves whatever you had configured
alone.

## CLI to web: not built

There is no way to turn an existing installation back into a web
configuration. The CLI cannot mint an id — there is no `share` command, and
`edit` has no flag that opens the editor. The id flow runs one direction
only: web to CLI.

If you started in the terminal and want to carry on in the browser, you would
re-select in the grid by hand.

:::caution
The web editor's install dialog currently ends with a line suggesting
`npx agents-inc edit --ui` to re-open the editor. **That flag does not
exist.** `edit` accepts `--refresh` and `--source` and nothing else. Ignore
the suggestion until this page says otherwise.
:::

## Which should you use

Use the **terminal wizard** if you are already in the project, want to install
right now, or need to do this without a browser — CI, a remote machine, a
container.

Use the **web editor** if you would rather see the whole catalogue laid
out at once, or you want to hand a selection to someone else before anyone
installs anything.

Either way the next page you want is
[Quickstart](/docs/quickstart), which covers what lands on disk once the
install runs.
