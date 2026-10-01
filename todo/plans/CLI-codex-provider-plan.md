# Codex provider — plan

_(The file keeps its `target` name; the vocabulary inside it does not. Per rename D9 the word is **provider** everywhere: `Provider`, `--provider`, `.agents-inc/<provider>/`. "Target" survives only where it quotes superseded text.)_

## Scope

**What this delivers.** The provider is chosen in the **web app**, with a Claude | Codex button on the configure screen. The button changes one thing the user can see: the command the app prints becomes `npx agents-inc init --from <id> --provider codex`. The CLI's job is to install what the app produced. Nothing else in the CLI learns a new flag, because after the install the folder on disk says which provider it is — `.agents-inc/codex/` rather than `.agents-inc/claude/` — and `compile`, `edit`, `update`, `uninstall`, `share`, `eject` and `doctor` read it from there.

On Codex:

- **Skills** come from the same agents-inc marketplace and the same content. A Codex install offers **three** of the four mode/scope combinations: plugin+global, eject+global, eject+project. Plugin+project is refused, naming the three.
- **16 of the 18 sub-agents** compile to Codex **agent role definition** files: `<repo>/.codex/agents/<name>.toml` for a project, `$CODEX_HOME/agents/<name>.toml` for the global installation. `skill-summoner` and `agent-summoner` are left out for v1 and the CLI says so.

**What Claude users notice: nothing in the CLI.** The interactive wizard gains no step, `init` gains no visible flag until release, and every Claude install path is byte-identical against the Step 0 golden trees. The two named changes that remain are D11(b) — uninstall counts only the plugins it actually removed — and D11(c), the source-folder rename, which is the other plan's change and already landed.

---

### Owner ruling 2026-09-21 — the real-Codex check happens at the END, by the owner

_"Don't bother testing that right now. Once this is all done, I will get a Codex subscription and have
Codex confirm that it works as expected."_

So: **do not build the mock's spawn-capture**, and do not treat delivery as a blocker on any step. The
programme instead owes the owner a short, runnable **hand-check list** at the end — one page, each line a
command and what to look for, covering exactly what no offline rig can answer:

1. a spawned sub-agent actually receives its role's `developer_instructions`, whole and not truncated
   (our compiled bodies are long), and where they sit against Codex's own prompt, `AGENTS.md` and skills;
2. whether the orchestrator USES the roster at all, given `<multi_agent_mode>` tells it not to delegate
   unless asked — the D13 lever is marked for later and this is the measurement that would justify it;
3. a project install's trust line, and what a user sees when it is missing (four silent kill switches).

Each step of the Codex work adds its lines to that list as it lands, rather than the list being written
from memory at the end.

### CORRECTION 2026-09-21 — project sub-agents DO register on Codex

The fact recorded above as measured ("`<repo>/.codex/agents/<name>.toml` NEVER REGISTERS") is **WRONG**,
and so is the C1 spec that pinned `agentsDir` as absent at Codex project scope. Settled by a tie-break
after two of this programme's agents disagreed: 23 captured runs on the pinned 0.155.1, each a real
`codex exec` against a local mock with HOME and CODEX_HOME pinned, instrument calibrated both ways
(no role → `agent_type` absent; a global role → present and named).

**What is true:** a project role file registers when ALL of these hold — the file is at
`<project-root>/.codex/agents/<anything>.toml` (the role id is the `name` key, not the filename); it
carries `name`, `description` AND `developer_instructions`; and **the GLOBAL `$CODEX_HOME/config.toml`
holds `[projects."<exact absolute path>"] trust_level = "trusted"`. That trust entry is the gate.** No
`.git` is needed, and the cwd may be a subdirectory of the project.

**Four silent kill switches, each measured, each producing nothing with NO warning at all:** no
`[projects]` entry; `trust_level = "untrusted"` (which beats a permissive sandbox flag); a trailing
slash on the path key; and trust declared in the project's own `.codex/config.toml` rather than the
global one, which is correctly refused as self-authorisation.

**Why the first measurement went wrong, and the trap for anyone re-checking it:** every false negative
was a trust failure, not a registration failure — and `--sandbox workspace-write` or
`danger-full-access` makes Codex WRITE `[projects."<path>"] trust_level = "trusted"` into the global
config itself. The tool under test mutates the independent variable, so a later run in the same home
"registers" for reasons the experiment did not set. Reset the config between runs or the result is
contaminated.

**Still unmeasured [A]:** whether a spawned sub-agent's context actually receives the role's
`developer_instructions`. The mock's router refused the `spawn_agent` call, so registration is proven
and delivery is not. Also measured: `spawn_agent` is not a top-level tool — it is nested in a
`"type":"namespace"` tool, `multi_agent_v1`.

**What it means for the design:** a Codex PROJECT installation can carry its own sub-agents, so C5 is no
longer global-only. The cost is one line in the user's global config per project, which the CLI can
detect and must not write silently.

### Measured AFTER this plan was written (2026-09-20, pinned 0.155.1, prompt captured with `codex debug prompt-input` and a local Responses mock; no model call)

Four facts that change this plan again. Each was re-run by a critic, not taken from one lane.

1. **`<repo>/.codex/agents/<name>.toml` NEVER REGISTERS.** Tested with a valid file, inside a repo with a
   `.git`, and again with `projects."<path>".trust_level = "trusted"` [V]. Only
   `$CODEX_HOME/agents/<name>.toml` registers. **C5 must install agents globally, and a Codex PROJECT
   install cannot carry project-scoped sub-agents at all on this version.** D20 asks what to do about it.
2. **A role file registers only with all three of `name`, `description` and `developer_instructions`.**
   Two keys, or `instructions` instead of `developer_instructions`, and the file is dropped [V] — but not
   silently: `warning: Ignoring malformed agent role definition: … must define 'developer_instructions'`.
3. **By default the roster is not merely ignored, it is ABSENT.** With no registered role, `spawn_agent`
   has no `agent_type` parameter at all (`['fork_turns','message','model','reasoning_effort','task_name']`).
   With one registered, `agent_type` appears and lists our roles [V]. So "installed but unused" was wrong:
   nothing was on the wire.
4. **The prohibition names AGENTS.md itself.** Verbatim: _"Do not spawn sub-agents unless the user or
   applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent
   work."_ The earlier paraphrase in this plan dropped that clause. The owner's AGENTS.md instinct was
   right about the mechanism.

### The three premises the first version of this plan got wrong

All three were measured against the pinned `@openai/codex@0.155.1` with `HOME` and `CODEX_HOME` pinned to a scratch directory. They are stated here, at the top, because each one changed the shape of a step.

**1. "Project-scoped skills become local copies in `.agents/skills`, because Codex cannot install a plugin for one project only."**
Wrong in its reason, right in its shape. A skill committed at `<repo>/.agents/skills/<name>/SKILL.md` reaches the model **in that repo and nowhere else**, with no plugin, no install, no marketplace, no trust entry and no global config file at all [V, against an empty `CODEX_HOME`]. A project skill on Codex is a committed file **by design**, not a degraded fallback. Separately, per-project _enablement_ of a plugin does exist — `[plugins."<name>@<mkt>"] enabled` in `<repo>/.codex/config.toml`, overriding the global value in both directions — while per-project _installation_ does not; there is no `--scope` flag on any subcommand; the project file is ignored **in total silence** unless the global config marks the repo trusted; and `codex plugin add` run inside such a project writes the switch to the **global** config and silently un-scopes it.
_Consequence:_ Step 4c stops being an eject-as-fallback design with a three-part warning and becomes three offered placements plus one refusal.

**2. "Per-agent model, sandbox, approval mode and hooks either drop the agent or are ignored" — and, from the second mapping pass, "Codex has no per-agent definition file I could prove."**
Both false. `$CODEX_HOME/agents/<name>.toml` and `<repo>/.codex/agents/<name>.toml` are agent **role definition** files, parsed at startup. Required: `name`, `description`, `developer_instructions`. Omit one and `codex doctor` prints `Ignoring malformed agent role definition: agent role file at <path> must define 'developer_instructions'` [V, 2026-09-20 15:31 CEST]. Measured key by key against that same warning row [V]:

