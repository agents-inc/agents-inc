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
  - reference/testing/e2e-infrastructure.md
last_validated: 2026-08-02
---

<!-- VALIDATED 2026-08-02 · FULL — new doc. Every claim derived this session from
     tsup.config.ts, package.json, src/cli/index.ts, src/cli/config-exports.ts,
     src/cli/consts.ts, src/cli/lib/configuration/config-loader.ts, the built dist/
     tree, an @oclif/core Config.load probe, a jiti alias probe, and
     `npm pack --dry-run --ignore-scripts --json` against the working tree at 0.147.1. -->

# Build, Packaging and Distribution

**Last Updated:** 2026-08-02
**Last Validated:** 2026-08-02

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

**This doc is the natural home for one live inconsistency and two verified traps.** All three are
stated below as facts, not warnings: `config/` is copied by the build and listed for publication but
does not exist; command discovery reads `dist/`, so a source-only change adds no command; and the
built `config-loader` cannot resolve the very import path `exports./config` advertises.

---

## 1. Scripts

| Script           | Command                                              | Notes                                                                                     |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `build`          | `tsup`                                               | The only writer of `dist/`                                                                |
| `dev`            | `tsup --watch`                                       | Same entry contract, incremental                                                          |
| `agentsinc`      | `node dist/index.js`                                 | Runs the built CLI                                                                        |
| `agentsinc:dev`  | `bun src/cli/index.ts`                               | Runs from source. Commands still resolve through `dist/` — see §8                         |
| `typecheck`      | `tsc --noEmit`                                       | `tsconfig.json` declares `outDir: "dist"`, but nothing ever runs `tsc` without `--noEmit` |
| `pretest:e2e`    | `npm run build`                                      | npm lifecycle hook — `npm run test:e2e` always rebuilds first                             |
| `prepublishOnly` | `format:check && lint && typecheck && build && test` | The whole publish gate. Runs in that order and stops at the first failure                 |

There is **no CI publish workflow.** `.github/workflows/` holds exactly one file, `ci.yml`, and none
of its three jobs touches npm: `check-cli` runs this package's typecheck, lint, unit and E2E suites,
`check-web` does the same for the rest of the monorepo (and fails if `packages/matrix`'s vendored
catalog is stale), and `deploy` ships the web app to Cloudflare. Publication is a manual
`npm publish`, and `prepublishOnly` is the only gate between the working tree and the registry.

> **`prepublishOnly`'s first step now passes.** `prettier --check .` exits `0` over the whole
> package, verified 2026-08-03 by running `bun run format:check` ("All matched files use Prettier
> code style!"). The single offender this document previously recorded,
> `src/cli/lib/seed/fetch-seed.ts`, was reformatted by a `bun run format` pass over the package
> during the monorepo move; `.ai-docs/**/*.md` is clean as well. **The "Known Tooling Gaps" section
> of `DOCUMENTATION_MAP.md` is now stale in the opposite direction.** Its prettier entry was already
> corrected in place on 2026-08-02 to stop naming `.ai-docs/**/*.md` as the blocker — so the "prettier
> fails on pre-existing `.ai-docs` markdown" note this blockquote used to retire is gone — but the
> replacement text still asserts that `prettier --check .` fails and still names `fetch-seed.ts` as
> the sole remaining offender. Both halves of that assertion are now false, and correcting them
> belongs to that file, not this one.

---

## 2. The entry contract

`tsup.config.ts` -> `entry` is **six globs**. Every file they match becomes its own output file under
`dist/`, mirroring its path below `src/cli/`.

| Glob                             | Matches                                     | Output                   |
| -------------------------------- | ------------------------------------------- | ------------------------ |
| `src/cli/index.ts`               | The oclif entry point                       | `dist/index.js`          |
| `src/cli/config-exports.ts`      | The library export surface (§7)             | `dist/config-exports.js` |
| `src/cli/commands/**/*.{ts,tsx}` | Every oclif command, at any nesting depth   | `dist/commands/**`       |
| `src/cli/hooks/**/*.ts`          | Every oclif lifecycle hook                  | `dist/hooks/**`          |
| `src/cli/components/**/*.tsx`    | Ink components **only** — `.tsx`, not `.ts` | `dist/components/**`     |
| `src/cli/stores/**/*.ts`         | Zustand stores                              | `dist/stores/**`         |

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
4. **Co-located test files are matched and shipped.** Nothing in the entry contract excludes
   `*.test.ts` / `*.test.tsx`, so every co-located test under `components/` and `stores/` is compiled
   into `dist/` and published. `commands/` and `hooks/` are unaffected only because their tests live
   elsewhere (`src/cli/lib/__tests__/commands/`), not because the glob excludes them. See §6 for what
   this costs in the tarball.
5. **`.gitkeep` is not matched** — `src/cli/commands/.gitkeep`, `src/cli/stores/.gitkeep`,
   `src/cli/components/common/.gitkeep` and `src/cli/components/wizard/.gitkeep` produce nothing.
6. **Non-code assets are never carried by the entry contract.** A Liquid template, a JSON schema or a
   `.md` partial added under `src/` is invisible to `entry`. It reaches the package only through
   `onSuccess` (§5) or `files` (§6), and both are hand-maintained lists.

---

## 3. Build options

| Option      | Value                 | What it buys                                                                                                                                                                          |
| ----------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`    | `["esm"]`             | Single format. Matches `"type": "module"`; there is no CJS build and no dual-package hazard                                                                                           |
| `platform`  | `node`                | Node built-ins stay external; `fs`, `path`, `os` are not polyfilled                                                                                                                   |
| `target`    | `node18`              | Downlevels syntax newer than Node 18. Must move together with `engines.node` (`>=18.0.0`) and `tsconfig.json`'s `target: "ES2022"` — three independent declarations of the same floor |
| `clean`     | `true`                | `dist/` is wiped before every build, so a deleted command's artefact disappears on the next build rather than lingering and staying discoverable                                      |
| `sourcemap` | `true`                | One `.js.map` per emitted `.js`. These are published (§6) and are the single largest group in the tarball                                                                             |
| `shims`     | `true`                | Injects tsup's `esm_shims` module so bundled code may reference the CJS globals `__dirname` / `__filename`. Inert in the current build — see below                                    |
| `dts`       | `false`               | **No `.d.ts` is emitted anywhere.** See §7 for why that is tolerable and where it is not                                                                                              |
| `outDir`    | `dist`                | Hard-coded; `onSuccess` also hard-codes the literal string `"dist"`, so overriding `--out-dir` on the CLI would split the two halves apart                                            |
| `banner.js` | `#!/usr/bin/env node` | See below                                                                                                                                                                             |

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
`load-agent-defs`, `source-loader`, `source-manager`) each surface as
`dist/<module-name>-<HASH>.js`. They are output files with stable-looking names and are **not**
addressable entry points — nothing may import them by path.

