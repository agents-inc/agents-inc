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

## Next

1. Finish the wizard removal (CLI-926, below), tests first.

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
- **Live-store id `kbyWBumg`** (minted by a spec before the guard): delete it if nothing uses it.

Not now (owner): the clicks to move a skill between scopes in the editor (owner's own UX pass);
`ensureTerminalSize`.

Owner asked what it means: a CLI-minted payload (bare `edit`, the dashboard's Edit) carries `stackId: null`, so
the editor opens on "start from scratch" rather than the stack the install came from. Awaiting a ruling.

Still unruled (CLI-925): confirms say less than the run does (group 3), doctor misses what no config declares (5),
doctor throws in `isSourceRepo` over an unreadable config (6), doctor and dashboard report only Claude in a
Claude+Codex scope (7), the editor preview is not the install (8), description handling (9, CLI-915),
`metadata.yaml` key order (10, CLI-908).

## Owner questions still open

- Untested list Ink frame (tracker row?); TMPDIR-length-sensitive specs (tracker row?).
- `.ai-docs/standards/e2e/{page-objects,patterns,README}.md` and `clean-code-standards.md` still describe wizard
  page objects and symbols (not gate-bound); user-journeys.md prose :39, :95-108, :119 too.
- Bare `edit` no longer refuses unusable local metadata.
- Deleted specs whose subject the CLI can't produce now: edit-project-source-migration-propagates, stack-per-agent-curation.
- project-plugin golden re-recorded with a different pair (init --from refuses the old one); install-mode-bulk overlap.
- Migrated non-PTY specs still under e2e/interactive; `init --from` closing block omits the project config path when no
  project sub-agent exists; row 40 lost its control half; handrun share chain broken since 2026-10-04.
- Can `edit` still record a project-context switch of a global skill (recordGlobalSourceMigrations, CLAUDE.md rule)?
