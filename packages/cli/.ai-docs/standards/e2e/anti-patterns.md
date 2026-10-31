---
last_validated: 2026-10-15
---

# Anti-Patterns

Every "never do this" rule with rationale. Organized by category.

---

## Session and Keystroke Leakage

### Never import `TerminalSession` in test files

**What:** `import { TerminalSession } from "../helpers/terminal-session.js"` in a `.e2e.test.ts` file.

**Why:** `TerminalSession` is the raw PTY layer. Tests must use page objects to interact with the terminal. Direct session access bypasses all the framework's timing, text matching, and navigation logic.

**Instead:** Use `InteractivePrompt` or `DashboardSession`.

### Never call session methods in test files

**What:** `session.waitForText()`, `session.enter()`, `session.arrowDown()`, `session.write()` in test code.

**Why:** These are low-level terminal operations. Every keystroke needs a delay after it, and every text check needs a timeout. The framework handles this internally.

**Instead:** Use the page object's own methods — `DashboardSession` or `InteractivePrompt`.

---

## Timing Leakage

### Never use `delay()` in test files

**What:** `await delay(500)` in an `it()` block.

**Why:** The framework encapsulates all timing. Delays in tests are a sign that the test is working at the wrong abstraction level.

**Instead:** If you need to wait for something, use `waitForText` through a page object.

### Never use `setTimeout` in test files

**What:** `await new Promise(r => setTimeout(r, 1000))` or similar.

**Why:** Same as above. Manual timing is fragile and makes tests flaky.

**Instead:** The framework handles all timing. Use `{ timeout: TIMEOUTS.LIFECYCLE }` for tests that need more time.

### Never reference `INTERNAL_DELAYS` in test files

**What:** `import { INTERNAL_DELAYS } from "../pages/constants.js"` or using `INTERNAL_DELAYS.STEP_TRANSITION`.

**Why:** `INTERNAL_DELAYS` is exported only for the framework's internal use (DashboardSession, InteractivePrompt). Tests should not know about keystroke timing.

**Instead:** Use `TIMEOUTS` for per-test timeout overrides. The framework handles all internal delays.

---

## Filesystem in Tests

### Never use `writeFile`/`mkdir` in `it()` blocks

**What:** `await writeFile(path.join(projectDir, ".agents-inc", "claude", "config.ts"), content)` inside a test.

**Why:** This couples the test to the config file format. When the format changes, the test breaks even though the CLI behavior didn't change.

**Instead:** Use `ProjectBuilder` methods in `beforeEach` or as inline fixture calls. If `ProjectBuilder` doesn't support your scenario, extend it with a new static method rather than inlining. See `ProjectBuilder.dualScopeWithGlobalTypes()` as an example of encapsulating complex setup. See [test-data.md](./test-data.md).

### Never use `readFile`/`readdir` in `it()` blocks for assertions

**What:** `const content = await readFile(configPath, "utf-8"); expect(content).toContain(...)`.

**Why:** This couples the test to the file's path and format. The assertion should describe what the user sees, not how the CLI stores it.

**Instead:** Use matchers: `await expect(project).toHaveConfig({ skillIds: [...] })`. See [assertions.md](./assertions.md).

**Exception:** Lifecycle tests sometimes read specific file content for detailed assertions that no matcher covers (e.g., checking YAML frontmatter fields). This is acceptable in lifecycle tests where the assertion is about compilation output, not implementation details. If you find yourself doing this in 3+ places, add a matcher.

### Never inline mkdir + createPermissionsFile for dual-scope setup

**What:** `await mkdir(fakeHome, { recursive: true }); await createPermissionsFile(fakeHome);` inside an `it()` block.

**Why:** `createTestEnvironment()` from `dual-scope-helpers.ts` does this correctly and includes the permissions file. Inlining risks forgetting `createPermissionsFile`, which causes flaky PTY hangs.

**Instead:** Use `const env = await createTestEnvironment()` which returns `{ fakeHome, projectDir, tempDir }`.

### Always capture and clean up ProjectBuilder temp dirs

**What:** `const project = await ProjectBuilder.editable({ ... });` without storing the parent temp dir.

**Why:** `ProjectBuilder.editable()` internally calls `createTempDir()` and creates a subdirectory. If only `project.dir` is stored, the parent temp dir leaks. Over many test runs, `/tmp` accumulates orphaned directories.

**Instead:** `tempDir = path.dirname(project.dir);` then clean up in `afterEach`:

```typescript
afterEach(async () => {
  if (tempDir) {
    await cleanupTempDir(tempDir);
    tempDir = undefined!;
  }
});
```

### Never construct paths with `path.join` in test assertions

**What:** `const configPath = path.join(dir, ".agents-inc", "claude", "config.ts"); expect(await fileExists(configPath)).toBe(true)`.

**Why:** Testing file existence without checking content is weak (an empty file passes). And the path construction couples to directory structure.

**Instead:** Use content-aware matchers: `await expect({ dir }).toHaveConfig({ skillIds: [...] })`.

### Never assert the ABSENCE of a source folder by one of its names

**What:** `expect(await listFiles(dir)).not.toContain(DIRS.SOURCE_CLAUDE)`.

**Why:** a source folder is spelled more than one way on disk — the `.agents-inc` parent with `.agents-inc/claude` or `.agents-inc/codex` under it — so an assertion naming one of them is answered by the others. Both shapes below are vacuous rather than wrong:

- `listFiles` is a top-level `readdir`, so it can answer `.agents-inc` and can never answer `.agents-inc/claude`. A `not.toContain` over a two-segment name is true of every directory on the machine.
- either shape after an uninstall stays green with an emptied `.agents-inc/` sitting where the install was — a directory naming this product with nothing in it, which a later `init` and `doctor` both read as a half-built layout.

**Instead:** `await expectNoSourceFolder(dir, reason)` from `e2e/assertions/source-folder-assertions.ts`, which asks after every name and reports the roster it found; or `expectOnlySourceFolder(dir, [DIRS.SOURCE_ROOT, DIRS.SOURCE_CLAUDE], reason)` where a folder is MEANT to be there and which one is the claim. `reason` is your own sentence about the promise being tested, and it leads the failure.

---

## Production Imports

### Never import from `src/cli/` in test files

**What:** `import { CLAUDE_DIR } from "../../src/cli/consts.js"` in a `.e2e.test.ts` file.

**Why:** E2E tests exercise the CLI as a black box. Importing production code breaks this boundary. It also means the test may silently depend on production behavior that changes.

**Instead:** Use `e2e/pages/constants.ts` for paths (`DIRS.CLAUDE`), files (`FILES.CONFIG_TS`), text (`STEP_TEXT`), timeouts (`TIMEOUTS`), and exit codes (`EXIT_CODES`).

**Acceptable:** `import type { SkillId } from "../../src/cli/types/index.js"` -- type-only imports have no runtime effect.

---

## Reading Rendered Output

### Never treat `getOutput()` as a log of every frame

**What:** Pressing a navigation key and then asserting on `getOutput()` on the assumption that "the accumulated output holds a frame where the row rendered in the form I want" — typically to reach a row that has since scrolled out of the viewport, or one that a later repaint replaced.

**Why:** `TerminalSession.getFullOutput()` reads xterm's **processed buffer** (`xterm.buffer.active`) — the current screen plus whatever genuinely scrolled off. Ink redraws in place, so when a frame fits the viewport (the common case at `TERMINAL_SIZE.TALL`) each repaint OVERWRITES the previous one and nothing enters scrollback. The earlier frame is gone. Verified empirically against the real binary: a marker present in `getOutput()` before a navigation key press is absent after it, while `getRawOutput()` still holds it.

**Instead:** assert at the moment the frame is on screen (capture before the key press), or use a raw-output surface — `InteractivePrompt.getRawOutput()` / `InteractivePrompt.waitForRawText` / `TerminalScreen.waitForRawText`. Raw PTY output is append-only and is the only frame-accumulating surface.

**Corollary — do not manufacture a different render state with a key press.** When a row renders differently focused vs unfocused (padding, chevrons, highlight), assert against the state actually on screen at capture time. If a press is unavoidable, first establish which row holds focus: where a list seeds focus past inert rows, "the first row" and "the first focusable row" differ, and a single arrow press may move focus ONTO the row under test rather than away from it. Both halves of this were established the same way, by a throwaway probe spec against the real binary rather than by reading the harness: the marker was present in `getOutput()` before the move, absent after it, and still in `getRawOutput()` throughout.

### Never assert that text is ABSENT from a screen the session once legitimately drew

**What:** a `not.toContain` on `getScreen()` to prove a screen was replaced.

**Why:** `TerminalSession.getScreen()` is **not viewport-only, despite its name.** It reads absolute buffer lines `0 .. viewportY + rows`, so once the session has any scrollback the range is scrollback **plus** viewport. Any text drawn earlier in the session is still matchable, and the method's own JSDoc states the same range. The assertion tests the emulator's memory, not the process's current output — so it fails against residue whether or not the behaviour under test works, and the failure looks like a product bug.

This is the **converse** of the `getOutput()` rule above, not a restatement. That rule warns against asserting a past frame was _present_; this one is about asserting a past frame is _absent_ now. `getOutput()` has the same exposure, more obviously.

**Instead:** prove the negative by **order** — the expected text is the LAST thing painted (`toMatch(/…$/)`), so nothing was drawn after it — or by **behaviour**: drive the session and assert the outcome the absent element would have changed.

### Never leave a workaround in a test's JSDoc without a spec that pins the un-worked-around form

