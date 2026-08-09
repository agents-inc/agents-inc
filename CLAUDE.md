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
  [`server.md`](./todo/server.md), [`repo.md`](./todo/repo.md) for the repository itself, and
  [`skills.md`](./todo/skills.md) for the skills marketplace repository, whose diffs land in
  [`agents-inc/skills`](https://github.com/agents-inc/skills) rather than here.
  [`plans/`](./todo/plans/) holds the detail for items that need it, and
  [`archive.md`](./todo/archive.md) records what has landed.
  [`ROADMAP.md`](./todo/ROADMAP.md) sequences everything outstanding across all six trackers —
  phases in execution order; the trackers stay canonical, the roadmap only orders them and is
  updated whenever a phase moves.
- **An item is deleted when it lands rather than ticked off**, and one line is appended to
  `archive.md`. There is no done column and nothing is struck through, so everything in a tracker is
  still open — and `archive.md` is the only record that a finished item ever existed.

## Repository-wide

- **Never run a git command that WRITES — read-only git is fine.** Reading is allowed and useful:
  `git status`, `log`, `show`, `diff`, `blame`, `stash list` — checking history, dating a
  regression, verifying what changed. What is forbidden is anything that mutates the index, the
  working tree, history or a remote: `git add`, `commit`, `reset`, `stash` (push/pop/drop),
  `checkout`, `restore`, `clean`, `push`, `rebase`, `merge`, amend. The user curates staging
  deliberately (clarified by the owner 2026-08-09; the rule previously read as an absolute ban).
  This rule is in `packages/cli/CLAUDE.md` as well, but it is not the CLI's rule and that file
  does not load from here.
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
