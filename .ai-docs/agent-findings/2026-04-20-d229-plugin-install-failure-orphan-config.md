---
type: anti-pattern
severity: high
affected_files:
  - src/cli/commands/init.tsx
  - src/cli/commands/edit.tsx
standards_docs:
  - /home/vince/.claude/projects/-home-vince-dev-cli/memory/feedback_no_plugin_to_eject_fallback.md
date: 2026-04-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: 0.141.0 — both `init.tsx::installPluginsStep` (line 418) and `edit.tsx::applyPluginChanges` (line 482) now `this.error()` after per-skill warnings when `pluginResult.failed.length > 0`, before `writeConfigAndCompile` can write orphan entries.
---

## What Was Wrong

The partial-state prevention work landed in findings `2026-04-16-silent-plugin-install-skip-on-missing-marketplace.md` and `2026-04-17-init-partial-state-on-plugin-hard-error.md` closed two doors: silent plugin→eject fallbacks, and partial-filesystem state when marketplace resolution fails.

A third door remained open: when `ensureMarketplace` resolves successfully but `installPluginSkills` returns one or more entries in `failed` (per-skill `claude plugin install` rejections), both `init.tsx::installPluginsStep` and `edit.tsx::applyPluginChanges` emitted a `this.warn()` per failed skill and then silently continued. `writeConfigAndCompile` then wrote `config.ts` entries claiming `source: "<marketplace>"` for skills that had never actually been installed into `settings.json`. Users saw:

```
Failed to install plugin X: Plugin X not found in marketplace
Generating configuration...
Configuration saved
```

and were left with a `config.ts` that lied about installation state. The `install` command on the same project would not detect a gap — `detectInstallation` uses `config.ts` as the source of truth.

This is the per-skill equivalent of the silent-skip rule already enforced at the marketplace-resolution boundary. Plugin install intent is inviolable: if a user asked for plugin install and claude CLI said "no", we must not persist config claiming "yes".

## Fix Applied

### `init.tsx::installPluginsStep`

After the existing per-skill `this.warn()` loop, added a tail check:

```ts
if (pluginResult.failed.length > 0) {
  this.error(
    `Failed to install ${pluginResult.failed.length} plugin skill(s). Plugin install intent could not be honored. Verify the skill id matches the marketplace, re-run with --refresh to update the marketplace, or switch affected skills to eject mode.`,
    { exit: EXIT_CODES.ERROR },
  );
}
```

This fires before `writeConfigAndCompile`, so no orphan entries are written. In mixed mode, `copyEjectSkillsStep` has already run at this point — but those copies correspond to the user's eject-mode intent and are separately recoverable (unlike a `config.ts` that lies about plugin state).

### `edit.tsx::applyPluginChanges`

Same pattern appended to the `addedPluginSkills` branch (only the install arm — uninstall failures are diagnostic-only and don't produce orphan config).

### E2E coverage

Added `e2e/lifecycle/plugin-install-failure-hard-error.e2e.test.ts`. Uses `createE2EPluginSource()` to get a real registered marketplace, then overwrites `.claude-plugin/marketplace.json` with a schema-valid but skill-empty plugin list (one placeholder entry to satisfy the `min(1)` constraint). Runs the default init flow so all skills are plugin-intent; claude CLI rejects each ref because none are in the overwritten marketplace. Asserts:

- `exitCode === EXIT_CODES.ERROR`
- Output contains the remediation hint phrase and the failing skill id
- `.claude-src/config.ts` does NOT exist on disk (the orphan-write check)

The suite is gated by `describe.skipIf(!claudeAvailable)` because the scenario requires a real `claude plugin install` rejection.

## Why `this.error` is duplicated across `init.tsx` and `edit.tsx`

Identical ~8-line blocks appear in both commands. `this.error` is instance-bound to the oclif `Command` subclass, so lifting the error call into a shared helper would require passing the command instance through or re-throwing. The duplication is cheaper than the indirection, matching the existing `requireMarketplace` precedent (also duplicated for the same reason — see the 2026-04-17 finding).

## Proposed Standard

Add to CLAUDE.md's "Data Integrity" section (consolidating with existing no-silent-skip rule):

> **Plugin install operations that report per-skill failures MUST hard-error before `writeConfigAndCompile` writes `config.ts`.** The `failed` array from `installPluginSkills` reflects rejections by `claude plugin install`; persisting config entries for those skills produces an orphan install record that no `cc` command can self-heal. Emit the per-skill diagnostic warnings for user context, then `this.error(..., { exit: EXIT_CODES.ERROR })` if any entries failed. Uninstall failures are diagnostic-only — they don't produce orphan state.
