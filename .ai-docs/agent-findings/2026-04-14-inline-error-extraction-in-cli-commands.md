---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/commands/build/marketplace.ts
  - src/cli/commands/import/skill.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-04-14
reporting_agent: cli-reviewer
category: dry
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: getErrorMessage adopted in build/marketplace.ts and import/skill.ts
---

## What Was Wrong

Two CLI commands used the inline `error instanceof Error ? error.message : String(error)` (or `...: 'fallback'`) pattern inside oclif command catch blocks. Clean-code rule 3.1 explicitly forbids this — `getErrorMessage(error)` from `utils/errors.ts` is the canonical helper.

- `build/marketplace.ts:129` — `JSON.parse(rawContent)` catch used `error instanceof Error ? error.message : String(error)`.
- `import/skill.ts:137` — `fetchSkillSource()` catch used `error instanceof Error ? error.message : 'Failed to fetch: …'` as the entire message, which also silently dropped the underlying error text on non-Error throws.

Neither file imported `getErrorMessage` despite all sibling command files already using it.

## Fix Applied

Replaced both inline extractions with `getErrorMessage(error)` and added the import to `build/marketplace.ts` (`import/skill.ts` already imported it for use elsewhere in the file). The `import/skill.ts` message was also restructured from a ternary-as-entire-message into a consistent `"Failed to fetch ${source}: ${getErrorMessage(error)}"` format so the underlying cause is always preserved.

## Proposed Standard

Rule 3.1 already covers this. The enforcement gap is that it's easy to miss during command authoring, especially when the catch block is `this.error(...)` rather than `warn(...)` or `this.handleError(...)`. Options:

1. Add an ESLint rule that flags `error instanceof Error ? error.message : ` as an inline pattern and suggests `getErrorMessage`.
2. Expand the CLAUDE.md error-handling bullet to explicitly mention `this.error(...)` call sites (currently it only mentions `catch` blocks generically).
3. Add a one-line reference to `getErrorMessage` in the NEVER section of CLAUDE.md — "NEVER inline `error instanceof Error` extraction; use `getErrorMessage` from `utils/errors.ts`."
