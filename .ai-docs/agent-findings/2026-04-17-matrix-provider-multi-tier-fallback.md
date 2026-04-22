---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/matrix/matrix-provider.ts
standards_docs:
  - CLAUDE.md
date: 2026-04-17
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-visible
status: resolved
resolved_by: prefix-split fallback removed from getCategoryDomain
---

## What Was Wrong

`getCategoryDomain` in `src/cli/lib/matrix/matrix-provider.ts` was extended with a multi-tier resolution fallback:

1. First try the matrix: `matrix.categories[category as Category]?.domain`.
2. If that returns `undefined`, split the category ID on `-` and check whether the prefix is a valid Domain via `isDomain()`.

The inline comment justifies the fallback as "common in unit-test matrices and for auto-synthesized custom-skill categories" — meaning the fallback was added to paper over test-fixture shortcomings, not real production data shapes.

This directly violates CLAUDE.md's rule: **"NEVER build multi-tier resolution fallbacks (try exact → try alias → try directory name). Data matches on the first lookup or it's an error."**

The production caller (`src/cli/stores/wizard-store.ts`) already has a documented behavior when the domain lookup returns `undefined`: it warns and skips the skill. The fallback silently masks this path in any case where a category's ID happens to start with a domain-looking prefix, hiding legitimate "unknown category" conditions.

Additionally introduces a dead `AgentName` import.

## Fix Applied

None — discovery only. Pointed out to the main agent. Recommended remediation:

1. Remove the prefix-split fallback from `getCategoryDomain`.
2. Fix any unit-test matrices that rely on it to include the categories they reference (use the proper `createMockMatrix` / `SKILLS.*` fixtures per CLAUDE.md testing rules).
3. Remove the unused `AgentName` import.

## Proposed Standard

The CLAUDE.md rule already exists and is explicit. Strengthen enforcement by:

- Adding `getCategoryDomain` (and similar matrix lookup functions) to `.ai-docs/standards/clean-code-standards.md` as a concrete example of the "no multi-tier fallback" rule, since the temptation to add a "convenience" fallback for tests is recurring.
- Adding a check to the pre-commit protocol or a lint-style grep in `.ai-docs/standards/` for comments matching `/common in unit.?test/i` inside production `src/` files — they are almost always a smell that test shape is being smuggled into production logic.
