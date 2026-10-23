# REPO-44 — what runs next (2026-10-22)

Owner, 2026-10-22: **every commit round is a release** (version bump, changelogs) that the owner
publishes to npm. Rows are deleted as they land (one line
to [`archive.md`](../archive.md)); the run log is [`REPO-44-progress.md`](./REPO-44-progress.md).
Card answers: [`outstanding.md`](../outstanding.md), verbatim in the session's
`r44/cards2/answers-round*.json`. Commit rounds: one planner, minutes, about 10–20 commits, no tests
(root CLAUDE.md); the owner commits, pushes and publishes.

## Resume here (2026-10-23 evening, after the account switch)

Running: lint-rules lanes LA (guards and standards: the CLAUDE.md never-default line, `default: throw` house rule,
collect-time throws, hand-split guard, parallel-load timeouts, status.md's stale "uncommitted" cells) and LB (narrow
mutation runs); reports land in the session's `r44/lint-followups/LA-report.md` and `LB-report.md`. If interrupted,
re-dispatch from those briefs' items (outstanding.md's lint-rules row); a lane with no report file has not finished.
Next for lint-rules: the own-lint clean-up (s-lint-rules-own-lint-gate, size L) after LA, then a reviewer and a gate.
The board moved to https://claude.ai/artifact/4GpMMzy64wzXqSPZaghWTJ (all 396 records restored). The old lint
answers page (https://claude.ai/artifact/52mc1h8u4wtpFYTR5pRLAp) holds nothing new: all 193 answers match the
2026-10-17 export already acted on.

- **CLI commit round 2 → 0.173.0:** everything uncommitted is built, reviewed and gated (run `wf_d904175e-f2b`:
  build, static, CLI unit headless, wide through turbo and directly at 120 columns, CLI e2e, other units, editor
  e2e 930, server e2e). The plan is drafted, read-only: session `r44/commits/plan-cli-0.173.0.md` (13 commits + the
  release; every one of the 148 paths placed). It runs on the owner's go ("commit, push" or invoking the commit-plan
  skill); npm publish needs `npm login` on this machine (`npm whoami` fails) or the owner publishes.
- **lint-rules 0.2.0:** committed and pushed (`66284c0`..`35a334d`, pushed 16:47 by `wf_25ad1b74-882`). Not
  publishable yet (package private; first-publish checklist open).
- **Owner answers:** queued after the round, each with a tracker row and a board item: CLI-931 (no notice for old
  `.claude-src/` folders), CLI-946 (refused version check stops init and edit), CLI-947 (delete the summary panel's
  scroll code), CLI-948 to CLI-952, SKILLS-17, REPO-45, and outstanding.md's lint-rules row. Follow-ups: release.md's bun.lock step is false; `setSkillOption` has no
  already-in-effect guard (held-skill lane's outsideLane note).
- **Open on the board:** the 72 rule-candidate cards and 3 bulk cards (the owner pastes answers in chat), card
  q-stack-load-fails-no-dialog, q-lint-own-calls, the stale-doc verdicts; the owner's notes on
  q-cli-retired-folder-notice and q-commit-plan-skill-tracking were read as stated in the session's
  `r44/openq/answers-board-2026-10-23b.json` (confirm).
- **Workboard backup:** the board's page and every record (396 files) are saved in the session's `r44/workboard-export-2026-10-23/`. The new subscription could not open the old board, so it was rebuilt from there on 2026-10-23 (https://claude.ai/artifact/4GpMMzy64wzXqSPZaghWTJ).
- **Gate commands:** call the repo's turbo (`npx turbo`), never a bare `turbo` (an old global 2.4.4 that hangs under
  `script`).

## Commit round 2 — CLI 0.173.0

Phase F's fixes, round 3's refactors, the Marketplace lanes (E2-market, E2b, E2c with the owner's answers), F5c with
its set-aside fix and the repaired-copy line, the held-skill fix, the verify fixes, findings and docs;
`chore(release): 0.173.0` (minor: doctor and the editor's saved configurations behave differently). Git ignores the
commit-plan skill and the recompiled agents, so neither is in it. `packages/compile/src/config-source.ts` (now
exports `EXTRACTED_FIELDS`) and `packages/cli/src/cli/lib/config-gate/classify.ts` (imports it) land in the same
commit.

## Later (owner)

Candidate lint rules; running lint-rules against the repositories (then REPO-44 step 5's rules); the
`CLAUDE.md` and `.ai-docs` slim (REPO-44 step 3). Open questions: https://claude.ai/artifact/4GpMMzy64wzXqSPZaghWTJ.
