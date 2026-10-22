---
type: anti-pattern
severity: low
affected_files:
  - packages/cli/src/cli/lib/seed/config-to-seed.ts
  - packages/cli/src/cli/lib/seed/config-to-seed.test.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-10-21
reporting_agent: cli-developer
category: testing
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  The parse, its comment and its import were deleted from configToSeedPayload, which now returns the
  literal typed SeedPayload.
---

## What Was Wrong

`configToSeedPayload` (`seed/config-to-seed.ts`) ended in `installableSeedPayloadSchema.parse(...)`
under the comment "so drift fails the mint here". No input the mapper accepts makes that parse fail,
because every rule the installable schema adds over the payload's types is applied before it:

- The unwritable-pair refinement. `readStack` refuses with `isScopePairCompatible`, which returns
  `isSeedScopePairWritable` (`packages/compile/src/seed-to-config.ts`). Every sub-agent the payload
  assigns to is written with `on: true` and an explicit `scope`, so the refinement's default-scope
  path is not reached.
- External entries. `readCarriedSkill` (`seed/external-skills.ts`) carries only the `data` of
  `seedExternalSkillSchema.safeParse`.
- `model` is filtered by `isSeedModel`. `codexModel` and `effort` come from config-schema enums in
  `schemas.ts`, which satisfy the seed's non-empty string and its identical effort enum.

The parse strips nothing, since every key the mapper writes is a schema key. The worker re-parses
the body and hashes the validated result, so the id does not depend on the parse either.

The only spec that failed without the parse stubbed `isScopePairCompatible` into an answer the real
rule cannot give. The REPO-44 prune deleted it, and the parse's mutant then survived with nothing
recording why. The review's probe replaced `return installableSeedPayloadSchema.parse({` with
`return ({` and `src/cli/lib/seed` plus `the-folder-never-reaches-the-payload.test.ts` stayed green
(11 files, 221 tests). This is the shape of
`2026-10-20-a-catch-reached-only-by-stubbing-a-collaborator-into-a-failure-it-cannot-make`.

## Fix Applied

The parse, its comment and its import were deleted. Three things now catch a mapper that drifts
from the contract:

- `tsc` catches shape drift, because the return type is the schema's `z.infer`.
- "mints a payload the store's own POST schema accepts" in `config-to-seed.test.ts` runs
  `safeParse` on the mapper's output.
- On the wire, the worker validates every POST. `e2e/fixtures/seed-config-store.ts` and
  `@workspace/api-mocks` do the same, so an e2e share that mints a refused body fails.

The cost: a future refinement the mapper does not mirror would now surface as an HTTP 400 at share
time, not as a local refusal. It would be caught only by the e2e specs whose payloads trip it.

## Proposed Standard

Nothing beyond the precedent's proposal: a guard no reachable input trips is deleted rather than
reached by a stub. This finding adds one case to it. A function that re-parses a value it has just
built from parts that were already validated holds a guard of this kind.
