---
type: audit
severity: medium
affected_files:
  - e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-18
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: "Rewrote the first describe block to install React at genuine GLOBAL scope (init run FROM the fake HOME) and edit at genuine PROJECT scope (cwd=projectDir, env HOME=fakeHome), using the canonical createTestEnvironment/initGlobal dual-scope harness. Assertion now asserts the exclusive-swap BLOCK (toast + global install untouched + Vue never added) instead of the impossible both-coexist expectation."
---

<!--
How to resolve a finding:
- Edit this file in place. Do NOT move or rename it (cross-links break silently).
- Add BOTH `status: resolved` AND `resolved_by: <short note>` to the frontmatter — always paired.
-->

## What Was Wrong

`e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts` had a block titled
`"dashboard -> Edit -> add plugin skill at project scope"` that never actually exercised
project scope, so its assertion tested the wrong behavior.

The block ran two `cc init` invocations against the same auto-created `projectDir` **without
ever setting an explicit `HOME`**. `TerminalSession` defaults `HOME = cwd` (see
`e2e/helpers/terminal-session.ts`), and `cwd === projectDir`, so `os.homedir() === projectDir`.
The product then computes `isGlobalDir = cwd === GLOBAL_INSTALL_ROOT` as `true`, which hydrates
`isEditingFromGlobalScope = true` into the wizard store. This is the documented D-226 HOME-collapse
gap (`todo/D-226-sandbox-home-cwd-collapse.md`).

Consequences:

- The Phase-2 "dashboard → Edit" ran as a **global-scope** edit, not project scope, despite the
  block name and the (uncommitted) intent.
- `web-framework` is an **exclusive** (single-choice) category. Selecting Vue while React was
  installed is an exclusive swap. At global scope, dropping React is the _correct_ behavior
  (`reconcileSkillConfigs` receives `isEditingFromGlobalScope=true` → `effectiveInstalled=null` →
  `applySkillRemoval` drops React entirely, no tombstone). So React vanished from the config.
- The block asserted that React **and** Vue would coexist in the final config — a state the store
  never produces for an exclusive category in either scope. In genuine project scope the store's
  existing `toggleTechnology` guard _blocks_ the swap with a toast
  (`"Global skills cannot be changed from project scope"`); in global scope the swap replaces React
  with Vue. Neither yields coexistence.

The test only ever passed historically because the whole suite is `describe.skipIf(!claudeAvailable)`
and runs solely where the real `claude` CLI is installed. When it did run, it asserted a
false expectation against a scenario mislabeled as project-scope — i.e. it was _vacuous_ project-scope
coverage.

Root cause: the store change was NOT involved (verified — the same failure reproduces byte-identically
against the pre-session `wizard-store.ts` HEAD). The defect was purely the test's environment/assertion.

## Fix Applied

Rewrote only the first describe block to exercise the genuine scenario, leaving the store untouched:

- Phase 1 installs React at **global** scope by running init FROM the fake HOME dir
  (`initGlobal(...)` → `cwd === HOME === fakeHome`), using the canonical dual-scope harness
  `createTestEnvironment` / `initGlobal` from `e2e/fixtures/dual-scope-helpers.ts` (the same one
  `dual-scope-same-source-plugin.e2e.test.ts` uses).
- Phase 2 edits at **genuine project scope**: the dashboard→Edit runs from the project subdirectory
  with `env: { HOME: fakeHome }`, so `isEditingFromGlobalScope` is correctly `false`.
- The assertion now matches the store's real (and user-approved) behavior: selecting Vue is
  **blocked** with the `GLOBAL_SKILLS_BLOCKED` toast; React remains the sole selected framework;
  the global config/plugin is untouched; Vue is never added to any config or `settings.json`.

The other two blocks (direct `cc edit` and legacy-config) were left as-is — they add a
non-exclusive skill (`web-state-pinia`) and are unaffected by the collapse/exclusive-swap semantics.

## Proposed Standard

E2E tests whose names or docstrings claim "project scope" (or otherwise depend on the project-vs-global
distinction) MUST set an explicit `HOME` distinct from `projectDir`, or use the canonical dual-scope
harness (`createTestEnvironment` + `initGlobal`/`initProject`). Relying on the default `HOME = cwd`
silently collapses the wizard into global-scope mode and produces vacuous coverage.

Suggested home for the rule: `.ai-docs/standards/e2e/README.md` (scope-awareness section), cross-referencing
`todo/D-226-sandbox-home-cwd-collapse.md`. Ideally the D-226 layer-1 fix (change the default `HOME` in
`terminal-session.ts`/`test-utils.ts` to a sibling tempdir) lands so this class of mislabeling becomes
impossible by construction; until then, an explicit-HOME rule is the guardrail.
