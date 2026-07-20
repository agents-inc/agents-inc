---
type: anti-pattern
severity: medium
affected_files:
  - e2e/lifecycle/global-agent-toggle-guard.e2e.test.ts
  - e2e/lifecycle/global-skill-toggle-guard.e2e.test.ts
  - e2e/lifecycle/global-skill-filter-incompatible-guard.e2e.test.ts
  - e2e/lifecycle/dual-scope-edit-integrity.e2e.test.ts
  - e2e/fixtures/dual-scope-helpers.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
  - .ai-docs/standards/e2e/assertions.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: convention-undocumented
---

## What Was Wrong

Two distinct problems, both variations of the same mistake: **an assertion pinned state that its own test did not produce.**

**1. Absolute assertions on setup-owned state (4 tests, 3 files).**

Three guard tests each ended with `await expect({ dir: env.projectDir }).not.toHaveConfig();`. Each test exists to prove one thing: a project-scope edit cannot alter a globally-installed skill or agent. But `not.toHaveConfig()` says nothing about the guarded edit — it asserts the _absence_ of a file that the setup helper (`createGlobalOnlyEnv` → `initProjectAllGlobal`, which runs `cc init` inside a project) was responsible for creating or not creating.

The assertion only ever passed by accident. `cc init` in a project did not materialise the project config, but only because a stale global config made a `setAllLocal()` keypress produce a spurious diff. Once `cc init` was fixed to materialise the project deliberately, all four assertions broke — on a line unrelated to the guard behaviour each test is named for. The guard assertions themselves (blocked-toast, global-config-byte-identical, `EDIT_UNCHANGED`) were green throughout.

The deeper issue: `not.toHaveConfig()` is _weaker_ than it looks. It proves a file is absent. It cannot prove that an action left an existing file alone, which is the actual invariant a guard test needs.

**2. Relative equality that silently encoded a stale value (1 test).**

`dual-scope-edit-integrity.e2e.test.ts` → "Config split preserves source fields after edit" asserted the global config was byte-identical (modulo the `projects` line) before and after a project init. That equality held only because the global config was _never updated_ to reflect that `setAllLocal()` had genuinely migrated global-scoped skills from marketplace installs to local copies on disk. Config said `source: "agents-inc"`; disk said otherwise. The test was pinning a config/filesystem disagreement as if it were the contract.

An A-vs-B equality assertion cannot detect a bug that corrupts both A and B identically. Here it actively protected the drift.

## Fix Applied

**Group 1** — replaced each `not.toHaveConfig()` with a snapshot taken immediately after setup and compared byte-for-byte after the guarded action, plus a filesystem assertion the old line never made:

```ts
const projectConfigBefore = await readTestFile(configTsPath(env.projectDir));
// ... guarded edit ...
expect(
  await readTestFile(configTsPath(env.projectDir)),
  "a blocked skill toggle must leave the project config byte-identical",
).toBe(projectConfigBefore);
await expect({ dir: env.projectDir }).toHaveNoLocalSkills();
```

This is strictly stronger: it covers modification as well as creation, and it is scoped to the action under test rather than to whatever the setup helper happens to leave behind. It is also exactly the rule CLAUDE.md already states — "if it should NOT change something, snapshot before and assert identical after" — which the original assertions did not follow.

**Group 2** — replaced the stale A-vs-B equality with three separate pins:

- the global skills array pinned to an **absolute** expected value (exact id/scope/source triples for all seven skills, sorted by id), for both the Phase A pre-state and the Phase B post-state, so the migration is proven to be a real transition rather than a no-op;
- **config↔filesystem agreement** at each scope — every `source: "eject"` entry has a real directory in HOME, the one entry still sourced from the marketplace has none, and the project-scoped copy exists in the project;
- the untouched remainder via rest-destructuring (`{ skills, projects, ...rest }`), so every other field — including fields added later — still fails on drift, preserving the original protection without enumerating field names.

The `projects` tracking array, which the old normalizer stripped and therefore never checked, is now pinned explicitly.

## Proposed Standard

Add to `.ai-docs/standards/e2e/anti-patterns.md`:

> **Assert on what your action changed, not on what your setup produced.**
> An assertion whose truth depends on setup-helper behaviour, rather than on the action the test is named for, will break when the helper changes and will mislead whoever triages it. Before writing an assertion, ask: _did the action under test produce this state, or did the fixture?_ If the fixture produced it, the assertion belongs in the fixture's own test — or it should be re-expressed as a before/after snapshot taken around the action.
>
> Specifically, `expect(...).not.toHaveConfig()` (and any absolute "this artifact is absent" check) is **not** a valid way to prove an action was a no-op. It proves absence, not immutability, and it silently becomes vacuous once the artifact starts existing for unrelated reasons. Use a snapshot-and-compare around the action instead.

Add to `.ai-docs/standards/e2e/assertions.md`, alongside the existing "prove the code path fired" rule:

> **Prefer absolute expected values over A-vs-B equality when pinning derived state.**
> `expect(after).toStrictEqual(before)` cannot detect a bug that corrupts `before` and `after` identically — and where the two phases are supposed to differ, it silently encodes whichever value happens to be current. When a field is _derived_ from an operation (an install source, a resolved scope, a computed path), pin it to a literal expected value and assert that the config agrees with the filesystem. Reserve before/after equality for state that genuinely must not move, and scope the snapshot tightly around the action.
