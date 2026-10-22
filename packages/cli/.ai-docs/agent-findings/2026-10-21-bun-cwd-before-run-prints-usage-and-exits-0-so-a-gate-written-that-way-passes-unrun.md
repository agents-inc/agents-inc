---
type: missing-standard
severity: low
affected_files:
  - stryker.config.json
  - docs/architecture.md
standards_docs:
  - docs/architecture.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: infra
root_cause: convention-undocumented
status: open
---

## What Was Wrong

With bun 1.2.6, `bun --cwd <dir> run <script>` does not run the script. It prints the `bun run`
usage text and exits 0. Every other spelling runs it:

```
bun --cwd <repo>/apps/editor run typecheck >/dev/null 2>&1; echo $?   # 0, usage text only
bun --cwd=<repo>/apps/editor run typecheck 2>&1 | head -1               # $ tsc -b --noEmit
bun --cwd <repo>/apps/editor typecheck 2>&1 | head -1                   # $ tsc -b --noEmit
bun run --cwd <repo>/apps/editor typecheck 2>&1 | head -1               # $ tsc -b --noEmit
```

A lane gated the editor's typecheck, lint and test that way and got three exit-0 runs that checked
nothing. The output was the script list, so it read like noise rather than a failure. Only the
missing `$ tsc` / `$ eslint` / `Test Files` lines gave it away.

Census of tracked files:
`git ls-files | grep -v -E '(^|/)node_modules/|\.lock$' | xargs grep -n -E 'bun +--cwd|bun +run +--cwd|bunx? .*--cwd'`
found one hit, `stryker.config.json`'s `buildCommand`. It uses the working `bun run --cwd` form.
No tracked gate uses the broken one, so the trap is only in hand-run gates.

## Fix Applied

None. This is a discovery. The lane re-ran its gates as `bash -c 'cd <dir> && bun run <script>'`.

## Proposed Standard

Add one sentence to `docs/architecture.md` -> "Tests", beside "Run suites through turbo or from
inside the workspace": write `bun run --cwd <dir> <script>`, never `bun --cwd <dir> run <script>`,
which exits 0 without running anything. A gate's output must show the tool's own line (`$ tsc`,
`Test Files`) before its exit code counts. This conflicts with nothing in either `CLAUDE.md`.