**What:** A spec that sidesteps a rendering difference — padding, chevrons, highlight width, marker spacing — to assert something else, and explains the dodge in a comment.

**Why:** A JSDoc explaining a workaround is a **defect report** unless some spec asserts the form being worked around. Once the dodge is written down it propagates: every later spec inherits it, none asserts the un-worked-around form, and the defect becomes structurally invisible. The suite is green precisely because nothing looks.

**Instead:** the spec must either cite a finding for the difference, or point at the spec that asserts it head-on.

```typescript
/**
 * Captured unfocused because <difference>. The focused form is pinned by
 * <spec that asserts it>.e2e.test.ts.
 */
```

And when the underlying defect is fixed, delete the dodge paragraphs — they read as superstition otherwise.

**Corollary — construct the focus, do not navigate to it.** When a spec needs a row in a particular focus state, build a fixture where that row is the only one that can hold focus rather than pressing a key to get there. A key press manufactures a different render state and reintroduces the `getOutput()` problem above.

### Never write a colour assertion in an E2E test

**What:** `expect(output).toContain("\x1b[38;2;...")` or any assertion that a marker is green/red, in an `.e2e.test.ts`.

**Why:** The terminal harness runs with `NO_COLOR=1` / `FORCE_COLOR=0` (deliberately, so xterm buffer reads stay clean). Colour is not present in the captured output at all — an E2E spec can only assert the marker, never the colour.

**Instead:** colour is testable ONLY at the component-test layer, and even there it needs a forced chalk level, because Ink colourises through chalk (`ink/build/colorize.js` calls `chalk.hex` / `chalk.bgHex`) and chalk auto-disables on vitest's non-TTY stdout. Without the forced level a colour assertion is not merely hard, it is **unobservable** — `<Text color backgroundColor>` renders with every escape sequence stripped, so the assertion fails for a reason that has nothing to do with the product. A contract phrased as "these two surfaces render the same colour" needs a component test; an E2E marker assertion does not cover it.

**Never downgrade a failing colour assertion to a text-only one.** A colour assertion that fails because no ANSI was emitted is a harness gap, not a product bug — and silently weakening it is exactly how a colour regression stays invisible.

---

## Index-Based Navigation

### Never reach an item by counted arrow presses alone

**What:** counted arrow presses to reach a specific item, with nothing checking which item they reached.

**Why:** Adding or reordering items breaks these tests silently. The test passes but selects the wrong item.

**Instead:** name the row the presses must land on. `DashboardSession.chooseOneKeyAtATime(downs, focusedRow)` waits for `focusedRow` before pressing Enter, so a reordered menu fails on the wait rather than choosing the wrong option.

**Exception:** `InteractivePrompt` may need index-based navigation where a prompt's items lack unique text. Document the assumption at the press.

### Never dead-reckon navigation

**What:** A page-object navigator that keeps a keystroke-count model of position — counting presses to an item and carrying that model across calls.

**Why:** the model is a claim about the component's key handling, and when it is wrong the suite stays green: the wrong item is chosen just as successfully as the right one. One such model was wrong for two releases.

**Instead:** navigation MUST be closed-loop — read the focused item off the rendered screen rather than inferring it from a count, and never carry a position model between calls. Close the loop on something painted as text: under `NO_COLOR` a focus shown only by colour or border is unobservable. **Match labels EXACTLY wherever one label can be a substring of another** — `includes(label)` then stops on the wrong item; strip the decoration around the label (badges, glyphs, annotations), keep the focus marker, and compare with `===`.

### Never write a page-object bound that stands for a catalogue count without naming the count

**What:** A numeric constant in a page object — a walk length, a press budget, a retry ceiling — tuned to how large the catalogue was on the day it was written, and commented in the form "N covers any realistic count".

**Why:** that comment names no measurement, so nothing tells the next taxonomy edit that N has gone short — and the failure the short bound produces names the wrong cause. A focus walk bounded at 30 Tab presses, commented "30 covers any realistic per-domain category count", stopped covering one cycle when a domain went from 26 categories to 33 — and a walk that wraps has to clear one full cycle of the largest count with headroom for swallowed keystrokes on top. The walk then failed on a category it had **not reached yet**, reporting a press count that read exactly like the item being absent. Adding categories broke it without touching a component, a behaviour or a rule.

**Instead:** the comment states which count drives the bound, which data that count was measured against, and what running out looks like — so the number is a grep target for the next taxonomy edit rather than a bare literal.

That is the floor, not the fix. The same bound, raised to 50 and re-commented exactly as prescribed, still produced a red CI build (run 32338714325): the walk pressed BEFORE reading the screen, so a target in the category the grid opened on cost a full lap, and a press assumed to have landed let the walk skip past its own target. A bound documented to this standard survives a taxonomy edit; it does not survive being the wrong shape. What replaced it terminated on the structure being walked rather than on a count — it stopped on observing a category it had already seen, one real lap with every category looked at once, and named what it walked. Whether that generalises into a rule of its own has not been ruled; until it is, if a numeric bound is what the situation gives you, name the count it stands for.

The census is short enough to read every time, and each hit is judged on whether its comment names a count:

```
grep -rnP 'const [A-Z_]+ = [0-9]+;' e2e/pages --include='*.ts'
```

### Never give a TOGGLE keystroke the retry a monotonic keystroke takes

**What:** copying the shape of an Enter or Tab retry onto Space — press, check whether something happened, re-press if it did not.

**Why:** Enter and Tab are monotonic. "Did the next screen paint" and "did focus move" cannot be un-answered by pressing again, so a re-press of a keystroke Ink swallowed costs nothing and a re-press of one that landed is at worst wasted. Space toggles. A re-press of a press that DID land turns the selection back off, converting a dropped keystroke into a double keystroke — and nothing else in the suite can see it, because an item toggled twice leaves exactly the bytes of an item never toggled, and every assertion in the suite reads where the selection ENDED.

**Instead:** confirm against the TARGET STATE of a NAMED subject — one item's own rendered text, matched on the exact label — never against "the frame changed". Compute the target ONCE from the pre-press reading and hold it, so the loop exits on having observed it however many presses were swallowed or doubled. Pay a bounded re-read only from the second press on, where an earlier press can still be in flight. And where a method has no subject to name, say so at the method and leave it open-loop rather than inventing an observable that does not distinguish the states.

---

## Hardcoded Strings

### Never use raw UI text in tests

**What:** `await expect(output).toContain("initialized successfully")`.

**Why:** When UI text changes, every test that hardcodes the old text breaks. Constants centralize the change to one file.

**Instead:** Use `STEP_TEXT` constants: `expect(output).toContain(STEP_TEXT.INIT_SUCCESS)`.

### Never reconcile two asserted strings by editing the constant between them

**What:** Pointing several specs at one `STEP_TEXT` member when the strings they assert differ — some asserting a prefix, others the full rendered line — and closing the gap by shortening or lengthening the member.

**Why:** a `STEP_TEXT` entry holds the string a test asserts, byte for byte, not the string the product renders. Lengthening it weakens every negative assertion using it; shortening it weakens every positive one. `init` renders `Installing skill plugins...`; some sites assert the ellipsis form positively and others the bare form negatively. One member cannot serve both without silently changing what one of the two groups can fail on — and a literal-to-constant sweep that does not know this is unsafe in both directions.

**Instead:** add a second entry. Name the pair `X` (loose, for `waitForText`) and `X_<QUALIFIER>` (the exact rendered form), and comment which is which. `INSTALLING_PLUGINS` / `INSTALLING_PLUGINS_ELLIPSIS` and `UNINSTALL_PREVIEW` / `UNINSTALL_PREVIEW_HEADING` are the shipped pairs, each carrying that comment at its definition.

**Two entries may share a value when their ROLES differ.** A sentinel passed to `waitForText` is not a label passed as a function argument, even when both hold the same string, so they are separate members and the second says so in a comment. Prefer a second named entry over reusing a sentinel as data, and over a file-local constant each spec re-declares instead.

Which CLAUSE of a message a sentinel should hold is a different question, answered in [assertions.md § A Sentinel Must Name the Substantive Claim](./assertions.md).

### Never use inline timeout numbers

**What:** `it("test", { timeout: 180000 }, async () => {})` or `await prompt.waitForExit(60000)`.

**Why:** Magic numbers are impossible to grep for and easy to miscalibrate.

**Instead:** Use `TIMEOUTS` constants: `{ timeout: TIMEOUTS.LIFECYCLE }`.

### Never use hardcoded path segments

**What:** `".claude"`, `".agents-inc"`, `"config.ts"`, `"SKILL.md"`.

**Instead:** Use `DIRS.CLAUDE`, `DIRS.SOURCE_ROOT`, `FILES.CONFIG_TS`, `FILES.SKILL_MD` from constants.

---

## Inline Test Data

### Never create project fixtures inline in tests

**What:** `await mkdir(path.join(tempDir, ".agents-inc", "claude"), { recursive: true }); await writeFile(...)` inside a test file.

**Why:** Duplicates setup logic. When the config format changes, every inline fixture breaks.

**Instead:** Use `ProjectBuilder` methods or `writeProjectConfig()` from test-utils. See [test-data.md](./test-data.md).

### Never inline mkdir + writeFile for agent stubs

**What:** `await mkdir(agentsDir); await writeFile(path.join(agentsDir, "web-developer.md"), "---\nname: ...\n---\ncontent")` inside an `it()` block.

**Why:** Duplicates across files and couples tests to the agent file format.

**Instead:** `writeAgentFile()` or `writeAgentStubs()` from `test-utils.ts`.

