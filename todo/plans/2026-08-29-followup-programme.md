# The 2026-08-29 follow-up programme

Everything the day's audits filed and the owner then asked for in one batch. **This file is the
progress record, not the specification** — each row's detail lives in its tracker. Its job is the
one CLAUDE.md names: a correction read once and discarded measures nothing, so every dispatch gets
a line here as it lands.

**Recertification is part of the programme, not after it.** The owner asked for it explicitly:
every part complete, tests updated, docs updated (process step 5), trackers updated (step 6). A
lane reporting green is not the same claim.

| #   | Item           | What it is                                                              | Lane         | Landed      | Recertified                       |
| --- | -------------- | ----------------------------------------------------------------------- | ------------ | ----------- | --------------------------------- |
| 1   | EDITOR-59      | Applying an account stack does not seat the catalogue its payload names | A            | yes         | upheld — 3 mutations, 3 red sets  |
| 2   | EDITOR-58      | Three axe defects held out of the gate                                  | B            | **2 of 3**  | upheld — third defect reproduced  |
| 3   | EDITOR-60      | A duplicate skill id in a proposal cancels itself                       | C            | yes         | upheld — mutation reddened        |
| 4   | SERVER-05      | The authenticated half of `/stacks` is pinned by `tsc` alone            | C            | yes         | upheld — mutation reddened        |
| 5   | 401 shape      | `compose.ts` declares a different 401 body from the stack routes        | C            | yes         | upheld — mutation reddened        |
| 6   | Dark baselines | Chromatic and Argos cover one theme; the app ships two                  | D            | yes         | **half pinned** — see log         |
| 7   | MSW everywhere | Two mocking conventions for one worker                                  | E            | **partial** | upheld both ways — see log        |
| 8   | REPO-39        | `remeda` undeclared in compile; three unused deps in ui                 | F            | yes         | upheld — `deps:check` goes red    |
| 9   | REPO-38        | axe audits crash under parallel load                                    | G            | yes         | upheld — worker cap is measurable |
| 10  | db:generate    | The migration check runs in CI only, not turbo or the hook              | orchestrator | yes         | upheld — no test, and none can    |

## Dispatch log

One line per lane as it lands, including what its brief got wrong. A silent report is
indistinguishable from a brief that held.

**This log was written late, and that is itself the programme's largest correction.** Every lane
above had landed before a single line of it existed, and the table's Landed column was empty while
all ten were done. The owner asked "have you acted on all the findings" and the honest answer was
only reachable by re-auditing a tree that should have been recorded as it moved. **Step 6 was
skipped ten times out of ten** — six rows were still sitting in their trackers, zero lines had been
appended to `archive.md`, and `archive.md:5206` positively asserted that five of these ten were
"what did not get done". A reader arriving cold would have concluded the programme never started.
The rate that matters here is not the sub-agents' error rate; it is the orchestrator's, and it was
100% on the step CLAUDE.md says is how work is finished.

- **Lane A — EDITOR-59.** Landed. `seatCatalog` extracted to `seat-catalog.ts` and called from both
  arms of `use-apply-stack-request.ts`; `ui-store` gained `catalogueNotice` / `marketplaceRecovery`.
  Recertified by mutation rather than by reading: three separate edits produced three **disjoint**
  red sets (seating removed → 4 failures across both the remote and local arms; the notice silenced
  → 1; the parking removed → 2), which is the shape a spec has when each clause is pinned
  separately, and is not the shape contamination produces. **Correction:** the row's own text says
  the work is "gated today by an expected-failure spec … which must lose its `test.fail()`". No
  version of `saved-stack-apply.spec.ts` on disk or anywhere in history ever contained `test.fail()`
  — `git log --all` on that path prints nothing, because the file is untracked. The clause was
  unverifiable rather than false, and it did not touch the verdict.
