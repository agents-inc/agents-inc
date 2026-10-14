# Audit issues, 2026-10-03

This is an audit after CLI-902, run on the working tree: 0.165.0 plus the uncommitted CLI-902 fixes. Every suite ran
unfiltered, and every non-Codex user journey was driven by hand in seven lanes, CLI in tmux and editor in Playwright.

**Suites:** all green except three unit tests, now fixed (row 0 below).

**Journeys:**

| Lane        | Result                                                                           |
| ----------- | -------------------------------------------------------------------------------- |
| wizard      | 10 PASS, 1 PASS with a stale row                                                 |
| lifecycle   | 9 PASS, 4 PASS with a stale row, 1 PARTIAL                                       |
| modes       | 4 PASS, 1 PASS with a stale row                                                  |
| marketplace | 9 PASS, 1 N/A                                                                    |
| share       | 9 PASS, 2 PASS with a stale row                                                  |
| crossweb    | 7 PASS, 1 PASS with a stale row, 1 PARTIAL                                       |
| browser     | 12 PASS, 2 PARTIAL, 2 FAIL, 2 BLOCKED (the signed-in halves need a GitHub login) |

**Journey 29, the 2026-10-01 FAIL, now passes:** all 8 sub-agents round-trip byte-identical from a project-minted
id.

**Stale rows** are journey rows whose prose a ruling overturned. They are recorded, not fixed, because the docs are
being removed.

The **New?** column says whether the 2026-10-01 run missed the issue.

| #   | Where                 | Issue                                                                                                                                                                                                       | New? | Status  |
| --- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------- |
| 0   | CLI unit              | Three tests failed: the citation checker read dated plan names as missing findings (CLI-868), and a `compile` test broke on long temp paths                                                                 | no   | fixed   |
| 1   | `init/edit --from`    | They list the plan and ask "Install/Apply this configuration?", then refuse after you answer yes, because a hand-written folder sits at a carried skill's id. Every other refusal fires before the question | yes  | fixed   |
| 2   | `edit` (project)      | A project-only edit adds `marketplaceName` to the global `config.ts`. From a project, nothing global should change                                                                                          | no   | fixed   |
| 3   | `init --from`         | It prints a false "No agents found to recompile" right after compiling 8 agents, when one agent failed (exit 5)                                                                                             | no   | fixed   |
| 4   | `compile`             | When it refuses (no skills found), it still prints "Refreshed config-types.ts" and rewrites that file before exiting 1                                                                                      | no   | fixed   |
| 5   | `edit --ui --from`    | In a folder with no installation, it suggests `edit --from <id>`, which refuses there. It should suggest `init --from`                                                                                      | no   | fixed   |
| 6   | `build marketplace`   | Its namespace refusal says to rename "the id in its metadata". The id is SKILL.md's `name:`                                                                                                                 | no   | fixed   |
| 7   | `new marketplace`     | Its reserved-name refusal offers "set package.json 'name', or pass --name". Neither exists at that point                                                                                                    | no   | fixed   |
| 8   | editor preview        | Both `config.ts` files lack the `marketplaceName` line `init --from` writes (journey 48 PARTIAL). The global `projects` paths can't be known, and stay out                                                  | no   | fixed   |
| 9   | editor composer       | Signed out, it sends `POST /compose` (401), then says "nothing was sent"                                                                                                                                    | no   | fixed   |
| 10  | editor, dark theme    | The Install button's "N agents · N skills" and the Send button's "Ctrl" hint match their button background, so they're invisible                                                                            | no   | dropped |
| 11  | editor, dark theme    | The output preview's code keeps the light theme's ink, so it's unreadable                                                                                                                                   | no   | dropped |
| 12  | editor, dark theme    | The "search skills" placeholder is about 1.4:1 contrast against its band                                                                                                                                    | no   | dropped |
| 13  | editor, keyboard      | Tab focus lands on controls the docked composer covers (20 of the first 60 stops), so the focus ring is hidden                                                                                              | no   | fixed   |
| 14  | editor, keyboard      | Closing the Add skill dialog puts focus on `<body>`, not back on the Add skill button                                                                                                                       | no   | fixed   |
| 15  | editor nav            | The EDITOR nav link loses its active state whenever the URL carries `?q=`, `?domain=` or `?sel=`                                                                                                            | no   | fixed   |
| 16  | editor options panel  | The disabled label "INSTALL 8 SUB-AGENTS NEED PROJECT SCOPE" has no padding, overflows its button, and is faint                                                                                             | no   | fixed   |
| 17  | editor install dialog | The footer wraps "npx agents-inc edit", leaving "edit" on its own line                                                                                                                                      | no   | fixed   |

