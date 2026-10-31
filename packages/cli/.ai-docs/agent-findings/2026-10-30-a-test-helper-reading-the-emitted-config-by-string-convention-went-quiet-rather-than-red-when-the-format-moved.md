---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/helpers/generated-types.ts
  - src/cli/lib/configuration/__tests__/config-round-trip.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-10-30
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  readGeneratedUnionMembers throws when an alias yields no single-quoted member (generated-types.test.ts
  watches it throw for a double-quoted body, a bare reference and never); stripTypeOnlySyntax is
  deleted from config-round-trip.test.ts, whose round trips load the emitted source unaltered.
---

## What Was Wrong

Two test-side readers of the CLI's emitted `config-types.ts` / `config.ts` keyed on the format's
string conventions, and each failed quietly when the 2026-08-26 format ruling moved them:

- `readGeneratedUnionMembers` in `helpers/generated-types.ts` answered `[]` for an alias whose body
  held no literal in the quote style it reads. Every caller asserting `not.toContain` passes on `[]`,
  so a quote-style change would have turned those assertions vacuous with the suite green.
- `stripTypeOnlySyntax` in `configuration/__tests__/config-round-trip.test.ts` removed
  `import type {...} from "./config-types";` with a regex the writer stopped matching (it emits
  `from './config-types'`, no semicolon). The replace was dead, the tests stayed green, and its
  docblock ("jiti cannot resolve the config-types import in a bare temp dir") justified nothing: jiti
  erases the type-only import and reads `satisfies` and annotations itself, as it does for every
  installed config.

Sibling census, after the deletion:
`grep -rn --include='*.ts' --include='*.tsx' -E '\.replace\(/.*(config-types|satisfies)' src e2e scripts`
returns only `configuration/__tests__/config-writer.test.ts`, three sites stripping the same syntax
for `new Function()`. Their regexes match today's emission, and a miss there leaves an `import` that
`new Function()` throws on, so they fail loud and were left. `helpers/config-source-sections.ts`
already throws on a missing marker and on an unclosed section.

## Fix Applied

`readGeneratedUnionMembers` throws, naming the alias and its body, when the body yields no member;
an absent alias still throws. `stripTypeOnlySyntax` is deleted and both round-trip loaders write
`generateConfigSource`'s output unaltered.

## Proposed Standard

CLAUDE.md "Test Assertions" already bans local parsers in test files and asks shared ones to carry
their own tests. Proposed addition beside it: a shared reader of emitted output never answers an
empty result it cannot tell from a miss; it throws, and its test feeds it the writer's real output
alongside a case it must refuse. No conflict with an existing rule found.
