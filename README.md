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

Everything the CLI can do — the full command reference, the stack list, the skill catalog and the guides — lives in **[packages/cli/README.md](./packages/cli/README.md)**. This file describes the repository itself.

## Repository layout

```
/
├── apps/
│   ├── editor/           the editor (Vite + React, deployed to Cloudflare)
│   └── server/           the API worker (Hono)
├── packages/
│   ├── cli/              the published CLI — this is agents-inc on npm
│   ├── matrix/           the skill catalog the web app reads
│   ├── ui/               the design system shared by the web app
│   ├── eslint-config/    shared configs
│   ├── prettier-config/
│   ├── typescript-config/
│   └── vitest-config/
├── docs/
│   ├── cli/              the CLI's product documentation
│   └── web/              the web planning notes
├── .github/workflows/
└── .husky/
```

`packages/cli` is the only workspace that publishes to npm, as `agents-inc`. Its `README.md` is the one npm shows, which is why the product documentation lives there rather than here.

## Working in it

The repository uses [bun](https://bun.sh) and [Turborepo](https://turborepo.com). One install covers every workspace:

```bash
bun install
```

That is the whole of it — nothing else to copy, and in particular **do not create `apps/editor/.env` in order to make the build work.** It used to be necessary and it is not any more, which matters because the step was a footgun: `.env` is loaded in every mode, so the localhost address it carried for `bun dev` was also the address `vite build` froze into the bundle, and a hand-run `bun run deploy` would then publish a live site whose every request went to the developer's own machine. That very nearly happened during the repository merge.

What replaced it is `apps/editor/.env.production`, which is committed. Vite ranks a mode-specific env file above the generic one — shell, then `.env.production`, then `.env.local`, then `.env` — so a production build takes the real API address from that file and a local `.env` cannot reach it. Both halves follow: `bun dev` needs no setup because `env.schema.ts` still supplies the localhost default in development, and `bun run build` needs none because `.env.production` supplies the production one.

A `.env` of your own is still fine for the optional variables — `apps/editor/.env.example` documents what each is — and to point `bun dev` at a worker on a different port. To build a _bundle_ against something other than production, put it in `.env.production.local`, which is gitignored, and do not deploy that build: `bun run deploy` re-checks the built bundle against `.env.production` and refuses to upload one that disagrees.

The root scripts fan out through turbo to whichever workspaces define the matching task, so `bun run build` builds the CLI, the web app and the worker in dependency order:

| Script               | What it does                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `bun run build`      | Builds every workspace                                                                                                     |
| `bun run dev`        | Starts every workspace's dev task                                                                                          |
| `bun run lint`       | Lints every workspace                                                                                                      |
| `bun run typecheck`  | Typechecks every workspace                                                                                                 |
| `bun run test`       | Runs the unit tests                                                                                                        |
| `bun run test:e2e`   | Runs the end-to-end suites                                                                                                 |
| `bun run deploy`     | Rebuilds, checks the bundle, then deploys the Cloudflare workspaces                                                        |
| `bun run format`     | Formats the repo (one run from the root, not through turbo)                                                                |
| `bun run deps:check` | Reports what is only visible across workspaces: version mismatches, and tsconfigs that stopped extending the shared config |

Two of those do not fan out, on purpose, and the reasons are written down where they apply:

- **`format`** runs once from the root because Prettier reads `.prettierignore` only from its working directory. See the `//format` note in `package.json`.
- **Formatting inside `packages/cli`** is still the CLI's own — 100 columns, semicolons, double quotes. Prettier picks the nearest config walking up from each file, so `packages/cli/prettier.config.mjs` wins there and the root config never touches it.

`bun run deps:check` used to stay quiet about the CLI and the web app disagreeing on React, Vitest, TypeScript and ESLint. **They agree as of 2026-08-05** — one React, one Vitest, one TypeScript, one ESLint. `.syncpackrc.cjs` still carries the two groups that hid that disagreement, so they now hide nothing; removing them is REPO-26 in [todo/repo.md](./todo/repo.md), and it will surface a handful of smaller versions that drifted while nobody was comparing.

## Where to read next

- **[todo/](./todo/)** — everything still outstanding, one tracker per workspace: [repo.md](./todo/repo.md) for this repository itself, then `cli.md`, `editor.md`, `www.md` and `server.md`
- **[packages/cli/README.md](./packages/cli/README.md)** — the CLI: commands, stacks, skills, subagents
- **[docs/cli/index.md](./docs/cli/index.md)** — the CLI's full documentation

## License

MIT