**Not defects:**

- **Journey 39's toast:** the stack warning shows on the startup band only, by design since 0.159.0, so the row is
  stale.
- **Recompiling from HOME:** compiling a registered untrusted project from HOME prints no trust line. Nothing new is
  installed there, so journey 79 doesn't apply.

**Plan:** every open issue gets a test that fails first, then a fix.

- **Simple ones (3–7, 9, 13–17):** one agent, no reviewer, per your rule. You dropped the dark-theme issues 10–12.
- **1, 2 and 8 change behaviour:** tester, developer, then an independent reviewer.
- **When they're done:** all suites run again, then the affected journeys by hand. Repeat until clean.

Each lane's reproductions are in the session scratchpad's `fix/audit/<lane>.md`.

## Status, 2026-10-03

**14 issues are fixed and applied to this tree** (1–9 and 13–17), each with a test that failed first. 1, 2 and 8
also passed an independent review. Siblings fixed with them:

- **Codex:** two `--from` refusals that fired after the question;
- **`init --from`:** a refusal for a configuration with nothing installable, which also fired after the question;
- **`--ui`:** the `init --ui --from` and bare `init --ui` hints over an existing installation;
- **The Marketplace dialog** dropped focus, the same bug as 14.

**The editor's first-paint budget** went over by 95 B. You chose to turn Vite's modulepreload polyfill off and to
raise the budget to 352 KiB, which leaves 8.1 KiB under.

**Gates on this tree, unfiltered:** everything passes except two CLI e2e files. They failed under full-suite load on
the wizard paint check, and pass alone (2 × 12/12). They are being root-caused.

**The CLI hand-run, 2026-10-03:** 18 PASS, 0 FAIL. Issues 1–7 hold by hand, and so do the 2026-10-02 fixes it
spot-checked.

**The browser hand-run, 2026-10-03:** issues 8, 9 and 13–17 hold by hand. The everyday walk is PARTIAL (issue 24),
and the custom-marketplace name in the preview is BLOCKED: there is no custom catalogue on GitHub to load.

**New from round 2.** Each gets a test that fails first, then a fix.

| #   | Where             | Issue                                                                                                                                                                                                                                                                                                              | Status |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 18  | marketplace names | A marketplace named `eject` turns a plugin install into a silent local copy: its skills record `origin: 'eject'`, the ejected marker. Only `agents-inc`, `external` and `local` are reserved                                                                                                                       | fixed  |
| 19  | `edit --from`     | With no terminal, in a folder with no installation, it says to run `edit --from <id>` from a terminal. That then refuses: no installation                                                                                                                                                                          | fixed  |
| 20  | install report    | The skills line names the wrong folder and number. From a project, a global install prints "Copied 2 skills to .claude/skills/", but the folder is HOME's; the editor's install dialog has the same slip. Singular counts read "1 skills": "ejects 1 skills", "Copied 1 local skills", "Installed N skill plugins" | fixed  |
| 21  | editor, keyboard  | Tabbing backwards, 8 of the first 60 stops land behind the sticky filter bar (13 at the top edge)                                                                                                                                                                                                                  | fixed  |
| 22  | wizard input      | Root-caused, and the bug predates this round. The CLI turns raw mode on only after its first paint. An Enter pressed in that gap is echoed by the terminal, which scrolls the full-height frame up a line, and the key is lost. Users can hit it too; the tests hit it under load                                  | fixed  |
| 23  | editor, keyboard  | A skill cell shows no focus ring when tabbed onto; the cell's `overflow: hidden` likely clips the ring of its overlay button (`LatticeCellButton`, `packages/ui`)                                                                                                                                                  | fixed  |
| 24  | editor, layout    | With a skill's options panel open near the bottom of the screen, scrolling lifts the whole app 105px, and the panel draws below the composer, outside the frame. Possibly caused by issue 13's scroll padding                                                                                                      | fixed  |

