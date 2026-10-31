---
type: anti-pattern
severity: low
affected_files:
  - packages/compile/src/contract/emission-scenarios.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-10-31
reporting_agent: cli-tester
category: testing
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The header of emission-scenarios.ts now names the two unit specs that pin the layouts no scenario
  reaches, and its prints-nothing grep matches `import [g]lobalConfig from` unanchored; the same grep
  run on config-types-source.test.ts and config-source.test.ts returns 9 and 2 lines.
---

## What Was Wrong

The header of `packages/compile/src/contract/emission-scenarios.ts` (written 2026-10-29) said four
config layouts "reach no scenario, so they are verified by hand": the sectioned `// Custom` /
`// Marketplace` union, the stacked plain union, the stacked `SkillAssignment<...>` type argument and
`generateProjectConfigWithGlobalImport`. All four were already pinned byte for byte and checked as
prettier fixed points by `packages/compile/src/config-types-source.test.ts` ("a union too wide for its
line", "every file rendered above") and `packages/compile/src/config-source.test.ts` ("a project
config that imports its global config", "the bytes pinned above"), committed 2026-10-18. The owner
card that followed (q-cli-845-two-more-examples) was built on this note.

The note's absence check had a second defect: its `^import globalConfig` pattern can never match a
scenario constant, because the first line of such a template sits on the `const` line
(`const X = \`import globalConfig ...`). Its "prints nothing" result was therefore free for that
layout. `config-source.test.ts` shows the same shape: the anchored pattern returns 0 lines there,
where the unanchored one returns 2.

## Fix Applied

The note now says these layouts reach no scenario and names the specs that pin them. Its grep anchors
only the patterns that land at the start of a line inside a template, and brackets the import one
(`import [g]lobalConfig from`) so the grep line does not match itself. Run on the two unit specs, the
grep returns 9 and 2 lines, so it is known to fire.

## Proposed Standard

`documentation-bible.md` -> "An Absence Names No Symbol": a "nothing checks X" or "verified only by
hand" sentence carries the census that found no automatic check (a grep of the spec files for X's
marker), not just a grep of the file it sits in. And a prints-nothing grep written beside an absence
is run once against a file that does hold the thing, with that count recorded, so a pattern that can
never fire is caught when it is written. No conflict with CLAUDE.md found.
