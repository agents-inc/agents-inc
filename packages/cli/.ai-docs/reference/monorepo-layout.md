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
  ]
related:
  - reference/architecture-overview.md
  - reference/build-and-packaging.md
  - reference/features/seed-contract.md
  - reference/testing/harness-decisions.md
last_validated: 2026-08-04
---

<!-- VALIDATED 2026-08-04 · FULL — new file. Every claim derived this session from the
     repository root's package.json, turbo.json, .gitignore, .syncpackrc.cjs,
     .husky/pre-commit, .github/workflows/ci.yml, apps/www/astro.config.ts,
     packages/cli/.prettierignore, packages/cli/prettier.config.mjs,
     packages/cli/src/cli/consts.ts and packages/cli/e2e/helpers/test-utils.ts. -->

# Monorepo Layout

**Last Updated:** 2026-08-04
**Last Validated:** 2026-08-04

> **Path convention — this document only.** Every path here is relative to the **repository root**,
> not to `packages/cli`. Elsewhere in `reference/` a bare `src/cli/…` means
> `packages/cli/src/cli/…`; in this file the package prefix is always written out. This is the one
> doc whose subject is the repository around the CLI rather than the CLI itself.

## Why this doc exists

`packages/cli` was the whole repository until 2026-08-03, when a separate web monorepo was merged
into it and the CLI became one workspace inside. Every other doc in `reference/` describes code
inside `packages/cli`. This one describes the surrounding repository, and only the parts of it that
a change inside `packages/cli` can break or be broken by.

## Workspaces

`package.json` -> `workspaces` is `["apps/*", "packages/*"]`. Bun is the only package manager; there
is exactly one lockfile, `bun.lock`, at the root.

| Workspace                    | Package name        | Owns                                                                    |
| ---------------------------- | ------------------- | ----------------------------------------------------------------------- |
| `packages/cli`               | `@agents-inc/cli`   | The CLI. The only published workspace                                   |
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
`packages/cli`'s own `format` / `format:check` run from inside the package, which no longer holds a
`.gitignore`, so `CLAUDE.md`, `V2.md` and `todo/*` stopped counting as ignored there — and
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

## Dependency versions

`.syncpackrc.cjs` keeps shared dependency versions in step across workspaces, with one declared
exception for `@agents-inc/cli`.

> **The repository deliberately runs two majors of several tools, and three workarounds exist only
> to hold that split together. This is scaffolding with a scheduled end, not architecture — it is
> tracked as an outstanding task and is deliberately not explained here.** Do not treat any of the
> three as a design decision, and do not build on them. `.syncpackrc.cjs` carries the exception's
> own label.

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
