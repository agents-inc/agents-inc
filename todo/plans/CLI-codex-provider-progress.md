# Codex provider — progress

The gate half of this programme — per-agent lint hooks, the `check:` map, the Codex gate plugin — was reverted on 2026-10-01 by owner ruling; see [`../archive.md`](../archive.md).
This file merges the Codex records of the two progress files it replaces, the CLI-715 programme's and the `check:` map's; their gate records are not carried over.

**This file is the session's memory.** The programme spans many hours and several context
compactions; anything not written here is lost. Update it as each dispatch lands, before moving on.

## The mandate (owner, 2026-09-19) — items 1 and 2 were the gate, reverted 2026-10-01

3. Make the necessary changes for **Codex**: the install method changes, not only the content.
4. Follow the existing conventions and use the correct sub-agents.
5. **End-to-end tests**, then add the flow to the **user journeys** and run them by mounting the CLI,
   testing the whole flow through the CLI and the web app.
6. Full SDLC per `CLAUDE.md`: **tests red first → implement → `meta-design-expressive-typescript` →
   hand-run the real thing → docs via `codex-keeper` → update `todo/`**.
7. **No git command that writes. Ever.** Read-only git is fine. That also rules out git worktrees, so
   parallel lanes must own disjoint files, and the `generate:*` scripts run in exactly one lane.
8. Parallelise what can be parallelised, and only that.

## Plans

- Source folder rename: [`CLI-source-folder-rename-plan.md`](./CLI-source-folder-rename-plan.md) —
  `.claude-src/` → `.agents-inc/<provider>/`, mapped by four streams, two critics, then synthesised.
- Codex provider: [`CLI-codex-provider-plan.md`](./CLI-codex-provider-plan.md) — the live plan, steps
  C0-C7b. Replaces [`CLI-codex-target-plan.md`](./CLI-codex-target-plan.md), kept as the record.

## Codex decisions

Adopted on the plan's recommendation: **D6** `@openai/codex` pinned at exactly 0.155.1 (added by the
orchestrator, 2026-09-19); **D7** `smol-toml` in packages/compile; **D9** a "read first" line for
preloaded skills.

**Four are the owner's.** D1, D2, D3 and D8 are all ruled. No step that depends on one starts until it is answered:

| #        | Question                                                                                              | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Blocks              |
| -------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| D1       | Codex project on a machine whose global install is Claude                                             | **RULED 2026-09-19 by the owner: yes, per project.** "One project can be on Codex and the other can be on Claude. It should be per project basis." Built as recommended: a project whose target differs from the global one takes no global rows, is not added to `projects`, is skipped by propagation, and is project scope only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                   |
| D2 / D11 | wizard target step for a new install                                                                  | **RULED 2026-09-19 by the owner:** "the setup wizard can default to Claude and then let you choose codex instead"; the web app defaults to Claude with a toggle to switch to Codex. Built as a toggle on an existing wizard screen, mirroring the web app, so Claude users get no extra step. D11(b) (uninstall counts only plugins it removed) not yet ruled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                   |
| —        | what one installation may hold                                                                        | **RULED 2026-09-19 by the owner:** "you cannot mix Codex and Claude in the web app or in the CLI every installation is only one of them and you can have multiple installations on your machine." One wizard or web-app run = one installation = one target, for everything it writes, global and project parts alike. The target control is one toggle per installation, never per scope. A project installation made under an existing global one may pick either target (D1).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                   |
| —        | target per scope (revises the row above, same day)                                                    | **RULED 2026-09-19 by the owner:** "What if we set global or project to be Codex or Claude? ... this global is Claude, this project is Codex, etc. Whatever a easy first iteration is, though, let's go with that." **v1:** `target` lives in each `config.ts`, so the global installation has one target and each project installation has its own; skills and sub-agents follow their scope's target. One global per machine user (one `~/.claude-src/config.ts`), so no Claude-global and Codex-global side by side. A single wizard or web-app run still has ONE target toggle; a run whose target differs from the existing global writes project scope only (D1). **Later, not v1:** a toggle per scope in one run, writing a Claude global and a Codex project together — the per-file storage already allows it with no migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                   |
| —        | one target per installation, confirmed                                                                | **CONFIRMED 2026-09-19 by the owner:** "a global can only either be one of them the same as a project can only be one of them. we can in future consider having both running side by side." Claude and Codex side by side in one scope is a future consideration, not v1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | —                   |
| —        | **the source folder is renamed and grouped by provider** (supersedes the `target`-field design above) | **RULED 2026-09-19 by the owner**, after the orchestrator recommended separate `.claude-src` / `.codex-src` folders: "We need to rename Claude SRC to .agents-inc because these folders should be grouped and I could maintain other providers too in future." Planned layout: `.agents-inc/claude/` (everything `.claude-src/` holds today) and `.agents-inc/codex/`, at both scopes. The folder IS the provider: no `target` field; each provider family inherits and propagates only within itself, so the D1 cross-target rules fall away; Claude and Codex side by side comes free. Being mapped before any code: surface, migration of existing `.claude-src/` installs, and the delta to both plans.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                   |
| D3       | project-scoped plugin skills on Codex                                                                 | **RULED 2026-09-20 by the owner — the user chooses, nothing falls back silently:** "If you cannot install skills in project scope for Codex using plugins, maybe we should let users choose between global plugins or global eject or project eject." So a Codex install offers exactly three combinations of the EXISTING mode/scope vocabulary — plugin+global, eject+global, eject+project — and plugin+project is simply not offered. A shared config that asks for plugin+project is REFUSED with those three named, never quietly ejected, which keeps the "never fall back to eject" rule intact rather than overriding it. **TRIPLE-CHECK RESULT, 2026-09-20 — the premise was WRONG and the ruling stands anyway.** Measured on the pinned 0.155.1 by running it: (1) a skill committed at `<repo>/.agents/skills/<name>/SKILL.md` reaches the model in that repo AND NOWHERE ELSE, with **no plugin, no install, no marketplace, no trust entry and no global config file at all** — proved against an empty CODEX_HOME. So "project eject" is not a degraded fallback on Codex, it is Codex's own mechanism for a project skill. (2) A PLUGIN can also be enabled per project — `[plugins."<name>@<mkt>"] enabled = true` in `<repo>/.codex/config.toml` overrides the global value in both directions — but installing is still global, the repo needs a `trust_level = "trusted"` line in the GLOBAL config or the project file is ignored IN TOTAL SILENCE, and running `codex plugin add` afterwards silently re-enables it everywhere. Recommendation: ship the owner's three choices, and leave plugin+project to a later release. | Codex Steps 4 and 7 |
| —        | **where the provider is chosen** (supersedes D2/D11)                                                  | **RULED 2026-09-20 by the owner:** "we will offer global plugin skills, and project and global eject skill options with codex. this can be a simple button in the web editor. the cli flow itself doesn't need to handle codex, only has to be able to install it using --from etc." So: the wizard gains NO target step and Claude's interactive flow is untouched — D2's one-extra-Enter cost disappears and D11(a) with it. The provider is chosen in the web app; the CLI receives it on the install command the app prints (`--provider codex`), so the shared payload and every existing share id stay exactly as they are. Afterwards the provider is derivable from the folder on disk (`.agents-inc/codex/`), so compile, edit, uninstall and doctor need no flag.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Codex Steps 2 and 7 |
| D8       | skill-summoner / agent-summoner on Codex                                                              | **RULED 2026-09-20 by the owner: "Leave them out for v1."** Codex installs ship without skill-summoner and agent-summoner; the CLI says why when a stack lists one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                   |

