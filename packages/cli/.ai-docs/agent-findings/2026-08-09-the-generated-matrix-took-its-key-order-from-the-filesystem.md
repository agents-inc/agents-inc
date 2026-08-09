---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/scripts/generate-source-types.ts
  - packages/cli/src/cli/types/generated/matrix.ts
  - packages/matrix/src/vendor/generated/matrix.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-08-09
reporting_agent: main-session
category: tooling
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  generatePhase2 sorts its skill and agent inputs byte-wise by id before any emission, the two
  localeCompare comparators in the generator became byte-wise for the same reason, and a
  determinism spec in generate-source-types.test.ts feeds the phase the same inputs in two
  orders and requires byte-identical matrix.ts — observed red against the unfixed generator,
  green after.
---

# The generated matrix took its key order from the filesystem

## What happened

The first live run of the regenerate-catalog workflow — the automation's maiden dispatch —
produced a 17,300-line pull request against a marketplace state the monorepo had regenerated
from an hour earlier. Every changed line was reordering: identical sorted-line multisets,
different key sequence in `BUILT_IN_MATRIX.skills`.

## Root cause

`mergeMatrixWithSkills` fills its skills record in input order, and the generator handed it
the array exactly as `readdirSync` produced it. Directory enumeration order is a property of
the filesystem — near-sorted on the development machine, hash-scrambled on the CI runner's
ext4 — so the generator's output encoded where it ran. Every local check stayed green forever
because a machine always agrees with itself; only the first cross-machine regeneration could
surface it, and did.

Two `localeCompare` sorts in the same file were the latent second instance of the class:
locale-sensitive comparison is deterministic per ICU build and nothing pins ICU builds across
environments.

## The rule

A generator whose output is committed must define its own ordering for every collection it
emits — explicitly, byte-wise, at the emission site. "The input happened to arrive sorted" is
not an ordering; neither is the default locale. The proof obligation is a spec that feeds the
generator permuted inputs and requires byte-identical output, red-first against the code that
merely happened to pass.
