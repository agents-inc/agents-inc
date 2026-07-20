---
type: standard-gap
severity: medium
affected_files:
  - scripts/generate-source-types.ts
  - scripts/generate-source-types.test.ts
  - src/cli/lib/skills/skill-metadata.test.ts
  - tsconfig.scripts.json
standards_docs: []
date: 2026-07-19
reporting_agent: cli-developer (Pass 8 Cluster E)
category: typescript
domain: infra
root_cause: enforcement-gap
status: resolved
resolved_by: "Added tsconfig.scripts.json + `npm run typecheck:scripts`; removed the phantom `tags` push and its dead tests; fixed a fabricated non-union skill id surfaced by the newly-strict compare-skills types."
---

## What Was Wrong

`scripts/` was never type-checked: the main `tsconfig.json` includes only `src/**/*`,
and the test runner transpiles without type checking. Two latent problems hid there:

1. **Phantom `tags` field.** `extractSkills` pushed `tags: Array.isArray(metadata.tags) ? metadata.tags : []`
   into `ExtractedSkillMetadata`, which has no `tags` field. The field never reached the
   emit path (source-types.ts only reads slug/id/category/domain), so it was pure dead
   code — and it contradicts the standing no-tags-in-metadata feedback rule. Two tests
   asserted on the phantom `.tags`.

2. **Fabricated non-union skill ids in tests.** When Cluster E tightened
   `compareLocalSkillsWithSource(sourceSkills)` from `Record<string, {path}>` to
   `Partial<Record<SkillId, Pick<ResolvedSkill, "path">>>`, `skill-metadata.test.ts`
   surfaced a test that used `"web-framework-vue"` as a skill id — which is NOT a real
   `SkillId` (the closest real id is `web-framework-vue-composition-api`). The old loose
   `Record<string, …>` masked the invalid fixture. A `generate-source-types.test.ts` case
   similarly used a fabricated `"web-framework-react-v2"` id.

## Fix Applied

- Created `tsconfig.scripts.json` (extends main, includes `scripts/`, `noEmit`,
  `allowImportingTsExtensions`) and added `npm run typecheck:scripts`. The main tsconfig
  (and therefore the dist build) is unchanged.
- Removed the phantom `tags` push and its two dead tests.
- Replaced the invalid `"web-framework-vue"` fixture with the real
  `web-framework-vue-composition-api`, and `"web-framework-react-v2"` with the real
  `web-state-zustand`.
- `resolveStack` now uses two field-level boundary casts (skills/allSkillIds) instead of
  a blanket `as ResolvedStack` that hid every field mismatch.

## Proposed Standard

Add `npm run typecheck:scripts` to the pre-commit / CI type-check step so `scripts/`
stays honest. Document in the type-narrowing conventions that fabricated test ids which
are NOT union members must be typed as `string` (or use a factory whose id param is
`string`), never passed through a `SkillId`-typed parameter — the stricter `Partial<Record<SkillId, …>>`
map types now catch these, but only for code paths that are actually type-checked.
