---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/init-dashboard-edit-plugin-install.e2e.test.ts
  - e2e/lifecycle/edit-remove-last-skill-stack-cleanup.e2e.test.ts
  - e2e/lifecycle/edit-global-agent-removal-propagation.e2e.test.ts
  - e2e/interactive/edit-wizard-plugin-migration.e2e.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: partial
partial_note: >-
  The two loads that had an explicit non-null assertion were migrated to
  loadConfigOrFail. One remaining load in
  init-dashboard-edit-plugin-install.e2e.test.ts still uses `?? []` and is
  documented below; migrating it would strengthen an assertion, which is out of
  scope for a behaviour-preserving pass.
---

## What Was Wrong

Two distinct hygiene problems surfaced while adopting the Pass 8 shared e2e
infra at spec-file call sites.

**1. `?? []` after a config load makes a negative assertion vacuous.**

The recurring shape was:

```ts
const projectConfig = await loadProjectConfigFromDir(projectDir);
const projectSkillIds = projectConfig?.config.skills.map((s) => s.id) ?? [];
expect(projectSkillIds).not.toContain(VUE_SKILL_ID);
```

If `config.ts` is absent — the exact failure this kind of test exists to catch —
the optional chain plus `?? []` yields an empty array and the `not.toContain`
passes trivially. The test reports green for a project that has no config at
all. This is the silent-fallback pattern CLAUDE.md bans, but the ban was only
being enforced on production code, not on e2e specs.

Note the asymmetry that makes this hard to spot in review: the _same file_ had a
second load two blocks earlier that DID pin non-nullness with an explicit
`expect(globalConfig, "global config.ts must exist").not.toBeNull()`. One load
was safe, the adjacent one was vacuous, and nothing flagged the difference.

**2. A local constant aliasing a shared constant.**

`e2e/interactive/edit-wizard-plugin-migration.e2e.test.ts` declared:

```ts
/** Combined timeout for tests that include plugin operations + exit wait */
const PLUGIN_TEST_TIMEOUT_MS = TIMEOUTS.PLUGIN_TEST;
```

This violates two separate CLAUDE.md rules at once — "NEVER reassign constants
to other constants" and "NEVER define path/timeout/text constants locally in
E2E test files". The alias adds a second name for one value and hides the fact
that the file is already on the shared timeout budget.

## Fix Applied

- Migrated the two config loads that already had an explicit non-null assertion
  onto the shared `loadConfigOrFail(dir)` helper
  (`e2e/helpers/test-utils.ts`), which throws on a missing or unparseable
  config and returns `ProjectConfig` directly. This drops the
  `expect(...).not.toBeNull()` + `if (!loaded) return;` + `.config` hop without
  weakening anything: the helper's throw fails the test in exactly the cases
  the deleted assertion did.
- Deleted `PLUGIN_TEST_TIMEOUT_MS` and used `TIMEOUTS.PLUGIN_TEST` directly at
  both call sites. Value unchanged.
- **Deliberately NOT fixed:** the `?? []` load in
  `init-dashboard-edit-plugin-install.e2e.test.ts` ("Vue must not leak into the
  project config either"). Swapping it to `loadConfigOrFail` would convert a
  vacuous pass into a hard failure whenever the project config is absent — a
  genuine strengthening of the assertion. That is a behaviour change, and the
  pass it was found in is strictly behaviour-preserving. It needs a real suite
  run to confirm the project config is in fact written by that flow before the
  fallback can be removed.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md` a section named
"Never soften a config load":

> A structural config load in an e2e spec must go through `loadConfigOrFail(dir)`
> from `e2e/helpers/test-utils.ts`. Never write
> `(await loadProjectConfigFromDir(dir))?.config` and never follow a load with
> `?? []`, `?? {}` or `?? ""`. A missing `config.ts` is always a test failure,
> never an empty result — and an empty result silently satisfies every
> `not.toContain` / `toHaveLength(0)` assertion downstream, which is precisely
> the class of bug these tests exist to detect.

This is the e2e-side counterpart of the existing CLAUDE.md rule "NEVER use
optional chaining (`?.`) or null coalescing (`?? ""`, `|| []`) on data that must
exist". The rule already exists; what was missing is that it visibly applies to
spec files, not just to `src/`. Stating it in the e2e anti-patterns doc — where
spec authors actually look — is the enforcement gap to close.

A mechanical check is also available and cheap: grep e2e specs for
`loadProjectConfigFromDir` and require that every hit is inside
`test-utils.ts`. After the remaining site above is resolved, that invariant
holds across the whole tree.
