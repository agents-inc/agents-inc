---
type: standard-gap
severity: medium
affected_files:
  - packages/cli/e2e/helpers/test-utils.ts
  - packages/cli/src/cli/lib/__tests__/fixtures/create-test-source.ts
  - packages/cli/eslint.config.js
standards_docs:
  - .ai-docs/standards/e2e-testing-bible.md
  - .ai-docs/standards/typescript-types-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: missing-rule
status: open
---

## What Was Wrong

The dominant shape in the e2e suite is:

```ts
let fixture: E2ESource; // no `| undefined`
beforeAll(async () => {
  fixture = await createE2ESource();
});
afterAll(async () => {
  if (fixture) await cleanupTempDir(fixture.tempDir);
});
```

TypeScript has no flow analysis across hook callbacks, so `fixture` is typed as definitely
assigned. `no-unnecessary-condition` therefore reports the `if (fixture)` as always-truthy — in
**49 places across 40 files**, the single largest cluster the rule produced.

The guard is not dead. If `beforeAll` throws before the assignment lands, `fixture` is `undefined`
and `afterAll` masks the real setup failure with a `TypeError`. The declaration is the lie; the
guard is the only thing describing reality.

Three fixes were considered and two rejected on evidence:

- **Delete the guards.** This is what the rule's autofix mentality points at, and it would have
  removed 49 runtime protections on the word of a type that is wrong. It is exactly the shape
  `2026-08-07-two-type-checked-rules-read-a-type-graph...` warns about: the deletions read as
  progress in a diff.
- **Make the declarations honest** (`let fixture: E2ESource | undefined`). Correct, and measured:
  it produced **251 `possibly undefined` errors** across the same 40 files, because every use site
  inside `it()` bodies then needs narrowing. The honest declaration is right and its cost is a
  task of its own.
- **Move the guard to where the type can be honest** — adopted.

## Fix Applied

`cleanupFixture(fixture: { tempDir: string } | undefined)` in `e2e/helpers/test-utils.ts`, and the
matching widening of `cleanupTestSource(dirs: TestDirs | undefined)` in
`src/cli/lib/__tests__/fixtures/create-test-source.ts`. Both no-op on `undefined`; both carry a
comment saying why the parameter admits it.

The 49 sites became `await cleanupFixture(fixture);` — passing a `T` to a `T | undefined`
parameter, which no rule flags. Every guard's runtime effect is preserved, nothing was deleted,
and no `eslint-disable` was needed. One site (`unified-config-view.e2e.test.ts`, whose teardown
derives a path from the handle rather than reading `.tempDir`) took the honest declaration instead,
because in a single file the cascade is zero.

## Proposed Standard

`e2e-testing-bible.md` should state the rule directly, because it is a property of the hook model
rather than of any one suite:

> **A `let` assigned inside `beforeAll` / `beforeEach` is not definitely assigned.** TypeScript
> types it as though it were; the hook can throw first. Never delete a teardown guard on that
> variable because a type-aware rule calls it redundant — the rule is reading the declaration, and
> the declaration is optimistic.
>
> Put the guard in a helper whose PARAMETER type admits `undefined` (`cleanupFixture`,
> `cleanupTestSource`) rather than at the call site. One honest signature retires the whole class;
> the alternatives are ~50 disables or ~250 narrowing edits, both measured.

`typescript-types-bible.md` should cross-reference this as a third entry in its "when a type-aware
lint verdict is not evidence" list, beside the DefinitelyTyped and laundering-helper classes — it
is the same failure with a different cause, and it is by far the highest-volume of the three.
