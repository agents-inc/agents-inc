---
last_validated: 2026-07-30
---

# Test Data

How to set up the world before a test runs.

---

## ProjectBuilder Is the Only Way to Create Projects

Never inline `mkdir` + `writeFile` to build a project directory in a test file. Use `ProjectBuilder` static methods. Each returns a `ProjectHandle` (`{ dir: string }`) that matchers, `CLI.run()`, and wizards all accept.

### When to Use Each Method

All 9 static factories:

| Method                                                | Returns                  | Use When                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectBuilder.minimal()`                            | `ProjectHandle`          | Compile tests. Creates config + 1 skill (`web-testing-vitest`).                                                                                                               |
| `ProjectBuilder.editable(options?)`                   | `ProjectHandle`          | Edit wizard tests. Creates config + skills + agents dir. `EditableOptions`: `skills`, `agents`, `domains`, `stack`, `forkedFrom`, `globalSkills`, `unresolvableSkills`.       |
| `ProjectBuilder.dualScope(options?)`                  | `DualScopeHandle`        | Dual-scope non-interactive tests. Creates `globalHome` + `project` with separate configs. `DualScopeOptions`: `globalSkill`, `projectSkills`, `projectStack`, `projectSkill`. |
| `ProjectBuilder.dualScopeWithImport()`                | `DualScopeHandle`        | Dual-scope state for import/migration flows — the worked example of encapsulating complex setup in a factory rather than inlining it.                                         |
| `ProjectBuilder.withCustomSkill()`                    | `ProjectHandle`          | Custom skill validation. Creates config + config-types.ts + custom skill with `custom: true`.                                                                                 |
| `ProjectBuilder.pluginProject(options)`               | `ProjectHandle`          | Plugin mode tests. Creates config with marketplace source, skills, agent stubs. `omitMarketplaceField` simulates a legacy install that never persisted the marketplace.       |
| `ProjectBuilder.localProjectWithMarketplace(options)` | `ProjectHandle`          | Eject mode with marketplace field in config. Skills have `source: "eject"`.                                                                                                   |
| `ProjectBuilder.globalWithSubproject()`               | `{ globalHome, subDir }` | Global installation tests. Creates global config + skill + empty subproject dir.                                                                                              |
| `ProjectBuilder.installation(dir)`                    | `void`                   | Minimal install detection. Writes config.ts into existing dir. Unlike others, does not create a temp dir.                                                                     |

**`editable({ globalSkills })` records extra `scope: "global"` entries in the PROJECT config** with no disk copy — they model skills inherited from the global install. In a project-scope edit they render as inherited, locked (readOnly) Sources rows.

**`editable({ globalSkills })` pins BOTH halves of the pair to `source: "eject"`.** A spec that presses `s` to collapse `[P][G]` to `[G]` cannot use it: `wouldOverwriteGlobalEject` refuses the project->global press for an eject-over-eject pair with no tombstone, so the spec fails on a swallowed keystroke rather than on its assertion. Give at least the global half a non-eject source and build that config directly. See [anti-patterns.md § Fixture Selection](./anti-patterns.md).

**`editable({ forkedFrom: true })`** writes `FORKED_FROM_METADATA` as each skill's `metadata.yaml`, marking them CLI-managed so `uninstall` removes them instead of skipping them as user-created.

**`editable({ unresolvableSkills })` / `pluginProject({ unresolvableSkills })` record config entries with NO files on disk.** That is how a project genuinely reaches "the wizard cannot resolve this skill": the session's source does not carry it and the install has no copy. Installing it with a deliberately broken `metadata.yaml` does NOT produce that state and must not be used to fake it — a local skill whose `metadata.yaml` describes it is merged into the matrix and offered like any other, and `compile` hard-errors on one whose `metadata.yaml` does not.

**When 3+ tests share a setup pattern not covered by these methods, add a new `ProjectBuilder` method rather than duplicating setup logic across test files.**

---

## A Fixture Writes Content the Product Could Have Written

A fixture that writes a file no product path produces cannot fail for a reason the product has — and it will pass or fail for reasons the product does not have, which is worse. `renderMetadataYaml` therefore fills the four fields `localRawMetadataSchema` requires (`displayName`, `slug`, `category`, `domain`) whenever the caller does not name them; a `metadata.yaml` without them describes no skill, and `compile` refuses the run over one.

- **Never write an incomplete `metadata.yaml` by omission.** `renderIncompleteMetadataYaml(fields, ["category"])` is the only way to produce one, and it exists so an error-path fixture has to ask for the breakage by name.
- **Never fake an error state with unrealistic content when a realistic setup produces the same state.** 82 of 100 `renderMetadataYaml` call sites once wrote metadata no product path produces; six specs across four files turned out to depend on that, having made a skill "unresolvable" by installing it with metadata the loader could not use.
- **A fixture writer that already holds a field must write it.** Two writers dropped `category`, `slug` and `displayName` that their own `TestSkill` carried.

See `.ai-docs/agent-findings/2026-08-08-parseable-but-incomplete-skill-metadata-still-splits-the-two-compile-passes.md`.

## DRY for Setup

If you find yourself writing the same `mkdir` + `writeFile` + `writeProjectConfig` sequence in multiple test files, it belongs in `ProjectBuilder` or a fixture helper.

Signs you need a new `ProjectBuilder` method:

- 3+ files write the same directory structure
- Setup logic spans more than 5 lines

Signs you need a fixture helper (not `ProjectBuilder`):

- The setup involves running wizard interactions to reach a state
- The setup is lifecycle-specific (multi-phase with shared state)

---

## Source Fixtures

The E2E source is an expensive fixture (creates 10 skills, 2 agents, 1 stack, templates on disk). Create it once per `describe` block and share across tests.

**`createE2ESource(options?)`** -- Creates a full skills source with:

| Content   | Details                                                                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10 skills | `web-framework-react`, `web-testing-vitest`, `web-state-zustand`, `web-framework-vue-composition-api`, `web-state-pinia`, `web-testing-visual-regression`, `api-framework-hono`, 3x `meta-{methodology,reviewing}-*` |
| 3 domains | web, api, meta                                                                                                                                                                                                       |
| 2 agents  | web-developer, api-developer                                                                                                                                                                                         |
| 1 stack   | "E2E Test Stack"                                                                                                                                                                                                     |
| Templates | `agent.liquid` template                                                                                                                                                                                              |

Returns `{ sourceDir, tempDir }`. The `tempDir` is the parent -- clean it up in `afterAll`.

**`createE2EPluginSource(options?)`** -- Extends the above by building plugins and generating `marketplace.json`. Returns `{ sourceDir, tempDir, marketplaceName, pluginsDir }`.

### The fixture's cardinality is smaller than production's, and that changes bug signatures

**One stack and ten skills, against a real marketplace carrying a dozen stacks and many more skills.** For most specs this is irrelevant. For any spec about **overflow, clipping, scrolling, or column geometry** it is the central fact, because how far a size-dependent defect reaches scales with list length — and it is currently discoverable only by reading `e2e/helpers/create-e2e-source.ts`.

Worked example. The stack step bled at the advertised minimum height: the six-row ASCII logo starved the list's viewport below `SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS`, the shared scroll gate stopped clipping, and rows painted over whatever was below. Against the real marketplace at 100x20 the overpaint reaches the footer:

```
SPACE  selectSt ENTER  continuele ESC  backuth, Vitest
```

so "assert the footer renders as one unbroken line" is the obvious signature — a bleed leaves every hotkey word present but splices list content between them. Against the fixture, with one stack, the list is three rows in a one-row viewport, so the overflow is **two rows**: it destroys the stack row and stops well short of the footer. **The footer assertion was green against the unfixed binary.** The one that went red was an unrelated-looking positive, `toContain(E2E_STACK_NAME)`.

Consequences for spec authors:

- A spec written against the symptom you observed while driving the **real** binary may assert nothing under this fixture. Mutation-verify it (revert the fix, rebuild, confirm red) — see [README § Critical Rules](./README.md).
- Keep both assertions when both are genuine, and record inline which one carries the red here, so the next reader does not simplify the spec down to the one that does not fire.
- Reaching for `--source` against the real marketplace is not the fix: it trades a reproducibility problem for a network one. State the cardinality's effect instead.

See `.ai-docs/agent-findings/2026-07-31-e2e-fixture-smaller-than-production-changes-the-bug-signature.md`.

### What a default install takes, and what is left to add

A default install (`completeWithDefaults` / `completeWithLocalSources`) takes the stack's roster —
**seven** of the ten skills: react, vitest, zustand, hono, research-methodology, reviewing,
cli-reviewing. Three are left, and only one of them can be ADDED by a later edit:

| Left behind                         | Addable by an edit?                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `web-testing-visual-regression`     | **Yes** — `web-testing` is not exclusive, and no agent's stack claims it      |
| `web-state-pinia`                   | No — exclusive alternate of `web-state-zustand`; Space swaps, it does not add |
| `web-framework-vue-composition-api` | No — exclusive alternate of `web-framework-react`; same                       |

A spec whose subject is "an edit adds a skill" must use the spare. Pressing Space on an exclusive
alternate is a swap whose net effect on a count is zero, which is how `init-then-edit-merge` spent
its whole life passing over an edit that did nothing — see
`.ai-docs/agent-findings/2026-08-08-init-then-edit-merge-cannot-add-a-skill.md`.

### Before Extending Fixtures

Before adding a new skill, agent, stack, or mapping to `createE2ESource` / `createE2EPluginSource`, grep the fixture for the entity you're being asked to add. The canonical inventory (10 skills, 2 agents, 1 stack -- see the table above) is defined in `e2e/helpers/create-e2e-source.ts` and already covers most mixed-domain and multi-skill-per-agent scenarios.

- Grep/read the fixture first. If the entity (skill ID, agent name, skill-to-agent mapping) is already present, skip the extension and note it in the report.
- Only extend when genuinely absent. Redundant fixture data obscures the fixture's actual contract and confuses later readers.
- Prefer reusing existing entries (e.g. `web-state-zustand` on `web-developer`) over adding a parallel one.

### Source Sharing Convention

```typescript
let source: { sourceDir: string; tempDir: string };