## Dispatch log

One line per dispatch: lane, agent, what landed, and **Corrections** — what in the brief proved
false, with "nothing" written out when nothing did.

| #   | Lane                                         | Acting as                                                            | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Corrections                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Wave 1 (serial)                              | cli-tester                                                           | Codex Step 0 landed, test code only: 3 Claude golden-tree journeys (red on a one-byte agent.liquid change), all three spawn doors pin `CODEX_HOME` + `CLAUDE_CONFIG_DIR` (door check red first), `e2e/fixtures/codex.ts` + Responses mock. `test:e2e` 255/255 files; `npm test` 4 doc-index failures until docs land (dispatch 1b).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Plan's normaliser list incomplete (ejected skills stamp `forkedFrom.date`; Claude writes session state under the fake HOME). Plan line refs for 0b partly stale; the version renders at `agent.liquid:49`, not agent-source.ts:302-381. `NAMED_ENV_READS` cannot express a pin, so the door gate is behavioural. `mkdir .git` does not satisfy `codex exec`: needs `--skip-git-repo-check`. Default plugin-mode init puts everything global, so journey 2 toggles one skill + one agent to project scope. Brief's owned-files list omitted the 0c spec and the docs. Default `node` is 18.20.8; vitest needs fnm's 23. Real `~/.codex/tmp/arg0` dir dated 21:03 local — before Wave 1 was dispatched (21:26) and before the orchestrator's `bun add` (21:24); from the mapping phase. |
| 1b  | Wave 1 (serial)                              | cli-tester → codex-keeper → reviewer                                 | `e2e/smoke/codex-lane.smoke.test.ts` landed (4 tests, unskipped, snapshots the real `~/.codex` around each). Docs rows + one agent finding + INDEX line landed; `npm test` 230/230 files, 7533 tests green. Reviewer: **PASS WITH ISSUES** — re-ran everything from a clean build incl. `test:e2e` 255/255 and smoke 24/24; every new gate went red with its subject reversed in scratch; real `~/.codex` unchanged. **Owed (queued as the next wave's first lane):** the door check cannot tell a pin taken from the cwd from one taken from HOME (all doors driven with cwd = HOME), though its JSDoc claims it can; `codex.ts` JSDoc overstates the arg0 write; `package.json` `//test:smoke` note and the ci.yml smoke comment now false ("every describe is skipIf(!claude)"); DOCUMENTATION_MAP counts and check-enumeration-drift comment counts stale.                                                                                                                                                                         | The Step 0 finding was too broad: Codex writes `$CODEX_HOME/tmp/arg0` on start only when CODEX_HOME is outside the temp dir; under /tmp it refuses and writes nothing — finding filed with the narrowed title. The journey row for the byte-identity spec went into journey 11's From-scratch column, per the page's own rule, not a new row. A finding needs an INDEX.md line, which the brief's file list omitted. codex-keeper's partial says `.ai-docs/standards/` is convention-keeper's; the brief assigned two files there — ownership tension, followed the brief. **The brief's `fnm use 23` fails in this shell** (multishell symlink); put `~/.local/share/fnm/node-versions/v23.10.0/installation/bin` first on PATH instead.                                             |
| 3   | Rename map (parallel with Wave 1, read-only) | 4 mappers → 2 critics → synthesiser                                  | Plan written to [`CLI-source-folder-rename-plan.md`](./CLI-source-folder-rename-plan.md): four steps R0-R3, a programme order, deltas for both other plans, D1-D13. Nothing in the repo changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | The rename is NOT only the source folder: `agent-summoner`'s playbook names `.claude-src/` six times and is inlined into every compiled `agent-summoner.md`, so installed agents would keep authoring into the old folder. The global `projects[]` list is not an inventory (1 entry vs 6 installs on disk), so a batch migration cannot reach every install. A marketplace's own `.claude-src/config.ts` lives in repos we only read, so that name must stay readable for good. In `ai-benchmarking`, `rm -rf .agents-inc` is written down three times as the gate's disarm path, and `.gitignore:84` hides the folder — after a rename both destroy the product's source (D12).                                                                                                     |
| 4   | R0 (parallel with Wave 1; apps/www only)     | codex-keeper → reviewer                                              | 3 lines on 2 pages now quote `config.ts not found`, true under both layouts. Reviewer: **APPROVE**, 0 blocking. www check scripts pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | The plan's roster was short by one: `troubleshooting/index.md:18` quotes the string too, and working the plan's list would have left R0's own verify command failing. The reviewer caught the lane citing a NEGATIVE assertion (`.not.toContain`) as evidence; the real positive witness is `e2e/commands/doctor-report-shape.e2e.test.ts:50`, which holds the printed line verbatim — **R2 must re-record it**.                                                                                                                                                                                                                                                                                                                                                                      |
| 5   | Wave 2 (serial)                              | cli-developer → codex-keeper → reviewer                              | Codex half only — the gate half of this dispatch was reverted 2026-10-01: the door check blind to a cwd-derived pin; a JSDoc overstating the Codex arg0 write; three docs left false by the smoke spec. Landed with red-before evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | nothing on this half; the row's corrections were the gate's.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6   | Wave 2 (serial)                              | cli-tester → cli-developer → reviewer                                | Rename **R1** landed: `packages/compile/src/source-layout.ts` (names only) + the resolver, every reader routed through it, literal ban in two eslint configs. 7 new spec files, red first. Every golden byte-identical (sha256 pinned), all suites green. Reviewer: **REQUEST CHANGES** — 0 blocking, 3 should-fix: `getProjectConfigPath` stopped being total and can now throw (3 commands with it); the plan's symbol-level `no-restricted-imports` half was never built and never reported skipped; the ban landed in 2 of the 3 eslint configs the plan names (apps/editor missing).                                                                                                                                                                                                                                                                                                                                                                                                                                              | The reviewer could not fault the funnel design itself. `uninstall` in a `both` state says it is done while the other folder's config survives — the plan puts that refusal in R3, so it is recorded, not fixed here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7   | Wave 3 (serial)                              | cli-developer → codex-keeper → reviewer                              | Rename half only — the gate half was reverted 2026-10-01: `getProjectConfigPath` totality, the symbol-level ban + its guard spec, the editor's eslint block, and the three docs about the raw-write ban. Reviewer: **REQUEST CHANGES** — `format:check` red on two new markdown tables, and TWO MORE `no-restricted-syntax` zones with no roster row (the config now declares seven; HEAD had three).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `getProjectConfigPath` made total by fixing the PROBES: a directory it cannot list counts as in use, because answering "absent" would route a write to the new folder — the half-routed state the module exists to prevent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 8   | Wave 4 (serial)                              | cli-developer → reviewer                                             | Close-out: Prettier on the two new tables, and make the lint-zone roster impossible to leave short — DERIVE it from `eslint.config.js` rather than hand-list it, since three waves running have each left it short. Done: `LINT_ZONES` is gone, replaced by `lintZonesIn(config, rule, cwd)` in a tested helper; an eighth zone added to a scratch config reddens the spec with no roster to edit. Reviewer: **APPROVE**, 0 blocking. `npm test` 246 files / 7698 tests.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | The reviewer refused the brief's instruction to write a scratch config into the package — it built mutated configs in memory instead, which proves the same thing while keeping "change no file". One hand-written roster remains, in R1's own guard spec, and carries the same stale cardinality sentence; folded into R2.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 9   | R2 (serial, the flip)                        | cli-tester → cli-developer → web-developer → codex-keeper → reviewer | New installs WRITE `.agents-inc/claude/`; goldens re-recorded against a predicted diff (20 paths, 4 imports); uninstall clears the parent only when empty; `agent-summoner`'s playbook renders the folder from a variable so compiled agents stop naming the old one; editor preview row + the install dialog's wrong path; `.ai-docs`, apps/www, user journeys, CHANGELOG. **The flip is verified:** the re-recorded goldens are parsed-JSON IDENTICAL to the trees predicted before any code moved — 20 renamed keys, 4 import rewrites, nothing else — and the reviewer drove the real binary over a legacy install (doctor, list, compile, edit, uninstall): read and written in place, nothing moved, nothing created under the new name. Editor green (519 vitest, 558 Playwright, 13 visual). Reviewer: **MAJOR REVISIONS** — the test-tree sweep was deliberately deferred, so `npm test` is 50 failed / 7718 and `test:e2e` 161 failed across 96 files; 92 of those files were never touched, and one file causes most of it. | The blind-`-u` hazard was real and caught by the guard spec, not by luck: a predicted tree with `project/.agents-inc` added to after-uninstall reddens two specs. `agent-summoner`'s playbook interpolates the folder into one sentence that names the agents-inc CHECKOUT rather than the reader's project, so that clause must stay literal. Two failures are pre-existing and not this change's: a root prettier break in `apps/editor/e2e/pages/roster-panel.ts` and a flaky editor Playwright pulse spec.                                                                                                                                                                                                                                                                        |
| 10  | R2b (serial, the sweep)                      | cli-tester → cli-developer → reviewer                                | Re-point the test tree at the new folder — `e2e/helpers/test-utils.ts` binds the old name in 7 places with ~238 call sites, which is most of the red — plus the 50 unit failures, four assertions now passing for the wrong reason, the handrun harness, and two product leftovers. **Both suites green: unit 248 files / 7718 tests, e2e 255 files / 954 passed.** The shared test path builders now ASK the product which layout a directory is on, so 76 of the 96 failing files went green without being opened. Reviewer reproduced all of it from a clean build and then found a **PRODUCT DEFECT this step introduced** — see dispatch 11.                                                                                                                                                                                                                                                                                                                                                                                      | Two more vacuous assertions existed that the plan never named, found by sweeping for the shape rather than working the list. The 5 `compiler.test.ts` failures were not the rename: a stub engine had stopped describing its collaborator. The reviewer's mutation (fresh installs sent back to the old folder) reddens only 15 of 7718 unit and 8 of 954 e2e — 7 of 12 sampled assertions would not catch it, BY DESIGN, because they follow whichever layout the fixture is on.                                                                                                                                                                                                                                                                                                     |
| 11  | R2c (serial)                                 | cli-developer → reviewer                                             | **Product defect:** rendering an agent's five partials through Liquid — added so `agent-summoner` could name the install's own folder — silently rewrites user prose (`Use ${{ secrets.DB_PASSWORD }}...` compiled to `Use $...`, exit 0, no warning) and deletes the template-injection boundary `sanitizeLiquidSyntax` exists to hold. Fixed: no partial ever reaches the Liquid engine; one opt-in token `@@SOURCE_FOLDER@@` is substituted by identity, and a partial that opts in against an engine naming no folder THROWS rather than compiling `/agents/`. Reviewer attacked it through the real binary with every template-looking construct it could invent and could not break it. **New blocking defect, recursive:** the paragraph teaching the token spells the token, so the substitution eats the lesson — every compiled `agent-summoner` now tells the one agent that authors partials to hard-code the folder. Plus 4 should-fix docs.                                                                              | `grep -rln '{{\|{%' packages/cli/src/agents` returns exactly three files, so no bundled partial but `agent-summoner`'s two relied on being rendered. Fixing the teaching sentence reddens the new spec's `.not.toContain(TOKEN)` assertion — that spec has to claim something sharper.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 12  | R2d + R3 (serial)                            | cli-developer → reviewer → cli-tester → cli-developer → reviewer     | R2d: the recursive token bug + 4 doc/alias follow-ups. Then **R3**: `migrate [--yes] [--dry-run] [--adopt]`, the forwarding stub that turns an old CLI's silent adoption of the global install into our own sentence, the read-only git probe for the `.gitignore` collision, doctor's Layout rows, the nudge, and the rollback that covers every filesystem step. **R2d done and mutation-proved:** `\@@SOURCE_FOLDER@@` escapes to the token and `\\@@...` escapes the escape, so the teaching paragraph terminates without a third mechanism; the blanket `.not.toContain(TOKEN)` assertion split into a positive (the compiled agent TEACHES the token) and a narrowed negative (no PATH is rooted at a raw token). **R3 built and hard-reviewed:** every edge case driven through the real binary, every refusal left the tree byte-identical, the git probe right in all four directions, the stub checked against the real published agents-inc@0.164.0. Reviewer: **REQUEST CHANGES — 5 blocking.**                            | The substitution runs SECOND in `renderAgent`, not first. Three more docs stated the legacy folder as pinned where the code resolves it (`toHaveEjectedTemplate`, two rows of test-data.md) — found by sweeping for the class, not in the brief. Linux answers EBUSY, not EXDEV, for a mount point, but it is the same branch.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 13  | R3b (serial)                                 | cli-developer → reviewer                                             | Close the five: write commands must REFUSE in a `both` state (the preference order's winner can be the stale folder — silent writes into the wrong one reproduced), `--adopt` missing from the built command, two doctor pins reddened by the new Layout row, four of the repo's own index gates red because `migrate` is a new command, and a red unmarked spec. Plus the changelog and `check-ignore`. All 8 landed plus both nice-to-haves. Reviewer: **REQUEST CHANGES — 3 blocking, all about what the product SAYS rather than what it does.** The move itself held: a real 130-file tracked tree moved byte-identically, four refusals and two rollbacks left everything as it was, suites green (unit 250/7728, e2e 264/1020).                                                                                                                                                                                                                                                                                                 | `rename(2)` over an existing file succeeds silently and destroys it, so `--adopt` re-checks each destination immediately before its own rename. The rollback specs never reached the step they named — a read-only directory makes the PLANNER refuse first, so the fault must be injected where the step itself fails (a plain file where a directory must be). `--dry-run: nothing was written.` was false on every run: oclif's update check writes `~/.cache/agents-inc/version`.                                                                                                                                                                                                                                                                                                 |
| 14  | R3c (serial)                                 | cli-developer → reviewer → cli-tester → cli-developer → reviewer     | R3c: both `migrate` and `doctor` name the NEW folder as the live one whatever the resolver picked; content authored into the stubbed legacy folder after a migration is invisible everywhere and `--adopt` cannot reach it; `migrate` rewrites files in registered projects that are neither scope and says nothing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | pending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Orchestrator rulings

- **2026-09-20, `migrate` deleted, and the process failure behind it.** The owner: _"We don't have a migrate
  command and I didn't tell you to make one"_ → _"Delete all of it."_ R3 came from the rename plan's own
  recommendation; the orchestrator adopted it and REPORTED it in a status message rather than asking. A
  status message is not permission. Everything migration-specific is removed (see the rename plan's header
  for exactly what, and for the two things kept because they belong to the rename itself). **The standing
  correction: a plan's recommendation is a proposal, not an instruction — anything that adds a user-facing
  command or behaviour the owner did not ask for gets asked about before it is built.**

- **2026-09-20, no committing.** Owner: "No committing." Nothing in this programme is committed; the work
  stays in the working tree until the owner says otherwise. The golden-tree baseline that D13 wanted a commit
  for is covered by the scratch copy noted below.

- **2026-09-20, tested helpers.** `packages/cli/CLAUDE.md` said `src/cli/lib/__tests__/helpers/` is "the ONLY
  home for a tested helper". Its stated reason is that no vitest project collects a test under `e2e/helpers/`.
  The gate lane put `git-repository.ts` + its test in `src/gate/__tests__/helpers/`, which the `src/**` project
  DOES collect, so the letter forbade it while the reason did not. Amended: a tested helper lives where a
  vitest project collects its test — the shared directory, or a `__tests__/helpers/` beside the code it serves.

- **2026-09-20, R2 can proceed without a commit.** D13 asks for Wave 1 to be committed so the golden re-record
  has a reviewable baseline; git is the owner's call and the owner has not answered. Fallback taken: the three
  goldens and a `git status --porcelain` listing are copied to
  `scratchpad/pre-r2-baseline/` (md5s 7fad11a4, 8ea0c5f5, 17e4498f), so R2's diff is reviewable against that
  copy. Weaker than a commit — nobody reviews it in a PR — but it unblocks the flip.

## Codex decisions opened by the re-plan (2026-09-20)

Measured after the first plan was written, so none of them existed when the owner ruled. Adopted on the
plan's recommendation unless marked:

- **D12 — ship sub-agents on Codex: YES.** 16 of 18 render to `$CODEX_HOME/agents/<n>.toml` (global, no
  trust needed) and `<repo>/.codex/agents/<n>.toml` (project, trust required). The first plan said no
  per-agent definition existed; measured, it does, with a strict schema that DROPS THE WHOLE FILE on an
  unknown key. `model`, `model_reasoning_effort`, `sandbox_mode`, `approval_policy`, `instructions`,
  `hooks` and `[features] shell_tool` are accepted; `effort`, `disallowed_tools`, `tools`-as-allowlist,
  `permissionMode`, `isolation` and `experimental` are not.
- **D13 — the roster is INERT by default. OWNER 2026-09-20: "What is your proposal for sub agents not
  being called unless manually? We can do this with an AGENTS.md file perhaps — investigate if it will
  work. If yes, mark this for later." Being investigated now, measured against the pinned binary with a
  local mock capturing the request body: a config key first, then AGENTS.md, then a preloaded skill, then
  the agent role's own instructions. NOT part of v1 either way — it is marked for later.**
  The original entry: Codex's own system
  prompt says not to delegate unless asked, and `spawn_agent` says "Omit unless explicitly asked". So 16
  installed roles do nothing until something says otherwise. Adopted: carry the instruction in a
  preloaded skill line (option c), because `<multi_agent_mode>` names skill instructions as an authority
  and it keeps us out of the user's `AGENTS.md`.
- **D14 — eject+global writes `$CODEX_HOME/skills`**, not `~/.agents/skills`: uninstall and doctor must
  agree with where Codex reads, and the shared namespace is not ours.
- **D15 — `init --provider codex` with no `--from` exits INVALID_ARGS**, naming `--from` and the editor
  URL. That is what "the wizard gains nothing" means, and it makes the refusal of an unofferable
  placement happen BEFORE anything is written.
- **D16/D17/D18/D19 — mine, adopted as recommended** (alias, ordering and test-surface calls), except
  **D19**, the one bet worth naming: Codex reads our `.claude-plugin/` manifests today while its own
  bundled `plugin-creator` skill documents `.codex-plugin/`. We rely on the compatibility shim and land a
  tripwire test that fails loudly if a Codex release drops it.

## D13 — making Codex use the roster: investigated 2026-09-20, MARKED FOR LATER

Owner: _"What is your proposal for sub agents not being called unless manually? We can do this with an
AGENTS.md file perhaps — investigate if it will work. If yes, mark this for later."_ Three lanes plus a
critic, everything re-run by the critic, all offline (`codex debug prompt-input` plus a local Responses
mock; no API key, no provider network).

**The prerequisite, which is not "later" — it changes v1.** The roster is not installed-then-ignored, it
is ABSENT: with no registered role `spawn_agent` has no `agent_type` parameter at all. A role registers
only from `$CODEX_HOME/agents/<n>.toml` and only with all three of `name`, `description`,
`developer_instructions`. `<repo>/.codex/agents/<n>.toml` never registers, trusted or not [V].

**Will AGENTS.md work? PARTLY, and the owner's instinct was right about the mechanism.** The prohibition
literally names it: _"unless the user or applicable AGENTS.md/skill instructions explicitly ask"_. The
text provably reaches the model — a marker in `<repo>/AGENTS.md` and in `$CODEX_HOME/AGENTS.md` arrives
verbatim in a USER-role message, after the developer-role prohibition, found even from a nested cwd [V].
What cannot be measured offline, in principle: whether the model then delegates.

**A cleaner lever exists.** `[features.multi_agent_v2] multi_agent_mode_hint_text` in
`$CODEX_HOME/config.toml` REPLACES the prohibition's body in place — set to Codex's own built-in proactive
text, the prohibition count goes 1 → 0 with reasoning effort untouched [V]. It is undocumented, and
`codex features list` reports `multi_agent_v2 stable false` in the very run where it is demonstrably in
effect, so it cannot be confirmed by asking Codex — only by capturing the prompt. The documented
alternative is `model_reasoning_effort = "ultra"`, which produces a byte-identical block but buys xhigh
reasoning on every turn — **and is wrong for ai-benchmarking**, because it moves reasoning depth and
delegation policy together and makes any score change unattributable.

**Ruled by the orchestrator, pending the owner:** keep AGENTS.md as belt-and-braces only, and only in
`$CODEX_HOME` — never in a task repo, where this project's own Arm A deletes it. Prefer the config key.
Not v1; marked for later. Five assertions make the mechanical half testable with no model call: the
baseline block, the carve-out string, the lever, roster registration in `spawn_agent`, and the three-key
requirement.

**The honest limit, to be written up as an open question rather than assumed away:** every result here is
"the text reaches the model". None is "the model delegates". That needs a real run.

## Running — the owner's full review (CLI-890); started 2026-09-26 once every suite was green

**Status 2026-09-26: the owner's full review (CLI-890) DONE except doc round 3, which is ON HOLD by the
owner. NOTHING IS COMMITTED.** Resume from
["Outstanding after CLI-890"](#outstanding-after-cli-890--2026-09-26) below. Durable copies of the review's
inputs and scripts are in [`CLI-890-review/`](CLI-890-review/) — the session scratchpad under `/tmp` is not.

Owner, 2026-09-25: _"Afterwards I want you to use the meta expressive typescript skill to go over all of the
code that was written and make sure that it aligns with these best practices. Also, make sure that our tests
align with testing best practices, which is to say that it uses fixtures for everything. First, make sure all
tests pass before doing any of this."_ And: _"I said to first finish what you're doing, you're supposed to just
queue this afterwards."_ This is CLI-890, triggered.

Every suite went green on 2026-09-26 (`wf_b22a8def-16e`). In order:

1. **Source, expressive TypeScript** — `wf_084b8010-c50` DONE: 61 of 154 files changed, the rest judged
   already clear. The first full suite after the edits was GREEN with no repair needed; **zero behaviour-change
   findings across 14 independent reviews**. They found 20 still-needs-simulating, 15 false docblocks, 7
   convention, 2 over-extraction. **But the settle step received those findings CUT OFF at 9,000 characters — the
   orchestrator's script — so ~21 of 44 never reached it.** Follow-up `wf_9fcfeb16-729` reads every finding
   whole from disk, has each lane account for each (already-fixed / fixed-now / declined-with-proof), runs every
   suite, and has two reviewers per lane confirm every finding is handled. The same bug was removed from the
   tests-review script before it ever ran.
   **Follow-up DONE:** all 51 findings accounted for — 29 already fixed, 15 fixed now, 7 declined — suite
   GREEN, five lanes clean by both reviewers. Every remaining item was blocked by the ORCHESTRATOR's brief (no
   out-of-lane edits, no export changes), not refuted by the lanes: a fix that wrote a NEW false docblock
   (`propagate.ts`), a dead field (`ConfigWriteResult.filesWritten`), and a stale test docblock. Closing in
   `wf_134f4a0e-1bc`. Sixteen doc handoffs saved for doc round 3 at `CLI-890-review/doc-handoffs-from-source.json`. Script:
   `CLI-890-review/source-review.js`, lanes from `CLI-890-review/partition.py source`.
2. **Tests — `wf_f84411fb-c7a` (299 files, 9 lanes). First run never went green: five suite rounds, four
   repairs of one lane, the same failure — `check-enumeration-drift`: the e2e-infra lane ADDED two `STEP_TEXT`
   constants (`PLUGINS_REMOVED`, `GATE_LINTER_NOT_INSTALLED`) for two new negative assertions — a strengthening —
   but `standards/e2e/README.md` lists `STEP_TEXT` exhaustively and no lane owned it. The repairing lane said
   so itself: no edit to its files could fix it. **A loop with no route to the real fix — the orchestrator's
   defect.** Resumed with a `codex-keeper` drift-fix step first; the nine lanes, wiring and roster replayed from
   cache, and the suite and the never-run review phase now run live. Source review CLOSED first by `wf_134f4a0e-1bc`: both reviewers clean, every suite green.** The repo's own "Test Data" rules (`packages/cli/CLAUDE.md`) — 298 files, 9 lanes. Script:
   `CLI-890-review/test-review.js`, lanes from `CLI-890-review/partition.py tests`. Recompute both partitions at launch.
   **DONE 2026-09-26 10:5x.** 18 reviews found 80 items (21 false docblock, 21 convention, 20 inline data, 10
   duplicate factory, 8 weakened test); all 9 lanes settled. **The settles were NOT re-reviewed** — the script has
   no review after settle; only the final suite checks them. The final suite had one failure, the same drift
   class again: the e2e-infra settle removed `STEP_TEXT.PLUGINS_REMOVED` (its two assertions could not fail —
   the fixture never installs a plugin; the reason is recorded in the spec) and added
   `GATE_WARNING_CHECK_PREFIX`, without touching the two exhaustive lists. The orchestrator fixed both lists
   (`standards/e2e/README.md`, `reference/testing/e2e-infrastructure.md`).
3. **Every suite green again — 2026-09-26.** Final run: everything green but that drift check; after the fix,
   `turbo test --filter=agents-inc --force` 300/300 files, 8,351/8,351 tests. e2e 1,106, editor 690, smoke,
   lint, typecheck, format and the four generate checks were green in the final run and nothing they read changed.
4. **Doc round 3 — ON HOLD by the owner, 2026-09-26: _"pause right before doc round 3"_.** Do NOT start it
   until the owner says so. It is last because the refactors move symbols the docs cite; its inputs are the ~1–2%
   of claims the sweep's reviewers still flagged, the cross-lane flags, the `CLAUDE.md` misses, the 17 handoffs
   in [`CLI-890-review/doc-handoffs-from-source.json`](CLI-890-review/doc-handoffs-from-source.json), and the doc
   items under "Outstanding" below. The owner offered to shorten it: one reviewer per lane instead of two, or just
   the repo's doc checkers.

### The tests review wrote into the owner's GLOBAL install — 2026-09-26 08:15. Owner: leave it

**Owner, 2026-09-26: _"don't worry about the global install that is broken."_ Do not repair it or raise it.**

The test-gate settle ran a scratch vitest harness without the package's `vitest.setup.ts` (which mocks
`os.homedir()`), and one spec compiled into the real HOME. It rewrote `~/.claude-src/config.ts` (now ends
`projects: ['/tmp/ai-test-7bAMli/project']`, a dead temp dir), `~/.claude-src/config-types.ts` (40 skills moved
under `// Custom`), and all 8 files in `~/.claude/agents/` — their skill descriptions now come from a TEST catalogue
("Bear necessities state management"). Every sub-agent dispatched since 08:15:45 loaded these. No pre-damage copy
exists (not a git repo; none in any transcript). The damaged state was backed up to this session's scratchpad.
**Lesson for any future lane that runs vitest outside turbo:** keep the package's `setupFiles`, or it writes HOME.

## Outstanding after CLI-890 — 2026-09-26

### KNOWN BUG — every agents-inc sub-agent fails to start on Codex (found 2026-09-26, FIXED 2026-09-26)

Found by the Codex hand-check (CLI-891), which Codex itself ran on the owner's subscription, codex-cli
**0.157.1** (the page was measured on 0.155.1).

- **What:** the Codex role renderer copies the agent's Claude model alias straight into the role file:
  `model = "opus"`. Codex accepts the file and registers the role, then **refuses to spawn it** —
  `opus` is not a Codex model. Every compiled agent declares a model, so **no agents-inc sub-agent can
  run on Codex at all**.
- **Where:** `scalarLines` in `packages/compile/src/providers/codex/agent-role-toml.ts`
  (`...(agent.model === undefined ? [] : [\`model = ...\`])`). Its docblock says `model = "opus"`"both parses and registers [V]" — true, and the reason nothing offline caught it: every Codex spec
stops at registration. The mock's router refuses`spawn_agent`, so no spec has ever started a role.
- **Answers the hand-check's open question:** check 4 ("do a role's `model` and effort resolve?") is
  a **FAIL**. Registering was never resolving, as the page warned.
- **Fix — owner's call, not started:** drop `model` from Codex roles (the role runs on the session's
  model), or map Claude aliases to Codex models. Either way, add a spec that fails on a Claude alias
  in a Codex role, and correct the docblock and `codex-hand-check.md` check 4.
