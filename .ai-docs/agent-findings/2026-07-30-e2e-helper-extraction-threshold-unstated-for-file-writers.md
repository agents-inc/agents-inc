---
type: standard-gap
severity: low
affected_files:
  - e2e/helpers/test-utils.ts
  - e2e/commands/compile-corrupt-config.e2e.test.ts
  - e2e/commands/uninstall-corrupt-config.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-30
reporting_agent: cli-tester
category: dry
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The duplication itself is gone — `writeCorruptConfig(baseDir, source)` now lives in
  e2e/helpers/test-utils.ts and both corrupt-config spec files call it. The standards side is not
  landed: anti-patterns.md still gives an extraction threshold for assertion helpers (2+ files) and
  for ProjectBuilder setup (3+ files) but none for file-writing helpers in test-utils.ts, so the
  next agent in this position has to adjudicate it again.
---

## What Was Wrong

Writing a corrupt `.claude-src/config.ts` is the standard fixture for any error-path spec about an
unparseable config. `compile-corrupt-config.e2e.test.ts` had a file-local `corruptConfig(baseDir,
content)` for it. Adding `uninstall-corrupt-config.e2e.test.ts` needed exactly the same writer.

Three rules bear on where it should live, and none of them decides the case:

- CLAUDE.md: "NEVER write a helper function in an E2E test file without first grepping
  `e2e/helpers/test-utils.ts` and `e2e/fixtures/` for an existing one." Grepping finds nothing, so
  the rule permits writing one — but says nothing about WHERE.
- `anti-patterns.md` -> Duplicated Helpers: "Assertion functions used in 2+ files -> extract to
  `e2e/assertions/`". This is a file WRITER, not an assertion, so the 2+ threshold does not
  formally apply.
- `anti-patterns.md` -> Duplicated Helpers: "Setup patterns used in 3+ files -> new `ProjectBuilder`
  static method". At two files this says "not yet", and `ProjectBuilder` is the wrong home anyway —
  it builds whole project directories, not single corrupt files.
- `anti-patterns.md` -> Creating New Helpers names `test-utils.ts` as the home for "path helpers"
  specifically, which a file writer only loosely resembles, and gives it no threshold at all.

So the literal reading permits a second file-local copy. That is the outcome the DRY rules exist to
prevent: two copies of the same writer drift, and the one that is not updated silently stops
reproducing the state its spec name claims.

## Fix Applied

`writeCorruptConfig(baseDir, source)` was added to `e2e/helpers/test-utils.ts`, directly beside
`writeProjectConfig` / `writeConfigTypes` (its well-formed counterparts), and documented as the
error-path sibling that reproduces a config which EXISTS but cannot be loaded.
`compile-corrupt-config.e2e.test.ts` was switched to it and its local copy deleted; its five specs
still pass unchanged. The new `uninstall-corrupt-config.e2e.test.ts` uses it from the start.

## Proposed Standard

In `.ai-docs/standards/e2e/anti-patterns.md` -> **Duplicated Helpers**, make the existing bullet
list exhaustive by kind rather than leaving file writers unaddressed. Add one line:

> - File/fixture WRITERS used in 2+ files (anything that emits a file into a project or scope dir)
>   -> extract to `test-utils.ts` beside its well-formed counterpart. Same 2+ threshold as
>   assertion helpers, and for the same reason: two copies of a writer drift, and the stale copy
>   stops producing the state its spec name claims. This is distinct from the 3+ `ProjectBuilder`
>   threshold, which governs whole-project-directory setup, not single-file writes.

Optionally cross-reference it from the **Creating New Helpers** -> "Where new helpers belong" table,
whose `test-utils.ts` row currently reads "Path helpers (like `skillsPath`, `agentsPath`)" and
should read "Path helpers and single-file writers".
