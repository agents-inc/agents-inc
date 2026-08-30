# Session state — 2026-08-10 (HISTORICAL — do not read this first)

> **Superseded, and kept only as a record.** It was written as a hand-off and opened "read this
> first", which is why it moved here on 2026-08-29: it sat at the top of `todo/` claiming NOTHING
> had been committed, against a tree that has moved on by well over a hundred commits, and it was
> named in CLAUDE.md's `todo/` inventory nowhere and linked from nothing. Every figure below is a
> fact about 2026-08-10. Re-derive before acting on any of it.

**The working tree carries ~96 uncommitted paths and NOTHING has been committed.** `HEAD` is
`67418c07`, level with `origin/main`. The owner runs every commit; git writes are forbidden to the
assistant (this includes `stash`, `checkout`, `restore` — read-only git only).

## What is in the tree, uncommitted

1. **CLI-481** — the plugin/marketplace category threading, verified against the real Claude CLI.
2. **The pass-5 fix programme — 16 rows landed** (CLI-478/479/480/482/483/484/485/486/487/488/489/
   490/491/494/495 and CLI-470 leg 1). Retired from `cli.md`, recorded in `archive.md`.
3. **The triage documents**: `plans/cli-flow-verification-fifth-pass-2026-08-10.md` (the pass, the
   adjudication, and the honest diff against two earlier wrong rounds) and the updated
   `packages/cli/.ai-docs/standards/e2e/user-journeys.md`.
4. Tracker edits: the rows above retired, CLI-492/493/496/497 filed.

## Verified state as of the last run

| Gate                               | Result                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| Full unit suite                    | 138 files, 6302 passed, 3 expected fail                            |
| Full e2e suite                     | 203 files passed, 0 failures (7 expected-fail, 11 skipped, 3 todo) |
| `tsc --noEmit` (src, scripts, e2e) | clean                                                              |
| `eslint .`                         | clean                                                              |
| `prettier --check`                 | clean                                                              |

The 11 skipped e2e include the 10 of `edit-project-source-migration-propagates`, retired
deliberately — see CLI-496.

## What is left, in the order I would do it

1. **CLI-492** (medium) — which agent definitions feed `config-types`: init's write and the
   background loader see CLI∪source, edit's write and compile's refresh see CLI-only, so a
   source-defined agent name can enter the generated unions from one path and never compile. Align
   all three on CLI-only.
2. **CLI-493** (easy, broad) — the codex-keeper documentation pass. It should absorb: M-2's three
   stale sites, `load-agent-defs.ts`'s false JSDoc, `scope-system.md`'s badge notation, the
   journeys doc's `claude plugin marketplace update` correction, the re-status of the two findings
   CLI-481 obsoleted, **and two drifts found while landing CLI-479** — `component-patterns.md` still
   tables hotkey constants that have never existed (`HOTKEY_SETTINGS`, `HOTKEY_ADD_SOURCE`), and the
   `STEP_TEXT` member count is stale in two docs (they say 139; it is 149).
3. **CLI-496** (medium) — the propagation defect that survives on a narrower path.
4. **CLI-497** (easy) — the fixture-sized `SOURCE_ROW_WALK_LENGTH`.
5. **The commit round** — the owner's, via `/commit-plan`. It is large: ~96 paths spanning the
   CLI-481 work, sixteen fixes, their tests, the page-object re-point, docs and trackers.

## The process every one of these followed, and must keep following

The repository's law, and the owner's explicit instruction after the suite was found green over
every one of these defects: **tests first, watched RED** (a test that has never failed has not been
shown to test anything) → implement → the `meta-design-expressive-typescript` skill over the changed
code → **run the real CLI by hand** and confirm both the output and the generated files, not just
green assertions → docs via codex-keeper. Each fix also went through an adversarial verifier that
re-ran the tests, compared the test source against the captured red output to prove nothing was
weakened, and rejected generic hand-run evidence.

## Two process notes worth carrying forward

- Two sub-agents ran a forbidden git command (`git checkout --`, once each, as careless no-ops).
  Neither mutated anything — verified by checksum both times — and both self-reported. Brief every
  agent that read-only git is the ONLY permitted form.
- `git stash list` shows 9 entries that predate this work. Their provenance is unknown to the
  assistant (lint-staged's backup stash is one plausible source); nothing here touched them.
