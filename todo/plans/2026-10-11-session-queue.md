# Session queue — 2026-10-11

Owner request: implement the v6 design handoff (`.claude-design/CHANGES-v6.md`, spec
`design/Configurator v6.dc.html`) in `apps/editor`, plus a Save naming dialog (not in the design).
Programme: EDITOR-09 → `plans/editor-v6/`, **Phase H**, spec `plans/editor-v6/phase-h-spec.md`.

## In flight

Scripts dir `S` = `~/.claude/projects/-home-vince-dev-cli/6d388755-f9dd-400e-9d4a-8a0547680e18/workflows/scripts/`.
Liveness: mtimes under `…/subagents/workflows/<run>/`. All runs below were interrupted ~16:15 (session ended mid-red, nothing cached) and relaunched 16:40 with a RESUMED note in `extra`.

| What | Run                                          | Resume |
| ---- | -------------------------------------------- | ------ |
| —    | none: Lane T approved and trimmed 2026-10-12 | —      |

E2E ports: C 5211, S 5212, B 5213, R 5214, V 5215, X2 5216, trim 5217 (+100 dev server, +50 scratch).

Done: V2 follow-ups; docs pass (no change). **S2 + V2 `wf_88b24338-556` approved.** **Lane I `wf_eed1aec6-f79` approved** (gates green bar CLI-922; design audit clean bar ruled Q6/Q8). audit `wf_8a584385-cae`; Lane X spec `wf_85b92dbf-a01`; Lane F `wf_5065e041-2f0`, Lane X1 `wf_ca63642f-e4b` (both approved round 1); F comment trim; X1 follow-ups; Lane R `wf_1061e38f-e08`, Lane B `wf_43245675-a7b` (approved round 1); Lane V `wf_98cca703-9df` (approved round 2); X2 + C (round 1), S (round 2) `wf_efa2681a-24c`. **Phase 2 complete.** X1's 3 CLI doc-drift reds → lane I.

## Waiting — all done 2026-10-11 (final report delivered)

1. Lane I (alone, after all of phase 2): page-object callers, leftovers, `glyph.tsx:70` stale "Hide stacks"
   comment, unfiltered root gates + editor e2e, visual baselines (human), docs via `codex-keeper`
   (incl. `model-and-effort.md`, `codex-hand-check.md` ~217, `check-enumeration-drift.ts` binding of `CODEX_MODEL_NAMES`);
   `a11y.spec.ts` ~104 audits the removed placementNotice (repoint at C's error mark or delete);
   B hand-offs: Tab in stuck bar jumps scroll ~400px/stop (pre-existing, suspect scroll-padding-top in use-scroll-clearance.ts); dark stuck band contrast ~1.1:1; stuck band 80 vs v6-09 ~64 (match design); stale index comments configure-page.ts ~396/401, viewport.ts ~8, playwright.config.ts ~24;
   V hand-offs: accounts.spec.ts ~336 stale "adoption is not re-attempted" clause (delete); `readSavedStack` → `readSavedStacks` in marketplace-store(.test).ts comments; unused `savedStack` getter (configure-page.ts) and `saveNarrating` (roster-panel.ts page);
   X2/C hand-offs: seed.test.ts ~423 inherit test proves nothing (give entry `codexModel: "inherit"`); v6-08 tip visual baseline; `--tip-field` → warm-06; no-write guard test for moveRememberedPluginsToGlobal;
   `read-piped-payload.test.ts` hard-codes `v: 6`/`v: 5` → `SEED_VERSION`.
2. ~~Hand-run~~ done by lane I design audit (every v6 screen at 1684 + 1200/1500/dark, Claude+Codex).
3. After S2+V2: brief `codex-keeper` pass on **high-level docs only** (www user docs, READMEs; owner 2026-10-11: no detail-doc upkeep; editor-spec.md table drift dropped) → `reviewer` unfiltered root gates; detail docs touched only if a gate goes red.
   Then `todo/`: README Phase H LANDED; EDITOR-09; EDITOR-95 delete; archive lines; ROADMAP.
4. Lane S2 (spec §Lane S2, Q5: Codex model toggles, no `inherit` segment) — after lane I; tester → developer → reviewer, port 5218.
   Lane V2 (spec §Lane V2, Q10: owed save name clash → field error) — in parallel with S2, port 5219.
5. Final report: deploy worker before v6 links; v5 links/saves stop loading; Codex list pinned to 0.155.1;
   real-account check of each Codex model advised.

## Rulings applied this session

- Q1: **real Codex models** on sub-agent cards → Lane X (contract change).
- Q3: save names unique (trimmed, case-insensitive) against every grid name; refuse, no Replace; no rename/delete UI.
- Q4: seed v6 **only**. "When in doubt, err on not being backwards compatible": no saved-stack migrate.
- Comments: none unless tricky; trim in every touched file. Docs: terse.
- Q2 (spec default): folds 01–03 persist, 04 never.
- Q5 Codex card drops `inherit` (toggles, none = session model); Q6 names keep ellipsis at every width; Q7 owed-save retry into any account kept.
- Q11 stuck tabs 3rem; first/last tab text inside the page padding, only bg + border full width (Lane T).
- Q8 dark mode accepted as is (EDITOR-94 closed); Q9 `--tip-field` warm-06; Q10 owed save name clash → Save dialog with field error "names must be unique" (Lane V2).
- Lane I fix 2 was briefed before Q6-wide/Q8 — accept or revert its dark/truncation changes on landing; design-audit3 findings on those are ruled.
- Save naming dialog built despite CHANGES-v6 §10: owner asked directly.
