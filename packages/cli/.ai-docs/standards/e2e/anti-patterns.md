---
last_validated: 2026-07-30
---

# Anti-Patterns

Every "never do this" rule with rationale. Organized by category.

---

## Session and Keystroke Leakage

### Never import `TerminalSession` in test files

**What:** `import { TerminalSession } from "../helpers/terminal-session.js"` in a `.e2e.test.ts` file.

**Why:** `TerminalSession` is the raw PTY layer. Tests must use page objects (wizards and steps) to interact with the terminal. Direct session access bypasses all the framework's timing, text matching, and navigation logic.

**Instead:** Use `InitWizard.launch()`, `EditWizard.launch()`, `InteractivePrompt`, or `DashboardSession`.

### Never call session methods in test files

**What:** `session.waitForText()`, `session.enter()`, `session.arrowDown()`, `session.space()`, `session.write()` in test code.

**Why:** These are low-level terminal operations. Every keystroke needs a delay after it, and every text check needs a timeout. The framework handles this internally.

**Instead:** Use step methods: `wizard.stack.selectFirstStack()`, `build.selectSkill(E2E_SKILL.react.display)`, `agents.toggleAgent("API Developer")`.

---

## Timing Leakage

### Never use `delay()` in test files

**What:** `await delay(500)` or `await delay(STEP_TRANSITION_DELAY_MS)` in an `it()` block.

**Why:** The framework encapsulates all timing in `BaseStep` methods. Delays in tests are a sign that the test is working at the wrong abstraction level.

**Instead:** All step methods include appropriate delays internally. If you need to wait for something, use a step method or `waitForText` through a page object.

### Never use `setTimeout` in test files

**What:** `await new Promise(r => setTimeout(r, 1000))` or similar.

**Why:** Same as above. Manual timing is fragile and makes tests flaky.

**Instead:** The framework handles all timing. Use `{ timeout: TIMEOUTS.LIFECYCLE }` for tests that need more time.

### Never reference `INTERNAL_DELAYS` in test files

**What:** `import { INTERNAL_DELAYS } from "../pages/constants.js"` or using `INTERNAL_DELAYS.STEP_TRANSITION`.

**Why:** `INTERNAL_DELAYS` is exported only for the framework's internal use (BaseStep, DashboardSession, InteractivePrompt). Tests should not know about keystroke timing.

**Instead:** Use `TIMEOUTS` for per-test timeout overrides. The framework handles all internal delays.

---

## Filesystem in Tests

### Never use `writeFile`/`mkdir` in `it()` blocks

**What:** `await writeFile(path.join(projectDir, ".claude-src", "config.ts"), content)` inside a test.

**Why:** This couples the test to the config file format. When the format changes, the test breaks even though the CLI behavior didn't change.

**Instead:** Use `ProjectBuilder` methods in `beforeEach` or as inline fixture calls. If `ProjectBuilder` doesn't support your scenario, extend it with a new static method rather than inlining. See `ProjectBuilder.dualScopeWithImport()` as an example of encapsulating complex setup. See [test-data.md](./test-data.md).

### Never use `readFile`/`readdir` in `it()` blocks for assertions

**What:** `const content = await readFile(configPath, "utf-8"); expect(content).toContain(...)`.

**Why:** This couples the test to the file's path and format. The assertion should describe what the user sees, not how the CLI stores it.

**Instead:** Use matchers: `await expect(project).toHaveConfig({ skillIds: [...] })`. See [assertions.md](./assertions.md).

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

**Exception:** Lifecycle tests sometimes read specific file content for detailed assertions that no matcher covers (e.g., checking YAML frontmatter fields). This is acceptable in lifecycle tests where the assertion is about compilation output, not implementation details. If you find yourself doing this in 3+ places, add a matcher.

### Never construct paths with `path.join` in test assertions

**What:** `const configPath = path.join(dir, ".claude-src", "config.ts"); expect(await fileExists(configPath)).toBe(true)`.

**Why:** Testing file existence without checking content is weak (an empty file passes). And the path construction couples to directory structure.

**Instead:** Use content-aware matchers: `await expect({ dir }).toHaveConfig()`.

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

**What:** Pressing a navigation key and then asserting on `step.getOutput()` on the assumption that "the accumulated output holds a frame where the row rendered in the form I want" — typically to reach a row that has since scrolled out of the viewport, or one that a later repaint replaced.

> **Worked example replaced 2026-08-01.** This rule previously illustrated itself with the Sources grid's focus padding (`+  React ` with two spaces, so `"+ React"` was not a substring of a focused row). **That was a product defect, and it was fixed in 0.147.0** — `rowStatusMarker` in `src/cli/components/wizard/source-grid.tsx` is now always two columns wide with the marker inside the focus highlight, so focused and unfocused rows render the name in the same column. A standards doc that keeps a live defect as its motivating example teaches every future spec to route around the defect, which is how two releases of Sources-tab specs went by with the padding documented and untested. The focused form is now pinned by `e2e/interactive/sources-focused-row-marker-spacing.e2e.test.ts`. The buffer-semantics rule below is unaffected and still correct.

**Why:** `BaseStep.getOutput()` -> `TerminalSession.getFullOutput()` reads xterm's **processed buffer** (`xterm.buffer.active`) — the current screen plus whatever genuinely scrolled off. Ink redraws in place, so when a frame fits the viewport (the common case at `TERMINAL_SIZE.TALL`) each repaint OVERWRITES the previous one and nothing enters scrollback. The earlier frame is gone. Verified empirically against the real binary: a `+ E2E React` marker present in `getOutput()` before a `navigateDown()` is absent after it, while `getRawOutput()` still holds it.

**Instead:** assert at the moment the frame is on screen (capture before the key press), or use a raw-output surface — `InitWizard.getRawOutput()` / `EditWizard.getRawOutput()` / `WizardResult.rawOutput` / `TerminalScreen.waitForRawText` / `waitForTextAfter`. Raw PTY output is append-only and is the only frame-accumulating surface.

**Corollary — do not manufacture a different render state with a key press.** When a row renders differently focused vs unfocused (padding, chevrons, highlight), assert against the state actually on screen at capture time. If a press is unavoidable, first establish which row holds focus: `SourceGrid` seeds focus with `firstFocusableRowIndex(rows, 0)`, which SKIPS inert (locked / pending-removal) rows, so "the first row" and "the first focusable row" are frequently different — a single `navigateDown()` may move focus ONTO the row under test rather than away from it. Both halves of this were established the same way, by a throwaway probe spec against the real binary rather than by reading the harness: the marker was present in `getOutput()` before the move, absent after it, and still in `getRawOutput()` throughout.

### Never assert that text is ABSENT from a screen the session once legitimately drew

**What:** `expect(step.getScreen()).not.toContain(STEP_TEXT.BUILD)` to prove a screen was replaced — the natural way to test "the wizard is gone", "the overlay closed", "the step transitioned".

**Why:** `TerminalSession.getScreen()` is **not viewport-only, despite its name.** It reads absolute buffer lines `0 .. viewportY + rows`, so once the session has any scrollback the range is scrollback **plus** viewport. Any text drawn earlier in the session is still matchable. The assertion tests the emulator's memory, not the process's current output — so it fails against residue whether or not the behaviour under test works, and the failure looks like a product bug.

This is the **converse** of the `getOutput()` rule above, not a restatement. That rule warns against asserting a past frame was _present_; this one is about asserting a past frame is _absent_ now. `getOutput()` has the same exposure, more obviously.

Shrinking a terminal is the sharpest case: the whole pre-shrink frame goes into scrollback, so the obvious test for the resize guard's "the wizard is REPLACED" contract is unsound by construction.

**Instead:** prove the negative by **order** or by **behaviour**.

```typescript
// Bad: scrollback-sensitive, fails whether or not the guard works
expect(step.getScreen()).not.toContain(STEP_TEXT.BUILD);

// Good (order): the prompt is the LAST thing painted, so nothing was drawn after it.
// Discriminating — with the guard reverted the buffer ends with the wizard footer instead.
expect(step.getScreen()).toMatch(/Please resize\.$/);

// Good (behaviour): drive the session and assert the outcome the absent element would have changed.
```

**Corollary — a resize paints twice, so a cursor-anchored raw wait does not rescue it either.** Ink's own `resized()` handler re-renders the existing tree synchronously, and only then does the dimensions hook's `setState` produce the guarded render. A raw slice taken after a pre-resize `getRawCursor()` therefore holds `[old frame] + [new frame]`, so `not.toContain("Framework")` fails there too. Any assertion anchored on a pre-resize cursor must expect both frames. `BaseStep.resizeBelowMinimum` / `resizeAboveMinimum` are built as **positive** cursor-anchored waits for exactly this reason.

The mechanics are in [reference/testing/e2e-infrastructure.md § `getScreen()` is not viewport-only](../../reference/testing/e2e-infrastructure.md); the method's own JSDoc states the same range, so nothing in the source reads the other way.

### Never leave a workaround in a test's JSDoc without a spec that pins the un-worked-around form

**What:** A spec that sidesteps a rendering difference — padding, chevrons, highlight width, marker spacing — to assert something else, and explains the dodge in a comment.

**Why:** A JSDoc explaining a workaround is a **defect report** unless some spec asserts the form being worked around. Once the dodge is written down it propagates: every later spec inherits it, none asserts the un-worked-around form, and the defect becomes structurally invisible. The suite is green precisely because nothing looks.

