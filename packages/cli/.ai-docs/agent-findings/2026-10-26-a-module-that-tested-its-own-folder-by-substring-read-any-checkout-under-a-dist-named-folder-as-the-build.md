---
type: anti-pattern
severity: low
affected_files:
  - src/cli/consts.ts
  - src/cli/consts.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-26
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: missing-rule
status: resolved
resolved_by: >-
  CLI-930. `isInDist` in `src/cli/consts.ts` now asks whether the folder the module sits in is
  named `dist` (`path.basename(__dirname) === BUILD_DIR`). Pinned by the "the package root the CLI
  reads its own files from" describe in `src/cli/consts.test.ts`.
---

## What Was Wrong

`consts.ts` decided whether it ran from the build with `__dirname.includes("/dist")`, which is a
question about the whole absolute path. Any folder above the checkout whose name starts with `dist`
(`~/dist/cli`, `~/distributions/cli`) matched, so a source run under one (vitest, tsx) set
`PROJECT_ROOT` to `src/` rather than the package. Code reading its own files from there, such as
the agent partials, failed. The tester measured it: two specs red (`2 failed | 16 passed (18)`) and
`PROJECT_ROOT` = `<checkout>/src` through a dist-named symlink with `node --preserve-symlinks`.

Inference, not tested: on Windows `"/dist"` never matches a backslash path, so the built CLI would
place its root two levels up there.

## Fix Applied

The check now looks at one path segment, the folder the module sits in: the build bundles this
module into a chunk directly in `dist/`, and source keeps it in `src/cli/`. The hand-run bundle
`e2e/helpers/handrun.gen.mjs` sits in `e2e/helpers/`, which is not `dist`, so its root stays two
levels up.

Census for the same shape, read in full:
`grep -rnE --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' "\.(includes|startsWith|endsWith|indexOf)\(['\"\`][/\\\\][a-zA-Z_.-]+[/\\\\]?['\"\`]\)" src scripts e2e ../compile/src ../matrix/src ../api/src ../../apps/server/src ../../apps/editor/src`.
Besides `consts.ts`, it found two `file.includes("/**tests**/")`checks, in`config-types-background-data-has-one-constructor.test.ts`and`config-types-producers-name-one-loader.test.ts`. Both match paths relative to the package root (each
`readSource`joins them onto`PACKAGE_ROOT`), so no parent folder reaches them. Left alone. The other
hits were `endsWith("\n")`and`indexOf("\n")`, not path checks.

## Proposed Standard

Add to `clean-code-standards.md`: test where a file sits by path segment (`path.basename`, or
`path.relative` split on `path.sep`), never by substring of an absolute path. A substring also
matches a parent folder the code does not control, and it hard-codes one separator. A substring is
fine only against a path already made relative to a root the code owns. No existing rule covers
this. It does not conflict with CLAUDE.md's ban on `path.basename(dir)` as a skill id, which is
about identity rather than location.
