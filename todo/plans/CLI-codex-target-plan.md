> **SUPERSEDED 2026-09-20 by [`CLI-codex-provider-plan.md`](./CLI-codex-provider-plan.md).** Kept as the
> record of what was planned and why, because three of its premises were measured wrong: project skills
> on Codex are a committed file BY DESIGN rather than a fallback; Codex DOES have per-agent role
> definition files with a strict schema (`$CODEX_HOME/agents/<n>.toml`, `<repo>/.codex/agents/<n>.toml`);
> and Codex reads our existing `.claude-plugin/` manifests unchanged, so no Codex-specific manifest is
> needed. Its `target` field is gone too — the folder `.agents-inc/<provider>/` is the answer.

# Codex target — plan

## Scope

**What this delivers.** The user picks Claude Code or Codex when installing, through `init --target codex`, a first step in the wizard for a new install, or a Claude | Codex control in the web app. The choice then applies to init, compile, edit, update, uninstall and doctor.

On Codex:

- **Skills** come from the same agents-inc marketplace, installed for the whole user with `codex plugin add`. The content does not change.
- **Project-scoped skills** become local copies in `.agents/skills`, because Codex cannot install a plugin for one project only.
- **The 18 sub-agents** compile to Codex agent TOML files in `.codex/agents` (project) and `$CODEX_HOME/agents` (global).

**What Claude users will notice.** Two things, both named:

- a new install through the wizard needs one extra Enter;
- uninstall only counts plugins it actually removed.

Everything Claude users already have stays byte-identical, and this is tested against snapshots of today's install output.

**What it cannot deliver on Codex 0.155.1** (the latest on npm, published 2026-09-19), because Codex has no way to do it:

- plugins scoped to one project;
- per-agent tool limits other than "no shell". The 5 read-only agents can still edit files;
- per-agent model, sandbox, approval mode, permissionMode, isolation or hooks. Codex either ignores these or drops the whole agent;
- skills preloaded into an agent;
- project agents in an untrusted project, or when Codex starts in a subfolder of a project with no git repo;
- a reliable exit code from `codex plugin remove`.

**Limits that come from our own design:**

- only one host per HOME can own the global installation;
- the agents only do anything when Codex's orchestrator starts an agents-inc agent by name (`agent_type`). No run against a real model has checked that it does.

## Steps

**Labels:** [V] = I checked it in this pass (the Codex binary ran with HOME and CODEX_HOME pinned to `scratchpad/codexmap/plan-writer/`). [CV] = the critics checked it and I did not re-run it. [R] = I read the code but did not run it. [A] = assumed.

**Rules for every step** (from /home/vince/dev/cli/CLAUDE.md and packages/cli/CLAUDE.md):

- Order: write the tests and watch them fail → implement → the `meta-design-expressive-typescript` pass → run it by hand through the real CLI → docs through `codex-keeper` → the orchestrator updates `todo/`.
- Who does the work: cli-developer and cli-tester in packages/cli and packages/compile; web-developer and web-tester in apps/editor. After each step, `reviewer` checks the work; whoever verifies never fixes.
- Every brief says: read packages/cli/CLAUDE.md; read-only git is allowed; no git write command; no worktrees; name the files the lane owns.
- In packages/cli, run `bun run build` before `npm test`.
- Only one lane runs `generate:*` at a time, and only one lane edits `packages/compile/src/agent-source.ts` at a time.
- Every Codex call, in tests and in runs by hand, uses a pinned HOME and CODEX_HOME. Something already wrote to the real `~/.codex/tmp/arg0` on 2026-09-19 [CV].

**How every step proves Claude did not regress:**

1. The whole existing suite passes: `npm test`, `test:e2e`, `test:smoke` on a machine with claude, the packages/compile vitest, and the editor suites whenever the editor is touched.
2. The golden files do not change: emission-scenarios, the agent-source snapshots, and the `generate:*:check` scripts.
3. The Step 0 Claude golden trees stay byte-identical.

**What can run in parallel:**

| Wave | What runs                             | Why that order                                              |
| ---- | ------------------------------------- | ----------------------------------------------------------- |
| 1    | Step 0a, alone                        | It records today's output before anyone edits product code. |
| 2    | Steps 0b and 0c, and Step 1, together | Their files do not overlap.                                 |
| 3    | Step 2, alongside Step 3              | Step 2 is the only generate lane while it runs.             |
| 4    | Step 4 Lanes A, B and C, and Step 5   | They need only Steps 1-3.                                   |
| 5    | Step 7                                | It needs Steps 4 and 5.                                     |

---

### Step 0 — Test harness, Codex test lane and Claude golden trees [test code only; no product change]

cli-tester.

**0a. Record today's Claude output first.**