**Exception:** When creating intentionally corrupt/invalid files for error-path tests, inline construction with an explanatory comment is acceptable. The shape that exception has to take is the rule below.

### Never "fix" an invalid-by-design fixture into a valid one

**What:** A metadata/frontmatter sweep converting a raw template string to `renderMetadataYaml()` / `renderSkillMd()` / `renderAgentYaml()`, or a config sweep converting a raw `config.ts` string to `writeProjectConfig()`, at a site whose whole subject is that the bytes do not parse.

**Why:** the renderers' contract is to emit well-formed output, so no argument to them can ever produce a file the loader refuses — the class is **permanently** outside them, not merely awkward. Every one of these sites matches the grep a sweep runs (`writeFile(..., FILES.METADATA_YAML, ...)`, a backtick template written to `SKILL.md`, a string written to `config.ts`), so each sweep re-proposes them; and a sweep that reads the no-inline rule as absolute deletes the only thing the spec asserts **with no assertion changing to signal it**. The spec keeps its name, keeps its shape, and stops testing the refusal it was written for.

**Instead:** keep the raw string (or the factory that returns one — `renderUnparseableConfigTs()`, `renderUnparseableMetadataYaml()`, `renderUnparseableSkillMd(id)`), hold it in a named file-level constant with a JSDoc saying what makes it invalid, and assert on the CLI's refusal rather than on the write. The live sites, so a sweep can confirm an exception is known rather than re-deriving it:

| Fixture                                                                                                                                        | What must stay unparseable                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `UNPARSEABLE_YAML` in `compile-malformed-skill-metadata`, `local-skill-invalid-metadata-yaml` and `edit-refuses-unusable-local-skill-metadata` | `metadata.yaml` — a flow-mapping opener followed by nested compact mappings       |
| `SYNTAX_ERROR` in the `*-corrupt-config` specs, `uninstall-from-scratch-scopes` and `config-unreadable-stops-the-guess`                        | `config.ts` — a file that EXISTS and cannot be loaded, which is `ConfigLoadError` |
| The two fixtures in `compile-edge-cases`' "broken YAML in skill metadata" block                                                                | an unbalanced-quote `SKILL.md` frontmatter, and the same unparseable metadata     |
| The empty-`metadata.yaml` agent in `integration/custom-agents`                                                                                 | zero bytes where the agent loader requires a field set                            |

A second class is real and currently has **no instance**: a fixture that must OMIT a field the renderer always emits. `contentHash` is still typed required on `SkillMetadataFields` (`src/cli/lib/__tests__/content-generators.ts`), so a fixture needing a `metadata.yaml` without it would have to be a raw string too — but every `metadata:` value under `e2e/` currently goes through `renderMetadataYaml`, and the omission of a REQUIRED field has its own sanctioned route in `renderIncompleteMetadataYaml(fields, ["category"])`, which makes the fixture ask for the breakage by name. Unlike the class above, this one is retirable by making the field optional. Do not carry a worked example forward for it until one exists.

```
grep -rn 'UNPARSEABLE_YAML\|SYNTAX_ERROR' e2e --include='*.ts'
```

---

## Fixture Selection

### Never let a fixture rely on a factory default for the state the test's name claims

**What:** A spec named for a scope whose fixture leaves that scope unstated.

**Why:** the defaults point opposite ways — `buildSkillConfig` writes `project`, `e2eStackPayload` rests everything `global` — so an unstated scope is a coin flip, and the named assertion can pass while the spec tests the other scope.

**Instead:** when a spec's name asserts a scope, source, or mode, the fixture must set it EXPLICITLY. Never inherit it from a factory default.

**Corollary — incidental `toHaveLength` assertions are contracts too.** A row/entry count in a spec whose stated subject is a flag silently pins derivation behaviour the spec never claims to own. Either assert the count deliberately with a comment saying why that count is the contract, or assert on the specific row (`rows.find(...)`) instead of the collection.

### Never name a spec for a source whose data the fixture does not ship

**What:** A spec named for one catalogue's content, driving a list that came from somewhere else, with a comment reconciling the two.

**Why:** the comment does not fail when the substitution it describes goes away. Two suites pointed at the real skills clone drove a list that came from the CLI's own built-in fallback rather than from the clone, one asserting on it under a name claiming otherwise. Neither suite was wrong about the CLI at the time; the record of the swap was a comment, so when the substitution was withdrawn both failed in `beforeAll` on a wait for a screen that no longer rendered. The failure named a timeout, not the assumption.

**Instead:** when a fixture cannot supply the subject, the spec's NAME and its assertions both move to what is actually under test — and add the positive the suite was missing, a spec asserting the substitution did not happen, so that it is something a spec would catch rather than something a suite depends on.

### Never write a fixture literal that mirrors a generated union without diffing it against the union

**What:** A `category`, `domain` or `slug` in a fixture table set to a value no generated union carries. `web-state-zustand` was mapped to a `web-state` category for two passes; the canonical member is `web-client-state`.

**Why:** the field is `string` **on purpose**. `renderMetadataYaml`'s `SkillMetadataFields` types `category` loosely so error-path fixtures can author deliberately invalid values, so narrowing it would break the fixtures that need it. The compiler will therefore never validate a fixture's category, and the wrong literal sat in the table every fixture skill's metadata is written from, with the suite fully green, because no assertion happened to read it. This is a review-discipline gap by construction, which is why it has to be written down rather than enforced.

**Instead:** when adding or editing an entry, grep the value against `CATEGORIES` in `src/cli/types/generated/source-types.ts` and confirm it is a member — or, if it is deliberately not one, say so in a comment naming the test that depends on it. The table in `e2e/fixtures/project-builder.ts` carries that constraint above it, naming both the authoritative union and the `web-state-*` trap specifically.

**Corollary: "no test failed" is not evidence a fixture value is correct.** Fixture correctness is established against the product's source of truth, never against the suite's exit code. What a fixture must WRITE, as opposed to what it may NAME, is [test-data.md § A Fixture Writes Content the Product Could Have Written](./test-data.md).

---

## Harness Invariants

### Never pair two harness spawners on their default HOME

**What:** A spec that writes through one spawner and reads through another without passing HOME to both.

**Why:** the defaults differ. A PTY session that installs global content to its sibling HOME, followed by a `CLI.run` that reads with `HOME=projectDir`, disagrees on where "global" lives. The symptom is not an obvious assertion failure — it is `ENOENT scandir <projectDir>/.claude/skills` from a command that looked unrelated.

**Instead:** `TerminalSession` and `runCLI` default HOME to a temp dir distinct from `cwd`/`projectDir`, and an explicit `env.HOME` always wins and is never auto-removed. `CLI.run` is the exception: its precedence is `options.env.HOME` > `project.globalHome` > `project.dir` (`globalHomeFor`), so a spec pairing it with either of the others passes HOME explicitly. Any new spawner must adopt the temp-dir default.

### Never split HOME from cwd when a follow-up command resolves its target from cwd

**What:** A flow whose install puts global content under a HOME distinct from `projectDir`, followed by `uninstall` — or a command that runs `claude plugin install` — expected to act on it.

**Why:** `detectUninstallTarget` calls `resolveInstallPaths(projectDir)` with **no scope argument**, so every path `uninstall` probes is built from `projectDir` alone and it cannot see out-of-cwd global content whatever HOME says. A global-scope `claude plugin install` writes `enabledPlugins` into HOME's `settings.json` rather than the project's. The follow-up silently no-ops ("not installed in this project", or plugin enablement in the wrong `settings.json`) and still exits 0 — which is why the failure lands on a downstream assertion rather than on the command.

**Instead:** model the whole flow as the GLOBAL install, `HOME === cwd === projectDir`, so every artifact collapses onto `projectDir` and the follow-up finds it.

### Never let two phases of one test allocate separate HOMEs

**What:** A multi-phase test (init -> edit, or edit -> edit) whose later phase must see an earlier phase's global-scoped content, with every phase left on its default HOME.

**Why:** `TerminalSession` and `runCLI` allocate a FRESH HOME per call, so phase 2's HOME is not phase 1's. Phase 1's compiled agents, ejected global skills and plugin enablement are invisible to phase 2 — and the failure surfaces as "the command doesn't see what I just installed", not as a HOME problem.

**Instead:** allocate one dir in the test and pass it as `env.HOME` to every phase. An explicit HOME is never auto-removed, so the test cleans it up itself. Pass the same dir to any `CLI.run` phase via `project.globalHome` or an explicit `env.HOME`.

### Never try to vary an input the OS canonicalizes before the process sees it

**What:** An E2E spec that builds a symlinked sandbox — or otherwise perturbs the path a directory is reached BY — to exercise path-normalization behaviour in a command that takes its target from `process.cwd()`.

**Why:** `process.cwd()` is `getcwd(2)`. The kernel returns the canonical path with every symlink already resolved and does not consult `$PWD`, so spawning a child with `cwd: <tmp>/link/proj` gives that child `process.cwd() === <tmp>/real/proj` — measured directly in this environment. The distinction the spec exists to create is erased before any production line runs; `path.resolve` and `realpathSync` agree on an already-canonical path, and the spec passes identically against the bug and against the fix. The harness chooses WHICH directory a command runs in. It can never choose by WHICH PATH that directory is reached.

**Instead:** cover it one layer down, where the path is still a parameter the test supplies — `local-installer.test.ts` → "should deregister a project reached through a symlinked ancestor" is the shape. Keep the E2E for the plain-path contract. Before writing any E2E whose subject is how a path is normalized, ask whether that value reaches production through `process.cwd()` — if it does, this layer cannot express the case, and a spec claiming otherwise advertises coverage that does not exist.

