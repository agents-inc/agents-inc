---
type: convention-drift
severity: medium
affected_files:
  - .ai-docs/reference/boundary-map.md
standards_docs:
  - .ai-docs/standards/documentation-bible.md
date: 2026-04-21
reporting_agent: codex-keeper
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: boundary-map.md updated (search.ts rename, D-228 writer split, D-217 source-propagation section, Key Files table refresh, last_validated bump)
---

## What Was Wrong

`reference/boundary-map.md` (last_validated 2026-04-02, 19 days stale) had three drift classes missing after major D-2xx feature work:

1. **Filename drift**: Section 1.3 Per-Command Flag Definitions listed `commands/search.tsx` with flags `--interactive --category --refresh --json`. Actual source is `commands/search.ts` with one required positional `query` arg and `baseFlags = {}` (inherits nothing from `BaseCommand`). The rewrite to `@oclif/table` happened in a prior release but boundary-map was never updated.

2. **Missing writer selection boundary (D-228)**: Section 3.2 Config Types Writer listed only `writeStandaloneConfigTypes()` as writing to `.claude-src/config-types.ts` for both project and global paths. After D-228, project-path writes MUST go through `regenerateConfigTypes()` (in `configuration/config-types-writer.ts`) which emits `import type { SkillId as GlobalSkillId, ... } from "<relpath>/config-types"` when a global install exists. `writeStandaloneConfigTypes()` is now global-path only. The two are distinct trust-boundary operations with different outputs (inlined unions vs import-from-global), and they were collapsed into one row.

3. **Missing per-skill source propagation boundary (D-217)**: No section covered the `SkillConfig.source` -> `derivePluginRef()` decision boundary in `stacks/stack-plugin-compiler.ts`. This is the data-OUT boundary that decides whether a compiled agent references a skill as `${id}:${id}` (plugin) or bare id (eject/local). The contract ("undefined and 'eject' both fall through to bare id; there is no agent-level installMode override") is authoritative for plugin vs eject routing across the compiler.

## Fix Applied

- Renamed `commands/search.tsx` → `commands/search.ts` in Section 1.3; replaced flags cell with `query` (positional, required); `baseFlags = {}` (inherits none).
- Rewrote Section 3.2 Config Types Writer as 6-row table distinguishing project-path (`regenerateConfigTypes`, `generateProjectConfigTypesSource`) vs global-path (`writeStandaloneConfigTypes`, `generateConfigTypesSource`) writers, plus the background data loader. Added bold "Writer Selection Rule (D-228)" paragraph that matches the rule in the D-228 finding.
- Added `propagateGlobalChangesToProjects()` row to Section 3.4 Local Installer (re-writes registered projects' config-types via the project-path writer).
- Added new Section 3.6 Per-Skill Source Propagation (D-217) documenting `derivePluginRef` contract, `SkillConfig.source` authoritativeness, and the no-agent-level-installMode invariant. Renumbered old 3.6 Skill Metadata Injection -> 3.7.
- Updated Key Files table at top to add `config-types-writer.ts`, `local-installer.ts`, `stack-plugin-compiler.ts`.
- Updated front-matter `last_validated` + header `Last Updated` to 2026-04-21.

## Proposed Standard

Add to `.ai-docs/standards/documentation-bible.md` "Doc-touching changes" section: when a D-feature introduces a new trust-boundary operation (read/write/exec) or changes an existing one, the developer/reviewer agent must grep `.ai-docs/reference/boundary-map.md` for any existing rows that touch the same file/function and either update them in the same session OR add a `NEEDS-VALIDATION` annotation to the boundary-map DOCUMENTATION_MAP entry. This would have caught the D-217 and D-228 boundaries at feature-ship time rather than 19 days later.

A specific enforcement hook: when a finding document references `config-types-writer.ts` or `stack-plugin-compiler.ts` (the files added in the Key Files table this iter), require a boundary-map revalidation note before the finding is closed.
