---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/__tests__/commands/uninstall.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-11-04
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-visible
status: partial
partial_note: >-
  The spec is fixed. The Proposed Standard of
  2026-10-31-an-assertion-over-output-holding-the-temp-path-holds-only-while-the-temp-path-is-short-and-under-no-claude-folder.md
  is still absent from anti-patterns.md, which is why this recurred; that half is pending.
---

## What Was Wrong

`uninstall.test.ts` › "warns and finishes when the Codex configuration the trust was all it held
cannot be deleted" (added in af8e5c71, 2026-11-04) asserted
`flattenCliOutput(stderr)).toContain(\`Warning: Could not remove ${codexConfig}, …\`)`. oclif
breaks a path longer than the line mid-word, so flattening leaves a space inside it
(`a-proje ct-folder`). It passed locally on a short TMPDIR and failed CI's `check-cli`(run
41742108401), whose unit job runs under a long temp folder inside a`.claude` folder.

This is the shape the 2026-10-31 finding named. Its Proposed Standard (compare a temp path through
`compactCliOutput`) was never written into `anti-patterns.md`, so nothing a spec author reads says
it. The CI step caught it, as designed, but only after release.

Reproduction, from `packages/cli`, with a 23-character base the length of CI's
`/home/runner/work/_temp` and the same `.claude/projects/...` tail, symlinked as `tmp-link`:

```
TMPDIR=<base>/tmp-link npx vitest run src/cli/lib/__tests__/commands/uninstall.test.ts --maxWorkers=4
```

Before: 1 failed. After: 136 passed. The whole unit suite under the same TMPDIR afterwards (census,
not sample): 347 files, 9351 tests, all passed.

## Fix Applied

The assertion compares through `compactCliOutput` on both sides, as the same file already does for
its other path-holding warnings. It still pins the warning, the path and "which now holds nothing".

## Proposed Standard

Land the 2026-10-31 finding's standard in `.ai-docs/standards/e2e/anti-patterns.md` under
"Reading Rendered Output", and say it binds unit specs too (their oclif output wraps the same way):
output holding a temp path is compared through `compactCliOutput` on both sides. Checked against
`packages/cli/CLAUDE.md`; it conflicts with nothing there.
