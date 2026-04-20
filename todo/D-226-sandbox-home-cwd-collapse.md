# D-226 — E2E sandbox HOME collapses onto `projectDir`, silently forcing `isEditingFromGlobalScope=true`

> **Origin**: discovered 2026-04-20 while fixing a D-220 E2E (`stack-per-agent-curation.e2e.test.ts`) that could never have passed the newly-selected-agent scenario. Scope toggle was rejected at runtime with toast "Scope toggle unavailable in global context". Localized test-side workaround landed (manual second tempdir + `env.HOME`); this plan is the proper fix.

## Problem statement

The E2E harness defaults `HOME = cwd` (`e2e/helpers/terminal-session.ts:56`, same in `test-utils.ts:114`). The product computes:

```
GLOBAL_INSTALL_ROOT = os.homedir()               // src/cli/consts.ts:23
isGlobalDir = cwd === GLOBAL_INSTALL_ROOT        // src/cli/commands/edit.tsx:222, init.tsx:179
isEditingFromGlobalScope = isGlobalDir           // hydrated into wizard store
```

When `HOME === cwd === projectDir`, `os.homedir() === cwd`, so every `cc edit` / `cc init` launched through a `TerminalSession` without an explicit `env.HOME` override silently flips into "editing-from-global-scope" mode. Consequences:

- Scope toggles (`s` hotkey) are rejected (`wizard-store.ts:957, 1131`) with a toast.
- Scope hotkey is hidden from the footer (`wizard-layout.tsx:197`).
- Config writes intended for project scope land at `$HOME/.claude-src/config.ts` — which equals `$projectDir/.claude-src/config.ts`, so `toHaveConfig({ dir: projectDir })` silently asserts against a global-scope-written file while the test claims to be exercising project scope.
- Tombstones (D-223/D-224), scope indicators, P/G toggles, and global-vs-project config isolation cannot be meaningfully tested.

This is infrastructure, not product. The product code reads HOME correctly; the sandbox simply can't model the project vs global distinction.

### Origin of the `HOME=cwd` default

Commit `5333d4e` (2026-02-28): *"fix(e2e): isolate E2E tests from global `~/.claude-src/config.yaml`"*. Rationale was to prevent tests from reading the developer's real home. Setting `HOME=cwd` was the **shortest** path — cwd was already a fresh tempdir. There was no intent that HOME == cwd semantically; the equality is an accident of implementation.

## Why the localized fix isn't enough

`stack-per-agent-curation.e2e.test.ts` now works because it creates a second tempdir and passes `env.HOME = globalHomeDir`. That proves the fix direction, but:

- **`ProjectBuilder.editable` is used in 80+ test sites across 18 files**. Most use the default HOME (collapsed).
- **~100 launch sites do NOT pass an explicit `env.HOME`** (out of 222 total `InitWizard.launch*` / `EditWizard.launch` calls in 74 files). They run in the collapsed mode.
- **At least 16 tests (Medium-High risk) are miscategorized** — named/documented as "project" but actually running as global. Examples:
  - `edit-wizard-plugin-operations.e2e.test.ts` (7 launches, High risk — plugin install/uninstall asserted on `projectDir` while wizard is in global mode)
  - `lifecycle/re-edit-cycles.e2e.test.ts` (4 launches, High risk — `toHaveConfig({skillIds})` reads global-path file as if project)
  - `lifecycle/edit-add-local-skills.e2e.test.ts` (2 launches, High risk — claims project-scope adds)
  - `lifecycle/plugin-lifecycle.e2e.test.ts` (1 launch, High risk)
  - `edit-wizard-completion.e2e.test.ts` (5 launches, High — scope-sensitive assertions)
- **Two in-tree acknowledgements of the bug already exist as workarounds/gaps**:
  - `edit-wizard-navigation.e2e.test.ts:113-115` comments: *"TerminalSession sets HOME=cwd by default, which makes isGlobalDir=true and hides the Scope hotkey"*
  - `lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts:113-119` — `KNOWN GAP` citing `HOME=projectDir`

## Fix direction

Three layers, composable; (1) and (2) are the minimum. (3) is optional follow-up.

### (1) Change the default: `HOME = <sibling tempdir>` instead of `HOME = cwd`

In `e2e/helpers/terminal-session.ts` and `e2e/helpers/test-utils.ts`, replace the `HOME: cwd` default with a lazily-created sibling tempdir. Mirrors `src/cli/lib/__tests__/helpers/isolated-home.ts`, the canonical pattern already used by unit/integration tests.

