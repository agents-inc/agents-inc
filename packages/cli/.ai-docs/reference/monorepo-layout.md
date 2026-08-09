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
    pre-push,
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

| Workspace                    | Package name                   | Owns                                                                        |
| ---------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `packages/cli`               | `agents-inc`                   | The CLI. The only published workspace                                       |
| `packages/matrix`            | `@workspace/matrix`            | The browser-safe skill catalog the web app reads, plus the seed wire schema |
| `packages/ui`                | `@workspace/ui`                | The design system: tokens and primitives                                    |
| `packages/api-mocks`         | `@workspace/api-mocks`         | The msw handlers and fixtures the web side tests against                    |
| `packages/eslint-config`     | `@workspace/eslint-config`     | Shared flat configs                                                         |
| `packages/prettier-config`   | `@workspace/prettier-config`   | The single Prettier config, declared once in the root `package.json`        |
| `packages/typescript-config` | `@workspace/typescript-config` | Shared tsconfigs                                                            |
| `packages/vitest-config`     | `@workspace/vitest-config`     | Shared Vitest presets                                                       |
| `apps/editor`                | `editor`                       | The web configurator                                                        |
| `apps/www`                   | `www`                          | Astro landing page + Starlight docs site                                    |
| `apps/server`                | `server`                       | The Cloudflare API worker behind `init --from`, and the skills index        |

**`@workspace/api-mocks` ships three entry points on purpose**, each for a consumer that must not
pay for the others: `.` (`src/index.ts`), `./fixtures` (`src/fixtures.ts`, deliberately free of any
msw import so the Playwright runner — which keeps its own interception and wants only the payloads —
never loads an interceptor it will not use) and `./node` (`src/node.ts`, the one place `msw/node` is
named, which keeps the environment choice out of every other file). Its `package.json` carries that
argument in its own `//exports` field.

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
`.prettierignore` invisible, and the generated trees it exists to protect
(`packages/matrix/src/vendor/`, `packages/matrix/src/generated/`) get reformatted, which then reads
as drift against their generator. The root `format` script carries this in its own `"//"` comment.

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

### `vitest.config.mjs` at the root exists to throw

The root config's whole body is a `throw`. It is not a stub waiting to be filled in: **there is no
correct root Vitest run**, and the file exists so that asking for one fails loudly instead of
quietly doing something else.

With no config there at all, `npx vitest run` from the root fell back to Vitest's own defaults and
collected 360 files across four workspaces with none of the setup each workspace declares — 327 of
them `packages/cli`'s, run without `vitest.setup.ts`, which is the file that replaces
`os.homedir()` with a temp directory. The suite passed while reading the developer's real
`~/.claude`, and it swept in all 184 PTY-driven e2e specs, which have a config of their own.

Delegating (`projects: ["packages/*", "apps/*"]`) was tried and measured before the throw was
chosen. It does preserve each workspace's `setupFiles`, but **Vitest cannot nest projects**, so
`packages/cli`'s own three — `unit`, `integration`, `commands`, with the includes and the retry that
separate them — are discarded with no warning, and the run collected 328 CLI files against turbo's 144. The file carries the numbers and the reasoning.

Nothing below the root is affected: Vitest resolves its config from the directory it runs in and
never walks up, so `turbo test` never loads this file.

## The commit and push hooks

Two hooks since 2026-08-07, and which check sits in which is the design. `.husky/pre-commit` is
narrow and fast; `.husky/pre-push` is the whole of whichever side moved. Everything in the second
one used to run in the first.

### `.husky/pre-commit`

| Stage                | Runs                                                                  | Scope                                                              |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `bunx lint-staged`   | `eslint --fix` then `prettier --write`                                | Staged files, from the git root                                    |
| `bun run deps:check` | syncpack, shared-tsconfig, shared-vitest-config, shared-eslint-config | Every workspace, whenever a manifest or a shared-tool config moved |
| `bunx turbo run …`   | `lint`, `typecheck`, `test`                                           | Changed packages **and their dependents**                          |

The last stage is `bunx turbo run lint typecheck test --filter='...[HEAD]'`. No `test:e2e`: it is
the slowest thing either side owns and it belongs to the push.

**`typecheck` joined that line on 2026-08-08.** Two reference docs had been claiming for months
that TypeScript is checked on every commit while no hook had ever run it, and the ruling was to
make the claim true rather than to correct it. The argument order in `turbo run` is not the
execution order — turbo builds its graph from `turbo.json`'s `dependsOn`, and `lint`, `typecheck`
and `test` are independent of each other, each carrying `^build`. The CLI's `typecheck` is three
`tsc` programs, and the middle one is `tsconfig.scripts.json`, which is what finally puts
`scripts/` under a commit-time gate.

