# Manual journey run — 2026-11-03 (CLI-1019)

Every row of `packages/cli/.ai-docs/standards/e2e/user-journeys.md` (71, counted with
`awk '/^## Journeys 1–11/{on=1} on' packages/cli/.ai-docs/standards/e2e/user-journeys.md | grep -cE '^\| [0-9]+[a-z]? +\|'`)
driven by hand through the built CLI 0.176.0, as [the 15 Oct run](./2026-10-15-manual-journey-run.md) did.
Owner, 2 Nov: "at the end run all the cli user journeys by hand and expect them all to pass"; 3 Nov:
once all green, a round of commits.

## Rig

- A local worker (`bun run --cwd apps/server dev --persist-to <scratch>`) on :8787 and editor
  (`bun run --cwd apps/editor dev --strictPort`) on :5173. `bun --cwd <dir> run dev` prints the script
  list instead of starting. A local `AGENTS_INC_API_URL` makes the CLI print and open the local editor.
- Per run: `env -i`, a fresh HOME and project, `CODEX_HOME` under it (create it first, or Codex warns),
  `AGENTS_INC_SKIP_NEW_VERSION_CHECK=1`; per lane a bin of wrappers (the CLI's `dist/`, the pinned Codex
  0.155.1 — the shell's is 0.157.1 — a logging `claude`, a fake `xdg-open` recording links). A run that
  must not find `claude` needs a bin without that wrapper; dropping `~/.local/bin` from PATH is not enough.
- Saves to the worker went through one lock (20 a minute for the whole run); none hit the limit.
- The worker's runtime crashed once ("Network connection lost", wrangler 4.118.0) and was restarted on
  the same data within seconds.
- Eight lanes (entry, lifecycle, modes, marketplace, share, codex: cli-tester; crossweb, browser:
  web-tester), at most six at once; a second agent re-ran every FAIL and PARTIAL from an empty folder.
  Workflow `wf_0508e8c2-9a2`; lane tables, logs and repro scripts in `r44/resume-1102/CLI-1019/lanes/`,
  confirmations in `r44/resume-1102/CLI-1019/confirm/`.

## Result

98 verdicts over the 71 rows (some rows by leg): 77 PASS, 10 KNOWN, 3 FAIL, 2 PARTIAL, 5 BLOCKED, 1 N/A.
Lifecycle, share and marketplace passed whole; marketplace's only gaps are the legs listed under Blocked.

**Confirmed defects (shipped code)**

| Journey | What happens | Row |
| --- | --- | --- |
| 19 | A plugin held by both the global and a project install: `uninstall` in the project removes the global one too (`removePluginWhereverItIsFiled`, `uninstall.tsx`); global doctor then reports it missing, nothing warns | CLI-1031 |
| 66 | A Codex-only project with an empty `.claude/` the user made: the Codex uninstall deletes it ("✓ Removed .claude/"); with a file in it, prints "Kept .claude/ (contains user content)" | CLI-1032 |
| 84 | `list` at 80 columns: a display name whose first line fills its cell exactly pushes ⏏ onto a line of its own, the next line one column deeper (`SkillRow`, `skill-agent-summary.tsx`) | CLI-1033 |

**Confirmed, the journey text is what is false** (owner rulings stand): 14's project leg — doctor does
not name stamped skill folders no config lists (CLI-925 card F5a, 21 Oct: "stranded skills aren't
something we need to handle for now"); 48 — the editor preview leaves out the global config's
`projects` list (CLI-925 card F8b, 21 Oct). Row CLI-1034.

**Known, already on file**: 19 and 85 — `.claude/settings.json` left as `{"enabledPlugins": {}}` and
"Kept .claude/ (contains user content)" (CLI-1025, owner card); 85 — the blank global config left by a
refused save (CLI-1030); 50 — EDITOR-81, EDITOR-87; 51 — EDITOR-81, EDITOR-80; 25 — EDITOR-84; 27 —
EDITOR-86, EDITOR-83; 23 and 30 — EDITOR-82; 13, 23 and 30 — EDITOR-88. Seen but not failing a claim:
CLI-1024 (67, 76, 78: the Codex trust line stays), CLI-920 (64: uninstall refuses by name rather than
guessing), EDITOR-92 (49).

**Blocked here**: 49 and 50 signed in (GitHub login); 27's private-token leg; 35 against a real
GitHub-hosted catalogue (ran against the built `catalog.json`); 18's private-source leg (unit level
only). 47 is N/A, as on 15 Oct.

The lanes' other notes (42, plus rig problems and corrections) are in
`r44/resume-1102/CLI-1019/found-elsewhere.md`, sorted next.
