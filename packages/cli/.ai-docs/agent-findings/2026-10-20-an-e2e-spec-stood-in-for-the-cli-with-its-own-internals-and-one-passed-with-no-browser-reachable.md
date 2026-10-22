---
type: anti-pattern
severity: medium
affected_files:
  - e2e/integration/eject-compile.e2e.test.ts
  - e2e/integration/eject-integration.e2e.test.ts
  - e2e/integration/fixture-configs-round-trip.e2e.test.ts
  - e2e/integration/fixture-marketplace-namespace.e2e.test.ts
  - e2e/interactive/codex-edit-from-plugin-operations.e2e.test.ts
  - e2e/interactive/edit-from-plugin-operations.e2e.test.ts
  - e2e/interactive/init-dashboard.e2e.test.ts
  - e2e/matchers/project-matchers.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/test-structure.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  Six of the eight specs are fixed. fixture-configs-round-trip still calls the config loader and
  writer in-process, and fixture-marketplace-namespace still imports DEFAULT_PUBLIC_SOURCE_NAME and
  BUILT_IN_MATRIX. The first needs a home where production imports are allowed, or a command that
  rewrites config.ts. The second needs a mirror held by MIRRORS in scripts/check-mirrored-constants.ts.
---

## What Was Wrong

Specs in `integration/`, `interactive/` and `matchers/` used the product's own internals in place
of the CLI's observable behaviour. Census over those three directories, run from `packages/cli`,
with the awk from `2026-10-20-e2e-specs-import-production-values-the-e2e-standard-bans-and-no-lint-block-reaches-them`:

```
find e2e -name '*.e2e.test.ts' | xargs awk '/^import /{s="";i=1} i{s=s" "$0} i&&/from "/{i=0; if(s~/src\/cli\//&&s!~/__tests__/&&s!~/^ import type /)print FILENAME}' | sort -u | grep -v -e '^e2e/lifecycle/' -e '^e2e/commands/'
```

At HEAD it returns 6 files: 2 in `integration/`, 3 in `interactive/` and 1 in `matchers/`. The
earlier finding's count for the same awk was "1 in `interactive/`", with none in `matchers/`.
Two more specs came from a search of test names and comments for internal function names, and of
the specs for `CLI_ROOT`.

- `init-dashboard`, "opens the installation in the web editor when Edit is chosen", used
  `browserOpenerCommand` to name a stub that logged nothing. Measured: with the stub taken off
  `PATH`, nothing could open the editor, yet the spec's old assertions (exit 0, an id minted, the
  URL printed) all passed. Only the new read of the opener's log went red.
- `fixture-marketplace-namespace`, "is a name build marketplace accepts", called
  `validateKebabCaseName` rather than `build marketplace`.
- `eject-integration` had two specs named for `createLiquidEngine` and `readAgentFiles`. Every
  assertion they made is also made by `commands/eject` or by the compile-through specs. The one
  exception, a check for the text `{{ agent.name }}`, pinned the template's wording.
- `eject-compile` compared the ejected template with `src/agents/_templates/agent.liquid`, read by
  path, so moving that file would fail the spec while behaviour stayed the same.
- The specs computed expected plugin refs, including the rendered `Installed <ref>` line, with the
  product's `buildMarketplacePluginRef`.

## Fix Applied

- init-dashboard: now uses `stubBrowserOpener` and checks that the opener was handed the editor URL
  and the id just minted.
- eject-compile: the spec compiles, ejects and compiles again, then checks that the compiled
  sub-agents are identical. It was mutation-checked: one appended byte turns the final
  comparison red.
- Three specs deleted. Each one's covering spec is named in the C10 step-7 report.
- The plugin refs now come from `pluginKeyFor`, the e2e mirror.

## Proposed Standard

Nothing beyond the lint block the earlier finding proposes. One addition for
`standards/e2e/anti-patterns.md`: a stub standing in for a process the product spawns has to record
what it was handed, and the spec has to read that record. A stub that only exits 0 lets a spec
named for the spawn pass when nothing was spawned.
