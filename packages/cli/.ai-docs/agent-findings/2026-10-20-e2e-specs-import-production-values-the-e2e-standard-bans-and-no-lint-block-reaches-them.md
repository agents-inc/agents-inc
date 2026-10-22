---
type: convention-drift
severity: medium
affected_files:
  - e2e/commands/compile.e2e.test.ts
  - e2e/commands/uninstall-marker-sweep.e2e.test.ts
  - e2e/commands/doctor-diagnostics.e2e.test.ts
  - e2e/commands/search-static.e2e.test.ts
  - e2e/commands/retired-source-folder.e2e.test.ts
  - eslint.config.js
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The five rendering oracles now assert e2e/pages/constants.ts mirrors (STEP_TEXT.PROVENANCE_MARKER,
  STEP_TEXT.DOCTOR_STATUS_FAIL, PUBLIC_MARKETPLACE_NAME, EJECT_SOURCE_NAME, DIRS.RETIRED_SOURCE),
  each literal one registered in MIRRORS. The census below now returns 9 files: BUILT_IN_MATRIX in
  three, typedKeys/typedEntries in three, preview-matches-install's documented exception, and
  fixture-configs-round-trip, which runs in-process and needs an owner call. The lint block is not
  added.
---

## What Was Wrong

`standards/e2e/anti-patterns.md` -> "Never import from `src/cli/` in test files" allows type-only
imports. E2E specs carrying a value import from production code (anything under `src/cli/` outside
`__tests__/`), run from `packages/cli`:

```
find e2e -name '*.e2e.test.ts' | xargs awk '/^import /{s="";i=1} i{s=s" "$0} i&&/from "/{i=0; if(s~/src\/cli\//&&s!~/__tests__/&&s!~/^ import type /)print FILENAME}' | sort -u
```

On 2026-10-20 this returned 38 files: 17 in `commands/`, 18 in `lifecycle/`, 2 in `integration/`
and 1 in `interactive/` (a census). Most imports build fixture input. In five `commands/` specs the
imported value is also the expected rendered text. CLAUDE.md -> "never bind a RENDERING assertion to
the constant the product renders" covers this case: the assertion cannot fail when the value
changes.

- `compile.e2e.test.ts` and `uninstall-marker-sweep.e2e.test.ts`: the provenance marker, from
  `provenanceMarker()`.
- `doctor-diagnostics.e2e.test.ts`: the orphans row's glyph, from `UI_SYMBOLS.CROSS`.
- `search-static.e2e.test.ts`: the source column, from `EJECT_SOURCE` and
  `DEFAULT_PUBLIC_SOURCE_NAME`.
- `retired-source-folder.e2e.test.ts`: the folder named in the notice, from `RETIRED_SOURCE_FOLDER`.

These imports also tie a spec to a module path and export name, so moving or renaming the symbol
breaks the spec while the behaviour is unchanged.

Every `no-restricted-imports` block in `eslint.config.js` lists `TEST_FILES`, which includes
`**/e2e/**`, under `ignores`. So no rule reads an e2e spec's imports.

## Fix Applied

None. This is discovery only. The mirrors belong in `e2e/pages/constants.ts` and `MIRRORS` in
`scripts/check-mirrored-constants.ts`, and the lane that found this owns neither.

## Proposed Standard

Add a block for `e2e/**/*.e2e.test.ts` running `@typescript-eslint/no-restricted-imports`, with a
pattern on `**/src/cli/**`, an exception for `**/src/cli/lib/__tests__/**` (CLAUDE.md requires
those factories) and `allowTypeImports: true`. Measure it against the census before it lands.

Two values cannot be mirrored as literals: `cliVersion()` changes every release, and
`BUILT_IN_MATRIX` is the generated catalogue. Each needs a reader under `e2e/fixtures/` or a disable
naming why. Fix the five rendering oracles first, because they are the imports that hide a
behaviour change.

## Correction

The census undercounted two directories and missed two rendering checks. It reported one spec in
`interactive/` and none in `matchers/`; at HEAD there were three in `interactive/` and one in
`matchers/`. Two `lifecycle/` specs also rendered `UI_SYMBOLS` glyphs as expected text
(`global-config-deleted-under-install`, `project-config-deleted-under-global-install`), so the
rendering checks were seven, not five; the lifecycle lane fixed both. The proposed pattern on
`**/src/cli/**` would also refuse `typedKeys`/`typedEntries`, which CLAUDE.md requires.