- Add `e2e/lifecycle/claude-install-byte-identity.e2e.test.ts`. It runs three Claude journeys from nothing:
  1. a global install in eject mode;
  2. a project install in plugin mode (skipped when claude is not installed);
  3. a dual-scope edit, then compile, then uninstall.
- Each journey compares every file under the fake HOME and the project against snapshots stored in `e2e/fixtures/claude-golden-trees/*.json`. Take the snapshots from today's binary.
- If a product lane has already started editing, build HEAD from `git archive HEAD | tar -x -C <scratch>` (read-only git) and take the snapshots from that. Today product `src/` equals HEAD: `git status` shows only .ai-docs findings and todo plans [V].
- The normaliser removes temp paths, the CLI version in the trailing volatile block (agent-source.ts:302-381 [R]) and mtimes. It lives in `src/cli/lib/__tests__/helpers/` with its own test, per the rule on test helpers.
- Watch it fail once by changing one byte of a built agent.

**0b. Pin each host's config directory at all three spawn doors.**

- Doors: `e2e/fixtures/cli.ts:78-91`, `e2e/helpers/test-utils.ts:404-444` and `e2e/helpers/terminal-session.ts:94-139`.
- Set CODEX_HOME=`<home>/.codex` at every door. Also set CLAUDE_CONFIG_DIR at the PTY door, which lacks it today [V read].
- Add `codexHome(home)` beside `claudeConfigDir` (test-utils.ts:172).
- Gate: add a check to `src/cli/lib/__tests__/e2e-runner-environment.test.ts`. It already takes its list of doors from `scripts/check-spawn-doors.ts` and its list of variables from `NAMED_ENV_READS` [V read]. The new check requires both variables to be pinned at every door. It must fail against today's PTY door before the fix.

**0c. The Codex test lane.**

- Add `@openai/codex` at exactly 0.155.1 as a devDependency (D6).
- New `e2e/fixtures/codex.ts`:
  - `runCodex(home, args, cwd)` parses only the `--json` output on stdout, and never treats the /tmp WARNING line on stderr as an error [V: seen in this pass];
  - `isCodexCLIAvailable`.
- New `e2e/fixtures/codex-responses-mock.ts`: a local HTTP server that fakes the Responses API. It is a TS port of the critic's rig (`codexmap/hooks-on-codex-critic/mock/`), using `model_provider="mock"`, `wire_api="responses"`, `requires_openai_auth=false` and `sandbox_mode="workspace-write"` [CV].
- `e2e/pages/constants.ts`: add the Codex strings `.codex`, `.agents/skills` and `.toml` as literals, following the mirror rule.

**Verify:**

- `bun run build && npm test && npm run test:e2e` pass.
- The new door check fails before 0b and passes after it.
- The golden-tree spec passes on the unchanged product.

---

### Step 1 — Route every install path through one function [no behaviour change; about 24 files]

cli-developer and cli-tester. It can run alongside Steps 0b/0c.

**Two new modules:**

- `packages/compile/src/install-layout.ts` holds the path names a host uses and nothing that reads the machine, so the browser can use it too. It sits beside paths.ts, which already follows this split [V read]. The names:
  - `.claude`;
  - the agents subdirectory;
  - `.md` and its listing glob;
  - the skills prefix.
- `packages/cli/src/cli/lib/installation/install-layout.ts` exports `installLayout(projectDir, scope)`, which returns named roles:
  - `userConfigRoot`
  - `agentsDir`
  - `skillsDir`
  - `skillsPathPrefix`
  - `pluginsDir(scope)`
  - `pluginRegistry`
  - `permissionFiles`
  - `ownedRoots`
  - `agentCodec` = {extension, listGlob, hasMarker, validate}

  `resolveInstallPaths` (install-base-dir.ts:32-43 [V]) becomes a view of it, so its existing callers keep working.

**Sites to move onto it.** All paths are under packages/cli/src/cli/. Re-derive the list with:
`grep -rn "CLAUDE_DIR\|LOCAL_SKILLS_PATH\|PLUGINS_SUBDIR\|STANDARD_DIRS.AGENTS\|STANDARD_DIRS.SKILLS\|\"\.md\"\|\"\*\.md\"\|\.claude/" src/cli --include='*.ts' --include='*.tsx' | grep -v __tests__`

| File                      | Lines               |
| ------------------------- | ------------------- |
| installation.ts           | :99, :102           |
| plugin-finder.ts          | :18, :23            |
| plugin-settings.ts        | :67, :105           |
| permission-checker.tsx    | :38-39              |
| local-skill-loader.ts     | :32, :103           |
| local-skill-mover.ts      | :40-41, :84-88      |
| discover-skills.ts        | :36, :38            |
| eject.ts                  | :474                |
| doctor.ts                 | :252, :339, :400    |
| uninstall.tsx             | :678, :815, :819    |
| external-skills.ts        | :201                |
| write-compiled-agents.ts  | :76                 |
| remove-compiled-agents.ts | :7, :75             |
| list-compiled-agents.ts   | :18, :41, :53, :69  |
| content-validator.ts      | :41, :389, :493-506 |
| edit.tsx                  | :1543               |
| plugin-info.ts            | :16, :110           |
| init.tsx                  | :1021               |

