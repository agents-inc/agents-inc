# Architecture

How the workspaces fit, how a configuration travels from the editor to installed sub-agents, and
what generates and gates the code. Working rules: [`CLAUDE.md`](../CLAUDE.md). Releasing:
[`commit-protocol.md`](../packages/cli/.ai-docs/standards/commit-protocol.md).

## Workspaces

`workspaces` in the root `package.json` is `apps/*` and `packages/*`. Bun is the only package
manager (one `bun.lock`) and turbo runs every task. Only `packages/cli` publishes.

| Workspace                                             | Package                | What it is                                                                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/cli`                                        | `agents-inc`           | The CLI: oclif commands, Ink UI. tsup bundles `@workspace/{matrix,compile,api}` (`noExternal` in `tsup.config.ts`), so those three stay private                                                                          |
| `packages/matrix`                                     | `@workspace/matrix`    | The browser-safe skill catalogue, plus the wire contracts: `seed.ts` (a share id's payload), `matrix-schema.ts` (a marketplace's `catalog.json`), `skill-index.ts` (`GET /skills`)                                       |
| `packages/compile`                                    | `@workspace/compile`   | The pure renderers: `config.ts` and `config-types.ts` source, agent bodies, the Liquid engine, seed → config, and the vendored agent corpus. Node-free (`node-free.test.ts`), so the editor previews what the CLI writes |
| `packages/api`                                        | `@workspace/api`       | `createApiClient`: `hc<AppType>`, `AppType` imported from `server`. Sends cookies by default; the CLI passes `credentials: "omit"`                                                                                       |
| `packages/api-mocks`                                  | `@workspace/api-mocks` | One MSW description of the worker and of the GitHub hosts the editor reads. The CLI, editor and server suites all resolve against it                                                                                     |
| `packages/ui`                                         | `@workspace/ui`        | The design system: tokens and components, consumed as source                                                                                                                                                             |
| `packages/{eslint,prettier,typescript,vitest}-config` | `@workspace/*-config`  | Shared configs. `bun run deps:check` fails a workspace that stops extending one without a `//no-shared-*` reason in its `package.json`                                                                                   |
| `apps/editor`                                         | `editor`               | The editor at `agentsinc.sh/editor`: Vite, React, TanStack Router, zustand stores persisted to localStorage. Deployed as Cloudflare static assets                                                                        |
| `apps/server`                                         | `server`               | The API worker at `api.agentsinc.sh`: Hono with `@hono/zod-openapi`, KV `CONFIGS`, D1 through drizzle, better-auth (GitHub)                                                                                              |
| `apps/www`                                            | `www`                  | Astro and Starlight at `agentsinc.sh`: landing page at `/`, user docs at `/docs` from `apps/www/src/content/docs/docs/`. It has no React integration, on purpose (see `astro.config.ts`)                                 |

Skill content lives in the separate [`agents-inc/skills`](https://github.com/agents-inc/skills)
repository. It is the CLI's default marketplace (`DEFAULT_SOURCE` in `packages/compile/src/paths.ts`),
and `generate:types` reads it from a checkout beside this repository's root.

`packages/cli` formats itself (100 columns, semicolons, double quotes) through its own
`prettier.config.mjs`. Everything else uses the root config.

## The worker's routes

`grep -n '.openapi(' apps/server/src/index.ts` lists them. `AppType` is that chain's type, so a
route left out of it is missing from every client.

| Route                     | Where                        | What                                                                                                                                                                            |
| ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /configs`           | `index.ts` `createConfig`    | Validates `installableSeedPayloadSchema`, content-addresses the body, and stores it in KV `CONFIGS`. A different `v` gets `409` (`refuseAnotherSeedVersion`)                    |
| `GET /configs/{id}`       | `index.ts` `getConfig`       | Serves the payload. The CLI identifies itself with `user-agent: agents-inc-cli` (`SEED_USER_AGENT`)                                                                             |
| `GET /skills`             | `index.ts`, `skill-index.ts` | The external-skill search index, stored under `SKILL_INDEX_KEY` and carrying an `x-skill-index: fresh\|stale` header. `.github/workflows/build-skill-index.yml` builds it daily |
| `/stacks`, `/stacks/{id}` | `stacks.ts`                  | A signed-in user's saved stacks (D1). Each one points at a `configId`                                                                                                           |
| `POST /compose`           | `compose.ts`                 | Signed in: turns a sentence into skill ids through Anthropic. The editor derives everything else                                                                                |
| `/api/auth/*`             | `auth.ts`                    | better-auth. `authenticated` wraps every signed-in route                                                                                                                        |
| `POST /monitoring`        | `index.ts` `tunnelEnvelope`  | Sentry tunnel                                                                                                                                                                   |

## How a configuration flows

```
editor (apps/editor)              worker (apps/server)            CLI (packages/cli)
toSeedPayload ──POST /configs──▶  validate, hash, KV  ──id──▶  npx agents-inc init --from <id>
  features/configure/lib/seed.ts                                fetchSeedConfig ◀─GET /configs/{id}
  lib/api/configs.ts                                            seedToInstallSelection (@workspace/compile)
                                                                install: plugin or eject, per skill
                                                                writeConfigByScope → config.ts pair
                                                                compileAgentForHost → sub-agent files
```

1. **Editor.** The selection lives in `stores/config-store.ts`, judged against whichever catalogue
   is seated in `stores/catalog-store.ts`. Share and install call `createSharedConfig`, which POSTs
   `toSeedPayload(config)`. The install dialog prints `npx agents-inc init --from <id>`, and adds
   `--provider codex` only for Codex (`use-install-command.ts`). `/?fromId=<id>` opens a shared
   configuration without writing over the visitor's own (`use-catalog-first.ts`).
2. **Worker.** It stores the validated, re-serialised payload under its own hash, so the same
   configuration always gets the same id. The id is immutable.
3. **CLI.** `init --from` (`selectionFromSharedConfig` in `commands/init.tsx`) fetches the payload
   through `@workspace/api` against `SEED_API_URL` (`AGENTS_INC_API_URL` overrides it), maps it
   with `seedToInstallSelection`. `edit --from` applies a payload to an existing
   installation. `share` and a bare `edit` (`edit --ui`) go the other way:
   `seedPayloadForInstallation` then `publishSeedConfig`. The editor links the CLI prints are built
   on `EDITOR_URL` (`AGENTS_INC_EDITOR_URL` overrides it).
4. **Install and write.** Skills are installed per skill (see below), and skills the editor added
   from GitHub travel inline in the payload's `external` map (`writeExternalSkills`). The config is
   written only through `lib/config-gate/`, by `writeConfigByScope`. That call splits it by
   scope, propagates global changes to registered projects and recompiles them.
5. **Compile.** `compileAgentForHost` in `lib/compiler.ts` renders the partials under
   `packages/cli/src/agents/<group>/<agent>/` through `_templates/agent.liquid`. Claude gets
   markdown; Codex gets a TOML role file wrapping the same body (`renderAgentRoleToml` in
   `packages/compile/src/providers/codex/agent-role-toml.ts`).

**The contract is `packages/matrix/src/seed.ts`.** Every consumer imports it: the editor, the
worker, the CLI and the api-mocks fixtures. Changing the payload's shape means bumping
`SEED_VERSION`. The schema accepts exactly one version, with no migration, so old ids and saves
stop installing and must be re-shared. Then update `toSeedPayload` and `fromSeedPayload` in the
editor, `configToSeedPayload` on the CLI side, `seedToInstallSelection` in `@workspace/compile`,
and the fixtures in `packages/api-mocks/src/fixtures.ts`.

**The preview and the install share their renderers.** The editor's output preview renders with
`@workspace/compile` and the vendored corpus, so it draws the bytes `init --from` writes.
`apps/editor/e2e/specs/preview-matches-install.spec.ts` and
`packages/cli/e2e/lifecycle/preview-matches-install.e2e.test.ts` check that claim end to end.

## Providers, scopes, install modes

**Provider.** `PROVIDERS` is `["claude", "codex"]` (`packages/compile/src/source-layout.ts`). An
installation is exactly one provider, and its source folder `.agents-inc/<provider>/` is the only
record of which. Nothing in `config.ts` or in a payload names it. `--provider`
(`lib/installation/provider-flag.ts`) is only needed for a greenfield `init --from`, or when one
scope holds both folders. Every path goes through `lib/installation/install-layout.ts`.

**Scope.** `project` roots at the project directory and `global` at `$HOME`. Every skill and agent
entry carries its own `scope`.

| Per scope                | Claude                                                    | Codex                                                                                                                             |
| ------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Config pair              | `.agents-inc/claude/config.ts`, `config-types.ts`         | `.agents-inc/codex/config.ts`, `config-types.ts`                                                                                  |
| Skills (project, global) | `.claude/skills/`, `~/.claude/skills/`                    | `.agents/skills/`, `$CODEX_HOME/skills/` (default `~/.codex`)                                                                     |
| Sub-agents               | `.claude/agents/<name>.md`                                | `.codex/agents/<name>.toml`, `$CODEX_HOME/agents/<name>.toml`                                                                     |
| Plugins                  | `claude plugin`, both scopes (`lib/hosts/claude-host.ts`) | `codex plugin`, global only; plugin at project scope is refused (`refuseUnofferedPlacement` in `lib/hosts/offered-placements.ts`) |

- The global config tracks registered `projects`, and a global change is propagated into each of
  them (`propagateGlobalChangesToProjects` in `lib/config-gate/propagate.ts`). A project config
  inlines a snapshot of the global one. Its `config-types.ts` imports the global types and extends
  them.
- `AGENTS_NOT_ON_CODEX` (`packages/compile/src/providers/codex/roster.ts`) lists the sub-agents
  Codex does not compile. A project-scope Codex role only loads when the user's global
  `config.toml` trusts that project. `lib/hosts/codex-project-trust.ts` detects that entry and
  never writes it.

**Plugin or eject, per skill.** A skill's `origin` in `config.ts` is either `"eject"`
(`EJECT_SOURCE`), meaning it is copied into the skills directory, or a marketplace name, meaning it
is installed as a plugin through the host. A payload carries the same choice as
`install: "plugin" | "eject"`, so one agent can mix both. A compiled agent references a plugin skill
as `<id>:<id>` (`pluginRefFor`) and an ejected one by its bare id. A failed plugin install
hard-errors before anything writes config (`BaseCommand.reportPluginInstalls`). It never falls back
to eject.

## Generated code

The first four are `packages/cli` scripts, and `bun run generate` there runs them in order. Each
one's `:check` form compares in memory, names every drifted file and writes nothing.

| Script                    | Reads                                                             | Writes                                     | Drift caught by                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate:types` (cli)    | the `skills` checkout (or a path argument), agent `metadata.yaml` | `packages/cli/src/cli/types/generated/`    | `generate:types:check` in `prepublishOnly` only, because CI has no skills checkout. `regenerate-catalog.yml` regenerates on a `skills-updated` dispatch and opens a PR |
| `generate:schemas` (cli)  | the CLI's zod schemas                                             | `packages/cli/src/schemas/*.json`          | `generate:schemas:check` in CI `check-cli` and `prepublishOnly`; `generate-json-schemas.test.ts`                                                                       |
| `generate:matrix` (cli)   | `src/cli/types/`, agent metadata                                  | `packages/matrix/src/{vendor,generated}/`  | `generate:matrix:check` in CI `check-web`; `generate-matrix-package-against-this-repository.test.ts`                                                                   |
| `generate:compile` (cli)  | `src/agents/` partials and templates, the CLI version             | `packages/compile/src/generated/corpus.ts` | `generate:compile:check` in CI `check-web`; `generate-compile-package.test.ts`. It embeds `CORPUS_CLI_VERSION`, so a version bump makes it stale                       |
| `db:generate` (server)    | `apps/server/src/db/*.schema.ts`                                  | `apps/server/migrations/`                  | `db:generate:check` in pre-commit and CI                                                                                                                               |
| `cf-typegen` (server)     | `wrangler.jsonc`                                                  | `apps/server/worker-configuration.d.ts`    | nothing                                                                                                                                                                |
| `generate:icons` (editor) | simple-icons, the script's `OVERRIDES`                            | `apps/editor/src/lib/skill-icons.ts`       | nothing                                                                                                                                                                |
| `tokens` (ui)             | `packages/ui/tokens/tokens.json`                                  | `packages/ui/src/styles/tokens.css`        | `tokens:check`, run by `test`, which requires every colour token to have a dark value                                                                                  |

The generator tests are in the CLI's `unit` project (`scripts/**/*.test.ts`). Pre-commit therefore
catches schema, matrix and corpus drift whenever `packages/cli` moves. Never hand-edit generated
output; regenerate it and commit everything the generator wrote.

## Tests

| Workspace                       | `test`                                                                                                                                                                      | `test:e2e` and others                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/cli`                  | Vitest projects `unit`, `integration` and `commands` (`vitest.config.ts`). `HOME` is isolated (`vitest.setup.ts`). It refuses a stale `dist/`, so run `bun run build` first | `e2e`: `*.e2e.test.ts` drive the built CLI in a pseudo-terminal (`@lydell/node-pty`). `test:smoke`: `*.smoke.test.ts` probe the real `claude` and `codex` binaries |
| `apps/editor`                   | Vitest with the node preset. MSW refuses any unhandled request                                                                                                              | Playwright (`playwright.config.ts`). `test:visual`: Argos captures (`playwright.visual.config.ts`)                                                                 |
| `apps/server`                   | Vitest inside workerd (`@cloudflare/vitest-pool-workers`), with the D1 migrations applied                                                                                   | `vitest.e2e.config.ts`: processes a developer runs, such as `bun run dev`                                                                                          |
| `packages/ui`                   | Every story runs as a test in real Chromium, with axe at `error`                                                                                                            | `chromatic`: appearance baselines, light and dark                                                                                                                  |
| `apps/www`                      | The `scripts/check-*.ts` content checks                                                                                                                                     |                                                                                                                                                                    |
| matrix, compile, api, api-mocks | Vitest                                                                                                                                                                      |                                                                                                                                                                    |