This is not hypothetical. Two dual-scope Sources specs carried a paragraph explaining that they capture the frame while the row is UNFOCUSED "which splits the marker from the name", and the same padding was written into this very document as the worked example for an unrelated rule (see the note under the `getOutput()` rule above). Two releases shipped with the padding documented in three places and asserted in none.

**Instead:** the spec must either cite a finding for the difference, or point at the spec that asserts it head-on.

```typescript
/**
 * Captured unfocused because <difference>. The focused form is pinned by
 * sources-focused-row-marker-spacing.e2e.test.ts.
 */
```

And when the underlying defect is fixed, delete the dodge paragraphs — they read as superstition otherwise.

**Corollary — construct the focus, do not navigate to it.** When a spec needs a row in a particular focus state, build a fixture where that row is the only one that can hold focus (`SourceGrid` seeds with `firstFocusableRowIndex`, which skips locked and pending-removal rows) rather than pressing a key to get there. A key press manufactures a different render state and reintroduces the `getOutput()` problem above.

### Never write a colour assertion in an E2E test

**What:** `expect(output).toContain("\x1b[38;2;...")` or any assertion that a marker is green/red, in an `.e2e.test.ts`.

**Why:** The terminal harness runs with `NO_COLOR=1` / `FORCE_COLOR=0` (deliberately, so xterm buffer reads stay clean). Colour is not present in the captured output at all — an E2E spec can only assert the marker, never the colour.

**Instead:** colour is testable ONLY at the component-test layer, and even there it needs a forced chalk level, because Ink colourises through chalk (`ink/build/colorize.js` calls `chalk.hex` / `chalk.bgHex`) and chalk auto-disables on vitest's non-TTY stdout. Without the forced level a colour assertion is not merely hard, it is **unobservable** — `<Text color backgroundColor>` renders with every escape sequence stripped, so the assertion fails for a reason that has nothing to do with the product. A contract phrased as "these two surfaces render the same colour" needs a component test; an E2E marker assertion does not cover it. The enabling pattern, and the repo's one colour-asserting file, are in [reference/testing/infrastructure.md § Asserting Colour in Ink Component Tests](../../reference/testing/infrastructure.md).

**Never downgrade a failing colour assertion to a text-only one.** A colour assertion that fails because no ANSI was emitted is a harness gap, not a product bug — and silently weakening it is exactly how a colour regression stays invisible.

---

## Index-Based Navigation

### Never use counted arrow presses to reach items

**What:** `for (let i = 0; i < 7; i++) { await step.navigateDown(); }` to reach a specific item.

**Why:** Adding or reordering items breaks these tests silently. The test passes but selects the wrong item.

**Instead:** Navigate by name: `await agents.toggleAgent("API Developer")`, `await wizard.stack.selectStack("E2E Test Stack")`, `await build.focusSkill(E2E_SKILL.react.display)`.

**Exception:** `InteractivePrompt` (non-wizard prompts like uninstall confirmation) may need index-based navigation because prompt items lack unique text. Document the assumption:

```typescript
// Navigate to "Remove plugins only" -- second option in prompt
await prompt.arrowDown();
```

### Never dead-reckon grid navigation

**What:** A page-object navigator that maintains a keystroke-count model of grid position — counting arrow presses to a row, then to a column, and carrying that model across calls.

**Why:** It was wrong about the grid, and wrongly for two releases. `focusSkill` assumed arrow-DOWN resets the column to 0; `useFocusedListItem` actually PRESERVES and clamps it (`finalCol = min(currentCol, newColCount - 1)`). So a second `focusSkill` in the same domain started its RIGHT presses from a wrong column and, with cyclic wrap, landed on — and toggled — the WRONG skill. The suite stayed green: the wrong skill toggled just as successfully as the right one.

**Instead:** navigation MUST be closed-loop at CATEGORY granularity — verify the focused category from the rendered screen after every focus-moving keystroke, and never carry a position model between calls. Three constraints make that the only workable shape:

| Constraint                                                                                                                                                      | Consequence                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Under `NO_COLOR` the focused **cell** has no text signal — `SkillTag` distinguishes it only via `borderColor` / `borderDimColor`, and the harness strips those. | Any design requiring cell-level verification must be redesigned. Do not attempt it. |
| The focused **category header** IS observable — it paints one column deeper than its unfocused siblings.                                                        | Close the loop at category granularity.                                             |
| **Tab** = next category + column reset to 0. **DOWN** = next category + column preserved/clamped.                                                               | Only Tab yields a known column. Build the walk on Tab.                              |

**Match cell labels EXACTLY, never by substring.** `cell.includes(label)` stops the walk on the wrong cell whenever one label is a substring of another — `"React"` matches a `"React Query"` cell, `"Vite"` matches `"Vitest"`. Strip the rendered decoration (scope badges, diff glyphs, compatibility annotations) and compare with `===`.

**What makes a screen-parsed column safe to walk from is that horizontal navigation skips nothing.** `CategoryGrid`'s `findValidCol` is a plain cyclic `wrapOptionIndex` over the focused row's own `options` — the same array the row renders — so arrow-RIGHT visits every cell that is painted, including incompatible ones, and a column index read off the screen is the column index the keystrokes address. Do not build a walk on the opposite assumption; a navigator that expects the grid to skip cells drifts from the screen on the first row that has one.

`BuildStep.focusSkill` is the reference implementation. See [patterns.md § Closed-Loop Grid Navigation](./patterns.md).

### Never write a page-object bound that stands for a catalogue count without naming the count

**What:** A numeric constant in a page object — a walk length, a press budget, a retry ceiling — tuned to how large the catalogue was on the day it was written, and commented in the form "N covers any realistic count".

**Why:** that comment names no measurement, so nothing tells the next taxonomy edit that N has gone short — and the failure the short bound produces names the wrong cause. `MAX_FOCUS_ATTEMPTS` bounded the Tab-walk in `BuildStep.focusSkill` at 30 and said "30 covers any realistic per-domain category count". Tab wraps, so one full cycle visits every category and the bound has to clear the largest per-domain count with headroom for swallowed keystrokes on top; when web went from 26 categories to 33, 30 stopped covering one cycle. The walk then failed on a category it had **not reached yet**, reporting "was not focused after 30 Tab presses" — which reads exactly like the skill being absent from the grid. Adding twelve categories and retiring one broke this without touching a component, a behaviour or a rule.

**Instead:** the comment states which count drives the bound, which domain that count was measured against, and what running out looks like — so the number is a grep target for the next taxonomy edit rather than a bare literal. `MAX_FOCUS_ATTEMPTS` (`e2e/pages/steps/build-step.ts`) is 50 "against web's 33 since the taxonomy split", and records that its old failure was a walk that ran out before it wrapped rather than one that could not find the target. `SOURCE_ROW_WALK_LENGTH` (`e2e/pages/steps/sources-step.ts`) is the other shape of the same discipline: it names the fixture's ten skills, states that `classifySkillSourceRows` emits at most one focusable row per skill, and says the value is "ten plus headroom" — an upper bound derived from something, not a round number.

The census is short enough to read every time, and each hit is judged on whether its comment names a count:

```
grep -rnE 'const [A-Z_]+ = [0-9]+;' e2e/pages --include='*.ts'
```

### Never assert on a category the grid renders below the fold without navigating to it first

**What:** Launching at `TERMINAL_SIZE.TALL` and asserting `toContain("Testing")` on the first frame, on the strength of the grid having fitted when the spec was written.

**Why:** fitting is a coincidence, not an assertion. Three categories added above `web-testing` pushed the section past 60 rows, and two `edit-wizard-launch` specs — neither of which was testing scrolling — failed with `expected '┌───…' to contain 'Testing'`. That message names the wrong cause: it reads as the category being absent from the catalogue rather than as the viewport being too short for where it now sits, and the tempting repair is a taller terminal, which buys exactly one more taxonomy edit.