(All [CV]. I spot-read installation.ts, plugin-finder.ts, eject.ts and external-skills.ts [R].)

**Three behaviours stay exactly as they are:**

- in plugin mode, `skillsDir` is `.claude/plugins` (installation.ts:102). It gets its own role;
- plugin-finder keeps using `os.homedir()`;
- `.claude/templates` (compiler.ts:100) and `.claude-src` stay outside the layout, because they do not depend on the host.

**Enforcement, in `packages/cli/eslint.config.js`.** Merge the rules into each file group's one existing options object.

- `no-restricted-imports`: CLAUDE_DIR, LOCAL_SKILLS_PATH and PLUGINS_SUBDIR only inside the two layout modules.
- `no-restricted-syntax`:
  - member access `STANDARD_DIRS.AGENTS|SKILLS`, except compiler.ts:92 and loader.ts:212;
  - the literals `".md"` and `"*.md"`;
  - string or template literals that start with `.claude/`.

**Tests first:**

- a unit spec for installLayout that pins every Claude role as a literal;
- a spec that runs ESLint through its API against a planted violation and an allowed case in the same file, and fails before the config changes.

**Verify:**

- the full suite, the golden trees, lint, `npx tsc --noEmit` and `npx tsc -p e2e/tsconfig.json --noEmit`;
- the census grep returns only the layout modules and the named exceptions;
- by hand: init, compile and uninstall in a copy of /home/vince/dev/cv-launch under a scratch HOME, then diff the tree against a run from before the change.

**Docs (codex-keeper):**

- a layout reference page and its DOCUMENTATION_MAP row;
- packages/cli/CLAUDE.md's "ALWAYS use resolveInstallPaths" rule then points to installLayout.

---

### Step 2 — The `target` field [behaviour unchanged for Claude; Codex cannot be reached yet]

cli-developer and cli-tester. This is the only `generate:*` lane while it runs. It runs alongside Step 3.

**The type and its accessor:**

- New `packages/compile/src/target.ts`: `TARGETS`, `Target`, and `installationTarget(config)`, which returns `config.target ?? "claude"` and is the only way anything reads the field.
- `ProjectConfig.target?`:
  - add it in `src/cli/types/config.ts:77-144`;
  - add it to the loader schema at `lib/schemas.ts:325-371` AND to `projectSourceConfigFields` at :621-651, so both loaders refuse the same values;
  - run `bun run generate:matrix`.

**Writing it out:**

- `packages/compile/src/config-source.ts`: add `target` to `CANONICAL_FIELD_ORDER` (:93-105). `cleanForEmission` writes it only when the value is codex.
- `packages/compile/src/config-types-source.ts:102-137`: add `target?: 'claude' | 'codex'`. The install-target critic's list misses this line. Without it, the emitted config.ts fails its own `satisfies` with TS2353 [R].
- `contract/emission-scenarios.ts`: add one Codex scenario. The existing goldens do not change.

**Keeping it on the global config:**

- `lib/config-gate/propagate.ts` `mergeGlobalConfigs` (:135-222 [V]) carries `target` FILL-ONLY and counts it in `changed`, exactly as it does `marketplaceName`.

**Passing it through install:**

- `packages/compile/src/seed-to-config.ts`: `WizardResultV2.target`, set by both the wizard and `--from` (which takes it from the flag).
- `lib/installation/local-installer.ts` `setConfigMetadata` (:301-325) writes it.

**The layout learns the target.** Codex roles, all [CV]:

- agents: `.codex/agents` (project) and `$CODEX_HOME/agents` (global);
- skills: `.agents/skills` (project) and `~/.agents/skills` (global);
- agent files end in `.toml`;
- no project plugins directory;
- userConfigRoot: `$CODEX_HOME`, else `~/.codex`.

Every layout caller passes `installationTarget(config)`.

**Do NOT touch** config-to-seed.ts or packages/matrix/src/seed.ts. The target never enters a shared payload or its id.

**Tests first:**

- the loader refuses `target: "cursor"` and accepts `"codex"`, in the same file;
- the writer reaches a fixed point;
- tsc exits 0 on a Codex config.ts and config-types.ts pair it emitted;
- the global merge fills `target` into a blank global config (the `ensureBlankPair` case) and never overwrites one that is set;
- config-to-seed of a Codex config is byte-identical to the Claude one;
- the Codex layout roles are pinned as literals, with CODEX_HOME both set and unset.

