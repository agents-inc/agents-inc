<p align="center">
  <img alt="Agents Inc" src="./packages/cli/assets/logo.svg" width="300">
</p>

# Agents Inc

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

An agent composition framework for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Compose specialized subagents from atomic skills: pick a stack, choose your skills from an interactive grid, and compile subagents that carry exactly the skills you selected.

```bash
npx agents-inc init
```

**[packages/cli/README.md](./packages/cli/README.md)** introduces the CLI: its core commands, stacks, skills and guides. How to use it is documented on the site, written in [`apps/www/src/content/docs/docs/`](./apps/www/src/content/docs/docs/). This file describes the repository itself.

## Repository layout

```
/
├── apps/
│   ├── editor/           the editor (Vite + React, deployed to Cloudflare)
│   ├── server/           the API worker (Hono)
│   └── www/              the Astro site — landing page at /, docs at /docs
├── packages/
│   ├── cli/              the published CLI — this is agents-inc on npm
│   ├── matrix/           the skill catalog the web app reads
│   ├── compile/          the pure renderers — one implementation, called by the CLI's
│   │                     write path and by the editor's output preview
│   ├── api/              the typed hc<AppType> client everything calls the worker through
│   ├── api-mocks/        one MSW description of that worker, run by both editor suites
│   ├── ui/               the design system the editor and the site both build on
│   ├── eslint-config/    shared configs
│   ├── prettier-config/
│   ├── typescript-config/
│   └── vitest-config/
├── docs/
│   ├── cli/              the CLI's contributor documentation
│   ├── web/              the web planning notes
│   ├── meta/             what building this taught me, read off the commit history
│   └── repo/             documents spanning more than one workspace, owned by neither
├── todo/                 everything outstanding, one file per workspace
├── .github/workflows/
└── .husky/
```

`ls -d */ apps/*/ packages/*/ docs/*/` is what that tree is derived from, and re-deriving it is the
only way to keep it honest — a box-drawing tree with no ellipsis reads as complete whether or not it
is, and this one silently was not.

`packages/cli` is the only workspace that publishes to npm, as `agents-inc`. Its `README.md` is the one npm shows, which is why the product's introduction lives there rather than here.

## Working in it

The repository uses [bun](https://bun.sh) and [Turborepo](https://turborepo.com). One install covers every workspace:

```bash
bun install
```

That is the whole of it for the editor. The worker needs the values in `apps/server/.dev.vars` (copy `.dev.vars.example`, which says what each one is), and `bun run dev` does the rest before it starts `wrangler dev`: it applies the local D1 migrations, and when the local store holds no skill index or one older than three days, it builds one the way the daily job does, with no token, so signing in and the editor's Add skill search work locally as they do in production. If GitHub cannot be reached the worker starts anyway and says what skill search will answer. And in particular **do not create `apps/editor/.env` in order to make the build work.** It used to be necessary and it is not any more, which matters because the step was a footgun: `.env` is loaded in every mode, so the localhost address it carried for `bun dev` was also the address `vite build` froze into the bundle, and a hand-run `bun run deploy` would then publish a live site whose every request went to the developer's own machine. That very nearly happened during the repository merge.

What replaced it is `apps/editor/.env.production`, which is committed. Vite ranks a mode-specific env file above the generic one — shell, then `.env.production`, then `.env.local`, then `.env` — so a production build takes the real API address from that file and a local `.env` cannot reach it. Both halves follow: `bun dev` needs no setup because `env.schema.ts` still supplies the localhost default in development, and `bun run build` needs none because `.env.production` supplies the production one.

A `.env` of your own is still fine for the optional variables — `apps/editor/.env.example` documents what each is — and to point `bun dev` at a worker on a different port. To build a _bundle_ against something other than production, put it in `.env.production.local`, which is gitignored, and do not deploy that build: `bun run deploy` re-checks the built bundle against `.env.production` and refuses to upload one that disagrees.

The root scripts fan out through turbo to whichever workspaces define the matching task, so `bun run build` builds the CLI, the web app and the worker in dependency order:

| Script               | What it does                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run build`      | Builds every workspace                                                                                                                                   |
| `bun run dev`        | Starts every workspace's dev task                                                                                                                        |
| `bun run lint`       | Lints every workspace                                                                                                                                    |
| `bun run typecheck`  | Typechecks every workspace                                                                                                                               |
| `bun run test`       | Runs the unit tests                                                                                                                                      |
| `bun run test:e2e`   | Runs the end-to-end suites                                                                                                                               |
| `bun run deploy`     | Rebuilds, checks the bundle, then deploys the Cloudflare workspaces                                                                                      |
| `bun run format`     | Formats the repo (one run from the root, not through turbo)                                                                                              |
| `bun run deps:check` | Reports what is only visible across workspaces: version mismatches, and a tsconfig, Vitest config or ESLint config that stopped extending the shared one |

Two of those do not fan out, on purpose, and the reasons are written down where they apply:

- **`format`** runs once from the root because Prettier reads `.prettierignore` only from its working directory. See the `//format` note in `package.json`. Formatting inside `packages/cli` is still the CLI's own — 100 columns, semicolons, double quotes. Prettier picks the nearest config walking up from each file, so `packages/cli/prettier.config.mjs` wins there and the root config never touches it.
- **`deps:check`** compares the workspaces with each other, which no workspace's own task can do. See the `//deps:check` note in `package.json`.

## Where to read next

- **[todo/](./todo/)** — everything still outstanding, one tracker per workspace: [repo.md](./todo/repo.md) for this repository itself, then `cli.md`, `editor.md`, `www.md` and `server.md`
- **[packages/cli/README.md](./packages/cli/README.md)** — the CLI: commands, stacks, skills, subagents
- **[docs/cli/index.md](./docs/cli/index.md)** — material for people working on the CLI rather than with it

## License

MIT
