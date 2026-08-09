---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/eslint.config.js
  - packages/cli/scripts/tsconfig.json
  - package.json
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-09
reporting_agent: main-session
category: tooling
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  packages/cli/scripts/tsconfig.json — a two-line extends of tsconfig.scripts.json — makes
  scripts/ a project the service DISCOVERS, which no runtime can mis-match, and the
  allowDefaultProject carve-out plus its file-count fuse were deleted from eslint.config.js the
  same hour. tsconfig.scripts.json keeps its name and both typecheck callers.
---

# allowDefaultProject matching is runtime-dependent, and only lint-staged runs eslint under node

## What happened

The first gated commit of the 2026-08-09 round failed in lint-staged: all nine staged
`packages/cli/scripts/*.ts` files errored with `Parsing error: <file> was not found by the
project service` — a message naming no rule. Reproducing the exact invocation (same cwd, same
`--fix --no-warn-ignored`, same 11-file list, same absolute paths) by hand PASSED.

## Measurement

The one variable left was the runtime. Same command, same tree:

- `bunx eslint <files>` (bun runs the eslint entry) — exit 0
- `node node_modules/.bin/eslint <files>` (node v23.10.0) — exit 1, every scripts/ file
  "not found by the project service"

`allowDefaultProject: ["scripts/*.ts"]` (with `tsconfigRootDir` set correctly beside it)
matches under bun and fails to match under node. Every gate in this repository that runs
eslint — `turbo lint` at pre-commit and pre-push, `eslint .` by hand — goes through bun,
because turbo spawns scripts with the declared package manager. Exactly one caller spawns
eslint under node: lint-staged, whose execa uses the `#!/usr/bin/env node` shebang of
`node_modules/.bin/eslint`. So the carve-out was green on every path except the first command
of every gated commit.

## Why it matters

A lint verdict that depends on which runtime spawned the linter is not a verdict. The
carve-out also carried a second known trap (recorded in the config comment it replaced): the
default-project file cap fails the WHOLE run, not the file, on the Nth script — the same
"names no rule" failure shape from a different limit.

## The rule

Prefer a DISCOVERED project over `allowDefaultProject` wherever the directory has a stable
membership: a tsconfig.json the service finds by walking up has no glob to mis-match and no
file cap to trip. Reserve `allowDefaultProject` for genuinely homeless single files, and treat
any "was not found by the project service" error on a file that plainly has a tsconfig as an
invocation-environment defect, not a config typo.
