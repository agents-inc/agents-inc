---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/dependency-graph.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
---

## What Was Wrong

Dependency graph (`reference/dependency-graph.md`, last_validated 2026-04-02, 19 days stale) had six classes of drift against current source:

1. **Filename drift**: `commands/search.tsx` renamed to `commands/search.ts` when the command was rewritten to use `@oclif/table` instead of Ink. Doc was never updated.
2. **Deleted command listed as existing**: `build stack` subcommand was removed (stack compilation folded into `build plugins`), but the command table and the Command -> Component Imports table still referenced `commands/build/stack.tsx`.
3. **Deleted component listed as existing**: `components/skill-search/` was removed with the `search` rewrite, but the Command -> Component Imports table and `utils/string.ts` consumer table still listed it.
4. **Stale function names in direct-lib imports**: `init` was documented as importing `detectProjectInstallation`; actual code imports `detectInstallation` + `detectGlobalInstallation` + `loadProjectConfigFromDir`.
5. **Missing imports for recent features**: D-228 config-types-writer routing added `schemas`, `feature-flags` imports to `new/skill`, `new/agent`, `new/marketplace` that were undocumented. `doctor` gained `filterExcludedEntries` from `lib/agents`. `uninstall` gained `deregisterProjectPath`. `validate` grew a substantially wider import surface (plugins validators, schemas, schema-validator).
6. **Stale component-to-lib rows**: `info-panel.tsx` was listed importing `matrix` but actually imports `findStack`; `skill-agent-summary.tsx` import of `matrix` was undocumented entirely.

## Fix Applied

Rewrote drifted rows against actual source imports (grepped all 16 command files + all `components/` lib imports). Added observations 8-10 documenting D-228 config-types-writer cross-command usage, the removed `build stack` subcommand, and the `search` rewrite. Updated `last_validated` and DOCUMENTATION_MAP.md row.

## Proposed Standard

When a command or component is renamed, deleted, or has its import surface substantially changed (D-217/D-228/D-229-scale features), the developer/reviewer agent should grep `.ai-docs/reference/` for the old filename/function and flag any dependency graph rows for update in the same session. Adding a checklist item to `.ai-docs/standards/documentation-bible.md` "Doc-touching changes" section: _When deleting a command or component file, grep `.ai-docs/reference/dependency-graph.md` for its basename and remove/update referencing rows._ This would have caught all six classes of drift at merge time rather than 19 days later.