**Verify:** `generate:matrix:check`, `generate:compile:check`, `generate:schemas:check`, the full suite and the golden trees.

---

### Step 3 — Put Claude plugin handling behind a `PluginHost` interface [no behaviour change]

cli-developer and cli-tester. Runs after Step 1, alongside Step 2, with disjoint files: local-installer.ts and types/config.ts stay with Step 2's lane. Leave `ClaudePluginScope` where it is, so no second generate lane is needed.

**New files** in `lib/hosts/`: `plugin-host.ts`, `claude-host.ts`, `host-for.ts`. The interface is the one the install-target critic gave:

- `Target`;
- `PluginRemovalOutcome` = removed | absent;
- `HostPlugin` = {pluginKey, installPath, enabled};
- `PluginHost` = {target, installsProjectScopedPlugins, isAvailable, marketplaceExists, addMarketplace, refreshMarketplace, installPlugin, uninstallPlugin, listPlugins(dir)}.

The name `PluginRemoval` stays with uninstall's plan type (uninstall.tsx:70).

**Moving the Claude code:**

- The `claude*` functions in `utils/exec.ts:134-363` move into claude-host.ts without edits. exec.ts keeps `execCommand` and the validators.
- `claudePluginMarketplaceRemove` stays a test-only export, as tested-exports-reach-production.test.ts:107-118 records.

**Install and uninstall callers:**

- install-plugin-skills.ts
- uninstall-plugin-skills.ts
- ensure-marketplace.ts:45-57
- mode-migrator.ts:156-159, :259-262
- edit.tsx:1765-1795
- uninstall.tsx:838-871
- update.ts:86-116

**Discovery callers.** These move from `getVerifiedPluginInstallPaths` / `discoverAllPluginSkills` to `host.listPlugins(dir)`, filtered on `enabled`. This touchpoint is the one the first research missed.

- discover-skills.ts:68-112
- plugin-discovery.ts:18-70
- plugin-settings.ts:104-232, which becomes the Claude host's reader
- compile.ts:167
- init.tsx:855
- edit.tsx:981, :1486
- recompile-project-agents.ts:38
- agent-recompiler.ts:180
- multi-source-loader.ts:175-196
- content-validator.ts:208-267
- doctor.ts:427-470
- uninstall.tsx:672-735

**Unit mocks** of `utils/exec` move to the host module. Re-derive the list with `grep -rln 'vi.mock(.*utils/exec' src`.

**Tests first:**

- a PluginHost contract spec run against a fake host and against the Claude host (only where claude is installed). It includes: removing a missing plugin returns `absent`. Claude exits 1 with "not found" in that case [CV];
- an ESLint restriction that keeps `claude*` imports inside `hosts/`, tested with a planted violation.

**Verify:**

- the full suite, including `test:smoke`;
- the golden trees;
- `grep -rn "claudePlugin" src/cli --include='*.ts*' | grep -v "hosts/\|__tests__"` prints nothing.

---

### Step 4 — The Codex install method, behind a hidden flag [the first step that reaches Codex]

cli-tester writes all of Step 4's specs first. Three cli-developer lanes then work on disjoint files:

- **Lane A:** the new `lib/hosts/codex-host.ts`, `utils/messages.ts:22`, `update.ts`, `doctor.ts`.
- **Lane B:** `init.tsx`, `edit.tsx`, `base-command.ts:285-300`, `install-plugin-skills.ts:14-51`, `stores/wizard-store.ts` (:679-692 and the S-toggle action), `lib/config-gate/propagate.ts`.
- **Lane C:** `uninstall.tsx`.

**4a. The Codex host (Lane A).** It runs `codex`, inheriting CODEX_HOME, and reads only the JSON on stdout.

- **Marketplaces:** `plugin marketplace list --json` answers whether one exists; `plugin marketplace add <source> --json` adds it.
  - `add` returns `alreadyAdded` [CV].
  - Adding the same name from a different source exits 1 [CV].
- **`installPlugin`:** runs `codex plugin add <id>@<mkt> --json` [CV]. It throws on project scope, since `installsProjectScopedPlugins` is false.
- **`listPlugins(dir)`:** runs `plugin list --json` from `dir`.
  - Build `installPath` as `<CODEX_HOME>/plugins/cache/<marketplaceName>/<name>/<version>`. The list has no `installedPath` field, but it has those three [V].
  - The version comes from plugin.json, even for a local plugin, where the docs say `local` [CV].
  - Keep the `enabled` flag, because disabled plugins still appear in `installed[]` [CV].