**Round 2 fixes (2026-10-03):** 18–24 are fixed and applied to this tree (`audit-fix-2/combined.diff`, 51 files).
Each has a test that failed first, and 18 and 22 passed an independent review.

**Every gate on this tree is green, unfiltered:**

- CLI unit: 7,993, all passing, `check-findings-frontmatter` included;
- CLI e2e: 1,303;
- smoke: 48;
- editor Playwright: 656;
- web units, build, typecheck and lint.

**New, found while fixing round 2:**

| #   | Where               | Issue                                                                                                                                                                                                        | Kind                   |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| 25  | marketplace names   | An install made before the fix, or a hand-edited `config.ts`, can still record `marketplaceName: 'eject'`. That stored name outranks the manifest, so the plugin-becomes-copy bug survives there             | bug                    |
| 26  | marketplace names   | The loader still loads marketplaces named `local` or `external`, though `build` and `new` refuse those names                                                                                                 | decision               |
| 27  | wording             | "1 skills"-style counts remain in `build plugins`, `build marketplace`, `compile`'s "Discovered N … skills", `eject` and doctor's ratios; two tests assert "Compiled 1 skill plugins"                        | bug (minor)            |
| 28  | dashboard           | Keys arriving in one burst act on a stale focus: Down Down Enter opens Edit, not Doctor. `use-keyboard-navigation.ts` updates its focus ref in an effect, and `use-focused-list-item.ts` may share the shape | bug                    |
| 29  | dashboard           | Ctrl+C exits 0, where every other prompt exits 4 (cancelled)                                                                                                                                                 | decision               |
| 30  | CLI e2e             | "toggle focused skill scope with S key" reads the screen without waiting for a repaint (`build-step.ts`), so it is flaky under load                                                                          | flaky test             |
| 31  | editor e2e          | The `a11y` Playwright tests hit their 30 s limit under heavy load; they pass alone                                                                                                                           | flaky test             |
| 32  | tests               | Two CLI spec files fake a terminal with `isTTY` alone (`edit-ui.test.ts`, `edit-from.test.ts`). The fixer proposes a `CLAUDE.md` rule: use `standAtTerminal()`                                               | test hygiene           |
| 33  | `packages/ui` tests | Eleven story assertions, and `skill-options.spec.ts`'s `focusRing`, check only that a box-shadow exists, so they cannot see a clipped ring. That is how 23 stayed green                                      | test hygiene           |
| 34  | docs                | Now false: the public site says "three names you cannot use" (`creating-a-marketplace.md`), and four `.ai-docs` passages describe the old refusal order and reserved list                                    | docs (your rule: skip) |
| 35  | editor e2e harness  | The editor's Playwright config fixes the port at 5173 and reuses any server already there. A copy's run can therefore test another tree, here the owner's dev server                                         | test harness           |
| 36  | editor e2e helper   | `scrollToBottom()` read the page before a deliberately deferred resize landed. The merge fixed it (`FRAMES_UNTIL_A_DEFERRED_WRITE_IS_LAID_OUT`); still open is whether to write a finding                    | fixed (finding?)       |
| 37  | wizard grid         | The same stale focus as 28. Space and Tab in `use-category-grid-input.ts`, and Space in `checkbox-grid.tsx`, read the focus from the last render, so a fast "Right, Space" toggles the cell before the move  | bug (round 3)          |
| 38  | bare dashboard      | On the bare `agents-inc` dashboard, Escape or any chosen command is followed by the full help listing: oclif swallows the hook's exit 0 and falls through to help. Predates this work                        | bug (round 3)          |
| 39  | `packages/ui` tests | `menu.stories.tsx › Picking Reports The Choice` fails about half the time, on an axe error about Base UI's focus guards. It predates this work                                                               | flaky test             |
| 40  | `packages/ui` tests | The new visible-ring check runs stories at 80% zoom, where a clipped ring can leak a faint 1px line and pass. A wholly hidden ring, like 23's, still fails                                                   | known gap (decision)   |

**Your answers, 2026-10-03:**