There is no correct root Vitest run, so the root `vitest.config.mjs` throws. Run suites through
turbo or from inside the workspace.

### Mutation testing

StrykerJS runs from the repository root, one run at a time: `bun run mutation <config>`.
`ls stryker*` lists the configs. `stryker.config.json` is the CLI's first pass, and
`stryker.cli-lib.config.mjs` and `stryker.cli-commands.config.mjs` narrow it to the library code and
to the commands. Each `stryker.<name>.static.config.mjs` is the static pass of a first pass.

Each run replaces `reports/mutation/mutation.json`, so copy it aside before the next.
`bun packages/cli/scripts/run-mutation-summary.ts <report> --list` counts its mutants by status and
lists each one still open. Its `Survived after 0 tests` must be 0, because no test judged such a
mutant.

Run the cheapest workspace first; the CLI's passes take hours, so they go last. For each, run the
first pass, then its static config on the first pass's Ignored and Survived mutants. A static
mutant that only a few tests load lazily is run against those tests alone in the first pass, so it
is reported Survived rather than Ignored:

```
ranges=$(bun packages/cli/scripts/run-mutation-ranges.ts <first pass report> Ignored,Survived) &&
  bun run mutation stryker.<name>.static.config.mjs --mutate "$ranges"
```

The ranges script refuses, exiting non-zero, when no mutant in the report has the statuses asked
for: the pass it would feed has nothing to judge. Keep the two steps apart as above. Written inline
as `--mutate "$(…)"`, the refusal would not stop Stryker, which reads an empty `--mutate` as
nothing to mutate and does a dry run that exits 0.