- **Lane B — EDITOR-58.** **Two of three.** `page-has-heading-one` fixed by an `sr-only` `<h1>` in
  `route-components.tsx`; `nested-interactive` fixed by making the cell's operability a sibling
  `<LatticeCellButton>` rather than the cell itself. Both proved by reversion — putting `role` and
  `tabIndex` back on `LatticeCell` reddens `a11y.spec.ts`, deleting the header reddens it
  differently. **The third is live and was found by writing a throwaway probe rather than by
  reading the config:** an audit with only `color-contrast` disabled fails on the output-preview
  state with `scrollable-region-focusable` at node `.overflow-auto`. So the disableRules list is
  down to two entries and the row keeps exactly one of its three clauses.
- **Lane C — EDITOR-60, SERVER-05, 401 shape.** All three landed and all three upheld by mutation.
  `trustedIds` dedupes at the worker boundary and reverting it reddens `compose.test.ts`;
  `withoutOwner` is now pinned by a seeded-session test rather than by `tsc`; `UNAUTHORIZED` is
  declared once in `auth.ts` and spread by **five** guarded routes, not the four the row named.
  **Correction:** the row said four.
- **Lane D — dark baselines.** Landed, and the recertification is the interesting half: **only one
  of the two baselines is pinned by anything that can fail.** The Argos side runs through
  `visual.spec.ts`, which is a real Playwright suite. The Chromatic side is `parameters.chromatic.modes`
  in `.storybook/preview.ts` — configuration read by a hosted service, so nothing in this repository
  can go red if it is deleted. That is not a defect to fix; it is a limit to know, and it is why the
  dark work needed the token-parity checker (`check-token-parity.ts`) as its actual gate.
- **Lane E — MSW everywhere.** **Partial, and consolidated further in this same pass.** The seam is
  real and adversarially proved: inverting the CORS guard inside `answerFor` reddens two named
  Playwright tests, so the Playwright half genuinely resolves the shared handlers. What was still
  untrue is the "everywhere": six raw `page.route` calls survived in specs and twenty-nine handlers
  were defined outside the package. All six are now converted and the duplicate handlers moved —
  `grep -rn 'page.route(' apps/editor/e2e/specs | wc -l` → **0**. Twenty-three handlers remain
  outside `packages/api-mocks` and each is a request-capturing spy or a deliberately malformed body,
  which belong beside the test that asserts them. **Two raw routes are permanent and named as such**
  in `stub.ts` and `fixtures.ts`: the per-origin interception itself, and the third-party guard,
  which must stay the OLDEST route or "you forgot a stub" stops being reportable. **The consolidation
  lane's own correction is worth more than its diff:** it reported an interim run of 407/63 as its
  own operational error (two overlapping Playwright runs sharing one dev server through
  `reuseExistingServer`), rather than reporting the green re-run alone.
- **Lane F — REPO-39.** Landed. Proved the only way a dependency fix can be: deleting
  `"remeda"` from `packages/compile/package.json` leaves `deps:check` **fully green**, because knip
  reads the manifest it is checking. So the gate cannot catch a regression here and the fix is held
  by nothing but the manifest itself — worth knowing before trusting `deps:check` on this class.
- **Lane G — REPO-38.** Landed as a worker cap rather than a split: `a11y.spec.ts` is now its own
  Playwright project with `workers: 1`. Recertified by measurement rather than by reading the
  config — deleting the one line and re-running with `--workers=4` moves `parallelIndexes` from
  `[0]` to `[0,1,2,3]` and the duration from 88.6s to 18.6s, so the line is load-bearing.
- **Lane orchestrator — db:generate.** Landed into `turbo.json` and `.husky/pre-commit` under the
  same `...[HEAD]` filter as lint and test. **No test pins it and none can** — nothing in the
  repository reads `turbo.json`'s task list or the hook's contents. Recorded rather than papered
  over.
- **Cross-lane hazard, found by lane B and worth carrying forward.** Two verification lanes ran
  mutate-run-restore against the **same working tree at the same time**, and lane B caught a file
  mid-mutation: `playwright.config.ts` briefly had its `workers: 1` cap missing while the comment
  above it still described that state as the REPO-38 reproduction. Both lanes restored correctly and
  lane B proved its own results uncontaminated by md5 rather than by diffstat. **The rule this
  earns: a lane that mutates source to prove a test can fail must own its files exclusively, or run
  in a worktree.** Concurrent refutation on one tree is the one place `isolation: "worktree"` pays
  for itself.