---

## 5. `onSuccess` — the two asset copies

`tsup.config.ts` -> `onSuccess` performs two `fs.copy` calls, each guarded by `fs.pathExists`:

| Source        | Destination        | Reason recorded in the config                                              | Status today          |
| ------------- | ------------------ | -------------------------------------------------------------------------- | --------------------- |
| `config/`     | `dist/config/`     | _"so it's available regardless of how PROJECT_ROOT resolves at runtime"_   | **No-op — see below** |
| `src/agents/` | `dist/src/agents/` | _"so eject command can find them regardless of how PROJECT_ROOT resolves"_ | Copies 145 files      |

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
split into a flat chunk. The hedge is cheap in code and costs 145 duplicated files and ~0.66 MB in
every published tarball (§6). Delete it only alongside a check that the constant is still reached
through a root-level chunk.

### `config/` does not exist in this repository

`ls config/` returns `ENOENT`. The `pathExists` guard means the first copy is a **silent no-op**, and
`npm pack` confirms the `"config/"` entry in `files` contributes **zero files** to the tarball.

This matters beyond the dead code, because two reference docs cite `config/`-prefixed paths without
saying whose repository they belong to:

| Doc                                       | Cites                                                 |
| ----------------------------------------- | ----------------------------------------------------- |
| `reference/features/skills-and-matrix.md` | `config/skill-categories.ts`, `config/skill-rules.ts` |
| `reference/boundary-map.md`               | `config/stacks.ts`, `config/skill-categories.ts`      |

**Those are SOURCE-REPO paths, not paths in this repository.** `SKILL_CATEGORIES_PATH`,
`SKILL_RULES_PATH` and `STACKS_FILE_PATH` in `src/cli/consts.ts` are relative strings joined against
a _marketplace / skills-source_ checkout — `src/cli/lib/source-validator.ts` joins them onto the
resolved source path, and `src/cli/commands/new/marketplace.ts` scaffolds them into a newly created
marketplace. The CLI's own defaults are `src/cli/lib/configuration/default-categories.ts`,
`src/cli/lib/configuration/default-rules.ts` and `src/cli/lib/configuration/default-stacks.ts`. An
agent that goes looking for `config/stacks.ts` in this repo will not find it and must not create it.

---

## 6. Publish surface

### `files`

Verified with `npm pack --dry-run --ignore-scripts --json`. **This doc owns these figures.**

| Entry          | Files | Unpacked                                                           | Contents                                                                            |
| -------------- | ----- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `dist/`        | 405   | 7.35 MB                                                            | 130 code files, 130 sourcemaps, plus the 145-file `dist/src/agents/` copy           |
| `assets/`      | 3     | 2.37 MB                                                            | `demo.gif` (2.32 MB), `demo.tape`, `logo.svg`                                       |
| `config/`      | **0** | —                                                                  | Directory absent (§5)                                                               |
| `src/agents/`  | 145   | 0.66 MB                                                            | Agent partials and `_templates/` Liquid sources                                     |
| `src/schemas/` | 12    | 0.04 MB                                                            | Generated JSON Schemas                                                              |
| root files     | 4     | 0.10 MB                                                            | `LICENSE`, `README.md`, `CHANGELOG.md`, and `package.json` (npm always includes it) |
| **Total**      | 569   | 11,013,954 B (10.5 MB) unpacked / 4,110,296 B (3.92 MB) compressed |                                                                                     |