- **`refreshMarketplace`:** read `marketplaceSource.sourceType` from `marketplace list --json`; it reads `"local"` for a local marketplace [V].
  - For a git source, run `marketplace upgrade`.
  - For a local source, add each installed plugin again, because `upgrade` exits 1 on a local source [CV].
- **`uninstallPlugin`:**
  1. Take `plugin list` from $HOME.
  2. Always run `plugin remove --json`, since it also clears orphaned caches [CV].
  3. Take `plugin list` again.
  4. The outcome comes from the first list. If the plugin is still listed afterwards, throw.
- Strip the /tmp WARNING line from any stderr quoted in an error.
- Add a `CODEX_CLI_NOT_FOUND` message, and make update's `requireClaudeCli` (:36-37) work for either host.

**4b. The flag and the refusal (Lane B).**

- `init --target <claude|codex>` goes in init.tsx:331-347, with oclif `hidden: true` until Step 7.
- Without a TTY the default is claude. There is no PATH probing.
- The dashboard route (init.tsx:232-246, :404-450) REFUSES a `--target` that contradicts the installation it would divert to. The message says: switching target means uninstall, then `init --target`.

**4c. Skills on Codex (Lane B).**

- Global plugin skills install through the Codex host.
- A project-scoped plugin skill becomes a copy in `<project>/.agents/skills/<id>` with `origin: eject` (D3). One warning line says three things:
  - `update` no longer refreshes it;
  - sharing it again turns it into `install: eject`;
  - Codex does not see it from a subfolder of a project with no git repo [CV].
- This applies in three places:
  - `init --from` (init.tsx:514-566);
  - `edit --from` (edit.tsx:732-740);
  - the wizard's S toggle, which also flips `origin` when it moves a plugin skill to project scope.
- Add a `projectScopedPluginSkillIds` guard in `installPluginSkillsReported`, beside `unbackedPluginSkillIds`.

**4d. A project whose host differs from the global installation (Lane B, per D1).** A Codex project under a Claude global installation:

- is not added to `projects`;
- inlines no global rows;
- is skipped by global propagation.

The wizard locks scope to project. Files: `registerProjectPath`, `propagateGlobalChangesToProjects`, and `writeProjectConfigPair` at :606-660.

**4e. Uninstall (Lane C).**

- On Codex, a project uninstall removes no plugins.
- A global uninstall removes only the plugins of global-scoped rows.
- Counts come from what was observed. This is a named Claude change at uninstall.tsx:847-866.
- Rename `UninstallTarget` to `UninstallInventory` (:91, :110, :115 [V]).

**4f. Doctor (Lane A).** Codex rows appear only on a Codex installation:

- `codex` is on PATH;
- the marketplace is registered;
- each configured plugin is installed AND enabled when listed from the project directory.

For Claude users these rows are absent, not shown as skipped. The permission notice stays Claude-only.

**4g. Agents at this step.** A Codex compile writes no agents yet and prints one line saying so. Only the hidden flag can reach this state.

**Tests first**, in `e2e/lifecycle/codex-*.e2e.test.ts`. Each refusal is paired with an allowed case in the same file.

1. `init --target codex --from`:
   - the plugin skills appear in `codex plugin list --json`;
   - both the global and the project config.ts record `target: "codex"`;
   - including when a blank global config already exists.
2. Compile keeps the plugin skills: no "configured but was not found" warning (compile.ts:205-207).
3. A project-scoped plugin skill ends up in `.agents/skills/<id>`, and `codex debug prompt-input` lists it by its plain name. Plugin skills are listed as `<id>:<id>` [CV].
4. The uninstall pair, in one file: a project uninstall leaves the global plugins registered, and a global uninstall removes them.
5. Removal is reported truthfully, including an orphaned cache.
6. `update` against a local marketplace adds plugins again and never calls `upgrade`.
7. `--target codex` over a Claude installation is refused, and `readTreeSnapshot` shows nothing changed. It is allowed with a fresh HOME.
8. Across init, edit, compile, uninstall and doctor on Codex, no `.claude/` directory is ever created. `.claude-src` is allowed. This is the check that catches a half-routed path.

Unit specs run the Codex host against JSON output recorded from 0.155.1.

**Verify:**

- the full suite and the golden trees;
- by hand: `node bin/run.js init --target codex --from <id>` in a scratch HOME/CODEX_HOME, then `codex debug prompt-input` and `codex plugin list --json`.

---

### Step 5 — The Codex agent renderer

cli-developer and cli-tester. Runs after Step 2. It can run alongside Step 4. It is the only `generate:compile` lane while it runs.

**Split the template:**

- `src/agents/_templates/agent.liquid` becomes a frontmatter part and a body part. The Claude render stays byte-identical.
- Run `generate:compile`. `generate-compile-package.test.ts` still compares the corpus render with the disk render, and gains a Codex twin.
- Move `withSkillTool` (agent-source.ts:238-241) out of `buildAgentTemplateContext` (:266-289), and export a render of the body alone.

