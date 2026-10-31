---
type: anti-pattern
severity: low
affected_files:
  - src/cli/lib/__tests__/commands/compile.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-10-30
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The spec now reads stdout, stderr and the error message together and binds its negative to the
  skip line's own tail, so the line it says is absent would be seen if it were there.
---

## What Was Wrong

`should include a skill that has both SKILL.md and metadata.yaml` in `compile.test.ts` asserted
`not.toContain("missing metadata.yaml")` over `stdout + error.message`. The warning it guards
against is `warn()` from `lib/loading/loader.ts`, which writes through `console.warn`, which
`runCliCommand` captures into `stderr`. The negative read a stream the warning never reaches, so it
passed whether or not the warning was said. Its two sibling specs in the same `describe` read
`stdout + stderr + error.message` and were sound.

## Fix Applied

The spec reads `stdout + stderr + (error?.message || "")` and asserts the absence of
`registered with the CLI (no metadata.yaml)`, the tail of the one line a scan now says for folders
it skipped. The sibling spec in the same `describe` pins that line present over the same three
streams, so the negative has a positive twin reading the same surface.

## Proposed Standard

`.ai-docs/standards/e2e/README.md` → "Absence is the hardest thing to assert" names two traps for a
terminal frame. A third belongs beside them for captured command output: a negative assertion must
read the stream the asserted text is written to — `warn()` / `this.warn()` go to stderr, `log()` /
`this.log()` to stdout — and the same file should hold a positive assertion reading that same
stream. Census of negatives over `stdout` alone in command specs, to triage by hand:

```
grep -rn -B3 'not.toContain' src/cli/lib/__tests__/commands --include='*.test.ts' | grep -E 'const output = stdout \+ \(error'
```

Not cross-checked against a conflicting rule; CLAUDE.md's "Test Assertions" has none on streams.
