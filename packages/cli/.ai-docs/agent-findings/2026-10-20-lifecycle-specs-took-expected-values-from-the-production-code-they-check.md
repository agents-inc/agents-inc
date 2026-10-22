---
type: anti-pattern
severity: low
affected_files:
  - e2e/lifecycle/branding-survives-config-rewrites.e2e.test.ts
  - e2e/lifecycle/claude-install-byte-identity.e2e.test.ts
  - e2e/lifecycle/codex-install-leaves-claude-untouched.e2e.test.ts
  - e2e/lifecycle/codex-install-narrates-its-own-host.e2e.test.ts
  - e2e/lifecycle/codex-offered-placements.e2e.test.ts
  - e2e/lifecycle/codex-refusal-on-the-read-path.e2e.test.ts
  - e2e/lifecycle/codex-uninstall-reports-what-it-observed.e2e.test.ts
  - e2e/lifecycle/config-types-subagent-union-survives-compile.e2e.test.ts
  - e2e/lifecycle/edit-global-source-toggle-propagation-compiled-ref.e2e.test.ts
  - e2e/lifecycle/empty-scope-dirs-removed.e2e.test.ts
  - e2e/lifecycle/global-config-deleted-under-install.e2e.test.ts
  - e2e/lifecycle/preview-matches-install.e2e.test.ts
  - e2e/lifecycle/project-config-deleted-under-global-install.e2e.test.ts
  - e2e/lifecycle/project-edit-global-source-switch-divergence.e2e.test.ts
  - e2e/lifecycle/project-edit-removes-plugin-half-of-pair.e2e.test.ts
  - e2e/lifecycle/project-init-global-config-marketplace.e2e.test.ts
  - e2e/lifecycle/real-marketplace.e2e.test.ts
  - e2e/lifecycle/scope-aware-local-copy.e2e.test.ts
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
  Thirteen of the eighteen specs now take the value from an e2e mirror or a literal. Five still
  import production code. preview-matches-install is the documented exception. branding-survives-config-rewrites
  and claude-install-byte-identity import typedKeys and typedEntries, which CLAUDE.md requires.
  claude-install-byte-identity and codex-install-leaves-claude-untouched need a CLI-version reader
  under e2e/, and config-types-subagent-union-survives-compile needs a mirror of the marketplace's
  agents folder (DIRS.agents, "src/agents"). Neither exists yet.
---

## What Was Wrong

`standards/e2e/test-structure.md` -> "No Production Imports in Tests" allows only type imports from
`src/cli/` in a spec. A census of the lifecycle specs, run from `packages/cli`:

```
find e2e -name '*.e2e.test.ts' | xargs awk '/^import /{s="";i=1} i{s=s" "$0} i&&/from "/{i=0; if(s~/src\/cli\//&&s!~/__tests__/&&s!~/^ import type /)print FILENAME}' | sort -u | grep lifecycle
```

On 2026-10-20 this returned the 18 files listed above. In eleven of them, the expected value or the
reader came from the code under test. The assertion and the product would then change together, so
the assertion could not fail when the product changed:

- `UI_SYMBOLS.CROSS` / `UI_SYMBOLS.CHECK` as the expected doctor glyph, in
  `global-config-deleted-under-install` and `project-config-deleted-under-global-install`. The
  2026-10-20 finding `e2e-specs-import-production-values-the-e2e-standard-bans-and-no-lint-block-reaches-them`
  lists five rendering oracles, all in `commands/`, and misses these two.
- `buildMarketplacePluginRef` as the expected plugin ref, in four specs.
- `EJECT_SOURCE` as the expected `origin` recorded in `config.ts`, in five specs. A sixth,
  `codex-refusal-on-the-read-path`, used it only to build fixture input.
- `listCompiledAgentNames`, the product's own lister, used to read the compiled roster the spec
  checks, in `real-marketplace`.

`CLAUDE_DIR` in `empty-scope-dirs-removed` is the standard's own example of a forbidden import.

## Fix Applied

- `CLAUDE_DIR` -> `DIRS.CLAUDE`, the glyphs -> the literal `✓` / `✗`, `EJECT_SOURCE` -> `"eject"`
  (the lane's usual `origin: "eject"`), `buildMarketplacePluginRef` -> `pluginKeyFor` from
  `e2e/fixtures/plugin-install-state.ts`.
- `real-marketplace` lists the roster with `readCompiledAgents` and compares it to
  ``[`${WEB_DEV}.md`]``, as `preview-matches-install` does.
- Each replacement has the same value as the import today, so every assertion compares the same
  thing as before. No test was added or removed.

## Proposed Standard

Nothing new beyond the lint block the earlier finding proposes. Two notes for whoever builds it:

1. Two mirrors are missing: `SOURCE_PATHS.AGENTS_DIR` (`"src/agents"`, held to `DIRS.agents` in
   `packages/compile/src/paths.ts` through `MIRRORS`), and a CLI-version reader under `e2e/`.
2. The proposed `**/src/cli/**` pattern conflicts with CLAUDE.md -> "ALWAYS use `typedEntries()` /
   `typedKeys()` from `utils/typed-object.ts`". Either allow `utils/typed-object` or re-export both
   through `e2e/helpers/test-utils.ts`.