**ESLint runs in both stages since 2026-08-08, and that is the design rather than a duplication.**
It had been excluded from `lint-staged` for a mechanical reason: `lint-staged` runs its commands
from the git root, ESLint **9** resolved a flat config from the working directory and its
ancestors, and this repository has no root `eslint.config`, so the entry failed on every commit
staging a `.ts` file. **ESLint 10 resolves the config from the directory of the file being
linted**, which killed that argument — `eslint packages/cli/src/cli/base-command.ts` run from the
repository root exits 0 having loaded `packages/cli/eslint.config.js`, `projectService` carve-out
and all. That file is the verification rather than a sample: it carries an `eslint-disable` for
`no-unnecessary-condition` and `packages/cli` sets `reportUnusedDisableDirectives` to `error`, so a
per-file run in which the type-aware rules had not really loaded would have failed on the directive
instead of exiting 0. There is still no root fallback: `eslint vitest.config.mjs` at the root exits
2, because nothing above it holds a config.

**What keeps ESLint on the turbo line as well is a rule inventory.** Twenty-four of the rules
enabled in all seven workspaces are type-aware — typescript-eslint's `recommendedTypeChecked`, plus
`no-unnecessary-condition` from the shared base — and a type-aware verdict reads a whole TypeScript
program, so a change in a staged file can produce a report in a file the commit does not touch and
no staged-file run can see it. Nothing else in the seven configs needs more than the file it is
handed: the config-gate import bans are `no-restricted-imports`, which matches the literal
specifier string and never resolves a module; the task-ID and dynamic-import bans are
`no-restricted-syntax` selectors; the sixteen `react-hooks` rules and `react-refresh` are
single-module analyses; and there is no import-cycle plugin anywhere in the repository. So
`lint-staged` is the fast half — a violation in a file you staged fails there in ~4s rather than
~19s here, and the fixable ones are fixed and re-staged before turbo sees them — and the turbo line
is the complete one, which turbo also caches.

**Three `lint-staged` patterns, not one.** `lint-staged` runs different patterns concurrently, so
two of them writing the same file would race; the three are disjoint by construction and together
match exactly what the single `*.{ts,tsx,js,json,yaml,yml,md}` pattern matched before.
`packages/vitest-config` is named in two of them because it holds the repository's one tracked
`.ts` file with no `eslint.config` above it, by design rather than omission — it ships `node.js` as
plain JavaScript with `node.d.ts` written by hand beside it. One config-less file fails the whole
invocation rather than its own entry, so that declaration file gets formatting only. Prettier
covers everything for the inverse reason to ESLint's: it does **not** want per-workspace working
directories.

**What `[HEAD]` compares against, because a hook is the one place it matters.** Turbo reads a
one-ended range as "since this ref, including work not yet committed", and asks git three things:
`diff-tree` from `HEAD` to `HEAD`, which is empty; `ls-files --others --modified`, the untracked and
the unstaged; and `git diff --name-only --cached`, which is the staged set the commit is made of. So
the commit's own contents are always in the selection, along with anything else left dirty in the
tree — a superset, never a subset. Read out of turbo 2.10.8,
`crates/turborepo-scm/src/git.rs`; the published documentation does not say, and every documented
example uses `[HEAD^1]` instead.

**Paths belonging to no workspace select everything.** Root `package.json`, `turbo.json`,
`bun.lock`, `.husky/`, `.github/`, docs — turbo maps any path outside a package to "all packages
changed", deliberately and without consulting `globalDependencies`. The root-tooling clause the old
hook spelled out by hand is now turbo's, and wider than it was.

### `.husky/pre-push`

Everything that used to run at commit time, unchanged: `deps:check` when a manifest or a
shared-tool config moved, then
`lint test test:e2e` for a whole **side** — `--filter=agents-inc` for the CLI,
`--filter='!agents-inc'` for the web. The side is decided by grepping
`git diff --name-only --no-renames '@{push}..HEAD'`: `packages/cli/` or `packages/matrix/` sets the
CLI side, any other path under `apps/` or `packages/` sets the web side, root tooling sets both.
When `@{push}` does not resolve — the first push of a new branch, a detached HEAD — there is no
range to narrow by and both sides run.

**This tier is coarse on purpose, and that is what lets the other one be narrow.** Scoping by side
cannot miss a dependent, because it never tries to work out what the dependents are.

