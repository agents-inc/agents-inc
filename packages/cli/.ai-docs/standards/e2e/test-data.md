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

| Method                                                | Returns                  | Use When                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProjectBuilder.minimal()`                            | `ProjectHandle`          | Compile tests. Creates config + 1 skill (`web-testing-vitest`).                                                                                                                                                                                                                                                                                                                             |
| `ProjectBuilder.editable(options?)`                   | `ProjectHandle`          | Edit wizard tests. Creates config + skills + agents dir. `EditableOptions`, all 9: `marketplace`, `skills`, `agents`, `domains`, `stack`, `forkedFrom`, `globalSkills`, `globalSkillsSource`, `unresolvableSkills`.                                                                                                                                                                         |
| `ProjectBuilder.dualScope(options?)`                  | `DualScopeHandle`        | Dual-scope non-interactive tests. Creates `globalHome` + `project` with separate configs. `DualScopeOptions`: `globalSkill`, `projectSkills`, `projectStack`, `projectSkill`.                                                                                                                                                                                                               |
| `ProjectBuilder.dualScopeWithImport()`                | `DualScopeHandle`        | Dual-scope state for import/migration flows — the worked example of encapsulating complex setup in a factory rather than inlining it.                                                                                                                                                                                                                                                       |
| `ProjectBuilder.withCustomSkill()`                    | `ProjectHandle`          | Custom skill validation. Creates config + config-types.ts + custom skill with `custom: true`.                                                                                                                                                                                                                                                                                               |
| `ProjectBuilder.pluginProject(options)`               | `ProjectHandle`          | Plugin mode tests. Creates config with marketplace source, skills, agent stubs, and each declared skill's plugin key enabled in `.claude/settings.json` — without which the one file `toHavePlugin` reads disagreed with the config's own claim and `not.toHavePlugin` held before any command ran. `omitMarketplaceField` simulates a legacy install that never persisted the marketplace. |
| `ProjectBuilder.localProjectWithMarketplace(options)` | `ProjectHandle`          | Eject mode with marketplace field in config. Skills have `source: "eject"`.                                                                                                                                                                                                                                                                                                                 |
| `ProjectBuilder.globalWithSubproject()`               | `{ globalHome, subDir }` | Global installation tests. Creates global config + skill + empty subproject dir.                                                                                                                                                                                                                                                                                                            |
| `ProjectBuilder.installation(dir)`                    | `void`                   | Minimal install detection. Writes config.ts into existing dir. Unlike others, does not create a temp dir.                                                                                                                                                                                                                                                                                   |

**`editable({ globalSkills })` records extra `scope: "global"` entries in the PROJECT config** with no disk copy — they model skills inherited from the global install. In a project-scope edit they render as inherited, locked (readOnly) Sources rows.

**`editable({ globalSkills })` records both halves of the pair under `origin: "eject"`, and one scenario is unreachable at that default.** A spec that presses `s` to collapse `[P][G]` back to `[G]` cannot use it: `wouldOverwriteGlobalEject` refuses the project→global press exactly when the live entry is a project eject, the snapshot holds an ACTIVE global eject and no tombstone exists — so the press returns a toast and changes nothing, and the spec fails on a swallowed keystroke while reading as the render bug it meant to test.

**`editable({ globalSkillsSource })` is what makes the collapse reachable** — it sets the `origin` recorded for the global entries, so naming a marketplace for the global half puts the pair outside that guard. Do not hand-roll the shape with `writeProjectConfig` + `buildProjectConfig`: `e2e/interactive/edit-wizard-dual-scope-collapse-removal-row.e2e.test.ts` did exactly that until the option existed, and its fixture note records the swap. Every such spec still owes a scope-badge proof that the press landed — `getScopeBadgesForSkill` reading `["P"]` before and `["G"]` after — because without it the assertions downstream pass or fail vacuously. See [anti-patterns.md § Fixture Selection](./anti-patterns.md).

**`editable({ forkedFrom: true })`** writes `FORKED_FROM_METADATA` as each skill's `metadata.yaml`, marking them CLI-managed so `uninstall` removes them instead of skipping them as user-created.

**`editable({ unresolvableSkills })` / `pluginProject({ unresolvableSkills })` record config entries with NO files on disk.** That is how a project genuinely reaches "the wizard cannot resolve this skill": the session's source does not carry it and the install has no copy. Installing it with a deliberately broken `metadata.yaml` does NOT produce that state and must not be used to fake it — a local skill whose `metadata.yaml` describes it is merged into the matrix and offered like any other, and `compile` hard-errors on one whose `metadata.yaml` does not.

**When 3+ tests share a setup pattern not covered by these methods, add a new `ProjectBuilder` method rather than duplicating setup logic across test files.**

---

## A Fixture Writes Content the Product Could Have Written

A fixture that writes a file no product path produces cannot fail for a reason the product has — and it will pass or fail for reasons the product does not have, which is worse. `renderMetadataYaml` therefore fills three of the four fields `localRawMetadataSchema` requires — `displayName`, `slug` and `domain` — whenever the caller does not name them. `category` is the fourth and is deliberately not filled: it is a required property of `SkillMetadataFields`, so a call that omits it does not compile, and `completeMetadata`'s docblock says why — it is the one field a wrong value makes the skill unreachable through, and a default here would write a `local`-placeholder skill silently, leaving a spec exercising a catalogue its skill was never in. A `metadata.yaml` short of the four describes no skill, and `compile` refuses the run over one.

- **Never write an incomplete `metadata.yaml` by omission.** `renderIncompleteMetadataYaml(fields, ["category"])` is the only way to produce one, and it exists so an error-path fixture has to ask for the breakage by name.
- **Never fake an error state with unrealistic content when a realistic setup produces the same state.** No product path writes a `metadata.yaml` short of what `localRawMetadataSchema` requires — the scaffolder that seeds a new marketplace skill (`metadataYaml`, `src/cli/lib/marketplace-scaffold.ts`) emits all four and more, and an ejected skill is copied whole from a source carrying the same — so a fixture missing one is the drift and the schema is not. A skill is made unresolvable the way a project genuinely reaches that state: config entries with no files on disk, through `unresolvableSkills` on `ProjectBuilder.editable` / `pluginProject`. Every fixture that asks for an unusable `metadata.yaml` by name is enumerable, and nothing else in the suite may produce one:

  ```
  grep -rn -F 'renderIncompleteMetadataYaml(' e2e --include='*.ts'
  grep -rn -F 'renderUnparseableMetadataYaml(' e2e --include='*.ts'
  ```

- **A fixture writer that already holds a field must write it.** Two writers dropped `category`, `slug` and `displayName` that their own `TestSkill` carried.
- **A fixture's `metadata.yaml` must satisfy the same schema the product enforces, and a skill's display name is not its id.** `doctor`'s content layer validates every installed `metadata.yaml` against `skillMetadataBaseSchema`, which bounds `displayName` at 30 characters because it is painted into a wizard grid column; an id is namespaced by its marketplace and is not bounded. Passing one as the other satisfies the type and violates the schema, and the failure lands in whichever spec happens to run `doctor` or `compile` rather than in the fixture. Write `E2E_SKILL.<slug>.display` — the title the fixture source publishes for that skill, which is what the grid paints and therefore also what `focusSkill` / `selectSkill` / `getScopeBadgesForSkill` address a row by.
- **Shape a fixture to the WRITER it stands in for, never to the weakest reader that currently accepts it.** A fixture is coupled to whichever contract it was measured against, and a reader's tolerance is the one contract guaranteed to tighten. `writeAgentFile`'s docstring recorded the coupling in as many words — a bare `# <agentName>` heading with no frontmatter, "which is all `doctor` and `list` need to see an agent as present" — and it was true on the day it was written. Merging `validate` into `doctor` made it validate every installed `SKILL.md`, `metadata.yaml` and compiled agent `.md` against the strict schemas, and **nine fixtures failed at once**: agent files with no frontmatter and agent files carrying `name` without the `description` `agentFrontmatterValidationSchema` also requires; `FORKED_FROM_METADATA` carrying `author` + `contentHash` + `forkedFrom` and nothing descriptive, with a `contentHash` that was not the `/^[a-f0-9]{7}$/` the schema demands; five `renderMetadataYaml` call sites short of `cliDescription` / `usageGuidance`. None was a product defect and every one read as one. Two specs had gone further and **encoded the gap as an invariant** — a skill directory with no `metadata.yaml` producing no finding at all, commented as though doctor's silence were the contract — so the fixtures were pinning the reader's blind spot rather than the writer's output.

  So: an agent `.md` needs `name` **and** `description`; an installed skill needs `SKILL.md` **and** a `metadata.yaml` that passes the strict metadata schema, `contentHash` included and hex. `writeAgentFile` now defaults to the bare heading deliberately — "the shape of a hand-authored file the CLI never wrote", which is a fixture standing in for something else entirely — and `frontmatter: true` emits both fields, which is the shape a compile leaves behind. Choosing between them is a claim about which writer produced the file, and it is the whole question the fixture answers.