**New file `packages/compile/src/targets/codex/agent-toml.ts`.** It writes TOML with a serializer that follows the spec (D7), and emits only these keys:

- `name`;
- `description`;
- `developer_instructions`: the provenance marker plus the body;
- `model_reasoning_effort`: the same value as `effort`. All five of our effort values exist in the 0.155.1 source (protocol/src/openai_models.rs:58-71) [V]. The config-reference page lists only minimal to xhigh, so the docs disagree with the source;
- `[features] shell_tool = false` when the agent's tools do not include Bash. Today that is skill-summoner only [CV].

It never emits `tools`, `disallowedTools`, `effort`, `permissionMode`, `isolation`, `experimental`, `hooks`, `sandbox_mode`, `mcp_servers`, `model` or `skills`. Each of these either drops the agent or is ignored [CV].

**What changes in the output:**

- Preloaded skills become a "read first" line at the head of the skill list (D9).
- `model` is omitted, so the agent inherits the session's model.
- Compile prints one line naming the settings that Codex ignores.

**Other files:**

- `hasProvenanceMarker` (:356) learns where the marker sits in a TOML file.
- `list-compiled-agents` and `remove-compiled-agents` read the file format from the layout's codec.
- `content-validator.ts:493-506` gets a Codex agent validator, backed by a new schema in schemas.ts.

**Tests first:**

- golden TOML for web-developer (writes files), skill-summoner (no Bash) and one read-only agent;
- a TOML round trip: parse the output and compare it with the input;
- the Claude snapshots do not change;
- e2e: `codex doctor --json` reports no malformed agent, and the set of `.codex/agents/*.toml` files equals `E2E_STACK_AGENTS` by member. The exact JSON shape is [A]; pin it in the spec while it is red.

**Verify:**

- `generate:compile:check`, the compile vitest and the golden trees;
- by hand with the mock provider: run `codex exec`, have it start web-developer, and confirm that `developer_instructions` reach the sub-agent [CV method].

---

### Step 7 — Release to users: CLI, editor, user journeys, docs and trackers

Runs after Steps 4 and 5.

**CLI:**

- Unhide `--target`.
- A new install shows the target step first, always, with Claude Code selected (D2). The edit wizard never shows it. Files:
  - new `components/wizard/step-target.tsx`;
  - `wizard.tsx`;
  - `wizard-tabs.tsx`;
  - `wizard-store.ts:934-976, :2087`.
- A `Target:` row appears on the dashboard only for codex.
- `InitWizard.launchWith` (`e2e/pages/wizards/init-wizard.ts:180-193`) absorbs the new step, so about 80 init specs pass unchanged.

**Editor** (web-developer and web-tester):

- **The control:** a Claude | Codex control on the configure screen, using `packages/ui` `segmented.tsx` [V exists].
- **The output preview** (`output-preview.ts`: :17-18, :791-808, :836-866, :874-875):
  - it draws its tree from the layout: `.toml` agents and `.agents/skills`;
  - it renders agents with the Codex renderer, behind the existing lazy `import()`.
- **The copied command:** `use-install-command.ts:150-165` [V] adds `--target codex` to both the id command and the fallback command.
- **Notes shown on screen:**
  - project plugins become local copies.
- **What is saved:** the target is local editor state. It never enters a payload.
- **Tests:** a new `apps/editor/e2e/specs/codex-target.spec.ts`, plus visual and a11y captures.

**User journeys:**

- Add a row to `packages/cli/.ai-docs/standards/e2e/user-journeys.md` for each Codex spec. `spec-gates.test.ts` fails on any spec without a row.
- Add a journey to `e2e/handrun-journeys.ts`: a Codex uninstall leaves Claude untouched.
- Run `node scripts/handrun.mjs`.
- Run the whole flow by hand, in a scratch HOME/CODEX_HOME:
  1. local editor → copy the command;
  2. `node packages/cli/bin/run.js init --from <id> --target codex`;
  3. the Codex TUI with the mock provider;
  4. doctor, update and uninstall.

**Docs (codex-keeper):**

- apps/www: `reference/commands.md`, `concepts/install-modes.md`, `recipes/share-with-a-teammate.md`, `configuration/scopes-and-paths.md`, config-reference and sub-agent-anatomy;
- .ai-docs: pages for the hosts and the layout, each with a DOCUMENTATION_MAP row.

**Trackers** (orchestrator only):

- the plan file in `todo/plans/`;
- a progress row for each dispatch, with its corrections;
- rows in `todo/cli.md`, `editor.md` and `www.md`;
- archive lines;
- ROADMAP.

**Verify:**

