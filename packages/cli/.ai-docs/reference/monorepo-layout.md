---
scope: reference
area: architecture
keywords:
  [
    monorepo,
    workspaces,
    turbo,
    bun,
    husky,
    pre-commit,
    lint-staged,
    prettier,
    prettierignore,
    gitignore,
    syncpack,
    LICENSE,
    README,
    SCHEMA_BASE_URL,
    astro,
    starlight,
    apps-www,
    apps-editor,
    apps-server,
    packages-matrix,
    packages-ui,
    CLI_ROOT,
    MONOREPO_ROOT,
    ci.yml,
    check-cli,
    check-web,
    react,
    ink,
    peer-dependency,
    node_modules-root,
    hoisting,
    two-react-copies,
    oclif-table,
    node-floor,
    bun-install,
    version-unification,
  ]
related:
  - reference/architecture-overview.md
  - reference/build-and-packaging.md
  - reference/features/seed-contract.md
  - reference/testing/harness-decisions.md
last_validated: 2026-08-04
---

# Monorepo Layout

> **Path convention — this document only.** Every path here is relative to the **repository root**,
> not to `packages/cli`. Elsewhere in `reference/` a bare `src/cli/…` means
> `packages/cli/src/cli/…`; in this file the package prefix is always written out. This is the one
> doc whose subject is the repository around the CLI rather than the CLI itself.

## Why this doc exists

`packages/cli` is one workspace inside a repository that also holds a web half. Every other doc in
`reference/` describes code inside `packages/cli`. This one describes the surrounding repository, and only the parts of it that
a change inside `packages/cli` can break or be broken by.

## Workspaces

`package.json` -> `workspaces` is `["apps/*", "packages/*"]`. Bun is the only package manager; there
is exactly one lockfile, `bun.lock`, at the root.

| Workspace                    | Package name        | Owns                                                                    |
| ---------------------------- | ------------------- | ----------------------------------------------------------------------- |
| `packages/cli`               | `agents-inc`        | The CLI. The only published workspace                                   |
| `packages/matrix`            | `@workspace/matrix` | The vendored skill catalog the web app reads, plus the seed wire schema |
| `packages/ui`                | `@workspace/ui`     | The design system: tokens and primitives                                |
| `packages/eslint-config`     | —                   | Shared flat configs                                                     |
| `packages/prettier-config`   | —                   | The single Prettier config, declared once in the root `package.json`    |
| `packages/typescript-config` | —                   | Shared tsconfigs                                                        |
| `packages/vitest-config`     | —                   | Shared Vitest presets                                                   |
| `apps/editor`                | —                   | The web configurator                                                    |
| `apps/www`                   | `www`               | Astro landing page + Starlight docs site                                |
| `apps/server`                | —                   | The Cloudflare API worker behind `init --from`                          |

**The CLI is in `packages/`, not `apps/`, because it is published.** That is the whole of the
reason; nothing else follows from it.

## Decisions a later change would otherwise undo

Each of these looks like an accident from inside one file and is deliberate from outside it. Where
the reasoning is already written into the source file itself, this section states the **invariant**
and names the file that carries the argument — it does not restate the argument.

### `LICENSE` exists twice, on purpose

`LICENSE` at the root is what GitHub reads. `packages/cli/LICENSE` is what npm ships, because the
package's `files` list names it and npm only packs from the package directory. Deduplicating either
copy removes the licence from one of the two surfaces. Licences are meant to be copied.

### `README.md` exists twice, and the CLI's links are absolute

npm renders the README that sits next to `package.json`, so the product README travels with the
package as `packages/cli/README.md`; the root README describes the repository. The CLI README's
documentation links are **absolute `github.com` URLs, not relative paths** — the docs now live two
levels above the package, and a relative link that climbs out of the package does not resolve on the
npm package page. Converting them back to relative paths breaks the npm page silently.

### The CLI keeps its own Prettier configuration

The root `package.json` declares `"prettier": "@workspace/prettier-config"` for the whole repository.
`packages/cli/prettier.config.mjs` sits nearer to the CLI's files, and Prettier resolves the
**nearest** config walking up from each file — so it wins for everything under `packages/cli`
without any exclusion being written anywhere. The CLI formats at `printWidth: 100` with semicolons
and double quotes; the web side does not. Deleting the CLI's config reformats the entire package.

The root `package.json` carries the argument in its `"//"` field.

### `format` runs once from the root, never through turbo

