# Session queue — 2026-10-01: revert the gate, keep Codex

Owner, 2026-10-01: _"any changes that were added now to handle stop hooks and lint gates should be
removed. And the only changes that should exist ... should be changes to make this work with codex."_

## Owner rulings (closed)

- The per-agent lint/check gate leaves the uncommitted tree: `src/gate/`, `gate-plugin/`, the `check:` map,
  the Codex gate plugin and hook trust, seed wire v6, CLI-892, CLI-897, CLI-900 and Q3.
- Keep the work that is neither Codex nor gate: CLI-890 clean-ups, doc sweeps, CLI-898, CLI-899 and B2.
- Leave HEAD's typecheck `Stop` hook (`COMPLETION_GATE_COMMAND`) alone.
- Keep three fixes the gate work built, reshaped so they carry no gate vocabulary:
  - model/effort carried through `edit --from`;
  - `validateMarketplaceSource` accepting any local directory;
  - the Claude folder-trust notice, now about HEAD's `Stop` hook.

## In flight

- **Post-CLI-902 audit (owner, 2026-10-03):** run every suite and every journey by hand. Document each new failure
  in the root `audit-issues.md`, test it, fix it, and repeat until clean.
  - Copies: `audit-base` (the hand-run build and the servers: worker 8787, editor 5173), `audit-gates` (the
    unfiltered suites) and `fix3` (the three failing unit tests, one background agent).
  - Suites and journeys are done; the findings are in `audit-issues.md` (17 open). The three unit tests are fixed
    and applied, and CLI-868 is archived.
  - Fix cycle 1 (`wf_1789f996-dbb`): all four lanes finished, and both reviewed lanes passed. The merge was
    running when the machine went down. On reboot, `systemd-tmpfiles` emptied `/tmp`: the two simple lanes' copies
    and the merge copy were lost. The reviewed lanes' diffs (issues 1, 2 and 8) were saved to `audit-fix-1/` in
    the journey-fixes folder.
  - Round 2 (18–24) is applied (`audit-fix-2/`), and every gate on the tree is green.
  - Round 3 (25–33, 35, 37, 38 and the reserved-names doc) is applied (`audit-fix-3/`, 63 files) by workflow
    `wf_dd017c1b-6d8`. Every gate on the tree is green.
  - Round 4 (44–47, 57–63, 66–69) is applied (`audit-fix-4/`) by workflow `wf_89669085-ec1`, and every gate is
    green.
  - Round 5 (78, 79, 80) is applied (`audit-fix-5/`) with every gate green. Its hand-run found 90, a regression from
    80's fix.
  - Round 6 (81–90) is applied (`audit-fix-6/`, 53 files), and every gate is green with nothing re-run. Its hand-run
    found 91–100, in `audit-issues.md`. The next round waits on the owner.
  - Working area: `~/.claude/projects/-home-vince-dev-cli/cli902-work/`. The servers on 8787 and 5173 run from this
    tree.

## Done

- CLI-902 landed, uncommitted, 2026-10-03. Red (`wf_10a74c24-e0e`), green (`wf_23ae7fe7-b63`) and merge
  (`wf_387c91fd-32f`) are done. The combined diff is applied to this tree and the gates are green there; the record
  is `progress.md` in the journey-fixes folder. Filed CLI-903 to CLI-907.