**Instead:** Tab-walk to it. `await wizard.build.focusSkill("Vitest")` scrolls the category into view and the assertion then holds at any viewport and any catalogue size — strictly stronger than the one it replaces. Both specimens are in `e2e/interactive/edit-wizard-launch.e2e.test.ts`, each with the reason at the call ("Testing sits below the fold of even the tall viewport, so scroll to it rather than widening the terminal — the grid grows with the catalogue"). This is the positive-assertion twin of [§ Never assert a rendering invariant at a geometry where the subject does not render](#never-assert-a-rendering-invariant-at-a-geometry-where-the-subject-does-not-render): that rule covers the negative that passes for free when its subject is unpainted, this one the positive that fails for a reason it does not name.

---

## Hardcoded Strings

### Never use raw UI text in tests

**What:** `await expect(output).toContain("Choose a stack")` or `await expect(output).toContain("initialized successfully")`.

**Why:** When UI text changes, every test that hardcodes the old text breaks. Constants centralize the change to one file.

**Instead:** Use `STEP_TEXT` constants: `expect(output).toContain(STEP_TEXT.STACK)`, `expect(output).toContain(STEP_TEXT.INIT_SUCCESS)`.

### Never reconcile two asserted strings by editing the constant between them

**What:** Pointing several specs at one `STEP_TEXT` member when the strings they assert differ — some asserting a prefix, others the full rendered line — and closing the gap by shortening or lengthening the member.

**Why:** a `STEP_TEXT` entry holds the string a test asserts, byte for byte, not the string the product renders. Lengthening it weakens every negative assertion using it; shortening it weakens every positive one. `init` renders `Installing skill plugins...`; four sites assert the ellipsis form positively and one asserts the bare form negatively. One member cannot serve both without silently changing what one of the two groups can fail on — and a literal-to-constant sweep that does not know this is unsafe in both directions.

**Instead:** add a second entry. Name the pair `X` (loose, for `waitForText`) and `X_<QUALIFIER>` (the exact rendered form), and comment which is which. `INSTALLING_PLUGINS` / `INSTALLING_PLUGINS_ELLIPSIS` and `UNINSTALL_PREVIEW` / `UNINSTALL_PREVIEW_HEADING` are the shipped pairs, each carrying that comment at its definition.

**Two entries may share a value when their ROLES differ.** A step sentinel passed to `waitForText` is not a category label passed as a function argument, even when both are `"Framework"` — `STEP_TEXT.BUILD` and `STEP_TEXT.CATEGORY_FRAMEWORK` are separate members for that reason, and the second says so in a comment. Prefer a second named entry over reusing a sentinel as data, and over the file-local `const FRAMEWORK_CATEGORY_LABEL` three specs each re-declared instead.

Which CLAUSE of a message a sentinel should hold is a different question, answered in [assertions.md § A Sentinel Must Name the Substantive Claim](./assertions.md).

### Never use inline timeout numbers

**What:** `it("test", { timeout: 180000 }, async () => {})` or `await wizard.waitForExit(60000)`.

**Why:** Magic numbers are impossible to grep for and easy to miscalibrate.

**Instead:** Use `TIMEOUTS` constants: `{ timeout: TIMEOUTS.LIFECYCLE }`.

### Never use hardcoded path segments

**What:** `".claude"`, `".claude-src"`, `"config.ts"`, `"SKILL.md"`.

**Instead:** Use `DIRS.CLAUDE`, `DIRS.CLAUDE_SRC`, `FILES.CONFIG_TS`, `FILES.SKILL_MD` from constants.

---

## Inline Test Data

### Never create project fixtures inline in tests

**What:** `await mkdir(path.join(tempDir, ".claude-src"), { recursive: true }); await writeFile(...)` inside a test file.

**Why:** Duplicates setup logic. When the config format changes, every inline fixture breaks.

**Instead:** Use `ProjectBuilder` methods or `writeProjectConfig()` from test-utils. See [test-data.md](./test-data.md).

### Never inline mkdir + writeFile for agent stubs

**What:** `await mkdir(agentsDir); await writeFile(path.join(agentsDir, "web-developer.md"), "---\nname: ...\n---\ncontent")` inside an `it()` block.

**Why:** Duplicates across files and couples tests to the agent file format.

**Instead:** Use a file-local `writeAgentStub()` or `writeAgentFile()` helper. If the pattern appears in 3+ files, extract to `test-utils.ts`.

**Exception:** When creating intentionally corrupt/invalid files for error-path tests, inline construction with an explanatory comment is acceptable. The shape that exception has to take is the rule below.

### Never "fix" an invalid-by-design fixture into a valid one

**What:** A metadata/frontmatter sweep converting a raw template string to `renderMetadataYaml()` / `renderSkillMd()` / `renderAgentYaml()`, or a config sweep converting a raw `config.ts` string to `writeProjectConfig()`, at a site whose whole subject is that the bytes do not parse.

**Why:** the renderers' contract is to emit well-formed output, so no argument to them can ever produce a file the loader refuses — the class is **permanently** outside them, not merely awkward. Every one of these sites matches the grep a sweep runs (`writeFile(..., FILES.METADATA_YAML, ...)`, a backtick template written to `SKILL.md`, a string written to `config.ts`), so each sweep re-proposes them; and a sweep that reads the no-inline rule as absolute deletes the only thing the spec asserts **with no assertion changing to signal it**. The spec keeps its name, keeps its shape, and stops testing the refusal it was written for.

**Instead:** keep the raw string, hold it in a named file-level constant with a JSDoc saying what makes it invalid, and assert on the CLI's refusal rather than on the write. The live sites, so a sweep can confirm an exception is known rather than re-deriving it:

| Fixture                                                                                                                                        | What must stay unparseable                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `UNPARSEABLE_YAML` in `compile-malformed-skill-metadata`, `local-skill-invalid-metadata-yaml` and `edit-refuses-unusable-local-skill-metadata` | `metadata.yaml` — a flow-mapping opener followed by nested compact mappings       |
| `SYNTAX_ERROR` in `compile-corrupt-config`, `edit-corrupt-config`, `doctor-corrupt-config` and `uninstall-from-scratch-scopes`                 | `config.ts` — a file that EXISTS and cannot be loaded, which is `ConfigLoadError` |
| The two fixtures in `compile-edge-cases`' "broken YAML in skill metadata" block                                                                | an unbalanced-quote `SKILL.md` frontmatter, and the same unparseable metadata     |
| The empty-`metadata.yaml` agent in `integration/custom-agents`                                                                                 | zero bytes where the agent loader requires a field set                            |

A second class is real and currently has **no instance**: a fixture that must OMIT a field the renderer always emits. `contentHash` is still typed required on `SkillMetadataFields` (`src/cli/lib/__tests__/content-generators.ts`), so a fixture needing a `metadata.yaml` without it would have to be a raw string too — but every `metadata:` value under `e2e/` currently goes through `renderMetadataYaml`, and the omission of a REQUIRED field has its own sanctioned route in `renderIncompleteMetadataYaml(fields, ["category"])`, which makes the fixture ask for the breakage by name. Unlike the class above, this one is retirable by making the field optional. Do not carry a worked example forward for it until one exists.

```
grep -rn 'UNPARSEABLE_YAML\|SYNTAX_ERROR' e2e --include='*.ts'
```

---

## Fixture Selection

### Never build an `s`-collapse spec on an eject/eject dual-scope pair

**What:** Reaching for `ProjectBuilder.editable({ skills, globalSkills })` — the obvious "installed at both scopes" fixture — for a spec that presses `s` to collapse `[P][G]` to `[G]`.

**Why:** That fixture hardcodes `source: "eject"` for BOTH halves, and `toggleSkillScope` refuses a project->global press in exactly that shape. `wouldOverwriteGlobalEject` fires when the live entry is `scope: "project"` + `source: "eject"`, the snapshot holds an ACTIVE global entry with `source: "eject"`, and the live config carries no tombstone. The press emits a toast and changes nothing — **so the spec fails on a swallowed keystroke rather than on the render it claims to test.** That is a false RED that looks exactly like the bug under test.

**Instead:** give at least the global half a non-eject source (e.g. a marketplace name). Build the config directly rather than through `ProjectBuilder.editable` when the pairing matters, and say why in the file-level JSDoc. **Every `s`-collapse spec needs a proof-of-execution assertion on the scope badges (`["P"]` -> `["G"]`)** so a refused press cannot masquerade as a rendering bug. The unit-level fixture for the same scenario already dodges this by using a marketplace source on both entries.

### Never let a fixture rely on a factory default for the state the test's name claims

**What:** A spec named "…previously installed as project" whose live state comes from `toggleTechnology(...)` (which produces a **global**-scoped entry, because `buildSkillConfigForId` defaults to `scope: "global"`) while its snapshot comes from `buildSkillConfigs([...])` (which defaults to `scope: "project"`).

**Why:** The two relevant defaults point OPPOSITE ways — `buildSkillConfig` -> `project`, `createDefaultSkillConfig` / `buildSkillConfigForId` -> `global` — so an unstated scope is a coin flip. The spec above was not testing "project-scoped, previously installed as project" at all; it was testing a project->global migration. Its named assertion still passed, for the wrong reason, and it went unnoticed for two releases.

**Instead:** when a spec's name asserts a scope, source, or mode, the fixture must set it EXPLICITLY. Never inherit it from a factory default.

**Corollary — incidental `toHaveLength` assertions are contracts too.** A row/entry count in a spec whose stated subject is a flag silently pins derivation behaviour the spec never claims to own; the count above pinned id-keyed removal detection for an unlisted shape and broke when the rule was re-keyed per slot. Either assert the count deliberately with a comment saying why that count is the contract, or assert on the specific row (`rows.find(...)`) instead of the collection.

### Never name a spec for a source whose data the fixture does not ship

**What:** A spec named for one catalogue's content — "should have rendered real stacks during stack selection" — driving a list that came from somewhere else, with a comment reconciling the two.

**Why:** the comment does not fail when the substitution it describes goes away. Two suites pointed at the real skills clone to exercise "real marketplace" content. The clone ships no `config/stacks.ts`, so every stack the wizard offered them came from the CLI's own built-in list, and both drove that list as if it were the marketplace's — one asserting on it under a name claiming otherwise, the other installing "the first stack's defaults", which resolved a built-in stack's ids against a different catalogue's skills. Neither suite was wrong about the CLI at the time; the record of the swap was a comment, so when the substitution was withdrawn both failed in `beforeAll` on a wait for a step that no longer renders. The failure named a timeout, not the assumption.

**Instead:** when a fixture cannot supply the subject, the spec's NAME and its assertions both move to what is actually under test. Both suites now open on the step a stackless source actually renders (`InitWizard.launchOnDomainsInProject`) and pick their skills by display name; the roster expectation moved off a built-in stack's agents onto the Web domain's preselection (`WEB_DOMAIN_AGENTS` in `e2e/fixtures/expected-values.ts`), and `real-marketplace.e2e.test.ts` gained the positive the pair was missing — a spec asserting the stack step's own strings never appeared in the session's append-only output at all. The substitution is now something a spec would catch rather than something two suites depended on.

### Never write a fixture literal that mirrors a generated union without diffing it against the union

**What:** A `category`, `domain` or `slug` in a fixture table set to a value no generated union carries. `web-state-zustand` was mapped to a `web-state` category for two passes; the canonical member is `web-client-state`.

**Why:** the field is `string` **on purpose**. `renderMetadataYaml`'s `SkillMetadataFields` types `category` loosely so error-path fixtures can author deliberately invalid values — `ProjectBuilder.withCustomSkill` writes a category the product does not have, precisely to exercise custom-skill handling — so narrowing it would break a fixture that needs it. The compiler will therefore never validate a fixture's category, and the wrong literal sat in the table every fixture skill's metadata is written from, with the suite fully green, because no assertion happened to read it. This is a review-discipline gap by construction, which is why it has to be written down rather than enforced.

**Instead:** when adding or editing an entry, grep the value against `CATEGORIES` in `src/cli/types/generated/source-types.ts` and confirm it is a member — or, if it is deliberately not one, say so in a comment naming the test that depends on it. The table in `e2e/fixtures/project-builder.ts` carries that constraint above it, naming both the authoritative union and the `web-state-*` trap specifically.

**Corollary: "no test failed" is not evidence a fixture value is correct.** Fixture correctness is established against the product's source of truth, never against the suite's exit code. What a fixture must WRITE, as opposed to what it may NAME, is [test-data.md § A Fixture Writes Content the Product Could Have Written](./test-data.md).

---

## Harness Invariants

### All harness process spawners must resolve HOME identically

**What:** One spawner defaulting HOME differently from the others — historically `CLI.run` hardcoded `HOME: project.dir` while `TerminalSession` and `runCLI` had moved to a sibling temp dir.

**Why:** A wizard that installs global content to its sibling HOME, followed by a `CLI.run` that reads with `HOME=projectDir`, disagrees on where "global" lives. The symptom is not an obvious assertion failure — it is `ENOENT scandir <projectDir>/.claude/skills` from a command that looked unrelated.

**Instead:** `TerminalSession`, `runCLI`, and `CLI.run` all default HOME to a temp dir distinct from `cwd`/`projectDir`, and an explicit `env.HOME` always wins and is never auto-removed. `CLI.run`'s full precedence is `options.env.HOME` > `project.globalHome` > `project.dir`, so a handle produced by `launchInProject` / `launchInGlobal` routes the follow-up command to the same global root the wizard wrote, while a handle from a plain `launch()` (whose `globalHome` is undefined) falls back to `project.dir` exactly as before the precedence existed. This is true in code today; it is documented here so it does not regress. Any new spawner must adopt the same precedence.

### Never try to vary an input the OS canonicalizes before the process sees it

**What:** An E2E spec that builds a symlinked sandbox — or otherwise perturbs the path a directory is reached BY — to exercise path-normalization behaviour in a command that takes its target from `process.cwd()`.

**Why:** `process.cwd()` is `getcwd(2)`. The kernel returns the canonical path with every symlink already resolved and does not consult `$PWD`, so spawning a child with `cwd: <tmp>/link/proj` gives that child `process.cwd() === <tmp>/real/proj` — measured directly in this environment. The distinction the spec exists to create is erased before any production line runs; `path.resolve` and `realpathSync` agree on an already-canonical path, and the spec passes identically against the bug and against the fix. The harness chooses WHICH directory a command runs in. It can never choose by WHICH PATH that directory is reached.

**Instead:** cover it one layer down, where the path is still a parameter the test supplies. `registerProjectPath` stored a `realpath` while `deregisterProjectPath` looked the entry up under `path.resolve`, so any project under a symlinked ancestor stayed registered forever after `uninstall`; the guard is `local-installer.test.ts` → "should deregister a project reached through a symlinked ancestor", which was watched red against the pre-fix normalization while its four plain-path siblings stayed green. Keep the E2E for the plain-path contract. Before writing any E2E whose subject is how a path is normalized, ask whether that value reaches production through `process.cwd()` — if it does, this layer cannot express the case, and a spec claiming otherwise advertises coverage that does not exist.

---

## Reachability

### Prove the surface is reachable before writing the spec

**What:** Writing an E2E for a store action, a hydration branch or a guard without first establishing that a keypress path reaches it in the flow under test.

**Why:** a spec for an unreachable branch has two possible outcomes and both are bad, neither visible from reading it. Either it is RED against correct code, because it asserts a state no flow can produce, or it is a vacuous pass, because fixed and unfixed code emit identical output when the precondition never holds. Two requested specs ran aground here on different mechanisms:

| The spec that was asked for                  | Why no flow reaches it                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A project-scope edit toggling a DOMAIN off   | `toggleDomain`'s only callers are the DOMAINS step and the init-only "start from scratch" branch. `edit` hydrates at `build` with `history: []`, so its ESC handler no-ops — already pinned by `edit-wizard-navigation.e2e.test.ts` → "should stay on build step when pressing ESC in edit flow with no prior history" — and `init` on a machine that has a global install routes to the dashboard, and from there to `edit`. |
| An agent tombstone surviving a stack re-pick | Re-picking a stack wipes `agentConfigs` and rebuilds it from a snapshot taken once at hydrate time, which the agents-step toggle never writes to. The preserve-the-tombstone branch is non-empty only when that snapshot already holds a tombstone, and it is hydrated from the GLOBAL config, which never legitimately holds a project-scoped dual pair.                                                                     |

**Instead:** grep the action's callers, then trace which config feeds the state the branch reads and which gates stand between a keypress and it (`!initialAgents?.length`, `isEditingFromGlobalScope`, dashboard-vs-wizard on an existing install). If nothing reaches it, cover the behaviour at unit level — `wizard-store.test.ts` seeds the state directly and is then the correct and only gate — and say so in the response to whoever asked for the E2E, rather than writing the spec and letting the plan keep calling the fix user-visible. Do not synthesize a flow the UI cannot produce, and never settle for an absence-only assertion: a blocked action satisfies one vacuously.

Which wizard surfaces are init-only, with the source trace, is recorded in [reference/wizard/state-transitions.md](../../reference/wizard/state-transitions.md).

---

## Duplicated Helpers

### Extract shared assertion helpers at 2+ files

**What:** The same assertion function or wizard navigation flow defined identically in two or more test files.

**Why:** Duplicated helpers drift. When one copy is updated, the other silently becomes incorrect.

**Instead:**

- Assertion functions used in 2+ files -> extract to `e2e/assertions/` (e.g., `config-assertions.ts`, `scope-assertions.ts`)
- File/fixture WRITERS used in 2+ files (anything that emits a file into a project or scope dir) -> extract to `test-utils.ts`, beside their well-formed counterparts. Same 2+ threshold as assertion helpers and for the same reason: two copies of a writer drift, and the stale one stops producing the state its spec name claims. `writeCorruptConfig(baseDir, source)` sits next to `writeProjectConfig` / `writeConfigTypes` as the error-path sibling that reproduces a config which EXISTS and cannot be loaded; four spec files share it now. Until this line existed the list had no threshold for writers at all, so its literal reading permitted a second file-local copy
- Common wizard navigation patterns (e.g., "complete edit from build step") -> methods on the wizard page object (e.g., `EditWizard.completeFromBuild()`)
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

**What:** A local helper like `getSkillPrefixesByScope(output, skillName)` — a loop, a regex scan (`/([+\-~\u2022])\s+[A-Za-z]/`), a `currentScope` state-machine variable that toggles on label matches, or a first-match-wins rule that plucks diff prefixes out of `lastFrame()` / `getFullOutput()`.

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
// three specs at once: scope-toggle-combined, scope-toggle-config-snapshot and
// dual-scope-edit-scope-changes.
const honoProjectLines = projectConfig
  .split("\n")
  .filter((l: string) => l.includes(E2E_SKILL.hono.id) && l.includes('"scope":"project"'));
expect(honoProjectLines, "the collapsed pair must leave no project-scope entry").toStrictEqual([]);
```

**Why:** it is a claim about the config writer's line breaking, not about the config. The scan only finds an entry while the writer keeps that entry's `id` and its `scope` on one emitted line, so a pure formatting change reads as a product regression in the positive direction — and in the negative direction above it is worse: the filter finds nothing, the `toStrictEqual([])` passes, and the spec reports that a project-scope entry is absent when all that happened is that the writer wrapped.

**Instead:** load structurally. `readSkillEntries(dir, skillId)` (`e2e/fixtures/dual-scope-helpers.ts`) returns that skill's entries and is filtered on `scope`; `loadConfigOrFail(dir)` and `readAgentEntriesFor(dir, name)` (`e2e/helpers/test-utils.ts`) cover the rest. Reading raw config text with a single `toContain` for one token — `'"excluded":true'` — stays acceptable; the ban is on split/loop/filter extraction, matching CLAUDE.md's wording.

All three sites named above now take that form, and they are worth reading as the three shapes the replacement comes in. `scope-toggle-combined` and `scope-toggle-config-snapshot` assert `readSkillEntries(projectDir, E2E_SKILL.hono.id)` against `toStrictEqual([{ id, scope: "global", origin: "eject" }])` — which says more than the retired scan did, because it pins what the collapse LEFT as well as what it removed, where `toStrictEqual([])` could only ever say "nothing matched my filter". `dual-scope-edit-scope-changes` carries the agent-side equivalent through `readAgentEntriesFor`, and `scope-change-deselect-integrity` compares `(await loadConfigOrFail(fakeHome)).skills` against a structurally-loaded before-snapshot rather than two line scans of the same text. The suite currently holds no split/loop/filter over raw `config.ts` text, and since the normalizers moved out it holds no `split` over config text at all: every remaining `split("\n")` under `e2e/` is over rendered TERMINAL output — the step page objects and `base-step.ts`, plus the hand-run harness, where `handrun-journeys.ts` reads the binary's stdout and one line of `handrun-driver.ts` takes the first line of an error to report it. The two whole-file normalizers, `normalizeConfigPreservingOrder` and `normalizeGlobalConfig`, live in `src/cli/lib/__tests__/helpers/config-comparison.ts` with their own spec and reach specs through `e2e/helpers/test-utils.ts`; both drop the machine-specific `"projects"` line before an equality and extract nothing, which is what keeps them outside this ban.

### Never put an extractor in front of an assertion

**What:** A `find`-based lookup that pulls the entry out of a loaded structure just before asserting on it — `findAssignment(category, id)` and friends.

**Why:** the lookup decides what the assertion can fail on. A lookup-then-assert asks "does this category CONTAIN an entry with this id, and is its `preloaded` right?"; the direct form asks "is this category EXACTLY this value?". Everything the writer additionally emitted — a second skill fanned out by a curation regression, an array where a bare string belongs — is invisible to the first question and caught by the second. Per-agent curation, which the spec carrying that helper exists to protect, fails by an agent GAINING an entry it was not meant to hold. The helper sat on the assertion side, so it silently narrowed every call site in the file.

**Instead:** produce the value and assert on it whole. The verbosity is the point:

```typescript
expect(stackAfterEdit["api-developer"]?.["api-api"]).toStrictEqual({
  id: "api-framework-hono",
  preloaded: true,
});
expect(stackAfterEdit["web-developer"]?.["web-client-state"]).toStrictEqual("web-state-zustand");
```

**The one legitimate local helper is a spec whose subject IS the serialized form** — the writer's compaction, which a structural loader normalizes away on read, so no structural assertion can express it. It must be a pure slice-and-`JSON.parse` with no per-shape branching, it must carry a JSDoc naming the writer/loader pair it deliberately bypasses, and it must never appear on the assertion side. `extractStack` in `stack-per-agent-curation.e2e.test.ts` is the reference example; `findAssignment`, removed from that same file, is the counter-example. Without that carve-out written down, the surviving helper reads as an unfixed instance of the ban arguing with the rule in a comment.

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
// init-dashboard-edit-plugin-install.e2e.test.ts — still live
const projectConfig = await loadProjectConfigFromDir(projectDir);
const projectSkillIds = projectConfig?.config.skills.map((s) => s.id) ?? [];
expect(projectSkillIds).not.toContain(VUE_SKILL_ID);
```

**Why:** a missing `config.ts` — the exact failure a spec like this exists to catch — yields an empty array, and the empty array satisfies every `not.toContain` and every `toHaveLength(0)` downstream. The test reports green for a project that has no config at all. Note the asymmetry that makes it survive review: the same file loads a config two blocks earlier and pins non-nullness explicitly, so one load is safe and its neighbour is vacuous, and nothing marks the difference.

**Instead:** `loadConfigOrFail(dir)` from `e2e/helpers/test-utils.ts`, which throws on a config that is absent or unparseable and returns `ProjectConfig` directly. This is the spec-side face of CLAUDE.md's ban on optional chaining and null coalescing over data that must exist; the rule was only ever being enforced on `src/`. The mechanical check is cheap: every `loadProjectConfigFromDir` hit under `e2e/` belongs to a helper, never to a spec.

### Never let a gate filter its own subject

**What:** a reader that selects which elements of a document, listing or output it will judge and drops the rest — `.filter(isSpecReference)`, `.filter(isRelevant)`, skipping a row whose shape it does not recognise. The rule above is the same silence one level down: there the assertion is skipped, here the SUBJECT is.

```typescript
// Bad: a name whose first segment is not a spec directory is dropped, and nothing says so
function isSpecReference(named: string): boolean {
  const [directory] = named.split("/");
  return directory !== undefined && SPEC_DIRECTORIES.includes(directory);
}
```

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

**Why:** every crash satisfies it, including a crash from an unrelated layer. Those two specs were named for `init`/`edit` reporting an unusable `--source`, and what they were actually green on was Ink's raw-mode failure: the run resolved the DEFAULT marketplace instead of refusing the flag, got as far as mounting the wizard, and died there because the invoking shell is not a TTY. A ~60-line React reconciler trace satisfied `combined.length > 0`, and would have kept satisfying it with the source guard deleted. The specs never mentioned the path the user typed, and neither did the CLI.

**Instead:** the specific message plus the specific input that provoked it, so the assertion cannot pass for a different failure of the same command. `init-edit-error-guards.e2e.test.ts` now asserts the refusal (`Local marketplace not found:`) together with the offending path, and the flag-parse guard beside it asserts oclif's own `Nonexistent flag: --source` — see [assertions.md § A negative over tool output quotes the tool's own string](./assertions.md).