beforeAll(async () => {
  source = await createE2ESource();
}, TIMEOUTS.SETUP);

afterAll(async () => {
  await cleanupTempDir(source.tempDir);
});

it("test 1", async () => {
  // Each test gets its own project dir but shares the source
  const wizard = await InitWizard.launch({ source });
  // ...
});
```

Only create sources inline when the test requires a unique or modified source (e.g., custom relationships).

---

## Dual-Scope Setup

**Non-interactive dual-scope tests:** Use `ProjectBuilder.dualScope()`, which returns `{ project, globalHome }`. Pass `HOME` via env to CLI commands.

**Interactive dual-scope lifecycle tests:** Use `dual-scope-helpers.ts`, which builds dual-scope state through actual wizard interactions:

| Helper                                                                    | Purpose                                                                       |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `createTestEnvironment()`                                                 | Creates tempDir/fakeHome/project with permissions files                       |
| `initGlobal(sourceDir, sourceTempDir, homeDir)`                           | Runs init wizard in HOME dir with defaults                                    |
| `initGlobalWithEject(sourceDir, sourceTempDir, homeDir)`                  | Like initGlobal but sets all sources to eject mode                            |
| `initProject(sourceDir, sourceTempDir, homeDir, projectDir)`              | Runs init with scope toggling (API skill + agent to project)                  |
| `initProjectAllGlobal(sourceDir, sourceTempDir, homeDir, projectDir)`     | Runs init with eject mode, all skills stay global (no scope toggling)         |
| `setupDualScope(sourceDir, sourceTempDir, fakeHome, projectDir)`          | Runs both phases and asserts success                                          |
| `setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir)` | Like setupDualScope but Phase A uses eject mode                               |
| `createDualScopeEnv(sourceDir, sourceTempDir)`                            | Creates env + runs dual-scope setup with eject, returns `DualScopeEnv`        |
| `createGlobalOnlyEnv(sourceDir, sourceTempDir)`                           | Creates env with all-global skills (no project scope), returns `DualScopeEnv` |
| `setupProjectOnlyMixedScope(...)`                                         | Builds a project-only install with mixed per-skill scopes                     |
| `finishWizard(...)`                                                       | Shared tail of the init phases (sources -> agents -> confirm)                 |

**Config readers** (load a scope's `config.ts` structurally rather than string-matching it): `readSkillEntries()`, `readAllSkillEntries()`, `readAgentEntries()`, `readSelectedAgents()`, `readConfigSkillIds()`.

**Edit probes** (drive a throwaway edit session to observe wizard state): `runEditWithFirstSkillAction()`, `readSkillBadgesViaEdit()`.

**Convenience wrappers:** `createDualScopeEnv` and `createGlobalOnlyEnv` combine environment creation + wizard setup + cleanup into a single call. They return a `DualScopeEnv` with `{ fakeHome, projectDir, destroy() }` -- call `destroy()` in `afterEach`/`afterAll` for automatic cleanup.

Use `createTestEnvironment` + `setupDualScope` when you need fine-grained control. Use `createDualScopeEnv`/`createGlobalOnlyEnv` for simpler test setup. Use `ProjectBuilder.dualScope()` when you only need the file structure without running the wizard.

---

## Permissions File

`createPermissionsFile(projectDir)` ensures `.claude/settings.json` grants `permissions.allow: ["Read(*)"]`. Without it, the Ink permission prompt blocks the PTY after install and the process never exits.

**It MERGES rather than overwrites.** When the file already exists — e.g. a plugin install wrote `enabledPlugins` / `extraKnownMarketplaces` before an `EditWizard.launch` re-runs this helper — every existing field is preserved and only `permissions.allow` is ensured to contain `Read(*)`. A file that already grants it is left byte-identical, and invalid JSON is a hard error rather than a silent clobber. It previously replaced the whole file, which wiped plugin state mid-lifecycle and produced failures in the phase AFTER the one that ran it.

All the wizard launchers call this internally. You only need to call it directly when:

- Using `InteractivePrompt` for non-wizard flows
- Building project state manually with `ProjectBuilder` for an interactive test
- Using the dual-scope helpers (`createTestEnvironment` handles it)

---

## Where Test Data Lives

| What                         | Location                               | Examples                                                                     |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| Project directory factories  | `e2e/fixtures/project-builder.ts`      | `ProjectBuilder.minimal()`, `.editable()`                                    |
| Source factories             | `e2e/helpers/create-e2e-source.ts`     | `createE2ESource()`, `createE2EPluginSource()`                               |
| Utility helpers              | `e2e/helpers/test-utils.ts`            | `createTempDir()`, `writeProjectConfig()`, `createLocalSkill()`              |
| UI text and paths            | `e2e/pages/constants.ts`               | `STEP_TEXT`, `DIRS`, `FILES`, `TIMEOUTS`                                     |
| Dual-scope lifecycle helpers | `e2e/fixtures/dual-scope-helpers.ts`   | `setupDualScope()`, `initGlobal()`                                           |
| Expected value constants     | `e2e/fixtures/expected-values.ts`      | `E2E_AGENTS`, `E2E_SKILL_IDS`, `E2E_SKILL`, `E2E_AGENT`, `E2E_AGENT_DISPLAY` |
| Assertion helpers            | `e2e/assertions/`                      | `expectPhaseSuccess()`, `expectCleanUninstall()`                             |
| Agent matchers               | `e2e/matchers/agent-matchers.ts`       | `toHaveAgentFrontmatter`, `toHaveAgentDynamicSkills`                         |
| Plugin-state fixture         | `e2e/fixtures/plugin-install-state.ts` | `createPluginInstalledProject()`, `uninstallProjectPlugins()`                |
| Type-narrowing probe         | `e2e/helpers/type-check-probe.ts`      | `probeConfigTypesNarrowing()`                                                |

`createPluginInstalledProject()` reproduces a completed `claude plugin install` **without** the Claude CLI binary — it writes `config.ts` (skills sourced to the marketplace), `settings.json` (`enabledPlugins`), and the fake-HOME `installed_plugins.json` registry directly. Plugin-state tests built on it run unconditionally, with no `describe.skipIf` gate.

`probeConfigTypesNarrowing(claudeSrcDir, aliases)` asserts that a project's generated `config-types.ts` union aliases still REJECT bogus values, by running the repo-local `tsc` over a temporary probe module and reading its verdict. This is the property that matters: a union collapsed to `string` passes a text assertion but silently accepts everything. `exitCode === 0` means the aliases are NOT narrowing (a bug); non-zero with `TS_NOT_ASSIGNABLE` (`"TS2322"`) in the output means they are.

**Never create test data in** `e2e/commands/`, `e2e/interactive/`, `e2e/lifecycle/`, or `e2e/integration/`. Those directories contain only test files.

---

## CLI.run() vs runCLI()

**`CLI.run(args, project, options?)`** is the standard for new non-interactive tests. Takes a `ProjectHandle` (or `{ dir: string }`), returns `{ exitCode, stdout, stderr, output }`. Sets `HOME` to project dir automatically. All output is ANSI-stripped.

```typescript
const { exitCode, output } = await CLI.run(["compile"], project);
```

**`runCLI(args, cwd, options?)`** still exists in `test-utils.ts` and returns `{ exitCode, stdout, stderr, combined }`. It takes a raw `cwd` string. New tests should prefer `CLI.run()`; `runCLI` remains in use where a test needs an explicit HOME split without a `ProjectHandle` (10 spec files plus `create-e2e-plugin-source.ts`).

Key differences:

| Aspect                  | `CLI.run()`           | `runCLI()`                  |
| ----------------------- | --------------------- | --------------------------- |
| Input                   | `ProjectHandle`       | `string` (cwd)              |
| Output field            | `output`              | `combined`                  |
| Location                | `e2e/fixtures/cli.ts` | `e2e/helpers/test-utils.ts` |
| Preferred for new tests | Yes                   | Legacy                      |

**HOME resolution.** `CLI.run()`'s precedence is `options.env.HOME` > `project.globalHome` > `project.dir` — so a handle produced by `launchInProject` / `launchInGlobal` routes the follow-up command to the same global root the wizard wrote, and a plain-`launch()` handle falls back to `project.dir`. `runCLI()` defaults HOME to a freshly-created **sibling** temp dir (prefix `ai-e2e-home-`), distinct from `cwd`, removed in a `finally`; an explicit `options.env.HOME` wins and is never auto-removed. Neither sets `HOME=cwd` — that collapse was removed, because `os.homedir() === cwd` silently forces a project command into global scope.

`CLI.run()` sets `AGENTSINC_SOURCE=undefined` by default; `runCLI()` does NOT -- callers must pass it via `options.env` if needed. Both strip ANSI from all output.

**Do NOT spread `process.env` into `env`.** `execa` inherits `process.env` automatically. Spreading it clobbers the `HOME` override that both `CLI.run()` and `runCLI()` set for isolation:

```typescript
// BAD: HOME override is clobbered by process.env.HOME
await CLI.run(["compile"], project, { env: { ...process.env, AGENTSINC_SOURCE: undefined } });