- Round-2 rulings recorded, 2026-10-02: `journey-issues.md` now holds the final ruling per issue, what each fix
  becomes, and two open questions. The round-2 prototypes are kept in the journey-fixes folder's `round2/`. New
  rows: CLI-902 (the programme), CLI-903 (a share carrying more than one marketplace, later) and CLI-904 (custom
  marketplaces beyond today's rules, later). Nothing is applied.

- Round 2, `wf_d171a07e-ed4`: 13 items answering the owner's 2026-10-02 rulings. Each was investigated by the area
  developer and fact-checked by `reviewer`, and all came back CORRECTED, meaning the reviewers sharpened the
  findings. Three of the owner's premises do not hold: u02's tombstone is project-only, `marketplace.json` is not
  required (u06), and the documented decision allows two marketplaces (u07). There are 19 new questions, all in the
  tracker. Nothing is applied.

- Root-cause investigation `wf_a6028e31-162`: 14 issues from the manual run, all CONFIRMED by an independent reviewer.
  13 are real bugs and 1 is a local setup gap. 4 are regressions (0.133.0, 0.142.2, 0.155.0 and 0.159.0) and the
  other 9 never worked. Each fix was proven test-first in a scratch copy. All 14 combine into one patch that applies
  cleanly to HEAD, and every gate is green on it apart from one artefact of the scratch copy. The tracker is
  `journey-issues.md` at the repo root, and the patches and records are in the journey-fixes folder. Nothing is
  applied to the tree. The owner decides, and five rulings are listed in the tracker.

- Manual journey run, 2026-10-01: all 68 rows driven by hand across eight lanes, with no test suites.
  46 PASS, 5 FAIL (8, 23, 29, 30, 48), 14 PARTIAL, 2 signed-in halves BLOCKED, and 1 N/A. The record, with every
  reproduction, is the manual-journey-run plan beside this file. Nothing is fixed;
  it waits for the owner to triage.

- Commits and release: 27 commits (`80b5f979`..`3ecb959a`), release 0.165.0, all with `--no-verify` on the
  owner's instruction. Not pushed or published.

- Full test run `wf_234bb2cb-a0b`, on the owner's request, all green:
  - CLI vitest 265 files / 7,876 tests, of which integration is 12 / 205 and commands 21 / 471;
  - CLI e2e: 272 files, 1,053 passed, 9 expected fails, 3 todos;
  - smoke 48/48;
  - editor: Vitest 542 plus 1 expected fail, Playwright 608, visual 13;
  - compile 127, matrix 338, server 90, ui 125, api 9, api-mocks 27;
  - www: all 5 claim checks;
  - no flakes and no retries.

- Final gates, all on the final tree:
  - typecheck and lint across 10 workspaces;
  - deps:check, generate:*:check and db migrations;
  - CLI unit 7,876/7,876;
  - CLI e2e: 272 files, 1,053 passed, with 9 expected fails and 3 todos (the same counts as before);
  - smoke 48/48 and editor Playwright 608 passed;
  - web units: compile 127, matrix 338, editor 542, server 90, ui 125, api 9;
  - Claude hand-run 183 PASS and 0 FAIL; journey harness all HOLDS;
  - Codex hand-run: 355 PASS and 1 FAIL. That failure predates the revert and is filed as CLI-901.
- Final acceptance audit `wf_5cba3baa-084`: every gate finding is fixed. Codex text inaccuracies that predate the
  revert are reported to the owner rather than fixed (ruling 5).
- knip is not a gate. The revert orphaned `codexMarketplaceExists` and `refreshCodexMarketplace`, so both were
  un-exported.

- Reconcile `wf_3cbba563-ecd`: 5 domains audited and fixed. The amendment-5 home-folder guard went in test-first.
  The red-check marked every rewritten spec PROVEN.
- Goldens re-recorded (3/3, none skipped) and equal to the prediction. The digests are back to the pre-gate values.
- Forced full build: every workspace builds, and the editor fits the 344 KiB first-paint budget.

- Revert workflow `wf_9db99b27-64a`: all 15 lanes landed. The reports are in the scratchpad: `revert-reports.json`,
  `requests.txt`, `deviations.txt` and `rewritten-proofs.txt`.
- Integration so far: `bun install` (lock resynced), generate:matrix/compile plus their checks, build. Typecheck and
  lint are clean in all six workspaces. Units are green: cli 7,874, compile 127, matrix 338, editor 542 and server 90. The one server failure came from parallel load; it passes alone.

- Integration prep is in the scratchpad's `integration/`: `REGENERATE.md` (order: install, generators,
  build, golden re-record, digests), `GATES.md` and `run-gate.sh`, plus `handrun-codex.sh` and
  `handrun-claude.sh`. `bun.lock` was already stale before the revert (no `smol-toml`).

- todo/ drafts applied: `cli.md`, `archive.md`, `ROADMAP.md`, the three Codex plans, and the new
  `CLI-codex-provider-progress.md`. Deleted the CLI-715 plan and progress file, the check-map progress file,
  and the hand matrix along with its directory.

- Classification workflow `wf_4edbd698-9b9`: all 834 files classified. The results are in the scratchpad,
  under `classify/`.
- Backup of every changed file: the scratchpad's `pre-revert-worktree-backup.tgz`. The git index still holds
  the staged pre-revert state of every file.

## Waiting

- Integration: regenerate goldens and the corpus, then build, typecheck, lint, unit, e2e and the editor
  Playwright suite. Fix what's left in file-owning lanes, with a verifier that never fixes.
- Hand-run the CLI on a Codex install and on a Claude install.
- Docs residue sweep.
