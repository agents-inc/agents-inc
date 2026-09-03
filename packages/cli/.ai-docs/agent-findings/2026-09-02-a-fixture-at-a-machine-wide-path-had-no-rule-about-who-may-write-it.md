---
type: missing-standard
severity: high
affected_files:
  - packages/cli/src/cli/lib/__tests__/helpers/shared-source.ts
  - packages/cli/src/cli/lib/__tests__/helpers/shared-source.test.ts
  - packages/cli/src/cli/lib/__tests__/helpers/shared-marketplace-checkout.ts
  - packages/cli/src/cli/lib/__tests__/helpers/shared-marketplace-checkout.test.ts
  - packages/cli/src/cli/lib/__tests__/helpers/isolated-home.test.ts
  - packages/cli/src/cli/lib/__tests__/shared-fixture-writers.test.ts
  - packages/cli/package.json
  - .husky/pre-push
standards_docs:
  - .ai-docs/reference/testing/factories.md
date: 2026-09-02
reporting_agent: cli-tester
category: testing
domain: shared
root_cause: missing-rule
status: resolved
resolved_by: The two fixture modules now take their root as a parameter, their specs drive them at roots they create, the marketplace record is written on every call rather than only after a fetch, `isolated-home.test.ts` pins both `linkSharedCache` call sites, and `shared-fixture-writers.test.ts` holds the whole rule against a walk of the tree.
---

# A fixture at a machine-wide path had no rule about who may write it

Three tracker rows (CLI-859, CLI-860, CLI-862) arrived separately and are one subject: a family of
test fixtures living at fixed `os.tmpdir()` paths, with nothing written down about who owns them.

## Why the path is fixed, and what that costs

`globalSetup` runs in vitest's own process and the specs run in forked workers, so the fixture's
location cannot be handed from one to the other — both sides compute it. Two of these exist:
`agents-inc-e2e-shared-fixtures` (the frozen E2E source tree) and `agents-inc-unit-shared-cache`
(the unit suite's checkout of the default marketplace, added by CLI-853 a day earlier).

**The address then belongs to the machine rather than to the run**, and nothing in the codebase said
so. The unit and E2E projects are separate vitest runs over one tree; `turbo run test test:e2e` is
one invocation and two concurrent tasks.

## The three instances

**The unit suite deleted the E2E suite's fixture (CLI-862).** `shared-source.test.ts` is collected
by the `unit` project and called `buildSharedSource` on the real E2E path in six specs, plus
`removeSharedSource()` in an `afterEach`. Reproduced by planting a file under
`/tmp/agents-inc-e2e-shared-fixtures/` and running that one spec file: seven passes, and the planted
file gone. Every spec on both sides reports green — the E2E side because it is not running yet, and
the unit side because deleting someone else's fixture is exactly what its specs asked for.

**The marketplace checkout published before it recorded (CLI-859).** `ensureSharedMarketplaceCheckout`
did `rename(staging, checkoutDir)` and only then wrote the record; the record is a SIBLING path
(`${cacheDir}.etag.json`), so the rename does not carry it, and the guard was
`directoryExists(checkoutDir)`. A run killed between the two lines therefore left a directory the
guard accepts and a record `classifyCachedCopy` answers `unrecorded` to — **permanently**, because
every later run returns early over the directory. Measured through the real binary against a fake
home linked to the shared cache: 0.76s over a recorded checkout, 3.80s over the interrupted one,
with all 3739 files rewritten. The docblock claimed the invariant the code did not hold ("after
which the directory's presence means the checkout is complete").

**The wiring that made the checkout reach anything had no pin (CLI-860).** `shared-marketplace-checkout.test.ts`
covered the helper; nothing covered the two `linkSharedCache(fakeHome)` calls in `isolated-home.ts`,
so both could be deleted and the whole suite stayed green. Its symptom on return is a timeout, which
reads as flake — that is what cost CLI-853 a full investigation.

## What was fixed, and what the fix is worth

**The rule, stated:** a fixture at a machine-wide path is written by the runner that owns it and by
nothing else. It sits in `shared-source.ts`'s own docblock, is referenced from
`shared-marketplace-checkout.ts`, and is repeated in the two places that already discuss the
suites running concurrently: `packages/cli/package.json`'s `//test` note and `.husky/pre-push`
(both of which previously explained only the `dist/` tsup race).

**The seam that makes the rule followable:** each mutating helper now delegates to a mechanism
taking its root as a parameter — `buildFrozenSourceTree` / `removeFrozenSourceTree`, and
`ensureRecordedCheckout`, whose fetch is a parameter too so its spec neither downloads nor touches
the shared checkout. The shared path is supplied at the one call site that owns it. This is what
turns "please do not build here" into "a spec has somewhere else to build".

**The enforcement:** `shared-fixture-writers.test.ts` compares, for each writer, the set of files
that INVOKE it against a stated roster, using the AST reader in `test-only-invocations.ts`. It
fails in both directions — a new caller is not on the list, and a RENAMED writer has no caller at
all, which is the quieter half a name-keyed scan otherwise loses silently. Proven by planting a
second writer and watching it name the offending file.

**The ordering fix that was proposed and not taken.** CLI-859's row proposed moving the `writeFile`
above the `rename`. That is correct — the inverse window (record present, directory absent) is
handled, because the guard keys on the directory and the next run rebuilds. It was not taken for
two reasons. The first is that nothing could pin it: the only difference between the fix and the
defect is the order of two statements inside one function, observable solely by mocking
`fs/promises` — and the function short-circuits once `globalSetup` has published, so the mock would
have to be driven at the real shared path, which is the very thing this finding forbids. A fix
whose reversal nothing catches is CLI-860's complaint one module over. The second is that the
ordering closes one window and no more, where writing the record UNCONDITIONALLY repairs a checkout
that has lost its record for any reason at all — including a `/tmp` reaper, which deletes files and
would take the small record from beside the large directory. The repair costs one small write and
never a fetch, because a published checkout is complete by construction; that is asserted, since a
repair that re-downloaded would be the same defect paid for once instead of forever.

## The shape to carry forward

A shared fixture's docblock will always argue for the sharing, because that is the decision its
author was making. It has no reason to say who may write it — that question only appears when a
SECOND suite exists, and by then the first module is the precedent the second is copied from.
`shared-marketplace-checkout.ts` was written a day before this finding by copying `shared-source.ts`,
including its silence.