> The changed-package filter was tried at commit time once before and was **wrong on its own**: a
> commit to `packages/matrix` selected `matrix` and `apps/editor` but **not** `apps/server`, which
> depends on `matrix` too, so a change that broke the worker committed clean. The hook carried a
> "please do not narrow it again" note for months afterwards. What retired that note is not a repair
> to the filter but this second hook: a dependent the commit-time filter misses now costs an amended
> commit, because nothing reaches the remote until the side-scoped suites have passed.

**`run_deps` is a third flag, not a third condition on the two above.** The cross-workspace checks
read every `package.json`, every `tsconfig.json`, every `vitest.config.*` and every
`eslint.config.*`, so its grep is not anchored to a side or to the root the way the others are — a
change touching only the web side can still make the CLI's tsconfig the odd one out.
`bun run deps:check` measures at 0.2s, so there is nothing to scope more finely. Both hooks gate it
on the same grep, against their own file list.

Three details of those file lists that look like oversights:

- **No `--diff-filter`.** A change that only _deletes_ a CLI file still has to run the CLI suite.
- **`--no-renames`.** A rename is split into its old and its new path, so a file moved from one side
  to the other wakes both.
- **Every `grep` sits inside an `if`.** Husky runs the hooks under `sh -e`; a bare `grep` that
  matched nothing would fail the commit or the push on its own.

Consequence for anyone pushing: a change touching both sides runs both full suites. That is several
minutes. `--no-verify` skips whichever hook you are bypassing, and at commit time it also skips the
per-file ESLint and formatting pass that gates publishing.

## CI

`.github/workflows/ci.yml` is the only workflow. Three jobs: `check-cli`, `check-web`, `deploy`.

Two workflows were **deleted rather than moved** during the merge — one in each former repository —
whose only job was to tell the other repository that the catalog had changed. They are one
repository now, so the mechanism has nothing left to do. In their place `check-web` checks
`packages/matrix`'s generated surface and fails if it drifted: a check, not a cross-repo pull
request.

**The catalog check runs from `packages/cli`, and writes nothing.** The step is
`bun run generate:matrix:check` with `working-directory: packages/cli` — `packages/cli` owns the
writer, because every input is the CLI's own types, agent metadata and default stacks. It compares
the emitted bytes against the committed files **in memory**, so it needs neither a regenerate step
nor a `git diff` afterwards, and **it reports a file it emits that is not committed at all** — which
a diff, seeing only tracked paths, could not. Replacing it with a regenerate-then-diff pair
reintroduces that blind spot.

`generate:types` is deliberately absent from CI: it reads a sibling `skills` checkout no runner has.
`.ai-docs/reference/features/code-generation.md` carries the generator inventory.

**`check-web` also runs `bun run deps:check`, first, before the catalog check.** All four of its
checks compare workspaces to each other rather than reading one in isolation, which is the only way
this class of defect is visible at all, and all four answer in well under a second. None of them
ran anywhere automatic before 2026-08-07 — `deps:check` was a script you had to remember. It sits in
`check-web` rather than `check-cli` for the same reason the catalog check does: that job runs first
and finishes in minutes, and saying "these two workspaces disagree" is not worth waiting out a
25-minute pseudo-terminal suite for.

**`check-web` installs Chromium before `test`, not before `test:e2e`.** `packages/ui` runs its
Storybook stories under Vitest **browser mode**, so plain `bun run test --filter='!agents-inc'`
needs a browser too. `bunx playwright install --with-deps chromium` therefore sits between the lint
step and `test`, and installs once for both suites. Only chromium is configured, so only chromium is
installed. Moving that step back down to just above `test:e2e` fails the unit run.

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

`.syncpackrc.cjs` keeps shared dependency versions in step across workspaces. It is one of the four
checks behind `bun run deps:check`; the other three are the shared-tsconfig check written up at the
end of this section and its two siblings, which ask the same question of every workspace's
`vitest.config.*` and every workspace's `eslint.config.*`. They live behind one script because they
are the same kind of check — each compares workspaces to each other, and none of them can be seen
by a gate that reads one workspace at a time.

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
React draws into a tree of its own and never shares one with the wizard's. The `search` command is
what uses it; its unit tests and its E2E specs pass against this arrangement.

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

### A workspace that stands apart records it in its own `package.json`

The three checks that follow each end in the same question — does this workspace extend the shared
config for its tool? — and all three take the same answer for "no, deliberately". It is one
convention across three keys, so learn it once:

