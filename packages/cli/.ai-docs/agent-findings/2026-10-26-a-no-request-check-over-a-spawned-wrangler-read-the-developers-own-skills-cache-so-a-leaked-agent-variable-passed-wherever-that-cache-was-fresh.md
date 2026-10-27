---
type: missing-standard
severity: low
affected_files:
  - apps/server/e2e/helpers/local-dev.ts
  - apps/server/e2e/helpers/local-dev.e2e.test.ts
  - apps/server/e2e/dev.e2e.test.ts
standards_docs:
  - .ai-docs/standards/editor-and-worker.md
date: 2026-10-26
reporting_agent: api-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: the server e2e helper now gives wrangler a config folder of the run's own, pinned by two specs; the proposed standard below is not written
---

## What Was Wrong

`dev.e2e.test.ts` "keeps an index younger than three days, and asks GitHub for nothing" asserts the
stand-in GitHub saw no request. Under an AI agent's variable, wrangler 4.118 asks GitHub for
cloudflare/skills unless the skills list cached in its global config folder is under a day old (its
skills-cache reader in `node_modules/wrangler/wrangler-dist/cli.js`, a 24 h TTL). `devEnvironment`
passed the caller's `XDG_CONFIG_HOME` on, so wrangler read the developer's own cache.

Measured 2026-10-26, with `CLAUDECODE` taken off the withheld list (a variable let through) and the
caller's `XDG_CONFIG_HOME` pointed at a cache the run prepared:

- cache fresh: the check passed, the leak unseen;
- cache 25 h old: the check failed on four requests for the skills list.

So the check caught a leak only on a machine whose cache had aged past a day.

## Fix Applied

`devEnvironment` sets `XDG_CONFIG_HOME` to a folder in the run's scratch, so wrangler starts with no
cached list. With the same leak and a fresh caller cache, the check now fails. Two specs pin it, each
watched red on the old helper: a `devEnvironment` row in `local-dev.e2e.test.ts` (the folder handed
on lies inside the run's scratch), and a control in `dev.e2e.test.ts` that lets `CLAUDECODE` through
and requires the skills-list request (old helper, fresh caller cache: `Set{}`).

Left open, read from wrangler's source and not run: its global config lookup prefers `~/.wrangler`
over `XDG_CONFIG_HOME` when that directory exists. On such a machine the control fails with its
message rather than passing silently.

## Proposed Standard

In `standards/editor-and-worker.md`, beside the server e2e: a test that spawns a third-party CLI and
asserts on what it does (requests, writes) hands that CLI config and cache folders of the run's own,
not the caller's, and pins in the same file one control where the behaviour is seen. The CLI-side
twin is `standards/e2e/README.md` "A spawned binary is told about every environment variable the
product reads", which covers `bin/run.js` only. No conflict with either `CLAUDE.md` found; nothing
enforces it.

Census of wrangler spawns, 2026-10-26: `grep -rIn wrangler apps packages` (node_modules excluded)
finds two, `apps/server/e2e/helpers/local-dev.ts` and the product's `apps/server/scripts/dev.ts`,
which only `bun run dev` reaches; in test code that is `startDev`. Every call of the two spawning
helpers (`grep -rIn -e 'publishIntoLocalStore(' -e 'startDev(' apps packages`) builds its
environment with `devEnvironment`. The editor's Playwright web server is Vite, not wrangler.