Prettier resolves `.prettierignore` from its **working directory only** — it does not walk up the
way it does for the config. Fanning `format` out per workspace therefore makes the root
`.prettierignore` invisible, and the vendored catalog it exists to protect gets reformatted, which
then reads as drift against its generator. The root `format` script carries this in its own `"//"`
comment.

### `packages/cli/.prettierignore` restates three rules that also live in `.gitignore`

Same mechanism, opposite direction. Prettier reads a `.gitignore` only from its working directory.
`packages/cli`'s own `format` / `format:check` run from inside the package, which holds no
`.gitignore`, so `CLAUDE.md`, `V2.md` and `todo/*` do not count as ignored there — and
`format:check` is the first step of `prepublishOnly`. The three rules are restated locally so
`prettier --check .` agrees with git from either directory. The file carries the reason inline.

### Three tracked files are named as `.gitignore` negations

`.gitignore` matches `CLAUDE.md` and `V2.md` unanchored, and one test fixture path. All three were
tracked from before those rules existed, which git honours indefinitely — until the file moves. The
move into `packages/cli` broke that grandfathering, so the commit would have recorded a deletion and
never added the replacement. The fixture is read from disk by a test, so a fresh clone would have
failed on CI while passing locally.

```
!packages/cli/CLAUDE.md
!packages/cli/V2.md
!packages/cli/src/cli/lib/__tests__/fixtures/stacks/default/CLAUDE.md
```

The negations are exact paths, so every **other** `CLAUDE.md` in the repository stays ignored.
Removing them re-arms the deletion.

### `apps/www` has no React integration, deliberately

The Astro site depends on `@workspace/ui` for its **tokens** — plain CSS custom properties — and on
nothing React. `apps/www/astro.config.ts` opens with an explicit
`NO REACT INTEGRATION, DELIBERATELY. Please do not "fix" this by adding @astrojs/react.` and gives
both reasons: the tokens need no React, and taking no React dependency means the workspace inherits
none of the repository's React-version question. Adding `@astrojs/react` is one dependency and one
integration away, but it moves that question into a third workspace.

The same file also records why the `docs/` segment is repeated in every Starlight slug
(`src/content/docs/docs/…`), which reads as a typo and is Starlight's documented way to mount a
collection at a subpath.

## The commit hook

`.husky/pre-commit`. Two stages, and the split between them is load-bearing.

| Stage              | Runs                       | Scope                              |
| ------------------ | -------------------------- | ---------------------------------- |
| `bunx lint-staged` | Prettier only              | Staged files, from the git root    |
| `bunx turbo run …` | `lint`, `test`, `test:e2e` | A whole **side** of the repository |

**ESLint is not in `lint-staged`.** `lint-staged` runs its commands from the git root, and ESLint 9
flat config is resolved from the working directory and its ancestors — never from beside the file
being linted. Every workspace keeps its own `eslint.config.js` one level down, so no root config and
no root binary can lint them all. Turbo gives each workspace its own ESLint, run in its own
directory. Prettier stays in `lint-staged` for exactly the inverse reason: it does **not** want
per-workspace working directories.

**The suites are scoped by side, not by changed package, and this must not be narrowed.** The hook
sets `run_cli` when anything under `packages/cli/` is staged, `run_web` when anything under `apps/`
or `packages/` outside `packages/cli/` is staged, and both when root tooling moves.

> The narrower version — turbo's `--filter='...[HEAD]'` changed-package filter — was tried and was
> **wrong**: a commit to `packages/matrix` selected `matrix` and `apps/editor` but **not**
> `apps/server`, which depends on `matrix` too, so a change that broke the worker committed clean.
> Scoping by side cannot miss a dependent because it never tries to work out what the dependents
> are. The hook says so in its own comment and asks not to be narrowed again.

Three details of the staged-file list that look like oversights:

- **No `--diff-filter`.** A commit that only _deletes_ a CLI file still has to run the CLI suite.
- **`--no-renames`.** A rename is split into its old and its new path, so a file moved from one side
  to the other wakes both.
- **Every `grep` sits inside an `if`.** Husky runs the hook under `sh -e`; a bare `grep` that
  matched nothing would fail the commit on its own.

Consequence for anyone committing: a change touching both sides runs both full suites. That is
several minutes, and `--no-verify` also skips the formatting pass that gates publishing.

## CI

`.github/workflows/ci.yml` is the only workflow. Three jobs: `check-cli`, `check-web`, `deploy`.