- **26:** the loader refuses `local`, `external` and `eject` from one list. `agents-inc` stays loadable, because it is
  the public catalogue's own name.
- **29:** Ctrl+C on the dashboard exits as cancelled.
- **Docs:** update only the essential ones and forget the rest. The one essential doc is the public site's reserved
  marketplace names (`creating-a-marketplace.md`).
- **25, 32 and 33 are in scope too.**

**Round 3 (done):** 25–33, 35, 37 and 38, each with a test that fails first, plus the one essential doc. After it lands,
every user journey is hand-run again.

**In progress:**

- the affected journeys, run by hand: CLI and browser;
- **the next round:** tabbing backwards, 8 of the first 60 stops land behind the sticky filter bar (13 at the top
  edge).

## Round 3 landed, 2026-10-03

**Issues 25–33, 35, 37, 38 and the reserved-names doc are fixed and applied** (`audit-fix-3/combined.diff`, 63 files).
Both lanes passed an independent review. Every gate on this tree is green, unfiltered:

- CLI unit: 8,007;
- CLI e2e: 1,309;
- smoke: 48;
- editor Playwright: 656, now on its own port 5199;
- web units, build, typecheck and lint.

**The full hand-run:** 48 PASS, 10 PASS (row stale), 10 PARTIAL, 3 FAIL, 2 BLOCKED (the GitHub sign-in halves of 49
and 50), and 1 N/A. All 3 FAILs are in the editor walk. An independent verifier reproduced every new defect below.

### Caused by this week's fixes (fix these first)

| #   | Where       | Issue                                                                                                                                                           |
| --- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 41  | editor      | Tabbing onto the roster's Save, Share, Preview and Install scrolls the catalogue about 400px. The scroll clearance from 13 and 21 is the cause                  |
| 42  | editor      | Typing in the docked composer or the stuck search scrolls the catalogue on every key (65 or 119px). Same cause                                                  |
| 43  | CLI         | `init --marketplace Y`, Edit from the dashboard, offers only the global's domains, and the Domains tab cannot be reached (dropped: the wizard is being removed) |
| 44  | CLI         | From a project, `edit --from` with an id that drops a global skill says "Nothing is removed — this configuration only adds" and doesn't list the skill it keeps |
| 45  | CLI         | When only the recorded name is reserved (25), the refusal says "rename the marketplace", though the manifest's name is fine                                     |
| 46  | public docs | `reference/commands.md` still lists three reserved names under `new marketplace`. This is an essential doc                                                      |
| 47  | CLI tests   | The new bare-dashboard Ctrl+C and Escape specs take no tree snapshot, and one spec went red for the wrong reason                                                |
| 48  | ui tests    | The visible-ring helper's comment, and row 40, claim the stories would catch 23. With 23's code put back, the lattice story still passes                        |
| 49  | editor      | The `playwright.config.ts` comment's three-runs reproduction recipe is now false, since 35 stopped reuse                                                        |

### Older bugs, found now (they predate this week)