| Key                         | Read by                         | Who uses it today                |
| --------------------------- | ------------------------------- | -------------------------------- |
| `//no-shared-tsconfig`      | `check-shared-tsconfig.ts`      | all four `*-config` packages     |
| `//no-shared-vitest-config` | `check-shared-vitest-config.ts` | `packages/cli` and `packages/ui` |
| `//no-shared-eslint-config` | `check-shared-eslint-config.ts` | `packages/vitest-config`         |

`bun run deps:check` prints the tally per axis, and the three lines are the fastest way to read
today's shape:

```
✓ 7 workspaces extend @workspace/typescript-config, 4 record why they do not
✓ 3 workspaces extend @workspace/vitest-config, 2 record why they do not, 6 run no vitest
✓ 7 workspaces extend @workspace/eslint-config, 1 record why they do not, 3 hold no eslint config
```

- **It lives in the workspace's own `package.json`**, not in the config it excuses. That is the one
  file every workspace has, including the four that carry no TypeScript and so have no tsconfig to
  write in, and the ones that run no suite and have no Vitest config either. The `//` prefix is the
  comment-key spelling the root `package.json` already uses for its own recorded decisions.
- **The value is the reason. There is no `true`.** The string is the whole point, and the runner
  prints it, so a divergence reads as a decision someone made rather than — which is how every one
  of these checks started life — the absence of one.
- **Every value ends by naming the script that reads it**, so the next person editing a manifest can
  find what enforces the key instead of guessing whether it is load-bearing.
- **The key is read before anything else**, and a workspace carrying one is not judged at all: its
  config is never parsed and its dependency on the shared package is never asked for. Deleting the
  key is what puts a workspace back under the rule.
- **Without it, a standalone workspace fails.** `deps:check` exits non-zero naming the workspace,
  what is wrong with it, and the key it could have used to say so on purpose.

### Every workspace extends the shared tsconfig, or records why it does not

The second of `deps:check`'s four checks, run from
`packages/cli/scripts/run-check-shared-tsconfig.ts`. It walks the `workspaces` globs in the root
`package.json` and asserts, for each one, that its `tsconfig.json` reaches a
`@workspace/typescript-config/*` config and that its `package.json` declares that package.

**Why a check exists at all:** `packages/cli/tsconfig.json` extended nothing until 2026-08-06. It
restated `target`, `module`, `strict` and the rest inline and set no `lib`, so `target: ES2022`
implied `lib.es2022.full` and a Node CLI type-checked with `window`, `document`, `name`, `status`
and `open` in scope. Every gate the package runs — `tsc --noEmit` three times, `eslint .`, both
suites, `tsup`, `turbo typecheck` — was green throughout, because each of them reads whatever the
config happens to say. **A config that has stopped agreeing with its siblings is invisible to any
tool whose only input is that config.**

