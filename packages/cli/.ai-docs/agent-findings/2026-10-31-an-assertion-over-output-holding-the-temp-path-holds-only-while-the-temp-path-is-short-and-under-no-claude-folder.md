---
type: anti-pattern
severity: low
affected_files:
  - src/cli/base-command.test.ts
  - src/cli/lib/__tests__/commands/uninstall.test.ts
  - src/cli/lib/skills/local-skill-mover-dir-cleanup.test.ts
  - e2e/commands/init-from-shared-config.e2e.test.ts
  - e2e/interactive/edit-from-global-reach.e2e.test.ts
  - e2e/interactive/list-names-skills-by-display-name.e2e.test.ts
  - e2e/interactive/uninstall.e2e.test.ts
  - e2e/lifecycle/codex-doctor-reads-the-layout.e2e.test.ts
  - e2e/lifecycle/codex-install-narrates-its-own-host.e2e.test.ts
  - e2e/lifecycle/edit-global-propagates-to-every-registered-project.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-31
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  `base-command.test.ts` compares through `compactCliOutput`, `uninstall.test.ts` strips the project
  path before its `.claude/` negative, and `local-skill-mover-dir-cleanup.test.ts` asks the path
  relative to the project. The e2e specs compare a wrapped path through `compactCliOutput`, and their
  two `.claude` negatives read `compactedWithoutTempFolder` (`e2e/helpers/test-utils.ts`), which
  leaves out the temp folder every fixture sits in.
---

## What Was Wrong

With TMPDIR set to a folder about 130 characters long under a `.claude` folder, and no symlink
anywhere, ten spec files failed that pass with TMPDIR at `/tmp`. Commands, from `packages/cli`
(`<folder>` is that long real path):

```
TMPDIR=<folder> npx vitest run --maxWorkers=4
 Test Files  3 failed | 329 passed (332)
TMPDIR=<folder> npx vitest --config e2e/vitest.config.ts --run --project e2e --maxWorkers=6
 Test Files  7 failed | 265 passed (272)
      Tests  9 failed | 1577 passed | 3 expected fail | 2 todo (1591)
```

Two shapes, both in `affected_files`:

- **A path longer than the terminal width.** oclif breaks a word longer than the line mid-word, and
  Ink wraps a panel row, so `flattenCliOutput` puts a space inside the path, and a `toContain`, a
  `toMatch` over `[\s\S]*<path>` or a frame `toBe` misses it. `compactCliOutput` exists for this
  ("for text holding a path"); these specs did not use it.
- **A broad `.claude` negative over output that prints an absolute path.** "Names no Claude
  directory" is asserted as `not.toContain(".claude")` over the whole run, so any temp folder below
  a `.claude` folder fails it, whatever the CLI did.

A Mac's TMPDIR (`/var/folders/<2>/<28>/T/`) is about 49 characters, so some of the long-path
cases may fail there too; that was not measured.

## Fix Applied

`base-command.test.ts` compares its two warnings through `compactCliOutput` on both sides;
`uninstall.test.ts` strips the project path before its `.claude/` negative;
`local-skill-mover-dir-cleanup.test.ts` asks whether the skills folder relative to the project
holds `.claude`. The e2e specs are untouched.

## Proposed Standard

A spec asserting on output that holds a temp path compares through `compactCliOutput`, or names the
path's own line, and a negative about a folder name is asked of the path relative to the project or
home, never of the whole output. In `.ai-docs/standards/e2e/anti-patterns.md`, under "Reading
Rendered Output".
