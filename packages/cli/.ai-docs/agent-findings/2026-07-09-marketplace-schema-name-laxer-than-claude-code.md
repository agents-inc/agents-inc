---
type: standard-gap
severity: medium
affected_files:
  - src/cli/lib/schemas.ts
  - src/cli/commands/build/marketplace.ts
  - src/cli/lib/marketplace-generator.ts
  - src/cli/lib/validate-kebab-name.ts
  - src/cli/utils/messages.ts
standards_docs: []
date: 2026-07-09
reporting_agent: cli-developer
category: typescript
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >-
  The schema half landed 2026-08-20 under the owner ruling that the CLI piggybacks on whatever
  Claude Code accepts as a marketplace name. `marketplaceSchema.name` is now
  `z.string().min(1).regex(KEBAB_CASE_PATTERN, { message: MARKETPLACE_NAME_REFUSAL })`, so a
  third-party `marketplace.json` naming `@acme/skills` is refused when it is READ and not only when
  this CLI would write one — the "separate decision with a separate blast radius" this finding
  deferred, taken and accepted. This finding's own prediction that tightening the schema would
  regenerate `src/schemas/marketplace.schema.json` held: it gained the `pattern` an editor validates
  against. The message is carried on the `regex` check rather than in a `refine` because a
  refinement is unrepresentable in JSON Schema and `z.toJSONSchema` drops it silently, which would
  have cost that file the very `pattern` this finding wanted. Agreement across all three judges of a
  kebab name is now held by
  `src/cli/lib/__tests__/kebab-name-judges-agree.test.ts`. The residue — one rule with four
  user-facing SPELLINGS and only the regex shared — is filed separately as
  2026-08-20-marketplace-name-rule-enforced-on-emit-and-not-on-load.md.
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

## Fix Applied (2026-07-09)

Added an opt-in `--name` flag to `build:marketplace` that overrides the
`package.json` name for the marketplace identity. When the flag is provided it is
validated fail-fast (before any file is written) with the existing canonical
`validateMarketplaceName()` (kebab-case, which rejects `/`, `\`, `.`, `..`), erroring
with `EXIT_CODES.INVALID_ARGS`. Default behavior (no flag → read `package.json`
name verbatim, no sanitization) is unchanged. This is a targeted, opt-in fix; it
does not close the underlying schema gap for the default path.

## Second Fix Applied (2026-08-19) — the default path, still not the schema

`loadMarketplaceIdentity` now runs `validateKebabCaseName` over the name whichever way it arrived.
A name read from package.json is refused with `marketplaceNameNotPublishable` (in
`src/cli/utils/messages.ts`) at `EXIT_CODES.ERROR`, naming every character kebab-case does not
admit — `@` and `/` for a scoped name — and pointing at `--name` as the way out, because an npm
scoped name is legitimate for a package and illegitimate for a marketplace, so the two identities
have to be allowed to differ. A `--name` the author typed keeps its own sentence and
`EXIT_CODES.INVALID_ARGS`: an argument is something they can retype, a package name is not.

**This deliberately does not touch `marketplaceSchema`.** That schema parses third-party
marketplaces as well as the ones this CLI writes, so tightening `name` changes what LOADS, not only
what this command emits — a separate decision with a separate blast radius, and the reason the
Proposed Standard below is still the open half of this finding.

## Proposed Standard

Producer-side schemas that model an external contract should be at least as strict
as that contract. `marketplaceSchema.name` in `src/cli/lib/schemas.ts` should encode
the same `name` constraint as the Claude Code marketplace schema (no `/`, `\`, `..`,
or `.`) so that any `marketplace.json` this CLI produces is validated against the
real acceptance rule before write — not only when a user happens to pass `--name`.
Tightening the Zod schema would also regenerate `src/schemas/marketplace.schema.json`
via `scripts/generate-json-schemas.ts`, keeping the published JSON schema honest.
