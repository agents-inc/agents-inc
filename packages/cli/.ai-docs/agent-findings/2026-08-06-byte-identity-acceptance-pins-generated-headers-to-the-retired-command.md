---
type: architectural-drift
severity: medium
affected_files:
  - packages/matrix/package.json
  - packages/matrix/src/generated/agents.ts
  - packages/matrix/src/generated/stack-preloads.ts
  - packages/cli/scripts/generate-matrix-package.ts
  - packages/cli/.ai-docs/reference/features/code-generation.md
  - packages/cli/.ai-docs/reference/features/seed-contract.md
  - packages/cli/.ai-docs/reference/build-and-packaging.md
standards_docs:
  - .ai-docs/reference/features/code-generation.md
date: 2026-08-06
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

Two things, both surfaced by moving the writer of `packages/matrix`'s generated surface into
`packages/cli`.

**1. A byte-identity acceptance criterion pins comment text, and that text named a command in the
package being retired.** Both generated files carry the header line ``Do not edit manually — run
`bun run generate` in packages/matrix.`` The acceptance criterion for the move was that every
emitted byte stay the same, so the new generator has to reproduce that line verbatim — which means
`packages/matrix` cannot simply drop its `generate` script, or the header would instruct the reader
to run something that does not exist. The generator and the instruction its output carries are
coupled, and nothing in the plan said so.

This is not specific to this move. **Any generator whose output embeds its own invocation command
cannot be relocated under a byte-identity rule without either keeping the old command alive or
accepting a one-time header rewrite.** That choice belongs in the plan, not in the implementer's
head at the moment they hit it.

**2. Reference docs describe both retired writers as current.** `code-generation.md` names
`packages/matrix/scripts/generate-from-cli.mjs` and the `check-web` job that ran `bun run generate`;
`seed-contract.md`'s module map lists `seed-schema.ts` as "the vendored wire contract"; and
`build-and-packaging.md`'s script and tsup-option tables predate `generate:matrix`,
`generate:matrix:check` and `noExternal`.

## Fix Applied

For (1): `packages/matrix`'s `generate` script was kept as a one-line delegation to
`bun run generate:matrix` in `packages/cli`, with a `//generate` note in its `package.json` saying
why it survives. The headers are therefore still true, and byte identity holds — verified by
running the generator against the real tree and `diff -r`-ing both output directories against a
pre-run copy.

For (2): none — documentation was outside this change's scope. Listed here so it is not lost.

## Proposed Standard

1. **In `.ai-docs/reference/features/code-generation.md`:** record `generate:matrix` /
   `generate:matrix:check` in the generator table with all nine of its outputs, and state that
   `packages/matrix`'s `generate` script is a delegation kept alive by the header text. This also
   discharges the standard proposed by
   `2026-08-06-stack-preloads-loses-its-only-writer-when-generate-from-cli-is-deleted.md`.
2. **In `.ai-docs/reference/features/seed-contract.md`:** the wire contract now has one home,
   `packages/matrix/src/seed.ts`, imported as `@workspace/matrix/seed` and bundled by tsup. The
   three-file module map is now two files.
3. **General rule, for whichever plan template owns relocations:** before moving a generator,
   grep its output for its own invocation command. If the output names it, either keep an entry
   point at the old name or budget a header rewrite — and say which in the plan, because a
   byte-identity acceptance criterion silently forbids the second option.