- **Not a bug, noted beside it:** no role carries `model_reasoning_effort`, because no shipped agent
  declares an effort. Check 4's effort half has nothing to resolve unless one is set.
- **Hand-check workaround in use:** Codex deleted the `model` lines in its scratch install only and
  re-ran checks 1, 2 and 4 with `model_reasoning_effort = "high"` on `web-developer`. Results marked
  "after the model-line workaround" are from that edited install, not from what the CLI writes.

**Also from the hand-check — a doc gap:** `init --from <id>` with an id minted in the LOCAL editor
fails `No configuration found for id '<id>'`, because the CLI fetches from `https://api.agentsinc.sh`
unless `AGENTS_INC_API_URL=http://localhost:8787` is set (`packages/cli/src/cli/lib/seed/fetch-seed.ts:7`).
`codex-hand-check.md` never mentions it.

### The Codex hand-check — results, 2026-09-26 (first run, then a verification run)

Run by Codex itself: codex-cli 0.157.1, agents-inc 0.164.0 (local build), ChatGPT login, scratch HOME and
CODEX_HOME (removed afterwards), config `g-eSHaor` from the local editor, its agents GLOBAL-scoped. Every
sub-agent run needed the model-line workaround (above). A second run settled the disputed results with direct
evidence: the child session logs and a `codex` argv-logging wrapper.

