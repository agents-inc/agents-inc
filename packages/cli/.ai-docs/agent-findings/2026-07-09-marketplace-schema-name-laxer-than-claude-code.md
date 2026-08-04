---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/schemas.ts
  - src/cli/commands/build/marketplace.ts
  - src/cli/lib/marketplace-generator.ts
standards_docs: []
date: 2026-07-09
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`build:marketplace` targets Claude Code's marketplace schema
(`https://anthropic.com/claude-code/marketplace.schema.json`), which forbids path
separators, `..`, and `.` in the marketplace `name` field. But the repo's own
`marketplaceSchema` in `src/cli/lib/schemas.ts` only constrains
`name: z.string().min(1)`. `generateMarketplace`/`writeMarketplace` in
`marketplace-generator.ts` do not validate against `marketplaceSchema` at write
time at all.

Consequence: when `package.json` uses an npm scoped name (e.g.
`@agents-inc/skills`), `build:marketplace` previously wrote that value verbatim as
the marketplace `name`, producing a `marketplace.json` that passes the repo's own
schema but is rejected by `claude plugin marketplace add` with a schema validation
error. The repo's schema is laxer than the external contract it claims to produce,
so the invalid output was not caught anywhere on the producing side.

## Fix Applied

Added an opt-in `--name` flag to `build:marketplace` that overrides the
`package.json` name for the marketplace identity. When the flag is provided it is
validated fail-fast (before any file is written) with the existing canonical
`validateMarketplaceName()` (kebab-case, which rejects `/`, `\`, `.`, `..`), erroring
with `EXIT_CODES.INVALID_ARGS`. Default behavior (no flag → read `package.json`
name verbatim, no sanitization) is unchanged. This is a targeted, opt-in fix; it
does not close the underlying schema gap for the default path.

## Proposed Standard

Producer-side schemas that model an external contract should be at least as strict
as that contract. `marketplaceSchema.name` in `src/cli/lib/schemas.ts` should encode
the same `name` constraint as the Claude Code marketplace schema (no `/`, `\`, `..`,
or `.`) so that any `marketplace.json` this CLI produces is validated against the
real acceptance rule before write — not only when a user happens to pass `--name`.
Tightening the Zod schema would also regenerate `src/schemas/marketplace.schema.json`
via `scripts/generate-json-schemas.ts`, keeping the published JSON schema honest.
