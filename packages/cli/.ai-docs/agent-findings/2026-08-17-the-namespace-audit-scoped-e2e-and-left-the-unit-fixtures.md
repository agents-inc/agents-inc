---
type: audit
severity: medium
affected_files:
  - src/cli/lib/loading/source-loader.test.ts
  - src/cli/lib/__tests__/commands/doctor-content.test.ts
  - src/cli/lib/__tests__/commands/search.test.ts
  - src/cli/lib/__tests__/fixtures/create-test-source.ts
  - src/cli/lib/matrix/matrix-health-check.ts
standards_docs:
  - .ai-docs/standards/e2e/user-journeys.md
  - .ai-docs/standards/e2e/test-data.md
date: 2026-08-17
reporting_agent: cli-tester
category: testing
domain: cli
root_cause: scope-discipline-deferred
status: resolved
resolved_by: >-
  The load-side collision guard landed with the three unit fixture files
  namespaced through a new `inTestMarketplace()` / `testMarketplaceSkillId()` seam
  in `create-test-source.ts`, mirroring the `e2eSkillId()` seam step 4 built for
  the e2e layer. 52 tests across 3 files moved. The one fixture that could not be
  namespaced — the audit-verdict contradiction — was made a checkout of the public
  catalogue instead, which is the only source entitled to ship the id it needs.
---

## What Was Wrong

Journey 26's audit measured the blast radius of the load-side collision guard against the
**e2e fixture sources only**: "The e2e fixture sources ARE custom marketplaces and 12 of the 13
skill ids they write to disk collide with the public catalog, so the load-side guard refuses every
one." Step 4 acted on that and namespaced the e2e layer.

The **unit** fixture layer writes custom marketplaces to disk through the same product code path
and was never counted. `createTestSource()` builds a source directory that
`loadSkillsMatrixFromSource()` then loads for real, and its default skill set —
`DEFAULT_TEST_SKILLS`: `web-framework-react`, `web-state-zustand`, `web-testing-vitest`,
`api-framework-hono` — is four bare public-catalogue ids. Every one of them is a member of
`BUILT_IN_MATRIX.skills`, verified by loading the vendored catalogue rather than by reading the
names.

The guard's first full-suite run measured the real number: **52 tests failing across 3 files** —
`source-loader.test.ts` (21), `doctor-content.test.ts` (25), `search.test.ts` (6). Every failure was
the same refusal, and every one was correct: those fixtures were illegal marketplaces.

Two second-order discoveries came out of fixing them, and both are properties of the product rather
than of the tests:

1. **`audit-verdict-contradiction` is unreachable from a custom marketplace.** It is one of only two
   error-severity findings `checkMatrixHealth` produces, and it fires when the vendored audit
   manifest records a skill as `universal` while the matrix fences it. The manifest is keyed by
   public-catalogue ids, so a skill outside them can never contradict a verdict nothing records for
   it — and a source shipping one of them is refused. The finding is therefore constructible only
   for the catalogue's own checkout.

   This is a third instance of a shape recorded the day before: a built-in table keyed by the
   PUBLIC catalogue's `SkillId` union, consulted with an id that now belongs to another
   marketplace's namespace, so the lookup misses and the miss has a silent fallback rather than an
   error. The coupling is a catalogue MEMBERSHIP test, not a parse, which is why nothing that scans
   for positional id splitting can find it. The first two instances were `resolveAssignment` in
   `packages/matrix/src/read-model/assignment-defaults.ts`, where a skill outside the catalogue
   reached no sub-agent at all, and `checkUnauditedSkills` in `matrix-health-check.ts`, which
   warned once per skill for every custom marketplace. That report's third item asked for a sweep of
   the remaining `Record<SkillId, …>` lookups, and this is one of them: the `auditEntryFor` sweep
   fixed the NOISE half, `skill-unaudited`, and left the contradiction check unexamined.
   The difference matters because the two misses fail in opposite directions — `skill-unaudited`
   fired for every custom marketplace and had to be narrowed, while `audit-verdict-contradiction`
   now fires for none and cannot be, since only the catalogue may hold an id the manifest names.
   `matrix-health-check.ts` records the reasoning beside `checkUnauditedSkills` ("outside the
   manifest by construction, not unaudited") and nowhere beside `checkAuditVerdictContradictions`.

2. **A fixture namespace must not spell the product's own vocabulary.** The first value tried was
   `test-marketplace`, which put the word "marketplace" into every fixture id — and `search` prints
   ids in its ID column, so `expect(stdout).not.toContain("marketplace")` started failing on the
   fixture rather than on the CLI's prose. The e2e layer had already learned this
   (`createE2ESource`'s directory is named `fixture` for exactly this reason, with a comment saying
   so) but the reasoning lived in one helper's body rather than anywhere a second author would find
   it. The value is now `test-fixture`.

## Fix Applied

- `create-test-source.ts` gained `TEST_MARKETPLACE_NAME`, `inTestMarketplace(skills)` and
  `testMarketplaceSkillId(bareId)` — the same shape as `e2eSkillId()`, living beside the writer that
  puts the ids on disk. Only the id moves; slugs and categories are not namespaced.
- The three affected files publish their source fixtures through it. Assertions that read an id off
  the fixture array followed on their own; the literal ones were moved to named constants
  (`FIXTURE_REACT_ID`, `CONFIGURED_SKILL_ID`).
- `buildSourceWithDanglingSlugAndAuditContradiction` in `doctor-content.test.ts` now writes a
  `package.json` naming `@agents-inc/skills`, making it the catalogue's own checkout. That is what
  keeps its bare `web-forms-zod-validation` legal, and the doc comment says why.
- Installed/local skills were left bare throughout. A local skill overriding a catalogue id is a
  supported path, not a marketplace claim, and the guard does not touch it.

## Proposed Standard

`.ai-docs/standards/e2e/test-data.md` owns fixture-data rules for the e2e layer and now has a
counterpart obligation for the unit layer that is written nowhere:

> **A fixture source is a custom marketplace.** Any fixture written by `createTestSource()` (or any
> other writer whose output `loadSkillsMatrixFromSource` reads) publishes its skill ids through
> `inTestMarketplace()`. A bare public-catalogue id in a fixture source is refused at load, and the
> refusal is correct — the fixture, not the guard, is what is wrong. The exception is a fixture that
> deliberately models the public catalogue, which declares itself with a `package.json` naming
> `PUBLIC_CATALOGUE_PACKAGE`.

Two supporting notes belong with it:

- The fixture marketplace name must spell neither "marketplace" nor "source", because ids are
  printed in command output and assertions about the CLI's own prose then pass or fail on the
  fixture. This is currently recorded only in a comment inside `createE2ESource`.
- When an audit scopes a breaking rule's blast radius, it must state which layers it measured.
  Journey 26's audit said "e2e fixture sources" and was read as "the fixtures". Naming the unmeasured
  layer would have cost one sentence and moved 52 tests from a surprise into a plan.