| #                              | First run    | Verified                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2 Role arrives whole           | FAIL         | **PASS.** What the sub-agent received and the TOML value are byte-identical (18,681 bytes). Its "last heading" answer was the last heading BEFORE the trailing `<system-reminder>` skill block — a fair reading, not a truncation.                                                                    |
| 3 Orchestrator uses the roster | "PASS"       | **Product finding:** no agents-inc role used. 0 spawns unprompted; told "use your sub-agents", it picked Codex's built-in `explorer`.                                                                                                                                                                 |
| 4 Model and effort resolve     | FAIL         | **FAIL — BUG A** below. With the model line removed, the role ran on the session model and `model_reasoning_effort = "high"` resolved.                                                                                                                                                                |
| 5 Marketplace collision        | PASS         | PASS.                                                                                                                                                                                                                                                                                                 |
| 6 Git marketplace refresh      | FAIL         | **PASS; the page was wrong.** The agents-inc marketplace is git-sourced (`https://github.com/agents-inc/skills.git`); `update` called `codex plugin marketplace upgrade agents-inc --json`, exit 0. `update` never touches a third party's marketplace, which is what the page had the tester set up. |
| 7 Missing trust line           | INCONCLUSIVE | Still inconclusive: global-scoped agents go to `$CODEX_HOME/agents`, so no project trust applies. Needs a config with project-scoped agents.                                                                                                                                                          |

