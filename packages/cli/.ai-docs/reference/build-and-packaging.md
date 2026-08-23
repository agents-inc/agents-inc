---
scope: reference
area: build
keywords:
  [
    tsup,
    build,
    packaging,
    publishing,
    npm-pack,
    dist,
    entry-globs,
    onSuccess,
    banner,
    shebang,
    shims,
    sourcemap,
    dts,
    clean,
    noExternal,
    workspace-matrix,
    files,
    exports,
    bin,
    oclif-block,
    topicSeparator,
    commandsDir,
    hooks-init,
    oclif-plugins,
    config-exports,
    defineConfig,
    CLI_ROOT,
    PROJECT_ROOT,
    prepublishOnly,
    alias-package,
  ]
related:
  - reference/architecture-overview.md
  - reference/commands/index.md
  - reference/features/agent-system.md
  - reference/features/configuration.md
  - reference/features/code-generation.md
  - reference/features/seed-contract.md
  - reference/testing/e2e-infrastructure.md
last_validated: 2026-08-09
---

# Build, Packaging and Distribution

## Overview

Four surfaces, four owners, and they do not overlap:

| Surface                                        | Owned by                            | Consumed by                                                                 |
| ---------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------- |
| What source becomes JavaScript, and where      | `tsup.config.ts`                    | Nothing else — `tsc` is only ever run with `--noEmit`                       |
| What ends up in the published tarball          | `package.json` -> `files`           | `npm publish` / `npm pack`                                                  |
| Which of those files oclif treats as a command | `package.json` -> `oclif`           | Every invocation, including unit tests and E2E                              |
| The library import surface                     | `package.json` -> `exports./config` | Consumer `.claude-src/config.ts` files, and `config-loader.ts`'s jiti alias |

**This doc owns the packaging counts** (entry globs, published-tarball figures). No other doc restates
them; re-derive with the commands named in each section rather than quoting them from an index.

**This doc is the natural home for two verified traps.** Both are stated below as facts, not
warnings: command discovery reads `dist/`, so a source-only change adds no command; and the built
`config-loader` cannot resolve the very import path `exports./config` advertises.

---

## 1. Scripts

| Script              | Command                                                                                                | Notes                                                                                                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `build`             | `tsup`                                                                                                 | The only writer of `dist/`                                                                                                                                                                                                                              |
| `dev`               | `tsup --watch`                                                                                         | Same entry contract, incremental                                                                                                                                                                                                                        |
| `agentsinc`         | `node dist/index.js`                                                                                   | Runs the built CLI                                                                                                                                                                                                                                      |
| `agentsinc:dev`     | `bun src/cli/index.ts`                                                                                 | Runs from source. Commands still resolve through `dist/` — see §8                                                                                                                                                                                       |
| `typecheck`         | `tsc --noEmit && tsc -p tsconfig.scripts.json --noEmit && tsc -p e2e/tsconfig.json --noEmit`           | **Three** tsc programs, not one — `src/`, `scripts/` and `e2e/`. The first takes `--noEmit` on the command line (`tsconfig.json` declares `outDir: "dist"` and no `noEmit`); the other two declare `noEmit` themselves. Nothing ever runs `tsc` to emit |
| `typecheck:scripts` | `tsc -p tsconfig.scripts.json --noEmit`                                                                | Still exists as a standalone entry; `typecheck` now runs the same program, so it is no longer the only way to reach it                                                                                                                                  |
| `pretest:e2e`       | `bun run build`                                                                                        | npm lifecycle hook — `test:e2e` always rebuilds first                                                                                                                                                                                                   |
| `prepublishOnly`    | `format:check && lint && typecheck && generate:schemas:check && generate:types:check && build && test` | The whole publish gate. Runs in that order and stops at the first failure                                                                                                                                                                               |

**`typecheck` covering three programs is recent and load-bearing.** `scripts/` and `e2e/` used to sit outside every composite gate — which is how `scripts/` stayed untype-checked long enough to hide a phantom field and two fabricated `SkillId`s. Both are now checked on every pre-commit, every CI run and every publish. See [`features/code-generation.md`](./features/code-generation.md).

### What turbo hashes as build input

`packages/cli/turbo.json` (which `extends: ["//"]`) narrows the `build` task's `inputs` from turbo's
default — every file in the package — to what tsup actually consumes. The negations are `.ai-docs/**`,
`changelogs/**`, `e2e/**`, `**/*.test.ts(x)`, `**/__tests__/**`, `**/__mocks__/**` and `*.md` at the
package root. Before them, editing one line of reference prose invalidated the cache and rebuilt
`dist/`.

**`src/agents/`'s markdown stays IN, and that is not an oversight.** `onSuccess` copies that
directory into `dist/` verbatim (§5), so its `.md` files genuinely are build input. The `*.md`
negation is anchored at the package root precisely so it cannot reach them. The same file also
declares `test` and `test:e2e` as `dependsOn: ["build"]` — deliberately without the caret, because
both suites resolve oclif commands out of this package's own `dist/` (§8, §9).