The CLI's commands take four runs:

1. `stryker.cli-commands.config.mjs`, the first pass.
2. `bun packages/cli/scripts/run-rebuild-loadtime-files.ts <its report>` rewrites
   `packages/cli/vitest.loadtime.files.json`: the test files that can see a command's load-time code.
   `--output <file>` writes the list there instead. It needs a full first pass, and refuses a report
   narrowed with `--mutate`.
3. `stryker.cli-commands.static.config.mjs`, on the first pass's Ignored and Survived mutants as
   above.
4. `stryker.cli-commands.loaded-dist.config.mjs`, on the first pass's open mutants:

   ```
   ranges=$(bun packages/cli/scripts/run-mutation-ranges.ts <first pass report> Survived,NoCoverage,Timeout) &&
     bun run mutation stryker.cli-commands.loaded-dist.config.mjs --mutate "$ranges"
   ```

   That re-runs every open command mutant, not only the load-time code this pass exists for, so it
   is slower than the hand-picked load-time set the pass was first run on.

Stryker cannot reach the e2e and smoke specs, Playwright, or the Storybook stories: the code they
test runs in another process or in a browser, where Stryker does not see it.

Stryker never mutates code under a TypeScript `as`, `as const` included, and the report does not
say so: a list written `[…] as const satisfies T` or the `??` in `(x ?? []) as T` gets no mutant,
so break such code by hand.

