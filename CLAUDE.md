# Agents Inc — repository root

An agent composition framework for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).
Compose specialized subagents from atomic skills: pick a stack, choose your skills from an
interactive grid, and compile subagents that carry exactly the skills you selected. This was a single
CLI package until 2026-08-04 and is now a monorepo; `packages/cli` is still the only workspace that
publishes to npm.

| Workspace           | What it is                                             |
| ------------------- | ------------------------------------------------------ |
| `packages/cli`      | the published CLI — `agents-inc` on npm                |
| `apps/editor`       | the editor (Vite + React, deployed to Cloudflare)      |
| `apps/www`          | the Astro site — landing page at `/`, docs at `/docs`  |
| `apps/server`       | the API worker (Hono)                                  |
| `packages/matrix`   | the skill catalog the web app reads                    |
| `packages/ui`       | the design system shared by the web app                |
| `packages/*-config` | shared eslint, prettier, typescript and vitest configs |

[`README.md`](./README.md) carries the full layout and how to work in the repository.

## Where things live

- **[`packages/cli/.ai-docs/DOCUMENTATION_MAP.md`](./packages/cli/.ai-docs/DOCUMENTATION_MAP.md)** is
  the documentation index, and **[`packages/cli/CLAUDE.md`](./packages/cli/CLAUDE.md)** is the guide
  for CLI work specifically. Read both when the work is in that package — neither loads from here.
- **[`todo/`](./todo/)** holds everything outstanding, one file per workspace:
  [`cli.md`](./todo/cli.md), [`editor.md`](./todo/editor.md), [`www.md`](./todo/www.md),
  [`server.md`](./todo/server.md), and [`repo.md`](./todo/repo.md) for the repository itself.
  [`plans/`](./todo/plans/) holds the detail for items that need it, and
  [`archive.md`](./todo/archive.md) records what has landed.
- **An item is deleted when it lands rather than ticked off**, and one line is appended to
  `archive.md`. There is no done column and nothing is struck through, so everything in a tracker is
  still open — and `archive.md` is the only record that a finished item ever existed.

## Repository-wide

- **Never run a git command that changes the staging area or the working tree** — no `git add`,
  `reset`, `stash`, `checkout`, `restore` or `clean`. The user curates staging deliberately. This
  rule is in `packages/cli/CLAUDE.md` as well, but it is not the CLI's rule and that file does not
  load from here.
- **`packages/cli` formats itself** — 100 columns, semicolons, double quotes — while everything else
  uses the root config. Prettier picks the nearest config walking up, so this happens on its own; the
  reasoning is in the `//` notes in [`package.json`](./package.json).

## How work gets implemented

Agreed process. It applies to every item in `todo/`, and the order is the point.

1. **Write the tests first — end-to-end plus whatever else fits — and watch them fail.** A test
   that has never failed has not been shown to test anything.
2. Implement until they pass.
3. **Then** apply the `meta-design-expressive-typescript` skill — that skill only, no sub-agents —
   and bring the code in line with its principles.
4. **Then run it by hand through the CLI** and confirm it does what it claims. Passing tests and a
   working command are different claims; the `--from` work proved that when a green-looking path
   exited 13 on an unsettled Ink render that no assertion covered.

No jumping to step 2.
