---
type: audit
severity: high
affected_files:
  - e2e/helpers/terminal-session.ts
  - e2e/helpers/test-utils.ts
  - e2e/fixtures/cli.ts
  - e2e/interactive/init-wizard-stack.e2e.test.ts
  - e2e/interactive/init-wizard-plugin.e2e.test.ts
  - e2e/interactive/edit-wizard-excluded-skills.e2e.test.ts
  - e2e/commands/validate.e2e.test.ts
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
  The 43-test / 21-file migration was completed in the combined D-226 + D-219
  launcher pass (Phase 2, Waves 1-2): the launchInProject/launchInGlobal sugar +
  wizard.globalHome were added and all 21 files ported, with the launcher chosen
  by scope (see the anti-patterns "Choosing the Wizard Launcher by Scope"
  section). Full E2E suite green — 139 files / 569 tests passed, 0 failed. Step A
  and Step B both shipped; no per-test HOME=projectDir pinning was needed.
---

## What Was Wrong

The D-226 plan (`todo/D-226-sandbox-home-cwd-collapse.md`) estimates that changing
the E2E harness HOME default from `cwd` to a sibling temp dir would break "~0-5"
tests that implicitly relied on the `HOME == cwd == projectDir` collapse. It also,
in a separate paragraph, audits "at least 16 tests (Medium-High risk)" as
miscategorized.

Empirically, after Step A (`terminal-session.ts` sibling-HOME default, already on
disk from the prior attempt) plus Step B (`runCLI` sibling-HOME default, this
round), the full E2E suite fails **43 tests across 21 files**.

Root cause, confirmed end-to-end (diagnostic capture of a default `cc init` local
install under the new HOME):

- A default `cc init` / `cc edit` defaults every skill and agent to
  `scope: "global"`. Eject/compile therefore write to `os.homedir()/.claude/...`.
- Under the OLD collapse (`HOME == cwd`), `os.homedir()/.claude` == the project
  dir, so assertions on `<projectDir>/.claude/skills` and `.../.claude/agents`
  passed by accident.
- Under the new sibling HOME, global installs land in the auto-home
  (`/tmp/ai-e2e-home-*`), while the tests still assert on `<projectDir>/.claude`.
  The wizard's config.ts is correctly written to the project dir but references
  globally-installed content, so `toHaveCompiledAgents()`, `copiedSkills`,
  "plugin enabled in settings.json", and validate's `.claude/skills` scan all
  fail.
- Multi-phase tests are also hit by a harness inconsistency: `e2e/fixtures/cli.ts`
  `CLI.run` still pins `HOME: project.dir`, so a wizard that installs to the
  auto-home followed by a `CLI.run` command that reads with `HOME=projectDir`
  disagree on where "global" lives (this is why `validate` errors with
  `ENOENT scandir <projectDir>/.claude/skills`).

All sampled failures are collapse-reliant, not masked product bugs: each passes
under a temporary `HOME=cwd` gate and fails under the new default. Verified in
isolation for `init-wizard-stack` (local-install group), `init-wizard-plugin`,
`validate`, and `edit-wizard-excluded-skills`; the remaining files share the same
root cause but were not each isolation-verified.

## Fix Applied

Partial.

- **Step B landed (this round):** `runCLI` in `e2e/helpers/test-utils.ts` now
  defaults HOME to a fresh sibling temp dir (`ai-e2e-home-` prefix via the
  existing `createTempDir`/`cleanupTempDir` helpers, cleaned up in a `finally`),
  with an explicit `env.HOME` still winning. TSDoc updated. Verified clean: none
  of `runCLI`'s 9 caller files (all lifecycle) regressed, and the plugin-source
  helper's `runCLI("build …")` is HOME-independent (runs in the source dir).
- **Step A left as-is** per the task (`terminal-session.ts` unchanged; a temporary
  env-gated legacy path was used only for baseline diagnosis and fully reverted).
- **The 43-test HOME=projectDir pinning was intentionally NOT done** — it is a
  large, heterogeneous, ~21-file diff (some files pin in one line, others route
  through the auto-projectDir `InitWizard.launch()` and need projectDir threaded
  through each launch site), it re-collapses a large swath of the suite, and it is
  precisely the `launchInProject`/`launchInGlobal` migration the plan defers to
  D-219. Forcing it piecemeal without that sugar produces exactly the "giant messy
  diff" the plan warns against.

## Proposed Standard

1. **Correct the D-226 plan's breaker estimate.** The "~0-5 breakers" figure is
   empirically wrong; the true migration surface after the HOME-default change is
   ~43 tests / 21 files. Record this in `todo/D-226-sandbox-home-cwd-collapse.md`
   so D-219 is scoped to the real number, not the audit's partial list.

2. **Land the HOME-default change together with the D-219 launcher sugar.**
   Changing the default HOME in isolation (Step A) leaves the suite red until every
   miscategorized test is ported. The two must ship together:
   `EditWizard.launchInGlobal` / `InitWizard.launchInGlobal` (HOME === cwd ===
   auto globalHome) makes each fix a one-word change at the launch site with no
   projectDir threading and no extra cleanup, versus the current ~3-line manual
   pin. Track the affected 21 files as the D-219 port list.

3. **Fix the `CLI.run` / TerminalSession HOME asymmetry.** `e2e/fixtures/cli.ts`
   still hardcodes `HOME: project.dir` while `terminal-session.ts` and `runCLI`
   now default to a sibling home. Multi-phase tests that mix a wizard launch with
   `CLI.run` will silently read different "global" roots. `CLI.run` should adopt
   the same sibling-HOME default (explicit wins) so all three harness entry points
   agree. This belongs in `.ai-docs/standards/e2e/anti-patterns.md` as an
   invariant: "all harness process spawners resolve HOME identically."
