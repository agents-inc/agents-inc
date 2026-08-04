---
type: missing-standard
severity: medium
affected_files:
  - e2e/lifecycle/edit-add-local-skills.e2e.test.ts
  - e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts
  - e2e/lifecycle/source-switching-modes.e2e.test.ts
  - e2e/lifecycle/source-switching-per-skill.e2e.test.ts
  - e2e/lifecycle/preloaded-preservation.e2e.test.ts
  - e2e/pages/wizards/init-wizard.ts
  - e2e/pages/wizards/edit-wizard.ts
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
  Phase 2 Wave 1 landed the shared-globalHome reuse param (globalHome? on
  InitWizardOptions/EditWizardOptions, reused by launchInProject without cleanup
  ownership) and ported the 8 multi-phase / plugin files green. The two porting
  rules discovered here — a source-toggle edit needs launchInGlobal (a global
  skill is read-only in a project edit), and a global agent's stack lives in the
  global config — are now folded into
  .ai-docs/standards/e2e/anti-patterns.md ("Choosing the Wizard Launcher by Scope").
---

## What Was Wrong

The D-226 porting recipe (`scratchpad/d226-porting-recipe.md`) categorised the
plugin-mode multi-phase files (`edit-add-local-skills`, `mixed-mode-skill-ref-format`,
`source-switching-modes`, `source-switching-per-skill`) as "swap `launch` →
`launchInProject` + shared home + redirect content matchers to the shared home."
Applying that rule made every one of them FAIL — but not with the expected
ENOENT-under-projectDir signature. Two deeper truths surfaced:

**1. A PROJECT edit cannot switch the source of a GLOBAL-scoped skill — it is
locked.** All four of those tests toggle a skill's source (plugin ↔ eject) during
`cc edit`. Default-scope skills are global. In the Sources step, `source-grid.tsx`
renders a global skill as `readOnly` (the `🔒` lock) whenever the edit context is
a project (HOME ≠ projectDir) — "installed globally, not yours to change here."
`selectFocusedSourceCell()` / `setAllLocal()` / `setAllPlugin()` on a locked row
are silent no-ops. The wizard still exits 0 (EDIT_UNCHANGED), so the failure only
shows up downstream as "config never gained `source:"eject"`". Under
`launchInProject` (HOME ≠ projectDir) the toggle is structurally impossible; the
old collapsed harness (HOME == projectDir) hid this because the "global" scope WAS
the project dir, so the skill was editable.

**2. The `stack` for a global-scoped agent lives in the GLOBAL config, not the
project config.** `preloaded-preservation` reads `config.stack` via
`loadConfigOrFail(projectDir)`. After a default (all-global) init, the PROJECT
`config.ts` carries the flat skills/agents lists but NO `stack` field —
`config-writer.ts` filters the stack to agents matching that config's scope
(`filteredStack`, `hasStack`). The stack for the global agents is written to
`HOME/.claude-src/config.ts`. Under the old collapse (HOME == projectDir) the two
configs were the same file, so `assertPreloadedInStack(projectDir)` found the
stack; under a real project install they diverge and it reads the wrong file.

## Fix Applied

- **Foundation:** added an optional `globalHome?: string` to `InitWizardOptions`
  and `EditWizardOptions`. When set, `launchInProject` REUSES that dir as the
  spawned CLI's HOME (no fresh allocation), stamps it onto the session /
  `WizardResult.project.globalHome`, and exposes it via `wizard.globalHome`, but
  does NOT take cleanup ownership (the allocating test owns it). When absent,
  behaviour is byte-identical to before (fresh alloc, wizard owns cleanup).
  Explicit `env.HOME` precedence is unchanged.

- **Source-switching tests (the four above):** ported with `launchInGlobal`
  (HOME == cwd == projectDir), NOT `launchInProject`. This models editing the
  GLOBAL install where the default-scoped skills live and are editable, so the
  source toggle works. Every content + config artifact collapses onto projectDir,
  so the original assertions (all on projectDir / `result.project`) hold with no
  redirect and no `expectPhaseSuccess` split.

- **`preloaded-preservation`:** ported with the reuse param (shared home across
  init → edit); redirected the compiled-agent matcher to the shared home and
  `assertPreloadedInStack(...)` to the shared home (the global config that carries
  the stack). Its helper param was renamed `projectDir` → `configDir` with a
  doc note.

- **Pass-through / observe-content tests** (`re-edit-cycles` test 1,
  `real-marketplace`, `pom-framework` block 1): ported with `launchInProject` +
  the reuse param, redirecting only the global-content matchers (compiled agents,
  copied skills) to the shared home; config / `toHaveConfig` / raw-config reads /
  output-text stayed on projectDir. CLI.run sites auto-read the stamped globalHome.

## Proposed Standard

Add a "scope decides the launcher" rule to `.ai-docs/standards/e2e/anti-patterns.md`
(and fold into the porting recipe):

1. **A test that TOGGLES a global skill's source during `cc edit` must use
   `launchInGlobal`, not `launchInProject`.** A project edit renders global skills
   read-only; the toggle is a silent no-op and the wizard exits `EDIT_UNCHANGED`.
   `launchInGlobal` (HOME == projectDir) is the sanctioned model for editing the
   scope where the skills live; all content + config then collapse onto projectDir
   and the assertions need no redirect/split. Use `launchInProject` + a redirected
   shared home ONLY for pass-through / content-observation edits that never mutate
   a global skill's source.

2. **`config.stack` for a global-scoped agent lives in the GLOBAL config
   (`HOME/.claude-src/config.ts`), not the project config.** Any assertion that
   loads `stack` after a default (all-global) init must read the global home dir,
   not projectDir. The project config carries only the flat skills/agents lists
   plus the stack slice for PROJECT-scoped agents.

Both rules follow the recipe's own §0/§5 directive — "don't guess; run the
un-ported test and point the assertion at the dir the content actually landed in"
— extended to cover the case where the failure is not an ENOENT but a
scope-locked no-op or a scope-split config file.