- **A spec comparing emitted bytes builds its expected value through the same renderer.** `emitMetadataYaml` assembles its line array positionally, so the caller's key order is inert — `renderMetadataYaml` emits `custom, domain, author, displayName, category, slug, cliDescription, usageGuidance, contentHash, forkedFrom` whatever order the object was written in. Adopting the renderer at a site holding an inline string is therefore not a mechanical swap: same keys and same values is not the same file. Diff the renderer's output against the exact string being replaced, and where the bytes differ the swap is sound only if the consumer PARSES the artefact _and_ no assertion in the suite reads it as raw text — both hold for `metadata.yaml` (YAML mappings are order-independent, and a skill's `contentHash` hashes `SKILL.md`), and if either fails, keep the inline string and report the site. Never hand-edit the replacement to force byte parity; writing a YAML string to preserve ordering re-introduces the anti-pattern the renderer exists to remove.

An inline metadata string is a bare `key: value` line at the start of a line with no trailing comma or semicolon, which is what tells it apart from the object literal a renderer call takes:

```
grep -rnP '^\s*(domain|slug|category|displayName|contentHash|author): [^,;{]*[^,;{\s]\s*$' e2e --include='*.ts'
```

Currently empty. It cannot see the first line of a template literal, which shares its line with the opening backtick, so treat it as a floor.

What a fixture that writes an incomplete `metadata.yaml` actually buys is a file the two compile passes disagree about: discovery reads it only far enough to know it parses, while the config-types pass validates it against `localRawMetadataSchema`, so one `compile` run printed `Loaded skill: …` and `Skipping local skill '…': invalid metadata.yaml` about the SAME file and still exited 0. Both refusals now come from one judgment in `readSkillMetadata`, and it names the missing fields in plain words rather than in Zod's.

See `.ai-docs/agent-findings/2026-08-16-a-fixture-wrote-its-skill-id-as-a-display-name-and-the-namespace-broke-the-bound.md`.

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

### A fixture source IS a custom marketplace, so its skill ids are namespaced

**The bare ids in the table above are what the fixture publishes MINUS its namespace.** Every one is written to disk through `e2eSkillId(bare)` = `` `${E2E_MARKETPLACE_NAME}-${bare}` ``, and the load-side collision guard refuses any custom marketplace shipping an id the public catalogue owns. A fixture with bare public-catalogue ids does not load, and the refusal is correct — the fixture, not the guard, is what is wrong.

| Rule                                                                                                                            | Why                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compose every fixture skill id through `e2eSkillId` / `E2E_SKILL.<slug>.id`, never by hand                                      | The prefix must EQUAL the marketplace name `build marketplace` reads from `package.json`; two surfaces spelling it separately is how they diverge                       |
| Assert on `E2E_SKILL.<slug>.id` rather than a literal — but only where the literal denotes content `createE2ESource` published  | A marketplace rename moves every id and no slug. The scope boundary is load-bearing: a spec that writes its OWN skill owns those ids and keeps them as literals (below) |
| Choose the member by what the assertion reads — `.id`, `.slug` or `.display`                                                    | They are three different strings for one skill, and picking the wrong one is invisible until a rename moves only one of them (below)                                    |
| Slugs, categories and display titles are **not** namespaced                                                                     | A slug names the skill inside its own source; a title is what the wizard paints                                                                                         |
| Sub-agent names are **not** namespaced                                                                                          | The rule governs skill ids alone — marketplaces do not ship sub-agents                                                                                                  |
| A fixture that deliberately MODELS the public catalogue declares itself with a `package.json` naming `PUBLIC_CATALOGUE_PACKAGE` | That is the only source entitled to ship bare catalogue ids, and package identity is the only signal the guard reads                                                    |
| Installed / local skills stay bare                                                                                              | A local skill overriding a catalogue id is a supported path, not a marketplace claim, and the guard does not touch it                                                   |

The unit layer has the same obligation through the same shape: `createTestSource()` writes a source directory that `loadSkillsMatrixFromSource()` then loads for real, and publishes its ids through `inTestMarketplace()` / `testMarketplaceSkillId()` in `src/cli/lib/__tests__/fixtures/create-test-source.ts`.

**`E2E_SKILL` is the source of truth only for content `createE2ESource` / `createE2EPluginSource` published, and a spec that writes its own skill owns those ids.** A large share of the skill-id literals in `e2e/` name nothing that source publishes: `ProjectBuilder` writes `web-testing-cypress-e2e`, `web-testing-playwright-e2e`, `web-framework-react` and `web-testing-vitest` straight to disk through `createLocalSkill`, and those are local skills answering to no marketplace. Swapping one to `E2E_SKILL.react.id` asserts a relationship that does not exist — and since the namespace landed it is not even the same string, because `E2E_SKILL.react.id` is `e2e-test-fixture-web-framework-react`. Rule of thumb: a spec that does not call `createE2ESource` / `createE2EPluginSource` does not import `E2E_SKILL`.

**Where it does apply, the member is chosen by what the assertion reads.** `.id` for config entries, file paths and compiled-agent content; **`.slug` for source paths and skill lookups**, because a slug names the skill inside its own source and is what the on-disk directory under a source is called; `.display` for anything matched against rendered wizard text (`selectSkill`, `focusSkill`, `toggleAgent`, `toContain` on frame output — see [assertions.md § Expected Value Constants](./assertions.md)). Never normalise across the three. Only `.id` carries the namespace, so a marketplace rename moves `.id` alone and leaves a site that reached for the wrong member green until something else breaks it.

**The fixture marketplace name must spell neither "marketplace" nor "source",** because ids are printed in command output (`search`'s `ID` column, `Installed <skill>@<marketplace>`) and an assertion about the CLI's own prose then passes or fails on the fixture. `E2E_MARKETPLACE_NAME` is `e2e-test-fixture` and `TEST_MARKETPLACE_NAME` is `test-fixture` for exactly this reason — see [assertions.md § A negated word assertion must not run against text the harness contributed to](./assertions.md).

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
- Reaching for `--marketplace` against the real marketplace is not the fix: it trades a reproducibility problem for a network one. State the cardinality's effect instead.

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
its whole life passing over an edit that did nothing: it closed on
`expect(editSkillIds.length).toBeGreaterThanOrEqual(initSkillIds.length)`, and a count floor is
satisfied by an edit that changed nothing at all. Replacing the floor with the two set differences
the merge contract actually names — no skill init wrote may disappear, exactly one new skill must
appear — is what surfaced the rest, and the spare exists because that assertion had nothing
reachable to name until it did. Before then the fixture could not produce the state its own spec
asserted, and no amount of keystroke tuning would have changed that; the lesson generalises past
this fixture, which is why the roster above is written down rather than left to be rediscovered.

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

Every one of them takes the source as a single `E2ESource` — reach for `E2E_SOURCE`, the shared
plain tree, rather than building one. The two-argument `(sourceDir, sourceTempDir)` spelling this
table carried until 2026-08-26 has not been the signature since c3c189c8.

| Helper                                                    | Purpose                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `createTestEnvironment(options?)`                         | Creates tempDir/fakeHome/project with permissions files                       |
| `initGlobal(source, homeDir)`                             | Runs init wizard in HOME dir with defaults                                    |
| `initGlobalWithEject(source, homeDir)`                    | Like initGlobal but sets all sources to eject mode                            |
| `initProject(source, homeDir, projectDir, options?)`      | Runs init with scope toggling (API skill + agent to project)                  |
| `initProjectAllGlobal(source, homeDir, projectDir)`       | Runs init with eject mode, all skills stay global (no scope toggling)         |
| `setupDualScopeWithEject(source, fakeHome, projectDir)`   | Runs both phases and asserts success. **The only dual-scope setup helper**    |
| `createDualScopeEnv(source)`                              | Creates env + runs dual-scope setup with eject, returns `DualScopeEnv`        |
| `createGlobalOnlyEnv(source)`                             | Creates env with all-global skills (no project scope), returns `DualScopeEnv` |
| `setupProjectOnlyMixedScope(source, homeDir, projectDir)` | Builds a project-only install with mixed per-skill scopes                     |
| `finishWizard(result)`                                    | Shared tail of the init phases (sources -> agents -> confirm)                 |

**There is no plugin-mode dual-scope setup helper, and this table used to imply there was.** A
`setupDualScope` sat beside `setupDualScopeWithEject` described as the non-eject one, with zero
callers and — after 2026-08-26 — a byte-identical body, so an author choosing between the two was
choosing between one behaviour and its own name. It was deleted. The reason no such helper exists is
in the surviving one's docblock: the shared plain source ships no `.claude-plugin/marketplace.json`,
so plugin install mode has no marketplace to resolve and `init` refuses the run, while Phase B sets
every source local regardless. A flow that genuinely needs a PLUGIN global drives `initGlobal`
against a plugin fixture directly — `lifecycle/dual-scope-edit-mixed-sources.e2e.test.ts` is the
shape.

**Config readers** (load a scope's `config.ts` structurally rather than string-matching it): `readSkillEntries()`, `readAllSkillEntries()`, `readAgentEntries()`, `readSelectedAgents()`, `readConfigSkillIds()`.

**Edit probes** (drive a throwaway edit session to observe wizard state): `runEditWithFirstSkillAction()`, `readSkillBadgesViaEdit()`.

**Convenience wrappers:** `createDualScopeEnv` and `createGlobalOnlyEnv` combine environment creation + wizard setup + cleanup into a single call. They return a `DualScopeEnv` with `{ fakeHome, projectDir, destroy() }` -- call `destroy()` in `afterEach`/`afterAll` for automatic cleanup.

Use `createTestEnvironment` + `setupDualScopeWithEject` when you need fine-grained control. Use `createDualScopeEnv`/`createGlobalOnlyEnv` for simpler test setup. Use `ProjectBuilder.dualScope()` when you only need the file structure without running the wizard.

---

## Permissions File

`createPermissionsFile(projectDir)` ensures `.claude/settings.json` grants `permissions.allow: ["Read(*)"]`. Without it, the Ink permission prompt blocks the PTY after install and the process never exits.

**It MERGES rather than overwrites.** When the file already exists — e.g. a plugin install wrote `enabledPlugins` / `extraKnownMarketplaces` before an `EditWizard.launch` re-runs this helper — every existing field is preserved and only `permissions.allow` is ensured to contain `Read(*)`. A file that already grants it is left byte-identical, and invalid JSON is a hard error rather than a silent clobber. It previously replaced the whole file, which wiped plugin state mid-lifecycle and produced failures in the phase AFTER the one that ran it.

All the wizard launchers call this internally. You only need to call it directly when:

- Using `InteractivePrompt` for non-wizard flows
- Building project state manually with `ProjectBuilder` for an interactive test
- Using the dual-scope helpers (`createTestEnvironment` handles it)

---

## An In-Process Command Spec Owns Its `HOME`, Not Just Its `cwd`

A spec that drives a command in-process — `runCliCommand`, or `Command.run` directly — chdirs into a temp project and calls it isolated. It is not. oclif runs the `init` hook before every command, that hook calls `resolveSource`, and the resolution ladder falls through a project's own config **to the home root**. So a spec that names no home reads the developer's `~/.claude-src/config.ts` on every run, `help` included. The local-skill merge is the second read: `loadSkillsMatrixFromSource` merges `~/.claude/skills` into the matrix whenever the project directory is not the home directory.

**Both reads are silent while the machine happens to agree with the fixture.** A developer whose global config names a fork instead of the public catalogue turns the default-source branch off, and specs that never mention a marketplace go red; a developer with a global install makes `eject` print a different screen. Measured on the tree this rule was written against: seeding an otherwise-isolated home with a global config naming another marketplace turned four `source-loader` specs and two `commands` specs red, none of which names a home or a marketplace anywhere in its body.

**Use `setupIsolatedHome(prefix)`** from `src/cli/lib/__tests__/helpers/isolated-home.ts`. It creates the temp dir, chdirs into a project inside it, points `HOME` at a _sibling_ directory — never the project, or global and project state collapse into one place — and returns the `cleanup` that restores both. It also closes oclif's update-check door for the life of the home, because `@oclif/plugin-warn-if-update-available` spawns a **detached** child that `mkdir -p`s `<home>/.cache/agents-inc/version` and outlives the test that started it, recreating a tree `cleanup` has already removed and racing its recursive delete for the `ENOTEMPTY: rmdir` this suite reports. `useFakeHome(getTempDir)` is the hook-registering sibling for files that already own their temp dir.

**`process.env.HOME` alone is not enough where the code path calls `os.homedir()`.** Node re-reads `$HOME` on every call, so a mutated env var is picked up; **bun resolves it once at startup and ignores later mutation**, and this package runs its tests under both. `vitest.setup.ts` closes that gap for the whole suite with a process-wide `vi.spyOn(os, "homedir")` that answers with `process.env.HOME`, so the env var does reach `os.homedir()` under either runtime. It is installed in a **`beforeEach`**, and that is load-bearing: from a `beforeAll` a single `vi.restoreAllMocks()` — which many specs call from an `afterEach` — removed it for every later test in that file, and `os.homedir()` answered from the machine from that point on. `src/cli/lib/__tests__/home-dir-read-at-call-time.test.ts` holds the re-installation, paired with a case that withdraws the spy mid-test so the survival it asserts cannot hold vacuously. A file that restores mocks no longer needs its own per-test spy, though several still carry one harmlessly. The population, re-derivable:

```
grep -rlP 'vi\.restoreAllMocks\(\)' src --include='*.test.ts' --include='*.test.tsx'
```

**Neither mechanism reaches a constant a module computed from `os.homedir()` at IMPORT time**, and no test-side mechanism can — so this is a constraint on PRODUCT code, enforced there. `CACHE_DIR` and `GLOBAL_INSTALL_ROOT` in `src/cli/consts.ts` were both of that shape: `runCliCommand` drives oclif through `dist/`, a second module graph first imported by whichever test runs a command first, so they froze to that test's fake home and every later test in the file read and wrote under a directory its own `afterEach` had deleted. They are `cacheRoot()` and `globalInstallRoot()` now, and `src/cli/lib/__tests__/home-dir-read-at-call-time.test.ts` refuses the declaration shape across `src/cli/` so the next one cannot land. It reads the shape rather than a comment, because a gate looking for a note saying "read at call time" is satisfied by writing that note above a constant that does not. The scan it automates:

```
grep -rnP '^export const [A-Z_]+ = .*os\.homedir\(\)' src/cli
```

**The source root is a third machine read, and `HOME` does not cover it.** `loadFromLocal` falls back to `PROJECT_ROOT` — this checkout — whenever the source is not a local path, which is the branch `devMode` takes for the default marketplace. It then reads that root's own `.claude-src/config.ts`, a gitignored file whose `skillsDir` and `stacksFile` keys decide what the load returns. A spec on that branch supplies a source root of its own by overriding `PROJECT_ROOT` through a partial `vi.mock` of `consts` that falls back to the real value, so only the spec that sets the override is affected.

**Proving the isolation is load-bearing:** seed the isolated home (or source root) with the state a real machine could hold — a global config naming another marketplace, a `branding` block, a `stacksFile` — and confirm the spec goes red for that reason. A spec that stays green under that seeding is not reading the home at all, and the stub is decoration.

---

## Where Test Data Lives

| What                         | Location                               | Examples                                                                     |
| ---------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| Project directory factories  | `e2e/fixtures/project-builder.ts`      | `ProjectBuilder.minimal()`, `.editable()`                                    |
| Source factories             | `e2e/helpers/create-e2e-source.ts`     | `createE2ESource()`, `createE2EPluginSource()`                               |
| Utility helpers              | `e2e/helpers/test-utils.ts`            | `createTempDir()`, `writeProjectConfig()`, `createLocalSkill()`              |
| UI text and paths            | `e2e/pages/constants.ts`               | `STEP_TEXT`, `DIRS`, `FILES`, `TIMEOUTS`                                     |
| Dual-scope lifecycle helpers | `e2e/fixtures/dual-scope-helpers.ts`   | `setupDualScopeWithEject()`, `initGlobal()`                                  |
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
| `addForkedFromMetadata(dir)`                                                                                                     | Writes forkedFrom metadata to the default web-framework-react skill                                                                                                  |
| `injectMarketplaceIntoConfig(dir, name)`                                                                                         | Patches a marketplace field into an existing config.ts                                                                                                               |
| `loadConfigOrFail(dir)`                                                                                                          | Structurally loads a scope's `config.ts`; throws when absent or unparseable (no silent empty-config fallback)                                                        |
| `readAgentEntriesFor(dir, agentName)`                                                                                            | Loads a scope's config and returns every `AgentScopeConfig` with that name                                                                                           |
| `completeWithLocalSources(wizard)`                                                                                               | Drives init end-to-end with every source switched to local (`l` on the Sources step). Required by tests asserting on `.claude/skills/` contents.                     |
| `delay(ms)`                                                                                                                      | Framework-internal wait utility (not for use in test `it()` blocks)                                                                                                  |
| `pollUntil(isSatisfied, timeoutMs, buildError)`                                                                                  | Framework-internal poll skeleton behind every `TerminalScreen` wait (predicate evaluated before the first delay)                                                     |
| `BIN_RUN` / `CLI_ROOT`                                                                                                           | Absolute paths to the built binary and the repository root                                                                                                           |
| `createE2ESource` / `E2E_SKILL_TITLES` / `E2E_AGENT_TITLES` / type `E2ESource`                                                   | Re-exports from create-e2e-source.ts. The `*_TITLES` maps ARE the text the wizard renders — key label assertions off them.                                           |
| `renderSkillMd` / `renderConfigTs` / `renderAgentYaml` / `renderAgentMd` / `renderMetadataYaml` / `renderIncompleteMetadataYaml` | Re-exports from `content-generators.ts`. **Always use these** instead of inlining fixtures.                                                                          |
| `normalizeGlobalConfig` / `normalizeConfigPreservingOrder` / `writeTestPackageJson`                                              | Re-exports from the unit-test helper tree (`helpers/config-comparison.ts`, `helpers/config-io.ts`). Both normalisers take this route; they differ only in sorting.   |
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