| Accepted                                                                                                                                                            | Rejected — and the whole file is dropped                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`, `model_reasoning_effort`, `sandbox_mode`, `approval_policy`, `instructions`, `hooks`, `[features] shell_tool`, `skills` as a struct (`{ enabled = true }`) | `reasoning_effort`, `effort`, `disallowed_tools`, `tools` as an allowlist array (`expected struct ... WebSearchToolConfigInput`), `skills` as an array of strings, and anything unlisted |

The roster also reaches the model: in a captured Responses request body, `spawn_agent`'s `agent_type` parameter description reads `Available roles:` and enumerates the probe agents beside Codex's own `default`, `explorer` and `worker` [CV]. `codex debug prompt-input` does **not** show them, which is why the second pass concluded they did not exist — the roster lives in the tool schema, not the prompt input.
_Consequence:_ Step 5 is a real TOML renderer against a strict schema, not a best-effort subset. The frontmatter that genuinely has no Codex expression is `effort`, `disallowedTools`, `permissionMode`, `isolation`, `experimental`, and `tools`-as-an-allowlist — six things, printed once per compile, not once per agent.

**3. "Codex needs its own plugin and marketplace manifests."**
False. A marketplace whose only manifest is `.claude-plugin/marketplace.json` is accepted (`codex plugin marketplace add <dir> --json` → `{"marketplaceName":...,"installedRoot":...,"alreadyAdded":false}`), and a bundle whose only manifest is `.claude-plugin/plugin.json` installs and keeps that manifest verbatim in the staged cache [V]. Our `PLUGIN_MANIFEST_DIR = ".claude-plugin"` (`packages/cli/src/cli/consts.ts:50`) and the whole marketplace generator need no Codex variant.
_Consequence:_ a planned `.codex-plugin/` writer and its goldens are deleted from the plan. But Codex's own bundled `plugin-creator` skill documents `.codex-plugin/plugin.json` as the required manifest [V, read out of `debug prompt-input`], so we are betting on a compatibility shim. D19 asks whether to take that bet, and the tripwire test goes in either way.

---

**What it still cannot deliver on Codex 0.155.1** (published 2026-09-19), because Codex has no way to do it:

- plugins **installed** for one project only. Enablement per project exists; installation does not, and it needs a global trust entry to be read at all;
- per-agent tool allowlists. `tools` is a configuration struct, not a list of permitted tools, so the five read-only agents can still edit files. `[features] shell_tool = false` is the one real limit we can express;
- `disallowedTools`, `permissionMode`, `isolation` and `experimental`. The deserializer rejects the whole file on any of them;
- a per-agent preload list of skills. `skills` on an agent role is a bundled-skills toggle (`{ enabled = true }`), not a list of skills to read [V];
- project agents, project plugin enablement, project MCP servers or project hooks in an **untrusted** project — silently, with no warning anywhere [V]; or from a subfolder of a project with no git repo;
- a reliable exit code from `codex plugin remove`.

**Named limits that come from our own design:**

- the roster is **inert by default**. Codex's system prompt carries `<multi_agent_mode>`: _"Any earlier instruction enabling proactive multi-agent delegation no longer applies. Do not spawn sub-agents unless the user or applicable AGENTS.md/skill instructions explicitly ask for sub-agents, delegation, or parallel agent work."_ and `spawn_agent`'s `agent_type` reads _"Omit unless explicitly asked."_ [CV, both in a captured request body]. Sixteen installed roles do nothing until something asks for them. D13 decides what we do about it;
- `skill-summoner` and `agent-summoner` are absent from every Codex install, and all 17 shipped stacks list both, so every Codex install prints the drop line;
- the agents only do anything when Codex's orchestrator starts an agents-inc agent by name. No run against a real model has checked that it does.

## Steps

**Labels:** [V] = checked in this pass, by running it (Codex runs used `HOME` and `CODEX_HOME` pinned to `scratchpad/codex-replan/synth/`; the real `~/.codex` was untouched, mtime 2026-09-18 21:53 before and after). [SV] = a mapping stream ran it. [CV] = a critic ran it and I did not re-run it. [R] = read the code. [A] = assumed.

**Rules for every step** (from `/home/vince/dev/cli/CLAUDE.md` and `packages/cli/CLAUDE.md`):

- Order: write the tests and watch them fail → implement → the `meta-design-expressive-typescript` pass → run it by hand through the real CLI → docs through `codex-keeper` → the orchestrator updates `todo/`.
- Who does the work: cli-developer and cli-tester in `packages/cli` and `packages/compile`; web-developer and web-tester in `apps/editor`. After each step `reviewer` checks the work; whoever verifies never fixes.
- Every brief says: read `packages/cli/CLAUDE.md`; read-only git is allowed; no git write command; no worktrees; name the files the lane owns.
- In `packages/cli`, run `bun run build` before `npm test`.
- Only one lane runs `generate:*` at a time, and only one lane edits `packages/compile/src/agent-source.ts` at a time.
- Every Codex call, in tests and by hand, pins `HOME` and `CODEX_HOME`. Something wrote to the real `~/.codex/tmp/arg0` on 2026-09-19 before any lane was dispatched.

**How every step proves Claude did not regress:**

1. The whole existing suite passes: `npm test`, `test:e2e`, `test:smoke` on a machine with claude, the `packages/compile` vitest, and the editor suites whenever the editor is touched.
2. The golden files do not change: emission-scenarios, the agent-source snapshots, and the `generate:*:check` scripts.
3. The Step 0 Claude golden trees stay byte-identical **from C1 onward**. They were re-recorded once, by the rename's R2, against a predicted diff of 20 path keys and 4 import specifiers — nothing else. That amendment replaces the original plan's flat "the golden trees stay byte-identical", which has been false since R2 landed.

---

### Step C0 — Test harness, Codex test lane and Claude golden trees — **DONE**

Landed in dispatches 1 and 1b. Nothing in the rulings touches it.

On disk [V, 2026-09-20]: `packages/cli/e2e/fixtures/codex.ts` (pins `HOME` and `CODEX_HOME` on every call, parses only `--json` on stdout, never reads the `/tmp` PATH-alias warning as failure), `codex-responses-mock.ts`, `claude-golden-trees/` with three trees, `e2e/smoke/codex-lane.smoke.test.ts` with 4 unskipped tests, and the Codex constants in `e2e/pages/constants.ts`: `CODEX: ".codex"` (:61), `CODEX_PROJECT_SKILLS: ".agents/skills"` (:62), `CODEX_AGENT_EXTENSION: ".toml"` (:83).

**One gap it leaves, and C1 closes it:** there is **no constant for a global Codex skills directory**, which is exactly the hole D14 fills. There is also no Codex golden tree of any kind; C4 creates the first.

---

### Step C1 — Host roles on the existing layout module [no behaviour change]

cli-developer and cli-tester. Runs after R3b closes.

**This step extends a module that already exists. It does not create one.** The rename's R1 split the funnel in two, and the first version of this plan names a file that was never built:

- `packages/compile/src/source-layout.ts` — 50 lines, browser-safe: `PROVIDERS`, `type Provider`, `DEFAULT_PROVIDER`, `sourceDirName(provider)`. [V]
- `packages/cli/src/cli/lib/installation/install-layout.ts` — 400 lines, reads the machine: `sourceDir`, `sourceFolderInUse`, `resolveSourceDir`, `relativeConfigPath`, `sourceFolderName`, `sourceRootOf`, `providerAt`, `everySourceFolderName`, `plannedSourceFolderMove`, `unusedSourceFolderName`, the forwarding-stub marker and the legacy/stub/both resolution. [V]
- **`packages/compile/src/install-layout.ts` does not exist and must not be created.** [V]

The second file's own JSDoc already names this step: _"This is also the module the Codex work extends with the host roles — `userConfigRoot`, `agentsDir`, `skillsDir` — rather than opening a second funnel beside it."_ [R, read 2026-09-20 15:29]

**What it answers today:** the source folder per provider, the config path, the `.agents-inc/` parent, which providers are present under a root, and the whole legacy-name state machine. **It answers none of the host roles**, and the roles are still composed from `CLAUDE_DIR` and `LOCAL_SKILLS_PATH` at **22 executable path-composition lines in 13 files** [V, re-run 2026-09-20; an earlier pass reported 21 from the same grep].

**The roles to add**, each taking the provider as a **required** argument:
`userConfigRoot`, `agentsDir`, `skillsDir`, `skillsPathPrefix`, `pluginsDir(scope)`, `pluginRegistry`, `permissionFiles`, `ownedRoots`, `agentCodec` = {extension, listGlob, hasMarker, validate}. `resolveInstallPaths` (`install-base-dir.ts`) becomes a view of it so its ~20 callers keep working.

**`$CODEX_HOME` is the shape the layout has never had to model.** `installBaseDir(projectDir, scope)` returns one base per scope and `resolveInstallPaths` joins `skillsDir`, `agentsDir` and `configPath` off it [R]. On Codex that breaks: the source pair is `~/.agents-inc/codex/` under `HOME`, while host artifacts are under `$CODEX_HOME` — relocatable, and inherited by every `codex plugin` call we spawn. There are 44 `homedir()` calls across 29 non-test files [V]. The same latent bug exists on Claude today: **nothing in `src/` reads `CLAUDE_CONFIG_DIR` for its own paths**; the only non-test hits pass it to a spawned `claude` [V]. C1 fixes the shape, not every call site.

**Two correctness bugs inside the module to fix here, not later:**

1. **`providerAt` and `sourceFolderInUse` disagree about what "present" means.** `providerAt(root)` is `PROVIDERS.filter((provider) => directoryExists(sourceDir(root, provider)))` [V, install-layout.ts:191-193], so a bare `mkdir -p .agents-inc/codex` gives an empty folder equal standing with a live installation, and every D8 disambiguation prompt fires on a one-provider install. `sourceFolderInUse`, in the same file, applies a four-rung preference order (holds a config → legacy config → holds anything → legacy dir). `providerAt` must answer on the same rungs, or return them ranked.
2. **`providerAt` is blind to the legacy folder.** It never asks about `.claude-src/`, so every pre-rename installation answers `[]`. "The folder says the provider, for all commands, no flag" is false there. `[]` must never be read as "nothing installed"; each command's legacy branch is written down.

**Enforcement, in `packages/cli/eslint.config.js` and `apps/editor`'s.** R1 already banned the source-folder literals `.claude-src` and `.agents-inc` and restricted the `SOURCE_ROOT_DIR` import; C1 adds its own literals **to the same options objects**: `.claude/`, `.codex`, `.agents/skills`, `".md"`, `"*.md"`, `".toml"`, `CLAUDE_DIR`, `LOCAL_SKILLS_PATH`, `PLUGINS_SUBDIR`. Adding them in C1 rather than C4 is what stops a half-routed path shipping with every test green.

**Tests first:**

- a unit spec pinning every Claude role as a literal, and every Codex role, with `CODEX_HOME` both set and unset;
- a spec that runs ESLint through its API against a planted violation and an allowed case in the same file, red before the config changes;
- a spec for `providerAt` against: a live Claude install with an empty `.agents-inc/codex/` beside it; a legacy `.claude-src/` scope; a forwarding stub.

**Verify:** the full suite, the golden trees, lint, `npx tsc --noEmit` and `npx tsc -p e2e/tsconfig.json --noEmit`; the census grep returns only the layout modules and the named exceptions; by hand, init/compile/uninstall in a copy of `/home/vince/dev/cv-launch` under a scratch HOME, diffed against a run from before.

**Docs (codex-keeper):** a layout reference page and its `DOCUMENTATION_MAP` row; `packages/cli/CLAUDE.md`'s "ALWAYS use `resolveInstallPaths`" rule points at the layout; the naming convention for `~/.agents-inc/codex/` (source) versus `~/.agents/skills/` (skills) — two namespaces that differ by four characters.

---

### Step C2 — The provider reaches every path [replaces "the `target` field"]

cli-developer and cli-tester. Runs after C1 and after R3b closes. **Serial: it runs alone.**

**This step no longer adds a config field.** Ruling 1 deleted that design: there is no `target` or `provider` field in `config.ts`, no `packages/compile/src/target.ts`, no loader-schema rows, no `CANONICAL_FIELD_ORDER` or `cleanForEmission` edit, no `config-types-source.ts` edit, no Codex emission scenario, no `mergeGlobalConfigs` carry, no `setConfigMetadata` write, no `installationTarget(config)` — which was circular anyway, since it would read a config that lives inside the provider's folder. **C2 runs no `generate:*` script at all.**

**Where the provider comes from. Three places, in this order, and nowhere else:**

1. **The folder on disk**, per resolved scope. A project can be Codex while the global is Claude, so the answer is per scope, not one per run.
2. **`--provider` on `init --from`** — the only case where the folder does not exist yet.
3. Not from `config.ts`, not from the payload, not from the share id. That is ruling 3, and it is what keeps every existing share id working.

**What `--provider` sets: one thing, which folder this run creates.** It is a _location_ parameter beside `projectDir`, not a config value. It decides four derived things and writes none of them down: the config pair's folder at each scope in play; which `PluginHost` the installer uses; which renderer compile uses; which install roots the layout returns.

**The work is threading, and the proof is a compiler proof.** Every one of the **28 production call sites** that resolves a source folder takes the `DEFAULT_PROVIDER` default today; **zero** pass a provider [V, census command in Corrections]. The module's JSDoc names the method: deleting `DEFAULT_PROVIDER` turns the census into a compiler error apiece rather than a grep. So **C2's proof is: delete `DEFAULT_PROVIDER`, and the package compiles with zero errors.**

**Beyond the 28**, discovery reaches `registerProjectPath`, `propagateGlobalChangesToProjects`, `resolveEffectiveGlobalConfig`, `ensureBlankPair`, `mutateGlobal`, `writeProjectPartial`, `globalPairPaths`, `config-types-io` and `config-merger.ts:238`, which must compare against the **same** provider's path.

**New: `detectInstallations(cwd)`** → `{provider, scope, configPath}[]`, applying today's project-then-global fallback **within each provider**, plus `LoadedProjectConfig.provider`.

**Already built and only needing the parameter:** `config-types-io.ts:53` states _"inherits only from the global of the SAME provider, which is why one `sourceFolderInUse` default…"_ [R] — rename D6 is implemented as a default and becomes an argument here.

**One refusal lands in this step, not in C4:** until the Codex host exists, discovery **refuses a present `.agents-inc/codex/` by name**. Otherwise a hand-planted folder gets Claude-format agents compiled into it with every test green.

**One runtime assertion, because the compile-time proof does not reach everything.** Propagation resolves its destination from a config-derived string, not from a typed parameter, so `DEFAULT_PROVIDER`'s deletion cannot catch it. Assert that the path a propagation writes starts with the source dir of the provider it resolved.

**Do NOT touch** `config-to-seed.ts` or `packages/matrix/src/seed.ts`. The test "config-to-seed of a Codex config equals the Claude one" becomes **"sharing from either folder gives identical payload bytes"**.

**Tests first:**

- delete `DEFAULT_PROVIDER` in the branch and compile clean — this is the step's headline test, and it is red until the last call site is threaded;
- a hand-planted `.agents-inc/codex/` is refused by name, with the paired allowed case (a planted `.agents-inc/claude/`) in the same file;
- `share` from either folder gives byte-identical payloads;
- a Claude global never propagates into a Codex project, and the runtime assertion fires when the path is forced wrong;
- `providerAt` returning `[]` for a legacy scope does not make a command say "not installed".

**Verify:** the full suite and the golden trees; `npx tsc --noEmit` on all three projects; by hand, `doctor`, `list`, `compile` and `edit` over a legacy install and over a migrated one.

**Docs (codex-keeper):** the discovery rules — which scope, which provider, what a legacy scope answers — as a page with its `DOCUMENTATION_MAP` row.

---

### Step C3 — `PluginHost`, `ClaudeHost` and `host-for` [no behaviour change]

cli-developer and cli-tester. **Runs after C2** — they share `init.tsx`, `edit.tsx`, `uninstall.tsx` and `doctor.ts`.

Not started: `packages/cli/src/cli/lib/hosts/` does not exist [V].

**New files** in `lib/hosts/`: `plugin-host.ts`, `claude-host.ts`, `host-for.ts`.

- `Provider` (not `Target`); `host-for.ts` takes it from the folder, via C2's discovery;
- `PluginRemovalOutcome` = removed | absent;
- `HostPlugin` = {pluginKey, installPath, enabled};
- `PluginHost` = {provider, **offeredPlacements**, installsProjectScopedPlugins, isAvailable, marketplaceExists, addMarketplace, refreshMarketplace, installPlugin, uninstallPlugin, listPlugins(dir)}.

**Two members change meaning from the first version:**

- `installsProjectScopedPlugins` stops being a fallback switch and becomes the source of a **refusal**;
- **`offeredPlacements`** is new: the mode/scope cells this host offers — 4 for Claude, 3 for Codex. The refusal then reads data off the host instead of `if (provider === "codex")` in the installer.

**Moving the Claude code:** the `claude*` functions in `utils/exec.ts` move into `claude-host.ts` unedited. `exec.ts` keeps `execCommand` and the validators. `claudePluginMarketplaceRemove` stays a test-only export.

**Install, uninstall and discovery callers** are as the first version lists them, plus `ensure-marketplace.ts`. Unit mocks of `utils/exec` move to the host module; re-derive with `grep -rln 'vi.mock(.*utils/exec' src`.

**Do not try to generalise `exec.ts` by swapping the binary name.** Codex's plugin verbs are `add` / `remove` / `list` / `marketplace {add,list,upgrade,remove}` — not `install` / `uninstall` / `marketplace update` [V]. `claudePluginMarketplaceUpdate` maps to `upgrade`; `claudePluginUninstallBestEffort`'s two-scope retry has **no Codex meaning at all**. Each plugin function needs a per-provider argv builder.

**`ClaudePluginScope` is declared twice** — `packages/cli/src/cli/types/config.ts:14` and `packages/matrix/src/vendor/config.ts:14`, both `"project" | "user"` [V]. Whatever replaces it moves in both, and the matrix copy is browser-side.

**Tests first:**

- a `PluginHost` contract spec run against a fake host and against the real Claude host (only where claude is installed), including: removing a missing plugin returns `absent`;
- `offeredPlacements` answers 4 for Claude, with every cell named;
- an ESLint restriction keeping `claude*` imports inside `hosts/`, with a planted violation.

**Verify:** the full suite including `test:smoke`; the golden trees; `grep -rn "claudePlugin" src/cli --include='*.ts*' | grep -v "hosts/\|__tests__"` prints nothing.

**Docs (codex-keeper):** a hosts page with its `DOCUMENTATION_MAP` row, naming the verb differences so the next reader does not assume a rename works.

---

### Step C4 — The Codex install, behind a hidden flag [the first step that reaches Codex]

cli-tester writes **all** of C4's specs first. Three cli-developer lanes then work on disjoint files:

- **Lane A:** `lib/hosts/codex-host.ts`, `utils/messages.ts`, `update.ts`, `doctor.ts`.
- **Lane B:** `init.tsx`, `edit.tsx`, `base-command.ts`, `install-plugin-skills.ts`, the config-read refusal.
- **Lane C:** `uninstall.tsx`.

**C4a. The Codex host (Lane A).** Runs `codex`, inheriting `CODEX_HOME`, reading only the JSON on stdout.

- **Marketplaces:** `plugin marketplace list --json`, `plugin marketplace add <source> --json`. `add` returns `alreadyAdded`; adding the same name from a different source exits 1.
- **The list shapes differ, and the failure mode is silent.** Claude returns `MarketplaceInfo[]` = `[{name, source, repo?, path?}]`; Codex returns `{"marketplaces":[{"name":…,"root":…,"marketplaceSource":{"sourceType":…,"source":…}}]}` — object-wrapped, `root`/`marketplaceSource`, **no top-level `source`** [V]. `claudePluginMarketplaceList` returns `[]` after a `warn()` on any parse failure [R], and `claudePluginMarketplaceExists` is built on it, so a Codex host reusing that parser reports "marketplace absent" forever: re-added every run, with a doctor row that can never go green. **A spec pins the Codex shape.** Also: Codex ships its own marketplace `openai-api-curated` rooted at `$CODEX_HOME/.tmp/plugins`, so no predicate may assume ours is the only one, or count marketplaces.
- **`installPlugin`:** `codex plugin add <id>@<mkt> --json`. It throws on project scope, since `installsProjectScopedPlugins` is false.
- **`resolvePluginCwd` has no Codex meaning and is dangerous.** Claude routes scope by cwd; Codex has no `--scope` at all [V], and running `plugin add` inside a project writes the switch to the **global** config and silently un-scopes it. **The Codex host pins cwd to the home directory for every `plugin` call, as a stated rule with its own spec** — not as an accident of how a call happens to be written.
- **`listPlugins(dir)`:** `plugin list --json` returns `{installed:[{pluginId, installed, enabled, installPolicy, authPolicy, …}], available:[]}` [V]. Build `installPath` as `<CODEX_HOME>/plugins/cache/<marketplaceName>/<name>/<version>`. Keep `enabled`: disabled plugins still appear in `installed[]`, and "installed but disabled for this project" is therefore detectable.
- **`refreshMarketplace`:** read `marketplaceSource.sourceType`; `upgrade` for a git source, re-add each installed plugin for a local one, because `upgrade` exits 1 on a local source.
- **`uninstallPlugin`:** list from `$HOME`, always run `plugin remove --json` (it also clears orphaned caches), list again; the outcome comes from the **first** list; if the plugin is still listed afterwards, throw.
- Strip the `/tmp` PATH-alias WARNING from any stderr quoted in an error; it appears on every run and exits 0 [V].
- Add `CODEX_CLI_NOT_FOUND`, and make `update`'s `requireClaudeCli` work for either host.

**C4b. The flag and the refusals (Lane B).**

- `init --from <id> --provider codex`, with oclif `hidden: true` until C7b (see below). `init` has exactly three flags today — `marketplace`, `from`, `ui` [V, init.tsx:330-346].
- **`--provider` without `--from` exits INVALID_ARGS**, naming `--from` and the editor URL (D15).
- **`--provider codex` over a Claude installation is no longer refused.** It creates a second installation beside it (rename D8). With two installations present in one scope, `edit`, `uninstall`, `share` and `eject` act on exactly one: they prompt in a TTY and, without one, exit INVALID_ARGS naming `--provider`.

**C4c. The three offered placements (Lane B).** The vocabulary is the existing one — mode ∈ {plugin, eject} (`origin`, `EJECT_SOURCE`), scope ∈ {global, project}. Claude offers four cells; Codex offers three.

| Combination         | What install does                                                                                                                                               | Where it lands                                                                                                                                                              | Refreshed by                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **plugin + global** | `marketplace add`, then `plugin add <id>@<mkt> --json` through the Codex host, cwd pinned to home. Config row keeps `origin: <marketplace>`, `scope: "global"`. | `$CODEX_HOME/plugins/cache/<mkt>/<name>/<version>`, plus `[marketplaces.<name>]` and `[plugins."<id>@<mkt>"] enabled` in `$CODEX_HOME/config.toml`. No registry JSON files. | `update` — re-add against a local marketplace, `marketplace upgrade` against a git one |
| **eject + global**  | copy the skill's files to the global skills dir. `origin: eject`, `scope: "global"`.                                                                            | `$CODEX_HOME/skills/<id>/SKILL.md` (D14)                                                                                                                                    | nothing, by design                                                                     |
| **eject + project** | copy the skill's files into the repo. `origin: eject`, `scope: "project"`.                                                                                      | `<repo>/.agents/skills/<id>/SKILL.md` — a committed file by design, read in that repo and nowhere else, with no plugin, install, marketplace, trust entry or global config  | nothing, by design                                                                     |
| plugin + project    | **refused**, naming the three above                                                                                                                             | —                                                                                                                                                                           | —                                                                                      |

`<repo>/skills/` is **not** read by Codex. Nothing may ever write there.

**Three things this replaces from the first version:**

1. **The three-part warning goes.** It existed because the eject was a silent fallback. The user chose it in the app, and two of its three costs are properties of eject mode that Claude users already live with. The third — Codex cannot see `.agents/skills` from a subfolder of a project with no git repo — is a property of the **repo**, so it becomes a doctor row.
2. **The refusal keeps the existing invariant rather than overriding it.** `install-plugin-skills.ts:16` reads: _"Plugin install intent is inviolable (never fall back to eject) — callers MUST error with this BEFORE config is written, or config.ts gains orphan entries claiming the skill is installed"_ [R, `packages/cli/src/cli/lib/operations/skills/install-plugin-skills.ts`]. The refusal sits in the same pre-flight as `unbackedPluginSkillIds`, errors before any write, and names the three offered combinations. `unbackedPluginInstallError` is the precedent for a message that advises differently by cause.
3. **`.agents/skills/` stops being a special case.** It is what `skillsDir` returns for the Codex provider at project scope, and `eject` writes there through the path it already uses for Claude.

**The refusal must also fire on the read path.** Nothing ties a folder's contents to its name, and ruling 1 forbids the field that would. A user who reads "the folder says the provider" and copies `.agents-inc/claude/` to `.agents-inc/codex/` produces a Codex folder holding a Claude config that never passed through `init`. So one shared `refuseUnofferedPlacements(config, host)` is called from the **config-read** path — `compile`, `edit`, `update`, `doctor` — as well as from `init --from`'s pre-flight.

**C4d — deleted.** "A project whose host differs from the global installation" is delivered by the per-provider folders. Lane B loses `propagate.ts` and the wizard scope lock.

**C4e. Uninstall (Lane C).**

- On Codex, a project uninstall removes no plugins. A global uninstall removes only the plugins of global-scoped rows.
- Counts come from what was observed — the named Claude change, D11(b).
- It removes the provider folder and then `.agents-inc/` **only when empty** (rename D7; R2 already built it, and `sourceRootOf` returns `null` for a legacy scope so the destructive case is unreachable [R]).
- Rename `UninstallTarget` to `UninstallInventory`.

**C4f. Doctor (Lane A).** Codex rows appear only on a Codex installation, and join the Layout rows R3 already added per scope [V, `lib/migration/layout-findings.ts`] rather than duplicating them:

- `codex` is on PATH;
- the marketplace is registered (against the **Codex** JSON shape);
- each configured plugin is installed **and** enabled when listed from the project directory;
- **the project's trust state.** Read `$CODEX_HOME/config.toml` for `[projects."<abs cwd>"] trust_level`. With no entry, a deliberately broken `<repo>/.codex/agents/*.toml` produced **no warning anywhere**; adding `trust_level = "trusted"` produced a doctor row seconds later [CV]. The row says the true thing, which is not "trust the repo": an untrusted Codex project install is **half live** — project skills at `.agents/skills` and `.codex/skills` reach the model with no trust and no config file at all, while sub-agents and plugin enablement do not;
- **startup warnings.** `codex doctor --json` carries a `startup warnings` total plus counters for skills / hooks / plugins / MCP / deprecated. **A malformed agent role bumps the total but leaves every named counter at 0** [V, 2026-09-20] — so the check reads the total and the messages, never a category counter.

For Claude users these rows are absent, not shown as skipped.

**C4g. Agents at this step.** A Codex compile writes no agents yet and prints one line saying so. This is why the flag stays hidden: the first version hid `--target` because Step 7 added a wizard step, and that reason is gone, but between C4 and C5 a Codex install compiles nothing and `--provider` is now the entire CLI surface rather than a test-only one. **It unhides in C7b.**

**Tests first**, in `e2e/lifecycle/codex-*.e2e.test.ts`. Each refusal is paired with an allowed case in the same file.

1. `init --from <id> --provider codex`: plugin skills appear in `codex plugin list --json`; `~/.agents-inc/codex/config.ts` and `<project>/.agents-inc/codex/config.ts` exist; `~/.agents-inc/claude/` and `~/.claude/` are byte-identical by `readTreeSnapshot`, **including when a Claude global already exists**.
2. Compile keeps the plugin skills: no "configured but was not found" warning.
3. One case per offered combination plus the refusal, paired in the same file. `codex debug prompt-input` lists an ejected skill by its **plain name** and a plugin skill as `<id>:<id>`. **Do not pin the root indices** — `r0`, `r1` … are assigned dynamically and reorder as roots appear; across three runs `r0` was `$CODEX_HOME/skills`, then `<repo>/.codex/skills` [CV].
4. The uninstall pair in one file: a project uninstall leaves the global plugins registered; a global uninstall removes them.
5. Removal is reported truthfully, including an orphaned cache.
6. `update` against a local marketplace re-adds and never calls `upgrade`.
7. A second installation is created beside the first with the Claude tree byte-identical; with two present, no-TTY `edit` and `uninstall` refuse and name `--provider`.
8. Across init, edit, compile, uninstall and doctor on Codex, **`.claude/` is never created and `.agents-inc/claude/` is never created**; `.agents-inc/codex/` is expected. This is the check that catches a half-routed path.
9. The refusal fires on the **read** path: a Claude config planted inside `.agents-inc/codex/` is refused by `compile`, not only by `init`.
10. `--provider` without `--from` exits INVALID_ARGS, paired with the working `--from` case.

Unit specs run the Codex host against JSON recorded from 0.155.1.

**Verify:** the full suite and the golden trees; by hand, `node bin/run.js init --from <id> --provider codex` in a scratch HOME/CODEX_HOME, then `codex debug prompt-input`, `codex plugin list --json` and `codex doctor`.

**Docs (codex-keeper):** the three placements and the refusal as a page; the doctor rows in the doctor reference; the trust and half-live explanation in troubleshooting; each new e2e spec gets a row in `packages/cli/.ai-docs/standards/e2e/user-journeys.md` (`spec-gates.test.ts` fails without one).

---

### Step C5 — The Codex agent role renderer, 16 of 18 agents

cli-developer and cli-tester. Runs after C2. Can run alongside C4 Lanes A and B. **It is the only `generate:compile` lane while it runs.**

**Split the template:** `src/agents/_templates/agent.liquid` becomes a frontmatter part and a body part; the Claude render stays byte-identical. Run `generate:compile`; `generate-compile-package.test.ts` gains a Codex twin. Move `withSkillTool` out of `buildAgentTemplateContext` and export a render of the body alone.

**New `packages/compile/src/providers/codex/agent-role-toml.ts`.** Writes TOML with `smol-toml` (D7). The schema is strict — one unlisted key rejects the whole file, as a startup warning only — so the renderer emits exactly:

- `name`, `description`;
- `developer_instructions`: the provenance marker plus the body;
- `model_reasoning_effort`: the same value as `effort` [V, accepted];
- `model`, when the agent sets one [V, accepted — this reverses the first version, which said `model` "either drops the agent or is ignored"];
- `[features] shell_tool = false` when the agent's tools do not include Bash [V, accepted];

It never emits `tools`, `disallowedTools`, `effort`, `reasoning_effort`, `permissionMode`, `isolation`, `experimental` or `skills`-as-a-list. Each rejects the file outright [V].

**What changes in the output:**

- preloaded skills become a "read first" line at the head of the skill list (D9). Re-confirmed: `skills` on an agent role is a bundled-skills **toggle** struct (`{ enabled = true }`), not a preload list [V];
- compile prints **one line** naming the six settings Codex cannot express.

**Losing the summoners touches more than the renderer.**

- **The roster.** 18 agents in `packages/matrix/src/generated/agents.ts` [V]; Codex compiles 16. The e2e assertion "the set of `.codex/agents/*.toml` equals `E2E_STACK_AGENTS` by member" must become provider-aware or it goes red the day Codex compiles.
- **The stacks.** `packages/cli/src/cli/lib/configuration/default-stacks.ts` holds **17** stacks and **all 17 list both summoners** [V, per-stack, not by line count]. So the drop message fires on **every** Codex install. Two consequences: it is **one line covering both agents, printed once** — never once per agent or once per stack; and the 17 stack literals are **not** forked per provider. The filter belongs in the resolver. `packages/matrix/src/read-model/domains.ts:62` already names the six agents with no domain prefix and is a natural home for a provider-aware predicate.
- **Skill assignments are fine.** An earlier pass claimed `assignment-defaults.ts` gives craft bodies to `skill-summoner` by name; it does not — the map is `CRAFT_CATEGORIES_BY_FLAVOR`, keyed on `RoleFlavor`, and the agent names appear only in a comment above it [CV, re-read]. **No edit is needed there.** Still check that compile's orphan warning does not fire for a deliberately dropped agent.
- **`agent-summoner`'s own text.** R2c/R2d made its playbook render the folder from `@@SOURCE_FOLDER@@` — 7 occurrences in `playbook.md`, 1 in `output.md` [V]. On Codex the agent is not installed, so that substitution is never exercised on this provider. Write one spec that renders it for `codex` anyway, so the machinery does not rot against the day the agent comes back.
- **The docs.** `apps/www` sub-agent-anatomy, the roster page and capabilities.md all state the count; each needs a provider caveat.

**Still standing from the rename delta:** `createLiquidEngine` reads local templates from `<sourceDir(provider)>/agents/_templates`; `loadProjectAgents` reads the provider's folder; **`eject` on Codex writes only the body template**, because a Claude-shaped `agent.liquid` must never reach the TOML renderer.

**Other files:** `hasProvenanceMarker` learns where the marker sits in a TOML file; `list-compiled-agents` and `remove-compiled-agents` read the format from the layout's codec; `content-validator.ts` gets a Codex agent validator backed by a new schema.

**Tests first:**

- golden TOML for a writer (web-developer), a no-Bash agent and a read-only agent;
- a TOML round trip: parse the output, compare with the input;
- **the Claude snapshots do not change**;
- a spec asserting each rejected key is absent from every rendered file — the strict deserializer makes this the difference between 16 agents and 0;
- e2e: `codex doctor --json` reports no malformed agent, reading the **total** startup-warning count and the messages, not a category counter [V, the category counters stay 0]; the compiled set equals the provider-filtered roster; the two summoners are absent and one line says why, once.

**Verify:** `generate:compile:check`, the compile vitest and the golden trees; by hand with the mock provider, run `codex exec`, have it start web-developer, confirm `developer_instructions` reach the sub-agent.

**Docs (codex-keeper):** a Codex agent-role reference page listing accepted and rejected keys with the measured evidence, its `DOCUMENTATION_MAP` row; the provider caveat on the three `apps/www` pages that state the agent count.

---

### Step C7a — The web app: this is the feature, not the release

web-developer and web-tester.

Before the ruling, `init --target codex` alone shipped a usable Codex install and the editor work was a release nicety. After it, **the web app is the only producer of `--provider codex`**, so C7a is on the critical path.

- **The provider button.** A Claude | Codex segmented control on the configure screen, using `packages/ui`'s `segmented.tsx`. **Local editor state only.** It never enters a payload, so one saved setup installs on either provider and every existing share id keeps working (ruling 3).
- **The copied command.** `use-install-command.ts` builds `` `${BASE_COMMAND} ${ID_FLAG} ${command.id}` `` from `BASE_COMMAND = "npx agents-inc init"` (:17) and `ID_FLAG = "--from"` (:22), falling back to bare `BASE_COMMAND` when minting failed [V]. Codex appends ` --provider codex` to the **id** command. Under D15 the flag is invalid without an id, so on Codex the mint-failed fallback stays bare and carries a line saying the provider needs the id.
- **The output preview.** It draws `.toml` agents, `.agents/skills` and the source row from the layout, and renders agents with the Codex renderer behind the existing lazy `import()`. The source row stays **one row** (rename D10) and simply reads `.agents-inc/codex/`.
- **Two renderers, one hard budget.** `output-preview.ts` and `install-dialog.tsx` both draw install paths, and `install-dialog.tsx` carries a measured refusal to import the shared name: _"First paint is 490.0 KB gzipped, 146.0 KB over the 344.0 KB budget… assets/compile-…js — 124.7 KB"_ [V, `bunx vite build`, 2026-09-20]. The toggle must move three hand-copied strings across two files, pinned only by `apps/editor/e2e/specs/install-dialog.spec.ts`. Both files are modified in the working tree right now.
- **The skills grid.** plugin+project is a **disabled cell with a reason** on Codex. `isLocalOnlySkill` already gates a cell this way [R].
- **The roster.** The two summoners render **disabled, with the reason** (D18).
- **Notes on screen:** the untrusted-project consequence.

**Tests first:** a new `apps/editor/e2e/specs/codex-provider.spec.ts`, plus visual and a11y captures; **and the payload-identity spec**: the serialized payload bytes are identical with the button either way.

**Verify:** editor vitest with Node 22+ on PATH; the Playwright e2e, visual and a11y suites. Four hosted Argos captures change on their own; someone accepts them in the hosted tool.

**Docs (codex-keeper):** the editor's provider button in `apps/www` install-and-share and the configure-screen page; the note that the provider is not saved with a stack.

---

### Step C7b — Release: unhide, journeys, docs, trackers

cli-developer, codex-keeper, orchestrator. Runs after C7a.

- **Unhide `--provider`** on `init --from` (and as a disambiguator on `edit`, `uninstall`, `share`, `eject`).
- **The dashboard** gains a provider row, shown only when more than one installation is present.
- **User journeys:** a row in `packages/cli/.ai-docs/standards/e2e/user-journeys.md` for each Codex spec; a journey in `e2e/handrun-journeys.ts` — a Codex uninstall leaving Claude untouched; run `node scripts/handrun.mjs`.
- **The hand-run, end to end**, in a scratch HOME/CODEX_HOME: local editor → copy the command → `node packages/cli/bin/run.js init --from <id> --provider codex` → the Codex TUI with the mock provider → `doctor`, `update`, `uninstall`.
- **Docs (codex-keeper):** `apps/www` `reference/commands.md`, `concepts/install-modes.md`, `recipes/share-with-a-teammate.md`, `configuration/scopes-and-paths.md`, config-reference and sub-agent-anatomy; `.ai-docs` pages for the hosts and the layout, each with a `DOCUMENTATION_MAP` row.
- **Trackers (orchestrator only):** the plan file, a progress row per dispatch with its corrections, rows in `todo/cli.md`, `editor.md` and `www.md`, archive lines, ROADMAP.

**Verify:** every CLI suite; the editor suites; the golden trees; the hand-run verdicts.

---

## What can run in parallel, and why

There is **one build and one test suite in `packages/cli`**, no worktrees, and only one lane may run `generate:*` at a time. So lanes are separated by the files they own, and a lane that runs a generator owns that generator alone.

| Lanes                               | Can they run together? | Why                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C2** ‖ anything in `packages/cli` | **No — C2 runs alone** | It reaches `propagate.ts`, `config-gate/index.ts`, `config-merger.ts`, `local-installer.ts` and every command file. This **reverses the first version**, which ran Step 2 and Step 3 concurrently: Step 2 stopped being a generate lane and became a command-threading lane, so it now collides with Step 3. |
| **C3** ‖ **C2**                     | **No**                 | Both reach `init.tsx`, `edit.tsx`, `uninstall.tsx`, `doctor.ts`. C2 first.                                                                                                                                                                                                                                   |
| **C4 Lane A** ‖ **Lane B** ‖ **C5** | Yes                    | Lane A owns `codex-host.ts`, `update.ts`, `doctor.ts`; Lane B owns `init.tsx`, `edit.tsx`, `install-plugin-skills.ts`; C5 owns `agent-source.ts` and the renderer. **C5 is the only `generate:compile` lane while it runs**, and no C4 lane runs a generator.                                                |
| **C7a** ‖ any CLI lane              | Yes in principle       | Different package, separate suite. In practice C7a is last but one, so nothing is left to pair it with.                                                                                                                                                                                                      |

**Programme order.** R3b closes first — it is in flight, with 5 blocking items open against `doctor.ts`, `config-gate/**` and four repo index gates, and C2 reaches all of them.

1. **C1**
2. **C2** alone
3. **C3**
4. **C4 Lanes A+B** ‖ **C5**; **C4 Lane C**
5. **C7a** → **C7b**

## Owner decisions

Each has a recommendation. Superseded decisions keep a summary of what they used to say — corrections are recorded, not overwritten.

**D1. A Codex project on a machine whose global installation is Claude.**

- **SUPERSEDED 2026-09-19/20 — the folder is the rule.** It previously said: allow it per project, and such a project inherits no global rows, is not added to `projects`, is skipped by propagation and is locked to project scope, with the named limit "only one host per HOME can own the global installation". All of that falls away. `~/.agents-inc/claude/` and `~/.agents-inc/codex/` sit side by side; each provider family inherits and propagates only within itself; the named limit is deleted.
- **Owner's words, 2026-09-19:** _"One project can be on Codex and the other can be on Claude. It should be per project basis."_ Still true; the mechanism changed, not the answer.

**D2 / D11(a). A provider step in the wizard.**

- **SUPERSEDED 2026-09-20 by the owner: there is no wizard step.** It previously said: show a provider step always, with Claude preselected, at a cost of one extra Enter for Claude users, then revised to a toggle on an existing screen, then revised again to "the target is per scope, one toggle per run".
- **Owner's words, 2026-09-20:** _"we will offer global plugin skills, and project and global eject skill options with codex. this can be a simple button in the web editor. the cli flow itself doesn't need to handle codex only has to be able to install it using --from etc."_
- **What stands:** the provider is chosen in the **web app** only. The CLI must install what the app produced — `init --from <id> --provider codex` — and nothing more. Claude's interactive flow is untouched. D11(a)'s "one extra Enter" is not a Claude-visible change any more, because it never happens. `step-provider.tsx`, the `wizard.tsx` / `wizard-tabs.tsx` / `wizard-store.ts` edits and `InitWizard.launchWith` absorbing a new step are all deleted from the plan.

**D3. Skills on Codex: which placements are offered.**

- **RULED 2026-09-20 by the owner: the user chooses, nothing falls back silently.** _"If you cannot install skills in project scope for Codex using plugins, maybe we should let users choose between global plugins or global eject or project eject."_ Three combinations are offered — plugin+global, eject+global, eject+project. Plugin+project is not offered in v1, and a shared config asking for it is **refused naming the three**, never quietly ejected.
- **The premise was wrong and the ruling stands anyway** — see premise 1 at the top. The first version's recommendation ("eject them into `.agents/skills` with a three-part warning… this overrides the note 'never fall back to eject', so it needs your explicit yes") is superseded: the rule is **kept**, not overridden, because nothing is ejected that the user did not choose.
- **Recommendation:** ship the three, and leave plugin+project to a later release when per-project installation exists.

**D6. Pin `@openai/codex` as a devDependency.**

- **DONE.** Exactly `"0.155.1"` at `packages/cli/package.json:137`, no caret [V].

**D7. The TOML serializer.**

- **ADOPTED:** `smol-toml` in `packages/compile`. It runs in the browser and both writes and parses, which the round-trip tests need.

**D8. `skill-summoner` and `agent-summoner` on Codex.**

- **RULED 2026-09-20 by the owner: "Leave them out for v1."** Codex installs ship without them; the CLI says why when a stack lists one — which is every stack.
- **A correction to the recorded reason, so nobody reopens the ruling by "fixing" it.** The stated reason is that Codex's sandbox makes the folders they write to read-only. Measured: under `:workspace`, `.agents-inc/` and `.agents-inc/codex/agents/` are **writable**, while `.agents/skills` and `.codex/agents` are read-only [SV]. So the reason holds directly for `skill-summoner`, and only indirectly for `agent-summoner` — it can author into the writable source folder but cannot compile into the read-only `.codex/agents/`, which we now know is Codex's real agent directory, trust-gated rather than absent. **Record the ruling's reason as "left out for v1; roster mechanics on Codex not yet proven."** The ruling stands; this is not a re-litigation.

**D9. Preloaded skills.**

- **ADOPTED:** a "read first" line at the top of the agent's skill list.
- **Re-confirmed by measurement:** `skills` on a Codex agent role is a bundled-skills toggle struct, not a per-agent preload list [V]. There is nothing better to use.

**D11. Sign off on the Claude-visible changes.**

- **(a) DROPPED.** "One extra Enter in the wizard" cannot happen — there is no wizard step.
- **(b) Stands:** uninstall stops counting plugins as removed when the `claude` binary is missing, because it now reports what it observed.
- **(c) Added by the rename:** the config moves, the project `config-types` import gains a level, four CLI messages change, and `agent-summoner`'s compiled text changes.
- Nothing else changes for Claude users, and the Step 0 golden trees prove it — measured against the R2 re-record, not against the pre-rename bytes.

---

_The decisions below are new. Each was opened by something measured after the first version was written._

**D12. Do Codex installs ship sub-agents in v1, now that we know they can?**

- **Recommendation: yes.** `$CODEX_HOME/agents/<n>.toml` (global, no trust needed) and `<repo>/.codex/agents/<n>.toml` (project, trust required) are agent role definition files with a strict schema [V]. C5 becomes a real renderer rather than "no expression exists". The alternative — shipping skills only and rendering sub-agents as Codex skills — changes what a sub-agent **is** and would make the two providers' output incomparable. If it is ever wanted, it is its own decision, not a fallback.

**D13. Given `<multi_agent_mode>`, what makes Codex actually use the roster?**

- Codex's orchestrator is told not to delegate, and `spawn_agent`'s `agent_type` says _"Omit unless explicitly asked."_ [CV]. Sixteen installed roles are inert by default. Options: (a) ship v1 knowing the roster is opt-in and say so; (b) write or append a line to the user's `AGENTS.md`; (c) carry the instruction in a preloaded skill — `<multi_agent_mode>` names **skill instructions** as an authority, and D9's "read first" line already establishes the mechanism.
- **Recommendation: (c).** It keeps us out of the user's `AGENTS.md` and reuses a lever the product already has. This is a product decision and belongs beside D8, not buried in C5.

**D14. Which global skills root does eject+global write to?**

- Both work: `$CODEX_HOME/skills` and `~/.agents/skills` are among the roots Codex hands the model, along with `<repo>/.codex/skills`, `<repo>/.agents/skills`, `$CODEX_HOME/skills/.system` and `$CODEX_HOME/plugins/cache/<mkt>` [CV, `codex debug prompt-input`]. `<repo>/skills/` is **not** read.
- **Recommendation: `$CODEX_HOME/skills`.** Uninstall and doctor have to agree with where Codex is actually reading, and it moves with the env var wherever the user puts it; `~/.agents/skills` is a shared namespace we do not own. **Consequence to see:** this makes `$CODEX_HOME` a first-class input to the layout, which is C1's largest piece of work. There is no constant for a global Codex skills directory today [V] — C1 adds it, with a mirror row.

**D15. What does `init --provider codex` do with no `--from`?**

- **Recommendation: exit INVALID_ARGS**, naming `--from` and the editor URL. It is what "the wizard gains nothing" means, and it makes "the interactive flow is Claude-only" provable rather than conventional. It also gives the D3 refusal something to refuse **before** anything is written: with `--from` required, the provider always arrives beside a payload we can pre-flight against the host's offered placements. A wizard-produced Codex config would reach the refusal only after the wizard had been walked.
- **Consequence to see:** the editor's mint-failed fallback is bare `npx agents-inc init` with no id [V]. On Codex that fallback stays bare and carries a line saying the provider needs the id.

**D16. Keep `--target` as a hidden alias for `--provider`?**

- **Recommendation: no.** `--target` never shipped — `init` has exactly `marketplace`, `from` and `ui` today [V] — and the flag was always to stay hidden until a step that has not run. An alias for a flag nobody has is pure cost, and the folder name, the owner's own wording and rename D9 all say "provider". _(This overturns rename D9's "Keep `--target` as a hidden alias", which was written before it was clear the flag had never been built.)_

**D17. Can `edit --from --provider codex` convert a Claude installation to Codex?**

- `--provider` on `edit --from` is otherwise a pure **disambiguator**: it picks which installation to act on when a scope holds both folders.
- **Recommendation: no conversion.** Switching provider means `uninstall`, then `init --from --provider <new>`. The installed output differs in format and location, so a convert path would have to delete the other provider's output — the one operation in this programme that can destroy work the user did not ask us to touch. Saying "uninstall, then init" costs one sentence in the error and removes the whole class.

**D18. The two summoners in the web app on Codex: hide them, or show them disabled with a reason?**

- All 17 shipped stacks list both [V], so this is on every screen.
- **Recommendation: show them disabled, with the reason.** Hiding makes every stack's roster silently shorter on one provider, and a user toggling Claude → Codex watches agents vanish with no explanation. It also keeps the payload honest: ruling 3 requires a provider-neutral payload, so the app writes both agents either way and the CLI drops them at install with one line. A later release re-enabling them then needs no payload change and no new share id.

**D19. One marketplace for both providers, or two?**

- A Codex-shaped marketplace is not necessary: 0.155.1 reads `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` unchanged [V]. But Codex's own bundled `plugin-creator` skill tells authors a Codex plugin has _"a required `.codex-plugin/plugin.json`"_ [V], so the path we are using is a compatibility shim, not the documented native one.
- **Recommendation: ship ONE local marketplace**, generated by the existing code, registered with `claude plugin marketplace add` or `codex plugin marketplace add` depending on the folder. This deletes a planned Codex manifest writer and its goldens.
- **The cost, to accept knowingly:** we depend on Codex continuing to read a competitor's manifest name. **The smoke lane gets a test that fails loudly the day it stops** — that test goes in whichever way this is decided.

## Risks

**Risks that stop the feature working without anyone noticing**

1. **The roster is inert by default, and the agents are the product.** On Codex the agents act only when the orchestrator passes `agent_type`, and the system prompt tells it not to. No run against a real model has measured this.
   - Mitigation: D13.
   - **A flat result here is a finding, and gets reported as one.**
2. **An untrusted Codex project install is half live.** Project skills reach the model with no trust entry and no config file; sub-agents, plugin enablement, MCP servers and hooks are ignored **in total silence** [V]. The doctor row must say exactly that, not "trust the repo".
3. **Half-routed paths.** A path that bypasses the funnel ships a half-built provider while every test passes. Mitigation: the lint restrictions **added in C1, not C4**; the census grep; and the C4 check that `.claude/` and `.agents-inc/claude/` are never created on a Codex run.
4. **C2's headline proof is a compile-time proof only.** "Delete `DEFAULT_PROVIDER`, get zero errors" catches TypeScript callers. It does not catch a path built by string join, and propagation is a live example: it resolves its destination from a config-derived string, and both `propagateGlobalChangesToProjects` and `writeProjectPartial` take the default today [V]. Mitigation: the runtime assertion in C2, plus the literal ban covering `.codex`, `.agents/skills` and `.toml`.
5. **A defaulted provider on the host funnel would reproduce the same class one level down.** `resolveInstallPaths(projectDir, scope)` defaults `scope` and has ~20 call sites, and `installation.ts` composes the same two roles a second time. If the host roles take an optional provider with a default, a missed call site writes into `.claude/` with exit 0. **The host roles take the provider as a required argument.**
6. **`providerAt` is not airtight, and three commands depend on it.** An empty folder wins equal standing with a live installation; the legacy folder is invisible to it; and `getProjectConfigPath(dir)` takes no provider at all today, so with both folders present every command silently acts on Claude **right now**. C1 fixes the first two and C2 the third, and that is why C2's proof must land before any Codex folder can be created anywhere.
7. **The marketplace-list parser fails silently in the direction that looks fine.** `claudePluginMarketplaceList` returns `[]` after a `warn()` on any parse failure [R], and the Codex shape is object-wrapped with different field names [V]. Reusing it means "no marketplaces" forever: re-added every run, doctor never green. One-line mistake, silent symptom.
8. **Codex's skill-root indices reorder between runs.** Across three runs `r0` was `$CODEX_HOME/skills`, then `<repo>/.codex/skills` [CV]. A golden pinning `r0/<skill>/SKILL.md` is flaky. Assert the plain name (ejected) and `<plugin>:<skill>` (plugin).
9. **`codex doctor`'s category counters do not count everything.** A malformed agent role bumps the `startup warnings` total and leaves `startup warning skills / hooks / plugins / MCP / deprecated` at 0 [V, 2026-09-20]. A check written against a category counter passes on a broken install.

**Risks of destroying user data or giving wrong answers**

10. **`codex plugin add` from a project cwd silently un-scopes the switch into the global config** [V premise]. The Codex host pins cwd to home for every plugin call, with a spec. We can read the after-state but not the user's later invocation, so the CLI also says once that running it by hand re-enables globally.
11. **Project uninstall must never ask Codex's user-wide plugin list.** If it did, it would remove every global plugin, for every project. The C4e scope rule and the paired spec guard against this.
12. **`codex plugin remove` always exits 0** and also deletes orphaned caches that `list` does not show. The outcome is classified from the list taken **before** the removal.
13. **A plugin switch survives a clone; trust does not.** `<repo>/.codex/config.toml` is committed so the enable/disable travels, but trust lives in the cloner's global config, so a clone silently reverts to the global default. Sayable once at install; not detectable.
14. **Ejected copies lose their plugin link.** A Claude → Codex → Claude round trip turns plugins into ejected copies and `update` stops refreshing them. That is now a chosen placement rather than a silent fallback, which makes it honest, not harmless.

**Risks from how far the evidence goes**

15. **All runtime evidence is Codex 0.155.1 against a scripted Responses mock.** Assumed, not observed: the model's handling of `xhigh`/`max` effort, and real-API behaviour. The Codex docs disagree with its source about effort values.
16. **Codex output formats may change** — the cache layout, the `list --json` fields, trust keys, hash rules, and the `.claude-plugin/` compatibility path (D19). Mitigation: the exact pin, parsing only `--json`, recorded JSON fixtures, the live smoke lane, and D19's tripwire.

**Coordination risks**

17. **Preview/install parity on the dropped summoners.** Ruling 3 forces a provider-neutral payload, so the app **must** write the summoners and the CLI **must** drop them — a deliberate divergence between preview and install, exactly the class the parity guard exists to prevent. The guard needs a provider-aware exemption **stated as such**, or someone will "fix" it by making the payload provider-specific, which breaks ruling 3.
18. **R3 is in flight and owns three files C2 needs.** Dispatch 13 has 5 blocking items open against `doctor.ts`, `config-gate/**` and four repo index gates. Starting C2 before R3b closes means two lanes in `doctor.ts`.
19. **The drop message fires on 17 of 17 stacks.** Emitted per agent per stack rather than once per install, every Codex install opens with noise. Measured, not guessed [V].
20. **Two editor renderers with a hard budget between them.** `install-dialog.tsx` carries a measured refusal to import the shared name (124.7 KB chunk against a 344.0 KB first-paint budget). The provider toggle moves three hand-copied strings in two files, pinned only by one spec. Both files are modified in the working tree right now.
21. **The funnel files are untracked.** Both show `??` in `git status --porcelain` [V]. Another lane is editing `packages/cli` as this is written. Every reference to them here quotes content rather than a line number, and the orchestrator should re-grep before assigning work.
22. **Name collision.** The docs agent `codex-keeper` shares a word with the Codex provider. Say "the Codex host" or "the Codex provider" consistently.
23. **Environment leakage.** Something wrote to the real `~/.codex/tmp/arg0` on 2026-09-19 before any lane was dispatched. Every Codex call pins `HOME` and `CODEX_HOME`. (Narrowed since: Codex writes `$CODEX_HOME/tmp/arg0` on start only when `CODEX_HOME` is outside the temp dir; under `/tmp` it refuses and writes nothing.)

**Risks deleted from the first version**

- _"The global merge drops `target`."_ — there is no field to drop.
- _"An older CLI reads a Codex config as Claude."_ — it does not; it adopts the global installation, and the rename's forwarding stub is what stops it.
- _"Project uninstall could remove global plugins"_ is folded into 11.

## Corrections to the brief (a required field)

**Provenance of this pass.** I read `/home/vince/dev/cli` and ran `grep`, `find`, `sed`, `cat`, `ls`, `stat` and read-only `git rev-parse` / `git status --porcelain`. **I changed no file in that repo, ran no build, ran no test suite, and ran no git write command.** HEAD is `97991ecacd4682aefd08d4ce9b9eb8a0a0482ab7`; the working tree held **266** entries at 15:26 CEST, all belonging to other lanes. Everything I created is under `scratchpad/codex-replan/synth/`. My Codex runs used `env -i PATH=<fnm v23.10.0 bin>:/usr/bin:/bin HOME=<scratch>/home CODEX_HOME=<scratch>/home/.codex node /home/vince/dev/cli/node_modules/@openai/codex/bin/codex.js doctor` — note the **root** `node_modules`, not `packages/cli/node_modules`. The real `~/.codex` mtime was `2026-09-18 21:53` before and after.

**Census command, for the record** (run 2026-09-20 in `/home/vince/dev/cli`, read-only):

```
grep -rn "sourceFolderInUse(\|sourceRootOf(\|relativeConfigPath(\|sourceFolderName(\|unusedSourceFolderName(\|resolveSourceDir(\|providerAt(\|plannedSourceFolderMove(" packages apps --include='*.ts' --include='*.tsx' \
  | grep -v node_modules | grep -v __tests__ | grep -v '\.test\.' | grep -v "install-layout.ts:"
```

→ **28 lines**, of which **0** pass a provider argument [V].

1. **The first version's Step 1 says "create `packages/compile/src/install-layout.ts`".** That file does not exist and must not be created [V]. R1 split the funnel differently: `packages/compile/src/source-layout.ts` (browser-safe, 50 lines) and `packages/cli/src/cli/lib/installation/install-layout.ts` (400 lines). C1 **extends** the second.
2. **The cross-cutting guarantee ":45 the Step 0 Claude golden trees stay byte-identical" was already false when this replan began.** R2 re-recorded them against a predicted 20-key / 4-import diff. The rename plan's amendment is the true statement and replaces it above.
3. **"Step 2 is the only `generate:*` lane while it runs" is no longer true, and the opposite constraint appears.** C2 runs no generator; it became a command-threading lane, which is why **C2 and C3 can no longer run in parallel**. The first version's wave table has them concurrent. This reverses.
4. **The "hidden until Step 7" reasoning is stale.** The reason was the wizard step, which is gone. The flag still needs hiding, for a better reason: between C4 and C5 a Codex install compiles no agents, and the flag is now a user-reachable surface rather than a test-only one.
5. **The first version says Step 5 emits `model_reasoning_effort` and "never emits … `hooks`, `sandbox_mode`, … or `model`. Each of these either drops the agent or is ignored."** Measured key by key against `codex doctor`'s startup-warning row [V, 2026-09-20 15:33 CEST]: `model`, `model_reasoning_effort`, `sandbox_mode`, `approval_policy`, `instructions`, `hooks`, `[features] shell_tool` and `skills` as a struct are all **accepted**; `reasoning_effort`, `effort`, `disallowed_tools`, `tools` as an array and `skills` as an array of strings are **rejected, and the whole file is dropped**. So `model_reasoning_effort` was right, and the "never emits" list was wrong about `model`, `hooks` and `sandbox_mode`.
6. **A new measured fact neither mapping pass nor the critic recorded:** a malformed agent role bumps `codex doctor`'s **total** `startup warnings` but leaves every named category counter (`skills`, `hooks`, `plugins`, `MCP`, `deprecated`) at **0** [V]. C5's acceptance checks read the total and the messages.
7. **"Step 5 loses two agents" understates the roster effect.** All **17** shipped stacks list both summoners [V, checked per stack block, not by line count — a line count cannot tell 17 stacks with one each from 16 with two]. There is no Codex install that avoids the message, so it must be one line printed once, and the filter lives in the resolver rather than in 17 forked stack literals.
8. **One mapping pass claimed `assignment-defaults.ts` names `skill-summoner` and gives it craft bodies.** It does not — the map is `CRAFT_CATEGORIES_BY_FLAVOR`, keyed on `RoleFlavor`; the three agent names appear only in a comment [CV]. **No edit is needed there**, and this plan does not schedule one.
9. **Three file paths a mapping pass gave wrongly, corrected here because the plan assigns ownership by them** [V]: `default-stacks.ts` is `packages/cli/src/cli/lib/configuration/default-stacks.ts`, **not** under `packages/matrix/src/generated/` (which holds only `agents.ts`); `install-plugin-skills.ts` is `packages/cli/src/cli/lib/operations/skills/install-plugin-skills.ts`; `agent-summoner` lives under `packages/cli/src/agents/meta/agent-summoner/`.
10. **The "~18 files" table in the first version is both stale and the wrong unit.** Re-derived 2026-09-20: **22** executable path-composition lines across 13 files (one pass reported 21 from the same grep), 7 spawn sites inside one module, one scope vocabulary declared twice, and two editor renderers that a measured bundle budget forbids from sharing the CLI's answer. Counting files understates the `exec.ts` concentration and overstates the rest.
11. **Codex's plugin verbs are not Claude's** — `add` / `remove` / `list` / `marketplace {add,list,upgrade,remove}` against our `install` / `uninstall` / `marketplace update` [V]. `exec.ts` cannot be generalised by swapping the binary name.
12. **`codex --help` lists a `codex agents` command — it is not a roster lister.** It browses _"all agent sessions on the shared local app-server daemon"_. The roster is visible only in `spawn_agent`'s parameter schema, so the only way to assert on it is a mock-backed `codex exec`, not a `--json` command. Naming trap for a later session.
13. **`mkdir .git` still does not satisfy `codex exec`**; it needs `--skip-git-repo-check`. And `fnm use 23` fails in this shell (multishell symlink) — prepend `~/.local/share/fnm/node-versions/v23.10.0/installation/bin` to PATH instead. The default `node` here is 18.20.8 and the Codex launcher throws a syntax error on it.
