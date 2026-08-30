---
type: standard-gap
severity: medium
affected_files:
  - apps/editor/e2e/specs/output-preview.spec.ts
  - apps/editor/playwright.config.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-08-26
reporting_agent: web-tester
category: testing
domain: e2e
root_cause: convention-undocumented
status: open
---

## What Was Wrong

The repository's stated order of work is tests first: root `CLAUDE.md` step 1 is _"Write the tests
first — end-to-end plus whatever else fits — and watch them fail. A test that has never failed has
not been shown to test anything."_ Under Vitest that instruction is safe, because a file whose
import cannot resolve is isolated: the other files still run and the runner still reports their
counts. **Under Playwright it is not**, and the difference is the whole of this finding.

Writing `apps/editor/e2e/specs/output-preview.spec.ts` before its subject existed produced this,
verbatim, from `bun run test:e2e` in `apps/editor`:

```
Error: Cannot find package '@/features' imported from /home/vince/dev/cli/apps/editor/e2e/specs/output-preview.spec.ts
error: script "test:e2e" exited with code 1
```

No project started, no spec ran, and **no count of any kind was printed**. The suite has 33 spec
files and 353 passing tests; all 353 were skipped by one unresolvable import in a thirty-fourth
file. Standing the missing module up as a four-line stub and re-running gave `353 passed` plus the
27 new failures — so the 353 were never in doubt, only unreachable.

The same absence measured against Vitest, in the same package and the same red phase:

```
 Test Files  3 failed | 17 passed (20)
      Tests  4 failed | 420 passed | 1 expected fail (425)
```

Two of those three files reported `(0 test)`; the other 17 ran and were counted. Same defect, same
tree, opposite blast radius.

**What makes it worth recording is that the exit code cannot tell the two apart.** Both the aborted
run and the run where 27 assertions genuinely failed exit 1. `packages/cli/CLAUDE.md` already
carries the neighbouring rule — _"a run that aborts on the guard collects ZERO tests, and a
zero-test run reads as a pass if only the exit code is checked"_ — but it is stated about
`assertDistIsFresh` under Vitest, where the tell is a `(0 test)` line beside a named file. Here
there is no file list to read, because the reporter never reached the point of printing one.

The import is not gratuitous, which is why "do not import app source from a spec" is the wrong
lesson. A Playwright spec runs in Node, so it can call the app's own pure modules directly, and
that is what lets a rendered assertion bind to the model that produced it rather than to a string
typed into the spec — the difference between checking that a preview pane shows the renderer's
bytes and checking that it shows bytes somebody transcribed. `apps/editor/tsconfig.e2e.json` gained
the app's path aliases in the same pass so `tsc` resolves what Playwright already resolved.

## Fix Applied

None — discovery only, and the hazard is live in the tree as handed over. The spec is red-first by
design and its import will resolve the moment the developer creates
`apps/editor/src/features/configure/lib/output-preview.ts`. Recorded rather than worked around,
because the workaround (dropping the import) would cost the assertion the spec exists to make.

Measured rather than reasoned: both runs above were executed, and the stub was created and deleted
to obtain the second reading. Census of specs in `apps/editor/e2e/specs/` importing app source is
exact at one — `output-preview.spec.ts` — via
`grep -rln 'from "@/' apps/editor/e2e`.

## Proposed Standard

Two lines, both for `.ai-docs/standards/e2e/README.md`, and neither conflicts with anything in
`packages/cli/CLAUDE.md` — the existing E2E rules govern locators, page objects and constants, and
say nothing about module resolution at collection time.

1. **A red-first Playwright spec that imports a module which does not exist yet blanks the whole
   run.** Create the module first — an exported signature returning an empty value is enough — then
   watch the spec's own assertions fail. The red phase being watched has to be the assertions', not
   the loader's, and only the first of those two is evidence about the test.

2. **Read the collected count, never the exit code.** A Playwright run that reports no counts at all
   ran nothing; a Vitest run that names a file with `(0 test)` beside it ran nothing about that
   file's subject. Both exit 1, and so does a run where every assertion was checked and one failed.

Declines a mechanical check. The obvious one — asserting the run's spec-file count — would have to
live somewhere that runs after Playwright, and Playwright's own reporters do not run when collection
aborts. The cheaper answer is the ordering rule above, which removes the situation rather than
detecting it.

Deliberately not merged with
`2026-08-26-a-vitest-workspace-that-collects-only-stories-swallows-a-unit-test` or
`2026-08-26-the-binding-vi-mock-needs-hoisted-is-the-one-in-its-argument-list`. Those are the
Vitest-side members of the same class and each has a different tell: the first is GREEN with the
file absent from the output entirely, the second is red with the file named and `(0 test)` beside
it. This one is red with **no output about any file**, which is the only variant where the runner
tells you nothing about the scope of what it skipped.
