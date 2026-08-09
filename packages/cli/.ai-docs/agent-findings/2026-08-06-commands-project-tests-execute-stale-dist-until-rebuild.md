---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/src/cli/lib/__tests__/helpers/cli-runner.ts
  - packages/cli/.ai-docs/reference/testing/infrastructure.md
standards_docs:
  - .ai-docs/reference/testing/infrastructure.md
date: 2026-08-06
reporting_agent: general-purpose
category: testing
domain: cli
root_cause: rule-not-visible
status: open
---

## What Was Wrong

`runCliCommand` (`src/cli/lib/__tests__/helpers/cli-runner.ts`) drives commands through
`run(args, { root: CLI_ROOT })`, and oclif resolves that root's `package.json` `oclif` block to
the **compiled `dist/` output** — not to `src/`. So the `commands` vitest project exercises the
last build, while the `unit` and `integration` projects import `src/` directly.

The consequence: a source-level change to any parse boundary makes the commands project test
STALE code until `npm run build` runs. During the CLI-404 removal, deleting `recommends` from
`relationshipDefinitionsSchema` in `src/cli/lib/schemas.ts` left 25 commands-project specs red
with `Config validation failed … relationships.recommends: Invalid input: expected array,
received undefined` — the fixtures were correct, the source schema was correct, and the failure
came entirely from the stale `dist/` schema still requiring the deleted field. Nothing in
`.ai-docs/reference/testing/infrastructure.md` records that the commands project depends on the
build output, so the first read of that failure points at the change rather than at the missing
rebuild.

The inverse trap is quieter and worse: a commands spec can stay GREEN against stale `dist/`
after a breaking source change, and only CI's build step surfaces it.

## Fix Applied

None for the gap itself — rebuilt (`npm run build`) and re-ran, which turned all 25 failures
green with no further change. This finding is the record.

## Proposed Standard

`reference/testing/infrastructure.md`, in the section describing the three vitest projects:
state explicitly that the `commands` project executes the compiled `dist/` via
`runCliCommand`'s oclif root, and that any change to production source must be followed by
`npm run build` before trusting a commands-project run. A one-line note in
`reference/testing/factories.md` beside the `runCliCommand()` row would catch the reader at the
point of use.