Three things the tarball carries that nobody chose deliberately:

- **Sourcemaps are the single largest group** — 130 files, 4.44 MB unpacked, more than the code they
  map. `sourcemap: true` is a debugging convenience with a publication cost.
- **16 compiled test files ship** (`components/**/*.test.js`, `stores/**/*.test.js`), 0.94 MB with
  their maps. This is entry-contract rule 4 in §2, realised.
- **`src/agents/` is published twice** — once directly, once inside `dist/src/agents/` (§5).

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
//       alias: {
//         "agents-inc/config": CONFIG_EXPORTS_PATH,
//         "@agents-inc/cli/config": CONFIG_EXPORTS_PATH, // pre-0.150.0 spelling, REPO-24
//       },
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
`.claude-src/config.ts` that imports `agents-inc/config` fails to load — under either spelling, since
both alias keys resolve to the same missing path.

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
`oclif.dirname`; the CLI's own `CACHE_DIR` in `src/cli/consts.ts` is
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

**There is no test that asserts anything about the build or the package.** No spec reads
`tsup.config.ts`, checks `files`, verifies an entry exists in `dist/`, or packs the tarball. Every
claim in this document was derived by running the tools, and re-validating it means running them
again — the commands are named inline in each section.

What does exist is _coupling_ to the build, in two places:

| Layer                     | Coupling                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Unit (`commands` project) | `cli-runner.ts` -> `run(args, { root: CLI_ROOT })` resolves commands from `dist/commands` (§8). No `pretest` hook builds first       |
| E2E                       | `pretest:e2e` runs `npm run build`; specs spawn `node <repo>/bin/run.js`, whose `execute({ dir })` resolves the same `dist/commands` |

`dist/` is not a test-discovery hazard: the `unit` project's include patterns are rooted at `src/**`
and `scripts/**`, so the 16 compiled `.test.js` files in `dist/` are never collected.

> **`ensureBinaryExists()` in `e2e/helpers/test-utils.ts` cannot fail.** It checks that `BIN_RUN`
> (`<repo>/bin/run.js`) exists and, if not, raises `"Run 'npm run build' before running E2E tests."`
> But `bin/run.js` is a committed source file that tsup never writes — tsup's only output directory
> is `dist/` — so the probe is true whether or not a build has ever run, while the message claims to
> be about the build. The condition that would actually catch a missing build is the presence of
> `dist/commands`; without it, oclif finds zero commands and the specs fail on output assertions
> instead. This is findings **Pattern V** (the artefact that looks like verification and cannot fail).

---

## 10. Traps

1. **`config/` is copied by `onSuccess` and listed in `files`, and does not exist.** Both are no-ops.
   `config/`-prefixed paths in other reference docs are _source-repo_ paths (§5).
2. **A new command is invisible until `npm run build`.** Discovery reads `dist/commands`, and an
   empty discovery is silent (§8).
3. **A new non-code asset is invisible to the build entirely.** The entry globs match `.ts`/`.tsx`
   only. A template, schema or `.md` partial needs an explicit `onSuccess` copy **and** a `files`
   entry, and neither is derived from the other (§2 rule 6, §5, §6).
4. **`src/cli/hooks/` is an entry directory; `src/cli/components/hooks/` is not.** The similar name
   is the whole trap (§2 rule 3).
5. **Co-located tests under `components/` and `stores/` are compiled and published** (§2 rule 4, §6).
6. **Source-relative path arithmetic breaks after bundling unless it is build-aware.** `consts.ts`
   compensates with its `isInDist` branch; `config-loader.ts` does not, and its jiti alias resolves
   outside the installed package (§7 Gap 2).
7. **`agents-inc/config` ships no type declarations** despite being the advertised library
   surface (§7 Gap 1).
8. **Overriding `--out-dir` splits the build in half.** `onSuccess` hard-codes the literal `"dist"`
   while the bundle honours the flag (§3).
9. **`prepublishOnly` stops at its first failing step, and `format:check` is that first step.** A
   formatting regression alone blocks lint, typecheck, build and test from ever running, so it hides
   every other failure behind it. The gate is clean today — `prettier --check .` exits `0` (§1).

---

## Related documentation

| Topic                                                         | Doc                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Binary naming rationale, technology stack, directory tree     | [architecture-overview.md](./architecture-overview.md)           |
| The init hook's two responsibilities; per-command flag tables | [commands/index.md](./commands/index.md)                         |
| Template root resolution order (where `src/agents/` is read)  | [features/agent-system.md](./features/agent-system.md)           |
| Config loading, `defineConfig`, generated `config-types.ts`   | [features/configuration.md](./features/configuration.md)         |
| Config rendering and the config-gate write path               | [config/config-writer.md](./config/config-writer.md)             |
| E2E harness, `TerminalSession`, spawn model                   | [testing/e2e-infrastructure.md](./testing/e2e-infrastructure.md) |