**BUG A (confirmed): `model = "opus"` in every Codex role.** See "KNOWN BUG" above. **FIXED 2026-09-26** — see "The BUG A fix" below.

**The page (`codex-hand-check.md`) is wrong or stale in these places:**

- no mention of `AGENTS_INC_API_URL`;
- it assumes project-scoped roles (the path and the role-count command);
- check 4 says nothing of the Claude-alias incompatibility;
- check 6 sets up a marketplace `update` never touches;
- on 0.157.1 the `/tmp` warning text and `codex doctor`'s summary format differ.

### Comprehensive test round — 2026-09-26, owner: _"run the user journeys yourself ... with the CLI ... make sure these new journeys are all included in the journeys file and then run them as journeys"_

- **Journeys file:** rows added to `standards/e2e/user-journeys.md`: Codex project trust + no model (76),
  uninstall removing Codex roles (78, **BROKEN — CLI-896**). The docs gates pass.
- **Hand-run through the real binary** (`node scripts/handrun.mjs`): journey 78 BROKEN, the known CLI-896,
  left failing on purpose.
- **Logged:** CLI-896 (uninstall leaves Codex roles), CLI-898 (preview vs install descriptions).

### Full Codex journey, run by Codex itself with Playwright — 2026-09-26

Codex built the configuration in the local editor with Playwright (config `e5VqH__z`), installed it, and ran
every check. The owner narrowed scopes during the run: both sub-agents and all skills at PROJECT scope, React
Eject + PRELOADED. codex-cli 0.157.1, agents-inc 0.164.0 (local build).