// GOOD: execa inherits process.env, only override what you need
await CLI.run(["compile"], project);
```

---

## Remaining Utilities in test-utils.ts

These are still exported and used in some tests. Matchers are preferred for assertions, but these exist for edge cases where no matcher covers the need:

| Export                                                                                                                           | Purpose                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FORKED_FROM_METADATA`                                                                                                           | Standard `forkedFrom` metadata block for plugin/uninstall tests                                                                                                      |
| `listFiles(dirPath)`                                                                                                             | `readdir` wrapper, returns `[]` on error instead of throwing                                                                                                         |
| `readTestFile(filePath)`                                                                                                         | `readFile(path, "utf-8")` wrapper                                                                                                                                    |
| `readMarketplaceJson(outputPath)`                                                                                                | Parse a generated `marketplace.json` into `Marketplace` (for `build marketplace` tests)                                                                              |
| `agentsPath(dir)`                                                                                                                | Path to `.claude/agents/` in a project                                                                                                                               |
| `skillsPath(dir)`                                                                                                                | Path to `.claude/skills/` in a project                                                                                                                               |
| `configTsPath(dir)` / `configTypesTsPath(dir)`                                                                                   | Paths to `.claude-src/config.ts` and `config-types.ts` (project OR global scope dir)                                                                                 |
| `getEjectedTemplatePath(dir)`                                                                                                    | Path to the ejected `agent.liquid` template                                                                                                                          |
| `stripAnsi(text)`                                                                                                                | Strips ANSI escape sequences (rarely needed -- CLI.run pre-strips)                                                                                                   |
| `createLocalSkill(dir, id, opts?)`                                                                                               | Creates a skill directory with SKILL.md + optional metadata.yaml                                                                                                     |
| `writeProjectConfig(dir, config)`                                                                                                | Writes `.claude-src/config.ts` (used internally by ProjectBuilder). Emits ONLY config.ts.                                                                            |
| `writeConfigTypes(dir)`                                                                                                          | Writes a minimal `config-types.ts` stub — pair with `writeProjectConfig` when the test asserts on the companion file (e.g. uninstall manifest removal)               |
| `writeAgentFile(dir, name, opts?)`                                                                                               | Writes `<dir>/.claude/agents/<name>.md`. Bare `# <name>` heading by default; `opts.frontmatter` prefixes a `name:` block.                                            |
| `writeAgentStubs(dir, agents)`                                                                                                   | Writes minimal compiled-agent stubs, as a prior `compile` would leave behind                                                                                         |
| `createPermissionsFile(dir)`                                                                                                     | Ensures `.claude/settings.json` grants `Read(*)`. **MERGES, never overwrites** — preserves `enabledPlugins` / `extraKnownMarketplaces`; hard-errors on invalid JSON. |
| `seedDefaultSourceCache(homeDir, sourceDir)`                                                                                     | Copies a source into the CLI cache for `DEFAULT_SOURCE` under `homeDir`, so the public-marketplace fallback resolves from disk instead of the network                |
| `addForkedFromMetadata(dir)`                                                                                                     | Writes forkedFrom metadata to the default web-framework-react skill                                                                                                  |
| `injectMarketplaceIntoConfig(dir, name)`                                                                                         | Patches a marketplace field into an existing config.ts                                                                                                               |
| `loadConfigOrFail(dir)`                                                                                                          | Structurally loads a scope's `config.ts`; throws when absent or unparseable (no silent empty-config fallback)                                                        |
| `readAgentEntriesFor(dir, agentName)`                                                                                            | Loads a scope's config and returns every `AgentScopeConfig` with that name                                                                                           |
| `completeWithLocalSources(wizard)`                                                                                               | Drives init end-to-end with every source switched to local (`l` on the Sources step). Required by tests asserting on `.claude/skills/` contents.                     |
| `delay(ms)`                                                                                                                      | Framework-internal wait utility (not for use in test `it()` blocks)                                                                                                  |
| `pollUntil(isSatisfied, timeoutMs, buildError)`                                                                                  | Framework-internal poll skeleton behind every `TerminalScreen` wait (predicate evaluated before the first delay)                                                     |
| `ensureBinaryExists()`                                                                                                           | Verifies `bin/run.js` exists, throws if not                                                                                                                          |
| `BIN_RUN` / `CLI_ROOT`                                                                                                           | Absolute paths to the built binary and the repository root                                                                                                           |
| `createE2ESource` / `E2E_SKILL_TITLES` / `E2E_AGENT_TITLES` / type `E2ESource`                                                   | Re-exports from create-e2e-source.ts. The `*_TITLES` maps ARE the text the wizard renders — key label assertions off them.                                           |
| `renderSkillMd` / `renderConfigTs` / `renderAgentYaml` / `renderAgentMd` / `renderMetadataYaml` / `renderIncompleteMetadataYaml` | Re-exports from `content-generators.ts`. **Always use these** instead of inlining fixtures.                                                                          |
| `normalizeGlobalConfig` / `writeTestPackageJson`                                                                                 | Re-exports from the unit-test helper tree (`helpers/config-comparison.ts`, `helpers/config-io.ts`)                                                                   |
| `fileExists(path)` / `directoryExists(path)` / `cleanupTempDir(dir)`                                                             | Re-exports from `test-fs-utils.ts`                                                                                                                                   |
| `isClaudeCLIAvailable()`                                                                                                         | Re-export from exec.ts -- checks if the Claude CLI binary is available                                                                                               |
| `claudePluginInstall(...)` / `claudePluginUninstall(...)`                                                                        | Re-exports from exec.ts                                                                                                                                              |
| `claudePluginMarketplaceAdd(...)` / `claudePluginMarketplaceList(...)`                                                           | Re-exports from exec.ts                                                                                                                                              |
| `execCommand(cmd)`                                                                                                               | Re-export from exec.ts -- general command execution                                                                                                                  |

---

## Related

- [test-structure.md](./test-structure.md) -- Three-phase pattern and lifecycle hooks
- [assertions.md](./assertions.md) -- How to verify outcomes after setup
- [patterns.md](./patterns.md) -- Complete examples for each test type
