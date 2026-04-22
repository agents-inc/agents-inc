---
type: anti-pattern
severity: high
affected_files:
  - src/cli/commands/init.tsx
standards_docs:
  - /home/vince/.claude/projects/-home-vince-dev-cli/memory/feedback_no_plugin_to_eject_fallback.md
date: 2026-04-17
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: resolved
resolved_by: requireMarketplace pre-resolves before copyEjectSkillsStep; e2e coverage added
---

## What Was Wrong

`init.tsx::handleInstallation` orders steps as:

1. `copyEjectSkillsStep` — copies all `source: "eject"` skills to `.claude/skills/` and/or `~/.claude/skills/` (mutates filesystem).
2. `installPluginsStep` — only then resolves marketplace; hard-errors via `this.error(…, { exit: EXIT_CODES.ERROR })` on failure.
3. `writeConfigAndCompile` — writes `config.ts`, compiles agents.

When `installMode === "mixed"` and marketplace resolution fails, step 2 throws before step 3. Filesystem now contains eject-copied skills at `.claude/skills/<skill>/` (and possibly `~/.claude/skills/<skill>/` for global-scoped ones) with **no `config.ts`, no `config-types.ts`, and no compiled agents**. The user sees an error and a half-populated project directory that none of our commands will recognise as an installation (`detectInstallation` keys off the config).

Subsequent re-run of `cc init` will walk through `showDashboardIfInitialized` → returns false (no config) → runs the wizard from scratch, potentially diverging from the partially-copied skills on disk. `copyLocalSkills` → `copySkillsToLocalFlattened` will clobber/overwrite, but any user edits made to the stale copies are lost without warning.

The uncommitted change introduced this hazard by converting a warn-and-fallback into a hard exit. The prior behaviour was itself an anti-pattern (silent plugin→eject substitution — finding `2026-04-16-silent-plugin-install-skip-on-missing-marketplace.md`), so the fix direction is correct, but the partial-state window is new.

## Fix Applied

### init.tsx

- Added a private `requireMarketplace(sourceResult, purpose)` helper mirroring the one in `edit.tsx`. Calls `ensureMarketplace` and hard-errors via `this.error(..., { exit: EXIT_CODES.ERROR })` when resolution returns `null`. Also emits the "Registering marketplace" log line when `mpResult.registered` is true, consolidating what used to live inside `installPluginsStep`.
- In `handleInstallation`, marketplace resolution now runs BEFORE any filesystem mutation: immediately after `logInstallPlan`, when `pluginSkills.length > 0`, call `requireMarketplace` and store the resolved marketplace string in `resolvedMarketplace`. The `copyEjectSkillsStep` call continues to run for `eject`/`mixed` mode, but only after the marketplace check has passed.
- `installPluginsStep` simplified to take the already-resolved `marketplace: string` directly. Dropped the internal `ensureMarketplace` call, the `sourceResult`/`installMode`/`copiedSkills` parameters, and the `{ copiedSkills, installMode, succeeded }` return shape. The caller tracks `pluginModeSucceeded` locally.
- `installMode` is now `const` (was `let`) — nothing mutates it. The `installMode` local passed to `writeConfigAndCompile`/`reportSuccess` is the value derived from `deriveInstallMode` up front.

### edit.tsx

- Not changed. The existing `requireMarketplace` helper on `Edit` was the inspiration for the `Init` helper; duplicating the ~15-line helper is cheaper than lifting it to a shared module (both helpers call `this.error()` which is bound to the oclif `Command` instance).

### E2E coverage

- Added `e2e/lifecycle/init-plugin-marketplace-fail.e2e.test.ts`. Runs `cc init --source <localSource>` against a source with no `.claude-plugin/marketplace.json`, toggles one skill source to local so `installMode === "mixed"`, and asserts:
  - Exit code is `EXIT_CODES.ERROR`.
  - Output contains `"marketplace could not be resolved"` and the source path.
  - `.claude/skills/` is empty via `toHaveNoLocalSkills()` — the regression assertion. Pre-fix, `web-framework-react` was copied there before the hard-error fired.
  - Output does NOT contain `"Skills copied to:"` (the success banner must never appear).

No Claude CLI required for this scenario — `fetchMarketplace` fails locally before any `claudePluginMarketplaceExists` call.

## Proposed Standard

**Mutating-step ordering rule** (add to `.ai-docs/standards/…` or CLAUDE.md "Data Integrity"):

> Commands MUST perform all failable resolution/validation BEFORE any filesystem mutation. Specifically: resolve and validate marketplace availability in `installMode === "mixed"` before `copyEjectSkillsStep` runs. If the command does mutate before a failable step, it MUST either (a) roll back on failure, or (b) be structured so re-running the command detects and recovers the partial state idempotently.

Concrete options for `init.tsx`:

1. Pre-resolve marketplace at the top of `handleInstallation` (immediately after `logInstallPlan`) when `installMode !== "eject"`. Hard-error there, before `copyEjectSkillsStep`. This matches the spirit of `edit.tsx::requireMarketplace` — resolve early when the intent is known, defer the actual call.
2. Swap order: `installPluginsStep` before `copyEjectSkillsStep`. Plugin install via `claude plugin install` is idempotent (per `ensureMarketplace` semantics); eject copies are not.
3. On hard-error in `installPluginsStep`, delete any just-copied eject skill directories before exiting (rollback).

Option 1 is the least invasive and matches the resolve-early pattern already in `edit.tsx`. It also removes the need for `installPluginsStep` to re-call `ensureMarketplace` — pass the resolved marketplace in as a parameter.
