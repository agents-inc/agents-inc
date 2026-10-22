---
type: anti-pattern
severity: low
affected_files:
  - e2e/matchers/agent-matchers.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-20
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The option now splits the comma-separated string (`grantedTools` in
  `e2e/matchers/agent-matchers.ts`). `e2e/matchers/agent-matchers.e2e.test.ts` runs a real
  `compile` and pins the option passing on every tool web-developer is granted, and failing on one
  it is not, with a message naming that tool. Both specs were red before the fix, naming "Read".
---

## What Was Wrong

`toHaveAgentFrontmatter` in `e2e/matchers/agent-matchers.ts` offers a `tools` expectation and
checks it with `asStringArray(fm.tools)`, which answers `[]` for anything that is not an array.
`agent.liquid` writes `tools:` as one comma-separated string (`tools: Read, Write, Edit, Grep, Glob,
Bash, Skill`), so the parsed value is a string and every `tools` expectation fails, naming the
first expected tool as missing. Census, `git grep -n -A3 "toHaveAgentFrontmatter" -- e2e | grep
"tools:"`: no call site passes `tools`, so the option has never been exercised. It was found while
writing `e2e/commands/compile-writes-only-the-hooks-a-sub-agent-declares.e2e.test.ts`, which asserts
the rendered `tools:` line as text instead.

This is the case CLAUDE.md's "NEVER let a shared assertion helper's signature overstate what it
checks" names: the option's type says the field is checked, and nothing that calls it can pass.

## Fix Applied

None — discovery only. The matcher is outside the lane that found it.

## Proposed Standard

No new rule; the CLAUDE.md rule above covers it. Either split the string on `, ` before comparing,
or delete the `tools` option, since nothing calls it.
