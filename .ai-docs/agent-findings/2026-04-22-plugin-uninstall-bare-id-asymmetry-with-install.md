---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/installation/mode-migrator.ts
  - src/cli/commands/edit.tsx
  - src/cli/commands/uninstall.tsx
  - src/cli/lib/operations/skills/uninstall-plugin-skills.ts
  - src/cli/utils/exec.ts
standards_docs:
  - .ai-docs/reference/features/plugin-system.md
date: 2026-04-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
---

## What Was Wrong

`claudePluginInstall` is invariably called with a qualified plugin reference — `${skillId}@${marketplace}` — because that is the form the Claude plugin registry uses. `claudePluginUninstall`, however, had four call sites (three unambiguous bugs, one via a best-effort pattern) that passed a bare `skillId` instead. Since the registry key is the qualified ref, bare-id uninstalls silently no-op ("not installed" is swallowed), leaving orphaned plugin registrations after migrations, scope changes, and edit-time removals.

Affected sites before the fix:

1. `mode-migrator.ts:133` (`executeMigration`, toEject branch) — `claudePluginUninstall(migration.id, ...)`
2. `edit.tsx:778` (`migratePluginSkillScopes`, project→global) — `claudePluginUninstall(skillId, ...)` even though a `pluginRef` constant was already in scope one line above
3. `uninstall-plugin-skills.ts:26` (`uninstallPluginSkills` operation) — `claudePluginUninstall(skillId, ...)` with no marketplace parameter threaded through the function at all
4. `uninstall.tsx:568,576` — already-qualified `pluginName` (good), but the dual-scope best-effort pattern was inlined twice identically to `mode-migrator.ts`'s intent, screaming for extraction

The asymmetry was not caught by typing because both functions accept `pluginName: string`. It was not caught by tests because the `.mock.calls` assertions faithfully recorded the bare IDs — the tests passed while the product leaked orphans.

## Fix Applied

- Added shared helper `claudePluginUninstallBestEffort(pluginRef, primaryScope, projectDir)` in `src/cli/utils/exec.ts`, adjacent to `claudePluginUninstall`. Encapsulates the try-primary-then-fallback-scope pattern, swallows errors on each attempt, and documents in its JSDoc that the ref must be qualified.
- `mode-migrator.ts`: qualified `pluginRef = ${migration.id}@${sourceResult.marketplace}`; routed through the new helper (scope is genuinely ambiguous here — re-scoped plugins may not match the config's stated scope). Added an explicit warning path when `sourceResult.marketplace` is missing for toEject, mirroring the existing pattern for toPlugin; no silent fallback.
- `edit.tsx` (`migratePluginSkillScopes`): narrow fix — swapped bare `skillId` to the `pluginRef` constant already defined on the preceding line. Deliberately kept the outer try/catch and the existing "uninstall fails → skip install" safety semantics; did NOT adopt the best-effort helper here because the `from` scope is known precisely.
- `uninstall.tsx` (`uninstallPlugins`): replaced the inlined dual-try block with one call to the shared helper.
- `uninstall-plugin-skills.ts`: added `marketplace: string` parameter; constructs `${skillId}@${marketplace}` before calling `claudePluginUninstall`. Caller in `edit.tsx:491` already had `marketplace` in scope (resolved upstream by `requireMarketplace`).
- Updated test assertions in `mode-migrator.test.ts`, `edit.test.ts`, `uninstall.test.ts`, and `uninstall-plugin-skills.test.ts` to match the qualified-ref form and the new helper surface. No test logic, names, or setup changed — only asserted values and the one mock target in `uninstall.test.ts` (now the helper instead of the underlying primitive).

## Proposed Standard

Add a section to `.ai-docs/reference/features/plugin-system.md` titled **"Plugin Reference Form"** stating:

> Every call to `claudePluginInstall` and `claudePluginUninstall` MUST pass a qualified plugin reference of the form `${skillId}@${marketplace}`. Bare skill IDs will not match the Claude plugin registry and will silently no-op on uninstall. If a function needs to uninstall a plugin, `marketplace` is a required input — thread it through the signature rather than defaulting it.

Consider tightening the `exec.ts` signatures by introducing a branded `PluginRef` string type (`type PluginRef = string & { readonly __pluginRef: unique symbol }`) constructed only by a `toPluginRef(skillId, marketplace)` helper. Install/uninstall would then accept `PluginRef` instead of `string`, making the four bugs above impossible to reintroduce. Left as a follow-up because it touches the whole install/uninstall surface.

In parallel, every new or refactored callsite that performs a plugin uninstall with ambiguous scope (config scope may not match the registry entry — re-scoped plugins, cleanup paths) should use `claudePluginUninstallBestEffort` from `src/cli/utils/exec.ts`, not inline two try-blocks.