---

## Reachability

### Prove the surface is reachable before writing the spec

**What:** Writing an E2E for a branch or a guard without first establishing that a user action reaches it in the flow under test.

**Why:** a spec for an unreachable branch has two possible outcomes and both are bad, neither visible from reading it. Either it is RED against correct code, because it asserts a state no flow can produce, or it is a vacuous pass, because fixed and unfixed code emit identical output when the precondition never holds.

**Instead:** grep the callers of the function that holds it, then trace which config feeds the state the branch reads and which gates stand between a user action and it. If nothing reaches it, cover the behaviour at unit level and say so in the response to whoever asked for the E2E, rather than writing the spec and letting the plan keep calling the fix user-visible. Do not synthesize a flow the UI cannot produce, and never settle for an absence-only assertion: a blocked action satisfies one vacuously.

---

## Duplicated Helpers

### Extract shared assertion helpers at 2+ files

**What:** The same assertion function or navigation flow defined identically in two or more test files.

**Why:** Duplicated helpers drift. When one copy is updated, the other silently becomes incorrect.

**Instead:**

- Assertion functions used in 2+ files -> extract to `e2e/assertions/` (e.g., `config-assertions.ts`, `scope-assertions.ts`)
- File/fixture WRITERS used in 2+ files (anything that emits a file into a project or scope dir) -> extract to `test-utils.ts`, beside their well-formed counterparts. Same 2+ threshold as assertion helpers and for the same reason: two copies of a writer drift, and the stale one stops producing the state its spec name claims. `writeCorruptConfig(baseDir, source)` sits next to `writeProjectConfig` / `writeConfigTypes` as the error-path sibling that reproduces a config which EXISTS and cannot be loaded. Until this line existed the list had no threshold for writers at all, so its literal reading permitted a second file-local copy
- Navigation flows used in 2+ files -> methods on the page object
- Setup patterns used in 3+ files -> new `ProjectBuilder` static method. This threshold governs whole-project-directory setup and nothing else — `ProjectBuilder` is the wrong home for a single-file write however many callers it has
- Assertion patterns -> new custom matcher in `project-matchers.ts`

---

## Creating New Helpers

### Always check existing shared helpers before writing local ones

**What:** Defining a local function in a test file (e.g., `function skillsPath(...)`, `function addForkedFromMetadata(...)`) without first checking `test-utils.ts`, `dual-scope-helpers.ts`, and `constants.ts`.

**Why:** The shared utilities grow over time. A helper you need likely already exists. Duplicating it means two copies that drift apart.

**Before writing any helper function in a test file:**

1. Grep `e2e/helpers/test-utils.ts` for the function name or a similar name
2. Grep `e2e/fixtures/` for related helpers
3. Grep `e2e/pages/constants.ts` for the constant value
4. Grep `e2e/assertions/` for assertion utilities
5. Grep `e2e/fixtures/expected-values.ts` for expected value constants

**Where new helpers belong:**

- Path helpers (like `skillsPath`, `agentsPath`) and single-file writers (like `writeProjectConfig`, `writeCorruptConfig`) -> `test-utils.ts`
- Dual-scope lifecycle helpers -> `dual-scope-helpers.ts`
- Constants (paths, timeouts, text) -> `constants.ts`
- Project creation patterns -> new `ProjectBuilder` method
- Assertion utilities -> `e2e/assertions/` (phase-assertions, scope-assertions, uninstall-assertions)
- Agent matchers -> `e2e/matchers/agent-matchers.ts`
- Expected value constants -> `e2e/fixtures/expected-values.ts`

---

## Sweeping Test Files Mechanically

### Never transform structured TypeScript with a multi-line regex

**What:** Adopting a helper across N call sites with a `perl -0777` non-greedy pass or a `sed` range — `s/categories: (\{.*?\}) as Record<Category, CategoryDefinition>/categories: buildCategoryMap($1)/gs` and its siblings.

**Why:** balanced braces, interleaved cast-less siblings and string literals cannot be matched reliably. Test fixtures carry cast-LESS `categories: {` blocks between the cast-bearing ones, so `.*?` under `/s` runs past statement boundaries hunting the next ` as Record<…>`, and the inserted opening paren stops matching its close. The damage that makes this worth a rule is what it did inside `config-types-writer.test.ts`: it rewrote the EXPECTED STRINGS in two assertions, turning `toContain("export type StackAgentConfig = {")` into a claim about `buildCategoryMap({`. `tsc` cannot see that — the file still parses, and the assertion is still an assertion. It is only wrong.

**Instead:** exact-string `replace_all` on the leaf token, or a per-site edit; then `tsc --noEmit` and the file's own tests after each file. Reserve regex for single-line, token-level, whitespace-insensitive substitutions. A sweep that can silently edit an expected value is a sweep that can silently delete coverage.

---

## Parser/Extractor Helpers in Test Files

### Never define parser/extractor helpers with non-trivial logic inside a test file

**What:** A local helper — a loop, a regex scan (`/([+\-~•])\s+[A-Za-z]/`), a `currentScope` state-machine variable that toggles on label matches, or a first-match-wins rule that plucks diff prefixes out of `lastFrame()` / `getFullOutput()`.

**Why:**

1. **The helper has non-trivial logic and no tests.** A state machine and a regex capturing one of several diff characters would need its own tests to be trusted. An uninstrumented parser silently produces wrong answers when layout changes.
2. **It obscures the rendered contract.** The actual contract is the substring `"+ React"` / `"• React"` in the frame. A parsed-struct indirection hides what the component produces and what the bug shape looks like.
3. **It drops the bug-shape negative check.** `toStrictEqual` on a parsed struct only implicitly negates at the scopes the helper happened to look. Explicit `not.toContain("<bug-prefix> <name>")` is strictly stronger.

**Instead:** Assert directly on `lastFrame()` / `getFullOutput()` with `toContain("<prefix> <name>")` for each expected row plus explicit `not.toContain(...)` for every diff prefix that must NOT appear. When two rows share the same prefix, prove it by exhaustively negating all other prefixes (see [assertions.md § Diff-Shape Assertions](./assertions.md)).

If a helper is genuinely reusable across 2+ test files, move it to `src/cli/lib/__tests__/helpers/` WITH its own unit tests — never inline and untested, and never to `e2e/helpers/`, where no vitest project collects a `*.test.ts` and the test would never run while reading as coverage. Specs reach it through `e2e/helpers/test-utils.ts`, which imports each helper by name and names it in its single `export { ... }` block; `journey-page.ts` is the exemplar, carrying `journey-page.test.ts` beside it. Full rule: [README.md § No parser/extractor helpers in test files](./README.md).

### Never `split` / loop / filter over raw `config.ts` text to prove an entry exists or does not

**What:** Picking config data out of the emitted file as text.

```typescript
// RETIRED — kept as the shape to recognise, not as a live site. This exact block stood in
// three specs at once, scope-toggle-combined and scope-toggle-config-snapshot among them.
const honoProjectLines = projectConfig
  .split("\n")
  .filter((l: string) => l.includes(E2E_SKILL.hono.id) && l.includes('"scope":"project"'));
expect(honoProjectLines, "the collapsed pair must leave no project-scope entry").toStrictEqual([]);
```

**Why:** it is a claim about the config writer's line breaking, not about the config. The scan only finds an entry while the writer keeps that entry's `id` and its `scope` on one emitted line, so a pure formatting change reads as a product regression in the positive direction — and in the negative direction above it is worse: the filter finds nothing, the `toStrictEqual([])` passes, and the spec reports that a project-scope entry is absent when all that happened is that the writer wrapped.

**That hazard is not hypothetical, and the retired block above shows the whole of it.** On 2026-08-26 an owner ruling made both emitted halves a prettier fixed point, and every byte moved: `"scope":"project"` became `scope: 'project'`, so the filter's needle stopped existing. Nothing about the config changed. In the negative form that spec used, the scan would have gone on passing.

**Instead:** load structurally. `readSkillEntries(dir, skillId)` (`e2e/fixtures/dual-scope-helpers.ts`) returns that skill's entries and is filtered on `scope`; `loadConfigOrFail(dir)` and `readAgentEntriesFor(dir, name)` (`e2e/helpers/test-utils.ts`) cover the rest. Reading raw config text with a single `toContain` for one token — `"excluded: true"` — stays acceptable; the ban is on split/loop/filter extraction, matching CLAUDE.md's wording. **Re-derive that token before writing one**, rather than copying it from here or from a neighbouring spec: it is a claim about the writer's exact bytes, which the ruling above has already moved once. `packages/compile/src/contract/emission-scenarios.ts` is where those bytes are written down.

`scope-toggle-combined` and `scope-toggle-config-snapshot` now assert `readSkillEntries(projectDir, E2E_SKILL.hono.id)` against `toStrictEqual([{ id, scope: "global", origin: "eject" }])` — which says more than the retired scan did, because it pins what the collapse LEFT as well as what it removed, where `toStrictEqual([])` could only ever say "nothing matched my filter". `scope-change-deselect-integrity` compares `(await loadConfigOrFail(fakeHome)).skills` against a structurally-loaded before-snapshot rather than two line scans of the same text.

The suite holds no split/loop/filter over raw `config.ts` text, and since the normalizers moved out it holds no `split` over config text at all. Re-derive rather than trusting that, because the sentence goes quietly wrong the first time a spec splits a config:

```
grep -rn 'split("\n")' e2e --include='*.ts' | grep -v handrun.gen
```

