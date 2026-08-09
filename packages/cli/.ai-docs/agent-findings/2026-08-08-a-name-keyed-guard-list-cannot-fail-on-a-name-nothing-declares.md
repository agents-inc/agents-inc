---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/config-gate-enforcement.test.ts
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-08-08
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  CLI-434(d). All three dead names replaced by the live entry points that took their place, and
  every one of the ten remaining names verified by import to resolve to an exported symbol.
  CLI-437 made that verification permanent: the throwaway spec is now two `it`s inside
  `config-gate-enforcement.test.ts`, beside the lists they guard — one resolving every guarded name
  against the union of the four owning modules' exports, one self-testing the resolver against
  `writeScopedConfigs`, the dead name this finding names first. Shown red by adding
  `regenerateScopeConfigTypes` back to `INSTALLATION_RAW_WRITERS`, which failed naming exactly that
  row and nothing else.
---

## What Was Wrong

`config-gate-enforcement.test.ts` guards the ruling that no raw config-pair writer may be reached
through the `installation` or `configuration` barrels. Both assertions are the same shape:

```ts
const leaked = INSTALLATION_RAW_WRITERS.filter((name) => name in barrel);
expect(leaked).toStrictEqual([]);
```

The guard is a list of **strings**. A row whose string names nothing that exists can never fail —
no file can re-export a symbol nothing declares — so it is a permanently-green row that reads,
to anyone scanning the list, exactly like the nine live ones beside it.

CLI-434 named one such row, `writeScopedConfigs`, and the file's own JSDoc had already recorded it
as dead. Grepping the rest of the list, which is what CLI-434 asked for, found two more:

| Dead name                    | List                        | Live successor          |
| ---------------------------- | --------------------------- | ----------------------- |
| `writeScopedConfigs`         | `INSTALLATION_RAW_WRITERS`  | `writeScopedFromWizard` |
| `regenerateScopeConfigTypes` | `INSTALLATION_RAW_WRITERS`  | `writeScopeConfigTypes` |
| `saveSourceToProjectConfig`  | `CONFIGURATION_RAW_WRITERS` | `writeProjectPartial`   |

Three of ten rows — a third of the guard — were guarding nothing. Two of the three additionally
grep to a live-looking declaration, because `local-installer.test.ts` keeps positional-argument
shims under the old names so its specs read as they did before the gate landed. A reader checking
the list with `grep -rn "<name>" src/` therefore gets a hit and concludes the row is fine.

## Fix Applied

Each dead name was replaced by its live successor rather than deleted. Deleting would have shrunk
the guard: `writeScopedFromWizard` IS the wizard write path and `writeScopeConfigTypes` IS the
types-half writer, so those are precisely the names that must not leak from the installation
barrel. All three successors are declared in `config-gate/index.ts` and re-exported by neither
target barrel, so the assertions stay green for the right reason.

Non-vacuity was then proved rather than asserted: a throwaway spec imported the four owning
modules and checked every one of the ten guarded names is `in` the union of their exports. It
passes on the corrected lists and fails naming exactly `writeScopedConfigs` and
`regenerateScopeConfigTypes` when the old names are added back.

## Proposed Standard

For `.ai-docs/standards/documentation-bible.md`, beside the "where a document pairs a symbol with a
file, the symbol must be declared in that file" rule this finding's sibling proposed:

> **A test that guards a list of identifier STRINGS must assert those identifiers resolve.** One
> extra expectation next to the guard —- import the modules that legitimately own the symbols and
> check each name is `in` their exports — converts a silent decay into a failing test the day a
> guarded symbol is renamed. Without it the guard degrades one row at a time and every row still
> looks alive, which is worse than having no guard: the file's own name promises enforcement.

`grep`ping the name is NOT a substitute, and this case is why: two of the three dead names grep to
a live function declaration in a test file that deliberately preserves the old spelling.
