---
type: anti-pattern
severity: low
affected_files:
  - packages/compile/src/installed-format.ts
  - packages/compile/src/config-source.test.ts
  - packages/compile/src/config-types-source.test.ts
standards_docs:
  - .ai-docs/standards/clean-code-standards.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: shared
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The spec is rewritten through the public writers. The writer keeps a value beside an object key
  narrower than five columns (`propertyPosition`, `hasShortKey` in installed-format.ts), and
  config-source.test.ts holds a top-level `name`, a five-column key and a nested `id` against
  prettier.
---

## What Was Wrong

`packages/compile/src/installed-format.test.ts` called twelve helpers in `installed-format.ts`. That
module is not a `package.json` `exports` subpath and is not re-exported by `src/index.ts`. Only
`config-source.ts` and `config-types-source.ts` import it. In a scratch copy, renaming
`renderValueLine` in both files left every emitted byte unchanged, and the spec went red with
`renderValueLine is not a function`.

`npx knip --workspace packages/compile --production --include exports,types` exits 0 on this tree,
with or without the spec. That is the census proposed by
`2026-10-20-a-test-of-a-package-private-export-is-its-only-reader-and-knip-counts-it-as-one`.
`--production` drops tests from the graph, and every helper has a production reader in a sibling
writer. So the census finds an export that only a test reads. It cannot find a test that reaches
past the public surface into a module whose exports all have production readers.

The spec's fixture also hid a defect. "moves a string that does not fit below its key" used a
synthetic key 90 columns wide. Prettier moves a too-wide value below its key only when the key is
5 or more columns wide (`isObjectPropertyWithShortKey`). Under a shorter key it keeps the value on
the key's line, however wide. `movesBelowItsPrefix` and `line` do not model this. All three of
these were measured in a scratch copy, and none of the emitted files is a prettier fixed point:

- `name: "x".repeat(95)` is emitted as `name:` with `'xxx…',` on the next line, while prettier
  writes `name: 'xxx…',`.
- A skill entry's `id` past 100 columns behaves the same way.
- A stack assignment's `path` past 100 columns behaves the same way.

The module's docblock says the output is already prettier-formatted, and these three cases
contradict it. `author` (6 columns) is a fixed point.

## Fix Applied

The spec is deleted. Each rule it pinned is now asserted through `generateConfigSource` and
`generateConfigTypesSource`, at the same boundaries, in `config-source.test.ts` and
`config-types-source.test.ts`. Every rendered file is held against prettier.

In the scratch copy, 24 mutants of `installed-format.ts` each turned at least one rewritten spec
red. They covered quote choice, escapes, the key regex, the layout of null, empty and numeric
values, every `<= PRINT_WIDTH`, and the union tail.

Two of the old cases cannot be reached through either writer, so they were not replaced:

- `renderArrayLine` with no entries: every call passes a source entry or a scope comment.
- A type import exactly 101 columns wide: the specifier sets `config.ts` can import come to
  100 columns or to 105 or more, and the project types import is always over 100.

The short-key defect is not fixed.

## Proposed Standard

`clean-code-standards.md` § 6 Testing:

- To find a spec that reaches past a package's public surface, compare each spec's imports with the
  package's published entry points: the `exports` subpaths, the barrel, and what those re-export.
  Do not rely on knip for this.
- Where a layout rule copies a formatter's, fixtures use the field names the product actually
  writes, so that the formatter's own exceptions get exercised.

This does not conflict with `CLAUDE.md`.