## Gates

| Gate                            | Runs                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.husky/pre-commit`             | `lint-staged`, which runs `eslint --fix` then `prettier --write` on the staged files. `deps:check` when a manifest or a shared-tool config is staged. `turbo run lint typecheck test --filter='...[HEAD]'`, then `db:generate:check` on the same filter                                                                                                                                                              |
| `.husky/pre-push`               | Picks a side from `@{push}..HEAD`: the CLI side is `packages/cli` or matrix, compile, api or api-mocks; the web side is anything else under `apps/` or `packages/`; root tooling picks both. It runs `deps:check` on the same condition as pre-commit, lints each side that moved, then runs that side's `test` and `test:e2e`. The first web push on a machine needs `bunx playwright install --with-deps chromium` |
| CI `check-web`                  | `deps:check`, `format:check`, `generate:matrix:check`, `generate:compile:check`, `db:generate:check`, then typecheck, lint, test and test:e2e `--filter='!agents-inc'`                                                                                                                                                                                                                                               |
| CI `check-cli`                  | `generate:schemas:check`, then typecheck, lint, test and test:e2e `--filter=agents-inc`, then `test:smoke`                                                                                                                                                                                                                                                                                                           |
| CI `visual-ui`, `visual-editor` | Chromatic and Argos. A changed render fails until someone accepts it                                                                                                                                                                                                                                                                                                                                                 |
| CI `deploy`                     | On pushes to `main`, after `check-web`: applies the D1 migrations, then runs `bun run deploy` for the editor, worker and site                                                                                                                                                                                                                                                                                        |
| `prepublishOnly` (cli)          | `format:check`, `lint`, `typecheck`, `generate:schemas:check`, `generate:types:check`, `build`, `test`                                                                                                                                                                                                                                                                                                               |

## Cross-boundary rules

Both workspaces' suites pass when these rules break, so check them by hand when a change crosses
the editor–worker boundary.

- A shape change to the skill index bumps `SKILL_INDEX_KEY`. Never loosen `skillIndexSchema` to
  get around it.
- A response header the editor reads must be listed in `exposeHeaders` in the worker's `cors()`.
  MSW in Node is not cross-origin, so tests stay green without it.
- No route path ends in `/index`, because `hc` drops a trailing `/index` segment.
- Under zustand `persist`, `set` writes to localStorage, so an action that changes nothing must not
  call it.
- `vite build` fails past the first-paint budget (`apps/editor/scripts/first-paint-budget.ts`).
  `bun run deploy` refuses a bundle whose API address differs from the committed
  `apps/editor/.env.production` (`scripts/check-deployable-bundle.ts`).
