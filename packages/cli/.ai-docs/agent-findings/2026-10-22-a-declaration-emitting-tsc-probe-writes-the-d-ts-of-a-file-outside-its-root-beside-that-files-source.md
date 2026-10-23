---
type: missing-standard
severity: medium
affected_files:
  - packages/api-mocks/src/fixtures.ts
standards_docs:
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-10-22
reporting_agent: cli-developer
category: typescript
domain: infra
root_cause: convention-undocumented
status: open
---

## What Was Wrong

To read the types a constant infers, a probe in a scratch directory imported
`packages/api-mocks/src/fixtures.ts` by absolute path and ran `tsc` with `declaration`,
`emitDeclarationOnly` and an `outDir`, and no `rootDir`. `tsc` 6.0.3 reported TS5011 (the common
source directory lies outside the config's) and emitted anyway: `fixtures.d.ts` landed beside
`fixtures.ts` in the tree, not under `outDir`. For the few minutes it stood there,
`@workspace/api-mocks#lint` failed with `fixtures.d.ts was not found by the project service`, a red
that any lane gating in that window would have seen without a cause.

Reproduced entirely in a scratch directory: a `probe/tsconfig.json` with `outDir: "./out"` whose
`probe.ts` imports a sibling `lib/src/lib.ts` by absolute path exits 2 with TS5011 and writes
`lib/src/lib.d.ts`. With `"rootDir": "/"` it exits 0 and writes both declarations under `out/`.
With `"noEmitOnError": true` instead it exits 1 and writes nothing, and its TS6059 names the
config's own directory as the `rootDir` it defaulted to.

## Fix Applied

The stray `fixtures.d.ts` was deleted after confirming it was byte-identical to the probe's own
output (`cmp` against the second run's copy under `outDir`). The probe was re-run with
`"rootDir": "/"`.

## Proposed Standard

In `typescript-types-bible.md`, beside § 10's type-probe advice: a probe outside the tree checks with
`noEmit` and type assertions. One that emits declarations to read an inferred type sets `rootDir`
(or `noEmitOnError`), because an imported file outside the root is otherwise written beside its
source. Checked against CLAUDE.md and § 10: no conflict.
