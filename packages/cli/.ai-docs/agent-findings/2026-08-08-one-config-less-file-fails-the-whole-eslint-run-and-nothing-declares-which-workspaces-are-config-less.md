---
type: standard-gap
severity: medium
affected_files:
  - package.json
  - packages/vitest-config/package.json
  - packages/cli/.ai-docs/reference/monorepo-layout.md
standards_docs:
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-08
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  CLI-436(b). Proposed Standard 1 landed, narrowed on purpose: the check now requires
  `//no-shared-eslint-config` from a config-less workspace that HOLDS TypeScript and still skips one
  that does not. The narrowing is the whole decision — three of the four `*-config` packages carry
  no `.ts` file at all, so ESLint can never be handed one from them and asking them to declare
  anything would be the noise the `no-config` exit exists to avoid; `packages/vitest-config` is the
  one that can poison a staged invocation, and it is now the one that must say so. It declares the
  key, quoting this finding's mechanism and naming the script that reads it. Shown red by deleting
  the key and watching `deps:check` fail on that workspace and no other.
  `monorepo-layout.md` -> "The fourth check…" gained the rule, the convention table's
  `//no-shared-eslint-config` row moved off "nothing yet", and the root `//deps:check` comment now
  POINTS at that subsection rather than restating it — restating is how the two drifted in the
  first place. Proposed Standard 2's general rule (re-derive a tool's failure modes when moving it
  from whole-directory to file-list form) is unwritten and is now the residual, recorded in
  CLI-436's own finding rather than holding this one open.
---

## What Was Wrong

Two things, and the second is only visible because the first exists.

**ESLint fails a whole invocation when it cannot resolve a config for ONE of the files it was
given.** Not that file's entry — the run. Measured on ESLint 10.8.0 from the repository root:

| Command                                                                  | Result                                                     |
| ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `eslint packages/cli/src/cli/consts.ts`                                  | exit 0                                                     |
| `eslint packages/vitest-config/node.d.ts`                                | exit 2, "couldn't find an eslint.config file"              |
| `eslint packages/cli/src/cli/consts.ts packages/vitest-config/node.d.ts` | exit 2 — the first file is not linted, nothing is reported |

This matters now and did not before. Until 2026-08-08 nothing passed a file list to ESLint: every
workspace's `lint` script is a bare `eslint`/`eslint .` run from inside a directory that holds a
config. REPO-36 put `eslint --fix` into `lint-staged`, which hands ESLint whatever the commit
staged, and a staged set is not confined to a workspace.

**Nothing declares which workspaces have no `eslint.config`.** The repository has exactly one
tracked `.ts` file with no config in any ancestor directory — `packages/vitest-config/node.d.ts`,
found by walking all 760 `.ts`/`.tsx` files outside `node_modules`, `dist` and the gitignored
Skill Olympics corpus. That absence is deliberate: the package ships `node.js` as plain JavaScript
with `node.d.ts` written by hand beside it, so there is nothing there to lint. But the deliberate
part is recorded nowhere a tool can read. `packages/vitest-config/package.json` carries a
`//no-shared-tsconfig` note explaining the tsconfig case in the same terms; the parallel
`//no-shared-eslint-config` key exists in `check-shared-eslint-config.ts` and
`monorepo-layout.md` describes it, but no workspace sets it — the check does not judge a workspace
with no config, so nothing forced the declaration. The consequence: the `lint-staged` pattern that
routes around this workspace names it as a literal, and there is no source of truth for a reviewer
or a future workspace to check it against.

## Fix Applied

Code side, all within REPO-36's scope:

- The root `lint-staged` block is three patterns instead of one. The first,
  `{apps,packages}/!(vitest-config)/**/*.{ts,tsx}`, gets `eslint --fix --no-warn-ignored` then
  `prettier --write`; the second, `packages/vitest-config/**/*.{ts,tsx}`, gets formatting only; the
  third keeps the non-TypeScript formatting. The three were verified pairwise disjoint against the
  real tree and their union matches the 1596 files the single previous pattern matched — disjoint
  because `lint-staged` runs different patterns concurrently, so two patterns writing one file is a
  race, not a sequence.
- `//lint-staged` in the root `package.json`, the ESLint paragraph in `.husky/pre-commit` and the
  hook section of `monorepo-layout.md` all now record the mechanic and why the workspace is named.

Not fixed, and deliberately left: `packages/vitest-config/package.json` does not declare
`//no-shared-eslint-config`. That file was outside this task's scope.

## Proposed Standard

1. **A workspace with no `eslint.config.*` must say so in its own `package.json`, under
   `//no-shared-eslint-config`, the same way `packages/vitest-config` already explains its missing
   tsconfig under `//no-shared-tsconfig`.** `monorepo-layout.md` -> "The fourth check asks the same
   question of every ESLint config" says the key is "recognised and unused", and the sentence above
   it says why: "a workspace with no config there lints nothing and is not judged". Declaring is
   therefore optional, so nobody declares, so the set is invisible. That was harmless while nothing
   depended on the set. A glob in the root `package.json` depends on it now, so the check should
   require the key from a config-less workspace rather than skip it — one condition in
   `scripts/check-shared-eslint-config.ts`, and a row in the table under "A workspace that stands
   apart records it in its own `package.json`", which today reads "nothing yet".
2. **A tool handed a file list behaves differently from the same tool run over a directory, and the
   difference belongs in the note beside the file list.** ESLint's config resolution, its ignore
   handling and its all-or-nothing failure on one unresolvable file are all invisible from
   `eslint .` and all reachable from `eslint <staged files>`. `monorepo-layout.md` -> "The commit and
   push hooks" now records all three for this case. The general rule — when moving a check from
   whole-directory to file-list form, re-derive its failure modes rather than assume they carried
   over — has no home yet, and belongs beside "After changing a dependency, ask the binary its
   version — do not trust the manifest", which makes the same argument about versions.
