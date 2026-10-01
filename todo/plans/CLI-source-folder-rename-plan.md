> **R3 (`migrate`) IS DELETED — owner, 2026-09-20: "We don't have a migrate command and I didn't tell
> you to make one" → "Delete all of it."** The orchestrator adopted R3 from this plan's own D1
> recommendation and reported it rather than asking; that was scope the owner never requested. The
> command, its ten modules, its ten e2e specs, the forwarding stub, `--adopt`, the registered-project
> rewrite and the git-visibility probe are all removed. **What the rename still delivers without it:**
> new installs write `.agents-inc/<provider>/`, existing `.claude-src/` installs are read AND written
> in place indefinitely, and moving one by hand is documented with its two gotchas — the
> `config-types.ts` relative import gains a level, and a `.gitignore` covering `.agents-inc/` hides the
> moved config from git. Kept, because they are about the RENAME and not about migrating: doctor's
> Layout row, and the refusal to WRITE while two source folders are on disk (reworded so it names the
> manual fix instead of a command that no longer exists).

# Source folder rename — plan

## Scope

**What this delivers.** The folder a project keeps its agents-inc source in stops being named after one provider. `.claude-src/` becomes `.agents-inc/claude/`, at both scopes — `<project>/.agents-inc/claude/` and `~/.agents-inc/claude/`. Codex gets `.agents-inc/codex/` with the same shape. One installation is exactly one provider, and the folder is what says which; nothing inside config.ts records it.

**What does not move.** Installed output keeps its paths: Claude still installs into `.claude/`, Codex into `.codex/` and `.agents/skills/`. The marketplace, the share payload, share ids and saved stacks are untouched [SV app-surface, §4].

**What installed output does change — bytes, not paths.** Two CLI surfaces name the source folder inside text we ship:

- `agent-summoner`'s playbook names `.claude-src/` six times, and `agent.liquid:34` inlines `{{ playbook }}`, so every compiled `.claude/agents/agent-summoner.md` tells an agent to author into that folder [CV critic-1 §3; one real install on this machine carries 13 occurrences, `/home/vince/dev/cv-launch/.claude/agents/agent-summoner.md`, CV critic-2 §4].
- CLI messages at `init.tsx:1073`, `uninstall.tsx:485-487`, `eject.ts:251/:255` and `doctor.ts:92`.

That is not cosmetic. An installed agent that writes into the folder the CLI is no longer reading creates a project holding both folders, which the resolver has to refuse. So "only the source folder is renamed" has a fifth consequence the brief did not list, and this plan carries it.

**What users will notice.** Three things, all named:

- doctor grows a `Layout` row per scope;
- a one-line nudge on write commands while a scope is still on the old name;
- one new command, `npx agents-inc migrate`.

Existing installs keep working, in place, without being touched. Nothing moves until someone runs `migrate`.

**What this plan refuses to do:**

- move folders inside repos the user did not ask about;
- run any git write command, ever;
- edit anyone's `.gitignore`;
- treat the global config's `projects[]` list as an inventory of installs. It holds 1 entry on this machine against 6 on-disk installs [CV critic-2 §6].

**Named limits:**

- a CLI older than this change, standing in a migrated project, does not fail loudly on its own. We make it fail loudly with a forwarding stub (D2), and that is the whole of our leverage over old binaries;
- a marketplace author's `.claude-src/config.ts` lives in a repo we only read. We read that name in sources for good (D5);
- two providers in one project each keep their own custom agents under `.agents-inc/<provider>/agents/`. An agent authored for one is invisible to the other. That follows from the ruling.

## Steps

**Labels.** [V] = I ran it in this pass (read-only git, file reads; no build, nothing in /home/vince/dev/cli changed). [SV] = a mapping stream ran it and I did not re-run it. [CV] = a critic ran it and I did not re-run it. [R] = I read the code, file:line given. [A] = assumed.

**Rules for every step** (from `/home/vince/dev/cli/CLAUDE.md` and `packages/cli/CLAUDE.md`):

- Order: write the tests and watch them fail → implement → the `meta-design-expressive-typescript` pass → run it by hand through the real CLI → docs through `codex-keeper` → the orchestrator updates `todo/`.
- Who does the work: cli-developer and cli-tester in packages/cli and packages/compile; web-developer and web-tester in apps/editor. After each step `reviewer` checks the work; whoever verifies never fixes.
- Every brief says: read `packages/cli/CLAUDE.md`; read-only git is allowed; no git write command; no worktrees; name the files the lane owns.
- In packages/cli, run `bun run build` before `npm test`.
- Only one lane runs `generate:*` at a time.

**How every step proves Claude did not regress:**

1. The whole existing suite: `npm test`, `test:e2e`, `test:smoke`, the packages/compile vitest, and the editor suites whenever the editor is touched.
2. R0 and R1 change no golden file at all. R2 re-records the golden trees **against a predicted diff**, not blind: exactly 20 path keys plus 4 content strings, and nothing else (see R2).
3. The `generate:*:check` scripts pass at the end of every step that touches a generated file.

### Where this goes in the programme

The rename is a release boundary, not a single dispatch. Splitting it is the one place I overruled the mapping streams: plan-delta scheduled one "Step R alone, right after Wave 1", and that packs a mechanical rename, a behaviour change and a compatibility decision into one window with three different sets of blockers. R0 and R1 need no owner ruling and no committed goldens, so they can start now; R2 and R3 cannot start until D1-D7 land.