Two workflows were **deleted rather than moved** during the merge — one in each former repository —
whose only job was to tell the other repository that the catalog had changed. They are one
repository now, so the mechanism has nothing left to do. In their place `check-web` regenerates the
vendored catalog and fails if it drifted: a check, not a cross-repo pull request.

**The catalog check is two checks, and the second one is the interesting one.** After
`bun run generate`, the job runs `git ls-files --others --exclude-standard packages/matrix` **before**
`git diff --exit-code -- packages/matrix`. A diff cannot see a file that did not exist before, so if
the generator ever starts emitting a new file the diff stays empty while the committed catalog is
incomplete. Removing the untracked-file check restores that blind spot.

**Node is pinned, not inherited.** `env.NODE_VERSION: 22` and an `actions/setup-node` step in all
three jobs. Installing bun and nothing else leaves a run on whatever Node `ubuntu-latest` ships that
week, and that Node is not incidental: the CLI's E2E harness launches
the CLI with `pty.spawn("node", …)`, so the runner's Node is the runtime that executes the thing
under test. Pinning it means CI tests the floor `packages/cli/package.json` declares.

**Every job carries `timeout-minutes`**, because GitHub's default is six hours and this repository
has already burned seventy minutes of runner time on one hang.

| Job         | Timeout | Measured (three green runs,) |
| ----------- | ------- | ---------------------------- |
| `check-web` | 15      | 4–5 minutes                  |
| `check-cli` | 40      | 25–26 minutes                |
| `deploy`    | 10      | ~30 seconds                  |

The numbers are measured and then given headroom. **The point is to bound a hang, not to police
duration** — do not tighten one because a run came in fast.

## Dependency versions

`.syncpackrc.cjs` keeps shared dependency versions in step across workspaces.

### One answer per tool

Every workspace must land on the same major of a shared tool. Running two majors of one tool across
the two halves has bitten twice, and neither failure named anything to do with versions:

| Tool                     | Version | Who moved                            |
| ------------------------ | ------- | ------------------------------------ |
| React (+ `@types/react`) | 19.2.8  | the CLI, up from 18                  |
| Ink                      | 7.1.1   | the CLI, up from 5                   |
| TypeScript               | 6       | the CLI, up from 5.7                 |
| ESLint                   | 10      | the CLI, up from 9                   |
| Vitest                   | 4       | the web half, up from 3              |
| Node floor (`engines`)   | `>=22`  | both — raised because Ink 7 needs it |

Unifying them was **deliberately held back** until the merge had settled, so that if the CLI broke
afterwards the move into the monorepo would be the only thing that could have caused it. Four
workarounds existed solely to hold the split apart and were all deleted on the same day: two
TypeScript `paths` entries that collapsed duplicate copies of React's type definitions, a Vitest
redirect in `apps/server/vitest.config.ts`, and a React pin in the root `package.json` that nothing
imported. Do not reintroduce any of them. The two mechanisms that made them necessary are written
out below, and knowing the mechanism is what stops you needing the workaround.

**`.syncpackrc.cjs` now has zero version groups** — it is `module.exports = {}`, and the two groups
written for the split era went with the split. Every disagreement between any two workspaces is
reported again. **Do not add a group to silence a report; align the versions, taking the newer one.**
The file says so in its own comment, and it also explains why `source` is deliberately omitted:
syncpack then falls back to the `workspaces` globs in the root `package.json`, so there is one
statement of which directories are workspaces rather than two free to drift.

The fix script is `deps:fix` -> **`syncpack fix`**. There is no `fix-mismatches` subcommand in syncpack 15,
whatever older instructions say.

### Whatever sits at the root of `node_modules` serves the whole repository

Bun installs one shared copy of each package at the repository root, and gives a workspace its own
nested copy only when it needs a version the shared one cannot satisfy. Two kinds of package are
then decided **for** you rather than by you:

- **A package declared as a peer dependency never gets a nested copy.** A peer dependency is one the
  package refuses to bring its own copy of — it uses whichever copy its host already has. Ink
  declares React that way, so Ink always renders with the React at the root, whatever the CLI's own
  files resolve to.
- **A tool that loads its own internal pieces from the repository root** gets the root's copy no
  matter which workspace asked for it. Vitest does this.

- **React.** Renaming the CLI's package changed which workspace bun resolved first and moved the
  root React from 18 to 19. Ink took the new root copy while the CLI's own files kept resolving the
  nested 18 — two React instances rendering one tree, and **353 unit tests died on an error about
  React children.**
