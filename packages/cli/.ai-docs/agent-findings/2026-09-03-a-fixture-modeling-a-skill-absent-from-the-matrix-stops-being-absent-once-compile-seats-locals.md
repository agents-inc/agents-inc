---
type: anti-pattern
severity: medium
affected_files:
  - packages/cli/e2e/commands/warn-suppression-stops-at-the-harness.e2e.test.ts
  - packages/cli/src/cli/commands/compile.ts
  - packages/cli/src/cli/lib/stacks/stacks-loader.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-09-03
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: premise-expired
status: resolved
resolved_by: the fixture in `e2e/commands/warn-suppression-stops-at-the-harness.e2e.test.ts` now installs a plugin-scope skill without recording its source, so it is genuinely absent from the loaded matrix
---

## What Was Wrong

Not wrong at the time it was written — this is the `premise-expired` shape, caught the day the
premise expired rather than months later.

`compile` used to render every agent against `BUILT_IN_MATRIX`: `compileAgents` ran at
`compile.ts`'s `runCompilePass`, and the module-level `matrix` singleton
(`lib/matrix/matrix-provider.ts`) was seated with the merged (local-skills-included) matrix only
afterward, inside `refreshConfigTypes`'s own `loadSkillsMatrixFromSource` call. Every other command
(`install`, `edit`, `eject`, `doctor`, `search`) seats the merged matrix through `loadSource` before
doing anything. This is the defect a same-day fix closed (`seatMatrixForPass`, called once per
compile pass before `compileAgents`, using the pass's own `projectDir`) — filed separately, this
finding is about a test that depended on the bug as ambient behavior.

`e2e/commands/warn-suppression-stops-at-the-harness.e2e.test.ts` models "a skill that is installed
on disk but the matrix does not know about" to prove the `... not found in matrix` advisory
(`resolveAgentConfigToSkills` in `stacks-loader.ts`, gated behind `hasSkill(assignment.id)`) reaches
a user through three different spawn paths (`CLI.run`, a PTY session, `runCLI`). Its fixture,
`projectWithStackSkillAbsentFromMatrix`, writes a genuinely well-formed local skill —
`createLocalSkill` plus `renderMetadataYaml(metadataFieldsFor(E2E_SKILL.vitest.id))`, a real
category/slug/domain, no malformed field anywhere — into the project's own `.claude/skills/`, and
assigns it in the stack. Under the pre-fix `compile`, that skill genuinely was invisible to
`stacks-loader.ts`'s `matrix` singleton at render time, even though it was correctly installed —
which is exactly the sibling defect the same-day fix closed: `hasSkill()` and `statedUsageFor()`
sit next to each other in `resolveAgentConfigToSkills` and read the identical unseeded singleton.

Once `compile` correctly seats the merged matrix (local skills included) before rendering, this
exact fixture skill IS found — `hasSkill()` returns `true`, the advisory never fires, and three of
the file's four tests fail on `expect(output).toContain(STEP_TEXT.STACK_SKILL_ABSENT_FROM_MATRIX)`.
Confirmed from the failing run's own captured output: `Discovered 1 local skills`, `1 global agents
rewritten, 0 unchanged`, and `Warning: Duplicate slug 'vitest': already mapped to
'web-testing-vitest', ignoring 'e2e-test-fixture-web-testing-vitest'` — the fixture skill is
genuinely merged into the seeded matrix under its own id, slug collision and all.

The test's own docstring states the premise the fix falsifies: "The fixture skill id is namespaced
to the E2E marketplace, so no loaded catalogue declares it." That was true only because `compile`'s
render path never loaded ANY local catalogue at all, built-in or fixture. A well-formed,
genuinely-installed project-scope local skill can no longer model "on disk but absent from the
matrix" for a `compile`-reached stack resolution — installed-as-local now implies present-in-matrix,
which is the correct behavior the fix exists to produce.

## Fix Applied

None — discovery only. Out of this lane's scope: the dispatching brief for the `compile` seating
fix explicitly excluded test files ("No test files"), so this is reported rather than repaired.

## Proposed Standard

The fixture needs a subject the fix does not close, not a smaller version of the same one. A
genuinely well-formed PROJECT-local skill assigned in the stack will now always be found by
`compile`'s render — that path is fixed. The advisory's remaining true positive is a stack entry
naming a skill id that is neither a locally-installed skill nor present in the loaded marketplace
matrix — e.g. a plugin-origin/foreign id no catalogue this installation loaded declares, written
into `stack` without a corresponding installed skill of any kind. `discoverInstalledSkills` would
then still find `totalSkillCount` skills that DON'T include this id (so `warnUnresolvedStackSkills`'s
sibling message, `SKILL_NOT_FOUND_WARNING`, would fire for "not found on disk" instead) unless the
id belongs to a different, unrelated skill's category slot — the fixture needs an id that resolves
through neither `discoverAllSkills` NOR the seeded matrix, which a local skill directory (by
definition scanned by both) cannot provide. A plugin-scope skill entry with no corresponding
installed plugin, or an id claimed only by a DIFFERENT (non-fixture) marketplace this installation
was never pointed at, are the two candidates that stay reachable. Whoever owns this file should
re-verify against current source before changing the fixture, per this corpus's own
`premise-expired` convention — the mechanism above was true as of this fix landing and may itself
drift further.

No existing standards doc names this shape (a fixture assuming a locally-installed skill stays
outside the matrix). If the pattern recurs, `.ai-docs/standards/e2e/anti-patterns.md` is where it
belongs, phrased as: a fixture modeling "installed but not resolvable" must use an artifact `compile`
does not merge into its seeded matrix at all (a foreign/plugin id), not a well-formed local skill —
local skills are exactly what the matrix now always includes.