- every CLI suite;
- editor vitest, with Node 22 or later on PATH;
- the Playwright e2e, visual and a11y suites;
- the golden trees;
- the hand-run verdicts.

## Owner decisions

Each decision below has a recommendation.

**D1. A Codex project on a machine whose global installation is Claude.**

- **Ruled 2026-09-19 by the owner: allow it, per project.** "One project can be on Codex and the other can be on Claude. It should be per project basis." The recommendation below is what gets built.
- **Why it needs deciding:** today's rule is "the project takes the global installation's target". Most existing users have a global installation, because global is the default scope. Under that rule they can never get a Codex project.
- **Recommendation:** allow a project to choose a different target. Such a project:
  - does not inherit global rows;
  - is not added to `projects`;
  - is skipped by global propagation;
  - is locked to project scope.
- **Named limit:** only one host per HOME can own the global installation.
- **Alternative:** tell users to uninstall their Claude global installation first.

**D2. A target step in the wizard for a new install.**

- **SUPERSEDED 2026-09-20 by the owner: there is no wizard step.** The provider is chosen in the web app only; the CLI just has to install what the app produced, via `init --from <id> --provider codex`. The interactive wizard stays Claude-only, so nothing about the Claude experience changes at all. After the install, the folder on disk (`.agents-inc/codex/`) says which provider it is, so no later command needs a flag.
- **Ruled 2026-09-19 by the owner:** the wizard defaults to Claude and lets you choose Codex instead; the web app defaults to Claude with a toggle. One installation is one target — no mixing in the web app or the CLI; a machine may hold several installations. Built as a toggle on an existing screen, so the recommendation's extra Enter does not happen.
- **Revised the same day by the owner: the target is per scope** ("this global is Claude, this project is Codex"), easiest first iteration. v1: `target` in each config.ts, one global per machine user, one toggle per run, a run that differs from the existing global is project-only. A per-scope toggle inside one run is a later iteration.
- **Recommendation:** show it always, with Claude preselected, and land it only in Step 7. This costs Claude users one extra Enter, which is a named change.
- **Alternative:** offer the choice only through the flag and the web app. The Claude experience then stays byte-identical, but the wizard gives no choice.
- **Rejected:** showing the step only when `codex` is on PATH. It would make the e2e suite and the command's results depend on the machine.

**D3. Project-scoped plugin skills on Codex.**

- **CORRECTION 2026-09-20, measured against the pinned 0.155.1 by running it.** The plan's premise — "Project-scoped skills become local copies in `.agents/skills`, because Codex cannot install a plugin for one project only" — is wrong in its reason and right in its shape. What is true: per-project ENABLEMENT of a plugin works (`[plugins."<n>@<mkt>"] enabled` in `<repo>/.codex/config.toml`, overriding global both ways), while per-project INSTALLATION does not, there is no `--scope` flag on any subcommand, and the project file is ignored in total silence unless the GLOBAL config marks the repo trusted. Separately: `<repo>/.agents/skills/<name>/SKILL.md` is read in that repo and nowhere else with NO global state of any kind — so a project skill on Codex is a committed file by design, not a fallback. Also measured: `codex plugin add` run inside a scoped project writes `enabled = true` to the GLOBAL config and leaves the project file alone, silently un-scoping it.
- **Ruled 2026-09-20 by the owner: offer the choice instead of falling back.** A Codex install offers plugin+global, eject+global and eject+project; plugin+project is not offered, and a shared config asking for it is refused naming the three. The "never fall back to eject" rule at install-plugin-skills.ts:15-18 therefore stands unchanged — nothing is ejected that the user did not choose. Contingent on the triple-check of project-scoped plugins now running.
- **Recommendation:** eject them into `.agents/skills`, with a warning that names three costs:
  - `update` no longer refreshes them;
  - sharing them again turns them into `install: eject`;
  - Codex cannot see them from a subfolder of a project with no git repo.
- This overrides the note "never fall back to eject" at install-plugin-skills.ts:15-18, so it needs your explicit yes.
- **Alternative:** refuse. That breaks the rule that the CLI must install anything the editor can produce.

**D6. Pin `@openai/codex` as a devDependency for the e2e lane.**

- **Recommendation:** yes, at exactly 0.155.1, so the lane never skips silently. Bump it on purpose, with the lane catching any drift.
- **Cost:** the binary is downloaded on every dev install.

**D7. The TOML serializer.**

- **Recommendation:** add `smol-toml` to packages/compile. It runs in the browser and can both write and parse, which the round-trip tests need.
- **Alternative:** a hand-written writer for the five keys.

**D8. Agent prose on Codex.** Several agents mention CLAUDE.md, the Skill tool and the Task tool, and some write memory files under `.claude/*.md`.