| Wave | What runs                                                                         | Why that order                                                                                                                                                                                           |
| ---- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Wave 1 as dispatched (Codex Step 0a, the Claude golden trees), **then committed** | The goldens are untracked today — `?? packages/cli/e2e/fixtures/claude-golden-trees/` [V, `git status --porcelain`]. Without a commit, "the re-record diff is exactly the rename" has no baseline (D13). |
| 2    | **R0** (one docs string), **R1** (read both names)                                | R1 changes no behaviour and no golden.                                                                                                                                                                   |
| —    | **R1 ships in a release.**                                                        | So that anyone who upgrades in the window can read a migrated repo transparently.                                                                                                                        |
| 3    | **R2** alone (the flip), then **R3** (migrate)                                    | R2 is a `generate:compile` and `generate:matrix` lane, re-records the goldens, and sweeps ~140 test/e2e files and ~60 doc files. Nothing else can run in it.                                             |
| —    | **R2+R3 ship in a release.**                                                      |                                                                                                                                                                                                          |
| 4    | Codex Step 1 (extends R1's layout module with host roles)                         |                                                                                                                                                                                                          |
| 5    | Codex Step 2 alone                                                                | It shares command files with Codex Step 3.                                                                                                                                                               |
| 6    | Codex Step 3                                                                      |                                                                                                                                                                                                          |
| 7+   | As the Codex plan has it: Codex 4 lanes and Step 5 → Codex 7.                     |                                                                                                                                                                                                          |

Everything after R2 writes paths into new tests and docs. Running the flip later means writing `.claude-src` twice.

---

### Step R0 — One docs string, shipped before the code [apps/www only; ~3 lines]

web-developer, or codex-keeper.

The public docs tell readers to match `.claude-src/config.ts not found` in CI: `apps/www/src/content/docs/recipes/compile-in-ci.md:62` and `troubleshooting/index.md:132` [SV app-surface §5]. doctor builds that line from `CONFIG_TS_REL` (doctor.ts:92, used at :123) [R, `doctor.ts:91-92`]. After R2 the pattern never matches, and a CI job that treated "not installed yet" as fine turns red — or worse, green for the wrong reason.

- Change both to the tail `config.ts not found`, which is true under both layouts.
- Same for `troubleshooting/index.md:37, :103, :137` and `troubleshooting/common-problems.md:44-45`, which quote CLI output word for word.

**Tests first:** none — this is prose that must be true of two releases at once. `apps/www/scripts/check-cli-claims.ts` checks only command and flag membership, so nothing automated catches a wrong folder path in the docs [R, its docblock].

**Verify:** grep the site for the full old string and get zero: `git grep -n 'claude-src/config.ts not found' -- apps/www`.

**Docs:** this step is the docs.

---

### Step R1 — Read both names [no behaviour change, no golden change; ~30 files]

cli-developer and cli-tester.

Everything the CLI writes still goes where it goes today. What changes is that the CLI can now _find_ `.agents-inc/<provider>/`.

**Two new modules.**

`packages/compile/src/source-layout.ts` — relative names only, nothing that reads the machine, so the browser and the emission contract can use it. It sits beside `paths.ts` and `install-layout.ts`, which follow the same split.

- `PROVIDERS = ["claude", "codex"] as const` and `Provider`. The folder segment equals the value.
- `sourceDirName(provider)` → `.agents-inc/claude`.
- In `paths.ts`: replace `CLAUDE_SRC_DIR` (paths.ts:16 [R]) with `SOURCE_ROOT_DIR = ".agents-inc"` and `LEGACY_SOURCE_DIR = ".claude-src"`.

Do **not** ship one two-segment string. It works for Claude and leaves the parent folder behind, and detection, uninstall cleanup and `.gitignore` all need the root on its own [SV cli-surface §4].

`packages/cli/src/cli/lib/installation/install-layout.ts` — **this is the module Codex Step 1 will extend**, not a second funnel. R1 creates it holding only the source roles; Codex Step 1 adds `userConfigRoot`, `agentsDir`, `skillsDir` and the rest to the same file. Building a separate `sourceDir()` elsewhere would make Codex Step 1 re-home these call sites a second time [CV critic-1, orderVerdict §2].

- `sourceDir(root, provider)` = `path.join(root, SOURCE_ROOT_DIR, provider)`.
- `resolveSourceDir(root, provider)` → `{ dir, relName, legacy, both, stub }`. Preference order, prototyped and passed by the migration stream [SV migration §5]:
  1. `.agents-inc/<provider>/` holding a config.ts;
  2. `.claude-src/` holding a config.ts — **claude only**, and not when it is a forwarding stub (R3);
  3. a non-empty `.agents-inc/<provider>/`;
  4. `.claude-src/` — claude only;
  5. otherwise absent, and the new layout is what gets written.
     `both` is true whenever a legacy folder and a new folder both exist.
- `providerAt(root)` → which provider folders are present. It reads only the names in `PROVIDERS`. It must never enumerate `.agents-inc/` and treat every subfolder as a provider: the benchmark's hand gate keeps `baseline.json`, `typecheck-baseline.json` and `attempts/` there [R, ai-benchmarking `agents-inc/vendor/lint/gate.mjs:210-213`].
- The resolver is **synchronous**, using `existsSync`. `getProjectConfigPath` is sync and has 16 direct callers [SV cli-surface §2, re-run by CV critic-2]; making it async would spread through all of them and their callers for two stat calls.

**The provider parameter starts here, at the funnel only.** `sourceDir` and `resolveSourceDir` take `provider` from their first line. `getProjectConfigPath(dir)` keeps its signature and passes `"claude"` in one place, with a comment naming Codex Step 2 as the owner of the threading. That answers critic-2's point without asking 16 call sites to know a provider before discovery exists.

**Sites to move onto it.** All under `packages/cli/src/cli/` unless marked. Re-derive with:

```sh
git grep -n 'CLAUDE_SRC_DIR' -- 'packages/cli/src/**' 'packages/compile/src/**' 'apps/editor/src/**' \
  ':!*.test.*' ':!**/__tests__/**' | grep -vE ':[0-9]+:\s*(\*|//|/\*)' | grep -vE ':[0-9]+:import |\} from '
```

That returns 29 lines at HEAD for `packages/cli/src` alone [V]. They split three ways [CV critic-1, wrongClaims §1]:

| Kind                                                              | Count | Sites                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| joins a path from a root → `sourceDir(root, provider)`            | 14    | install-base-dir.ts:23, config-writer.ts:32, pair-writer.ts:48, utils/fs.ts:91, config-types-io.ts:38/:56/:57/:110/:116, config-gate/index.ts:585, loader.ts:212, compiler.ts:91, eject.ts:167, uninstall.tsx:679 |
| relative, or text shown to the user → `relName` from the resolver | 7     | loader.ts:222, doctor.ts:92, eject.ts:251/:255, init.tsx:1073, uninstall.tsx:485/:487                                                                                                                             |
| literals that bypass the constant entirely                        | 5     | uninstall.tsx:252 (static class description), compile `contract/emission-scenarios.ts:69-70`, editor `output-preview.ts:836/:847`                                                                                 |

Two of the relative sites are evaluated at module or class load, before any provider exists: `doctor.ts:92` `CONFIG_TS_REL` [R] and `uninstall.tsx:252`. They become functions of the resolved directory, or neutral wording.

**Three things must cover every provider, not one:**

- `utils/fs.ts:91` `isGlobalPairPath` is the runtime tripwire on global config writes, and today it guards only `~/.claude-src/{config,config-types}.ts` [R via CV]. A guard that knows one provider lets a Codex global config write through with nothing failing. It takes a list.
- Uninstall's cleanup, which today calls `removeDirIfEmpty` on the leaf only (`uninstall.tsx:888` [R]).
- A doctor check for two provider folders in one root.

**The marketplace read gets its own door.** `loadProjectSourceConfig` serves two different questions today: "what does this installation's config say" (eject.ts:549/:597, config-merger.ts:275, config-gate/index.ts:553) and "what layout does this _source repo_ declare" (source-loader.ts:420, source-validator.ts:72 and :224, agent-fetcher.ts:46) [V, `git grep -n -E 'loadProjectSourceConfig|loadGlobalSourceConfig' HEAD -- 'packages/cli/src/**' ':!*.test.*'`]. Both currently go through `getProjectConfigPath` [R, configuration/config.ts:87]. That is three live readers plus one dead one — `agent-fetcher.ts:46` is never reached, since `getAgentDefinitions()` is only called with no argument [CV critic-1 §1]. Split out `loadSourceRepoConfig(basePath)`, which looks for `<base>/.agents-inc/config.ts` then `<base>/.claude-src/config.ts`, is neutral to provider, and has no sunset. Without the split, "keep reading `.claude-src` in sources forever" and "sunset `.claude-src` for installs" cannot both be expressed in one function (D5).

**Enforcement, in `packages/cli/eslint.config.js`.** The repo restricts no path literals today — a correction to the brief, confirmed: the only `no-restricted-syntax` selectors are the dynamic config-gate import at :67, the vacuous comparisons at :167-175, and the task-id shapes at :347-359 [V read]. Add:

```
Literal[value=/(^|[^\w.-])\.(claude-src|agents-inc)([^\w-]|$)/]
TemplateElement[value.raw=/(^|[^\w.-])\.(claude-src|agents-inc)([^\w-]|$)/]
```

- Every backslash is doubled in the JS string. **A literal `/` inside an esquery regex must be written `\u002F`** — esquery ends the regex at the first raw slash, and `eslint.config.js:67` spells it `"...config-gate\\u002F(?!index)..."` for exactly that reason [V, read with `cat -A`]. The selectors above need no slash at all, which is why they are written this way.
- `no-restricted-syntax` options do not merge across blocks; they must be spread into every block that sets the rule — TEST_FILES (:344), the product zone (:406) and the config-gate zone (:455) — the same way `VACUOUS_COMPARISONS` is restated [R, the docblock at :176-184].
- Exempt the layout module and `e2e/pages/constants.ts`.
- Add the same block to `packages/compile/eslint.config.js`, which sets no such rule today, and to the editor's config.
- Pair it with `no-restricted-imports` on `SOURCE_ROOT_DIR` outside the funnel. A bare `"claude"` string cannot be caught by a literal ban.
- A standalone Linter probe reported all 7 planted violation forms and stayed silent on all 9 allowed strings, including `github:agents-inc/skills`, `.claude-plugin/plugin.json` and `.claude/skills` [SV cli-surface §5].

**Sensors that go silent rather than red, and must move in this step:**

- `config-gate-enforcement.test.ts:121-122` `CONFIG_PAIR_REFERENCE` matches `\bgetProjectConfigPath\b` [V read]. Rename the helper and this scanner stops scanning without failing.
- `renderers-come-from-the-shared-package.test.ts:236` asserts _"consts.ts no longer declares CLAUDE_SRC_DIR"_ — an absence check that passes vacuously the moment the symbol is gone [CV critic-1 §4]. Re-point it at the new names.
- `packages/cli/scripts/check-mirrored-constants.ts:82` `MIRRORS` has 4 rows and no row for `DIRS.CLAUDE_SRC` [V read], which the e2e tree copies at `e2e/pages/constants.ts:22` and uses on 68 lines in 36 files [SV cli-surface]. Add a row, and bind it to `packages/compile/src/paths.ts`, not `consts.ts`, which only re-exports.

**Tests first:**

- a resolver spec covering all five preference cases plus: an empty leftover `.agents-inc/claude/`, a legacy folder holding only `agents/_templates`, and a `.agents-inc/` holding only gate state and no provider folder. All three passed on the migration lane's prototype [SV migration §5].
- a spec that runs ESLint through its API against a planted `.claude-src` literal and an allowed `github:agents-inc/skills` in the same file, failing before the config changes; plus an `ESCAPE_SHAPE` in `spec-gates.test.ts:275` run across `LINT_ZONES` (:368) [V read]. Note the e2e representative in LINT_ZONES, `four-surfaces.ts`, itself hard-codes the literal at :107 and must be fixed for the gate to go green.
- a tripwire spec: a write to `~/.agents-inc/codex/config.ts` is refused by `isGlobalPairPath`.
- a guard spec that fails on any `path.join(..., SOURCE_ROOT_DIR)` or `LEGACY_SOURCE_DIR` outside the funnel module.

**Verify:**

- the full suite, lint, `npx tsc --noEmit`, `npx tsc -p e2e/tsconfig.json --noEmit`;
- **the golden trees are byte-identical.** R1 changes nothing they record;
- the census grep above returns only the layout modules and the named exceptions;
- by hand, under a scratch HOME: hand-place `.agents-inc/claude/config.ts` in a project and confirm `doctor` and `compile` find it, while a project on `.claude-src/` behaves exactly as before.

**Docs (codex-keeper):** a `.ai-docs/reference` page for the source layout and its `DOCUMENTATION_MAP` row.

---

### Step R2 — Write the new name [the flip; ~140 test and e2e files, ~60 doc files]

cli-developer and cli-tester, with web-developer for the editor. This is the only `generate:*` lane while it runs.

New installs now write `.agents-inc/<provider>/`. Installs already on the old name keep being read **and written** where they are — nothing moves in this step.

**The flip itself** is one value: `SOURCE_ROOT_DIR` becomes what new installs use. In a scratch copy of HEAD, changing the single constant moved every production path; the only `.claude-src` left in `dist/*.js` was a comment, and exactly 2 of 7,518 unit tests failed — both about a marketplace repo's own source config, which R1's split already fixes [SV cli-surface §3].

**Re-record the golden trees on purpose.** The Codex plan's cross-cutting guarantee ":45 the Step 0 Claude golden trees stay byte-identical" cannot hold here. Predict the diff first, then compare:

- 20 renamed path keys, and 4 content rewrites — the project `config-types.ts` import specifier `'../../.claude-src/config-types'` becomes `'../../../.agents-inc/claude/config-types'`, computed at config-types-io.ts:55-61 [SV plan-delta §2, re-confirmed CV critic-2 with `path.relative`]. Per file: dual-scope 14 keys/3 imports, global-eject 2/0, project-plugin 4/1.
- Compare **parsed JSON**, not bytes; the dump format differs.
- The expected trees are already computed in scratch: `/tmp/claude-1000/-home-vince-dev-ai-benchmarking/b1b3d06f-9157-4392-a1d6-5b367c67e0ac/scratchpad/rename-map/plan-delta/goldens-expected/`.
- **Do not `-u` blind.** Every phase's `emptyDirectories` is `[]` today except project-plugin "after init" [CV critic-1]. With uninstall's leaf-only cleanup the after-uninstall phase would gain `project/.agents-inc`, and a blind re-record would lock the bug into the fixture [SV cli-surface §6].

**Uninstall removes the parent when it empties.** `removeDirIfEmpty` on the provider folder, then on `.agents-inc/` — and only when empty, so a repo whose gate state lives there keeps it (uninstall.tsx:888 [R]).

**Fix the output that names the folder.** `agent-summoner`'s playbook and `output.md` must render the folder from a Liquid variable, not a literal, so a compiled agent always names the folder its own install actually uses. Then run `generate:compile` — the playbook is embedded in `packages/compile/src/generated/corpus.ts` — and `generate:matrix`, for the vendored JSDoc at `packages/matrix/src/vendor/{config,agents}.ts`.

**Tests that now pass for the wrong reason.** Nothing flags these; they need hand edits:

- `edit.test.ts:1103-1105` asserts the old path does not exist, which is now trivially true;
- `doctor.test.ts:101` writes an invalid config at the old path, so the "syntax errors" case silently becomes the "not found" case [SV cli-surface §3];
- 8 e2e sites of `listFiles(dir)).not.toContain(DIRS.CLAUDE_SRC)` are always true, because `listFiles` is a readdir returning top-level names only (test-utils.ts:487-493) and the value is now two segments;
- 14 more `DIRS.CLAUDE_SRC … toBe(false)` sites pass even with an empty `.agents-inc/` left behind [SV cli-surface §6, counts re-run CV critic-2].

**The editor.** `apps/editor/src/features/configure/lib/output-preview.ts:18` imports the constant by name, so this must land in the same change or the editor stops compiling [SV app-surface §1]. Draw the new folder as **one compact row**, `.agents-inc/claude/`, at today's depth (D10): the 11 literal expectations in `e2e/specs/output-preview.spec.ts` stay string-only and the ARIA level/posinset table at :424-441 stays valid. While here, fix `install-dialog.tsx:256`, which has told users the installer writes `agents/config.ts` since 95d67f1a on 2026-08-04 (D11).

**Non-code that must land in the same commit:**

- root `.gitignore:94` and `.prettierignore:46`, plus `packages/cli/.prettierignore:46` — add `.agents-inc`. Without it the moved dogfood folder `packages/cli/.agents-inc/` shows up untracked and its config.ts becomes committable [V, `.gitignore:94` reads `.claude-src`].
- `project-config.schema.json:5` and `project-source-config.schema.json:5` (both still say `config.yaml`).
- `.ai-docs/reference` (25 files, 154 occurrences) and `.ai-docs/standards` (8 files, 24) [SV plan-delta]. Leave `agent-findings` (32 lines in 20 files) and `changelogs` alone — they are dated records; add a note, do not rewrite history.
- `.ai-docs/reference/utilities.md:578-584` says _"Fifteen of the names below are declared in `packages/compile/src/paths.ts`"_ and lists `CLAUDE_SRC_DIR` by name, with the table row at :605. The count is load-bearing and ungated: `check-enumeration-drift.ts:505-534` binds only the DIRS, STANDARD_FILES and STANDARD_DIRS rows, and `check-symbol-citations` resolves only `@link` in TypeScript [CV critic-1 §5]. Update the prose and the row, and extend `check-enumeration-drift` to bind the Paths table too, so the next split cannot go stale silently.
- apps/www: 62 lines on 25 pages [V, `git grep -h -- 'claude-src' HEAD -- apps/www | wc -l`]. R0 already handled the CI-grep strings.

**Tests first:**

- the golden-tree comparison against the predicted trees above, before any `-u` run;
- an uninstall spec: after removing the last provider folder, `.agents-inc/` is gone; with an unrelated file inside it, `.agents-inc/` stays and uninstall says so;
- **a compiled-output spec neither map proposed and that nothing else covers**: compile `agent-summoner` and assert its source-folder string equals the resolved folder. `grep -c agent-summoner packages/cli/e2e/fixtures/claude-golden-trees/*.json` is 0 in all three journeys [CV critic-2 §7], so the programme's only automatic check on installed output is blind to the one agent whose text changes;
- the 22 remaining e2e literals and 49 unit literals re-pointed by hand, each with the vacuous-assertion fixes above.

**Verify:**

- `generate:compile:check`, `generate:matrix:check`, `generate:schemas:check`;
- the full suite, `test:e2e`, `test:smoke`, the compile vitest, the editor vitest and Playwright;
- the golden diff equals the prediction and nothing else;
- by hand in a scratch HOME: a fresh `init` writes `.agents-inc/claude/`, and a copy of an existing `.claude-src/` project still compiles, edits and uninstalls from where it is.

**Docs (codex-keeper):** the sweep above, plus a changelog entry naming the new layout and saying that existing installs are untouched until `migrate`.

---

### Step R3 — `migrate`, the forwarding stub, doctor's Layout rows and the git probe

cli-developer and cli-tester. Runs after R2, in the same release.

Nothing in R2 moves a folder. This step is how a folder moves, and it is explicit.

**Why explicit, and not automatic or read-old-write-new.** Both alternatives were tested and both produce a split folder:

- automatic-on-first-load fires from read-only commands and from the oclif init hook, which runs for every command (hooks/init.ts:5-13) [R via SV]; it moves files in a working tree nobody asked to change; and `fs.rename` of the global pair skips the `writeFile` tripwire entirely (utils/fs.ts:98-106) [R];
- read-old-write-new splits the directory on the first write: the config pair lands in the new folder while `agents/` and `_templates/` stay in the old one. The new folder then wins the preference order, so custom project agents (loader.ts:212) and ejected templates (compiler.ts:88-93) silently drop out of compile [SV migration §3].

**`migrate [--yes] [--dry-run] [--adopt]`.**

- Covers the scopes in play — the cwd project and the global — and **checks all of them first**. If any would be refused, nothing moves.
- Per scope, one `rename(2)` of the whole directory. Never a copy. `EXDEV` means refuse.
- It never runs a git write. It never edits `.gitignore`.
- After a successful move, in this order:
  1. write the forwarding stub (below);
  2. rewrite the pre-March runtime import form — configs written before 2ee5a325 (2026-03-25, about 0.96) used `import globalConfig from "<abs>/.claude-src/config"`, a **runtime** import, and after the global moves doctor reports "Cannot find module" [SV migration §2];
  3. regenerate this scope's `config-types.ts`;
  4. when the global moved, regenerate registered projects' `config-types.ts` through a config-gate entry — their relative import gains a level;
  5. list registered projects still on the old name, **saying plainly that this list is the registry and not an inventory of the machine**;
  6. tell the user to commit the deletion and the addition together.

**The forwarding stub (D2).** `migrate` leaves `.claude-src/config.ts` containing a marker comment and a single `throw new Error("…moved to .agents-inc/claude/ — update the CLI; do NOT run uninstall")`. This is the only leverage we have over binaries already installed, and it was tested against the real 0.164.0 [CV critic-2, migrationVerdict]. Without the stub, an old CLI standing in a migrated project **does not report "not installed"** — it silently adopts the global installation through the HOME fallback (installation.ts:121-130, project-config.ts:156-167 [R]):

| Old CLI, migrated project                            | Without a stub [CV]                                                                                                                                     | With the stub [CV]                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `doctor`                                             | exit 1, validates the **global** config while standing in the project, calls the project's own agent an orphan                                          | prints our sentence as a load error |
| `compile`                                            | exit 0, "Global compile complete": rewrites `~/.claude/agents/*.md` and fans out to every registered project; the project it was run in is not compiled | exit 1                              |
| `init --from`                                        | exit 0, builds a rival `.claude-src/` install beside the migrated one                                                                                   | exit 1, writes nothing              |
| `compile` in an un-migrated project, global migrated | exit 0 and **rewrites the project's committed `config-types.ts`** into the standalone form                                                              | exit 1, zero files changed          |

The stub carries a marker so the resolver reads it as "moved", not as the rival half of a `both` state. An old CLI's `uninstall` deletes the stub and the installed output but leaves `.agents-inc/claude/` intact [CV], which is why the stub's own text must warn against the tip that old doctor prints.

**Edge cases, all run against the migration lane's prototype** [SV migration §5, cases re-run CV critic-2]:

| Case                                               | Behaviour                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| plain project, `agents/` and `_templates/` present | migrated, whole directory                                                                        |
| re-run                                             | "already migrated"                                                                               |
| gate state already in `.agents-inc/`               | migrated alongside it                                                                            |
| both folders already exist                         | **refused, nothing moved**, naming both and which one is read                                    |
| relative symlink inside the folder                 | re-pointed (`../shared/real` → `../../shared/real`). A plain rename breaks it: ENOENT afterwards |
| read-only project directory                        | EACCES, nothing moved, the old folder is still read and written                                  |
| read-only `.claude-src/`, parent writable          | also EACCES — Linux needs write permission on the directory itself to move it to another parent  |
| the directory is a **marketplace source repo**     | **refused** (D5). `isSourceRepo` (source-validator.ts:68-72 [V read]) already answers this       |
| destination hidden from git                        | refused, see below                                                                               |

Every filesystem step, `mkdir` included, sits inside the rollback. The migration lane's first prototype crashed on the read-only case because `mkdir` sat outside it.

**The `.gitignore` collision.** This is not hypothetical; it hits the owner's own machine. `ai-benchmarking` commits `agents-inc/.claude-src/{config.ts,config-types.ts}` [V, `git ls-files | grep claude-src`] and its `.gitignore:84` is an unanchored `.agents-inc/` [V read]. After a move, `git status --porcelain` shows only the deletions and `git add -A` stages only deletions [SV migration §4].

The detection rule, using two read-only git commands that leave the index untouched:

1. `git -C <dir> ls-files -- .claude-src` — **any** tracked path under the folder, not `config.ts` alone. Keying on config.ts was proved to lose data: a repo that tracks `.claude-src/agents/dev/my-agent/identity.md` while ignoring `config.ts` passes the check, and after the move git records only the deletion [CV critic-1 §4].
2. For each such path, `git -C <dir> check-ignore -v -- <its new path>`. Use the **default** mode, not `--no-index`: it exits 1 for a file already tracked under an ignoring rule, which is exactly "git would hide this" [SV migration §4, semantics re-confirmed CV critic-2].
3. Exit 128 (not a repo) or ENOENT (no git) means "cannot tell" — skip, do not refuse.

The predicate is **"the destination is ignored and the source was not"**, not "the old config is tracked". Two more blind spots were proved with the narrower rule: an untracked-but-visible config disappears from `git status` entirely after the move, and a deliberately ignored config becomes one `git add -A` from being committed — neither warned [CV critic-2 §5]. So also print a notice for the reverse direction.

What refusal says:

> `.agents-inc/claude/config.ts` would be hidden from git by `.gitignore:84` (`.agents-inc/`); your next commit would delete `.claude-src/` and add nothing. Replace that line with `.agents-inc/*` plus `!.agents-inc/claude/` and `!.agents-inc/codex/`, or ignore only the paths you meant (for example `.agents-inc/attempts/`), then run migrate again.

Patterns tested with `git check-ignore -q --no-index` against five paths [SV migration §4]:

| Pattern                                                         | Result                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `.agents-inc/`                                                  | all five hidden                                                                |
| `.agents-inc/` + `!.agents-inc/claude/` + `!.agents-inc/codex/` | all five **still hidden** — git cannot re-include inside an excluded directory |
| `.agents-inc/*` + the two negations                             | configs visible, gate state hidden                                             |
| the three gate-state paths listed explicitly                    | configs visible, gate state hidden                                             |

**The `both` state refuses writes, not just warns.** The product creates this state itself, in both directions: post-rename summoner text on an un-migrated install authors into `.agents-inc/claude/agents/` where the resolver cannot see it; stale summoner text after a migration authors into `.claude-src/agents/`. Both end in a refused migrate [CV critic-2 §4]. R2 fixes the cause; `--adopt` merges a _content-only_ rival folder (no config.ts) for installs whose agents already landed in the wrong place. Write commands in a `both` state refuse and name both folders — the preference order's winner can be the stale one, so proceeding on it is wrong.

**Doctor gets a `Layout` row per scope:**

- warn on the old name (fail after the sunset, D4);
- fail when both folders exist, naming both and which one is read;
- fail on the git-hidden destination;
- fail on a compiled agent whose text names a folder this install does not use;
- at HOME only, list registered projects still on the old name, **labelled as the registry**.

With the resolver in place, doctor's "8 skills and 3 agents installed here and no configuration declares them", followed by a tip to run `uninstall`, can no longer fire on an old-name install. That output was reproduced against a config the CLI could not see [SV migration §2].

**The nudge:** one stderr line from write commands (init, edit, compile, eject, update) when a scope in play is still on the old name.

**A registry hazard that must be paired with a test.** `registerProjectPath` removes every registered project whose config is not at `getProjectConfigPath(p)` and writes the list back (propagate.ts:247-254 [V read]); propagation then skips such projects (:756-758). With R1's resolver a legacy project is found and kept — so the "migrating one folder at a time wipes the registry" framing is **false for the new CLI** [CV critic-1, wrongClaims §1]. The pruning is real and comes from **older** CLIs, which keep running afterwards and which a batch migration cannot prevent [CV critic-2 §2, reproduced]. Pair the test: a Claude global never prunes a Codex project, and a legacy project is never pruned by a migrated global.

**Two path holders survive an await.** `config-gate/index.ts:283` `ensureDir(path.dirname(projectConfigPath))` can recreate an empty legacy directory, and `uninstall.tsx:679` captures the directory before the confirmation prompt [R via CV]. Add a rule: re-resolve immediately before any destructive step.

**Tests first:**

- every edge case in the table above, each refusal paired with an allowed case in the same file;
- the git probe: tracked-agent-only repo, untracked-but-visible config, deliberately ignored config, and the ai-benchmarking shape (`.gitignore:84`);
- the forwarding stub, exercised by spawning the **published previous version** from the e2e lane, asserting exit 1 and zero file changes on `compile`, `init --from` and `doctor`;
- a migration round trip seeded from the committed pre-rename goldens as the before-state, compared with the post-rename trees;
- the index is untouched: index mtime unchanged and no `index.lock` after a probe. Never call `git status` for this — it can write the index.

**Verify:**

- the full suite and the golden trees;
- by hand under a scratch HOME, on a copy of `/home/vince/dev/cv-launch`: migrate, compile, edit, uninstall;
- by hand: `migrate` in a copy of `ai-benchmarking/agents-inc` **refuses** with the `.gitignore:84` message. That refusal is the correct outcome until D12 lands.

**Docs (codex-keeper):** an `.ai-docs` page for the migration and the resolver with its `DOCUMENTATION_MAP` row; apps/www `configuration/scopes-and-paths.md`, `reference/commands.md` and the troubleshooting pages; a changelog entry.

---

## What changes in the Codex target plan

### `todo/plans/CLI-codex-target-plan.md`

| Where                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope :28              | **Delete** "only one host per HOME can own the global installation". `~/.agents-inc/claude/` and `~/.agents-inc/codex/` sit side by side and their outputs are disjoint.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Cross-cutting :45      | Amend: "the Step 0 Claude golden trees stay byte-identical **from Step 1 onward; R2 re-records them against a predicted diff of 20 keys and 4 import specifiers**".                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Wave table :49-57      | Replace with the table in this plan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Step 1 :103-113        | `installLayout(projectDir, scope, provider)`. R1 has already created this module with `sourceRoot` and `sourceDir`; Step 1 **extends** it with the host roles rather than creating it.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Step 1 :118            | Extend the census grep with `SOURCE_ROOT_DIR \| LEGACY_SOURCE_DIR`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Step 1 :146            | **Delete** "`.claude-src` stay[s] outside the layout, because [it does] not depend on the host". The ruling makes it false. `.claude/templates` (compiler.ts:100) still stays outside.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Step 1 :151            | **Delete both `STANDARD_DIRS.AGENTS` exemptions.** `compiler.ts:92` and `loader.ts:212` are exactly the two `.claude-src/agents` sites, and they stop touching `STANDARD_DIRS` once they go through R1's funnel. Running R first removes the exemptions instead of inheriting them.                                                                                                                                                                                                                                                                                                                            |
| Step 1 :148-153        | Note that R1 already added the source-literal ban and the `SOURCE_ROOT_DIR` import restriction; Step 1 adds only its own host literals to the same options objects.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Step 2 :171-213        | **Mostly deleted.** Gone: `ProjectConfig.target`, the loader schema and `projectSourceConfigFields` additions, `generate:matrix`, `CANONICAL_FIELD_ORDER`/`cleanForEmission`, `config-types-source.ts:102-137`, the Codex emission scenario, `mergeGlobalConfigs`' fill-only carry, `setConfigMetadata`, `installationTarget(config)`, and the tests "refuses cursor", "writer fixed point" and "merge fills target". Step 2 is no longer a `generate:*` lane.                                                                                                                                                 |
| Step 2, kept           | `PROVIDERS`/`Provider` (now in `packages/compile/src/source-layout.ts`, added by R1). The provider reaches the installer as a **location parameter beside `projectDir`**, not as `WizardResultV2.target`. "Do NOT touch config-to-seed or seed.ts" stays. The test "config-to-seed Codex == Claude" becomes "sharing from either folder gives identical payload bytes".                                                                                                                                                                                                                                        |
| Step 2 :175, :201      | `installationTarget(config)` is circular once the folder decides the provider — it reads a config that lives inside the provider folder. It becomes `providerAt(root)`, delivered by R1.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Step 2, new            | Discovery: `detectInstallations(cwd)` returning `{provider, scope, configPath}` with today's project-then-global fallback applied within each provider; `LoadedProjectConfig.provider`; the provider threaded into `getProjectConfigPath`, `loadProjectConfig*`, `globalPairPaths`, `ensureBlankPair`, `mutateGlobal`, `registerProjectPath`, `propagateGlobalChangesToProjects`, `resolveEffectiveGlobalConfig`, `writeProjectPartial` and config-types-io. This is the step that replaces R1's single hard-coded `"claude"`. Also: `config-merger.ts:238` must compare against the **same provider's** path. |
| Step 2, new            | Until Step 4, discovery must **refuse a present `.agents-inc/codex/` by name**. Otherwise a hand-planted folder compiles Claude-format agents — a half-routed path with every test green (Risk 3).                                                                                                                                                                                                                                                                                                                                                                                                             |
| Step 3                 | Unchanged in substance; it now runs after Step 2, which touches its command files.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Step 4b :295           | **Replace the refusal.** `init --target codex` over a Claude installation creates a second installation beside it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Step 4d :309-314       | **Delete.** Step 2's per-provider gate and registry deliver it. Lane B loses propagate.ts and the wizard scope lock.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Step 4 test 1 :332-335 | Becomes: `~/.agents-inc/codex/config.ts` and `<project>/.agents-inc/codex/config.ts` exist, and `~/.agents-inc/claude/` plus `~/.claude/` are byte-identical by `readTreeSnapshot`, including when a Claude global already exists.                                                                                                                                                                                                                                                                                                                                                                             |
| Step 4 test 7 :341     | Becomes: a second installation is created beside the first with the Claude tree byte-identical; with two installations present, no-TTY `edit` and `uninstall` refuse and name `--target`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Step 4 test 8 :342     | "`.claude-src` is allowed" becomes "**`.agents-inc/claude/` is never created**, and `.agents-inc/codex/` is expected".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Step 5 :352-386        | `createLiquidEngine` reads local templates from `<sourceDir(provider)>/agents/_templates` (compiler.ts:85-100); `loadProjectAgents` reads the provider's folder (loader.ts:209-224); `eject` on Codex writes only the body template, since a Claude-shaped `agent.liquid` must never reach the TOML renderer.                                                                                                                                                                                                                                                                                                  |
| Step 7                 | The wizard toggle picks the folder the run writes, at **both** scopes. The dashboard names the provider when two installations are present. The editor preview's source root follows the toggle at `output-preview.ts:836-847`, staying **one row** (D10), so `output-preview.spec.ts` changes stay string-only. `use-install-command.ts:150-165` keeps `--target codex`.                                                                                                                                                                                                                                      |
| D1 :514-523            | Superseded. The folder is the rule; the four cross-target restrictions and the "named limit" go.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D2 :527                | The same-day revision ("a run that differs from the existing global is project-only") is **dropped**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D8 :567-573            | Resolve the open ruling with evidence: under Codex 0.155.1's `:workspace` profile, `.agents-inc/` and `.agents-inc/codex/agents/` are **writable**, while `.agents/skills` and `.codex/agents` are read-only [SV plan-delta, `codex sandbox -P :workspace`; applying it to `codex exec` with workspace-write is [A]]. So the staging folder can be `.agents-inc/codex/` itself — agent-summoner already authors there. Add the `sourceDir` Liquid variable R2 introduces.                                                                                                                                      |
| D11 :582-585           | Add **(c) the rename**: the config moves; the project config-types import gains a level; four CLI messages change; agent-summoner's compiled text changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Risks                  | Delete 4 (`target` dropped by the merge). Rewrite 5 — an older CLI does not read a Codex config as Claude; it adopts the global installation, and the forwarding stub is what stops it.                                                                                                                                                                                                                                                                                                                                                                                                                        |

---

## Owner decisions

Each has a recommendation.

**D1. Existing `.claude-src/` folders: move them, read them where they are, or refuse?**

- **Recommendation:** read **and write** them in place, permanently, and move them only through an explicit `npx agents-inc migrate`, one scope at a time, never inside another repo's working tree.
- **Why this overrules the other two streams:** cli-surface Q1 ("a one-time move of every folder the CLI can reach — the global plus every registered project") and plan-delta ("migrate the global and every registered project in one pass") both carry no git check, and on this machine the single registered project is `/home/vince/dev/ai-benchmarking/agents-inc`, whose destination is hidden by `.gitignore:84` [V]. Their first action on the owner's own machine would silently untrack the owner's committed config. They also cite a hazard the design already fixes: with R1's resolver a legacy project is found, so `registerProjectPath` does not prune it. The pruning comes from **old** binaries, which a batch move cannot prevent.
- **Alternative:** automatic on first load. Rejected — see R3.

**D2. Does `migrate` leave a forwarding stub at the old path?**

- **Recommendation:** yes. It is the only thing that turns an old CLI's silent damage (a rewritten committed `config-types.ts`, a rival install, a global compile that skips the project it was run in) into our own sentence. Verified against the real 0.164.0 binary [CV].
- **Cost:** a file that only throws; an old CLI's `uninstall` deletes it (the source survives); the resolver needs a marker so the stub is not read as a rival config.
- **Alternative:** leave nothing. Cheaper, and every row of the table in R3 stays in the left column.

**D3. Ship the reader one release before the writer?**

- **Recommendation:** yes. R1 changes no behaviour and no golden, so the cost is one release boundary; the gain is that anyone who upgrades in the window reads a migrated repo transparently instead of hitting the stub.
- **Alternative:** ship them together. Then no released version can ever read a migrated folder, and every mixed-version team meets the stub.

**D4. How long does the old name keep working?**

- **Recommendation:** full read and write in place for at least 90 days **and** until 1.0, whichever is later. After that, write commands refuse on `.claude-src/` with "run `npx agents-inc migrate`", while doctor, list, uninstall and migrate keep working. **Detection and `migrate` stay permanently** — one stat per scope. Dropping detection makes an old install look uninstalled, and R3's table shows what that does.
- Count days, not releases: the CLI shipped 14 releases in one month (`grep -cE '^## \[[0-9.]+\] - 2026-0(8-(0[7-9]|[12][0-9]|3[01])|9-0[1-6])' packages/cli/CHANGELOG.md`) [SV migration].

**D5. Where does a marketplace's own config live?**

- **Recommendation:** `<source>/.agents-inc/config.ts` for new sources — **provider-neutral, no `<provider>` segment** — with `<source>/.claude-src/config.ts` read as a fallback **indefinitely**, through its own entry point (`loadSourceRepoConfig`, R1). `migrate` refuses in a source repo.
- **Why:** the file declares `skillsDir` and `stacksFile`, which describe the repo's layout and have nothing to do with a provider; a marketplace serving both providers would otherwise declare its layout twice. The public docs told authors to commit that file (`configuration/scopes-and-paths.md:91, :109`), the CLI can never move a folder in a repo it only reads, and moving it in an author's repo breaks every consumer still on an older CLI **silently** — measured with 0.164.0: "No skills found" [SV app-surface §7]. The cost is one extra file check per source load. It is three live readers plus one dead one, and `doctor.ts:962-963` distinguishes "an installation" from "a marketplace" by the same file today, so both predicates change together [CV critic-1 §1; V read].

**D6. A project and the global on different providers — which global does the project inherit from?**

- **Recommendation:** only the global of the **same** provider (`~/.agents-inc/<same>/`). Otherwise the project stands alone. This decides the signature of the four global-config helpers (pair-writer.ts:48, config-writer.ts:32, config-types-io.ts:38/:57) and of the relative import written into each project's `config-types.ts`.

**D7. Does uninstall remove `.agents-inc/` once its last provider folder is gone?**

- **Recommendation:** yes, and only when it is empty. That matches today's removal of `.claude-src/`, and the golden trees record no empty directories after uninstall.

**D8. Two providers' installations in one scope — how do commands behave?**

- **Recommendation:** `compile`, `update`, `doctor` and `list` act on all of them, with a provider heading shown only when there is more than one; Claude-only output stays byte-identical. `edit`, `uninstall`, `share`, `eject` and `edit --from` act on exactly one: they prompt in a TTY and, without one, exit INVALID_ARGS naming `--target`. `init --target codex` over a Claude installation creates a second installation beside it.

**D9. Vocabulary: "provider" instead of "target"?**

- **Recommendation:** yes, now, while the flag is hidden and nothing has shipped — `Provider`, `--provider`, `step-provider.tsx` — so the word matches `.agents-inc/<provider>/` and your own wording. Keep `--target` as a hidden alias. The cost is plan text and a few file names.

**D10. How does the editor preview draw the new folder?**

- **Recommendation:** one compact row, `.agents-inc/claude/`, at today's depth. The e2e changes stay string-only and the ARIA level/posinset table at `output-preview.spec.ts:424-441` stays valid. Nesting pushes every config row down a level and makes all four Argos captures change more. It also survives the provider toggle unchanged — the row simply reads `.agents-inc/codex/`.
- **Note:** four hosted Argos captures change on their own either way (`dialog-output-preview`, its fullscreen version, and the dark version of each). Nothing in the repo records the change; someone accepts them in the hosted tool. No visual baselines are committed [SV app-surface §3].

**D11. Fix the install dialog's wrong `agents/config.ts` in the same change?**

- **Recommendation:** yes. `install-dialog.tsx:256` has been wrong since 2026-08-04, and the docs page `install-and-share.md:27` already says what it should say. It also changes the `dialog-install` captures, light and dark.

**D12. ai-benchmarking — a prerequisite with a deadline, not a separate note.**

- **What is wrong:** the hand gate writes `<repo>/.agents-inc/` (gate.mjs:210-213), `.gitignore:84` hides it, `docs/install.md:63-67` tells every consumer repo to add the same line, and `rm -rf .agents-inc` is written down **three times** as the disarm path — `agents-inc/vendor/lint/gate.mjs:412`, `docs/lint-gate.md:775`, `docs/open-issues.md:58` (T28) [V, `grep -rn "rm -rf[^|;]*\.agents-inc"`]. After a migration in such a repo, that command and `git clean -xdf` delete the product's config pair, its custom agents and its ejected templates.
- **Recommendation:** move the hand gate's state to the OS temp dir, **keyed on the git toplevel** — and narrow `.gitignore:84` and `docs/install.md:63-67` to the three state paths anyway, because existing checkouts keep their state. Then fix the disarm guidance in all three places.
- **Why the temp dir and not migration Q2's "keep it in `.agents-inc/`, narrow the ignore":** narrowing removes the git hazard but leaves an agent-reachable destructive command aimed at the folder that now holds the product's source. Moving removes both. The reason state moved into the work tree on 2026-09-14 — one shared toolchain directory meant repo B was judged against repo A's debt (`docs/arms.md:46-54` [V read]) — is preserved by keying on the git toplevel, and the cost has already dropped: T28 records the baseline as optional since 2026-09-19.
- **Deadline:** before the first `migrate` on this machine, not before R2. Until then `migrate` in `ai-benchmarking/agents-inc` correctly refuses, which is the safe failure — but `rm -rf` and `git clean -xdf` are not protected by any refusal.
- **Recorded as a non-issue so nobody re-measures it:** the candidate fingerprint does not cover the source folder (`scripts/snapshot_candidate.py:41-75` hashes `agents-inc/.claude/{agents,skills,settings.json}`, `agent-memory/CLAUDE.md` and `vendor/lint/*`), so the rename cannot change a fingerprint or break run comparability [CV critic-1 §10].

**D13. Commit Wave 1 before R2 re-records the goldens?**

- **Recommendation:** yes. Git is your call, and the goldens are untracked today [V]. Without a commit, the re-record overwrites untracked files and "the diff is exactly the rename" has no baseline. The fallback is the scratch transform (`expected-goldens.py`), which is a weaker proof because nobody reviews it in a diff.

---

## Risks

**Risks that break someone's install without anyone noticing**

1. **An old CLI in a migrated project adopts the global installation.** It does not say "not installed". `doctor` validates the global config while standing in the project and calls the project's own agent an orphan; `compile` exits 0, announces a global compile, rewrites `~/.claude/agents/` and fans out to every registered project [CV critic-2 §1, run against 0.164.0]. Mitigation: the forwarding stub (D2). Residual: a CLI older than R1 that meets a folder migrated before the stub existed — impossible, since the stub ships with `migrate`.
2. **Old CLIs keep pruning the registry.** `registerProjectPath` deletes any registered project whose config it cannot find, and propagation then skips it, both silently (propagate.ts:247-254, :756-758 [V read]). Reproduced: a migrated project vanished from `projects[]` after an unrelated `init --from` [CV critic-2 §2]. The new CLI does not do this; we cannot stop the old one. Mitigation: the stub makes the write command exit 1 before it reaches the registry.
3. **The registry is not an inventory.** It holds 1 entry against 6 on-disk installs on this machine, and two unregistered installs import the global types by relative path [CV critic-2 §6]. Any "migrate/list every registered project" promise under-reports by that factor. Mitigation: doctor labels the list as the registry; the nudge, not the registry, is what reaches the rest.
4. **Compiled agents name the old folder.** Until a project recompiles, its installed `agent-summoner` writes into `.claude-src/agents/`, which the resolver will not compile once a new folder wins [CV critic-2 §4, both directions]. Mitigation: R2 renders the folder from a Liquid variable, `migrate` recompiles, doctor gets a row, and `--adopt` merges a content-only rival folder.
5. **Half-routed paths.** 14 join sites, 7 message sites, and a pair that is already split — `loader.ts:212` resolved but `:222` a constant. Any one left on a single name brings back one of the failures above with every test green. Mitigation: the funnel, the lint ban, the census grep, and the guard test against any join outside the funnel.
6. **Sensors that go silent instead of red**: `config-gate-enforcement.test.ts:121` (a regex on the helper's name), `renderers-come-from-the-shared-package.test.ts:236` (an absence check), the unregistered `DIRS.CLAUDE_SRC` mirror, and `.ai-docs/reference/utilities.md:578` (an ungated count). All four are in R1 and R2's file lists.
7. **CI greps in the public docs.** `.claude-src/config.ts not found` is a documented match target. R0 ships the fix a release early.

**Risks of destroying user data** 8. **A migrated config drops out of git.** Proved on the owner's own machine, and in any repo set up by `ai-benchmarking/docs/install.md:63-67`. Mitigation: the probe and the refusal in R3, keyed on the whole tracked set and on visibility change, not on `config.ts` alone. 9. **`rm -rf .agents-inc` and `git clean -xdf`** are documented gate resets that, after a migration, delete an installation's source. D12. 10. **Moving a marketplace author's config** breaks every consumer on an older CLI, silently, and the author sees nothing. Mitigation: `migrate` refuses in a source repo (D5). 11. **Read-only paths, held handles and symlinks.** EACCES on either the project directory or the source folder itself; EPERM/EBUSY on Windows when an editor holds a handle [A]; a relative symlink inside the folder breaks on a plain rename. All land on "nothing moved, the old folder is still read and written", and the nudge repeats. 12. **Concurrent CLI processes.** `rename` is atomic, but the loser must treat ENOENT as "re-resolve", not as a failure [A, not tested]. Two call sites hold a resolved path across an await and need re-resolving before the destructive step.

**Risks from how far the evidence goes** 13. **The flip experiment is no longer inspectable.** The surface lane's scratch tree has been reverted, so "2 of 7,518 unit tests failed" cannot be re-checked without another build, which is forbidden while another lane builds [CV critic-1]. Taken on their [V]. 14. **Everything about "an old CLI meeting a new layout" was reproduced with today's binary against a hidden config,** which is treated as equivalent to a future binary against an unmigrated one. The equivalence is reasoned, not tested with new code — except the stub table, which was run against the real 0.164.0. 15. **`git check-ignore` cannot see a bare dotfiles repo** (`--git-dir=~/.dotfiles --work-tree=~`), so a tracked `~/.claude-src` there moves without a warning [A]. 16. **`doctor-report-shape.e2e.test.ts:50` pins a byte-exact doctor line** [A, not run]. The longer path may change its wrapping.

**Coordination risks** 17. **R2 is the largest serial window in the programme** — about 140 test and e2e files and 60 doc files, two `generate:*` lanes and a golden re-record. R1 is what keeps it from blocking everything; R2 still blocks every other lane while it runs. 18. **Shared files.** R2 shares `uninstall.tsx`, `init.tsx`, `doctor.ts`, `eject.ts`, `config-gate/*`, `output-preview.ts` and `emission-scenarios.ts` with Codex Steps 1, 4 and 5. 19. **`.agents/` and `.agents-inc/` sit side by side in project roots** and look alike.

---

## Corrections to the brief

- **"Installed OUTPUT does not move. Only the SOURCE folder is renamed."** True of paths, false of bytes and of consequences. `agent.liquid:34` inlines `{{ playbook }}` and `agent-summoner`'s playbook names `.claude-src/` six times, so installed agents carry an instruction about where to author files. Post-rename that instruction aims at the wrong folder on un-migrated installs, and stale copies aim at the wrong folder after a migration; both end in a refused `both` state. The brief's "four places the constant cannot reach" is five — the fifth is the output already on users' disks.
- **"19 production lines build a path, and every one of them goes through `CLAUDE_SRC_DIR`."** The site list was right; the headline number conflates path-builders with message text. It is 14 joins plus 7 message strings in `packages/cli/src`, plus 2 compile literals, 1 CLI literal and 2 editor lines. The grep in R1 returns 29 lines at HEAD [V].
- **Critic-1's correction about the esquery selector is itself wrong, and I checked the file rather than its rendering.** `eslint.config.js:67` reads `"ImportExpression > Literal[value=/config-gate\\u002F(?!index)/]"` — the slash is escaped as `\u002F`, exactly because esquery ends a regex at the first raw slash [V, `cat -A`]. The brief rendered `\u002F` as `/`, which is what the critic read. The underlying point stands: the repo restricts no path literals today.
- **"Migrating one folder at a time would wipe the registry"** (cli-surface Risk 2) is false for the CLI this plan builds — the resolver finds a legacy project, so it is not pruned. It is true of every pre-rename CLI, which a batch migration cannot prevent. The remedy it was offered for (batch-move every registered project) is therefore withdrawn, not rescheduled: it contradicts the migration lane's own Q3, and the registry reaches 1 of 6 installs here.
- **The git-hazard predicate as specified loses tracked files.** Keying on `.claude-src/config.ts` being tracked passes a repo that tracks custom agents but not config.ts, and the move then records only a deletion. Two further blind spots: an untracked-but-visible config disappears from `git status` silently, and a deliberately ignored one becomes committable silently.
- **"Only the global moved — the stale import is type-only, so nothing breaks"** is true of loading and misleading as a risk statement: an old-CLI `compile` in the un-migrated project exits 0 and **rewrites** that project's committed `config-types.ts` into the standalone form.
- **`.ai-docs` is one tree, not several:** `packages/cli/.ai-docs`.
- **No visual baselines are committed.** The editor's live in Argos and `packages/ui`'s in Chromatic, so the answer is capture names, not files.
- **The marketplace read is not one site.** It is three live readers plus one dead one, and the read itself happens in `configuration/config.ts:82-99` through `install-base-dir.ts:22`; `source-loader.ts:420` only calls it.
- **The brief's run recipe fails as written.** `fnm exec --using=23` cannot find its Node once HOME is pinned at process start, in all four lanes that tried it. What works is `fnm exec --using=23 env HOME=<scratch> node …`, or calling the interpreter directly at `/home/vince/.local/share/fnm/node-versions/v23.10.0/installation/bin/node`.
- **This pass:** I ran no build and no test. Everything labelled [V] is read-only `git grep`, `git ls-files`, `git status` and file reads in `/home/vince/dev/cli` and `/home/vince/dev/ai-benchmarking`; nothing was changed in either repo and no git write command was run. HEAD in the CLI repo is still `97991eca`, with the same 30 working-tree entries, all belonging to other lanes.