- **PASS:** roles written, no `model` line; dynamic skills listed in `<skill_activation_protocol>`, preloaded
  React absent from the role (Codex cannot preload) but present in `.agents/skills` and in what Codex shows the
  model; project trust written once; `doctor` 17/0/0; role arrives byte-identical (17,004 bytes); a sub-agent
  loaded both a dynamic and the preloaded skill by reading its `SKILL.md`.
- **FAIL — CLI-896 (bug):** `uninstall` left both role `.toml` files and claimed it removed `.codex/agents/`.
- **FAIL — preview vs install:** the editor's output preview differed from the installed role only in the
  Zustand and Vitest descriptions (shorter in the preview). Cause not yet established — likely the editor's
  catalogue and the installed marketplace carrying different descriptions. Investigate before calling it a bug.
- **Not a product fault:** delegation tried `reviewer`, which `AGENTS.md` names but this config did not install
  (unknown agent type), then fell back to Codex's own `worker`/`explorer`. The fixture's `AGENTS.md` should name
  only installed roles.

### Second batch — 2026-09-26, owner: _"go ahead and do 893 ... make sure that runs ... update the hand check page ... five to seven, update these tests"_. Uncommitted; done directly (no sub-agents installed — owner: _"just follow existing conventions"_). Review by a reviewer sub-agent is deferred by the owner.

