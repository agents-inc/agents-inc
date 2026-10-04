# CLI-902 progress: the manual journey run's 14 failures

The decision record is the root `journey-issues.md`. This file holds the programme's sequence and state, and the
per-dispatch tally that the briefing contract's rule 13 asks for.

## Sequence

1. **Red.** One tester per lane writes the tests and proves each fails for the right reason.
2. **Green.** One developer per lane makes them pass, applies `meta-design-expressive-typescript` and runs the
   journeys by hand. A `reviewer` then re-proves red to green independently.
3. **Merge.** All lanes are combined in one scratch copy, and every gate runs there unfiltered. The docs pass
   (codex-keeper role) runs next, then a `reviewer` checks the combined result.
4. **Land.** The orchestrator applies the combined diff to this tree, re-runs the gates, runs the journeys by hand,
   and updates `todo/`.

**Lanes:**

| Lane          | Items                                                                                          | Roles                     |
| ------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| `share`       | u01 share side; `share` refuses ejected; two-folder check; folder and two-marketplace warnings | cli-tester, cli-developer |
| `from`        | `--from` lists, then asks; from a project, `--from` never removes or changes anything global   | cli-tester, cli-developer |
| `loader`      | u07; no-terminal refusals; u08; u11; `--from` load warnings; unparseable SKILL.md warning      | cli-tester, cli-developer |
| `marketplace` | u06: a valid `marketplace.json` is required; fixtures carry one                                | cli-tester, cli-developer |
| `config`      | u05, u10, u13                                                                                  | cli-tester, cli-developer |
| `edit`        | u02, u12, u14                                                                                  | cli-tester, cli-developer |
| `editor`      | u03, u04; the preview going stale after a marketplace loads                                    | web-tester, web-developer |
| `server`      | u09                                                                                            | api-tester, api-developer |

## State

- **2026-10-02, red stage done** (workflow `wf_10a74c24-e0e`, 8 testers). Every lane's tests fail on the assertion
  that states its bug. Three items were already correct and stay as guard tests: S6, and two of E1's plugin cases.
  The orchestrator answered every tester question in the lane brief, and the owner is told about each. The green
  stage is dispatched.

- **2026-10-03, merge done and landed** (workflow `wf_387c91fd-32f`: merge, two follow-ups, docs, final review).
  - The final review passed.
  - The orchestrator applied the combined diff (206 files) to this tree.
  - Every gate ran unfiltered here. The only failures are three CLI unit tests that predate CLI-902: two
    `check-finding-citations` cases (CLI-868, tripped by the staged manual-run plan) and one TMPDIR-sensitive
    `compile.test.ts` case, which passes with the default TMPDIR.
  - The orchestrator hand-ran a bare `init` with no terminal, and an unbuilt then a built marketplace.
  - The docs pass changed nothing, per the owner's instruction. The orchestrator deleted the two false site sentences
    the final review found.
  - Filed: CLI-907.

## Dispatch tally (briefing contract, rule 13)

| Rows                               | Corrections                                                                                                                                                           | Changed the work?                                                            | Hand-off |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| share (u01, S2–S6)                 | brief's bun `--cwd` gate form runs nothing; S6 already works for plugins; round 2's S3 test sat on an ejected install                                                 | yes: S3 rebuilt on plugins, S6 kept as a guard                               | path     |
| from (F1, F2)                      | bun gate form; global `config.ts` can't stay byte-identical for `init --from` into a new project (it registers the project)                                           | yes: the assertion narrowed to an already-registered project                 | path     |
| loader (u07, u08, u11, L2, L5, L6) | bun gate form; the typecheck chain stops on `apps/server` errors in a copy; round 1's u07 helper note reversed                                                        | no                                                                           | path     |
| marketplace (u06)                  | bun gate form; "every command refuses" conflicts with the picked option; e2e fixtures shared across lanes under TMPDIR; round 2's "75 unit tests" miscounted          | yes: compile, list and uninstall keep working; TMPDIR made private per agent | path     |
| config (u05, u10, u13)             | bun gate form; C2 understated (share, search and list also read past a broken global config); round 2's u13 diff doesn't skip the size wait                           | yes: wider refusal set; the size wait is implemented                         | path     |
| edit (u02, u12, u14)               | bun gate form; E1 overstated two plugin cases; a fresh copy fails typecheck until `apps/server` is built                                                              | yes: two plugin cases became guards                                          | path     |
| editor (u03, u04, W3)              | bun gate form; wrong Playwright import path; the `apps/server` "errors" were a missing `dist`                                                                         | no                                                                           | path     |
| server (u09)                       | bun gate form; the round-2 prototype applies no migrations; "sign-in fails silently" is a D1 500                                                                      | yes: migrations added to scope                                               | path     |
| share (green)                      | the red stage's list of specs that relied on sharing ejected skills missed `share.test.ts`; new STEP_TEXT turns `check-enumeration-drift` red until four docs name it | no                                                                           | path     |
| from (green, 2 rounds)             | nothing in the brief; its own round-1 report repeated an already-answered question                                                                                    | yes: round 1 replaced held rows, which the owner's update forbids            | path     |
| loader (green, 3 rounds)           | its own claim that `suppressInTest` had no caller was false (two `packages/compile` callers)                                                                          | yes: the option is kept where it is still used                               | path     |
| marketplace (green, 2 rounds)      | its round-1 "list and uninstall work as before" was false for a global uninstall with registered projects                                                             | yes: upkeep loads added                                                      | path     |
| config (green)                     | long TMPDIR wraps paths inside oclif errors (HEAD too); round 2's u05 label wording was wrong                                                                         | no                                                                           | path     |
| edit (green)                       | lanes.md E1's plugin cases overstated; round 2's plugin-halves prototype not reusable                                                                                 | yes: the prototype was dropped                                               | path     |
| editor (green, 3 rounds)           | "red before the fix" held only in its own copy: against HEAD the tests didn't load; the brief's `test:e2e` gate reuses a server on 5173                               | yes: the tests were made to load on HEAD                                     | path     |
| server (green)                     | the post-red "answers 503" line is true only with no readable index; the README's migrations claim was already false                                                  | yes: the offline line was reworded                                           | path     |
| merge                              | `generate:types:check` needs a sibling `skills` checkout a copy lacks; six e2e files fail on wrapped temp paths at the gate's TMPDIR                                  | yes: those specs were made wrap-proof (follow-up 6)                          | path     |
| follow-up server                   | its first stub also silenced wrangler's own GitHub call; the server e2e isn't hermetic when wrangler's skills cache is stale                                          | yes: the stub was narrowed                                                   | path     |
| follow-up cli                      | the edit lane's claim that `s` over a global plugin used a fresh marketplace copy did not hold in the merged copy                                                     | yes: only the same-mode fold needed the fix                                  | path     |
| docs                               | the prompt's docs scope conflicted with the owner's later instruction, which won                                                                                      | yes: no docs changed                                                         | path     |
| final review                       | "every new test fails on HEAD" doesn't hold for controls and guards, by design                                                                                        | no                                                                           | path     |
- 2026-10-04: CLI-913 landed. Corrections: nothing (default node is v18; gates need Node 22). Agent slipped one write-class git command (failed, nothing staged).
- 2026-10-04: CLI-913 follow-up landed. Corrections: the literal lives in install-layout.ts (a drift check forbids a lone string in messages.ts); an untracked packages/cli/.claude-src/ folder keeps the grep from being clean.