- **Vitest.** `apps/server` pinned Vitest 3 while the CLI pinned 4 and won the root slot, so the
  worker's Vitest 3 was handed Vitest 4's internals and died on startup — **zero tests ran, and no
  failure was reported.**

### Two copies of React in the tree is not a bug; two copies rendering the same tree is

Opening `node_modules` shows React twice, which reads as the failure above being back. It is not.

| Copy                                           | Version | Why it is there                                                                                                                              |
| ---------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/react`                           | 19.2.8  | The shared copy. Ink 7 and everything the wizard draws use this one                                                                          |
| `node_modules/@oclif/table/node_modules/react` | 18.3.1  | `@oclif/table` declares `react: ^18.3.1` and `ink: 5.0.1` as **hard** dependencies rather than peers, so it always gets its own private pair |

The second copy is safe because `@oclif/table` calls its own `render()` inside `printTable`, so its
React draws into a tree of its own and never shares one with the wizard's. The `search` and `update`
commands are what use it; their unit tests and their E2E specs pass against this arrangement.

**Count trees, not copies.** With the root at React 19, `@oclif/table` must nest its own 18 rather
than borrow the shared copy — that nesting is expected, not drift.

### After changing a dependency, ask the binary its version — do not trust the manifest

`bun install` rewrites `bun.lock` correctly but leaves the already-unpacked old package directories
sitting on disk, along with the `.bin` symlinks pointing at them. It has bitten twice in one day:
manifests reading ESLint 10 and TypeScript 6 while the binaries that ran were ESLint 9 and
TypeScript 5.9, and `apps/editor/node_modules/react` / `packages/ui/node_modules/react` still on
disk after a React 19 install. Delete the stale directories and reinstall.

**Run the tool and read the version it prints.** A bump that silently did nothing looks identical to
one that worked, right up until something behaves like the old version.

### When a tool's failure mode is "nothing ran", compare counts rather than pass or fail

The Vitest problem above produced a green-looking result with zero tests executed. So moving
`apps/server` off its workaround was verified by counting rather than by reading the outcome:
**12 tests before, 12 after.** A suite reporting no failures because it collected no tests is
indistinguishable from a suite that passed.

The same shape has caught this repository elsewhere — see [Two roots, and why E2E needs
both](#two-roots-and-why-e2e-needs-both), where ten E2E tests skipped themselves and the run still
reported green.

## The schema base URL moved with the package

`SCHEMA_BASE_URL` in `packages/cli/src/cli/consts.ts` is
`https://raw.githubusercontent.com/agents-inc/agents-inc/main/packages/cli/src/schemas`. The CLI writes
this address into every metadata file it generates, so it is a **live URL in users' files** — it is
not an internal path and it does not follow a local refactor. It already moved once, when the CLI
went one directory deeper. Renaming the repository moves it again; see the outstanding work.

## Two roots, and why E2E needs both

`packages/cli/e2e/helpers/test-utils.ts` exports two anchors:

| Constant        | Resolves to         | Use for                                                    |
| --------------- | ------------------- | ---------------------------------------------------------- |
| `CLI_ROOT`      | `packages/cli`      | Anything inside the package — `BIN_RUN`, fixtures, sources |
| `MONOREPO_ROOT` | the repository root | Anything resolved against a **sibling checkout**           |

They were the same path until the CLI moved into `packages/cli`. A sibling — the separate `skills`
checkout, which was never part of the merge — resolved off `CLI_ROOT` now lands inside `packages/`
instead. **The failure mode is silence:** the specs that read it decided the directory was missing
and skipped themselves, and ten tests vanished from a run that still reported green. Both constants
carry the rule in their own doc comments.

## Related Documentation

- [`build-and-packaging.md`](./build-and-packaging.md) — the CLI's own build, publish surface and
  `oclif` block; `prepublishOnly`; what `check-cli` runs
- [`architecture-overview.md`](./architecture-overview.md) — everything inside `packages/cli`
- [`features/seed-contract.md`](./features/seed-contract.md) — the wire contract shared with
  `packages/matrix` and served by `apps/server`, and the vendoring rule between the two copies
- [`testing/harness-decisions.md`](./testing/harness-decisions.md) — E2E harness choices, including
  the `CLI_ROOT` / `MONOREPO_ROOT` consequence from a test author's side
