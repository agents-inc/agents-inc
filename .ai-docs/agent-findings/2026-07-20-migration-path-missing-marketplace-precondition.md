---
type: anti-pattern
severity: high
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/lib/installation/mode-migrator.ts
  - e2e/interactive/edit-wizard-plugin-migration.e2e.test.ts
standards_docs:
  - .ai-docs/reference/features/operations-layer.md
date: 2026-07-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
---

## What Was Wrong

Two defects on the same code path, the second hidden by the first.

**1. A failed plugin install during an eject→plugin migration was downgraded to a warning.**
`executeMigration` deleted the ejected working copy of every `toPlugin` skill first, then
tried to install each plugin, pushing a string into `warnings` on failure. `edit`'s
`applyMigrations` only re-emitted those warnings, so the command continued and
`writeConfigAndCompile` persisted `source: "<marketplace>"` for a skill that was deleted
from disk and never installed. This is the same orphan-config class already fixed for
newly-added skills (`applyPluginChanges`) and for the no-marketplace case — the residual
per-skill case was missed both times.

**2. The migration path never established the marketplace precondition.**
Every other plugin-install path (`init.installPluginsStep`, `edit.applyPluginChanges`,
`edit.applyScopeChanges`) resolves the marketplace through `requireMarketplaceOrExit` →
`ensureMarketplace`, which **registers or updates** the marketplace with the Claude CLI.
`applyMigrations` was the sole exception: it read `sourceResult.marketplace` raw and handed
it to `executeMigration`, so `claude plugin install` ran against an unregistered or stale
local copy and rejected every ref ("Plugin not found in marketplace … your local copy may
be out of date").

Defect 2 was invisible because of defect 1. `edit-wizard-plugin-migration.e2e.test.ts`
("mode migration local -> plugin") was green while the plugin install failed on every run:
it asserted exit code SUCCESS and that config.ts records `source: <marketplaceName>`, but
never asserted the plugin exists in the registry. The test therefore certified exactly the
orphan-config state the rule forbids. Fixing defect 1 turned that test red, which is what
surfaced defect 2.

## Fix Applied

- `MigrationResult` gained `failedPluginInstalls: Array<{ id, error }>`, mirroring
  `PluginInstallResult["failed"]` (declared inline — lib must not statically import the
  operations layer, per `2026-07-19-installer-consuming-operations-layer-cycle.md`).
- `executeMigration` now installs FIRST and deletes the ejected working copy only after
  that skill's install succeeds, so a failed install destroys nothing. Install failures are
  reported structurally instead of as warning strings.
- `edit.applyMigrations` warns per failed skill and then hard-errors with
  `pluginInstallFailureError(...)` + `EXIT_CODES.ERROR`, byte-identical to the
  `applyPluginChanges` guard, before `recordGlobalSourceMigrations` or
  `writeConfigAndCompile` can write anything.
- `edit.applyMigrations` calls `requireMarketplaceOrExit` when `toPlugin` is non-empty,
  before `executeMigration`. Eject-side plugin uninstalls stay diagnostic-only, so only
  install work demands it.

After the fix the E2E migration test passes in ~6s (previously it hung to a 30s timeout at
the confirm step) because the install now genuinely succeeds.

## Proposed Standard

Two rules worth writing down:

1. **Every path that calls `claudePluginInstall` must first establish the marketplace via
   `requireMarketplaceOrExit`/`ensureMarketplace`.** Passing a raw `sourceResult.marketplace`
   into an install is a bug: the name may be resolvable while the Claude CLI's copy is
   unregistered or stale. Document alongside the "plugin install intent is inviolable" note
   in `reference/features/operations-layer.md`.

2. **A test that asserts config state after a plugin operation must also assert the
   operation actually happened** (plugin present in the registry, or at minimum that no
   install-failure line was emitted). Asserting only "config.ts says `source: <marketplace>`"
   cannot distinguish a real install from the orphan-entry bug, and will keep a broken path
   green. Belongs in `.ai-docs/standards/e2e/anti-patterns.md`, and generalizes the existing
   "verify config AND filesystem" rule in CLAUDE.md to "verify config AND the external
   effect it claims".

`e2e/interactive/edit-wizard-plugin-migration.e2e.test.ts` still only checks config; it is
now backed by a real install but would not catch a regression to silent-failure on its own.
Strengthening it (assert the plugin is registered, or that stdout has no
"Failed to install plugin") is owned by the E2E agent.