| #   | Where     | Issue                                                                                                                                                                               |
| --- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 50  | wizard    | Pressing Esc back to the stack step forgets which stack was picked, so Enter silently switches stacks (dropped: the wizard is being removed)                                        |
| 51  | wizard    | An Enter typed while "Loading skills…" shows is echoed and lost. That is 22's window, earlier (dropped: the wizard is being removed)                                                |
| 52  | wizard    | Moving a skill from project to global, when an agent exists at both scopes, leaves the global agent without the skill (`splitConfigByScope`) (dropped: the wizard is being removed) |
| 53  | wizard    | A scope move with `s` copies the skill's folder but prints no copy line (dropped: the wizard is being removed)                                                                      |
| 54  | wizard    | NO_COLOR is ignored, and on Sources only bold or dim shows whether Local or Plugin is chosen (dropped: the wizard is being removed)                                                 |
| 55  | wizard    | Stale focus, as in 28 and 37: the Agents step's keys and the S hotkey act on the item before the move (dropped: the wizard is being removed)                                        |
| 56  | CLI tests | 14 e2e specs read the screen right after pressing `s`, without waiting for a repaint, so they can pass for the wrong reason (dropped: the wizard is being removed)                  |
| 57  | wording   | The plurals left over: doctor's "— 1 skills", "Could not copy N of 1 skills", "1 agent is global-scoped … recompile them"                                                           |
| 58  | CLI       | A bare `agents-inc` over an unreadable `config.ts` prints help and says nothing about the broken file                                                                               |
| 59  | CLI       | A global `edit` silently skips a registered project whose config is broken ("Recompiled agents in 0 registered projects")                                                           |
| 60  | CLI       | A global `compile` that skips a registered project with a broken config warns in `uninstall`'s wording                                                                              |
| 61  | `update`  | Prints "Update complete! N marketplaces refreshed", but the installed plugins keep their old version                                                                                |
| 62  | trust     | Claude records trust under the git repo root, but the check reads the exact project folder. A project below a repo root is told it's untrusted forever                              |
| 63  | trust     | In a folder below a trusted one, the trust line asks the user to accept a prompt Claude never shows                                                                                 |
| 64  | wizard    | With a source that has no stacks, the Domains title box's left border is cut off (dropped: the wizard is being removed)                                                             |
| 65  | editor    | After a marketplace loads, its nav-rail label sits flush against the left edge, truncated, with no title showing the full ref                                                       |
| 66  | share     | Re-applying an id whose carried skill changed rewrites the skill, prints "No changes made", and never recompiles the agent                                                          |
| 67  | share     | A destructive `edit --from` removes a sub-agent whose only skill can't be placed, though the id names it                                                                            |
| 68  | crossweb  | Back from the editor in an installed project, the Install dialog offers only `init --from`, which refuses there and names only `uninstall`                                          |
| 69  | crossweb  | A carried skill's `metadata.yaml` gets its full description as `cliDescription`, so doctor warns on almost every editor-added skill                                                 |
| 70  | editor    | Search can't take a space: "react query" becomes "reactquery", with no matches                                                                                                      |
| 71  | editor    | Escape in a skill's options panel drops focus to `<body>`                                                                                                                           |
| 72  | editor    | Opening a roster agent's model/effort/scope menu drops focus to `<body>`                                                                                                            |
| 73  | editor    | Applying a composer proposal leaves focus on `<body>`                                                                                                                               |
| 74  | editor    | Enter in the Marketplace dialog's field does nothing                                                                                                                                |
| 75  | editor    | When the catalogue is shorter than the window, a 42px strip shows under the main column and the composer floats over it                                                             |
| 76  | editor    | With every skill ejected, the install dialog still says "and links the rest as plugins"                                                                                             |

### Need your ruling

- **40, the story zoom gap:** accept it, or run the story tests at full size?
- **`packages/ui/CLAUDE.md`'s "no helpers" rule:** does it allow the shared visible-ring helper?
- **61, `update`:** should it also update the installed plugins, or only say what it actually refreshed?

**Owner, 2026-10-03:** "disregard all failing tests that involve the wizard as that will be removed soon".

- **Dropped:** 43, 50–56, 64 and 77.
- **52 caveat:** its cause is in the shared `splitConfigByScope` (`packages/compile`). Recheck it if `--from` or the
  editor ever shows the same thing.

**Owner, 2026-10-03:**

- Log the editor bugs but don't fix them; they're minor in comparison. That covers 39, 41, 42, 48, 49, 65 and 70–76.
- Messages added for cases like 59 and 60 carry the bare basics only.
- Simple fixes need no extra verification rounds. Every scenario still gets a test that fails correctly, and then the
  fix.

**Round 4 (done):** 44–47, 57–63 and 66–69, the CLI half of 68 only. For 61 the default is truthful wording, pending
your ruling.

## Round 4 landed, 2026-10-03

**Issues 44–47, 57–63 and 66–69 (the CLI half of 68) are fixed and applied** (`audit-fix-4/combined.diff`). Every
scenario got a test that failed first. Every gate on this tree is green, unfiltered:

- CLI unit: 8,024;
- CLI e2e: 1,334;
- smoke: 48;
- editor Playwright: 656;
- web units, build, typecheck and lint.

**Hand-run of the touched non-wizard journeys:** 35 PASS, 7 PASS (row stale), 4 PARTIAL, 0 FAIL, and 1 N/A. Every
round-4 fix held. The shared worker crashed mid-run (a wrangler network error) and was restarted.