**Corollary — an interactive command driven through `runCLI` (no PTY) can only be asserted on failures that happen BEFORE Ink mounts.** Everything after that point is masked by the raw-mode crash. Argument-handling specs for `init` / `edit` belong on the PTY harness, or the argument handling belongs ahead of the render.

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

### Never assert a rendering invariant at a geometry where the subject does not render

**What:** A `not.toContain("<bug shape>")` captured on a clipped viewport, at a scroll offset where none of the rows the bug shape is made of are painted.

**Why:** It passes for free. The frame under test contains no candidate for the match, so the assertion is about nothing — it cannot distinguish a fixed product from a broken one.

**Clearing the size gate is not evidence the content is visible.** At `TERMINAL_SIZE.SHORT` the confirm step's summary viewport measures five rows, and all five are consumed by the `Marketplace` / `Stack` header block. The first summary row only appears six presses into a twelve-press scroll range.

**Instead:** scroll the subject onto the screen first, then pair the negative with a **positive guard** asserting the subject IS in the very frame you captured.

```typescript
// Bad: no `+ ` row is painted at offset 0, so the bleed signature cannot appear either way
const screen = confirm.getScreen();
expect(screen).not.toContain("─+ ");

// Good: run the viewport to the end of its range, prove the subject is painted, then assert the bug shape's absence
await confirm.scrollSummaryToBottom();
const screen = confirm.getScreen();
expect(screen).toContain("+ web-developer"); // positive guard
expect(screen).not.toContain("─+ "); // now about a painted subject
```

