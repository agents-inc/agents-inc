# D-219 — Default E2E wizard launcher to a sensible fixture

> **Refined 2026-04-20**: fold into D-226's `launchInProject`/`launchInGlobal` sugar. Shared plugin fixture via `globalSetup` (built once per worker, `claude`-available-gated). Sentinel strings for opt-out (`"no-marketplace"`, `"local-only"`). Hard-error fixture frozen readonly (`chmod -R a-w`) to prevent mutation bleed. 172 call sites in 74 files; ~96% can drop the plumbing; ~7 in 6 files stay explicit. Do NOT rename `createE2ESource` — keep it as the no-marketplace primitive so that code path stays observable.

## Problem

Every E2E test that needs a plugin-capable source has to wire up the same boilerplate:

```ts
const wizard = await InitWizard.launch({
  source: {
    sourceDir: pluginFixture.sourceDir,
    tempDir: pluginFixture.tempDir,
  },
})
```

This leaks fixture-management details into the assertion layer. It also creates drift risk: when a new shared fixture shape emerges (e.g. marketplace build parameters, extra sources, plugin registry seeds), every call site must be updated by hand.

Current defaults:

- `InitWizard.launch()` with no `source` falls back to `createE2ESource()` — a plain local source with **no** `marketplace.json`.
- Any test that triggers plugin install mode with that default hits the hard-error rule (`feedback_no_plugin_to_eject_fallback.md`) and fails.
- Tests therefore end up either passing `createE2EPluginSource()` explicitly OR calling `sources.setAllLocal()` to force eject mode.

## Goal

Tests should state their **intent** (plugin-install, eject-install, hard-error, etc.), not their **fixture plumbing**.

## Options to explore

1. **Suite-level default.** Accept a module-scoped fixture variable. Use a vitest `globalSetup` (or a project-scoped `beforeAll`) to build one shared plugin fixture per run and auto-inject it when no `source` is passed. Big win on setup cost (`claude plugin install` + marketplace build runs once per suite instead of per test).
2. **Wizard-launcher factory.** Split `InitWizard.launch` into variants: `launchWithPluginSource()`, `launchWithLocalSource()`, `launchWithEjectMode()`. Each encapsulates both the fixture and any required wizard steering (e.g., `setAllLocal()`). Keeps current `launch(...)` for genuinely custom sources.
3. **Fixture-aware default.** Have `InitWizard.launch()` detect whether the test is marked/tagged as plugin-mode (e.g. via a nested `describe("plugin mode", ...)` convention, or a `test.meta` field) and choose the fixture accordingly. Riskier — couples the launcher to test structure.
4. **Auto-elevate the default source.** Make `createE2ESource()` itself build a marketplace by default, and introduce `createE2ESourceNoMarketplace()` for the few tests that specifically need one without. Inverts the ergonomic penalty — plugin-mode tests get the common path, eject/no-marketplace tests opt out.

Option 1 or 4 are probably the sweet spot; option 3 couples things too tightly.

## Considerations

- **Claude CLI availability.** Plugin fixtures depend on `claude plugin install` / `claude plugin marketplace add`. Tests that can't run without `claude` already gate with `describe.skipIf(!claudeAvailable)`. Whatever default we pick must keep that gate discoverable — don't hide a hard requirement behind a default that silently skips.
- **Setup cost.** A shared suite-level plugin fixture is ~5s per CI run instead of ~5s per test file. Worth the trade.
- **Test isolation.** If the shared fixture is mutated by one test (corrupted metadata, deleted skill dir), subsequent tests see the mutation. Tests that mutate must still build a dedicated per-test fixture (already the pattern in `validate.e2e.test.ts`).
- **Backward compatibility.** Any existing explicit `source: { ... }` call should keep working unchanged — default only kicks in when `source` is omitted.
- **Hard-error tests.** Tests asserting the "marketplace could not be resolved" path (see `e2e/interactive/edit-plugin-hard-error.e2e.test.ts`) specifically need a source _without_ marketplace. Those must remain able to opt out.

## Scope

- E2E page objects: `e2e/pages/wizards/init-wizard.ts`, `e2e/pages/wizards/edit-wizard.ts` (and any other wizard entry points).
- E2E fixture helpers: `e2e/helpers/create-e2e-source.ts`, `e2e/helpers/create-e2e-plugin-source.ts`, `e2e/fixtures/*`.
- `e2e/vitest.config.ts` if introducing `globalSetup`.
- Test migration: identify the redundant `source: { sourceDir, tempDir }` boilerplate across the suite and collapse it once the default is in place. Grep for `InitWizard.launch({` / `EditWizard.launch({` to enumerate.

## Non-goals

- Don't rewrite the fixture chain (`createE2ESource` → `build plugins` → `build marketplace`). The cost/caching story is fine.
- Don't change product behavior — this is purely a test-harness ergonomics task.
- Don't touch the two regression-critical tests: `e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts` and `e2e/interactive/edit-plugin-hard-error.e2e.test.ts`.

## Acceptance

- Typical plugin-mode test: `const wizard = await InitWizard.launch();` (no fixture plumbing).
- Typical eject-mode test: `const wizard = await InitWizard.launch();` + `sources.setAllLocal();` on the sources step — OR a dedicated `launchWithEjectMode()` variant that encapsulates both.
- Hard-error tests can still opt into a no-marketplace fixture explicitly.
- Full E2E suite still green.
- No change in setup cost per file for plugin-mode tests (ideally: lower, since the fixture is shared).
