# Roadmap — the order of everything outstanding

A sequencing view over the six per-workspace trackers. **The trackers stay canonical** — rows live
there with their detail, land there, and archive there; this file only orders them and is updated
whenever a phase moves. IDs link back by grep.

**Every row named here exists in a tracker.** If a phase needs something, it is listed by ID rather
than described in prose — a phase that reads as startable must actually be startable.

**Updating this file is step 6 of the lifecycle, not a tidy-up.** It once ran a full day stale while
eleven of its twenty rows landed, which would have told a fresh session the programme had not
started. See the root `CLAUDE.md`.

---

## Running — the owner's board answers of 2026-10-26

**Now (2026-11-04 00:39; lint-rules 0.3.0 committed and pushed; CLI-1107 and CLI-1108 closed; the CLI commit round running (20 commits, release 0.177.0), push and npm publish waiting on the owner; owner: "work on any of these tasks that you can"):** the 31 Oct pause is lifted. Landed 2 Nov (`archive.md`): CLI-1018 03:00; CLI-1015 retired ("Leave it"); CLI-1016 06:05; lint-rules 08:20 (`wf_c5ef5748-7fb`: the owner's two placement answers, the slice-2 follow-ups, the stale-premise tests, the docs lane); CLI-1021 and REPO-50's CLI half 08:23; REPO-50's lint-rules half 08:58 (REPO-50 done); LINT-S2-TAIL and own-lint lane Z 14:16 (`wf_21e9e1ec-081`; the own-lint clean-up is done); REPO-55's CLI half 20:58 (`wf_52329b77-337`: shared helpers, two rounds by area, every gate green, hand-run matched 0.176.0); CLI-1022 21:40; REPO-55's CLI follow-ups phase B part 1 22:10 (`wf_73a20a75-11d`: L8, L9, L10) L12 22:55 (`wf_22b4ecd8-3f1`) and L13 3 Nov 00:20; the q-lint-conditional-expect-placeholders answer in lint-rules' decisions log 3 Nov 00:20; REPO-55's lint-rules half 3 Nov 00:00 (`wf_260057b9-d15`: every round gate green, the end hand-run matched the baseline on all 19 cases). REPO-55's CLI follow-ups phase A 3 Nov 02:50 (`wf_1360fb68-ff9`: update's help and docs, no Codex trust for the home folder, eject names skipped skills, wording, compile/doctor/list/init lines, the site checks; final gate green); CLI-1028 3 Nov 05:20 (`wf_c564168d-64b`: a Claude project under a Codex home counts and copies like its own provider); REPO-55's lint-rules follow-ups 3 Nov 05:35 (`wf_75b494aa-011`: the mutation script's --force advice, the compat list once, shared helpers, tests guarding what a lint-tool user sees; final gate approved, hand-run kit matched); REPO-55's CLI follow-ups part 2a 3 Nov 05:40 (`wf_96233b5a-c35`: doctor's Placements row, e2e test support, env helper, site check name); REPO-55's lint-rules tail 3 Nov 07:35 (`wf_7052cf62-8bc`: load-time folders in six tests, the flaky test's cause, the mutation script's stale results; final gate approved, hand-run kit matched) and its last lane TAIL-2 08:10: REPO-55's lint-rules half is done; REPO-55's CLI follow-ups part 2b 3 Nov 10:05 (`wf_23a9198f-758`: plurals, update's help, the retired-folder notice, warnings once, e2e names and journey rows, shared helpers, doctor docs; regate approved); part 3 3 Nov 11:20 (`wf_c7805b32-d9a`: "1 skill" wording, owed tests and mirror rows, three findings; the double warning did not reproduce); B4 11:35 (plural wording in carried-skill refusals and the install trail, five e2e sites onto a shared helper); CLI-1019's plan 11:35 (71 rows in 8 lanes; row 85's gap filed as CLI-1030). B5 11:45 (doctor's "1 skill not installed as a plugin", three --verbose lines in packages/compile): REPO-55 is done. CLI-1019's run 12:55 (`wf_0508e8c2-9a2`; [record](./plans/2026-11-03-manual-journey-run.md): 77 of 98 verdicts PASS, 3 defects confirmed (CLI-1031 a project uninstall removing the global plugin, CLI-1032 a Codex uninstall deleting the user's empty .claude/, CLI-1033 list's ⏏ wrapping at 80 columns), two journey texts false (CLI-1034), the rest already on file). Its notes and every not-green journey sorted 13:15 (r44/resume-1102/CLI-1019/triage/report.md: 8 fix lanes; 13 defects that fail no journey filed as CLI-1036–1046, CLI-1051–1060 and EDITOR-126/127, EDITOR-130/131; CLI-944 and CLI-970 closed). The owner answered all 11 open cards (3 Nov 12:07–12:11 UTC; `archive.md`). Landed 17:28, final gate green 16:56–17:23 (`wf_9401cf78-683`; `archive.md`; CLI-1054–1060, EDITOR-130/131 filed from its notes, after the commit round): the CLI-1019 fix round — lanes A (uninstall: CLI-1031, CLI-1032, CLI-1025, CLI-1024), B (CLI-1033), C (CLI-1030), D (share --stdin refuses a carried id without external-), E (EDITOR-80/81/87), F (EDITOR-82/88), G (EDITOR-84/86/83), I (CLI-1026, CLI-1029), J (CLI-1023, CLI-1027, REPO-57), K (REPO-59 in lint-rules), then H (CLI-1034 and the docs) and the full gate. Owner, 2 Nov: CLI-1016 "decide whichever is best and queue it", REPO-50 "queue this", expressive-ts rounds in both repos (REPO-55), "at the end run all the cli user journeys by hand" (CLI-1019); at most 6 agents at once. Queue (owner 3 Nov 14:15: parallelise to reach the commit round sooner): CLI-1035 (lane C2) starts the moment lane C lands and an agent slot is free; every journey ran by hand a second time (`wf_37fc25ab-364`, 16:55–18:04): 91 PASS, 0 FAIL, 5 KNOWN, 7 legs BLOCKED as in run 1 (GitHub sign-in, a private source, a real Codex model), 1 not applicable. KNOWN 85 was lane C3's (landed 18:37, approved); 23 and 30 were lane E2's (CLI-1058 with EDITOR-127, `wf_b4c90a1f-12e`, landed 20:10, approved; EDITOR-133 and CLI-1084 filed from it); 26c is the parked CLI-1006; 44b waits on EDITOR-128. CLI-1061 landed 19:56 (`wf_26fe601d-b16`, owner 3 Nov: valid journeys missing from the page get rows): 12 new journeys (rows 86–97) and 15 legs; two held on owner cards (CLI-1078, CLI-1079), one parked under CLI-1006; its notes filed as CLI-1080–1083, EDITOR-132 and WWW-18 (CLI-1083 and WWW-18 go in the docs dispatch after lanes E2 and C4). Then 85, 23, 30, the init journeys C3 touches and every new row are hand-run until green; then a commit round (owner, 3 Nov 12:26: "After these user journeys are finished and once they're all green, then we should have a round of commits"; commit-plan skill); then REPO-56 and REPO-58 (refactors, owner-answered), CLI-1036–1046, CLI-1051–1057, CLI-1059, CLI-1060, CLI-1062–1073 (filed 18:14 from the second run's notes), EDITOR-126, EDITOR-130/131; CLI-1006 parked until the owner's go-ahead. Lane C2 (CLI-1035, "Remove it when this run added it") built and approved 3 Nov 16:33 (`wf_9ae3a49c-638`). Six new owner cards from the round; four answered 16:16 UTC: CLI-1047 (delete the Claude settings files a refused init --from created and left empty) and CLI-1048 (Codex takes back the marketplace it added) built as lane C3 with CLI-1053 (`wf_4f5a6130-4cb`, 17:30–18:37, approved; `archive.md`); journey 85's row gets the new Codex spec and sentence in the docs dispatch, then 85 and the init journeys it touches re-run by hand before the commit round; C3's notes filed as CLI-1074–1077 (two owner cards: q-cli-codex-empty-leftovers, q-cli-refused-init-claude-home-leftovers); CLI-1049 and CLI-1050 closed (keep as is). EDITOR-128/129 still waiting on the owner. CLI-1051 and CLI-1052 after the commit round. The owner unstages everything before the commit round (3 Nov 14:15). Owner 3 Nov 17:40 UTC: the commit round goes ahead with 26c failing under CLI-1006; CLI-1076 and CLI-1077 answered and landed 20:39 with CLI-1074 and CLI-1075 (lane C4, `wf_49c55155-a16`, approved); journey 85 and the uninstall journeys by hand: 29 PASS, 1 NA, 1 FAIL (85ct: on Claude the take-back says it kept a plugin and removes it, CLI-1087, landed 20:55 with CLI-1088 as quick lane L11; 85ct re-run in the crossweb lane; L11's marketplace exception to CLI-1035 confirmed by the owner 19:59 UTC, "Keep both (as built)", CLI-1094 closed). Owner 19:54 UTC: CLI-1086 "Remove it when nothing else is in it", lane L12 since 20:54 (`wf_fda99943-c09`); CLI-1089 "Delete it once empty", closed with no change. Owner 18:48 (chat): EDITOR-128 "Keep init, and say it shows the dashboard", landed 20:32 (lanes E3 and E3b), 44b goes to the third run's crossweb lane; the same claim for the global installation is a new card (EDITOR-134); the new journeys 86–95 and their legs were run by hand 20:13–20:26 (`wf_add60147-d68`): 18 PASS, row 88 PARTIAL (CLI-1085, landed 20:50 as quick lane L10; 88 re-run in the crossweb lane), row 95's powershell leg BLOCKED (not installed); CLI-1086 filed with card q-cli-uninstall-empty-home-config; the editor ones (23, 30, 44b, 96, 97 and the editor legs) after E3 and the docs pass; EDITOR-129 "Keep 50px", closed. Owner 19:13 UTC: CLI-1078 "Say both ways out" and CLI-1079 "Remove the option", running as lanes L8 and L9 since 20:15 (`wf_ee828a02-6b6`). CLI-1079 approved 21:00 (L9); CLI-1078 landed 21:02 (L8; its three dead-end cases answered 20:05 UTC "Name only what works", CLI-1095, quick lane L14 since 21:06, `wf_6ec1cde4-f68`). The docs pass (lane H2: CLI-1083, WWW-18) and the mock fix (L13) landed 21:25 (`wf_132f0f1b-8e3`). CLI-1095 landed 21:34 (L14). Owner 20:31–20:34 UTC: EDITOR-133 left for now (not quick), EDITOR-134 "Say both outcomes", REPO-60 "Narrow the rule, keep 7". H3 (second docs pass, REPO-60) and E4 (EDITOR-134) landed 21:47 (`wf_2844f1b5-507`); EDITOR-135 landed 22:02 (E5); CLI-1086 landed 22:00 (L12, approved). The third docs pass (H4) landed 22:09. Since 22:09: the final hand-run's editor and uninstall lanes (`wf_3a7100cc-708`); CLI-1098 and CLI-1099 landed 22:11 (L15; its questions carded as CLI-1102–1104); H5 (row 98's text) landed 22:15. Owner 21:16 UTC: CLI-1102 "Take-out only, same as the project", CLI-1103 and CLI-1104 no change; since 22:18: quick lane L16 (CLI-1102) then the doctor lane (`wf_8ec4d664-9da`). The final hand-run's editor and uninstall lanes ended 22:40 (`wf_3a7100cc-708`): 52 PASS, 1 FAIL (journey 13a's way out at home with a plugin link: `uninstall` leaves the marketplace registered, CLI-1105, owner card), 1 KNOWN (journey 90, CLI-1092), 1 NA; its notes filed as CLI-1106 and EDITOR-137 and added to CLI-1055, CLI-1092; doc corrections (journeys 2, 13, 38, 51) go to docs pass H6 after L16. Owner 21:49 UTC: CLI-1105 "Keep it registered; fix the row": H6 narrows 13a's way out, and the doctor lane re-runs its home plugin leg. CLI-1102 landed 22:50 (L16); its stopped case is CLI-1107, lane L17 since 22:52 (`wf_29e69c9c-c88`). Docs pass H6 landed 22:59 (CLI-1105 closed); the doctor lane since 22:50 (`wf_8ec4d664-9da`); the doctor cases L17 changes are re-run after it. Owner 20:40 UTC: CLI-1098 "Two tips, one per place" and CLI-1099 "Take-out only", quick lane L15 since 21:41 (`wf_fcac51bb-6b2`); its notes join the third docs pass. Waiting on the owner: the candidate-rule verdicts, the lint-rules run against the CLI, publish. The paragraph below is history.

Beside the lint-rules work (owner, 29 Oct: "use other lanes to continue on the cli monorepo"; 10 agents in total). The first run (`wf_8b89978a-f02`, 29 Oct 20:41) landed SERVER-13, EDITOR-58, EDITOR-61, EDITOR-62, EDITOR-74, EDITOR-90, EDITOR-93, EDITOR-96, CLI-991, CLI-979, CLI-875 and CLI-845's note (`archive.md`, 2026-10-30). The continuation (`wf_6e75c79d-e84`, 30 Oct 02:00) landed CLI-971/CLI-901, CLI-918, CLI-885/CLI-887, CLI-994, CLI-992/CLI-945, CLI-982, CLI-993, CLI-921/CLI-916, CLI-911/CLI-912 and EDITOR-58's page-object moves (`archive.md`, 2026-10-30); it ended 30 Oct 16:35 with CLI-845's rest stopped on one spec defect, now running in `wf_159c81ae-3c3` (30 Oct 17:19, beside the fifteenth lint run, two agents at once): CLI-845's rest (tester repair, then review), then CLI-CROSS-APPLY (the lanes' reported changes to shared files), with CLI-995 and CLI-997 beside them; and a side run `wf_2b802e22-d5c` (17:27): EDITOR-116 (button-group tab order) and research on CLI-998/CLI-999 (what `edit --from` says across marketplaces). The owner's answers (30 Oct ~17:55) ran in `wf_f1e1f649-f7f` (18:03, finished 31 Oct 00:57): CLI-1000 (a config declaring nothing picks the global's marketplace), CLI-1001 (init --from after a refused save), CLI-1002 (update on Codex keeps a plugin off), EDITOR-118 (delete the editor's focus-outline tests), WWW-01's search exclusion, REPO-49 (split the slow CI suites in two) and research on the owner's CLI-916/CLI-917 questions. The side run landed EDITOR-116 and the CLI-998/CLI-999 research (30 Oct 18:47); its follow-ups (`wf_f218cf88-b97`) landed EDITOR-117, EDITOR-119 and CLI-1004 (30 Oct 22:57). CLI-917 and EDITOR-120 landed (`wf_472ebdfa-d5a`, 31 Oct 01:03). CLI-998 and CLI-999 are deferred under CLI-1006. CLI-319 is parked until the owner says. Running since 31 Oct 02:05 (owner, 30 Oct 23:28: "once these existing workflows are done then continue with the rest"): CLI-1002, CLI-1003, CLI-1007 and the 30-31 Oct follow-ups landed 31 Oct 04:10 (wf_e1c42e97-580); quick fixes CLI-1009 and CLI-1010 landed 31 Oct 06:05 (wf_a00c3ad9-642), EDITOR-121 (the owner kept the editor's own copy, 31 Oct); EDITOR-122 and EDITOR-123 landed 31 Oct 06:27 (wf_ba140086-5b1); CLI-1011 and EDITOR-124 landed 31 Oct 07:10 (wf_aadc44b4-c20); CLI-1013 landed 09:11 (wf_a0f36aa2-113), REPO-52 and CLI-FOLLOWUPS-2 landed 09:35 (wf_59d7faf8-7b9); REPO-53 (a spec for the pre-commit hook) landed 10:06 (wf_61eafd28-18a); CLI-FOLLOWUPS-3 (CLI-1008's roster rows) landed 11:52 (wf_492e3105-6e9); CLI-1014 (the CLI unit suite red on a Mac) landed by 12:40 (review 1 approve); CLI-1017 (e2e under a long temp path, review 1 approve) and REPO-54 (CI unit step under a symlinked temp folder, quick) landed 13:20 (wf_4dad6852-5d6); paused at the owner's word (12:41): nothing new starts; CLI-1018 (the temp-folder leftovers) waits; cards CLI-1015 and CLI-1016 open; the owner's 31 Oct answers CLI-1001's last line and CLI-1008 landed 10:49 (wf_437c8c42-422; two new cards, CLI-1015 and CLI-1016); CLI-1012 landed 31 Oct 06:39; lint-rules: the round-2 ruleset answers, test-file extensions and thrown `using` landed 31 Oct 04:20 (eighteenth run); the two lint cards were answered 31 Oct. The lint follow-ups landed 31 Oct 05:07 (nineteenth run). REPO-51 (b) (the briefing move) landed 31 Oct 06:08. lint-rules slice 2 landed 17:24 (twentieth run wf_49d24e69-90a ended red at 16:19; the finishing lane S2-FINISH, wf_fceb0a2e-f90, approved at review 1, gates green): 36 more rules run in oxlint, every shipped rule has a proof on each linter that runs it (four KNOWN GAPs), unicorn/prefer-modern-dom-apis back in ESLint until its card is answered. Left, paused: the lint follow-ups (rule-data's missing `@eslint/compat` devDependency, the twice-kept compat prefix list, test premises and one doc comment slice 2 made false) and the post-slice-2 docs lane; then own-lint Z last. Last: REPO-50 (comment trim) and own-lint Z. The other 28 backlog rows are parked; 30 rows retired (archive.md, 2026-10-26). CLI-996 (owner, 30 Oct 14:10: one line for skipped unregistered skills) landed beside it (`wf_b1c25628-64b`, `archive.md`).

## First — the next push proves REPO-49

REPO-49 landed 30 Oct (`archive.md`): each slow suite runs as two halves on two machines, and docs/architecture.md matches. No half has run on GitHub yet; watch the next push's `e2e-editor` and `e2e-cli` times against the 40-minute limit.

## Next — REPO-44: tech debt and lint rules

Steps 1 (lint-rules measurement) and 2 (CLI-923) landed 2026-10-15, step 8's first Stryker run in 0.170.2;
steps 4-8 landed 2026-10-21 (step 3, the CLAUDE.md and .ai-docs slim, is the owner's later call; step 5's measured rules wait for the lint-rules package run);
the whole-repo expressive-ts rounds landed (lint-rules 2026-10-21; CLI rounds 1–2 in 0.171.0, round 3 2026-10-22).
The wizard removal's loose ends were ruled on the decision cards and shipped in 0.172.0; what was still short shipped
in 0.173.0 (committed and pushed 2026-10-23; npm publish is the owner's). The owner's board answers of 2026-10-23/24 shipped
in 0.174.0 and 0.175.0 (2026-10-28). The 28–31 Oct CLI, editor, server and site work shipped in 0.176.0 (committed and pushed 2026-10-31 19:00, published to npm 19:11), and lint-rules pushed its 12 commits the same evening; the multi-marketplace work (CLI-1006) and its bugs wait until last (below); what is left, in order: `plans/REPO-44-next.md`.
Order: `plans/REPO-44-tech-debt-and-lint.md`. Open and queued, both repositories: [`outstanding.md`](./outstanding.md).

## Last — CLI-1006: several marketplaces in one configuration

Parked until the owner explicitly approves the go-ahead (2026-11-03 17:30: "let's still park that until manually approved to goahead"); not started when everything else is done. Owner, 2026-10-30: "it will be done after everything else". Until then, bugs from mixing marketplaces (logged or newly found, skills dropped or skipped among them) are filed under CLI-1006 and not fixed: CLI-998, CLI-1005 and the sweep's eight new bugs ([`plans/CLI-1006-several-marketplaces.md`](./plans/CLI-1006-several-marketplaces.md)).

## 2026-10-04: the post-CLI-902 audit, rounds 1–6 landed

Following CLI-902, the owner asked for a cycle: run every suite and every user journey by hand, test every new failure,
fix it, and repeat. Six rounds have landed (0.166.0).

- **Fixed:** about 70 issues, each with a test that failed first, and the gates green on this tree after every round.
- **Not tracked:** wizard-only failures. The owner is removing the wizard.

**Open, filed 2026-10-04:**

- **CLI:** CLI-911, CLI-912, CLI-916, CLI-917 and CLI-921 (the doubled cancel message), queued 2026-10-26; CLI-910 retired with the wizard rows. CLI-913 landed
  2026-10-04 (`.claude-src/` support dropped); CLI-908, CLI-909 and CLI-915 in 0.172.0.
- **CLI, deferred by owner:** CLI-914 (`CLAUDE_CONFIG_DIR`).
- **CLI, parked with Codex:** CLI-920.
- **Ruled 2026-10-26:** CLI-919 retired (keep the full list); CLI-918 landed 2026-10-30.
- **Editor, logged but not fixed by owner ruling:** EDITOR-89, EDITOR-91 and EDITOR-92 (EDITOR-80 to EDITOR-88 landed 3 Nov in CLI-1019's fix round).
- **Editor, ruled 2026-10-26:** EDITOR-90 queued (remove the focus-state check).

---

## 2026-10-03: the manual journey run's failures are fixed

**CLI-902 has landed** (0.166.0). A manual run of every user journey against 0.165.0 failed 14 non-Codex
journeys, and all 14 are now fixed as the owner ruled them. Each was done tests-first and verified independently; the
full gates are green on this tree, and the account is in [archive.md](./archive.md).

**Deferred by the same rulings:**

- **CLI-903:** a share carrying more than one marketplace;
- **CLI-904:** custom marketplaces beyond today's rules;
- **CLI-905:** `init --ui --marketplace` opening the editor on that marketplace;
- **CLI-906:** `config.ts` recording several marketplaces.

**The tree is uncommitted.** Read `git status`, not this line.

---

## 2026-10-01: the gate is reverted, Codex stays

The owner ruled on 2026-10-01 that linting and type checking are asked for in the prompt, not enforced by
hooks: _"any changes that were added now to handle stop hooks and lint gates should be removed."_ So the
per-agent lint and check gate built 2026-09-19 to 2026-09-27 — per-agent lint hooks, the `check:` map,
the Codex gate plugin and its hook trust, attempt budgets — is reverted out of the uncommitted tree, and
CLI-715 is retired on the ruling rather than built. **What stays:** Codex as a second provider (below),
the CLI-890 review clean-ups and doc sweeps, CLI-898, CLI-899, the `compile` fix for an installation with
no skills, three fixes the gate work found, reshaped without it, and HEAD's typecheck completion gate as
it was (removed 2026-10-21 on lint-rules answer #9). The account is in [archive.md](./archive.md).

**Waiting on the owner:** his Codex hand-check run-through (CLI-891), and doc round 3 of his full review,
which he put on hold (CLI-890). **The tree is uncommitted** — read `git status`, not this line.

---

## 2026-09-23: Codex landed

Codex landed as a second provider: the provider is chosen per installation and the folder decides it
(`.claude-src/` → `.agents-inc/<provider>/`). Full account, including the `migrate` command built and
deleted rather than shipped, in [archive.md](./archive.md).

_Corrected 2026-09-25: "`.claude-src/` became `.agents-inc/<provider>/`" overstates it. A NEW installation's source folder is `.agents-inc/<provider>/`; an EXISTING `.claude-src/` is still found and used (`sourceFolderInUse` takes the folder already on disk) and nothing in the CLI moves it — the `migrate` command that would have was deleted._

Still open from that programme: the Codex hand-check page for the owner's own confirmation against a
subscription (CLI-891). The hand-check page is written; what stays open is the owner's own run-through of
it.

---

## Where we are — 2026-08-20 (CLI e2e re-measured; CLI unit, tsc/eslint/prettier re-run 2026-08-20; the editor rows are the 2026-08-17 figures and have not been re-run since)

**The Go-Live program is COMPLETE. All three legs are done and every gate is green.**

**The tree is uncommitted again as of 2026-09-02**, and the sentence that used to sit here invited a
reader to disbelieve exactly that. It said the tree had been clean since `155f0662` (0.156.1) and
that any later claim to the contrary was stale — which was true when written and false the moment a
session ran long. It is a standing assertion about a value that changes daily, which is the shape of
claim this file should not carry at all: read `git status`, not this line.

**In flight as of 2026-08-20: the seventeen-ruling round.** The owner settled every open ruling in
one pass — the twelve open rulings of 2026-08-19 (plan file deleted 2026-10-14)
plus CLI-538, CLI-590, CLI-591, CLI-592 and CLI-595. Six closed with no work needed, four of those
because the premise was checked and found narrower than written. The rest are in implementation.

All CLI figures below re-measured 2026-08-20 on a clean tree with nothing rebuilding `dist/` —
which matters, because every intermediate reading taken during the ruling round was corrupted by
concurrent rebuilds swapping tsup's hashed chunks under a running suite. Any E2E number quoted from
mid-round is noise, not a regression.

| Suite                             | State                                                  |
| --------------------------------- | ------------------------------------------------------ |
| CLI unit                          | 181 files / **7,059 passed, 0 failed**                 |
| CLI e2e                           | 230 files / **847 passed, 0 failed** (7 expected-fail) |
| Editor unit                       | 13 files / 293 passed — 2026-08-17 figure, not re-run  |
| Editor playwright                 | 259 passed — 2026-08-17 figure, not re-run             |
| tsc / eslint / prettier           | clean                                                  |
| schemas / types / matrix `:check` | all three green                                        |

`generate:schemas:check` was RED all through the programme — the gate is
`git diff --exit-code src/schemas/` and the tree carried an uncommitted `source` → `marketplace`
rename. **The commit round it was waiting for has happened and the gate is GREEN** — re-run
2026-08-20: `✓ src/schemas matches what the generator emits`.

**Twenty-four rows were retired on 2026-08-17**, six of them closed by proof rather than by a patch —
work that had already been done, been superseded, or never needed doing. `archive.md` carries all of
them with the reasoning.

## What may break, and what may not (owner ruling, 2026-08-16)

A standing ruling. It decides how much compatibility work is worth doing, so read it before
designing around a migration.

| Surface                   | May break                                                                       |
| ------------------------- | ------------------------------------------------------------------------------- |
| **The editor**            | **Entirely.** Nobody uses it and nobody knows it exists                         |
| **Shared config ids**     | **Yes.** Minted links may stop resolving; saved browser stacks may be discarded |
| **Existing CLI installs** | **Yes.** A user's config may need a hand edit, or a reinstall                   |
| **The CLI itself**        | **NOT completely.** A few real people run it; it must still start and work      |

**Intermediate states may be broken.** A half-landed programme is allowed to leave the tree red, a
shared id dead, or an install needing repair. What matters is the END state: everything working,
every gate green.

**So do not build migrations, compat shims or dual-read fallbacks** unless the CLI would otherwise
stop working for someone mid-flight. Discard-don't-migrate is already the seed contract's policy and
is the right instinct everywhere else too — a loud failure that names the fix beats a silent
fallback that hides it. CLAUDE.md's standing ban on backward-compatibility shims is the same rule
from the other direction.

**What this does NOT license:** shipping a state nobody can recover from. When a change breaks an
existing install, the CLI must say so in a way that names the fix — CLI-501's renamed-key guard is
the model: it refuses, names the old key and the new one, and the repair is a one-line edit.

**And the site is not urgent.** `/skills` is live, nobody is reading the docs, so a wrong page
misleads no one — weight doc work by what it unlocks, not by who it inconveniences today.

---

## What happens next — the order is the owner's

Three phases, and the second must not start before the first finishes.

### Phase 1 — the remaining fixes — **DONE 2026-08-17/18**

All seven landed, and they surfaced three more rows along the way (CLI-521 and CLI-522 during the
work, CLI-523 and CLI-524 from the journeys pass). See `archive.md`.

### Phase 2 — the user-journeys pass — **DONE 2026-08-18**

**33 of 39 journeys walked by hand, 19 claims, every one holding.** The harness is
`e2e/handrun-journeys.ts` + `scripts/handrun.mjs`, built on the suite's own page objects and
fixtures; each further journey is 10–15 lines.

**The CLI failed no journey.** Every failure in the pass was the harness or the invocation, twice
because a product guard correctly refused what the harness asked for.

Left unwalked: journeys 25, 26 and 27, which are browser-side and cannot close a CLI row by the
page's own rule.

### Phase 2b — the eight rows phases 1 and 2 surfaced — **DONE 2026-08-18**

The from-scratch gate, the hand-run pass and the findings reconciliation each left follow-ups. All
eight are retired; detail in `archive.md` under this date.

| Row       | What it was                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| CLI-527   | Journey 7's arc had never run end to end — written, and journey 9 closed with it           |
| CLI-528   | The from-scratch gate declined to judge six entries, silently                              |
| CLI-530   | Eight places where the code was fixed and the prose still asserted the old behaviour       |
| CLI-531   | The enumeration-drift checker, filed five times in eighteen days and never built           |
| CLI-532   | `no-self-compare` repo-wide, and the vacuous-comparison widening measured before it landed |
| EDITOR-45 | The own-config restore door pruned the saved selection silently                            |
| EDITOR-46 | The crawl received every skill's size and discarded it                                     |
| EDITOR-47 | A verification note carrying a count nine days stale                                       |

**Three of them found more than they were filed for**, which is the part worth carrying forward:

- **A renamed symbol had inverted behaviour, not just a name.** `globallyInstalledKept` →
  `globallyInstalledRemoved` took a field off `KeptFromRoundTrip`, a parameter off
  `reconcileSharedConfig`, and split one plan into two. Four documentation tables were rebuilt rather
  than renamed. A count check could not have seen it: both totals read 32 against 33, and the real
  defect was three names.
- **An editor e2e spec was asserting a third party's file size.** It reached live `api.github.com`
  with no content stub and passed on the SIZE refusal rather than the "cannot be read" refusal it
  names. It only surfaced because EDITOR-46 gave `docx` its honest weight. Filed as EDITOR-48 — the
  spec is fixed, the missing network guard is not.
- **A spec asserted the silence while the same run logged the loss.** `toBeHidden()` on the exact path
  the app was reporting a six-id prune on, one line apart in the same output.

Two rows came out of it: **EDITOR-48** (no network guard on the editor's Playwright suite) and
**CLI-533** (a one-sentence owner ruling on what `seed-contract.md`'s "Refusals it carries" row
counts).

### Phase 2c — the accuracy programme — **COMPLETE 2026-08-19**

A fourth phase followed the first three, on an owner ruling that **a guard is not a feature**: 54 of
the 58 findings parked as "new work" were returned to scope and executed. See `archive.md` under this
date. It found nine live defects and left the registry at 62 bound rows (counted inside the `REGISTRY` array; the file holds 90 occurrences of `claim:`, and the difference is type declarations, return literals and `claim: string` parameters).

The documentation was re-derived from source across 51 documents on the assumption that all of it was
wrong, and the 382-finding corpus was graded, re-audited and pruned. Both are in `archive.md` under
those dates. The programme then ran in three phases:

- **Phase A — the worklist.** D1–D8 and M1–M20 from the accuracy worklist (deleted 2026-10-14),
  executed across sixteen briefs. **Every one of the sixteen executing agents corrected something in
  its own brief**, which is the single most useful measurement the programme produced.
- **Phase B — all 39 user journeys, walked by hand.** Thirty-six through the CLI harness, two in the
  browser, one closed by construction. It found **two shipped defects that 6,777 unit, 810 e2e and
  297 Playwright tests were all blind to**: a `share` → `init --from` round trip that produced an
  identical config but a different compiled agent, and every editor-minted custom-marketplace id
  being uninstallable (**EDITOR-49**). Neither suite could see either one, for the same reason in
  both cases — each test built both ends of the comparison with the same producer.
- **Phase C — the remaining findings.** 294 triaged with 33 classifications refuted on re-check.
  Fixes landed in seven groups; 131 findings were deleted; the rest are parked as **CLI-554**
  (3 features, after the guards-are-not-features ruling returned 54 of the original 58 to scope), **EDITOR-50** (7; retired 2026-10-26: its lead item landed as EDITOR-48 and the other six were never listed), and **CLI-555** (12 open rulings).

- **Phase D — the session's own output audited, then verified, then fixed.** Three audits (docs,
  tests, journeys) against the assumption that the session's own changes were wrong, on the same
  principle the programme had just applied to everything else. Every finding was then re-verified by
  an agent that was not allowed to fix it, which refuted five and saved two wrong actions. It closed
  with two guards — the drift checker learned to read a table's VALUES (CLI-585), and every wizard
  keypress now asserts the frame is wholly on screen (CLI-586). **The second guard immediately found
  a shipped defect the owner had reported and the orchestrator had failed to reproduce**: a warning
  raised during store hydration went to stderr under a painted frame and was pushed off the top. Nine
  e2e specs across five files were losing the same three lines. Fixed at the buffering window rather
  than at the call sites, so both warning arms and both `init` and `edit` are covered by
  construction. All 36 CLI-drivable user journeys were then re-run by hand: 163 verdicts, none
  failed.

**None of it blocks Phase 3.** Everything was a correction, a guard or a deletion. Every gate in the
repository is green and nothing is committed — the tree carries the whole programme, by the owner's
standing instruction that commits are authorised one round at a time.

### Phase 3 — the commit round

Not before phases 1 and 2. Follow `packages/cli/.ai-docs/standards/commit-protocol.md`. The owner
authorises each round explicitly; never commit unprompted.

---

# Track A — the critical path — **COMPLETE 2026-08-17**

Kept as a record of what shipped and in what order. Every row is retired; the detail is in
`archive.md` under its date.

| Phase     | What it delivered                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| **A0**    | `source` → `marketplace` on the user-facing surface (CLI-501, CLI-463)                                                  |
| **A1**    | Marketplace-namespaced skill ids, closing the collision class by construction rather than by guards (CLI-498)           |
| **Leg 1** | The editor loads a marketplace in the browser, browser-direct against the `catalog.json` that `build marketplace` emits |
| **Leg 2** | External skills survive the trip from the editor into an install — whole directories inline, both directions            |
| **Leg 3** | The round trip: `edit --ui` out, `edit --from` back, destructive and interactive, proven an identity                    |

**The three findings worth carrying forward**, because each cost a rework and each will recur:

- **A provider seat that is correct everywhere except at import time is not a seat.** Two
  module-scope bindings would have frozen the vendored catalogue no matter how correct the store was.
- **`authoritativeScope` protects the config row, not the disk.** The removal _diff_ drives the
  deletions, and a producer that bypasses the wizard store is the first for which those two must be
  made to agree deliberately.
- **A second producer joining an existing sequence inherits neither the first's refusals nor a
  re-costing of its harmless outcomes.** A skip is free into a clean directory and is a deletion over
  an installation.

---

## Explicitly NOT in the program

Owner rulings, recorded so they are not re-litigated:

- **`new skill` (CLI-453)** — go live without it (owner 2026-08-09). When built it mimics the
  editor's intake flow, which is why it waits for that flow to settle, not the other way round.
- **`new agent`** — not returning.
- **The org-hosted editor instance** — a future option contingent on adoption.

---

## The browser is reachable from a cold start — CLOSED 2026-08-24

Both rows landed, and with them the idea they shared: **`--ui` opens whatever `--from` names, and
the command's own subject when `--from` is absent** (owner ruling 2026-08-24). One rule, both
commands.

- **CLI-622 — LANDED.** `init --ui` opens the editor from a directory with nothing installed.
- **CLI-621 — LANDED.** `init --ui --from <id>` and `edit --ui --from <id>` open that id. The pair
  used to be refused as "two directions of one round trip"; `SHARED_CONFIG_ONE_DIRECTION` is
  deleted. The `edit` form needs no installation at all — opening an id reads no local state.
- **`share --stdin` landed beside them**, unrostered: a configuration the CALLER holds becomes an
  id without an installation or a file on disk, which is the door `meta-config-stack-detect` had
  none of. Its snapshot of the wire contract was found stale at `v: 3` against a live `v: 5`
  `z.literal` — so every payload it emitted was already being refused — and is now corrected.

What is left of the cluster is nothing. `share --stdin --ui` was considered and declined (owner,
2026-08-24): publishing stays a visibly separate step from opening.

## The end-game renames

Parked "to the very end" so they would follow a clean commit. That condition is met, but **meeting
it made them available, not required** — these are cosmetic-to-internal consistency wins with no
user-facing capability behind them. Best done as one batch: they touch overlapping surfaces and
re-auditing twice is waste.

**CLI-463 left this group on 2026-08-16** — it is vocabulary-coupled to A1 and moved to Track A. CLI-727
and CLI-425 are not, and stay here.

| ID          | What                                                                                                                                                                             | Status   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **CLI-727** | **Rename project/global scope to project/user** — "global skills" become "user skills" throughout. Nice to have, never a blocker                                                 | Deferred |
| **CLI-425** | Skill-id/category alignment, 33+ sites — a skill id always includes its category. **Re-audit post-taxonomy before executing**; list at `plans/CLI-425-id-category-violations.md` | Deferred |

## Queued by the owner for their own session

- **SERVER-03** — the share-link attribution route; the CLI's user-agent half already ships. Know
  what the number is worth first: the GET is served immutable, so the count is a floor, not a census.

## Correctness rows carried out of pass 5

**All three landed.** CLI-492, CLI-496 and CLI-477 were listed here as `Ready for Dev` long after
they were archived and removed from `cli.md` — which is the failure this file's own rule exists to
prevent, since the trackers are canonical and this document only orders them. Their entries are in
[`archive.md`](./archive.md); nothing is carried.

## Docs and test hygiene

### The green-for-the-wrong-reason census — 2026-08-22

Seven classes were found over this programme; five had never been censused, and were each found
incidentally while doing something else. That is not evidence they were isolated. The census settles
it: **two classes are worth a gate, three are not, and one has no further instances at all.**

- **CLI-655 is closed on a clean negative** — no further half-redirected mocks exist, and the reason
  is that the class was closed at its cause rather than policed at its symptom.

**The finding that generalises**: every class genuinely closed was closed by _removing its subject_ —
constants became functions, a page object became closed-loop, a fixture gained a deliberate
divergence. Gate only where no subject can be removed.

- **CLI-497** — `SOURCE_ROW_WALK_LENGTH` is fixture-sized (12); a larger source under-walks and
  passes vacuously. **This ID has no record in any tracker and none in `archive.md`**, so whether it
  landed, was withdrawn or was never started cannot be recovered from this folder. Re-derive it
  against the tree before acting on it; do not trust this line as a statement of open work.
  (Noticed 2026-09-02.)
- **CLI-596** — all ten E2E fixture skill slugs are already claimed by the default catalogue, so a
  fixture skill has no slug identity in the ~14 mixed-configuration specs. Inert today (no product
  reader of `getSkillBySlug` or `idToSlug`); armed for the first one.
- **D-235** (uncovered `buildProjectTypesExtras` branch) · **CLI-726** (stable test identifiers) ·
  **CLI-723** (a CLI E2E testing skill).

## The site

The site is deployed and `/skills` is live. **With no audience, wrong documentation misleads nobody**
— so none of this is urgent, and it is cheapest to write the docs once the go-live legs have settled
what they describe rather than twice.

Two rows are missing gates rather than missing work, and both were filed after a hand-diff found
something no checker could have: **WWW-12** (`check-cli-claims.ts` reads one page while CLI claims
now live on several) and **WWW-13** (nothing gates the search modal's styling, and it mounts at
runtime so even a computed-style check has to open the modal first). Neither blocks anything; both
are the kind of row that only gets written while the memory of the defect is fresh.

Then the build-out: **WWW-02** (5 of 12 landing blocks, and the catalogue teaser — the centrepiece —
is not one of them) · **WWW-03** (apex path split — **the repository half landed 2026-09-01**; what
remains is a Cloudflare dashboard move, a token scope, and an acceptance pass against the real
hostname, so it is now blocked on the owner rather than on work. **It is also blocked on REPO-41**,
because CI has deployed nothing since 2026-08-30) ·
**WWW-01** (what is left of it — the reference is per-group rather than per-command, and there is no
Releases section) · **WWW-06** (empty video slots — needs your recordings).

**WWW-01 shrank on 2026-08-27** when the site went from 19 pages to 37 and from five sidebar groups
to nine — Configuration, The editor, Recipes and Troubleshooting joined, and the exhaustive
`.claude-src/config.ts` field reference closed what that row called the single largest gap on the
site. One of its bullets was **withdrawn rather than done**: the owner ruled that the older
README-linked guides carry the correct voice, which is the reverse of what the row asserted, so a
future pass must not "fix" them. WWW-04, WWW-07, WWW-08 and WWW-10 all landed and were removed from
the tracker; this line named them for a fortnight after they had.

## 2026-09-01/02 — the apex split shipped, and a share defect took eleven rows with it

**WWW-03 landed**: `agentsinc.sh/` is the landing page, `/docs` is Starlight, `/editor*` is a
Cloudflare Route. Verified against the real hostname rather than a preview, because no local
modality serves the apex as it exists. The dashboard step turned out to be unnecessary — `wrangler
deploy` reassigned the Custom Domain itself, non-interactively, which the tracker had recorded as
unverified and warned against finding out on production.

**REPO-41's token half**: CI had deployed nothing since 2026-08-25 while every check job stayed
green, because a D1 migration step ran under `bash -e` before `bun run deploy` with a token that
predated the database. Sixty commits and two releases were sitting unshipped.

**Then a single bug report — "the stack detector failed with a 400" — opened a class.** The CLI
validated a piped configuration with the READ schema while the worker's POST used the WRITE one, and
the one rule they differ by is easy to compose by accident. Closing it reached the CLI, the editor,
both test doubles, the skill that produced the payload, and the documentation on both sides:
CLI-837, CLI-848, CLI-849, CLI-851, CLI-852, CLI-853, WWW-16, EDITOR-64 and EDITOR-65 all landed,
and every one is in [`archive.md`](./archive.md).

**Two results worth carrying forward.** The unit suite was downloading a GitHub marketplace once per
test — 31 tarballs a run — which had been read as a flaky timeout; removing it took the suite from
90s to 31s. And every compiled sub-agent had been instructed to use a `Skill` tool its own
frontmatter never granted, because enumerating `tools:` opts out of a default.

**What is open is small and filed**, and was scrutinised against the repository's own bar on
2026-09-02: thirteen rows became eight, with CLI-858, CLI-864 and EDITOR-68 retired unbuilt, CLI-866
moved to `repo.md` as REPO-42, and nothing left at `Needs Assistance` — see `archive.md`. What
remains is CLI-854 through CLI-857, CLI-865, EDITOR-66, EDITOR-67 and EDITOR-69, and the seven
ready ones are being run one lane at a time — the queue, the file ownership and a per-dispatch
corrections ledger are in
`archive.md`, under the 2026-09-03 entry closing the programme. Its run sheet was a temporary file
and was deleted when the second pass finished.
**All eight ready rows landed 2026-09-02** — CLI-854, CLI-855, CLI-856, CLI-867, CLI-870 (was
CLI-857), EDITOR-66, EDITOR-67 and EDITOR-69, each with an `archive.md` entry. A verification pass
proved seven of them real by mutation and un-landed none. **What remains open** is EDITOR-71,
EDITOR-72 (REPO-42 landed 2026-10-26), all filed by those lanes; plus the docs and test-gap
follow-ups the verification pass named.

## In flight — the summoner context-engineering programme (started 2026-09-03)

The owner's five context-engineering rules for frontier models, applied to `agent-summoner`,
`skill-summoner`, the shared template and the standards that govern them. Rules, rulings, baseline,
per-pass narratives and the corrections ledger are in
[`plans/summoner-context-engineering-2026-09-03.md`](./plans/summoner-context-engineering-2026-09-03.md)
— **that file is canonical for this work, not this section**, which only orders it.

The shared render path went from six methodology partials to one, and both summoners' playbooks
from roughly 1,460 lines each to a few hundred. Review passes run eight independent read-only
lenses and continue until one turns up nothing; the verifier is never the fixer.

| Phase                                                  | Rows             | State                                                           |
| ------------------------------------------------------ | ---------------- | --------------------------------------------------------------- |
| The two summoners, the template and the four standards | —                | **landed 2026-09-03** — see `archive.md`; final gates all green |
| Migrate the other sixteen agents to the same voice     | CLI-871          | landed (retired 2026-10-26)                                     |
| Follow-ups the programme raised                        | CLI-872, CLI-873 | ready, not started                                              |
| Decisions returned to the owner                        | CLI-875          | answered 2026-10-26 ("Add (a) only"); queued                    |

## In flight — the editor v6 design programme (started 2026-08-26)

**EDITOR-09** retired 2026-10-26: every phase landed (D as EDITOR-54); what is left is phase E, EDITOR-56. It was no longer design-gated: the design folder was refreshed in place on 2026-08-25 and
the programme is running. Phases, decisions and the live dispatch log are in
[`plans/editor-v6/`](./plans/editor-v6/) — **that folder is canonical for this work, not this
section**, which only orders it.

| Phase                                                                                                                                                                                                                                                                                                                                                                                                  | Rows      | State                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — chrome and roster: design tokens, the effort word, the roster group-by toggle, the collapsible stack header, the roster hinge header, the ink token rename                                                                                                                                                                                                                                         | EDITOR-09 | **Landed**                                                                                                                                                                                                               |
| B — the output preview: a shared pure renderer the CLI's write path also calls, then the dialog                                                                                                                                                                                                                                                                                                        | EDITOR-52 | **Landed and retired** — extraction verified by imports, not intent                                                                                                                                                      |
| C — the docked composer, UI only                                                                                                                                                                                                                                                                                                                                                                       | EDITOR-53 | **Landed and retired** — shipped in a shape the row never described: no modes                                                                                                                                            |
| D — the composer's AI backend                                                                                                                                                                                                                                                                                                                                                                          | EDITOR-54 | **LANDED 2026-08-29** and retired — `POST /compose` calls Claude, the composer is wired to it, and Turnstile was replaced by required sign-in                                                                            |
| E — the proposal diagram: `MatrixGrid` becomes a diff, so a proposal can draw a REMOVAL                                                                                                                                                                                                                                                                                                                | EDITOR-56 | **Ready for dev** — owner-ruled and fully designed in `phase-c-spec.md` §11.1/§11.9/§11.10                                                                                                                               |
| F — the 2026-08-30 design refresh: sign-in up the rail, the theme glyph, domain titles as tabs, the filters out of the search field, the composer's new drawing                                                                                                                                                                                                                                        | EDITOR-09 | **LANDED 2026-08-30** — five items in one session, no dispatch; it REVERSED the composer's starter chips, which Phase C had shipped                                                                                      |
| G — the 2026-09-05 design refresh: `selected` onto the skills hinge, full-width domain tabs, the first stack cell as the reset, a full-row assignment pulse, three action cells over Install, the preview's fullscreen + splitter, the composer's field filling its band, one icon set, receding disabled cells, the `#faf8f2` column, the amber field on the active nav item and the grouping control | EDITOR-09 | **LANDED 2026-09-05** — eleven items in one session, audited by an 11-lane workflow and implemented directly; it REVERSED Phase F's `selected` chip, its `N skills selected ✕` block and its 25px-Inter active tab label |
| H — the 2026-10-11 v6 handoff: inset card outline, providers as step 01, sub-agent cards, filters in the search field, sliding domain indicator, rail 05 header and group-by tags, named saves, real Codex models                                                                                                                                                                                      | EDITOR-09 | **LANDED 2026-10-11**, released 0.168.0 2026-10-14 — 9 lanes by workflow; seed v6 only; Argos baselines await approval; follow-ups EDITOR-93, EDITOR-96                                                                  |

**Four rows were found landed-but-open while Phase G was closing**, all staged before it began:
EDITOR-76 and EDITOR-79 were finished and are retired with archive lines; EDITOR-77 and EDITOR-78
each had half built and were narrowed rather than deleted (EDITOR-78 has since landed and is retired). Worth stating as a pattern rather than as
four incidents — the rule is that a row goes when it lands, and a batch staged across sessions is
exactly where that gets missed.

**Phases F and G are why "there is no v6" is not the same as "the design is fixed".** The folder is
refreshed in place, so the citation never rots and the claim always can: two of the programme's own
recorded rulings were reversed by the 2026-08-30 refresh, and G then reversed three of F's own five
items six days later. A brief quoting the plan rather than re-reading `decisions.md` would have
rebuilt what the refresh had just cut, twice. **Re-read the design folder before dispatching against
it**, whatever this roadmap or that plan says.

**Phase E exists because a ruling went missing.** The diagram ruling was recorded only inside Phase
C's spec, and Phase C is retired — so until 2026-08-26 the work was reachable from no tracker and no
roadmap. It was listed after D by dependency-freedom rather than by need; D has since landed.

**EDITOR-10 (the researcher row) LANDED 2026-08-26** and is retired. Its stated gate — "a fifth
column diverges from a design file that draws four" — had expired without anyone noticing: the code
drew TWO, because CLI-398/CLI-399 consolidated the per-domain reviewer and PM, so adding researchers
moved the panel toward the design rather than away. The skill options panel now places all 18
sub-agents; it placed 14.

## The editor, beyond go-live

**EDITOR-22** (a "custom skills only"
filter — provenance is a filter, not a category) · **EDITOR-28** (favourites) · design-gated:
**EDITOR-07** (five never-designed surfaces).

## Housekeeping

**`MONOREPO_DISPATCH_TOKEN`** in the skills repo — until it exists the catalog-regen automation does
not fire (`repository_dispatch` reads the token, not the workflow), so a marketplace merge still
wants the catalog regenerated by hand here. State unconfirmed as of 2026-08-16; check before
assuming either way. · **CLI-467** (the knip deletion rounds against the recorded baseline) ·
**REPO-37** (dependency-cruiser graph + one architecture assessment) · **REPO-40** (the residue after the one-mock migration) · **CLI-737** (README GIF).

## The editor's open rows this file did not carry

Added 2026-08-29 after an audit found the roadmap listing five archived ids and none of the editor's
newer ones. EDITOR-51 was here for a few hours and is archived — the error colour was chosen the
same day. **EDITOR-55** (responsive below 1300px) · **EDITOR-58** — now ONE accessibility defect, not
three: `nested-interactive` and the missing `h1` landed 2026-08-29, and `scrollable-region-focusable`
is live on the output-preview state, which is why it outlived them · **EDITOR-61** (a ruled-out cell
offers three controls that do nothing) · **EDITOR-62** (the proposal footer says "1 changes" — the
model is wired now, so the count that was unreachable is reachable) · **EDITOR-63** (two literals
standing where imports belong).

## Waiting on an owner signal

**SKILLS-01** + **CLI-405** (adapter migration, ~160 skills) · **SKILLS-09** (the observability setup
skill is Next-only in all but name) · **CLI-739** (prune built-in stacks) · **SERVER-01** registry
adapters (each lands only with hand-verification against the live registry) · **CLI-453**
(`new skill`).

**SERVER-02 landed 2026-08-29** — one configured client in the editor, mocks and unit coverage
for the three newest worker clients. The lane declined to create `packages/api` and **the owner
overruled that on the same day**, on the measured grounds that the bundle cost was negligible; the
workspace exists, and `apps/server/src/index.ts`'s `AppType` is imported by it and by the server's own tests.

## The long tail

`cli.md` carries roughly a hundred further rows — wizard UX polish (CLI-311 to CLI-316), expressive-
TypeScript decisions (CLI-324 to CLI-330), agent-roster work (CLI-380 to CLI-384), telemetry
(CLI-731, CLI-725), and the older feature backlog (CLI-714, CLI-716, CLI-718, CLI-719, CLI-720). **This roadmap does not
replicate them and is not trying to** — the tracker is canonical. They surface here only when
something promotes them into a leg above.