`ConfirmStep.scrollSummaryToBottom()` is closed-loop — it presses while the frame still reports content below and throws rather than returning short, because the summary's height depends on how many skills and agents the run selected.

This is the same proof-of-execution rule [README.md](./README.md) § Critical Rules applies to conditional code paths, extended to rendering.

### A counter is not its content

**What:** Proving a scroll happened by asserting the affordance's numbers moved — `more below` becoming `more above`, `12 more above` appearing.

**Why:** The counters are the panel's own bookkeeping. They move whether or not the content does, so they are a different subject from the rows they count.

Mutation evidence: pinning `contentMarginTop` to `0` in `use-panel-scroll.ts` (i.e. disabling the scroll entirely) left the frame reading `12 more above` **while showing the unscrolled header** — and both counter assertions stayed green. Only a direct assertion on a revealed row went red.

**Instead:** assert a row that the movement revealed.

```typescript
// Bad: the affordance's own bookkeeping, not the content
expect(before).toContain(STEP_TEXT.SCROLL_MORE_BELOW);
expect(after).toContain(STEP_TEXT.SCROLL_MORE_ABOVE);

// Good: a row that was not on screen before and is now
expect(after).toContain("+ web-developer");
```

### Never call a spec a regression guard until you have watched it go red

**What:** Writing a spec against a defect's reported symptom, seeing it pass after the fix, and shipping it as the guard.

**Why:** Green after a fix is not evidence the spec can detect the bug. Two distinct mechanisms produce a spec that passes for the wrong reason, and neither is visible by reading the spec:

1. **The fixture is smaller than production, so the defect's blast radius is different.** `createE2ESource()` writes **one** stack and **ten** skills; the real marketplace carries a dozen stacks and many more skills. For a size-dependent rendering defect, how far an overpaint reaches scales with list length. The stack-step bleed destroyed the footer against the real marketplace, but against the fixture — three rows in a one-row viewport — the overflow was two rows, destroying the stack row and stopping well short of the footer. **The footer assertion, the one matching the reported symptom and reading as the sharpest signature, passed against the unfixed binary.** The assertion that actually went red was an unrelated-looking positive: `toContain(E2E_STACK_NAME)`.

2. **The assertion's subject is not painted in the captured frame** (the two rules above).

**Instead:** revert the fix in `src/`, run `npm run build`, run the spec, and confirm it is red **and red for the reason the test name claims**. Then restore. Record in the spec which assertion carries the red under this fixture, so the next reader does not "simplify" the spec down to the one that does not.

