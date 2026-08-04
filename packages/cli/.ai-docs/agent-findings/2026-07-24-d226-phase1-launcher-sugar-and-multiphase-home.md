---
type: missing-standard
severity: medium
affected_files:
  - e2e/helpers/terminal-session.ts
  - e2e/pages/wizard-result.ts
  - e2e/fixtures/cli.ts
  - e2e/pages/wizards/init-wizard.ts
  - e2e/pages/wizards/edit-wizard.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - todo/D-226-sandbox-home-cwd-collapse.md
date: 2026-07-24
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: scope-discipline-deferred
status: resolved
resolved_by: >
  Phase 1 landed the launcher sugar (launchInProject / launchInGlobal exposing a
  readonly globalHome), the WizardResult -> ProjectHandle.globalHome stamp, and the
  CLI.run HOME-asymmetry fix. The remaining multi-phase gotcha (2+ wizard-launch
  tests needing ONE shared globalHome) was closed by the Phase 2 reuse param —
  globalHome? on InitWizardOptions/EditWizardOptions, reused by launchInProject
  without cleanup ownership. Launcher-selection rules are documented in
  .ai-docs/standards/e2e/anti-patterns.md ("Choosing the Wizard Launcher by Scope")
  and reference/testing/e2e-infrastructure.md ("Scope & HOME model").
---

## What Was Wrong

Two harness invariants were missing after the D-226 Step A/B HOME-default change:

1. **`CLI.run` disagreed with the wizard on where "global" lives.** `e2e/fixtures/cli.ts`
   hardcoded `HOME: project.dir`, while `TerminalSession` and `runCLI` now default HOME
   to a sibling temp dir. A wizard that installed global content to its sibling HOME
   followed by `CLI.run(["validate"], result.project)` read `HOME=projectDir` and hit
   `ENOENT scandir <projectDir>/.claude/skills`. (This is proposed-standard #3 from the
   prior finding `2026-07-24-d226-stepA-breaks-43-miscategorized-tests.md`.)

2. **Multi-phase wizard tests have no way to share one global HOME (NEW).** With the
   sugar, `launchInProject()` allocates a FRESH globalHome per call. A test that launches
   two wizards against the same project (init -> edit, or edit -> edit) and expects the
   second wizard to see the first's global-scoped install content breaks: phase-2's
   globalHome != phase-1's, so phase-1 global content (compiled agents, plugin
   enablement) is invisible to phase-2. Affects `re-edit-cycles`, `preloaded-preservation`,
   `source-switching-modes`, `source-switching-per-skill`, `mixed-mode-skill-ref-format`,
   `edit-add-local-skills`, `real-marketplace`, `smoke/pom-framework`,
   `init-dashboard-edit-plugin-install`.

## Fix Applied

Phase 1 (this round):

- `TerminalSession` gained an optional `globalHome` option + `readonly globalHome` field
  (echo-back only; the spawned process's HOME still comes from `env.HOME`).
- `ProjectHandle` gained optional `globalHome`; `WizardResult` stamps it from
  `session.globalHome`. `CLI.run` HOME precedence is now
  `options.env.HOME > project.globalHome > project.dir` — existing
  `CLI.run(args, result.project)` sites need no change, and plain-`launch()` results
  (globalHome undefined) fall back to `project.dir`, byte-identical to before.
- `InitWizard`/`EditWizard` gained `launchInProject()` (fresh distinct HOME, exposed as
  `wizard.globalHome`, cleaned in `destroy()`) and `launchInGlobal()` (HOME==cwd==projectDir).
  `wizard.globalHome` is an asserting getter (throws on a plain `launch()` wizard, so
  `launch()`'s internal auto-HOME stays unexposed). `EditWizard` gained a `cleanupDirs`
  mechanism mirroring `InitWizard`.
- Ported `edit-wizard-excluded-skills`, `init-wizard-stack`, `validate` — all green.

NOT fixed (Phase 2): the multi-phase shared-globalHome need (#2 above).

## Proposed Standard

1. **"All harness process spawners resolve HOME identically."** Add to
   `.ai-docs/standards/e2e/anti-patterns.md`: `TerminalSession`, `runCLI`, and `CLI.run`
   must all default HOME to a sibling temp dir with an explicit `env.HOME` winning. This is
   now true in code; document it so it doesn't regress.

2. **"config.ts is project-side; installed content is scope-side."** Document the porting
   rule (also in the recipe): `.claude-src/config.ts` assertions stay on `result.project`;
   `.claude/` content matchers move to `wizard.globalHome` ONLY for global-scoped content —
   project-scoped content (`scope: "project"` entries, pre-seeded `projectDir/.claude/skills`)
   stays on projectDir. The failing assertion's ENOENT path tells you which.

3. **Multi-phase tests need one shared globalHome (Phase 2 design decision).** Recommended
   foundation add: an optional `globalHome?: string` on `InitWizardOptions`/`EditWizardOptions`
   that `launchInProject` reuses (no allocation, no cleanup ownership) and still stamps.
   Interim workaround with the current sugar: allocate one `sharedHome` per test and pass
   `env: { HOME: sharedHome }` to every launch (+ explicit `CLI.run(..., { env: { HOME: sharedHome } })`).
   Not added in Phase 1 because no proof file exercises it; prove it when porting the first
   multi-phase file.

Full copy-pasteable porting recipe (Phase 1 output):
`scratchpad/d226-porting-recipe.md`.