- Preserves the original `5333d4e` isolation goal (no leak to real `~/.claude-src`).
- Fixes the root cause by construction — no test has to know about the quirk.
- Tests that explicitly pass `env.HOME` still win (override semantics preserved).
- Implementation: ~20 lines. One `mkdtempSync` in the session constructor + cleanup.

**Migration surface**: every test currently relying on `HOME === projectDir` silently. High-risk: `init-wizard.e2e.test.ts` (has a scope assertion changed in `5333d4e`). Needs a pre-flight pass to verify no test depends on the collapse as a feature.

### (2) Add named constructors on the wizard launchers

On both `EditWizard` and `InitWizard`:

```ts
// "editing a PROJECT install" — HOME auto-allocated distinct from projectDir
EditWizard.launchInProject(opts: EditWizardProjectOptions): Promise<EditWizard>

// "editing the GLOBAL install" — HOME === cwd === opts.globalHome
EditWizard.launchInGlobal(opts: EditWizardGlobalOptions): Promise<EditWizard>
```

- Named after the scope the wizard edits (not "from"/direction).
- Types forbid passing `HOME` in `env` — launcher owns scope semantics.
- Auto-created globalHomeDir is pushed onto the wizard instance's `cleanupDirs` (matching the existing `InitWizard` pattern at `init-wizard.ts:47`). `destroy()` cleans up; no `afterEach` boilerplate needed.
- `launch()` remains as an escape hatch with a TSDoc warning about the collapse.

### (3) `ProjectBuilder.editable({ globalHome: true })` (optional)

For tests that seed a project AND need a usable globalHome (e.g. cross-scope assertions), extend `EditableOptions` with an opt-in `globalHome?: boolean` flag. When true, the handle additionally returns `{ globalHome: ProjectHandle }`. Zero existing callers need to migrate.

## Non-goals

- No changes to product code (`consts.ts`, `edit.tsx`, `init.tsx`, `wizard-store.ts`). They read HOME correctly.
- No global rewrite of the 200+ launch sites. Migrate incrementally: D-226-dependent tests first, opportunistic sweeps after.
- Do not remove `launch()` / bare `ProjectBuilder.editable` — keep both the sugar and the raw path.

## Suggested migration sequence

1. Change default HOME in `terminal-session.ts` + `test-utils.ts` (layer 1).
2. Run full E2E suite; triage any newly-failing tests (expect ~0–5 that implicitly relied on the collapse).
3. Add `launchInProject` / `launchInGlobal` (layer 2).
4. Port the 16 Medium–High risk tests identified in the audit to `launchInProject`.
5. Port `dual-scope-helpers.ts` callers (10+ lifecycle tests) to the new sugar.
6. Drop the in-tree workaround comment in `edit-wizard-navigation.e2e.test.ts:113-115`.
7. Re-enable the `KNOWN GAP` assertion in `init-dashboard-edit-plugin-install.e2e.test.ts:113-119`.

## New E2E scenarios unlocked by this fix

Ranked by value (from angle-5 investigation):

1. **Global agent toggled ON in project edit lands in global config, not project config.** High value. Exercises the write-path split that is currently invisible.
2. **`cc init` from HOME vs from a project dir produces different configs.** High value. Cannot be modeled under collapsed HOME.
3. **Full G→P→G→P tombstone cycle.** Extends D-224 Scenario B from phase 3 to phase 5. High value.
4. **Dual-scope stack curation survival across scope toggles** — combines D-220 and D-223/D-224. Medium-high value.
5. **`cc edit` from HOME rejects scope toggles with toast** — makes the currently-accidental behavior an explicit assertion. Medium value.

## Related

- Commit `5333d4e` (2026-02-28) — introduced `HOME=cwd` default.
- In-tree acknowledgements: `edit-wizard-navigation.e2e.test.ts:113-115`, `init-dashboard-edit-plugin-install.e2e.test.ts:113-119`.
- Canonical pattern: `src/cli/lib/__tests__/helpers/isolated-home.ts`.
- Localized fix already landed: `e2e/lifecycle/stack-per-agent-curation.e2e.test.ts:310-329`.

## Key files

- `e2e/helpers/terminal-session.ts` (line 56 — collapse origin)
- `e2e/helpers/test-utils.ts` (line 114 — same default in `runCLI`)
- `e2e/pages/wizards/edit-wizard.ts`, `init-wizard.ts` (where sugar lives)
- `e2e/fixtures/project-builder.ts` (optional `globalHome` flag)
- `e2e/fixtures/dual-scope-helpers.ts` (highest-leverage refactor target)
- `src/cli/consts.ts:23` (`GLOBAL_INSTALL_ROOT`)
- `src/cli/commands/edit.tsx:222`, `init.tsx:179, 268` (detection sites — product code)
