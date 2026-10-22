---
type: missing-standard
severity: medium
affected_files:
  - src/cli/lib/operations/project/detect-project.test.ts
  - src/cli/lib/__tests__/helpers/isolated-home.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  Landed in detect-project.test.ts: a spec writes the installation under a directory that is not
  the cwd and calls detectProject with it. Pending: the rule itself, and a check of
  loadSource's `projectDir || process.cwd()` in lib/loading/source-loader.ts, which is outside the
  lane that wrote this.
---

## What Was Wrong

`setupIsolatedHome` in `lib/__tests__/helpers/isolated-home.ts` calls `process.chdir(projectDir)`.
So inside every spec built on it, `home.projectDir` and `process.cwd()` are the same directory. A
function whose directory argument falls back to the cwd (`projectDir ?? process.cwd()`) cannot be
told apart, by such a spec, from one that ignores the argument and always reads the cwd.

`detect-project.test.ts` was rewritten off its mocks onto a real isolated home, and the spec that
passed `/custom/dir` was deleted as covered by two specs passing `home.projectDir`. A review
replaced `const resolvedDir = projectDir ?? process.cwd();` with `const resolvedDir =
process.cwd();` and the whole file stayed green, while `commands/doctor.ts` calls
`detectProject(projectDir)` in production.

Census of directory parameters that default to the cwd, over the CLI's source (not a sample):

```
grep -rnE "(=|\?\?|\|\|) process\.cwd\(\)" src --include='*.ts' --include='*.tsx' | grep -v "\.test\.\|__tests__"
```

On 2026-10-21 four of the hits were defaulting parameters, the rest commands reading their own cwd:

- `operations/project/detect-project.ts` `detectProject` — the case above, now covered.
- `installation/installation.ts` `detectInstallation` — distinguishable: `installation.test.ts`
  uses `createTempDir` and never changes directory.
- `plugins/plugin-finder.ts` `getProjectPluginsDir` — distinguishable: its spec passes
  `/my/project`.
- `loading/source-loader.ts` `loadSource` (`projectDir || process.cwd()`) — not checked.

## Fix Applied

`detect-project.test.ts` gained "answers the installation in the directory it is given, not the
current directory": it writes the installation under `<tempDir>/elsewhere`, asserts that is not
the cwd, and expects the detection rooted there. The mutant above now reddens exactly that spec.

## Proposed Standard

In `isolated-home.ts`'s docblock for `setupIsolatedHome`, and as a Test Assertions bullet in
CLAUDE.md: a function whose directory argument defaults to the cwd needs one spec that passes a
directory that is NOT the cwd, because inside an isolated home `home.projectDir` is the cwd and
cannot distinguish the argument from the default. The census command above is the worklist.
Checked against CLAUDE.md's NEVER/ALWAYS rules: no conflict.