The whole-file normalizer `normalizeGlobalConfig` lives in `src/cli/lib/__tests__/helpers/config-comparison.ts` with its own spec and reaches specs through `e2e/helpers/test-utils.ts`; it hands a whole config to an equality and extracts nothing, which is what keeps it outside this ban.

### Never put an extractor in front of an assertion

**What:** A `find`-based lookup that pulls the entry out of a loaded structure just before asserting on it.

**Why:** the lookup decides what the assertion can fail on. A lookup-then-assert asks "does this category CONTAIN an entry with this id, and is its `preloaded` right?"; the direct form asks "is this category EXACTLY this value?". Everything the writer additionally emitted — a second skill fanned out by a curation regression, an array where a bare string belongs — is invisible to the first question and caught by the second. Per-agent curation fails by an agent GAINING an entry it was not meant to hold, so a lookup on the assertion side silently narrows every call site in its file.

**Instead:** produce the value and assert on it whole. The verbosity is the point:

```typescript
const config = await loadConfigOrFail(projectDir);
expect(config.stack).toStrictEqual({
  "api-developer": { "api-api": [{ id: "api-framework-hono", preloaded: true }] },
  "web-developer": { "web-client-state": [{ id: "web-state-zustand", preloaded: false }] },
});
```

`edit-from-adds-to-global-sub-agents.e2e.test.ts` → "joins the new skill's row to the held sub-agent and leaves the other as installed" is the live shape.

**The one legitimate local helper is a spec whose subject IS the serialized form** — the writer's compaction, which a structural loader normalizes away on read, so no structural assertion can express it. It must be a pure slice-and-`JSON.parse` with no per-shape branching, it must carry a JSDoc naming the writer/loader pair it deliberately bypasses, and it must never appear on the assertion side. Without that carve-out written down, a surviving helper reads as an unfixed instance of the ban arguing with the rule in a comment.

---

## Weak Assertions

### Never wrap assertions in fileExists conditionals

**What:** `if (await fileExists(settingsPath)) { expect(settings).toHaveProperty("permissions"); }`

**Why:** If the file is missing (e.g., because the command failed to create it), the entire assertion block is silently skipped. The test appears to pass with zero assertions executed.

**Instead:** Assert the file exists unconditionally first, then check content:

```typescript
expect(await fileExists(settingsPath)).toBe(true);
const settings = JSON.parse(await readTestFile(settingsPath));
expect(settings).toHaveProperty("permissions");
```

Or better, use a matcher: `await expect(project).toHaveSettings({ hasKey: "permissions" })`.

### Never soften a config load

**What:** `(await loadProjectConfigFromDir(dir))?.config` in a spec, or any load followed by `?? []`, `?? {}`, `?? ""`.

```typescript
const projectConfig = await loadProjectConfigFromDir(projectDir);
const projectSkillIds = projectConfig?.config.skills.map((s) => s.id) ?? [];
expect(projectSkillIds).not.toContain(VUE_SKILL_ID);
```

**Why:** a missing `config.ts` — the exact failure a spec like this exists to catch — yields an empty array, and the empty array satisfies every `not.toContain` and every `toHaveLength(0)` downstream. The test reports green for a project that has no config at all. Note the asymmetry that makes it survive review: the file this was found in loaded a config two blocks earlier and pinned non-nullness explicitly, so one load was safe and its neighbour vacuous, and nothing marked the difference.

**Instead:** `loadConfigOrFail(dir)` from `e2e/helpers/test-utils.ts`, which throws on a config that is absent or unparseable and returns `ProjectConfig` directly. This is the spec-side face of CLAUDE.md's ban on optional chaining and null coalescing over data that must exist; the rule was only ever being enforced on `src/`. The mechanical check is cheap: no spec under `e2e/` calls `loadProjectConfigFromDir`.

### Never let a gate filter its own subject

**What:** a reader that selects which elements of a document, listing or output it will judge and drops the rest — `.filter(isSpecReference)`, `.filter(isRelevant)`, skipping a row whose shape it does not recognise. The rule above is the same silence one level down: there the assertion is skipped, here the SUBJECT is.

```typescript
// Bad: a name whose first segment is not a spec directory is dropped, and nothing says so
function isSpecReference(named: string): boolean {
  const [directory] = named.split("/");
  return directory !== undefined && SPEC_DIRECTORIES.includes(directory);
}
```

**The LOOKUP is not the defect — the FILTER around it is.** `SPEC_DIRECTORIES` is a live constant in
`src/cli/lib/__tests__/helpers/journey-page.ts`, and `classify()` performs exactly the membership
test above; it is what tells a name that ought to answer to a spec from one that never claimed to.
What made the block above an anti-pattern is the return type. A `boolean` fed to `.filter` has
nowhere to put the reason, so the two things a `false` can mean — "this is a helper, correctly
excluded" and "this names a spec directory and no file answers to it" — collapse into the same
dropped element. `classify()` answers a `SpecReference` instead and THROWS on the second, which is
the same lookup carrying a verdict rather than a silence. Do not read this example as a reason to
avoid the constant.

**Why:** the elements it dropped are indistinguishable from the elements it passed. The verdict is reported against the survivors and reads as a verdict on the whole, and nothing prints what was skipped or how many. The subject shrinks silently as the document grows.

The filter above ran over `user-journeys.md`'s From-scratch column, whose whole job is to say what has been proved. Six named entries were dropped — five real specs written without the `commands/` directory they live in, and one code symbol — so a quarter of journey 13's named proof was unexamined while the page read as fully checked. The two legitimate non-specs were fine, but the filter decided that once, for every name anyone would ever add: a later entry naming a deleted spec would have gone the same way, on the same silence.

**Instead:** classify totally. Every element gets a kind, including "not the sort of thing this gate judges", and the residue is asserted against an explicit list whose entries each state why they are in it.

```typescript
// Good: three kinds, and the two failure modes kept apart because they mean opposite things
type SpecReference =
  | { name: string; kind: "spec" } // a file answers to it — judge it as before
  | { name: string; kind: "unlocated-spec"; livesAt: string } // a real spec, named without its directory
  | { name: string; kind: "not-a-spec" }; // nothing answers to it — a helper or a code symbol

expect(unlocatedSpecsIn(rows)).toStrictEqual([]);
expect(nonSpecNamesIn(rows)).toStrictEqual(RECOGNISED_NON_SPEC_NAMES);
```

`unlocated-spec` and `not-a-spec` are separate kinds on purpose: the first is a page defect with a known rewrite (`livesAt` names it), the second is a legitimate exclusion that must be justified once, by name, in a constant. Collapsing them back into one bucket restores the original silence under a longer signature.

A gate may exclude something; it may not decide, unrecorded, that it has. This is the "prove the subject is present" rule applied to the reader rather than the frame — a gate must be able to say what it looked at, not only what it concluded.

Live example: `src/cli/lib/__tests__/helpers/journey-page.ts` (classification, with its own tests) and the two assertions in `src/cli/lib/__tests__/spec-gates.test.ts`. Both were shown red before they were trusted — the first naming all five bare specs and the rewrite each needed, then each defect re-introduced singly (one directory prefix dropped back off the page, one unrecognised backticked name added to a journey's cell) with each run reddening on exactly the entry mutated and nothing else.

### Never assert generic absence

**What:** `expect(output).not.toContain("error")`.

**Why:** Matches any text containing "error", including legitimate content like skill IDs or help text.

**Instead:** Assert specific absence: `expect(output).not.toContain("Failed to archive")`.

### Never assert an error path without naming the error

**What:** The generic-presence twin of the rule above — a non-zero exit plus proof that the process produced bytes.

```typescript
// what two --source guard specs asserted, and all they asserted
expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
expect(combined.length).toBeGreaterThan(0);
```

**Why:** every crash satisfies it, including a crash from an unrelated layer. Those two specs were named for `init`/`edit` reporting an unusable `--source`, and what they were actually green on was Ink's raw-mode failure: the run resolved the DEFAULT marketplace instead of refusing the flag, got as far as mounting its interactive screen, and died there because the invoking shell was not a TTY. A ~60-line React reconciler trace satisfied `combined.length > 0`, and would have kept satisfying it with the source guard deleted. The specs never mentioned the path the user typed, and neither did the CLI.

**Instead:** the specific message plus the specific input that provoked it, so the assertion cannot pass for a different failure of the same command. `init-edit-error-guards.e2e.test.ts` now asserts the refusal (`Local marketplace not found:`) together with the offending path, and the flag-parse guard beside it asserts oclif's own `Nonexistent flag: --source` — see [assertions.md § A negative over tool output quotes the tool's own string](./assertions.md).

### Never assert the TYPE of a result in place of its value

**What:** `expect(typeof result.exitCode).toBe("number")` — and its relatives, `expect(result).toBeDefined()` on a spawn, `expect(output).toMatch(/.+/)`.

**Why:** an exit code is always a number. The assertion is satisfied by the command succeeding, by it refusing, by it crashing in an unrelated layer, and by it writing to the wrong machine — so it reports a pass for every outcome the spec could possibly have, which makes it the [vacuous-comparison](./README.md) family in a different syntax. Its cost is not cosmetic: `home-isolation.smoke.test.ts` existed to settle whether a `claude plugin` invocation could be isolated from the developer's real config tree, every assertion in it was this shape, and the question went unanswered long enough that two other specs wrote "we use the REAL HOME because that blocker is unresolved" into their headers and inherited the leak. In the same suite, `plugin-install.smoke.test.ts` wrote its marketplace manifest as an untyped `{ name, plugins: [] }` literal that the Claude CLI rejects outright (`owner: Invalid input: expected object, received undefined`), so a test named "should add a marketplace from a local directory source" had **never once added a marketplace** — and only `expect(typeof result.exitCode).toBe("number")` stood between that and a red run.