**New.** An independent verifier reproduced every one.

| #   | Where                      | Issue                                                                                                                                                                 | Since     |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 78  | `edit --from`              | **Data loss.** From a project, it deletes the project half of a `[P][G]` pair while its plan says "Nothing is removed"                                                | this week |
| 79  | share round trip           | **Data loss.** 69 shortens a carried skill's `cliDescription`, and re-sharing reads `cliDescription` back as the description, so an `edit --ui` re-share truncates it | this week |
| 80  | `edit --from`              | A destructive apply drops a skill the id names when a kept hand-written skill shares its category on the same sub-agent; the plan doesn't say so                      | older     |
| 81  | `--from`                   | An unknown `stackId` is refused only AFTER installing, which leaves a half-finished install                                                                           | older     |
| 82  | `edit --from`              | From a project, global sub-agents an id leaves out are kept (right) but named nowhere                                                                                 | this week |
| 83  | `edit --from`              | From a project, a changed carried GLOBAL skill is not written (right), and the run says nothing about it                                                              | this week |
| 84  | `init --ui --marketplace`  | The refusal's hint names `init --marketplace X`, which refuses in a folder installed from another marketplace                                                         | this week |
| 85  | `doctor`                   | It counts the global install's ejected skills as available from the project's marketplace                                                                             | older     |
| 86  | public docs                | The quickstart says `update` pulls newer skill content, which is false. This is an essential doc                                                                      | older     |
| 87  | trust                      | `CLAUDE_CONFIG_DIR` is ignored: trust is read from `~/.claude.json` only                                                                                              | this week |
| 88  | `edit --from`, `uninstall` | The removal plan's items sit at the same indent as their headings (cosmetic)                                                                                          | older     |
| 89  | `compile`, `uninstall`     | Other skipped projects (a stale path, the other provider, a failed write) still get `uninstall`'s wording; 60's sibling                                               | older     |

**Need your ruling:**

- **61:** should `update` also update installed plugins (`claude plugin update`)? Today it only says truthfully what it
  refreshed.
- **87:** should the CLI honour `CLAUDE_CONFIG_DIR`?
- **44:** from a project, a project-only id over a large global install now lists every kept global skill. Keep the
  list, or show a count?
- **40:** accept the story focus check's zoom gap, or run the stories at full size?
- **`packages/ui/CLAUDE.md`:** may its "no helpers" rule allow the shared visible-ring helper?

**Owner, 2026-10-03, on 78:** dropping the project copy is right; "so it's just about not telling the user this". The
fix is disclosure: the plan lists the dropped project copy as a removal.

**Round 5, running** (workflow `wf_ca30ddec-7c6`): 78, 79 and 80, each with a test that fails first. Then the change
is applied with every gate, and the share journeys are hand-run. 81–89 and the rulings wait for the owner.

**Owner, 2026-10-03:** do 81–89. Small fixes get no extra reviewers. 78, 79, 80, 81 and 85 get a test written first,
shown failing before the fix. 87 is a go: honour `CLAUDE_CONFIG_DIR`.

**Round 6:**

- **Running** (workflow `wf_21c4ffee-e2a`, base = the tree before round 5): 81 and 85 tests first; 84, 86, 87 and 89
  fixed straight.
- **After round 5 lands:** 82, 83 and 88, the plan-printing siblings of 78, go on top. Then all of it merges and is
  applied with every gate.

## Round 5 landed, 2026-10-04

**Issues 78, 79 and 80 are fixed** (`audit-fix-5/combined.diff`, 20 files). Each got a test first, shown failing.

- **78:** the plan lists the dropped project copy as a removal; the global one takes over.
- **79:** a re-share carries the full description from SKILL.md.
- **80:** the kept skill joins the id's row instead of overwriting it.

**Gates on this tree:**

- CLI unit: 8,028, all passing;
- web units, typecheck and lint;
- CLI e2e: 1,336 passing, plus 3 load timeouts in wizard specs that pass alone (wizard specs are disregarded);
- smoke: 48;
- editor: 656.

