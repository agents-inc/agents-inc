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

- The commit sequence, run on the owner's instruction (2026-10-01): 26 commits and the 0.165.0 release commit, all
  with `--no-verify`. The owner ruled out tests and lint between, before and after, because the full run below had
  just passed. Push and publish wait for the owner's own confirm.

## Done

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
