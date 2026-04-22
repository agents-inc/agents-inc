---
type: convention-drift
severity: medium
affected_files:
  - src/cli/lib/source-validator.test.ts
  - src/cli/lib/__tests__/commands/validate.test.ts
  - src/cli/lib/schemas.test.ts
  - e2e/helpers/create-e2e-source.ts
standards_docs:
  - CLAUDE.md (Test Data section)
date: 2026-04-14
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: mock-source-files.ts created with 5 canonical fixtures; source-validator migrated
---

## What Was Wrong

The on-disk file shapes validated by `source-validator` (`stackConfigValidationSchema`,
`metadataValidationSchema`, `skillCategoriesFileSchema`, `skillRulesFileSchema`,
`stacksConfigSchema`) are repeatedly inlined across at least four test files:

- `source-validator.test.ts` had five inline file-level constants (`VALID_STACK_CONFIG`,
  `VALID_EMBEDDED_SKILL_METADATA`, `VALID_CATEGORIES_CONFIG`, `VALID_RULES_CONFIG`,
  `VALID_STACKS_CONFIG`).
- `validate.test.ts` builds the same shapes via local `writeTestMatrix()` /
  `writeValidInstalledSkill()` helpers.
- `schemas.test.ts` constructs the same `skillCategoriesFileSchema` shape inline
  in multiple test cases.
- `e2e/helpers/create-e2e-source.ts` writes the same `skill-rules.ts` and
  `stacks.ts` shapes inline.

The existing `mock-data/` directory has files for runtime objects (skills, agents,
stacks, categories, matrices, sources) but **no shared file** for the _on-disk
file shapes_ that get strictly validated when loading a published source. This
gap meant each test file reinvented the canonical "valid published-file"
fixture, with subtle drift (different versions, different category sets, etc.).

## Fix Applied

Created `src/cli/lib/__tests__/mock-data/mock-source-files.ts` with five
canonical fixtures mapping 1:1 to the strict validation schemas:

- `VALID_STACK_CONFIG_FILE` → `stackConfigValidationSchema`
- `VALID_EMBEDDED_SKILL_METADATA_FILE` → `metadataValidationSchema`
- `VALID_SKILL_CATEGORIES_FILE` → `skillCategoriesFileSchema`
- `VALID_SKILL_RULES_FILE` → `skillRulesFileSchema`
- `VALID_STACKS_CONFIG_FILE` → `stacksConfigSchema`

Migrated `source-validator.test.ts` to import these. Did NOT migrate
`validate.test.ts`, `schemas.test.ts`, or `create-e2e-source.ts` — those are
out of scope for this task but are the obvious next consumers.

## Proposed Standard

Add to CLAUDE.md "Test Data" rules:

> When constructing test data that matches a Zod validation schema (anything
> validated at a parse boundary — file shapes, API responses, config files),
> check `__tests__/mock-data/mock-source-files.ts` first. Add new canonical
> fixtures there rather than inlining schema-shaped objects in test files.

Add a follow-up TODO to migrate `validate.test.ts`, `schemas.test.ts`, and
`create-e2e-source.ts` to use `mock-source-files.ts` so the canonical fixtures
have multiple consumers and stay in sync as schemas evolve.
