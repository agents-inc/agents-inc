---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/installation/mode-migrator.ts
  - src/cli/commands/uninstall.tsx
standards_docs:
  - CLAUDE.md
date: 2026-04-22
reporting_agent: general-purpose
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

When the user switches a plugin-installed skill to `eject` source in the edit wizard's global-scope mode, `executeMigration()` in `src/cli/lib/installation/mode-migrator.ts` emits a spurious warning:

```
Warning: Could not uninstall plugin for web-framework-react:
Plugin uninstall failed: Plugin "web-framework-react" is enabled at project scope
(.claude/settings.json, shared with your team). To disable just for you:
claude plugin disable web-framework-react --scope local
```

Flow (inside `executeMigration`, lines ~122-140):

- `oldScope === "global"`, `newScope === "global"` (pure source change).
- Computes `pluginScope = migration.oldScope === "global" ? "user" : "project"` → `"user"`.
- Calls `claudePluginUninstall(id, "user", cwd=homedir)`.
- `resolvePluginCwd("user", homedir)` in `src/cli/utils/exec.ts` returns `homedir`, so `claude plugin uninstall --scope user` runs FROM `~`.
- Claude CLI, running from `~`, sees `~/.claude/settings.json` as ALSO being a "project" config (cwd has a `.claude/` directory). It reports the plugin as enabled at `project` scope and rejects the `--scope user` uninstall.

The skill ejects fine (local copy + config rewrite), but the user sees a confusing warning that claims project scope while they're actually in global scope.

Crucially, the analogous path in `src/cli/commands/uninstall.tsx` (lines 559-580) already handles this ambiguity by trying BOTH scopes back-to-back with per-call try/catch:

```ts
const primaryScope = skillConfig?.scope === "global" ? "user" : "project";
const fallbackScope = primaryScope === "project" ? "user" : "project";
try {
  await claudePluginUninstall(pluginName, primaryScope, projectDir);
} catch {}
try {
  await claudePluginUninstall(pluginName, fallbackScope, projectDir);
} catch {}
```

The mode-migrator does a single-scope attempt and surfaces the Claude CLI error to the user.

## Fix Applied

None — discovery only.

Proposed code change (one spot, `src/cli/lib/installation/mode-migrator.ts`, the uninstall loop at ~123-140):

Replace the single `claudePluginUninstall(..., pluginScope, projectDir)` call with the dual-scope best-effort pattern used by `uninstall.tsx`:

```ts
const primaryScope = migration.oldScope === "global" ? "user" : "project";
const fallbackScope = primaryScope === "project" ? "user" : "project";
let primarySucceeded = false;
try {
  await claudePluginUninstall(migration.id, primaryScope, projectDir);
  primarySucceeded = true;
} catch (error) {
  verbose(`Primary-scope uninstall failed for ${migration.id}: ${getErrorMessage(error)}`);
}
try {
  await claudePluginUninstall(migration.id, fallbackScope, projectDir);
} catch (error) {
  if (!primarySucceeded) {
    warnings.push(`Could not uninstall plugin for ${migration.id}: ${getErrorMessage(error)}`);
  }
}
```

Only warn when BOTH attempts fail. Suppresses the spurious warning in the home-dir ambiguity case while still surfacing genuine failures.

## Proposed Standard

Add a section to `.ai-docs/reference/features/plugin-system.md` (or `concepts/scope-system.md`) titled **"Plugin Uninstall Scope Ambiguity from Home Directory"** documenting:

1. Running `claude plugin uninstall --scope user` from `~` triggers a CLI-side ambiguity: `~/.claude/settings.json` is visible as BOTH user scope AND project scope (because cwd has `.claude/`). Claude CLI may refuse the `--scope user` uninstall claiming the plugin is at project scope.
2. Therefore: any code path that uninstalls a plugin in a context where `projectDir === os.homedir()` must attempt BOTH `user` and `project` scopes back-to-back (best-effort) and only warn if BOTH fail.
3. Canonical pattern: `src/cli/commands/uninstall.tsx` lines 559-580.
4. Call sites that must follow this pattern: `uninstall.tsx`, `mode-migrator.ts` (executeMigration), `migratePluginSkillScopes` (if it uninstalls), and any future plugin-uninstall consumer.

Cross-reference from CLAUDE.md's "Scope Awareness" NEVER list:

> NEVER uninstall a plugin with a single `--scope` attempt when `projectDir` may equal `os.homedir()` — the home-dir ambiguity (cwd has `.claude/`) makes Claude CLI report user-scope plugins as project-scope. Always try primary then fallback scope (see `commands/uninstall.tsx` for the canonical pattern).