- **CLI-893 DONE** — the install writes Codex project trust and prints it (details in `todo/cli.md` CLI-893).
- **Check 7 automated** — `codex-agent-roles-are-read-by-codex.e2e.test.ts`: trusted at install and offered by Codex;
  `untrusted` left alone; the key added inside the user's own table. All red without the write.
- **Hand-check page updated** — local build and `AGENTS_INC_API_URL`, `AGENTS.md`, two configs,
  a 2026-09-26 result per check, checks 6 and 7 rewritten.
- **Item 6 test fixes** — `update` e2e no longer runs with a real `claude` on PATH; two cannot-fail negatives fixed;
  one settings and one registry builder instead of two; seven specs write `config.ts` through `writeTestTsConfig`;
  `writeCorruptTestConfig` → `writeRawTestConfig`; six narrowing probes judged per alias (`rejected`); the
  installation factory's docblock corrected; the editor's 51 `toEqual` → `toStrictEqual`.
- **Item 5 (CLI-894) partly done** — the new `e2e/interactive/codex-edit-wizard-plugin-operations.e2e.test.ts`
  (edit wizard over Codex, observed in Codex's own listing), the wizard harness puts the pinned codex on PATH, and
  a per-spec map in `todo/cli.md` CLI-894 (covered elsewhere / Claude-only by construction / still open).
- **CLI-895 found and FIXED** (owner: _"Do 895"_): the local-skill mover only knew `.claude/skills`, so on Codex an
  ejected copy survived a switch to plugin and a deselect. Now resolved per host; both e2e cases pass. The rest of
  the Codex edit ports are parked — owner: _"disregard edit for Codex for now"_.

### Codex re-run after the fixes — 2026-09-26: ALL PASS

In `/home/vince/dev/test-cli-install` with a throwaway HOME/CODEX_HOME, codex-cli 0.157.1, agents-inc 0.164.0
(local build), config `g-eSHaor` (global agents), and an `AGENTS.md` naming the roles and telling Codex to
delegate to them (the owner's request: _"create a simple agents.md first telling it to use subagents"_).

- BUG A fixed: no `model` line in any role; the install names "Claude models" as not carried; web-developer starts.
- **Check 3 answered by AGENTS.md:** asked for work with no mention of sub-agents, Codex spawned `cli-developer`
  and `reviewer`. Without AGENTS.md (the first run) it spawned none of ours. Whether the install should write
  or suggest one is the owner's decision.
- A second `init` was refused ("An installation already exists"), which is intended.
- Not run: project-scoped agents on Codex (needs a second config).

### The BUG A fix — 2026-09-26, owner: _"fix the bugs all of them ... add tests"_. Uncommitted.

Each new test was run RED against the pre-fix code (the fix reverted in place, rebuilt, re-run), then green.

- **BUG A** — `scalarLines` in `packages/compile/src/providers/codex/agent-role-toml.ts` never writes `model`;
  "Claude models" joins `UNEXPRESSIBLE_ON_CODEX` (`roster.ts`) and its e2e mirror `CODEX_UNEXPRESSIBLE`, so the
  compile says the model did not travel. Effort still travels as `model_reasoning_effort`. Tests:
  `agent-role-toml.test.ts` → "never writes a model, because every model this product names is Claude's"
  (every `MODEL_NAMES` value) and its effort control; `roster.test.ts` (six, by member);
  `codex-compiles-sixteen-agent-roles.e2e.test.ts` → a configured `sonnet` absent from the role, present in
  Claude's frontmatter.

### The tests review's leftovers (CLI-890)

Every item below comes from the tests review's settles, read whole. Each lane could edit only its own files and
the script had no step for cross-lane handoffs, so **these were reported and NOT done**. Full text, per lane:
[`CLI-890-review/test-settle-leftovers.json`](CLI-890-review/test-settle-leftovers.json).

**Test fixes handed to another lane — not done:**

- `e2e/commands/update.e2e.test.ts:40`: the `UPDATE_NO_CLAUDE_CLI` cases (:152, :176) run with a REAL `claude`
  on PATH — fnm's node bin dir holds one. Build PATH with `pathHoldingOnly`, assert `claude` is not found, and
  delete "deterministic on every machine" (:29-31).
- Two negatives that cannot fail (they look for double quotes in single-quoted TS output):
  `uninstall-global-propagation.e2e.test.ts:171`, `compile-config-types-refresh.e2e.test.ts:241`.
- Duplicate factories: `buildClaudeSettings` vs `renderEnabledPluginsSettings`; one definition for the
  installed_plugins envelope (`helpers/disk-writers.ts:159-176`).
- `renderConfigTs(` helper-bypass siblings: share, edit-ui, edit-from, installation-payload, mutate-global,
  init (8), list.
- `writeCorruptTestConfig` is also the only zero-byte writer — rename to something like `writeRawTestConfig`.
- Narrowing probes judged on exit code only, never `.rejected` — 6 sites listed in the leftovers file.
- Editor: 51 `toEqual` on objects remain outside the lane's files; no lint rule stops them or `import { type A }`.

**Doc items — for doc round 3:**

- `installation-factories.ts` docblock and its `factories.md` row say override `agentsDir`; the code reads `projectDir`.
- `packages/cli/CLAUDE.md` "Test Assertions" calls `toHaveConfig`'s `skillIds` check a text scan; it is structural.
- `.ai-docs/agent-findings/` entries owed (cannot-fail negatives; negation read from the wrong stream).
- The retired "just-created" premise survives in product text: `config-types-io.ts:104-109`, compile
  `config-types-source.ts:444`.

**Questions for the owner — ANSWERED 2026-09-26:**

- `disallowedTools` dropped silently on Codex — _"dont worry about that for now as long as its documented"_.
  Documented in `configuration/providers.md` and the CHANGELOG (`compilation-pipeline.md` already said it).
- Claude-gated specs — _"it should be skipped when no claude and no codex is installed ... there are many tests
  that are skipped when no claude is installed"_. **Queued as CLI-894** (44 files; all skip on CI).
- **Asked back:** where the "simple AGENTS.md telling it to use subagents" goes.

## Traps that cost time this session

- **`npm test` inside `packages/cli` reports "No test files found".** It resolves vite from the root
  `node_modules` and collects nothing. Not a failure — an invocation quirk. Run suites through turbo
  from the repo root: `npx turbo test --filter=agents-inc`. (The count moves with every change, so it is
  deliberately not written here — read it off the run.)
- **In a zsh loop, `generate:$g:check` expands `$g:c` as a history modifier** and silently runs a script
  that does not exist ("Script not found"), so nothing is checked and it looks like a pass. Write `${g}`.
- **A bare `node` here is v18.20.8**, below the 20.11 floor. `export
PATH=$HOME/.local/share/fnm/node-versions/v23.10.0/installation/bin:$PATH` (`fnm use 23` does not
  work in this shell).
- **Agent role paths are not checked by anything.** A workflow lane pointed at a directory that does
  not exist runs as a generic agent, silently and confidently. The correct ones:
  `meta/codex-keeper` (not `documentation/`), `developer/web-developer` (there is no
  `frontend-developer`), `tester/cli-tester` for test lanes, `developer/cli-developer`,
  `reviewer/reviewer`. All under `packages/cli/src/agents/`.
- The compiled agents under `ai-benchmarking/agents-inc/.claude/agents/` are the **setup under test**,
  not tooling to reach for — and they are not registered for a session rooted above them anyway.
- **Two parallel lanes that both rebuild `dist/` corrupt each other's test runs.** In round 6 the docs
  lane's turbo doc-checker run rebuilt `dist/` while the code lane's spec was running in a container:
  12 spurious failures ("dist/ was replaced while this run was in flight"). The lane caught it and
  counted only a run where `dist/`'s mtime was identical before and after. Same hazard `ROADMAP.md`
  records for the ruling round. **When lanes run in parallel, only one may build**, or each must check
  `dist/`'s mtime around its run.
- **A repair loop must be able to reach the file that needs fixing.** Lanes barred from editing docs looped four
  times on a doc-roster drift none of them was allowed to touch. When a repairer reports "no edit to my files can
  fix this", believe it and route the fix to whoever owns the file, instead of retrying.
- **Never pass reviewer findings to a fixing step through a truncated string.** `JSON.stringify(votes).slice(0,
9000)` silently dropped about half of 44 findings in the source review, and the fixing step could not know.
  Write findings to disk and have the fixer read them whole; a fixer that reports "the text was cut off" is the
  only warning you get.

## The owner's full review — TRIGGERED 2026-09-25 as CLI-890; done bar doc round 3 (see the top)

**A full review of every uncommitted file** — ~600 of them. Owner 2026-09-25: _"Once everything is
done, then I will have you go over the code that was written these 600 files plus and review
everything as none of it was written by the correct sub-agents. But tests pass, so it should be
functional."_

The premise matters for how it is run: the code is believed FUNCTIONAL (suites green) but was written
by generic agents told to read role partials, not by the registered `cli-developer` /
`web-developer` / `cli-tester` agents with their skills wired in. So the review is for convention and
quality drift that tests cannot see — not a hunt for behaviour bugs, though it should report any it
trips over.

### Found along the way and deliberately NOT fixed — the worklist for that review

- **`as unknown as` double casts in test files (CLAUDE.md forbids them)** — find them with `grep -rn 'as unknown as' packages/cli/src --include='*.test.ts'`. Not five, and not only Codex: the 2026-09-25 todo review counted ~25 sites across 8 files, one a Claude host test.
- **A load-dependent e2e flake**: `e2e/interactive/init-wizard-default-source.e2e.test.ts`, "should
  complete init with default source without ENOENT". Times out at 30 s in `ConfirmStep.confirm` during a
  23-skill plugin install; ~18 s alone, 25–46 s under the full suite. Failed on BOTH attempts in four
  separate full runs across rounds 2–3.
- **8–12 CLI e2e specs pass only on the configured single retry** in a full run — eject, list, the
  wizards, and others. None failed outright.
- **`monorepo-layout.md`** says check-web times out at 15 minutes; `ci.yml:53` says 25.

## Still the owner's, not ours

- **The Codex run-through**, once he has a subscription:
  [`../../packages/cli/.ai-docs/reference/codex-hand-check.md`](../../packages/cli/.ai-docs/reference/codex-hand-check.md)
- **Nothing is committed.** Read `git status --short` for the size; the count moves with every change. He groups and times every commit.
