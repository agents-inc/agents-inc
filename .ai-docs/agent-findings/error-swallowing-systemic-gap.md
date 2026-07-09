---
type: anti-pattern
severity: high
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/lib/installation/mode-migrator.ts
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/configuration/config-writer.ts
standards_docs:
  - CLAUDE.md
date: 2026-04-22
reporting_agent: file-search-specialist
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

The codebase contains a systemic pattern of silent error swallowing on disk-write and plugin-registry operations. When these operations fail, errors are surfaced via `warn()` or `verbose()` logging, but code continues executing, allowing subsequent operations to write inconsistent state.

**Specific instances discovered:**

1. **edit.tsx:573-574** (Bug 4, the known issue): `writeProjectConfig` failure caught and warned, but execution continues. If config write fails after plugins are installed and migrations applied, the plugin registry diverges from config.ts.

2. **mode-migrator.ts:145-147 & 173-175**: Skill migration (plugin→eject or eject→plugin) failures return warnings in a structured array, but the calling code (`edit.tsx:341-378`) only logs these warnings. If ANY per-skill migration fails, `writeProjectConfig` still writes config entries claiming those skills migrated successfully.

3. **edit.tsx:639-641**: Agent compilation failure only warns; subsequent code completes normally, leaving agents partially compiled.

4. **local-installer.ts:730-735**: Per-project propagation failure in `propagateGlobalChangesToProjects` only logs verbosely; global config write already succeeded, leaving registered projects with stale configs.

**Root cause:** The CLAUDE.md rule at line 45 explicitly forbids this pattern for plugin installs ("NEVER let plugin install per-skill failures silently produce orphan config entries"), and `edit.tsx:482-487` correctly implements hard-error for plugin installs. However, the rule is not specific enough about **when** to apply it — it doesn't cover:

- Migration failures (which must also hard-error BEFORE config write)
- Plugin scope changes (which should behave like installs)
- Propagation to other projects (needs decision: fail-fast or partial success)

## Fix Applied

None — discovery only.

## Proposed Standard

**Update CLAUDE.md § Data Integrity to clarify:**

```
- NEVER let ANY disk-write or plugin-registry operation failure on the critical path silently continue:
  - Plugin install/uninstall on skills being ADDED/REMOVED → hard-error (already enforced)
  - Skill migration (plugin↔eject mode) failures → hard-error BEFORE writeProjectConfig
  - Plugin scope changes (via migratePluginSkillScopes) → return { failed: [...] } to caller; hard-error if non-empty
  - Config file writes (writeProjectConfig, writeConfigFile) → hard-error (not warn)
  - Agent compilation on first init/edit → hard-error (not warn)
  - Exception: Uninstall-only failures and agent cleanup (cosmetic) remain diagnostic-only.
  - Exception: Propagation to OTHER projects may partially succeed; return { updated, skipped } structured result for caller visibility.
```

**Add new section "Error Handling Boundaries":**

> When a command chains multiple disk mutations (copy skills → install plugins → write config → compile agents), each step MUST propagate failure status to the next step. If step N fails after step N-1 writes state, the command exits with error, leaving the user with explicit "state may be inconsistent; manual review required" guidance, not silent state drift.

**Reference:** This prevents the class of bugs like Bug 4, T3, T4 where three-way divergence (plugin registry / config.ts / .claude/agents/) occurs silently.