```typescript
/**
 * Both assertions are genuine and both stay. The footer line guards the
 * production-shaped bleed (reaches the footer against a dozen stacks); the
 * stack-row match is the one that actually goes red under this fixture's
 * single stack. Mutation-verified against the unfixed binary.
 */
```

**When the pre-fix binary cannot express the defect, mutate the FIXTURE rather than `src/`.** A spec asserting that an operation leaves something UNCHANGED cannot be reverted into redness where the old behaviour also left it unchanged: a bug that skipped the write and a guarantee not to write are the same bytes on disk. `install-update-source-drift.e2e.test.ts` is the worked example — it pins that `update` leaves an ejected `SKILL.md` byte-identical after the source it was forked from gains a section, and it is GREEN against the pre-rewrite binary, because that command's own defect (a local skill installed under its own id shadowed the source entry, so it classified `local-only` and was skipped) copied nothing either. Applying the standard literally there — revert, rebuild, see green, conclude "already covered" — ships a spec that can never fail. Instead, make the subject change by hand at the point the operation would have changed it (one line appended to the INSTALLED `SKILL.md` immediately before the run), confirm the spec goes red on the assertion whose message claims the guarantee and on nothing else, then remove the mutation. Record in the spec's JSDoc that this is how it was checked, so the next reader does not repeat the `src/` revert and draw the wrong conclusion from a green run. The class is not rare: every "must not touch", "must not recompile", "must not rewrite the config" assertion is in it.

This applies to repairs as much as to new specs: a "fixed" vacuous assertion nobody has watched go red is indistinguishable from the vacuum it replaced.

### Never take a "before" snapshot you do not compare against

**What:** `const configBefore = await readTestFile(configTsPath(dir))` followed by wizard work and then assertions that never reference `configBefore`.

**Why:** A "before" snapshot is a promise that an `expect(after)` follows. This is the most dangerous shape in the weak-assertion family because the surviving assertions look thorough.

**The worked instance is closed; the rule is not.** `scope-toggle-config-snapshot.e2e.test.ts` — _"should compile agent at project scope and preserve global"_ — snapshotted **both** configs under a comment reading `// BEFORE: Snapshot both configs` and compared **neither**. Its two after-assertions were `toContain("web-developer")` on each config, and the fixture writes `web-developer` into both files _before_ the toggle runs. **Both were already true of the pre-state**, so the spec would have passed with the toggle keystroke silently swallowed — a documented failure mode of this harness (see the [page-object key-press rule](./README.md)). That spec is now the reference for the correct form instead: each of its three tests takes both snapshots and spends both, `.not.toBe(projectConfigBefore)` on the file the edit was supposed to rewrite and `.toBe(globalConfigBefore)` on the one it must not touch, each with an assertion message naming the guarantee rather than the operation.

**Instead:** if a spec snapshots two files it must assert on two files — the one that should have changed (`.not.toBe(before)`, the proof the keystroke landed) and the one that should not (`.toBe(before)`).

```typescript
// Bad: true of the pre-state; passes with the interaction swallowed
expect(projectConfigAfter).toContain("web-developer");
expect(globalConfigAfter).toContain("web-developer");

// Good: one changed, one did not — and the change is the proof the toggle landed
expect(projectConfigAfter).not.toBe(projectConfigBefore);
expect(globalConfigAfter).toBe(globalConfigBefore);
```

`toContain("<name>")` on the after-state is never a substitute: in a dual-scope fixture the name is usually present in both configs before the wizard runs.

The unspent half of this is mechanical and worth running before a review rather than during one — a snapshot binding that is never named again is a promise the spec did not keep. It currently reports nothing:

```
for f in $(grep -rl 'Before\b' e2e --include='*.e2e.test.ts'); do
  for v in $(grep -oE 'const [a-zA-Z0-9_]*[Bb]efore[a-zA-Z0-9_]*' "$f" | awk '{print $2}' | sort -u); do
    [ "$(grep -c "\b$v\b" "$f")" -le 1 ] && echo "$f :: $v"
  done
done
```

It is a floor, not a gate: it catches the binding nothing reads, and cannot see the one read into a weaker assertion than the snapshot deserved. That half is what the paragraph above is for.

Related: check the scope you are actually running at. `scope-toggle-roundtrip.e2e.test.ts` asserted the global config was unchanged and dropped the project one — in a spec whose session runs at PROJECT scope, i.e. it checked the file the edit was least likely to touch and skipped the file it was most likely to touch.

### Never pin state your setup produced in place of state your action changed

**What:** Two shapes, one mistake — an assertion whose truth is owned by the fixture rather than by the action the spec is named for.

`expect(...).not.toHaveConfig()` at the end of a guard test is the first. Three specs, each existing to prove that a project-scope edit cannot alter a globally-installed skill or agent, ended on it. It says nothing about the guarded edit: it asserts the ABSENCE of a file the setup helper was responsible for creating or not creating, and it passed only because `cc init` in a project did not yet materialise the project config. When `init` was fixed to materialise deliberately, all four assertions broke on a line unrelated to the behaviour each test is named for, while the actual guard assertions stayed green throughout.

**`not.toHaveConfig()` proves absence, not immutability** — and it becomes vacuous the moment the artifact starts existing for unrelated reasons. What a guard needs is a snapshot taken immediately after setup and compared byte-for-byte after the guarded action, plus the filesystem side the old line never touched. That is what the three guard specs carry now, and it is what CLAUDE.md already asked for ("if it should NOT change something, snapshot before and assert identical after"):

```typescript
const projectConfigBefore = await readTestFile(configTsPath(env.projectDir));
// ... guarded edit ...
expect(
  await readTestFile(configTsPath(env.projectDir)),
  "a blocked skill toggle must leave the project config byte-identical",
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

**An assertion helper can carry the same defect, and one did for four months.** `expectFullInstallation` was written into `e2e/assertions/phase-assertions.ts` on 2026-04-09 with the rest of that layer, and **no spec named it in the repository's entire history** — `git log --all -S 'expectFullInstallation'` returns the commit that wrote it and eight documentation commits, and no other change to a `.ts` or `.tsx` file at all. It reached four reference and standards documents, including a section of `assertions.md` describing when to reach for it — removed with it — and it was deleted on 2026-08-19 without having been executed once. Documentation is not a caller: four descriptions of an unrun helper make it look established, and the more thoroughly it is written up the more certainly the next author reaches for it instead of the one that has been seen to work.

**A helper with no callers TODAY is not automatically this, and the difference decides what you owe it on the way out.** `assertConfigIntegrity` and `expectConfigOnDisk` (`src/cli/lib/__tests__/assertions/config-assertions.ts`) were extracted from live integration specs and lost their callers as COLLATERAL — `init-end-to-end.integration.test.ts` and `init-flow.integration.test.ts` were deleted wholesale by an unrelated change and took every call site with them. Those two ran, and proved something, right up until their subject went. So establish which kind you have before deleting: a helper that never had a caller has never been shown able to fail and owes nothing, while a helper that LOST its callers has to be read for invariants nothing else now covers — doing that at `assertConfigIntegrity` is what surfaced two config-writer claims with no live assertion anywhere (that `config.agents` is written alphabetically, and that every `config.stack` key also appears in `config.agents`), both invisible to the surviving helpers because every one of them sorts before comparing.

### Never delete an unused binding in a test without triaging it first

**What:** Clearing an `@typescript-eslint/no-unused-vars` report in a spec by deleting the binding.

**Why:** In production code a dead variable is usually just dead. **In a test, the binding is very often the thing the author intended to assert on** — so it marks the exact spot where an assertion was planned and never written. A destructured `stdout` / `exitCode` / `lastFrame` that is never asserted on means the test **ran the code and checked nothing about the result**.

The first pass of this rule over `e2e/` produced 15 reports, of which 8 were missing assertions — including three captured-but-unasserted exit codes, one with the missing assertion written out in English in the spec's own comment (`doctor-dual-scope.e2e.test.ts`: "the important thing is doctor runs without crashing on the extra directory", when `cc doctor` exits non-zero on any `fail` check, so "without crashing" had an exact checkable form).

**Instead:** ask what the author meant to do with it. Delete only after establishing that the binding names nothing the spec should have asserted. Where the intended assertion is not obvious, **report it rather than inventing one** — and never weaken an existing assertion to make the report go away. Derive added assertions from something already present: the spec's own name, its own comment, or a sibling spec in the same file.

See the `src/`-side sibling of this rule, `.ai-docs/agent-findings/2026-08-01-unused-bindings-in-tests-mark-assertions-that-were-planned-but-never-written.md`.

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

**What:** `expect(rows).toEqual(expect.arrayContaining([{ prefix: "•", name: "React" }]))` for info-panel rows, config section diffs, or scope-per-skill prefix maps.

**Why:** `arrayContaining` passes as long as the expected entries exist — it silently tolerates extra wrong entries. A spurious `- React` row alongside the expected `• React` ships undetected.

**Instead:** `toStrictEqual` on a scope-anchored slice so the entire rendered shape is pinned. If a positive-only match is unavoidable, pair it with an explicit `.not.toEqual(expect.arrayContaining([<bug-shape>]))`. See [assertions.md § Diff-Shape Assertions](./assertions.md).

### Never use bare matcher calls

**What:** `await expect(project).toHaveConfig()` or `await expect(project).toHaveCompiledAgents()` without parameters.

**Why:** Only checks the file exists, not its content. A corrupted or wrong config passes.

**Instead:** Always pass parameters: `toHaveConfig({ skillIds: [...], agents: [...], source: "..." })`.

### Never omit negative assertions after removals

**What:** After uninstall/deselection, only checking what remains — not checking that removed items are gone.

**Why:** If the removal failed silently, the test still passes because the remaining items are present.

**Instead:** Use `expectCleanUninstall(dir)` or add explicit `notContains` / `toHaveNoLocalSkills()` checks.

### Never accept config state as proof that an external operation happened

**What:** Asserting `config.ts` records `source: "<marketplace>"` after a plugin install or a mode migration, and stopping there.

**Why:** the config entry and the install are written by different code, and the whole orphan-entry class is exactly the case where the first happened and the second did not. `edit-wizard-plugin-migration.e2e.test.ts` → "mode migration local -> plugin" was green while `claude plugin install` failed on **every** run: the migration deleted each ejected working copy first, downgraded install failures to warnings, and persisted a config claiming a marketplace source for skills that were never installed. The spec asserted the exit code and the config, so it certified precisely the state the rule forbids — and the underlying cause (the migration path never registered the marketplace, unlike every other install path) stayed invisible until the warning was promoted to a hard error and the spec finally went red.

**Instead:** assert the external effect too — `toHavePlugin(key)` / `toHavePluginInRegistry(key, scope)`, or at minimum that no install-failure line was emitted. This is CLAUDE.md's "verify config AND filesystem" extended to "verify the config AND the external effect it claims", and it applies to anything the CLI delegates: plugin installs, marketplace registration, a spawned binary's own bookkeeping.

### Never check the wrong scope directory

**What:** `await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer")` when agents compile to `fakeHome`.