**Hand-run:** journeys 8, 24, 29 and 31 pass, and 34 is PARTIAL. 78 and 79 hold.

**New, caused by round 5:**

| #   | Where         | Issue                                                                                                                                                                                                               | Since   |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 90  | `edit --from` | 80's join ignores categories that take ONE skill. There, `edit --from` fails AFTER the yes ("Category 'web-framework' is exclusive but holds 2 skills") with its removals already done, so the tree is half-applied | round 5 |

**Round 6, part B** (workflow `wf_2904137f-782`, done), in order:

1. Merge the 81–89 lanes onto this tree.
2. Fix 90 test-first. In a single-skill slot the id's skill takes the slot, and the kept skill stays installed but
   unassigned, with one bare plan line. Any write the writer would refuse is refused before the question.
3. Make the straight fixes 82, 83 and 88.
4. Apply with every gate.
5. Hand-run the share, marketplace and lifecycle journeys.

## Round 6 landed, 2026-10-04

**Issues 81–90 are fixed and applied** (`audit-fix-6/combined.diff`, 53 files). 81, 85 and 90 got their tests first,
shown failing. Every gate on this tree is green, with nothing re-run:

- CLI unit: 8,041;
- CLI e2e: 1,360;
- smoke: 48;
- editor: 656;
- web units, build, typecheck and lint.

**Hand-run:** 8 PASS, 4 PASS (row stale), 3 PARTIAL, 0 FAIL. Every round-5 and round-6 fix held by hand, including 90
in five setups. The shared worker crashed again (wrangler); the lanes finished on a stand-in.

**New:**

| #   | Where                    | Issue                                                                                                                                                                                                | Kind       |
| --- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 91  | `edit --from`            | It rewrites an editor-added skill's files, local edits included, while the plan says "Nothing is removed" and names nothing. 78's sibling: disclose it                                               | disclosure |
| 92  | `edit --from`            | Switching ejected skills to plugins deletes the local copies, edits included, while the plan says "Nothing is removed". 78's sibling: disclose it                                                    | disclosure |
| 93  | `edit --from`            | 83's new line says "change them with `npx agents-inc edit` from your home directory", a route that doesn't work (a bare `edit` at HOME opens the wizard)                                             | wording    |
| 94  | `init --from`            | A public-catalogue id (no `marketplace` field, as the editor and `share` mint it) can't be installed into a fresh project when the global install came from a custom marketplace                     | bug        |
| 95  | `init --from`            | A project set up from the public catalogue under a global from `acme` records `marketplace: github:agents-inc/skills` with `marketplaceName: 'acme'`, so a later plugin install asks for `<id>@acme` | bug        |
| 96  | `compile`, `edit --from` | Run globally, they write into a registered project that holds both `.claude-src/` and `.agents-inc/claude/`, silently, though that project refuses every write run inside it                         | bug        |
| 97  | `CLAUDE_CONFIG_DIR`      | With it set, a global install still writes its sub-agents and skills to `~/.claude/`, where Claude Code doesn't read them (87 is only half done)                                                     | bug        |
| 98  | `init --from`            | A fresh project's `config.ts` takes the global config's description over the share's own (`mergeConfigs`)                                                                                            | minor      |
| 99  | `edit --from`            | An id naming another marketplace is silently applied from the installation's own; nothing says so                                                                                                    | wording    |
| 100 | `--from`                 | The unshipped-stack refusal (81) offers no way forward                                                                                                                                               | wording    |

**Filed in `todo/` (2026-10-04):**

- **CLI:** 91–100 are CLI-908 to CLI-917. The rulings 61 and 44 are CLI-918 and CLI-919.
- **Editor:**
  - 41 and 42 are EDITOR-80 and EDITOR-81;
  - 68 (editor half) is EDITOR-82;
  - 65 is EDITOR-83;
  - 70 is EDITOR-84;
  - 71–73 are EDITOR-85;
  - 74 is EDITOR-86;
  - 75 is EDITOR-87;
  - 76 is EDITOR-88;
  - 39 is EDITOR-89;
  - 40, 48 and the "no helpers" rule are EDITOR-90;
  - 49 is EDITOR-91.
- **Not filed:** wizard-only items (dropped), and non-essential docs (skipped by owner ruling).
