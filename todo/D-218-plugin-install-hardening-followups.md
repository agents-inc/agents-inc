# D-218 — Plugin-install pipeline hardening follow-ups

> **Status** (2026-04-20): Mixed. Item (2) landed 2026-04-17; items (1) and (3) open; audit surfaced three additional soft gaps. Recommend splitting into **D-218A** (high, data loss) and **D-218B** (low, UX polish) + optional **D-218C** (audit soft gaps).

## Cluster origin

Discovered during the `edit.tsx:442` silent-skip fix review (cli-reviewer, 2026-04-16). All items cluster around the same anti-pattern: **failable validation running AFTER irreversible filesystem mutation in the plugin-install pipeline**.

Fixed sibling template: `.ai-docs/agent-findings/2026-04-17-init-partial-state-on-plugin-hard-error.md` — `requireMarketplace` resolve-before-mutate pattern.

## Sub-items

### Item 1 — `mode-migrator.ts` data-loss ordering **(OPEN, high severity) → D-218A**

`executeMigration` in `src/cli/lib/installation/mode-migrator.ts` (`toPlugin` branch):

1. Loops over `plan.toPlugin` calling `deleteLocalSkill` for each skill (unconditional FS deletion).
2. Only THEN checks `sourceResult.marketplace`.
3. If absent: pushes a warning (`"No marketplace configured — ... Skills deleted but not plugin-installed"`) and returns successfully.
4. Even when marketplace present, per-skill `claudePluginInstall` failures are caught and demoted to warnings (`warnings.push(...)`) — the silent plugin→warn fallback explicitly forbidden by `feedback_no_plugin_to_eject_fallback.md`.

**Data loss scenarios** (all produce permanent, silent loss):

- No marketplace configured → skills deleted, config says plugin, nothing installed.
- Partial migration (N-th skill fails mid-loop) → skills 1..N-1 installed, N+ deleted-and-config-says-plugin.
- Transient network error → transient failure becomes permanent loss. No retry.
- User kills mid-migration (SIGINT) → no signal handler, no journal.
- Permissions issue on `~/.claude/plugins/cache/` → EACCES caught generically, demoted to warning.

Symmetric issue in `toEject` branch: copy failure currently caught as generic warning, leaving config pointing at `eject` with no local copy.

**Fix direction (D-218A)**:

Mirror the `requireMarketplace` pattern from item 2. `executeMigration` is a pure lib function (no `this.error`), so push the check UP:

1. In `edit.tsx::applyMigrations` (the caller), invoke `requireMarketplace(sourceResult, "migrate skills to plugin")` BEFORE calling `executeMigration`.
2. Change `executeMigration`'s signature to require a non-null `marketplace: string` parameter (removes the type-level possibility of the failure branch).
3. Remove the `else` warning block (`mode-migrator.ts:173-177`) — replace with thrown error or make the branch unreachable by parameter typing.
4. Replace the per-skill `catch → warnings.push` in the install loop with a throw that aborts the batch. Optionally stage-then-delete: move locals to a scope-appropriate trash dir; delete only after all plugins install successfully.

### Item 2 — `init.tsx::handleInstallation` plugin hard-error partial state **(FIXED 2026-04-17)**

`requireMarketplace` helper added to `init.tsx`. Marketplace resolved eagerly at top of `handleInstallation` before any FS mutation when `pluginSkills.length > 0`. E2E guard: `e2e/lifecycle/init-plugin-marketplace-fail.e2e.test.ts` — asserts exit code, error message, empty `.claude/skills/`, absent success banner. Finding: `.ai-docs/agent-findings/2026-04-17-init-partial-state-on-plugin-hard-error.md`.

Verified still passing 2026-04-20.

### Item 3 — `ensure-marketplace.ts:43` unwrapped `claudePluginMarketplaceAdd` **(OPEN, low severity) → D-218B**