**Why:** In dual-scope setups, agents default to global scope. Compiled agents go to `$HOME/.claude/agents/`, not `<project>/.claude/agents/`.

**Instead:** Check the correct directory for each scope. Use `expectDualScopeInstallation` for structured dual-scope checks.

### Never prove an in-session change from the saved config or the scope badges alone

**What:** A spec whose keypress mutates BOTH the grid's selection intent (`domainSelections`) and the saved-config shape (`skillConfigs`), verified only after the wizard exits — the written `config.ts` — and on a freshly re-opened wizard's `[P]` / `[G]` badges.

**Why:** the two come from different stores and can disagree, so neither sees the divergence. Collapsing the project half of a persisted `[P][G]` skill correctly leaves one active inherited-global entry in `skillConfigs`, and separately removed the id from `domainSelections` unconditionally — so the grid rendered the row UNSELECTED in-session while the skill was still active via the global install. The badge is sourced from `skillConfigs.scope`, so it kept painting `G` and a badge-only assertion could not tell. Both dual-scope suites asserted post-save and on re-opened badges only, and the bug shipped.

**Instead:** assert the LIVE state in the same session, before saving. Under `NO_COLOR` the exclusive category's `(selected of total)` counter is the only text-observable signal of selection — read it with `BuildStep.getExclusiveCategorySelectedCount(categoryDisplayName)`, as `dual-scope-in-session-collapse-restore-sequence.e2e.test.ts` does across the collapse and the restore. Why the cell itself is unobservable is in [assertions.md § Assert the Surface That Retains the Value](./assertions.md).

### Never read `toHaveAgentDynamicSkills` as a laziness claim on its own

**What:** `toHaveAgentDynamicSkills(agent, { skillIds: [x] })` written to mean "x arrives on demand", or `toHaveAgentFrontmatter(agent, { skills: [x] })` written to mean "x and nothing else preloads".

**Why:** The two halves are disjoint in the DATA — `buildAgentTemplateContext` partitions an agent's skills into `preloadedSkills` and `dynamicSkills`, and a compiled agent prints a preloaded id in frontmatter and a dynamic one in the body's activation protocol. Neither matcher enforces that split. `toHaveAgentDynamicSkills` strips the leading frontmatter block and searches the WHOLE remaining file, so it answers "is this id somewhere in the body", which any body prose naming the id also answers. `toHaveAgentFrontmatter`'s `skills` is a subset check, so it passes on an agent that preloads everything it holds. Each is green under the failure the other exists to catch.

**Instead:** state both halves. `toHaveAgentFrontmatter({ exactSkills })` or `{ noSkills: true }` pins the preload list Claude Code reads; `toHaveAgentDynamicSkills({ skillIds, noSkillIds })` pins what the body reaches. Which skill is which comes from the stack — `createMockSkillAssignment(id, true)` in `create-e2e-source.ts` is preloaded, the default is dynamic. Full expectation-by-expectation table: [assertions.md § Agent Matchers](./assertions.md).

### Never write assertion values without verifying them against production code

**What:** Writing `expect(config.agents).toStrictEqual([{ name: "web-developer", scope: "project" }])` without checking what the code actually produces.

**Why:** This was the #1 source of incorrect assertions (30+ instances). Common mistakes:

- Agents default to `scope: "global"`, not `"project"`
- Config preserves skills in domain iteration order, not alphabetical
- `compactStackAssignments` compacts `{ id, preloaded: false }` to bare string IDs
- `toStrictEqual` treats `excluded: undefined` as different from a missing `excluded` property

**Instead:** Read the production source to understand exact return types, and derive each expected value from the writer that emits it. Running the test to see what it currently produces forms a hypothesis; it never supplies an expectation — an observed value pins the defect exactly as readily as the contract. See [assertions.md § Writing Correct Assertion Values](./assertions.md).

### Never use broad negative assertions on merged configs

**What:** `expect(projectConfig).not.toContain('"source":"eject"')` on a config that contains both project-scoped and global-scoped entries.

**Why:** The merged config contains entries from BOTH scopes. An excluded global entry legitimately retains `"source":"eject"` as a tombstone. A broad `not.toContain` catches entries from the wrong scope.

**Instead:** Target the specific scope's entry with a regex or use `toHaveConfig` which checks config content at a higher level:

```typescript
const projectHonoSource = config.match(/"api-framework-hono","scope":"project","source":"([^"]+)"/);
expect(projectHonoSource![1]).not.toBe("eject");
```

### Never assume skill ordering is alphabetical

**What:** `expect(config.skills.map(s => s.id)).toStrictEqual(["api-framework-hono", "web-framework-react", "web-state-zustand"])` (alphabetical).

**Why:** Config preserves skills in domain iteration order (web skills first, then api, then meta). The actual order is `["web-framework-react", "web-state-zustand", "api-framework-hono"]`.

**Instead:** Sort both sides: `expect(config.skills.map(s => s.id).sort()).toStrictEqual([...expected].sort())`, or use `expectConfigSkills` which normalizes ordering automatically.

---

## Page-Object API Hygiene

A page object is documentation. Every method on it advertises an interaction to the next spec author, so a method nobody drives, or a method whose verb is wrong, is worse than absent — the next spec is built on it.

### Never add a speculative page-object method

**What:** A method added for symmetry with an existing one — `moveSourceColumnLeft` beside `moveSourceColumnRight`, `arrowUp` beside `arrowDown` — with no spec calling it in the same change.

**Why:** dead page-object methods are worse than dead product code: they advertise a capability nothing has ever exercised, and a flow built on one is a flow nobody has seen work. The sources-grid pair was the live case — no spec ever pressed arrow-left in that grid, and the unused wrapper was in turn the only caller of a protected `BaseStep` primitive, so two layers existed to serve nobody.

**Instead:** add a step method when a spec calls it, and delete a `BaseStep` primitive in the same change that removes its last caller.

### Never name a step method for the mental model instead of the key's semantics

**What:** `toggleFocusedSource()` for a handler that commits a selection.

**Why:** read the component's `useInput` handler before naming the method. In the sources grid, Space calls `onSelect(currentRow.skillId, currentOption.id)` — it commits the focused column as that skill's source, idempotently. There is no toggle-off, so the name described a behaviour the product does not have. It was also the more popular of the two names in use, and the comments at its call sites had already drifted into describing the interaction as a toggle. Accuracy beats call-site count: renaming sites once is cheaper than every future author inferring toggle semantics from the name. `selectFocusedSourceCell` is what survived.

### Never keep an alias method, and never re-inline a fixture's exported type

One interaction, one method name: an alias doubles the vocabulary an author has to learn and guarantees the two doc comments drift. And when a launcher option describes a value a fixture factory produces, import that factory's exported type — `EditWizardOptions.source` was an inline `{ sourceDir: string; tempDir: string }` structurally identical to the exported `E2ESource` its sibling `InitWizardOptions` already used, so the two launchers disagreed on how to spell one concept. This is CLAUDE.md's "NEVER create redundant type aliases" applied to inline structural literals, stated here because `e2e/pages/` is where it recurred.

---

## Choosing the Wizard Launcher by Scope

The E2E sandbox defaults `HOME` to a sibling temp dir distinct from `projectDir` (`terminal-session.ts`), so a wizard launched with `launch()` / `launchInProject()` runs at genuine PROJECT scope (`isEditingFromGlobalScope === false`). Because skills and agents default to GLOBAL scope, their installed content lands under that global `HOME` — exposed to tests as `wizard.globalHome`, not `projectDir`. `launchInGlobal()` instead models editing the GLOBAL install (`HOME === cwd === projectDir`), where every artifact collapses back onto `projectDir`. Pick the launcher by what the test does, not by habit.

### Always match the launcher to the scope the test edits