- **Recommendation:**
  - add a `target` Liquid variable in the few partials that name these;
  - keep the memory files outside `.codex/` and `.agents/`. Codex's default sandbox makes those two folders read-only to agents (verified).
- **Needs your ruling:** skill-summoner and agent-summoner cannot write where Codex looks for skills and agents. Choose one:
  - they write to a staging folder that `compile` imports;
  - they are left out of Codex installs in v1.

**D9. Preloaded skills.**

- **Recommendation:** a "read first" line at the top of the agent's skill list.
- **Alternative:** paste the skill's content into `developer_instructions`. That makes the file larger, and the copy goes stale.

**D11. Sign off on the Claude-visible changes.**

- **(a)** One extra Enter in the wizard for a new install (D2).
- **(b)** uninstall stops counting plugins as removed when the `claude` binary is missing, because it now reports what it observed.
- Nothing else is meant to change for Claude users. The Step 0 golden trees prove it.

## Risks

**Risks that stop the feature working without anyone noticing**

1. **Agents only act if Codex picks them by name.** On Codex, the agents-inc agents act only when the orchestrator model passes `agent_type`. The v2 tool description tells the model to leave `agent_type` out unless asked. No run against a real model has measured this.
   - A flat result here is a finding, and should be reported as one.
2. **Codex sometimes cannot see project agents or project skills:**
   - project agents are skipped in an untrusted project (running `exec` with a workspace-write sandbox trusts the project automatically);
   - from a subfolder of a project with no git repo, `.codex/` and `.agents/skills` are not found.
3. **Half-routed paths.** A path that bypasses the funnel ships a half-built target while every test passes. Mitigation: the lint restrictions, the census grep, and the Step 4 e2e check that no `.claude/` directory is ever created.
4. **The global merge drops `target`.** `mergeGlobalConfigs` keeps only the fields it names. Without the Step 2 change, a Codex global config reads as Claude.
5. **An older CLI reads a Codex config as Claude.** The loader passes unknown fields through, and there is no version fence.

**Risks of destroying user data or giving wrong answers** 6. **Project uninstall could remove global plugins.** If project uninstall asked Codex's user-wide plugin list, it would remove every global plugin, for every project. The Step 4 scope rule and the paired spec guard against this. 7. **`codex plugin remove` always exits 0.** The CLI must classify the result from the list taken before the removal. `remove` also deletes orphaned caches that `list` does not show. 8. **Ejected copies lose their plugin link.** On Codex, project skills become frozen copies. A Claude → Codex → Claude share turns plugins into ejected copies, and `update` stops refreshing them.

**Risks from how far the evidence goes** 9. **All runtime evidence used a mock.** It comes from Codex 0.155.1 against a scripted Responses mock. - These are assumed, not observed: the model's handling of `xhigh`/`max` effort, and real-API behaviour. - The Codex docs disagree with its source about effort values. - Codex's multi-agent v1 path was exercised only by one critic. 10. **Codex output formats may change.** These can all change in a new release: the cache layout, the `list --json` fields, trust keys, and the hash rules. - Mitigation: pin the exact version and parse only `--json` output. Recorded JSON fixtures in the unit tests, together with the live lane, make a version bump fail visibly.

**Coordination risks** 11. **Environment leakage.** Something wrote to the real `~/.codex/tmp/arg0` on 2026-09-19 at 19:24; the writer is unknown. No Codex lane should run before Step 0b pins CODEX_HOME at every door. 12. **Name collision.** The docs agent `codex-keeper` shares a word with the Codex host, which will pollute greps and briefs. Say "Codex host" or "Codex target" consistently. 13. **Run time.** The Codex lane adds spawns of the Codex binary. The editor's vitest needs Node 22 or later on PATH.

**Corrections to the brief** (a required field)

- **The install-target critic's plumbing list misses `config-types-source.ts`.** Without it, the emitted config.ts fails its own `satisfies` with TS2353.
- **Effort maps one to one.** All five effort names exist in Codex 0.155.1's source. The config-reference page lists only minimal to xhigh, so the docs are behind the source.
- **Refresh does not need guessing.** `marketplace list --json` returns `marketplaceSource.sourceType`, so the host can choose upgrade or re-add (verified).
- **The pin may not need a new script.** The existing environment roster, `NAMED_ENV_READS` in `e2e-runner-environment.test.ts`, will require an answer for CODEX_HOME at every door once `src/cli` reads it, so it can host the new check (read, not run).
- **The research streams broke the no-git-write rule.** Three of them ran `git init` in scratch folders; the repo itself was never touched.
- **This pass:** I edited nothing in /home/vince/dev/cli and ran no git write command. `git status --porcelain` is identical to the snapshot. My Codex runs pinned HOME and CODEX_HOME to `scratchpad/codexmap/plan-writer/`.
