---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/src/cli/lib/source-validator.test.ts
  - packages/cli/src/cli/lib/source-validator.ts
standards_docs:
  - packages/cli/CLAUDE.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The directory-name spec compares the whole issue again and fails on the mutant. Two sibling
  specs in the same file still leave their issue's file unasserted, and the Proposed Standard is
  not written into CLAUDE.md.
---

## What Was Wrong

A prune pass deleted the unit specs for `checkDirNameMatchesSkillId` in `source-validator.ts` and
said the `validateSource` specs covered it. The deleted spec asserted five things about the warning,
including `expect(issues[0]?.file).toBe(REL_PATH)`. The surviving spec, "should warn when directory
name does not equal the skill id", asserted four of them: the count, the severity and two parts of
the message. Nothing asserted which file the warning points at. A review served a mutant changing
`file: relPath` to `file: dirName` and the whole `src` suite stayed green.

The coverage was mapped one spec to another, not one assertion to another. A mutation of the check
itself, such as never warning, would have failed the survivor, so the map looked sound. The field
dropped out because the survivor checked the issue one field at a time. A field nobody wrote an
assertion for is invisible in that shape. The `toStrictEqual` rule in `CLAUDE.md` covers "object
and array comparisons", and a field-by-field check is not one, so the rule did not reach it.

This is the third instance of the class in
`2026-10-21-a-command-spec-named-as-a-deleted-unit-specs-replacement-stopped-at-an-early-return-before-the-guard`
and `2026-10-21-a-deleted-e2e-spec-was-named-covered-by-specs-that-overwrite-the-file-it-read`.
Here the replacement reaches the right code and still misses one field of its output.

## Fix Applied

The surviving spec compares the filtered issues `toStrictEqual` one whole issue: severity, the
`SKILL.md` path and the full message. Served the same mutant (`file: dirName`), it fails with
`- "file": "src/skills/react/SKILL.md"` / `+ "file": "react"`. On the unmutated source it passes.

Census, lane only: every deleted assertion on an issue's or result's path in this lane's test files,
from `git diff HEAD -- <lane test files> | grep -E "^-.*expect\(.*\.(file|path|filePath|sourcePath|destPath)\)"`.
It found six in `source-validator.test.ts` and three in `agents/agent-fetcher.test.ts`. The
agent-fetcher three tested `fetchAgentDefinitionsFromRemote`, which is gone from source. Five of the
source-validator six are pinned by survivors that compare whole issues: the snake_case spec and the
two half-pair specs. The directory-name one was the only gap.

Discovery, not fixed (these specs predate the prune and the brief named only the finding above):
three specs filter issues by message and assert only `severity`, so the `file` of their issues is
unpinned too. They are "should report specific error for malformed YAML in metadata"
(`validateOneSkill`, `file: relPath` in the parse catch) and the two `cliDescription severity
routing` specs (`checkMetadataSchema`, `file: relPath` on its errors and its warnings). Two served
mutants were run: the parse catch's `file` set to `metadataFile`, and the warnings' `file` set to
`""`. Each left `source-validator.test.ts`, `doctor-content.test.ts` and `configuration/config.test.ts`
green, 457 of 457. The errors' `file` was not mutated. The runs were bounded to the files that call
`validateSource` or name the message, not the whole suite.

## Proposed Standard

Two clauses for the rule the sibling findings propose (`packages/cli/CLAUDE.md` › "Test
Assertions": a replacement spec must fail on a mutation of the deleted spec's subject). First, the
mutation targets each deleted assertion, not the deleted spec as a whole. One mutant per field the
deleted spec asserted, because a mutant of the check is killed by any survivor that reaches the
check. Second, where a spec asserts a structured record a user reads (an issue, a report row), it
compares the whole record `toStrictEqual`. Then a dropped field shows up as a missing key in the
expected value. Checked against CLAUDE.md: no conflict. It narrows "ALWAYS use `toStrictEqual`" to
say a field-by-field check of a record is an object comparison.
