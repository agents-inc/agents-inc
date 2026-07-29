---
type: missing-standard
severity: medium
affected_files:
  - e2e/lifecycle/local-lifecycle.e2e.test.ts
  - e2e/lifecycle/plugin-lifecycle.e2e.test.ts
  - e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - scratchpad/d226-porting-recipe.md
date: 2026-07-24
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: resolved
resolved_by: >
  Phase 2 Wave 2 ported the final ~10 D-226 files green. The third launcher-selection
  rule discovered here — a follow-up that resolves its target from cwd (cc uninstall
  via detectUninstallTarget; claude plugin install writing enabledPlugins into HOME's
  settings.json) must use launchInGlobal, not launchInProject — is now folded into
  .ai-docs/standards/e2e/anti-patterns.md ("Choosing the Wizard Launcher by Scope").
---

## What Was Wrong

The D-226 porting recipe (`scratchpad/d226-porting-recipe.md`) categorised
`local-lifecycle` and `plugin-lifecycle` under Bucket C: "launchInProject →
globalHome auto-stamps onto result.project; CLI.run call sites unchanged;
redirect fs matchers to globalHome." That rule assumes every follow-up `CLI.run`
resolves its targets through HOME the same way `cc compile` does. It does not.

**`cc uninstall`'s `detectUninstallTarget(projectDir)` is cwd-only, not
scope-aware.** It resolves `skillsDir`/`agentsDir` via
`resolveInstallPaths(projectDir)` (no scope arg) and checks
`directoryExists(<projectDir>/.claude/skills|agents)` plus
`listPluginNames(projectDir)`. A default (all-global) init installs that content
under HOME, not projectDir. So under `launchInProject` (HOME ≠ projectDir):

- `cc compile` works — it is HOME/scope-aware and recompiles the global agents
  into HOME (`Recompiled N global agents`).
- `cc uninstall` finds nothing at `<projectDir>/.claude`, prints "…is not
  installed in this project. No changes made.", exits 0, and removes nothing —
  so `expectCleanUninstall` and `STEP_TEXT.UNINSTALL_SUCCESS` both fail.

This is confirmed behaviour, not a harness bug: the already-green command test
`e2e/commands/uninstall.e2e.test.ts` ("should report nothing to uninstall for
empty directory with HOME override") proves that even an explicit
`env: { HOME: globalHome }` pointing at a populated global config yields "Nothing
to uninstall" when cwd is an empty dir. Uninstall only ever looks at cwd.

A parallel case surfaced in `init-dashboard-edit-plugin-install` (direct
`cc edit` blocks): adding a plugin skill runs `claude plugin install`, which
writes `enabledPlugins` into HOME's `settings.json`. Under `EditWizard.launch`
(auto HOME ≠ projectDir) the skill lands in the PROJECT config (so `toHaveConfig`
on projectDir passes) but its plugin enablement lands in HOME's settings.json, so
`toHavePlugin({ dir: projectDir })` fails. The config and the plugin enablement
diverge across the HOME/cwd split.

## Fix Applied

All three files ported with `launchInGlobal` (HOME === cwd === projectDir), NOT
`launchInProject`:

- `local-lifecycle`: `InitWizard.launch` → `InitWizard.launchInGlobal`. Every
  artifact (eject-copied skills, compiled agents, config) collapses onto
  projectDir, so the original assertions — `expectPhaseSuccess`,
  `toHaveCompiledAgentContent`, `expectCleanUninstall(projectDir)` — hold with no
  redirect and no split, and the follow-up compile + uninstall (cwd == projectDir
  == HOME) find and remove the content.
- `plugin-lifecycle`: `InitWizard.launch` → `InitWizard.launchInGlobal`. Same
  reasoning; the plugin registry / settings.json / compiled agents collapse onto
  projectDir and uninstall finds them.
- `init-dashboard-edit-plugin-install` (direct `cc edit` blocks 2 and 3):
  `EditWizard.launch` → `EditWizard.launchInGlobal`. The added plugin's
  enablement and the config both land on projectDir, so `toHavePlugin` +
  `toHaveConfig` (both on `result.project`) hold unchanged. Block 1 (dashboard →
  project-scope block) already used `initGlobal(fakeHome)` + explicit HOME and
  needed no change.

The recipe's other Wave-2 buckets (fresh init that only ASSERTS content, no
follow-up command) were ported per §8 with `launchInProject` + redirect to
`wizard.globalHome` as expected.

## Proposed Standard

Extend the "scope decides the launcher" rule in
`.ai-docs/standards/e2e/anti-patterns.md` (and the porting recipe) with a third
clause, alongside the two Wave-1 rules:

3. **A lifecycle whose follow-up command RESOLVES ITS TARGET FROM cwd must use
   `launchInGlobal`, not `launchInProject` + a redirected shared home.**
   `cc uninstall` (`detectUninstallTarget`, cwd-only) and `claude plugin install`
   (writes `enabledPlugins` into HOME's `settings.json`) only act on the content
   root at cwd/HOME. A default all-global install under `launchInProject` puts
   that content at HOME ≠ projectDir, so the follow-up command silently no-ops
   ("not installed in this project" / plugin enablement in the wrong
   settings.json). Model the whole init→…→uninstall (or edit-that-plugin-installs)
   flow as the GLOBAL install (`launchInGlobal`, HOME == cwd == projectDir): every
   artifact collapses onto projectDir and the original assertions hold with no
   redirect/split. Use `launchInProject` + redirect ONLY when the test merely
   ASSERTS content (no follow-up command consumes it) — `cc compile` is the one
   follow-up that IS HOME/scope-aware and can straddle the split.

This is the recipe's own §0/§5/§8 directive ("don't guess; run the un-ported test
and follow where content lands / which command can reach it") extended to the case
where the failure is not an ENOENT but a cwd-only command that no-ops on
out-of-cwd global content.
