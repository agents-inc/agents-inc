# Manual journey run, 2026-10-15 (CLI-924, after the wizard's removal)

Owner, 2026-10-15: _"update the user journeys to now no longer have journeys for the wizard itself and then
manually run through each of these user journeys by mounting the CLI and going through an actual browser for the
editor parts."_

**How it was run.**

- **The page:** `user-journeys.md` was rewritten first. The wizard wording is gone, rows 44 and 44a cover bare
  `init` (editor route, dashboard), row 44b covers the Install dialog's no-id notes, and row 23 covers bare `edit`.
- **The CLI:** every row was then driven by hand on the uncommitted CLI-923 tree (0.168.0 build), at a TTY in
  tmux where a user sees a prompt.
- **The editor:** in Playwright Chromium against the local editor (:5173) and worker (:8787), with a screenshot
  per step.
- **Hosts:** the real `claude` 2.1.300 and the pinned `@openai/codex` 0.155.1.
- **Isolation:** every run had its own scratch HOME, and no test suite was run.
- **Gap fill:** eight lanes ran, then four more filled the legs the completeness critic found. Those were edits
  authored in the editor rather than hand-written JSON, plus the Install dialog's real refused, offline and stale
  notes, and the unreadable-config legs.
- **Checking:** every FAIL and PARTIAL was re-run from scratch by a second agent, and all were confirmed.
- **Where things are:**
  - Lane tables are in [`2026-10-15-manual-journey-run/`](./2026-10-15-manual-journey-run/).
  - Repro scripts are in its `repro/` folder, named `<lane>-repro-<row>.sh`. The lane tables cite them by their
    scratch paths.
  - Screenshots stayed in the session scratchpad.

**Nothing was fixed.** Findings go to the owner first.

## Verdicts

| Verdict          | Journeys                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| **FAIL** (2)     | 48, 66                                                                                                          |
| **PARTIAL** (13) | 2, 12, 14, 26, 30, 38, 39, 50, 51, 64, 67, 68, 69                                                               |
| **N/A** (1)      | 47 (its subject is the test harness)                                                                            |
| **PASS** (52)    | every other row                                                                                                 |
| **BLOCKED legs** | signed-in 49/50 (GitHub login), 27's token, 35 against a GitHub-hosted catalogue, 69/76 with a real Codex model |

**Since 2026-10-01:**

- **Fixed:** 8, 23 and 29 (were FAIL), plus 18, 25, 42, 52 and 79 (were PARTIAL).
- **New failures:** 2/12, 30, 39, 50, 51 and 66.
- **Unchanged:** 14, 26, 48, 64, 67, 68 and 69.

## Defects, by root cause

Known rows are cited and the rest are unfiled. "10-01 X" points into the restored
[2026-10-01 record](./2026-10-01-manual-journey-run.md).

1. **A stack built in the editor drops the stack's skill-less sub-agents** (2, 12). This is new since the wizard
   went. CLI Tool's and the Next.js stacks' `cli-tester: {}` never reaches the payload, because
   `toAgentsBySkill` in `packages/matrix/src/read-model/stacks.ts` staffs only agents that carry a skill. The wizard
   pre-ticked them. Owner ruling needed: is a skill-less stack sub-agent part of the roster? `lifecycle-repro-12.sh`.
2. **A project run's disclosure contradicts its write** (30). From a project, `edit --from` lists global
   sub-agents under "Kept as installed", then joins the new rows into them, and `Changes:` omits them. The join is
   the 2026-10-02 ruling (`holdInstalledGlobal`), so the disclosure is the defect. `crossweb-repro-30.sh`.
3. **Confirms and summaries say less than the run does.**
   - "Nothing is removed" is printed over P→G moves and unassignments that delete files. CLI-909 has the
     eject→plugin case.
   - The HOME `edit --from` confirm does not name the registered projects it rewrites, and counts a rewritten one
     as "unchanged".
   - An inheriting project's confirm names none of the sub-agents it inherits.
   - A skill filtered at load drops its assignment-only sub-agents and says nothing (39, D3).
   - A no-op `edit --from` still asks.
4. **One load warns many times** (39). A global run prints each marketplace warning `1 + 2N` times for N
   registered projects. `doctor` loads twice. `entry-repro-39.sh`, `gap-cli-repro-39.sh`.