`src/cli/lib/operations/source/ensure-marketplace.ts` line 43 calls `claudePluginMarketplaceAdd(marketplaceSource)` bare. The underlying `exec.ts::claudePluginMarketplaceAdd` wraps SPAWN and non-zero-exit errors already (`"Failed to add marketplace: <msg>"`), but the validation-throw path (invalid chars, empty source, too long) propagates raw, and the call site adds no operation-level context.

**Fix direction (D-218B)** — matches the pattern at `exec.ts:207-211, 227-231, 247-251`:

```ts
try {
  await claudePluginMarketplaceAdd(marketplaceSource);
} catch (err) {
  throw new Error(`Failed to register marketplace "${marketplace}": ${getErrorMessage(err)}`);
}
```

4-line change + one import. Do NOT wrap both call sites (L43 Add and L48 Update) in one outer try — semantics differ (Update failure is recoverable, Add is not).

### Additional soft gaps surfaced by 2026-04-20 audit **(optional D-218C)**

1. **Per-skill install failures exit 0 with only warnings** — `init.tsx::installPluginsStep` and `migratePluginSkillScopes` accumulate a `failed[]` and emit `this.warn(...)`. A run where every plugin install fails shows "Installed 0 skill plugins" with exit 0. Consider: at end of loop, if `installed.length === 0 && failed.length > 0`, hard-error.
2. **Scope-migration partial state** — `migratePluginSkillScopes` uninstalls project scope before the new-scope install. If install throws, skill is unregistered at both scopes. Either wrap in transaction/rollback, or install-then-uninstall.
3. **`requireMarketplace` duplication** — identical method in `init.tsx` and `edit.tsx`. The 2026-04-17 finding explicitly says duplication is cheaper than extraction because `this.error` is instance-bound. Keep as-is unless a third command grows the same need.

## Test strategy

**Unit (`mode-migrator.test.ts`)** — replace existing `should warn when no marketplace configured for plugin migration` (which encodes the bug as correct). New test: seed real eject file on disk, plan with `toPlugin` entry, no marketplace → assert hard-error thrown AND `existsSync(ejectPath) === true`. Global-scope variant via `$HOME` override.

**Unit (`ensure-marketplace.test.ts`)** — mirror existing `should warn when marketplace update fails` (line 83). New test: `mockMarketplaceAdd.mockRejectedValue(new Error("raw ..."))` → `expect(ensureMarketplace(...)).rejects.toThrow(/Failed to register marketplace/)` + assert no stack frames in the user-visible message.

**E2E (`e2e/lifecycle/migrate-plugin-marketplace-fail.e2e.test.ts`)** — new file, mirror `init-plugin-marketplace-fail.e2e.test.ts`:
- `ProjectBuilder.ejectProject({ skills: [...] })` → seeds real eject copies.
- Launch `EditWizard` with source lacking marketplace.
- Toggle skill source `"eject"` → plugin marketplace name.
- Snapshot `.claude/skills/` before.
- `confirm.confirmExpectingExit()` → assert `EXIT_CODES.ERROR`.
- Assert output names the skill + `"marketplace could not be resolved"`.
- Assert eject copies survive: strict file-tree equality before/after.

## Scope

- `src/cli/lib/installation/mode-migrator.ts` (item 1)
- `src/cli/commands/edit.tsx::applyMigrations` (item 1 caller — add `requireMarketplace` call)
- `src/cli/lib/operations/source/ensure-marketplace.ts` (item 3)
- Tests: `mode-migrator.test.ts`, `ensure-marketplace.test.ts`, new E2E.

## Non-goals

- No redesign of the migration pipeline.
- No change to `SkillConfig.source` / `mode` field shape.
- No retrofit of other `claudePlugin*` callers outside the two cited files — audit is D-218C, separate.
- No `requireMarketplace` extraction — kept duplicated intentionally (per the 2026-04-17 finding).

## Related

- `.ai-docs/agent-findings/2026-04-17-init-partial-state-on-plugin-hard-error.md` (item 2 fix + pattern template)
- `feedback_no_plugin_to_eject_fallback.md` (standard item 1 violates)
- D-216 (global config propagation — adjacent install path)
- D-217 (plugin skill reference format)
