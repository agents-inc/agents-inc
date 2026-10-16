# Session queue — 2026-10-14 (CLI-923)

Scratch (`/tmp/claude-1000/…/scratchpad`) was wiped by 2026-10-15 11:48: gate logs, `snap/`, lane notes and
screenshots are gone. Repro scripts survive in `plans/2026-10-15-manual-journey-run/repro/`.
Owner: no documentation beyond false sentences; no progress file, no findings.

Owner (2026-10-15): no upfront census — delete, let tests fail, fix in parallel.

## Landed

**CLI-923 landed 2026-10-15** (tracker row deleted, archive line, ROADMAP). Runs: `wf_059aff20-5f3`,
`wf_3e49ddb2-ff6`, `wf_668896e3-0b6`, `wf_6699fd7a-59f`. Root gates: build/typecheck/lint/deps:check 0; test red only
on the 4 HEAD failures (`check-finding-citations` ×2, `check-findings-frontmatter` ×2); test:e2e 0.

**CLI-924 landed 2026-10-15** (row → CLI-925, archive line, ROADMAP). Runs `wf_9c84f547-84b` and
`wf_1e05e072-07d`. Record `plans/2026-10-15-manual-journey-run{.md,/}`.

**Committed 2026-10-15:** `67ac2fc6`…`ab7023bb` (13 groups + `chore(release): 0.169.0`), plan
`$SCRATCH/commit/plan.md`. Pushed by 2026-10-17; npm still at 0.168.0.

## Next

1. CLI-926 to CLI-929 committed and pushed 2026-10-17 as 0.170.0 (25 commits, commit hooks skipped by owner). 0.170.1
   regenerates the built-in matrix from skills 4865dfd1 (committed there 01:10); publish 0.170.1, not 0.170.0.
   2026-10-16: every standards cut since 551c9164 audited (owner: remove deleted-code references only, keep intent);
   lost rules restored in 13 files, each passed by an independent checker (`wf_6bfadec4-1b5`, `wf_935117f1-043`,
   `wf_c87c2174-071`).
2. Owner: decide the cards on the decisions page, https://claude.ai/artifact/5gHqiMpZe4CzHWRo5dS4gQ — every open
   question and CLI-925 finding, one card each (R1, F3a–F10, E1–E3, Q1–Q9, T1–T5, C1–C6), with a recommendation.
   Read the answers from its `decisions` collection, then file or queue each one.
3. Queued: EDITOR-97 (owner ruling 2026-10-17 on `stackId: null`), once R1 says which stacks count.

## CLI-926 — finishing the wizard removal (owner rulings 2026-10-15)

Fix:

- **Skill-less stack sub-agents** (journeys 2, 12): a stack picked in the editor installs one sub-agent fewer —
  `cli-tester: {}` in CLI Tool and the Next.js stacks never reaches the payload. Find why, then fix. Lead:
  `toAgentsBySkill` in `packages/matrix/src/read-model/stacks.ts`. Repro `lifecycle-repro-12.sh`.
- **`edit --from` from a project** (30) lists global sub-agents as "Kept as installed", then joins the new rows
  into them; `Changes:` omits them. The join is the 2026-10-02 ruling, so the disclosure is the fix.
  `crossweb-repro-30.sh`.
- **Codex `eject skills`** (66) writes `.claude/skills` whatever the provider.
- **`build marketplace`** (38) over an unreadable marketplace-repo config bumps `marketplace.json` before failing.
  `gap-cli-repro-38-build.sh`.
- **Repeated warnings** (39): a global run prints each marketplace warning `1 + 2N` times for N registered
  projects. `entry-repro-39.sh`.
- **Rate-limited Install dialog**: the 21st `POST /configs` in a minute reads "id unavailable". Say the limit was
  reached and when to retry.
- **Stale wizard wording in the CLI**: `edit`'s summary "Edit skills in the plugin"; the unreadable-config remedy
  "uninstall … then `init`".
- **Website wording**: the "Three ways in" title, quickstart's single-tab Tabs, the landing recording slot, the
  README walkthrough video and `assets/demo.gif`, capabilities.md's asymmetry rows, the half-true `edit` sentences.
- **www `concepts/install-modes.md`**: project-scope plugins are not in `.claude/plugins/`; Claude 2.1.300 records
  them in `~/.claude/plugins/installed_plugins.json` with a `projectPath`.
- **user-journeys.md**: row 13a cites `init-from-greenfield`, whose case b04a0a2e replaced; row 5's "surface 1 …
  TO TEST" is pinned by `lifecycle/mixed-mode-skill-ref-format`; row 38's TO TEST.
- **Leftover code**: remove if unused — `isDomain`, `skillSlotKey`/`agentSlotKey` (both CLAUDE.md files cite
  them), the six `TEST_ONLY_EXPORTS`. Rename `writeScopedFromWizard` / `WizardWriteArgs` if still used.

- **Standards docs** (owner 2026-10-15): `.ai-docs/standards/e2e/{page-objects,patterns,README}.md`,
  `clean-code-standards.md` and user-journeys.md prose stop describing wizard page objects and symbols.
- **Bare `edit` refuses unusable local metadata** before minting an id or opening the editor (owner 2026-10-15).

- **Docs site sweep** (owner 2026-10-15): every page of `apps/www` in its existing writing style, with no mention of the
  wizard. Many pages present two ways to make a change (wizard and editor); with the wizard gone, most have one.

- **Dead project-context switch** (owner 2026-10-15): delete `recordGlobalSourceMigrations`, its gate variant and unit
  tests, and the packages/cli/CLAUDE.md bullet; the e2e suite must stay green with the call removed. Since 2026-10-04 a
  project run leaves global skills as installed, so the recorder can change nothing.
- **Seven non-PTY specs leave `e2e/interactive/`** (owner 2026-10-15) for `commands/` or `lifecycle/`, with their citations
  in spec-gates.test.ts and user-journeys.md; the e2e README's `interactive/` definition says PTY-driven specs.
- **TMPDIR-length specs → CLI-927** (owner 2026-10-15).

Accepted as is (owner 2026-10-15): the two deleted wizard-only specs; the re-recorded project-plugin golden; install-mode-bulk
and scope-aware-local-copy both kept.

Not now (owner): the clicks to move a skill between scopes in the editor (owner's own UX pass);
`ensureTerminalSize`; the live-store `kbyWBumg` delete (2026-10-17: "dont worry about this").

Owner ruling 2026-10-17 on `stackId: null` (a CLI-minted payload opens on "start from scratch"): "it can start on start
from scratch unless its the same as a saved stack". EDITOR-97; decisions-page R1 asks which stacks count.

Still unruled (CLI-925): confirms say less than the run does (group 3), doctor misses what no config declares (5),
doctor throws in `isSourceRepo` over an unreadable config (6), doctor and dashboard report only Claude in a
Claude+Codex scope (7), the editor preview is not the install (8), description handling (9, CLI-915),
`metadata.yaml` key order (10, CLI-908). Each is a card on the decisions page (Next, item 2).

## Owner questions still open

All of them are cards on the decisions page (Next, item 2), which holds each one's explanation and recommendation:
the lane questions (Q1–Q9), the editor-route costs (E1–E3), tests, journeys page and docs (T1–T5), code cleanup
(C1–C6).

- Done 2026-10-15 (owner rulings): the wizard gif is back as `assets/legacy-wizard.gif` under "Legacy Wizard" in
  packages/cli/README.md; the landing slot reads "Video coming soon". Share/Save need not name the rate limit; the
  Install dialog footer keeps `edit`.
