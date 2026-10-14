<p align="center">
  <img alt="Agents Inc" src="./packages/cli/assets/logo.svg" width="300">
</p>

# Agents Inc

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

An agent composition framework for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).
Compose specialized subagents from atomic skills: pick a stack, choose your skills from an
interactive grid, and compile subagents that carry exactly the skills you selected.

```bash
npx agents-inc init
```

The product's introduction is [`packages/cli/README.md`](./packages/cli/README.md), which npm shows.
User docs are in [`apps/www/src/content/docs/docs/`](./apps/www/src/content/docs/docs/). This file
covers the repository.

## Workspaces

| Workspace            | What it is                                                            |
| -------------------- | --------------------------------------------------------------------- |
| `packages/cli`       | the published CLI, `agents-inc` on npm                                |
| `apps/editor`        | the editor (Vite + React, deployed to Cloudflare)                     |
| `apps/www`           | the Astro site: landing page at `/`, docs at `/docs`                  |
| `apps/server`        | the API worker (Hono)                                                 |
| `packages/matrix`    | the skill catalog the web app reads                                   |
| `packages/compile`   | the pure renderers the CLI writes with and the editor previews        |
| `packages/api`       | the typed `hc<AppType>` client everything calls the worker through    |
| `packages/api-mocks` | one MSW description of that worker, used by every suite that mocks it |
| `packages/ui`        | the design system the editor and the site both build on               |
| `packages/*-config`  | shared eslint, prettier, typescript and vitest configs                |

- [`docs/architecture.md`](./docs/architecture.md): how they fit, the configuration flow, generated
  code, tests and gates.
- [`packages/cli/.ai-docs/standards/commit-protocol.md`](./packages/cli/.ai-docs/standards/commit-protocol.md):
  commits and the release checklist.
- [`todo/`](./todo/): everything outstanding, one tracker per workspace.

## Working in it

Use [bun](https://bun.sh) and [Turborepo](https://turborepo.com). One `bun install` covers every
workspace. The root scripts fan out through turbo:

| Script                                         | What it does                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bun run build` / `dev` / `lint` / `typecheck` | per workspace, in dependency order                                                             |
| `bun run test` / `test:e2e`                    | unit suites / end-to-end suites                                                                |
| `bun run deploy`                               | rebuilds, checks the editor bundle, deploys the Cloudflare workspaces                          |
| `bun run format`                               | Prettier, once from the root (it reads `.prettierignore` only from its working directory)      |
| `bun run deps:check`                           | cross-workspace checks: version mismatches, and configs that stopped extending the shared ones |

- **Worker:** copy `apps/server/.dev.vars.example` to `.dev.vars`. `bun run dev` applies the local
  D1 migrations and builds a local skill index if it is missing or stale, then starts
  `wrangler dev`.
- **Editor:** it needs no setup. **Do not create `apps/editor/.env` to make a build work.** The
  committed `.env.production` sets the production API address and outranks `.env`. Use a `.env` only
  for the optional variables in `.env.example`. To build against another API, use the gitignored
  `.env.production.local`, and never deploy that build. `bun run deploy` refuses a bundle that
  disagrees with `.env.production`.
- **Web tests:** the first run needs `bunx playwright install --with-deps chromium`.
- `packages/cli` formats itself (100 columns, semicolons, double quotes) through its own Prettier
  config.

## License

MIT
