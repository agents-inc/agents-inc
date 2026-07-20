---
type: convention-drift
severity: low
affected_files:
  - e2e/commands/plugin-uninstall-edge-cases.e2e.test.ts
  - e2e/commands/uninstall-preservation.e2e.test.ts
  - e2e/commands/compile-scope-filtering.e2e.test.ts
  - e2e/fixtures/expected-values.ts
  - e2e/helpers/test-utils.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

Two adjacent problems surfaced while adopting the shared E2E fixtures at spec-file
call sites.

**1. `E2E_SKILL` has no documented applicability boundary.**
`e2e/fixtures/expected-values.ts` exports `E2E_SKILL`, keyed by slug, with `.id` /
`.slug` / `.display` forms for the nine skills the E2E marketplace source publishes.
The instruction to "replace bare skill literals" reads as universal, but a large
share of skill-id literals in `e2e/` do not refer to that source at all. They are
arbitrary local fixture skills written straight to disk — `web-testing-cypress-e2e`
and `web-testing-playwright-e2e` in `compile-scope-filtering`, and the
`web-framework-react` written by `createUninstallableProject` in
`plugin-uninstall-edge-cases`, which never touches the E2E source.

Swapping those to `E2E_SKILL.react.id` would be byte-identical today but would
assert a relationship that does not exist: it implies the fixture tracks the
marketplace source, so a future rename of a source skill would silently rewrite an
unrelated local fixture. It also produces files that mix `E2E_SKILL.react.id` with
raw `"web-testing-cypress-e2e"` (not in `E2E_SKILL`) in the same array, which reads
worse than either form alone.

A second, sharper trap: for rendered-output assertions the correct member is
`.display`, and for config/path assertions it is `.id`. Five of the nine entries
have `display === id`, so picking the wrong one is invisible until someone gives a
skill a human title. There is no rule saying which to pick.

**2. `getEjectedTemplatePath` is duplicated inline.**
`e2e/helpers/test-utils.ts` already exports `getEjectedTemplatePath(projectDir)`,
but `uninstall-preservation.e2e.test.ts` rebuilds the identical path inline as
`path.join(projectDir, DIRS.CLAUDE_SRC, "agents", "_templates", "agent.liquid")`.
The path-helper adoption rules for this pass named only `configTsPath`,
`configTypesTsPath`, `agentsPath` and `skillsPath`, so this pre-existing helper had
no adoption rule pointing at it and the duplication survived.

## Fix Applied

None for either — discovery only, deliberately. Both were held back because this
pass was scoped to a fixed rule list under a strict behaviour-preserving mandate,
and neither change was covered by a rule. `E2E_SKILL`/`E2E_AGENT_DISPLAY` were
adopted only where the literal genuinely denotes E2E-source content: the
spec-local `E2E_SKILL_NAMES` array in `plugin-build.e2e.test.ts` (which enumerates
built plugin dirs from that source) and the `toggleAgent("API Developer")` display
literal in `selected-agent-name-excluded.e2e.test.ts`.

## Proposed Standard

Add to `.ai-docs/standards/e2e/README.md`, in the fixtures section:

1. **Scope rule.** `E2E_SKILL` / `E2E_AGENT_DISPLAY` are the source of truth _only_
   for content published by `createE2ESource()`. A spec that writes its own skill
   or agent to disk (`createLocalSkill`, `writeProjectConfig`, a local
   `create*Project` helper) owns those identifiers and must keep them as literals.
   Rule of thumb: if the spec does not call `createE2ESource` /
   `createE2EPluginSource`, do not import `E2E_SKILL`.

2. **Form rule.** When `E2E_SKILL` does apply, choose the member by what the
   assertion actually reads: `.display` for anything matched against rendered
   wizard text (`selectSkill`, `toggleAgent`, `toContain` on frame output), `.id`
   for config entries, file paths and compiled-agent content, `.slug` for source
   paths and skill lookups. Never normalise across forms — several entries
   currently have `display === id`, which hides the mistake.

3. **Path-helper rule.** Extend the "never inline a path that a `test-utils` helper
   already builds" guidance to name `getEjectedTemplatePath` alongside
   `configTsPath` / `configTypesTsPath` / `agentsPath` / `skillsPath`, so path
   helpers are enumerated in one place rather than rediscovered per sweep.