**`packages/matrix` is in this hash, and nothing in `inputs` names it.** tsup inlines that package
into the bundle (`noExternal`, §7), so its source is build input — and it has no `build` script, so
there appears to be nothing for the root task's `^build` to hang on. It is hashed regardless: turbo
puts a task node in the graph for a dependency that does not implement the task.
`turbo run build --dry=json --filter=agents-inc` shows `@workspace/matrix#build` carrying
`"command": "<NONEXISTENT>"`, all of its files hashed, listed among `agents-inc#build`'s
`dependencies` — and that node's hash feeds the CLI's. Measured on turbo 2.10.8 (CLI-458 was filed
on the opposite assumption): appending one comment line to
`packages/matrix/src/read-model/domains.ts` turns a `>>> FULL TURBO` replay of `agents-inc#build`
into a re-run and moves `agents-inc#test`'s hash with it, while the same edit to a package the CLI
does **not** depend on (`packages/ui`) leaves both hashes byte-identical — so it is the dependency
edge doing this, not the global hash. `"../matrix/src/**"` in `inputs` is accepted by turbo and does
hash the files it matches, but it would hash them a second time under a second name and would
need another line for every workspace dependency this package gains, so it is deliberately absent.
What turbo covers here, the `globalSetup` guard covers for the invocations turbo never sees —
`vitest.global-setup.ts` calls `assertDistIsFresh` in `src/cli/lib/testing/dist-staleness.ts`, which
scans `packages/matrix/src` as its own build-input tree ([testing/infrastructure.md](./testing/infrastructure.md#the-commands-project-executes-dist-not-src)).

There is **no CI publish workflow.** `.github/workflows/` holds exactly one file, `ci.yml`, and none
of its three jobs touches npm: `check-cli` runs this package's typecheck, lint, unit and E2E suites,
`check-web` does the same for the rest of the monorepo (and first runs `generate:matrix:check` **from
this package** — see [`features/code-generation.md`](./features/code-generation.md)), and `deploy`
ships the web app to Cloudflare. Publication is a manual `npm publish`, and `prepublishOnly` is the
only gate between the working tree and the registry.

> **`prepublishOnly`'s first step is `format:check`, and it covers markdown.** `prettier --check .`
> runs over the whole package, `.ai-docs/**/*.md` included — the package's `.prettierignore` names
> `CLAUDE.md`, `V2.md` and `todo/*` and nothing else. So an unformatted reference doc fails the
> publish gate at step one and hides every failure behind it (§10 trap 11). Run
> `bun run format` after editing anything under `.ai-docs/`.

---

## 2. The entry contract

`tsup.config.ts` -> `entry` is **six positive globs and three negations**. Every file the positives
match, and the negations do not, becomes its own output file under `dist/`, mirroring its path below
`src/cli/`.

| Glob                             | Matches                                     | Output                   |
| -------------------------------- | ------------------------------------------- | ------------------------ |
| `src/cli/index.ts`               | The oclif entry point                       | `dist/index.js`          |
| `src/cli/config-exports.ts`      | The library export surface (§7)             | `dist/config-exports.js` |
| `src/cli/commands/**/*.{ts,tsx}` | Every oclif command, at any nesting depth   | `dist/commands/**`       |
| `src/cli/hooks/**/*.ts`          | Every oclif lifecycle hook                  | `dist/hooks/**`          |
| `src/cli/components/**/*.tsx`    | Ink components **only** — `.tsx`, not `.ts` | `dist/components/**`     |
| `src/cli/stores/**/*.ts`         | Zustand stores                              | `dist/stores/**`         |
| `!src/cli/**/*.test.{ts,tsx}`    | Excludes every co-located spec              | —                        |
| `!src/cli/**/__tests__/**`       | Excludes test support directories           | —                        |
| `!src/cli/**/__mocks__/**`       | Excludes mock directories                   | —                        |

### Consequences, stated as rules

1. **A new file under `src/cli/commands/` or `src/cli/hooks/` becomes its own `dist` entry
   automatically.** No config edit is needed to add a command. That is deliberate: `oclif.commands`
   discovers by directory scan, so an entry that had to be registered by hand would be a second place
   to forget.
2. **A new file under `src/cli/lib/`, `src/cli/utils/` or `src/cli/types/` is never an entry.** It is
   bundled **transitively** into whichever chunk its importers land in, and it has no path of its own
   in `dist/`. Adding one and then looking for `dist/lib/<name>.js` will find nothing; that is
   correct behaviour, not a build failure.
3. **`src/cli/hooks/` and `src/cli/components/hooks/` are different things and only one is an
   entry directory.** The glob is `src/cli/hooks/**/*.ts` — anchored, not `**/hooks/**`. The oclif
   lifecycle hook `src/cli/hooks/init.ts` is an entry. The React hooks under
   `src/cli/components/hooks/` are `.ts` files under `src/cli/components/`, which the components glob
   (`*.tsx`) does not match, so none of them is an entry. Neither is
   `src/cli/components/themes/default.ts`, `src/cli/components/wizard/hotkeys.ts`, or
   `src/cli/components/wizard/utils.ts`.
4. **Co-located test files are excluded, and a test now pins that.** The three negations are the
   whole of the mechanism — the positive globs read whole directories and this repository keeps its
   tests beside the code they cover, so without them every spec under `components/` and `stores/` is
   compiled into `dist/` and published — sixteen of them, in every release before the negations
   landed. `src/cli/lib/__tests__/packaging.test.ts` asserts that `dist/` holds no
   `*.test.js`, `*.test.js.map` or `*.test.d.ts`, and that every `files` entry in `package.json`
   exists on disk (§6, §9). **Deleting a negation is not a build change; it is a publish change.**
5. **`.gitkeep` is not matched** — `src/cli/commands/.gitkeep`, `src/cli/stores/.gitkeep`,
   `src/cli/components/common/.gitkeep` and `src/cli/components/wizard/.gitkeep` produce nothing.
6. **Non-code assets are never carried by the entry contract.** A Liquid template, a JSON schema or a
   `.md` partial added under `src/` is invisible to `entry`. It reaches the package only through
   `onSuccess` (§5) or `files` (§6), and both are hand-maintained lists.

---

## 3. Build options

| Option       | Value                   | What it buys                                                                                                                                       |
| ------------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`     | `["esm"]`               | Single format. Matches `"type": "module"`; there is no CJS build and no dual-package hazard                                                        |
| `platform`   | `node`                  | Node built-ins stay external; `fs`, `path`, `os` are not polyfilled                                                                                |
| `noExternal` | `["@workspace/matrix"]` | Forces the private workspace package into the bundle. Load-bearing — see below                                                                     |
| `target`     | `node22`                | Downlevels syntax newer than Node 22. One of **three separate declarations of the runtime floor**, which agree today — see below                   |
| `clean`      | `true`                  | `dist/` is wiped before every build, so a deleted command's artefact disappears on the next build rather than lingering and staying discoverable   |
| `sourcemap`  | `true`                  | One `.js.map` per emitted `.js`. These are published (§6) and are the single largest group in the tarball                                          |
| `shims`      | `true`                  | Injects tsup's `esm_shims` module so bundled code may reference the CJS globals `__dirname` / `__filename`. Inert in the current build — see below |
| `dts`        | `false`                 | **No `.d.ts` is emitted anywhere.** See §7 for why that is tolerable and where it is not                                                           |
| `outDir`     | `dist`                  | Hard-coded; `onSuccess` also hard-codes the literal string `"dist"`, so overriding `--out-dir` on the CLI would split the two halves apart         |
| `banner.js`  | `#!/usr/bin/env node`   | See below                                                                                                                                          |

### The runtime floor is declared in three places, and they must be changed together

Node 22 is the floor. It is stated three times, in three files, and **nothing checks that the three
agree** — no test, no lint rule, no script. They agree today because someone lined them up by hand.

| Declaration                                | Says     | What it does if it disagrees with the others                |
| ------------------------------------------ | -------- | ----------------------------------------------------------- |
| `packages/cli/package.json` `engines.node` | `>=22`   | Decides which Node an install is allowed on                 |
| root `package.json` `engines.node`         | `>=22`   | Same, for anyone working in the repository                  |
| `tsup.config.ts` `target`                  | `node22` | Decides how new the syntax in the emitted JavaScript may be |

**Change all three, or none.** The dangerous direction is raising `target` above what `engines`
allows: that ships syntax a runtime someone was told they could install cannot parse. The safe
direction — `target` below `engines` — costs nothing but is still wrong, because the file then says
something untrue about what the package supports.

**Nothing catches a `target`/`engines` mismatch.** Both `engines` fields have been raised while
`target` was left behind, and it was found by reading the file rather than by any check.
`tsup.config.ts` carries a comment naming `engines.node` as the thing it must stay in step with.

> **Correcting `target` alone need not change a single byte of built output.** The setting does real
> work — at `node18` the bundler strips an import attribute that at `node22` it keeps — so identical
> output only means the source contains no syntax in the band between the two. **The value of the
> change is making the third declaration truthful, not changing the artefact.** Do not read the
> null result as evidence that `target` does not matter.

**`tsconfig.json`'s `target: "ES2022"` is a different question and is deliberately not in the table
above.** It sets which JavaScript language features the type-checker assumes, not which Node the
package runs on. It was left alone on purpose and the owner has not decided on it; do not "align" it
with the floor.

A fourth place carries the same number without being a declaration of the floor: CI pins
`NODE_VERSION: 22` in `.github/workflows/ci.yml` across all three jobs. That pin is not cosmetic —
the E2E harness launches the CLI as a real child process with `pty.spawn("node", …)`, so **the
runner's Node is the runtime executing the thing under test.** Before the pin, every job ran on
whatever Node the runner image happened to ship that week, which is to say the floor was declared
and never exercised.

> `actions/setup-node@v4` is used rather than the current v7 **on purpose.** Versions 5 and 6 added
> automatic dependency caching keyed off a lockfile, and this repository has `bun.lock` rather than
> `package-lock.json` — the exact shape where that step fails looking for a file that is not there.
> v4 predates the behaviour and does only one thing. If this is ever moved forward, `v7` needs
> `package-manager-cache: false` alongside it.

### `@workspace/matrix` is bundled, and the two settings that do it are a pair

The seed wire contract lives in `packages/matrix/src/seed.ts` and is imported as
`@workspace/matrix/seed` by `src/cli/lib/seed/fetch-seed.ts` and `seed-to-wizard.ts`. That package is
**private, unpublished and ships TypeScript**, so nothing it exports can be resolved at runtime from
an installed tarball. Two declarations make that safe:

| Declaration                                                  | File             | Effect                                           |
| ------------------------------------------------------------ | ---------------- | ------------------------------------------------ |
| `"@workspace/matrix": "workspace:*"` under `devDependencies` | `package.json`   | Never installed alongside the published package  |
| `noExternal: ["@workspace/matrix"]`                          | `tsup.config.ts` | Inlines its source instead of emitting an import |

Verified against a built tree: the schema's Zod calls appear inline in `dist/chunk-*.js`, that
chunk's sourcemap names `../../matrix/src/seed.ts` among its `sources`, and **no emitted `.js`
contains the specifier `@workspace/matrix`**.

**tsup bundles `devDependencies` by default and leaves `dependencies` external**, so `noExternal` is
belt-and-braces — but the belt is what matters here: promoting the package to `dependencies` would
silently externalise it, and `init --from` would fail at import time in the published CLI while every
local gate stayed green (locally the workspace symlink resolves). `tsup.config.ts` carries the same
warning inline. Contract detail: [`features/seed-contract.md`](./features/seed-contract.md).

### `shims: true` is currently insurance, not load-bearing

95 emitted files open with `init_esm_shims()`, but the initializer's body is `"use strict";` and the
chunk exports no `__dirname`: both constants were tree-shaken because nothing in the bundle reads
them as free variables. Every module here that needs its own directory derives it explicitly from
`import.meta.url` (`src/cli/consts.ts`, `src/cli/lib/configuration/config-loader.ts`,
`src/cli/lib/__tests__/helpers/cli-runner.ts`). Do not read the option as the mechanism that makes
`CLI_ROOT` work — that is `import.meta.url`. `shims` is cheap cover for a bundled dependency that
references the CJS globals, and it becomes load-bearing only when one does.

### The shebang is injected, not written

`src/cli/index.ts` is five lines and starts with `import { run, flush, Errors } from "@oclif/core";`.
It carries **no shebang**. The `#!/usr/bin/env node` line that makes `dist/index.js` directly
executable is `banner.js`, applied by the bundler.

Two consequences that are easy to get wrong:

- **The banner goes on every emitted `.js`, not just the entry.** Shared chunks carry it too. tsup
  then marks every shebang-bearing file executable, which is why `dist/**/*.js` is mode `0755` while
  `dist/**/*.js.map` is `0644`.
- **Adding a shebang to `src/cli/index.ts` would produce two.** The banner is unconditional.

---

## 4. Output layout

```
dist/
  index.js                  # entry — the bin target
  config-exports.js         # entry — the library target
  commands/                 # entry per source command, path-mirrored
    build/  import/  new/
  hooks/init.js             # entry — the oclif lifecycle hook
  components/               # entry per source .tsx (common/ and wizard/ only)
  stores/                   # entry per source .ts, tests included
  chunk-<HASH>.js           # shared code, always FLAT at the dist root
  <module-name>-<HASH>.js   # dynamic-import split points, named after the module
  src/agents/               # NOT built — copied verbatim by onSuccess (§5)
```

**Chunks are flat.** Every shared chunk lands at `dist/chunk-<HASH>.js` regardless of how deep its
sources were. This is what makes the `CLI_ROOT` arithmetic in §5 work for bundled code and what
breaks the `config-loader` arithmetic in §7 — same cause, opposite outcome.

**`await import(...)` produces a named chunk, not an entry.** The lazy imports that exist to break
`lib -> operations -> lib` load-time cycles (`recompile-project-agents`, `copy-local-skills`,
`load-agent-defs`, `source-loader`) each surface as
`dist/<module-name>-<HASH>.js`. They are output files with stable-looking names and are **not**
addressable entry points — nothing may import them by path.

---

## 5. `onSuccess` — the asset copy

`tsup.config.ts` -> `onSuccess` performs one `fs.copy`, guarded by `fs.pathExists` and preceded by
an `fs.remove` of its destination:

| Source        | Destination        | Reason recorded in the config                                              | Status today     |
| ------------- | ------------------ | -------------------------------------------------------------------------- | ---------------- |
| `src/agents/` | `dist/src/agents/` | _"so eject command can find them regardless of how PROJECT_ROOT resolves"_ | Copies 115 files |

### The `fs.remove` before the copy is load-bearing

`fs.copy` **merges**: it writes what the source has and removes nothing the source has dropped. And
`clean: true` does not close that gap. It globs `**/*` over the whole `outDir` and unlinks every
match whatever emitted it, but it only ever unlinks — directories are left standing, and `**/*`
matches no dotfile — so an emptied agent directory survives the clean and then survives the merge.
That is not a tidiness problem: `prepublishOnly` runs a plain `build` with no preceding `rm -rf dist`, `dist/`
publishes wholesale, and `loadAllAgents()` discovers agents by globbing `**/metadata.yaml` under the
resolved agents dir — so a retired agent sat on a path the loader really does read, carrying an id
no longer in the `AgentName` union. It was observed twice: four retired PM directories after the PM
consolidation, and five retired reviewer directories after the reviewer one.

**No other gate could see it.** E2E builds the dist it then runs against, so the stale directory was
invisible to the suite that would otherwise have caught it, and a hand verification of the built
binary read the stale copies as shipped. `packaging.test.ts` is the tripwire: it asserts that the
entry set under `dist/src/agents/` **equals** the set under `src/agents/`. Set equality, not a
subset — a subset assertion passes on precisely this failure mode.

Anyone adding a second `onSuccess` copy inherits the same default. Mirror, do not merge.

### What "regardless of how PROJECT_ROOT resolves" means

`src/cli/consts.ts` derives the CLI's own root from the directory of the module doing the deriving:

```ts
const isInDist = __dirname.includes("/dist");
const CLI_ROOT = isInDist ? path.resolve(__dirname, "..") : path.resolve(__dirname, "../..");
export const PROJECT_ROOT = CLI_ROOT;
```

- **From source** (`src/cli/consts.ts`): `__dirname` is `<repo>/src/cli`, two levels up is `<repo>`.
- **From the build**: the constant is bundled into a flat `dist/chunk-*.js`, so `__dirname` is
  `<pkg>/dist`, one level up is `<pkg>`.

Both land on the package root, so `PROJECT_ROOT/src/agents/_templates/` — priority 3 in the template
root resolution order documented in [features/agent-system.md](./features/agent-system.md) — resolves
to the `src/agents/` tree that `files` publishes. **The `dist/src/agents/` copy is therefore a hedge,
not a requirement:** it is the fallback for the case where `CLI_ROOT` resolves to `<pkg>/dist`
instead of `<pkg>`, which happens the moment `consts.ts` is inlined into a nested entry rather than
split into a flat chunk. The hedge is cheap in code and costs 115 duplicated files and ~0.60 MB in
every published tarball (§6). Delete it only alongside a check that the constant is still reached
through a root-level chunk.

### `config/` does not exist in this repository

`ls config/` returns `ENOENT`, and `files` in `package.json` does not name it either. This matters
because two reference docs cite `config/`-prefixed paths without saying whose repository they belong
to:

| Doc                                       | Cites                                                 |
| ----------------------------------------- | ----------------------------------------------------- |
| `reference/features/skills-and-matrix.md` | `config/skill-categories.ts`, `config/skill-rules.ts` |
| `reference/boundary-map.md`               | `config/stacks.ts`, `config/skill-categories.ts`      |

**Those are SOURCE-REPO paths, not paths in this repository.** `SKILL_CATEGORIES_PATH`,
`SKILL_RULES_PATH` and `STACKS_FILE_PATH` in `src/cli/consts.ts` are relative strings joined against
a _marketplace / skills-source_ checkout — `src/cli/lib/source-validator.ts` joins them onto the
resolved source path. The CLI's own defaults are `src/cli/lib/configuration/default-categories.ts`,
`src/cli/lib/configuration/default-rules.ts` and `src/cli/lib/configuration/default-stacks.ts`. An
agent that goes looking for `config/stacks.ts` in this repo will not find it and must not create it.

---

## 6. Publish surface

### `files`

Verified with `npm pack --dry-run --ignore-scripts --json`.
**This doc owns these figures**, and they move with the working tree — re-run the command rather than
quoting them. The `--ignore-scripts` is load-bearing: `prepare` runs husky, which sets
`core.hooksPath`.

| Entry          | Files | Unpacked                                                          | Contents                                                                            |
| -------------- | ----- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `dist/`        | 321   | 5.67 MB                                                           | 103 code files, 103 sourcemaps, plus the 115-file `dist/src/agents/` copy           |
| `assets/`      | 3     | 2.48 MB                                                           | `demo.gif`, `demo.tape`, `logo.svg`                                                 |
| `src/agents/`  | 115   | 0.60 MB                                                           | Agent partials and `_templates/` Liquid sources                                     |
| `src/schemas/` | 12    | 0.04 MB                                                           | Generated JSON Schemas                                                              |
| root files     | 4     | 0.12 MB                                                           | `LICENSE`, `README.md`, `CHANGELOG.md`, and `package.json` (npm always includes it) |
| **Total**      | 455   | 8,906,835 B (8.91 MB) unpacked / 3,713,566 B (3.71 MB) compressed |                                                                                     |

Two things the tarball carries that nobody chose deliberately, and one that was fixed:

- **Sourcemaps are the single largest code group** — 103 files, 3.35 MB unpacked, roughly twice the
  1.73 MB of code they map. `sourcemap: true` is a debugging convenience with a publication cost.
- **`src/agents/` is published twice** — once directly, once inside `dist/src/agents/` (§5).
- **No compiled test file ships.** The entry negations in §2 keep sixteen of them out and
  `packaging.test.ts` pins their absence.

`bin/run.js` and `bin/dev.js` are **not published** — `bin/` is absent from `files`. They are
development entry points only (`@oclif/core`'s `execute({ dir: import.meta.url })`, the second with
`development: true` under `npx tsx`). The published `bin` _field_ is unrelated and points at
`dist/index.js`.

### `exports`, `main`, `bin`

| Key                  | Value                                                     |
| -------------------- | --------------------------------------------------------- |
| `main`               | `dist/index.js`                                           |
| `exports."."`        | `{ "import": "./dist/index.js" }`                         |
| `exports."./config"` | `{ "import": "./dist/config-exports.js" }`                |
| `bin`                | `agents-inc` **and** `agentsinc`, both -> `dist/index.js` |
| `types`              | **absent**, at every level (§7)                           |

The `bin` rationale (why two names) is owned by
[architecture-overview.md](./architecture-overview.md) -> Project Identity. Do not restate it here.

`"sideEffects": false` is declared, and `dist/index.js` is not side-effect free — it calls
`run()` at module scope. The claim is a bundler hint that Node's ESM loader ignores, so `npx
agents-inc` and a global install are unaffected. A consumer bundling this package with a
`sideEffects`-honouring bundler could legally elide `import "agents-inc"` and get nothing.

---

## 7. The library API — `agents-inc/config`

`src/cli/config-exports.ts` is seven `export` statements naming **nine** symbols — four values and
five types — and nothing else:

| Export              | Kind  | From                                              |
| ------------------- | ----- | ------------------------------------------------- |
| `defineConfig`      | value | `src/cli/lib/configuration/define-config.ts`      |
| `defaultCategories` | value | `src/cli/lib/configuration/default-categories.ts` |
| `defaultRules`      | value | `src/cli/lib/configuration/default-rules.ts`      |
| `defaultStacks`     | value | `src/cli/lib/configuration/default-stacks.ts`     |
| `ProjectConfig`     | type  | `src/cli/types`                                   |
| `Stack`             | type  | `src/cli/types`                                   |
| `StackAgentConfig`  | type  | `src/cli/types`                                   |
| `CategoryMap`       | type  | `src/cli/types`                                   |
| `SkillRulesConfig`  | type  | `src/cli/types`                                   |

**This file is the ONLY supported import surface for a consumer `.claude-src/config.ts`.** It is a
boundary, not a convenience barrel: `exports` declares exactly two subpaths, so every other module
under `dist/` is unreachable to a consumer by specifier. Widening the boundary means adding a line
here — deliberately, and with the two gaps below in mind.

### Gap 1 — the surface ships no type declarations

`dts: false` means the package contains **zero `.d.ts` files** and declares no `types` condition. A
consumer writing `import { defineConfig } from "agents-inc/config"` in a type-checked project
gets an untyped module.

This is tolerable because it is not how types actually reach users. Generated configs never import
the package at all — `generateConfigSource` in `src/cli/lib/configuration/config-writer.ts` emits
`import type { ProjectConfig } from "./config-types";`, pointing at the locally generated sibling
that carries the narrowed unions, and a config-writer unit test asserts the generated source does
**not** contain `agents-inc/config`. Enabling `dts` would produce declarations for the whole
bundle, not just this file. It is worth knowing which of those two facts you are relying on before
changing either.

### Gap 2 — the built loader cannot resolve the path `exports` advertises

`src/cli/lib/configuration/config-loader.ts` aliases the public specifier onto a source file when it
constructs its jiti instance:

```ts
const CONFIG_EXPORTS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../config-exports.ts",
);
// ... createJiti(import.meta.url, {
//       alias: { "agents-inc/config": CONFIG_EXPORTS_PATH },
//     })
```

The relative walk is correct **for the source tree**: from
`src/cli/lib/configuration/`, `../../config-exports.ts` is `src/cli/config-exports.ts`. After
bundling, that module lives in a flat `dist/chunk-*.js` (§4), so `import.meta.url`'s directory is
`<pkg>/dist` and the same walk lands **two levels above the package** — for an npm install, at
`node_modules/config-exports.ts`, which does not exist.

jiti does not fall back to normal resolution when an alias target is missing; probed directly against
this repo's jiti, an alias pointing at a non-existent file throws
`Error: Cannot find module '<target>'`, which `loadConfig` rewraps as
`Failed to load config from '<configPath>'`. So under the built CLI, any hand-written
`.claude-src/config.ts` that imports `agents-inc/config` fails to load.

Nothing in the generated-config path is affected (see Gap 1), which is why this has stayed invisible.
`src/cli/lib/__tests__/helpers/config-io.ts` carries the same alias with a `../../../` walk correct
for its own depth, and being test-only it is never bundled, so the test suite exercises the working
arithmetic exclusively. The fix shape is the one `consts.ts` already uses — resolve against a
build-aware root rather than a source-relative offset.

---

## 8. The `oclif` block

| Key                 | Value                                 | Behaviour it produces                                                                                                      |
| ------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `bin`               | `agents-inc`                          | The name printed in help output and error messages                                                                         |
| `dirname`           | `agents-inc`                          | Derives `config.cacheDir` = `~/.cache/agents-inc` and `configDir` / `dataDir` siblings                                     |
| `commands.strategy` | `pattern`                             | Command IDs come from the file layout under `target`; no manifest file is generated or read                                |
| `commands.target`   | `./dist/commands`                     | **Discovery reads the BUILD, never `src/`** — see below                                                                    |
| `hooks.init`        | `["./dist/hooks/init"]`               | Runs before every command; the module's default export is the hook. Documented in [commands/index.md](./commands/index.md) |
| `topicSeparator`    | `" "`                                 | Subcommands are invoked space-separated: `agents-inc build marketplace`, not `build:marketplace`                           |
| `plugins`           | 4 entries, all runtime `dependencies` | See the plugin table below                                                                                                 |

### Discovery reads `dist/`, and says nothing when it is empty

Verified by loading `@oclif/core`'s `Config` against this repo: the root plugin's `commandsDir` is
`<repo>/dist/commands`, and `commandIDs` lists every built command. Loading the **same
`package.json`** from a directory with no `dist/` yields `commandIDs: []` — **zero commands, no error,
exit 0.**

Three things follow:

1. **Adding `src/cli/commands/<name>.ts` adds no command until `npm run build` runs.** The source
   file is not consulted by anything at runtime.
2. **This is true in unit tests too.** `src/cli/lib/__tests__/helpers/cli-runner.ts` calls
   `run(args, { root: CLI_ROOT })` with `CLI_ROOT` = the repo root, so oclif reads the same
   `package.json` and the same `./dist/commands`. Command-level unit tests exercise built output.
3. **`agentsinc:dev` (`bun src/cli/index.ts`) is not a source-only path either.** `src/cli/index.ts`
   passes `import.meta.url` to `run()`; oclif walks up from there to the repo `package.json` and
   resolves `commandsDir` to `dist/commands` — probed directly. Only the entry module comes from
   source.

`topicSeparator: " "` is why the internal IDs (`build:marketplace`, `import:skill`, `new:agent`,
`new:marketplace`, `new:skill`) are typed by users with a space. Both forms appear in the codebase —
IDs in oclif-facing code, spaced form in user-facing strings — and they are not interchangeable.

### Plugins

All four are `dependencies`, not `devDependencies`, because they load at runtime.

| Plugin                                   | Contributes                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@oclif/plugin-help`                     | The `help` command and `--help` rendering                                                                                                                                             |
| `@oclif/plugin-autocomplete`             | `autocomplete`, `autocomplete create`, `autocomplete script`                                                                                                                          |
| `@oclif/plugin-not-found`                | "did you mean" suggestions for an unknown command                                                                                                                                     |
| `@oclif/plugin-warn-if-update-available` | Version-staleness warning. Writes `version` and `last-warning` into `config.cacheDir`. No `warn-if-update-available` block is configured, so its defaults apply (`timeoutInDays: 60`) |

**`~/.cache/agents-inc` is written by two independent derivations.** oclif's `cacheDir` comes from
`oclif.dirname`; the CLI's own `cacheRoot()` in `src/cli/consts.ts` answers
`path.join(os.homedir(), ".cache", DEFAULT_PLUGIN_NAME)` and backs the fetched-source cache in
`src/cli/lib/loading/source-fetcher.ts`. They coincide by matching strings, not by construction —
renaming `oclif.dirname` moves oclif's half only.

### Default exports

Commands and the init hook use `export default`, against the repo's named-exports-only convention.
The exception is recorded in `CLAUDE.md` -> Code Conventions, and the full measurement (including
that `strategy: "pattern"` has an undocumented named-export fallback that should not be relied on) is
in `agent-findings/2026-07-30-no-default-exports-rule-collides-with-oclif.md`. Do not re-derive it.

---

## 9. Test surface

**One spec asserts on the package: `src/cli/lib/__tests__/packaging.test.ts`.** It pins three things
and no more:

| Assertion (spec name)                                                                                                                     | Guards                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| _compiles no test files into dist_ — no `*.test.js`, `*.test.js.map` or `*.test.d.ts` under `dist/`                                       | The three entry negations in §2 — deleting one ships compiled specs again                                                             |
| _mirrors src/agents into dist instead of merging into it_ — the entry set under `dist/src/agents/` **equals** the set under `src/agents/` | The `fs.remove` before the `onSuccess` copy (§5). Set equality, not subset — a subset assertion passes on precisely this failure mode |
| _names only paths that exist in the files field_                                                                                          | A `files` entry renamed or removed in source and left behind in the manifest                                                          |

It is wrapped in `describe.skipIf(!existsSync(DIST_DIR))`, which is deliberate rather than lax:
`packages/cli/turbo.json` declares `test` -> `dependsOn: ["build"]`, so in any turbo-driven run
`dist/` exists and the specs execute. A bare `vitest run` on a never-built tree is the only path to
the skip, and failing there would report a missing build as a packaging defect.

**Nothing else about the build is tested.** No spec reads `tsup.config.ts`, verifies a specific entry
landed in `dist/`, or packs the tarball. Every other claim in this document was derived by running
the tools, and re-validating it means running them again — the commands are named inline in each
section.

What also exists is _coupling_ to the build, in two places:

| Layer                     | Coupling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit (`commands` project) | `cli-runner.ts` -> `run(args, { root: CLI_ROOT })` resolves commands from `dist/commands` (§8). Three things supply or police `dist/` here, and none is redundant: `packages/cli/turbo.json`'s `test` -> `dependsOn: ["build"]` (without it, 205 tests across 17 files failed with exit 127 on a clean checkout), a `pretest` hook mirroring `pretest:e2e` for `bun run test`/`npm test`, and `vitest.config.ts`'s `globalSetup` -> `vitest.global-setup.ts` -> `assertDistIsFresh` in `src/cli/lib/testing/dist-staleness.ts` (the hook is a three-line caller; the logic sits under `src/` so `tsc` and `eslint` reach it — CLI-460), which refuses any run — `npx vitest run <file>` included — whose `dist/` predates a tree compiled into it (`packages/cli/src` **or** `packages/matrix/src`, which tsup inlines — see §2). The guard exists because the first two are both bypassable and the failure they miss is a **false green**: see clean-code-standards 6.19 |
| E2E                       | `pretest:e2e` runs `bun run build`; specs spawn `node <repo>/bin/run.js`, whose `execute({ dir })` resolves the same `dist/commands`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

`dist/` is not a test-discovery hazard, for two independent reasons: the `unit` project's include
patterns are rooted at `src/**` and `scripts/**`, and since the §2 negations `dist/` contains no
`.test.js` file to collect in the first place.

> **`ensureBinaryExists()` in `e2e/helpers/test-utils.ts` cannot fail.** It checks that `BIN_RUN`
> (`<repo>/bin/run.js`) exists and, if not, raises `"Run 'npm run build' before running E2E tests."`
> But `bin/run.js` is a committed source file that tsup never writes — tsup's only output directory
> is `dist/` — so the probe is true whether or not a build has ever run, while the message claims to
> be about the build. The condition that would actually catch a missing build is the presence of
> `dist/commands`; without it, oclif finds zero commands and the specs fail on output assertions
> instead. This is findings **Pattern V** (the artefact that looks like verification and cannot fail).

---

## 10. Traps

1. **`config/` does not exist in this repository.** `config/`-prefixed paths in other reference docs
   are _source-repo_ paths (§5).
2. **A new command is invisible until `npm run build`.** Discovery reads `dist/commands`, and an
   empty discovery is silent (§8).
3. **A new non-code asset is invisible to the build entirely.** The entry globs match `.ts`/`.tsx`
   only. A template, schema or `.md` partial needs an explicit `onSuccess` copy **and** a `files`
   entry, and neither is derived from the other (§2 rule 6, §5, §6).
4. **`src/cli/hooks/` is an entry directory; `src/cli/components/hooks/` is not.** The similar name
   is the whole trap (§2 rule 3).
5. **Co-located tests are kept out of `dist/` by three entry negations and nothing else.** They are
   not excluded by the positive globs, by `files`, or by any tsup default — remove a negation and
   compiled specs ship again. `packaging.test.ts` is the alarm
   (§2 rule 4, §6, §9).
6. **Source-relative path arithmetic breaks after bundling unless it is build-aware.** `consts.ts`
   compensates with its `isInDist` branch; `config-loader.ts` does not, and its jiti alias resolves
   outside the installed package (§7 Gap 2).
7. **`agents-inc/config` ships no type declarations** despite being the advertised library
   surface (§7 Gap 1).
8. **Overriding `--out-dir` splits the build in half.** `onSuccess` hard-codes the literal `"dist"`
   while the bundle honours the flag (§3).
9. **The runtime floor is declared three times — `tsup` `target` and two `engines.node` fields — and
   nothing checks that they agree.** They agree today, by hand, and drifted once already. Change all
   three together. `tsconfig`'s `target` is a different question and stays out of it; CI's
   `NODE_VERSION` is a fourth place the same number lives (§3).
10. **`@workspace/matrix` must stay a `devDependency`.** Promoting it to `dependencies` externalises
    the import tsup currently inlines, and the published CLI's `init --from` fails at import time
    with every local gate green (§3).
11. **`prepublishOnly` stops at its first failing step, and `format:check` is that first step.** A
    formatting regression alone blocks lint, typecheck, build and test from ever running, so it
    hides every other failure behind it. It covers markdown, so an unformatted `.ai-docs/` file
    blocks a publish exactly as a source file would (§1).

---

## Related documentation

| Topic                                                         | Doc                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Binary naming rationale, technology stack, directory tree     | [architecture-overview.md](./architecture-overview.md)           |
| The init hook's two responsibilities; per-command flag tables | [commands/index.md](./commands/index.md)                         |
| Template root resolution order (where `src/agents/` is read)  | [features/agent-system.md](./features/agent-system.md)           |
| Config loading, `defineConfig`, generated `config-types.ts`   | [features/configuration.md](./features/configuration.md)         |
| Config rendering and the config-gate write path               | [config/config-writer.md](./config/config-writer.md)             |
| The generators, their outputs and the checks that guard them  | [features/code-generation.md](./features/code-generation.md)     |
| The bundled `@workspace/matrix/seed` contract                 | [features/seed-contract.md](./features/seed-contract.md)         |
| E2E harness, `TerminalSession`, spawn model                   | [testing/e2e-infrastructure.md](./testing/e2e-infrastructure.md) |