Three shapes it has to resolve, all of them present here: an `extends` **array**
(`apps/www` puts Astro's preset on top of the shared base), a **relative** base
(`packages/cli/tsconfig.scripts.json` inherits through `./tsconfig.json`), and a **solution-style**
config with `references` and no `extends` at all (`apps/editor`, whose three referenced projects
are the files that actually compile). It reads with TypeScript's own parser, because every tsconfig
here carries `//` comments and `JSON.parse` cannot read one.

Its opt-out key is `//no-shared-tsconfig`, under the convention one subsection up. All four
`*-config` packages use it: `eslint-config`, `prettier-config` and `vitest-config` ship plain
JavaScript, and `typescript-config` is the configs themselves.

**Deleting the config is not an exit here.** A workspace with no `tsconfig.json` and no opt-out key
is `diverged`, not excused — `MISSING_TSCONFIG` — so on this axis the absence of a config is itself
the failure, and the only way out of the rule is to say so in the manifest. Its two siblings below
do NOT work that way, and the difference is worth holding on to: a check that treats "no config" as
"nothing to judge" can be left by deletion, and a check that treats it as a defect cannot.

### The third check asks the same question of every Vitest config

`packages/cli/scripts/run-check-shared-vitest-config.ts`, added 2026-08-07. Same walk, same two
assertions, against the `vitest.config.*` at each workspace's root: it must reach
`@workspace/vitest-config` and the `package.json` must declare that package. A workspace with no
config there runs no suite and is not judged, and a nested config — `packages/cli/e2e/vitest.config.ts`
— is a project inside a workspace's own suite rather than that workspace's answer. Its opt-out key
is `//no-shared-vitest-config`; `packages/cli` and `packages/ui` are the two that use it.

**Binding costs a workspace nothing in its own tsconfig.** It used to cost `allowJs: true`:
`@workspace/vitest-config` shipped `node.js` as plain JavaScript with no declaration, so importing
it failed the importing workspace's `tsc --noEmit` on TS7016 — a message that names neither Vitest
nor the reason the shared config is JavaScript. Three workspaces set the flag, each with its own
five-line comment explaining the same mechanism. The package ships `node.d.ts` beside `node.js` as
of 2026-08-08 and all three are gone. **Do not delete that declaration file as redundant** — it is
load-bearing for every consumer's typecheck, and it is written not to rot: it types the export as
Vitest's own `ViteUserConfig` rather than restating the object's shape, so editing `node.js` never
touches it.

`apps/server` is what prompted it: a standalone config restating the shared one's include,
`globals: false` and `clearMocks: true` by hand, with nothing anywhere recording whether that was a
decision. It merges the shared config now, and its Workers pool tolerates the `environment: "node"`
that arrives with it — the pool accepts exactly that value or none, and supplies the runtime itself.

**`no-suite` is an EXIT as well as an exemption, and only a name pin notices.** Deleting
`apps/server/vitest.config.ts` moves that workspace from `bound` to `no-suite`, which passes — the
suite would stay green with a workspace's tests no longer sharing any settings with its siblings,
because it would have no settings at all. The repository-level "nothing is diverged" test cannot see
this; nothing derives which workspaces are supposed to run a suite. What guards it is the two
membership lists in `scripts/check-shared-vitest-config.test.ts` — one naming the three bound
workspaces, one naming the six that legitimately run none. Adding or removing a suite means editing
that file, which is where the decision gets read rather than assumed.

### The fourth check asks the same question of every ESLint config

`packages/cli/scripts/run-check-shared-eslint-config.ts`, added 2026-08-08. Same walk, same two
assertions, against the `eslint.config.*` at each workspace's root: it must reach
`@workspace/eslint-config` and the `package.json` must declare that package. Its opt-out key is
`//no-shared-eslint-config`, and `packages/vitest-config` is the one workspace that uses it.

**A workspace with no config is not judged — unless it holds TypeScript.** Three of the four
`*-config` packages carry no `.ts` file at all, so ESLint could never be handed one from them and
asking them to declare anything would be noise. `packages/vitest-config` is the exception, and its
missing config is load-bearing rather than incidental: it ships `node.js` as plain JavaScript with
`node.d.ts` hand-written beside it, which is the repository's only tracked `.ts` file with no
`eslint.config` above it. **ESLint fails a whole invocation when it cannot resolve a config for ONE
of the files it was handed** — `eslint <any linted file> packages/vitest-config/node.d.ts` exits 2
for both, not just for the one — so the root `package.json`'s `lint-staged` block names that
directory as a literal to keep the declaration file out of the ESLint pattern. A literal glob needs
something to be checked against, so since 2026-08-08 the check requires the key from a config-less
workspace that holds TypeScript and skips one that does not (`UNDECLARED_CONFIG_LESS`). Add a
workspace of that shape and `deps:check` fails until it says why.

**`no-config` is otherwise an exit as well as an exemption**, the same way its Vitest sibling's
`no-suite` is: a workspace that deletes its `eslint.config.js` and holds no TypeScript leaves the
rule silently. The membership lists in `scripts/check-shared-eslint-config.test.ts` — one naming
every bound workspace, one naming the three genuinely unjudged — are what notice.

`packages/cli` is what prompted it, and its symptom is the quietest of the four. The config
composed `js.configs.recommended` and `tseslint.configs.recommendedTypeChecked` itself instead of
extending the shared base. The two overlap almost completely, so the only visible consequence was a
rule the shared base adds **beyond** the recommended set — `no-unnecessary-condition` — which this
one package therefore never had. **`eslint .` was clean throughout, in both configs, because a rule
that is not enabled reports nothing.** A debt comment in the file compounded it by describing the
rule as "off here", which is a claim about inheritance from a config this file did not extend; it
had been wrong since it was written.

The check is import-**parsed**, not text-matched, for the same reason its Vitest sibling is: several
configs here name the shared package in a comment, and `packages/cli`'s named it in the comment
explaining a rule it did **not** inherit. A text match would have read that as compliance.

Extending rather than restating did not change a single rule's severity anywhere — the effective
config for all sixteen file classes in `packages/cli`, compared with `eslint --print-config` before
and after, is identical but for one option the shared base carries and the hand-written set did
not (`ignoreRestSiblings` on `no-unused-vars`, which loosens). What changed is that the next
addition to the shared base arrives on its own.

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
