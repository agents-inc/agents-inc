---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/lib/__tests__/assertions/config-assertions.ts
  - src/cli/lib/__tests__/integration/init-end-to-end.integration.test.ts
  - src/cli/lib/__tests__/integration/source-switching.integration.test.ts
  - src/cli/components/wizard/step-agents.test.tsx
  - src/cli/lib/__tests__/integration/wizard-flow.integration.test.tsx
  - src/cli/lib/operations/project/load-agent-defs.test.ts
  - src/cli/lib/matrix/skill-resolution.integration.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-08-01
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: enforcement-gap
status: partial
partial_note: >
  Code side landed for the three cases where the intended assertion was unambiguous (the
  `expectSkillConfigs` / `expectAgentConfigs` parameter types, the eject-source assertion in
  source-switching, the rendered-frame assertion in step-agents), and CLAUDE.md's Test Assertions
  list now carries the triage rule. Pending: the second proposed standard (a shared assertion
  helper's expected parameter uses the production type rather than a structural restatement) is
  unwritten, and the three coverage gaps listed under "Left For The Owner" have no home in the
  tracker.
---

## What Was Wrong

Standing up `@typescript-eslint/no-unused-vars` over the test files for the first time produced 53
reports. The framing that matters is not the count. It is that **an unused binding in a test file is
a different kind of signal than an unused binding in production code.** In production code a dead
variable is usually just dead. In a test, the variable is very often the thing the author intended to
assert on — so it marks the exact spot where an assertion was planned and never written.

Sorting the 53 by that question rather than by file gave three groups.

**Group 1 — genuinely dead (46 of 53).** Copy-paste residue with no missing assertion behind it. The
largest single instance: `commands/validate.test.ts` had `const sourceDir = await
setupValidatedProject(tempDir, projectDir)` in 20 tests, and used `sourceDir` in exactly one of
them. The same file already contained the correct form (`await setupValidatedProject(...)`, no
binding) in five other tests, so the fix was to match the shape that was already there. Others in
this group: `vi` imported into two files that mock nothing, a `mockWarn` alias in
`multi-source-loader.test.ts` shadowed by three call sites that already assert on `warn` directly,
type-only imports left behind after their annotations were removed.

**Group 2 — a real weakness in a shared assertion helper (2 of 53).**
`__tests__/assertions/config-assertions.ts` imported `SkillConfig` and `AgentScopeConfig` and used
neither. It declared its parameters structurally instead:

```ts
expected: Array<{ id: string; scope: string; source: string; excluded?: boolean }>;
```

`scope: string` where the real type is `SkillScope`, `source: string`, `name: string` where the real
type is `AgentName`. This is the restated-type-alias case CLAUDE.md forbids ("NEVER create redundant
type aliases — use `Pick<>`, `Partial<>`, or `&`. Check `types/` first"), and the two unused imports
were the fingerprint of the version that got it right. These are the two most-used config assertions
in the suite — roughly 70 call sites across `config-generator.test.ts`,
`user-journeys.integration.test.ts` and others — so every one of them was passing expectations that
TypeScript could not check the shape of.

Tightening both signatures to `SkillConfig[]` / `AgentScopeConfig[]` produced exactly **five** type
errors, all in one file, all the same defect: `init-end-to-end.integration.test.ts` built its
expected agent list inline —

```ts
expectAgentConfigs(config, [
  ...EXPECTED_AGENTS.WEB_AND_API.map((name) => ({ name, scope: "global" })),
]);
```

— rather than calling `buildAgentConfigs(EXPECTED_AGENTS.WEB_AND_API, { scope: "global" })`, the
factory that exists for precisely this and that the same file's _skill_ assertions three lines below
already use. So the loose parameter type was not merely permissive in the abstract; it was actively
holding an inline-test-data violation in place. The moment the type was correct, the violation
became a compile error and pointed at itself.

**Group 3 — a discarded observation with an obvious replacement (2 of 53, plus 4 reported below).**
Two cases where the binding named something the test observed and then threw away, and where the
correct assertion could be read off an existing passing assertion rather than invented:

- `step-agents.test.tsx` "should toggle agent on SPACE" destructured `lastFrame` and asserted only
  `store.selectedAgents`. Store-only assertions are exactly the class that can pass while the
  rendered grid is wrong: selection intent and the scope badge are read from different store fields
  (`domainSelections` versus `skillConfigs`), so a keypress that updates one and not the other leaves
  the field a test happens to read looking correct while the frame is not. The frame string was not
  invented: the continue-footer text
  for a 1-agent selection is the same footer a sibling test in the same file already asserts on for a
  3-agent selection.
- `source-switching.integration.test.ts` imported `SkillConfig`, used it nowhere, and verified its
  install with `expectConfigSkills` — skill **IDs only**, in a file whose entire subject is which
  _source_ a skill is installed from. The expected value was already written down in the arrange step
  of the same file, as the eject-sourced configs that `reinstallAllSkills` feeds to the installer, so
  the fix was to assert that full shape rather than the ID list.

## Fix Applied

All 53 reports resolved with no `eslint-disable` and no deleted tests. `npx eslint .` is clean,
`npx tsc --noEmit` is clean, and the suite is unchanged at 5162 passed / 50 skipped across 129 files
— identical to the pre-change baseline, including both tests that gained an assertion.

- 46 dead bindings removed (imports, destructured properties, `let` declarations, one dead
  `buildSkillConfigs` constant in `edit.test.ts` that was the unused fourth cell of a 2x2
  scope×source matrix).
- `expectSkillConfigs` / `expectAgentConfigs` now take `SkillConfig[]` / `AgentScopeConfig[]`.
- `init-end-to-end.integration.test.ts` now calls `buildAgentConfigs(...)` at all five sites.
- Two assertions added, both derived from text already present in the same file, both green.

## Left For The Owner

Three coverage gaps surfaced by the same sweep where the missing assertion was **not** obvious, so
nothing was invented. Recording them here rather than guessing:

1. `wizard-flow.integration.test.tsx` — "should preserve domain selections when navigating back in
   scratch flow" never navigates back. It presses ARROW*DOWN twice and ENTER to \_reach* domain
   selection, then asserts the pre-selection. There is no ESCAPE in the test. The name describes a
   behaviour the body does not exercise; the sibling Flow-D test does the real round trip.
2. `skill-resolution.integration.test.ts` — "should mark conflicting skill from another source as
   incompatible" sets a conflict `reason` of `"Choose one frontend framework"`, asserts only the
   boolean, and imported `getIncompatibleReason` (plus `isDiscouraged` / `getDiscourageReason`)
   without calling any of them. The reason string is set up and discarded; the discouraged half of
   the API has no integration coverage at all.
3. `config-types-writer.test.ts` — the file mocks `GLOBAL_INSTALL_ROOT` to a non-existent path
   specifically so `getGlobalConfigTypesPath` returns null, imported that function, and never called
   it. Its null branch is only ever exercised indirectly.

## Proposed Standard

Add to CLAUDE.md under "Test Assertions":

> An unused binding in a test file is a triage item, not lint noise. Before deleting one, ask what
> the author meant to do with it. A destructured `stdout` / `lastFrame` / `exitCode` that is never
> asserted on means the test ran the code and checked nothing about the result. An unused type
> import on an assertion helper usually means its parameters were restated structurally and are no
> longer shape-checked. An unused factory import usually means the fixture next to it is built
> inline — the violation the import was there to prevent. Delete only after establishing the binding
> names nothing the test should have asserted; where the intended assertion is not obvious, report
> it rather than inventing one, and never weaken an existing assertion to make the report go away.

Second, narrower rule for the same section:

> A shared assertion helper's `expected` parameter must use the production type it compares against
> (`SkillConfig[]`, `AgentScopeConfig[]`), never a structural restatement. The restatement compiles
> against inline object literals, which is precisely the test data the factories exist to replace —
> so a loose `expected` type silently licenses the inline-test-data violation at every call site.