5. **doctor misses what no config declares** (14, 37).
   - Under a live global config, `checkNoOrphans` lists agent `.md` files only. Stranded skills, including the 237
     a failed `eject` leaves in a config-less project, go unreported. This is 10-01 lifecycle D2's remaining half.
     `entry-repro-14.sh`.
   - Also: "Marketplace Reachable ✓" after falling back to the cache.
6. **`build marketplace` over an unreadable marketplace-repo config** (38). It bumps `marketplace.json` before
   reading the config, then fails with the installation remedy ("uninstall … init"). `doctor` throws in the
   `isSourceRepo` gate, which is outside `safeCheck`. `gap-cli-repro-38-build.sh`.
7. **Codex paths and scopes:**
   - In a Claude+Codex scope, `doctor` and the dashboard report only the Claude install (64; 10-01 codex D5, with
     the dashboard half new).
   - `eject skills` writes `.claude/skills` whatever the provider. A Codex uninstall judges or deletes `.claude/`
     (66; 10-01 codex D4, with the eject half new).
   - A global uninstall from HOME leaves the skills (67, CLI-901).
   - The report from HOME names `~/.agents/skills` (68; 10-01 codex D3).
   - The install from HOME trusts HOME as a project (69; 10-01 codex D2).
8. **The editor's preview is not the install** (48). Skill order follows the payload, not canonical order (10-01
   crossweb D2). The global `projects:` line is not drawn. `crossweb-repro-48.sh`.
9. **Description handling** (26): a project takes the global config's description (CLI-915). The editor also
   drops `description` when it re-mints.
10. **Carried external skills** (24): `metadata.yaml` key order flips on every rewrite, even on "No changes made",
    and the unchanged files get new mtimes. This is the CLI-908 area. `gap-authoring-repro-24.sh`.
11. **Editor:** the scroll clearance scrolls the page on every keystroke (50, EDITOR-81) and on every caret move
    or Tab in the stuck bar (51, EDITOR-93). Other editor items are already filed: EDITOR-88 (Install text over an
    all-eject configuration) and EDITOR-82 (Install offers `init --from` over an installation).

## What the editor-only route now costs (CLI-923 follow-ons, for the owner)

- **Scope pairs:** the editor cannot set a `[P][G]` pair directly. Install stays blocked ("N SUB-AGENTS NEED
  PROJECT SCOPE") until the skill is unassigned from every global sub-agent, which took 9 clicks for React.
- **Hidden switches:** selecting a skill switches sub-agents on.
- **Stack lost on the round trip:** a CLI-minted payload (bare `edit`, the dashboard's Edit) carries
  `stackId: null`, so the editor opens on "start from scratch" instead of the stack.
- **Global skills opened from a project:** they can't be applied there. The message points to bare `edit` from
  HOME rather than the id (CLI-910's new form).
- **Stale remedy:** the unreadable-config remedy still says "uninstall … then `init`", which now only prints the
  link.
- **Wrong summary:** `edit`'s summary still reads "Edit skills in the plugin".
- **Rate limit:** every Install-dialog open spends one of the worker's 20 `POST /configs` per minute. The 21st
  reads "id unavailable" with no retry hint.
- **Unreadable link:** the printed link is fixed to `agentsinc.sh`, so a locally minted id can't be opened from it.

## Journeys page

Corrected this run: rows 16, 17, 23, 37, 38, 64, 67 and 69, where false sentences were deleted.

Owner calls left:

- Row 13a cites `init-from-greenfield`, whose refusal over a global install b04a0a2e replaced.
- Row 5's "surface 1 … TO TEST" looks pinned by `lifecycle/mixed-mode-skill-ref-format`.
- Row 38's TO TEST rests on hand-written configs, yet its two main specs install through `init --from`.

Also false, but on the docs site rather than this page: www `concepts/install-modes.md` puts project-scope
plugins in `.claude/plugins/`. Claude 2.1.300 registers them in `~/.claude/plugins/installed_plugins.json` with a
`projectPath`.

## Rig notes for the next run

- **Rate limit:** the worker's `POST /configs` limiter (20 per 60 s per IP) is live under `wrangler dev`. Every
  parallel lane shares it, and a burst reads as "id unavailable" in the editor.
- **Printed links:** CLI links point at production, so a lane must follow each one onto `:5173` by hand.
- **Refused vs offline:** the dialog's "refused" note needs a non-2xx response that passes CORS. A dead port or a
  foreign origin reads "offline".
- **Codex:** Codex's role spawning was read through a scripted Responses stand-in. The real-model leg waits on
  CLI-891.