**Instead:** assert the outcome. Where the spec genuinely cannot predict one, that is evidence it is not isolated enough to have one — fix the isolation and then assert, rather than widening until everything passes. `home-isolation.smoke.test.ts` is now the worked example of the repair: every claim is read back out of the config tree the invocation wrote to, and paired with the machine's own marketplace list being `toStrictEqual` to how the run found it.

**A test file whose header states an open question is a defect report, and the question has to be answered before the file is called a test.** Two sites survive in `e2e/smoke/plugin-install.smoke.test.ts` — one riding along beside a real `not.toBe(EXIT_CODES.SUCCESS)` and one standing alone as a whole test's only claim:

```
grep -rn 'typeof' e2e --include='*.ts' | grep 'toBe("number")'
```

### Never assert existence without content

**What:** `expect(await fileExists(configPath)).toBe(true)`.

**Why:** An empty or corrupted file passes this check.

**Instead:** Use content-aware matchers: `await expect(project).toHaveConfig({ skillIds: [...] })`.

### Never assert a rendering invariant on a frame where the subject does not render

**What:** A `not.toContain("<bug shape>")` captured on a frame where none of the rows the bug shape is made of are painted.

**Why:** It passes for free. The frame under test contains no candidate for the match, so the assertion is about nothing — it cannot distinguish a fixed product from a broken one.

**Clearing the size gate is not evidence the content is visible.** A terminal at the minimum size can still have every row the bug shape is made of scrolled or clipped out of the frame.

**Instead:** bring the subject onto the screen first, then pair the negative with a **positive guard** asserting the subject IS in the very frame you captured.

```typescript
// Bad: no candidate row is painted, so the bug shape cannot appear either way
expect(screen).not.toContain("<bug shape>");

// Good: prove the subject is painted, then assert the bug shape's absence
expect(screen).toContain("<subject row>"); // positive guard
expect(screen).not.toContain("<bug shape>"); // now about a painted subject
```

This is the same proof-of-execution rule [README.md](./README.md) § Critical Rules applies to conditional code paths, extended to rendering.

**Its positive twin fails for a reason it does not name.** A `toContain` on content that happened to fit the viewport when the spec was written is a coincidence, not an assertion: the catalogue grows, the content moves below the fold, and the failure reads as the subject being absent rather than as the viewport being too short for where it now sits. The tempting repair is a taller terminal, which buys exactly one more taxonomy edit. Bring the content into view instead, so the assertion holds at any viewport and any catalogue size.

### Never call a spec a regression guard until you have watched it go red

**What:** Writing a spec against a defect's reported symptom, seeing it pass after the fix, and shipping it as the guard.

**Why:** Green after a fix is not evidence the spec can detect the bug. Two distinct mechanisms produce a spec that passes for the wrong reason, and neither is visible by reading the spec:

1. **The fixture is smaller than production, so the defect's blast radius is different.** `createE2ESource()` writes far fewer stacks and skills than the real marketplace carries — [test-data.md § The fixture's cardinality is smaller than production's](./test-data.md) owns the numbers. For a size-dependent defect, how far it reaches scales with list length, so the assertion matching the reported symptom can pass against the unfixed binary while an unrelated-looking one is what goes red.

2. **The assertion's subject is not painted in the captured frame** (the rule above).

**Instead:** revert the fix in `src/`, run `npm run build`, run the spec, and confirm it is red **and red for the reason the test name claims**. Then restore. Record in the spec which assertion carries the red under this fixture, so the next reader does not "simplify" the spec down to the one that does not.

**When the pre-fix binary cannot express the defect, mutate the FIXTURE rather than `src/`.** A spec asserting that an operation leaves something UNCHANGED cannot be reverted into redness where the old behaviour also left it unchanged: a bug that skipped the write and a guarantee not to write are the same bytes on disk. `install-update-source-drift.e2e.test.ts` is the worked example — it pins that `update` leaves an ejected `SKILL.md` byte-identical after the source it was forked from gains a section, and it is GREEN against the pre-rewrite binary, because that command's own defect (a local skill installed under its own id shadowed the source entry, so it classified `local-only` and was skipped) copied nothing either. Applying the standard literally there — revert, rebuild, see green, conclude "already covered" — ships a spec that can never fail. Instead, make the subject change by hand at the point the operation would have changed it (one line appended to the INSTALLED `SKILL.md` immediately before the run), confirm the spec goes red on the assertion whose message claims the guarantee and on nothing else, then remove the mutation. Record in the spec's JSDoc that this is how it was checked, so the next reader does not repeat the `src/` revert and draw the wrong conclusion from a green run. The class is not rare: every "must not touch", "must not recompile", "must not rewrite the config" assertion is in it.

This applies to repairs as much as to new specs: a "fixed" vacuous assertion nobody has watched go red is indistinguishable from the vacuum it replaced.

### Never take a "before" snapshot you do not compare against

**What:** `const configBefore = await readTestFile(configTsPath(dir))` followed by assertions that never reference `configBefore`.

**Why:** A "before" snapshot is a promise that an `expect(after)` follows. This is the most dangerous shape in the weak-assertion family because the surviving assertions look thorough.

**The worked instance is closed; the rule is not.** `scope-toggle-config-snapshot.e2e.test.ts` — _"should compile agent at project scope and preserve global"_ — snapshotted **both** configs under a comment reading `// BEFORE: Snapshot both configs` and compared **neither**. Its two after-assertions were `toContain("web-developer")` on each config, and the fixture writes `web-developer` into both files _before_ the edit runs. **Both were already true of the pre-state**, so the spec would have passed with the edit silently swallowed. That spec is now the reference for the correct form instead: each of its three tests takes both snapshots and spends both, `.not.toBe(projectConfigBefore)` on the file the edit was supposed to rewrite and `.toBe(globalConfigBefore)` on the one it must not touch, each with an assertion message naming the guarantee rather than the operation.

**Instead:** if a spec snapshots two files it must assert on two files — the one that should have changed (`.not.toBe(before)`, the proof the edit landed) and the one that should not (`.toBe(before)`).

```typescript
// Bad: true of the pre-state; passes with the edit swallowed
expect(projectConfigAfter).toContain("web-developer");
expect(globalConfigAfter).toContain("web-developer");

// Good: one changed, one did not — and the change is the proof the edit landed
expect(projectConfigAfter).not.toBe(projectConfigBefore);
expect(globalConfigAfter).toBe(globalConfigBefore);
```

`toContain("<name>")` on the after-state is never a substitute: in a dual-scope fixture the name is usually present in both configs.

The unspent half of this is mechanical and worth running before a review rather than during one — a snapshot binding that is never named again is a promise the spec did not keep. It currently reports nothing:

```
for f in $(grep -rl 'Before\b' e2e --include='*.e2e.test.ts'); do
  for v in $(grep -oP 'const [a-zA-Z0-9_]*[Bb]efore[a-zA-Z0-9_]*' "$f" | awk '{print $2}' | sort -u); do
    [ "$(grep -c "\b$v\b" "$f")" -le 1 ] && echo "$f :: $v"
  done
done
```

It is a floor, not a gate: it catches the binding nothing reads, and cannot see the one read into a weaker assertion than the snapshot deserved. That half is what the paragraph above is for.

Related: check the scope you are actually running at. `scope-toggle-roundtrip.e2e.test.ts` asserted the global config was unchanged and dropped the project one — in a spec whose edit runs at PROJECT scope, i.e. it checked the file the edit was least likely to touch and skipped the file it was most likely to touch.

### Never pin state your setup produced in place of state your action changed

**What:** Two shapes, one mistake — an assertion whose truth is owned by the fixture rather than by the action the spec is named for.

`expect(...).not.toHaveConfig()` at the end of a guard test is the first. Three specs, each existing to prove that a project-scope edit cannot alter a globally-installed skill or agent, ended on it. It says nothing about the guarded edit: it asserts the ABSENCE of a file the setup helper was responsible for creating or not creating, and it passed only because `init` in a project did not yet materialise the project config. When `init` was fixed to materialise deliberately, all four assertions broke on a line unrelated to the behaviour each test is named for, while the actual guard assertions stayed green throughout.

**`not.toHaveConfig()` proves absence, not immutability** — and it becomes vacuous the moment the artifact starts existing for unrelated reasons. What a guard needs is a snapshot taken immediately after setup and compared byte-for-byte after the guarded action, plus the filesystem side the old line never touched. That is what CLAUDE.md already asked for ("if it should NOT change something, snapshot before and assert identical after"):

```typescript
const projectConfigBefore = await readTestFile(configTsPath(env.projectDir));
// ... guarded edit ...
expect(
  await readTestFile(configTsPath(env.projectDir)),
  "a refused edit must leave the project config byte-identical",
).toBe(projectConfigBefore);
await expect({ dir: env.projectDir }).toHaveNoLocalSkills();
```

**Prefer an absolute expected value to A-vs-B equality when what you are pinning is DERIVED.** That is the second shape. `expect(after).toStrictEqual(before)` cannot detect a bug that corrupts both sides identically, and where the two phases are supposed to differ it silently encodes whichever value is current. One dual-scope spec asserted a global config was byte-identical across a project init; the equality held only because the config had never been updated to record that its global skills had genuinely migrated from marketplace installs to local copies. Config said one thing, disk said another, and the spec was pinning the disagreement as if it were the contract. An install source, a resolved scope, a computed path — pin those to a literal expected value and assert that the config agrees with the filesystem. Reserve before/after equality for state that genuinely must not move, and scope the snapshot tightly around the action.