**What:** Reaching for `launchInProject` on every ported test, or leaving `launch()` where the test installs and then asserts global content against `projectDir`.

**Why:** A project-scope edit installs global-default content under `wizard.globalHome`, not `projectDir`. A test that consumes or asserts that content against `projectDir` silently diverges from where the content actually landed.

**Instead:** Fresh init/edit that only ASSERTS installed content → `launchInProject` + redirect `.claude/` content matchers to `{ dir: wizard.globalHome }` (config stays on `projectDir`). Edits that mutate global content, or flows with a cwd-resolving follow-up → `launchInGlobal` (see below). Output-only navigation tests need neither — keep `launch()`.

### Never use `launchInProject` for a test that toggles a global skill's source

**What:** Porting a source-switch test (plugin ↔ eject during `cc edit`) to `launchInProject`.

**Why:** In a project edit, a globally-installed skill is rendered read-only in the Sources step (`source-grid.tsx` — "installed globally, not yours to change here"). The toggle is a silent no-op, the wizard exits `EDIT_UNCHANGED`, and the config never gains the new source — so the test fails downstream, not with an obvious error.

**Instead:** Use `launchInGlobal` (`HOME === cwd === projectDir`) to edit the scope where the skills live and are editable. Every artifact collapses onto `projectDir`, so the assertions need no redirect or split. The reason this was invisible for so long is worth carrying: under the old harness, HOME and `projectDir` were the same directory, so "global" WAS the project and the skill was editable — the lock only appears once the two are genuinely distinct.

### Never assert a global agent's stack on the project config

**What:** Loading `config.stack` via `loadConfigOrFail(projectDir)` after a default (all-global) init.

**Why:** `config-writer.ts` filters the stack to agents matching that config's scope. A default install's PROJECT config carries the flat skills/agents lists but NO stack for global agents — their stack is written to the GLOBAL config (`HOME/.claude-src/config.ts`).

**Instead:** Read the stack from the global home (`wizard.globalHome`), not `projectDir`. The project config carries only the stack slice for PROJECT-scoped agents. Same finding as above.

### Never use `launchInProject` when a follow-up command resolves its target from cwd

**What:** Porting an `init → … → cc uninstall` flow (or an edit that runs `claude plugin install`) to `launchInProject` + a redirected shared home.

**Why:** `cc uninstall` and `claude plugin install` act on the content root at cwd/HOME. `detectUninstallTarget` takes `projectDir` and calls `resolveInstallPaths(projectDir)` with **no scope argument**, so every path it probes — the skills dir, the agents dir, the `.claude` and `.claude-src` dirs, the plugin listing — is built from `projectDir` alone and it cannot see out-of-cwd global content whatever HOME says. `claude plugin install` writes `enabledPlugins` into HOME's `settings.json` rather than the project's. A default all-global install under `launchInProject` puts the content at `HOME ≠ projectDir`, so the follow-up silently no-ops ("not installed in this project", or plugin enablement in the wrong `settings.json`) and still exits 0 — which is why the failure lands on a downstream assertion rather than on the command.

**Instead:** Model the whole flow as the GLOBAL install with `launchInGlobal` (`HOME === cwd === projectDir`) — every artifact collapses onto `projectDir` and the follow-up finds it. Use `launchInProject` + redirect ONLY when the test merely ASSERTS content; `cc compile` is the one follow-up that IS HOME/scope-aware and can straddle the split.

### Never let two `launchInProject` phases allocate separate global HOMEs

**What:** A multi-phase test (init -> edit, or edit -> edit) that calls `launchInProject()` twice against the same project and expects phase 2 to see phase 1's global-scoped content.

**Why:** `launchInProject` allocates a FRESH global HOME per call, so phase 2's HOME is not phase 1's. Phase 1's compiled agents, ejected global skills, and plugin enablement are invisible to phase 2 — and the failure surfaces as "the wizard doesn't show what I just installed", not as a HOME problem.

**Instead:** allocate one dir in the test and pass it as `globalHome` to every launch. The option is honoured by `launchInProject` only; the wizard then does NOT own cleanup, so the test must clean it up itself. Pass the same dir to any `CLI.run` phase via `project.globalHome` (automatic when the handle came from the wizard) or an explicit `env.HOME`.

### Never use `launchInProjectShort` for a test that locates a skill by name

**What:** Reaching for `EditWizard.launchInProjectShort` because the scenario needs a short terminal, in a test that then calls `focusSkill` / `selectSkill`.

**Why:** That launcher deliberately skips the third settle wait (`BUILD`, the first category label), because at `TERMINAL_SIZE.SHORT` the grid overflows the viewport and "Framework" is overdrawn by later rows, never settling as a stable substring. `focusSkill` parses exactly that category layout to close its loop.

**Instead:** `launchInProjectShort` is for callers that step through the build step blind — pressing Enter to advance domains and toggling the already-focused skill. Anything that reads the grid needs the full `launchInProject` settle sequence.

### Never read selection state off the Sources step at `TERMINAL_SIZE.SHORT`

**What:** Proving a build-step deselection landed by looking for its pending-removal row — or for the absence of the skill's row — in the Sources frame of a session launched at SHORT.

**Why:** the Sources grid clips its trailing rows there and paints **no** `SCROLL_MORE_*` affordance while it does, unlike the confirm step and the info panel; and once every visible row is inert (locked global rows, a pending-removal row) the viewport has no focus to follow, so the clipped row cannot be brought into view by any key. Both directions are therefore uninformative: the row you want is absent from the frame whether it exists or not, and the frame does not admit that anything is missing. This is the failure mode the two loud SHORT rules above do not cover — they hang or throw, this one returns a wrong-looking frame.

**Instead:** prove the change through the surfaces that retain it. Complete the flow, then assert the config drop **and** the filesystem: `completeAndProveReactRemoved` in `e2e/interactive/sources-overflow-pending-removal.e2e.test.ts` is the reference — the deselected skill is gone from `readConfigSkillIds`, the seven untouched skills are pinned with `toStrictEqual`, and its ejected skill directory is gone from disk. That is what lets the spec's remaining RED assertions be read as the clipping defect rather than as a keystroke the wizard swallowed. A spec that asserts on the clipped frame alone cannot tell those two apart.

The clipping itself is open, and that file is where it is pinned. Do not write a second spec that works around it — see [§ Never leave a workaround in a test's JSDoc without a spec that pins the un-worked-around form](#never-leave-a-workaround-in-a-tests-jsdoc-without-a-spec-that-pins-the-un-worked-around-form).

---

## Spec Provenance

### Never pin a scope, ownership or propagation boundary without recording where the boundary came from

**What:** A spec asserting which scope a command may write, which config owns an entry, or how far a change fans out — with a file-level JSDoc that describes the assertions and cites nothing that decided them.

**Why:** a spec written FROM the behaviour is indistinguishable from a spec written from a decision, and the difference only matters on the day someone changes the behaviour. Fixing two ruled scope regressions turned six E2E files and two unit cases red, and **not one of them was testing a defect** — six specs ran `compile` inside a project and then asserted on the global scope's compiled agents, and four asserted that SPACE on a live `[P][G]` pair is inert. Both behaviours had in fact never been ruled on: the first fell out of deriving the compile pass set from which installations exist, the second out of a guard keying on "is there a global install" rather than "does the project own this entry". Because nothing in the specs said so, the red run read as evidence against the fix rather than as a question about it, and rewriting eight specs was the larger half of the change. **A spec in that position is worse than no spec: it makes a regression look intentional and the fix look like the regression.**

**Instead:** one sentence in the file-level JSDoc naming the decision that makes the behaviour correct — a ruling and its date, a finding, or a standards section. Not the task that added the test; the thing that settled the question. Live examples, all three forms: `e2e/commands/compile-project-scope-containment.e2e.test.ts` ("ruled containment… propagation belongs to global operations"), `e2e/lifecycle/project-edit-removes-project-half-of-pair.e2e.test.ts` ("the ruled behaviour… the guard that refuses changes from project"), and `e2e/commands/source-flag-is-init-only.e2e.test.ts` ("nobody else's (owner ruling 2026-08-09)"). A task ID is permitted here and **only** here — file-level JSDoc is the one place the no-task-IDs rule below exempts — but it is not a substitute for naming the decision, because an ID stops meaning anything once the task closes.

The counter-example is in the tree: `e2e/commands/compile-scope-filtering.e2e.test.ts` was rewritten to the ruling (one `compile` invocation per scope, so the same content assertions hold under containment) and its JSDoc still reads as a list of fixes with no decision behind them.

---

## Rules Carried Forward from the Old Bible

These rules come from the monolith this directory was split out of. `e2e-testing-bible.md` is now a pointer into here, so this is where they live:

- **No task IDs anywhere except file-level JSDoc.** Never include `D-NNN` / `P-BUILD-1` / `Bug A` tokens in `describe()` names, `it()` names, assertion messages (2nd arg to `expect`), or inline test-body comments. Test names describe BEHAVIOR ("renders spurious minus on G→P toggle"), assertion messages describe INVARIANTS ("config.ts must not contain version field"). IDs look authoritative but rot once the task closes. See `.ai-docs/agent-findings/2026-04-21-task-ids-in-test-names-sweep-needed.md` (151 occurrences across 30 files — pending sweep).
- **`ensureBinaryExists()` in `beforeAll`.** Every test file must verify the CLI binary exists.
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
