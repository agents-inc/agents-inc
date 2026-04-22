---
type: anti-pattern
severity: high
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/commands/init.tsx
  - src/cli/lib/installation/mode-migrator.ts
standards_docs:
  - /home/vince/.claude/projects/-home-vince-dev-cli/memory/feedback_no_plugin_to_eject_fallback.md
date: 2026-04-16
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: requireMarketplace helper in edit.tsx + init.tsx hard-errors on missing marketplace
---

## What Was Wrong

Three commands silently altered or skipped plugin-install behavior when `sourceResult.marketplace` was unresolved:

1. **`edit.tsx` `applyPluginChanges`** wrapped the entire plugin install/uninstall block in `if (context.sourceResult.marketplace) { ... }`. When marketplace was undefined — which happens whenever a project's saved `config.ts` lacks a `marketplace:` field — the whole block was skipped. New plugin-sourced skills landed in `config.ts` but `claude plugin install` was never invoked, so `~/.claude/settings.json` and `<project>/.claude/settings.json` `enabledPlugins` were not updated. The user believed skills were installed when they weren't. The gate used the wrong signal: the project-level marketplace string rather than the per-skill `source` intent.

2. **`edit.tsx` `applyScopeChanges`** had the same pattern at the plugin-scope migration branch — silent skip of plugin scope migrations when marketplace was unresolved.

3. **`init.tsx` `installPluginsStep`** had an even worse pattern: when `ensureMarketplace` returned `{ marketplace: null }`, it emitted a warning and **silently copied the plugin-intended skills as local eject copies** — a direct violation of the user's plugin install intent.

## Fix Applied

### edit.tsx

- Introduced a private `requireMarketplace(sourceResult, purpose)` helper that calls `ensureMarketplace` and hard-errors via `this.error(..., { exit: EXIT_CODES.ERROR })` when marketplace resolution returns `null`.
- `applyPluginChanges` now computes `addedPluginSkills` and `removedPluginSkills` up front (per-skill intent via `source !== "eject"`), skips the whole method when both are empty, and only invokes `requireMarketplace` when plugin work is actually needed.
- `applyScopeChanges` now computes `hasPluginScopeChanges` first and only invokes `requireMarketplace` when needed.
- `removedSkills` previously passed all removed IDs unfiltered to `uninstallPluginSkills`. It's now filtered to `removedPluginSkills` (skills whose OLD entry had `source !== "eject"`), respecting per-skill install intent.

### init.tsx

- Replaced the plugin → eject silent fallback in `installPluginsStep` with a hard `this.error(..., { exit: EXIT_CODES.ERROR })`. Removed the now-unused `allSkills` parameter and fixed the single caller.

### mode-migrator.ts

- **NOT changed.** `executeMigration` currently emits a warning (not a silent skip) when marketplace is missing for plugin migrations. Changing this is out of scope per the task ("Don't widen scope — just verify") and would break the library-function contract. Flagged here as remaining work — the same "hard error, not silent mode-switch" rule should eventually apply, either by having callers resolve marketplace before calling `executeMigration` or by having `executeMigration` throw.

## Proposed Standard

Add to CLAUDE.md's "Data Integrity" section:

> **NEVER silently skip or substitute plugin-install operations when `marketplace` is unresolved.** Plugin install intent is inviolable — the per-skill `source` field drives install mode, not a project-level truthiness check. If marketplace resolution fails and any skill has `source !== "eject"`, throw a hard error with `EXIT_CODES.ERROR` explaining that the source cannot provide a marketplace. See `feedback_no_plugin_to_eject_fallback.md` in user memory.

Also update `.ai-docs/reference/commands/edit.md` step 10 to document the new `requireMarketplace` helper and the per-skill plugin-intent computation.