### Never leave an assertion helper imported but uncalled

**What:** `import { expectCleanUninstall } from "../assertions/uninstall-assertions.js"` with no call site in the file.

**Why:** The hand-rolled subset a spec writes instead is always narrower than the shared helper. `plugin-uninstall-edge-cases.e2e.test.ts` imported `expectCleanUninstall` and never invoked it; its _"should also remove config by default"_ spec checked only that the config directory was gone. The word "also" claims the skills and agents went too, and nothing verified that — a leftover skill directory would have survived unnoticed. `expectCleanUninstall` is precisely the helper [§ Never omit negative assertions after removals](#never-omit-negative-assertions-after-removals) tells you to reach for, so the unused import was the fingerprint of an author who knew the rule and got interrupted.

**Instead:** call it, or state in the file JSDoc why the narrower check is deliberate. Applies to `expectCleanUninstall`, `expectDualScopeInstallation`, `expectPhaseSuccess` and everything else under `e2e/assertions/`.

### Never commit a custom matcher without its first caller

**What:** A matcher added to `e2e/matchers/`, exported through `setup.ts`, type-checked, documented — and called by no spec.

**Why:** A matcher with no call site has never been executed, so nothing has shown that it can fail. `toHaveAgentDynamicSkills` shipped that way and took its body with `content.split(/^---\n[\s\S]*?\n---\n/m)[1]`; `split` cuts on EVERY match and a compiled agent's body is full of `---` section rules, so it inspected 1,193 characters of a 39,020-character file. `skillIds` was unsatisfiable and `noSkillIds` passed on absence from a slice nothing renders into — the whole matcher was Pattern V, the artefact that looks like verification and cannot fail. It was documented in four places before it was ever run.

**Instead:** land the matcher and its first spec in the same change, and mutation-check that spec — see [§ Never call a spec a regression guard until you have watched it go red](#never-call-a-spec-a-regression-guard-until-you-have-watched-it-go-red). Where a matcher takes a slice of a payload, never index into a `split()` whose separator can recur: strip a leading block with one non-global `replace()` anchored at string start.

**An assertion helper can carry the same defect, and one did for four months.** `expectFullInstallation` was written into `e2e/assertions/phase-assertions.ts` on 2026-04-09 with the rest of that layer, and **no spec named it in the repository's entire history** — `git log --all -S 'expectFullInstallation'` returns the commit that wrote it, the one that deleted it and documentation commits, and no change to a spec at all. It reached four reference and standards documents, including a section of `assertions.md` describing when to reach for it — removed with it — and it was deleted on 2026-08-20 without having been executed once. Documentation is not a caller: four descriptions of an unrun helper make it look established, and the more thoroughly it is written up the more certainly the next author reaches for it instead of the one that has been seen to work.

**A helper with no callers TODAY is not automatically this, and the difference decides what you owe it on the way out.** `assertConfigIntegrity` and `expectConfigOnDisk` — since removed from `src/cli/lib/__tests__/assertions/config-assertions.ts`, which today exports `expectConfigSkills`, `expectConfigAgents`, `expectSkillConfigs` and `expectAgentConfigs` — were extracted from live integration specs and lost their callers as COLLATERAL — `init-end-to-end.integration.test.ts` and `init-flow.integration.test.ts` were deleted wholesale by an unrelated change and took every call site with them. Those two ran, and proved something, right up until their subject went. So establish which kind you have before deleting: a helper that never had a caller has never been shown able to fail and owes nothing, while a helper that LOST its callers has to be read for invariants nothing else now covers — doing that at `assertConfigIntegrity` is what surfaced two config-writer claims with no live assertion anywhere (that `config.agents` is written alphabetically, and that every `config.stack` key also appears in `config.agents`), both invisible to the surviving helpers because every one of them sorts before comparing.

### Never delete an unused binding in a test without triaging it first

**What:** Clearing an `@typescript-eslint/no-unused-vars` report in a spec by deleting the binding.

**Why:** In production code a dead variable is usually just dead. **In a test, the binding is very often the thing the author intended to assert on** — so it marks the exact spot where an assertion was planned and never written. A destructured `stdout` / `exitCode` / `lastFrame` that is never asserted on means the test **ran the code and checked nothing about the result**.

The first pass of this rule over `e2e/` produced 15 reports, of which 8 were missing assertions — including three captured-but-unasserted exit codes, one with the missing assertion written out in English in the spec's own comment (`doctor-dual-scope.e2e.test.ts`: "the important thing is doctor runs without crashing on the extra directory", when `doctor` exits non-zero on any `fail` check, so "without crashing" had an exact checkable form).

**Instead:** ask what the author meant to do with it. Delete only after establishing that the binding names nothing the spec should have asserted. Where the intended assertion is not obvious, **report it rather than inventing one** — and never weaken an existing assertion to make the report go away. Derive added assertions from something already present: the spec's own name, its own comment, or a sibling spec in the same file.

The `src/`-side sibling is [`packages/cli/CLAUDE.md`](../../../CLAUDE.md) § Test Assertions.

---

## Type Casts

### Never use `as SkillId` on valid union members

**What:** `"web-framework-react" as SkillId` in test code.

**Why:** The literal string `"web-framework-react"` is already a valid `SkillId`. The cast adds noise.

**Instead:** Use the literal string directly. Only cast at parse boundaries (YAML/JSON) or for deliberately invalid test-only IDs.

---

## Assertion Quality

### Never use existence-only assertions

**What:** `expect(result).toBeDefined()` or `expect(await fileExists(path)).toBe(true)` without checking content.

**Why:** An empty file, wrong config, or partially-constructed object all pass.

**Instead:** Use content-aware matchers: `await expect(project).toHaveConfig({ skillIds: [...] })` or read and verify content.

### Never use count-only assertions

**What:** `expect(array).toHaveLength(3)` without verifying WHICH items.

**Why:** 3 wrong items pass the same as 3 right items.

**Instead:** `expect(array.sort()).toStrictEqual([...exactItems])` or use assertion utilities like `expectConfigSkills`.

### Never use `expect.arrayContaining` for diff-shape collections

**What:** `expect(rows).toEqual(expect.arrayContaining([...]))` for config section diffs or rendered marker rows — the `+` / `-` / `~` lines of `edit`'s `Changes:` block, the `DIFF_PREFIX` rows `SkillAgentSummary` paints for `list`.

**Why:** `arrayContaining` passes as long as the expected entries exist — it silently tolerates extra wrong entries. A spurious `- React` row alongside the expected `• React` ships undetected.

**Instead:** `toStrictEqual` on a scope-anchored slice so the entire rendered shape is pinned. If a positive-only match is unavoidable, pair it with an explicit `.not.toEqual(expect.arrayContaining([<bug-shape>]))`. See [assertions.md § Diff-Shape Assertions](./assertions.md).

### Never use bare matcher calls

**What:** `await expect(project).toHaveConfig()` without parameters.

**Why:** Only checks the file exists, not its content. A corrupted or wrong config passes.

**Instead:** Always pass parameters. `ConfigExpectations` is four fields — `skillIds`, `agents`, `marketplace` and `origin` — so `toHaveConfig({ skillIds: [...], agents: [...], origin: "..." })`. There is no `source` option; the field it used to name is `origin`, and `marketplace` beside it is a different question that only `origin` is ever `"eject"` for.

### Never omit negative assertions after removals

**What:** After uninstall/deselection, only checking what remains — not checking that removed items are gone.

**Why:** If the removal failed silently, the test still passes because the remaining items are present.

**Instead:** Use `expectCleanUninstall(dir)` or add explicit `notContains` / `toHaveNoLocalSkills()` checks.

### Never accept config state as proof that an external operation happened

**What:** Asserting `config.ts` records `origin: "<marketplace>"` after a plugin install or a mode migration, and stopping there.

**Why:** the config entry and the install are written by different code, and the whole orphan-entry class is exactly the case where the first happened and the second did not. A local -> plugin mode-migration spec was green while `claude plugin install` failed on **every** run: the migration deleted each ejected working copy first, downgraded install failures to warnings, and persisted a config claiming a marketplace source for skills that were never installed. The spec asserted the exit code and the config, so it certified precisely the state this rule forbids — and the cause (the migration path never registered the marketplace, unlike every other install path) stayed invisible until the warning was promoted to a hard error and the spec finally went red.

**Instead:** assert the external effect too — `toHavePlugin(key)` / `toHavePluginInRegistry(key, scope)`, or at minimum that no install-failure line was emitted. This is CLAUDE.md's "verify config AND filesystem" extended to "verify the config AND the external effect it claims", and it applies to anything the CLI delegates: plugin installs, marketplace registration, a spawned binary's own bookkeeping. `e2e/interactive/edit-from-plugin-migration.e2e.test.ts` is the shape: each `origin` assertion is paired with `toHavePlugin` / `toHavePluginInRegistry` or its `.not`.

### Never check the wrong scope directory

**What:** `await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer")` when agents compile to `fakeHome`.

**Why:** In dual-scope setups, agents default to global scope. Compiled agents go to `$HOME/.claude/agents/`, not `<project>/.claude/agents/`.

**Instead:** Check the correct directory for each scope. Use `expectDualScopeInstallation` for structured dual-scope checks.

### Never assert a global agent's stack on the project config

**What:** Loading `config.stack` via `loadConfigOrFail(projectDir)` after a default (all-global) init.

**Why:** the config-pair renderers filter the stack to agents matching that config's scope — `splitConfigByScope` in `packages/compile/src/seed-to-config.ts` partitions it by agent scope, and `partitionInlinedConfigEntries` in `packages/compile/src/config-source.ts` keeps a project config's stack to project-scoped agents. A default install's PROJECT config carries the flat skills/agents lists but NO stack for global agents — their stack is written to the GLOBAL config (`HOME/<source folder>/config.ts`, where `<source folder>` is `.agents-inc/claude` — see `DIRS` in `standards/e2e/README.md`).

**Instead:** Read the stack from the global home, not `projectDir`. The project config carries only the stack slice for PROJECT-scoped agents.

### Never read `toHaveAgentDynamicSkills` as a laziness claim on its own

**What:** `toHaveAgentDynamicSkills(agent, { skillIds: [x] })` written to mean "x arrives on demand", or `toHaveAgentFrontmatter(agent, { skills: [x] })` written to mean "x and nothing else preloads".

**Why:** The two halves are disjoint in the DATA — `buildAgentTemplateContext` partitions an agent's skills into `preloadedSkills` and `dynamicSkills`, and a compiled agent prints a preloaded id in frontmatter and a dynamic one in the body's activation protocol. Neither matcher enforces that split. `toHaveAgentDynamicSkills`' `skillIds` reads the activation protocol alone and says nothing about what the frontmatter preloads. `toHaveAgentFrontmatter`'s `skills` is a subset check, so it passes on an agent that preloads everything it holds. Each is green under the failure the other exists to catch.

**Instead:** state both halves. `toHaveAgentFrontmatter({ exactSkills })` or `{ noSkills: true }` pins the preload list Claude Code reads; `toHaveAgentDynamicSkills({ skillIds, noSkillIds })` pins what the body reaches. Which skill is which comes from the stack — `createMockSkillAssignment(id, true)` in `create-e2e-source.ts` is preloaded, the default is dynamic. Full expectation-by-expectation table: [assertions.md § Agent Matchers](./assertions.md).

### Never write assertion values without verifying them against production code

**What:** Writing `expect(config.agents).toStrictEqual([{ name: "web-developer", scope: "project" }])` without checking what the code actually produces.

**Why:** This was the #1 source of incorrect assertions (30+ instances). Common mistakes:

- Agents default to `scope: "global"`, not `"project"`
- Config keeps skills in the order the payload lists them, not alphabetical
- `compactStackAssignments` compacts `{ id, preloaded: false }` to bare string IDs
- `toStrictEqual` treats `excluded: undefined` as different from a missing `excluded` property

**Instead:** Read the production source to understand exact return types, and derive each expected value from the writer that emits it. Running the test to see what it currently produces forms a hypothesis; it never supplies an expectation — an observed value pins the defect exactly as readily as the contract. See [assertions.md § Writing Correct Assertion Values](./assertions.md).

### Never use broad negative assertions on merged configs

**What:** `expect(projectConfig).not.toContain("origin: 'eject'")` on a config that contains both project-scoped and global-scoped entries.

**Why:** The merged config contains entries from BOTH scopes. An excluded global entry legitimately retains `origin: 'eject'` as a tombstone. A broad `not.toContain` catches entries from the wrong scope, so the assertion fails on state the product is right to have written.

**Instead:** `readSkillEntries(dir, skillId)` (`e2e/fixtures/dual-scope-helpers.ts`), which returns that id's entries as loaded structures and lets a `toStrictEqual` say which scope carries which `origin`; or `toHaveConfig({ skillIds, origin })`, which judges `origin` over the named ids rather than over the file's text.

**Not a regex over the raw file.** This section used to recommend exactly that, and it was wrong twice over: it is the extraction the split/loop/filter ban above forbids, and its needle was a claim about the writer's bytes that the 2026-08-26 formatting ruling has since falsified — a `match` that no longer matches returns `null`, and the `!` behind it turns a stale needle into a thrown `TypeError` rather than a failed expectation.

### Never assume skill ordering is alphabetical

**What:** `expect(config.skills.map(s => s.id)).toStrictEqual(["api-framework-hono", "web-framework-react", "web-state-zustand"])` (alphabetical).

**Why:** Config keeps skills in the order the payload lists them: `seedToInstallSelection` (`packages/compile/src/seed-to-config.ts`) walks `payload.skills`, and the writer reorders keys inside each entry, never the entries.

**Instead:** Sort both sides: `expect(config.skills.map(s => s.id).sort()).toStrictEqual([...expected].sort())`, or use `expectConfigSkills` which normalizes ordering automatically.

---

## Page-Object API Hygiene

A page object is documentation. Every method on it advertises an interaction to the next spec author, so a method nobody drives, or a method whose verb is wrong, is worse than absent — the next spec is built on it.

### Never add a speculative page-object method

**What:** A method added for symmetry with an existing one — `arrowUp` beside `arrowDown` — with no spec calling it in the same change.

**Why:** dead page-object methods are worse than dead product code: they advertise a capability nothing has ever exercised, and a flow built on one is a flow nobody has seen work.

**Instead:** add a method when a spec calls it, and delete a `TerminalScreen` or `TerminalSession` primitive in the same change that removes its last caller.

### Never name a page-object method for the mental model instead of the key's semantics

Read the component's `useInput` handler before naming the method. A `toggle…` name on a handler that commits a selection idempotently describes a behaviour the product does not have, and the next spec is built on the name. Where two names are already in use, accuracy beats call-site count: renaming sites once is cheaper than every future author inferring the wrong semantics from the name.

### Never keep an alias method, and never re-inline a fixture's exported type

One interaction, one method name: an alias doubles the vocabulary an author has to learn and guarantees the two doc comments drift. And when a launcher option describes a value a fixture factory produces, import that factory's exported type. This is CLAUDE.md's "NEVER create redundant type aliases" applied to inline structural literals, stated here because `e2e/pages/` is where it recurred.

---

## Spec Provenance

### Never pin a scope, ownership or propagation boundary without recording where the boundary came from

**What:** A spec asserting which scope a command may write, which config owns an entry, or how far a change fans out — with a file-level JSDoc that describes the assertions and cites nothing that decided them.

**Why:** a spec written FROM the behaviour is indistinguishable from a spec written from a decision, and the difference only matters on the day someone changes the behaviour. Fixing a ruled scope regression turned six specs red, and not one of them was testing a defect: they ran `compile` inside a project and then asserted on the global scope's compiled agents — a behaviour never in fact ruled on, which fell out of deriving the compile pass set from which installations exist. Because nothing in the specs said so, the red run read as evidence against the fix rather than as a question about it. **A spec in that position is worse than no spec: it makes a regression look intentional and the fix look like the regression.**

**Instead:** one sentence in the file-level JSDoc naming the decision that makes the behaviour correct — a ruling and its date, a finding, or a standards section. Not the task that added the test; the thing that settled the question. Live examples, all three forms: `e2e/commands/compile-project-scope-containment.e2e.test.ts` ("ruled containment… propagation belongs to global operations"), `e2e/lifecycle/project-edit-removes-project-half-of-pair.e2e.test.ts` ("the ruled behaviour… the guard that refuses changes from project"), and `e2e/commands/source-flag-is-init-only.e2e.test.ts` ("nobody else's (owner ruling 2026-08-09)"). A task ID is permitted here and **only** here — file-level JSDoc is the one place the no-task-IDs rule below exempts — but it is not a substitute for naming the decision, because an ID stops meaning anything once the task closes.

The counter-example is in the tree: `e2e/commands/compile-scope-filtering.e2e.test.ts` was rewritten to the ruling (one `compile` invocation per scope, so the same content assertions hold under containment) and its JSDoc still reads as a list of fixes with no decision behind them.

---

## Rules Carried Forward from the Old Bible

These rules come from the monolith this directory was split out of. `e2e-testing-bible.md` is now a pointer into here, so this is where they live:

- **No task IDs anywhere except file-level JSDoc.** Never include `D-NNN` / `P-BUILD-1` / `Bug A` tokens in `describe()` names, `it()` names, assertion messages (2nd arg to `expect`), or inline test-body comments. Test names describe BEHAVIOR, assertion messages describe INVARIANTS ("config.ts must not contain version field"). IDs look authoritative but rot once the task closes.
- **Never call the dist door from a spec.** `e2e/setup.ts` registers the dist door once, in a `beforeAll`, so it runs before every spec file in the suite. It was `ensureBinaryExists()` called from each file's own `beforeAll` until 2026-08-24 — 248 files of per-file discipline with no checker over it, where forgetting the call bought a 45-second timeout naming nothing and no reader could tell a spec that omitted it correctly from one that forgot. A spec calling it again is not wrong, it is redundant, and redundancy is how the per-file discipline grows back.
- **`describe.skipIf()` for external dependencies.** Plugin tests use `describe.skipIf(!claudeAvailable)`. Marketplace tests use `describe.skipIf(!hasSkillsSource)`.
- **Split files at 300 LOC** or when covering 2+ unrelated concerns.
- **Never test the Claude CLI binary from E2E tests.** Testing `claude plugin install` directly is a smoke test. Place in `smoke/` with `.smoke.test.ts` extension.
- **`it.fails()` for known bugs.** Document the bug with a comment. When fixed, removing `it.fails()` makes the test pass.
- **Use `createTempDir()` / `cleanupTempDir()`.** Never import `mkdtemp` or `os.tmpdir()` directly.

---

## Related

- [test-structure.md](./test-structure.md) -- The golden rule and cleanup conventions
- [assertions.md](./assertions.md) -- Matcher patterns
- [patterns.md](./patterns.md) -- Correct patterns for each test type
