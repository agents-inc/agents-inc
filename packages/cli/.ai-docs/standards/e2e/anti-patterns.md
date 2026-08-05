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

**Instead:** Use step methods: `wizard.stack.selectFirstStack()`, `build.selectSkill("react")`, `agents.toggleAgent("API Developer")`.

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

> **Worked example replaced 2026-08-01.** This rule previously illustrated itself with the Sources grid's focus padding (`+  React ` with two spaces, so `"+ React"` was not a substring of a focused row). **That was a product defect, and it was fixed in 0.147.0** — `rowStatusMarker` in `src/cli/components/wizard/source-grid.tsx` is now always two columns wide with the marker inside the focus highlight, so focused and unfocused rows render the name in the same column. A standards doc that keeps a live defect as its motivating example teaches every future spec to route around the defect, which is how two releases of Sources-tab specs went by with the padding documented and untested. See `.ai-docs/agent-findings/2026-07-31-focused-row-padding-defect-codified-as-a-test-rule.md`. The buffer-semantics rule below is unaffected and still correct.

**Why:** `BaseStep.getOutput()` -> `TerminalSession.getFullOutput()` reads xterm's **processed buffer** (`xterm.buffer.active`) — the current screen plus whatever genuinely scrolled off. Ink redraws in place, so when a frame fits the viewport (the common case at `TERMINAL_SIZE.TALL`) each repaint OVERWRITES the previous one and nothing enters scrollback. The earlier frame is gone. Verified empirically against the real binary: a `+ web-framework-react` marker present in `getOutput()` before a `navigateDown()` is absent after it, while `getRawOutput()` still holds it.

**Instead:** assert at the moment the frame is on screen (capture before the key press), or use a raw-output surface — `InitWizard.getRawOutput()` / `EditWizard.getRawOutput()` / `WizardResult.rawOutput` / `TerminalScreen.waitForRawText` / `waitForTextAfter`. Raw PTY output is append-only and is the only frame-accumulating surface.

**Corollary — do not manufacture a different render state with a key press.** When a row renders differently focused vs unfocused (padding, chevrons, highlight), assert against the state actually on screen at capture time. If a press is unavoidable, first establish which row holds focus: `SourceGrid` seeds focus with `firstFocusableRowIndex(rows, 0)`, which SKIPS inert (locked / pending-removal) rows, so "the first row" and "the first focusable row" are frequently different — a single `navigateDown()` may move focus ONTO the row under test rather than away from it.

See `.ai-docs/agent-findings/2026-07-29-e2e-getoutput-is-not-a-frame-accumulator.md`.

### Never assert that text is ABSENT from a screen the session once legitimately drew

**What:** `expect(step.getScreen()).not.toContain(STEP_TEXT.BUILD)` to prove a screen was replaced — the natural way to test "the wizard is gone", "the overlay closed", "the step transitioned".

**Why:** `TerminalSession.getScreen()` is **not viewport-only, despite its name and its own doc comment.** It reads absolute buffer lines `0 .. viewportY + rows`, so once the session has any scrollback the range is scrollback **plus** viewport. Any text drawn earlier in the session is still matchable. The assertion tests the emulator's memory, not the process's current output — so it fails against residue whether or not the behaviour under test works, and the failure looks like a product bug.

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

The doc comment on `getScreen()` was left saying the opposite deliberately — every page object depends on the method, so correcting it needs a pass that can audit which specs relied on the wrong description. Until then, [reference/testing/e2e-infrastructure.md § `getScreen()` is not viewport-only](../../reference/testing/e2e-infrastructure.md) is the authority, not the source comment. See `.ai-docs/agent-findings/2026-07-31-getscreen-is-not-viewport-only-so-absence-assertions-are-unsound.md`.

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

See `.ai-docs/agent-findings/2026-07-31-focused-row-padding-defect-codified-as-a-test-rule.md`.

### Never write a colour assertion in an E2E test

**What:** `expect(output).toContain("\x1b[38;2;...")` or any assertion that a marker is green/red, in an `.e2e.test.ts`.

**Why:** The terminal harness runs with `NO_COLOR=1` / `FORCE_COLOR=0` (deliberately, so xterm buffer reads stay clean). Colour is not present in the captured output at all — an E2E spec can only assert the marker, never the colour.

**Instead:** colour is testable ONLY at the component-test layer, and even there it needs a forced chalk level, because Ink colourises through chalk and chalk auto-disables on vitest's non-TTY stdout. A contract phrased as "these two surfaces render the same colour" needs a component test; an E2E marker assertion does not cover it. See [reference/testing/infrastructure.md § Asserting Colour in Ink Component Tests](../../reference/testing/infrastructure.md) and `.ai-docs/agent-findings/2026-07-29-ink-component-colour-assertions-need-forced-chalk-level.md`.

**Never downgrade a failing colour assertion to a text-only one.** A colour assertion that fails because no ANSI was emitted is a harness gap, not a product bug — and silently weakening it is exactly how a colour regression stays invisible.

---

## Index-Based Navigation

### Never use counted arrow presses to reach items

**What:** `for (let i = 0; i < 7; i++) { await step.navigateDown(); }` to reach a specific item.

**Why:** Adding or reordering items breaks these tests silently. The test passes but selects the wrong item.

**Instead:** Navigate by name: `await agents.toggleAgent("API Developer")`, `await wizard.stack.selectStack("E2E Test Stack")`, `await build.focusSkill("web-framework-react")`.

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

`BuildStep.focusSkill` is the reference implementation. See [patterns.md § Closed-Loop Grid Navigation](./patterns.md) and `.ai-docs/agent-findings/2026-07-29-e2e-grid-focus-unobservable-under-no-color-closed-loop-tab-walk.md`.

---

## Hardcoded Strings

### Never use raw UI text in tests

**What:** `await expect(output).toContain("Choose a stack")` or `await expect(output).toContain("initialized successfully")`.

**Why:** When UI text changes, every test that hardcodes the old text breaks. Constants centralize the change to one file.

**Instead:** Use `STEP_TEXT` constants: `expect(output).toContain(STEP_TEXT.STACK)`, `expect(output).toContain(STEP_TEXT.INIT_SUCCESS)`.

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

**Exception:** When creating intentionally corrupt/invalid files for error-path tests, inline construction with an explanatory comment is acceptable.

---

## Fixture Selection

### Never build an `s`-collapse spec on an eject/eject dual-scope pair

**What:** Reaching for `ProjectBuilder.editable({ skills, globalSkills })` — the obvious "installed at both scopes" fixture — for a spec that presses `s` to collapse `[P][G]` to `[G]`.

**Why:** That fixture hardcodes `source: "eject"` for BOTH halves, and `toggleSkillScope` refuses a project->global press in exactly that shape. `wouldOverwriteGlobalEject` fires when the live entry is `scope: "project"` + `source: "eject"`, the snapshot holds an ACTIVE global entry with `source: "eject"`, and the live config carries no tombstone. The press emits a toast and changes nothing — **so the spec fails on a swallowed keystroke rather than on the render it claims to test.** That is a false RED that looks exactly like the bug under test.

**Instead:** give at least the global half a non-eject source (e.g. a marketplace name). Build the config directly rather than through `ProjectBuilder.editable` when the pairing matters, and say why in the file-level JSDoc. **Every `s`-collapse spec needs a proof-of-execution assertion on the scope badges (`["P"]` -> `["G"]`)** so a refused press cannot masquerade as a rendering bug. The unit-level fixture for the same scenario already dodges this by using a marketplace source on both entries.

See `.ai-docs/agent-findings/2026-07-29-dual-scope-collapse-unreachable-for-eject-pairs.md`.

### Never let a fixture rely on a factory default for the state the test's name claims

**What:** A spec named "…previously installed as project" whose live state comes from `toggleTechnology(...)` (which produces a **global**-scoped entry, because `buildSkillConfigForId` defaults to `scope: "global"`) while its snapshot comes from `buildSkillConfigs([...])` (which defaults to `scope: "project"`).

**Why:** The two relevant defaults point OPPOSITE ways — `buildSkillConfig` -> `project`, `createDefaultSkillConfig` / `buildSkillConfigForId` -> `global` — so an unstated scope is a coin flip. The spec above was not testing "project-scoped, previously installed as project" at all; it was testing a project->global migration. Its named assertion still passed, for the wrong reason, and it went unnoticed for two releases.

**Instead:** when a spec's name asserts a scope, source, or mode, the fixture must set it EXPLICITLY. Never inherit it from a factory default.

**Corollary — incidental `toHaveLength` assertions are contracts too.** A row/entry count in a spec whose stated subject is a flag silently pins derivation behaviour the spec never claims to own; the count above pinned id-keyed removal detection for an unlisted shape and broke when the rule was re-keyed per slot. Either assert the count deliberately with a comment saying why that count is the contract, or assert on the specific row (`rows.find(...)`) instead of the collection.

See `.ai-docs/agent-findings/2026-07-29-per-slot-removal-exposes-fixture-name-mismatch-and-confirm-double-row.md`.

---

## Harness Invariants

### All harness process spawners must resolve HOME identically

**What:** One spawner defaulting HOME differently from the others — historically `CLI.run` hardcoded `HOME: project.dir` while `TerminalSession` and `runCLI` had moved to a sibling temp dir.

**Why:** A wizard that installs global content to its sibling HOME, followed by a `CLI.run` that reads with `HOME=projectDir`, disagrees on where "global" lives. The symptom is not an obvious assertion failure — it is `ENOENT scandir <projectDir>/.claude/skills` from a command that looked unrelated.

**Instead:** `TerminalSession`, `runCLI`, and `CLI.run` all default HOME to a temp dir distinct from `cwd`/`projectDir`, and an explicit `env.HOME` always wins and is never auto-removed. `CLI.run` additionally prefers `project.globalHome` over `project.dir`, so a handle produced by `launchInProject` / `launchInGlobal` routes the follow-up command to the same global root the wizard wrote. This is true in code today; it is documented here so it does not regress. Any new spawner must adopt the same precedence.

See `.ai-docs/agent-findings/2026-07-24-d226-phase1-launcher-sugar-and-multiphase-home.md`.

---

## Duplicated Helpers

### Extract shared assertion helpers at 2+ files

**What:** The same assertion function or wizard navigation flow defined identically in two or more test files.

**Why:** Duplicated helpers drift. When one copy is updated, the other silently becomes incorrect.

**Instead:**

- Assertion functions used in 2+ files -> extract to `e2e/assertions/` (e.g., `config-assertions.ts`, `scope-assertions.ts`)
- Common wizard navigation patterns (e.g., "complete edit from build step") -> methods on the wizard page object (e.g., `EditWizard.completeFromBuild()`)
- Setup patterns used in 3+ files -> new `ProjectBuilder` static method
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

- Path helpers (like `skillsPath`, `agentsPath`) -> `test-utils.ts`
- Dual-scope lifecycle helpers -> `dual-scope-helpers.ts`
- Constants (paths, timeouts, text) -> `constants.ts`
- Project creation patterns -> new `ProjectBuilder` method
- Assertion utilities -> `e2e/assertions/` (phase-assertions, scope-assertions, uninstall-assertions)
- Agent matchers -> `e2e/matchers/agent-matchers.ts`
- Expected value constants -> `e2e/fixtures/expected-values.ts`

---

## Parser/Extractor Helpers in Test Files

### Never define parser/extractor helpers with non-trivial logic inside a test file

**What:** A local helper like `getSkillPrefixesByScope(output, skillName)` — a loop, a regex scan (`/([+\-~\u2022])\s+[A-Za-z]/`), a `currentScope` state-machine variable that toggles on label matches, or a first-match-wins rule that plucks diff prefixes out of `lastFrame()` / `getFullOutput()`.

**Why:**

1. **The helper has non-trivial logic and no tests.** A state machine and a regex capturing one of several diff characters would need its own tests to be trusted. An uninstrumented parser silently produces wrong answers when layout changes.
2. **It obscures the rendered contract.** The actual contract is the substring `"+ React"` / `"• React"` in the frame. A parsed-struct indirection hides what the component produces and what the bug shape looks like.
3. **It drops the bug-shape negative check.** `toStrictEqual` on a parsed struct only implicitly negates at the scopes the helper happened to look. Explicit `not.toContain("<bug-prefix> <name>")` is strictly stronger.

**Instead:** Assert directly on `lastFrame()` / `getFullOutput()` with `toContain("<prefix> <name>")` for each expected row plus explicit `not.toContain(...)` for every diff prefix that must NOT appear. When two rows share the same prefix, prove it by exhaustively negating all other prefixes (see [assertions.md § Diff-Shape Assertions](./assertions.md)).

If a helper is genuinely reusable across 2+ test files, move it to `e2e/helpers/` or `src/cli/lib/__tests__/helpers/` WITH its own unit tests — never inline and untested.

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

### Never assert generic absence

**What:** `expect(output).not.toContain("error")`.

**Why:** Matches any text containing "error", including legitimate content like skill IDs or help text.

**Instead:** Assert specific absence: `expect(output).not.toContain("Failed to archive")`.

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

This is the same proof-of-execution rule the bible already applies to conditional code paths, extended to rendering.

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

See `.ai-docs/agent-findings/2026-07-31-negative-render-assertion-needs-a-positive-subject-guard.md`.

### Never call a spec a regression guard until you have watched it go red

**What:** Writing a spec against a defect's reported symptom, seeing it pass after the fix, and shipping it as the guard.

**Why:** Green after a fix is not evidence the spec can detect the bug. Two distinct mechanisms produce a spec that passes for the wrong reason, and neither is visible by reading the spec:

1. **The fixture is smaller than production, so the defect's blast radius is different.** `createE2ESource()` writes **one** stack and **nine** skills; the real marketplace carries a dozen stacks and many more skills. For a size-dependent rendering defect, how far an overpaint reaches scales with list length. The stack-step bleed destroyed the footer against the real marketplace, but against the fixture — three rows in a one-row viewport — the overflow was two rows, destroying the stack row and stopping well short of the footer. **The footer assertion, the one matching the reported symptom and reading as the sharpest signature, passed against the unfixed binary.** The assertion that actually went red was an unrelated-looking positive: `toContain(E2E_STACK_NAME)`.

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

This applies to repairs as much as to new specs: a "fixed" vacuous assertion nobody has watched go red is indistinguishable from the vacuum it replaced.

See `.ai-docs/agent-findings/2026-07-31-e2e-fixture-smaller-than-production-changes-the-bug-signature.md`.

### Never take a "before" snapshot you do not compare against

**What:** `const configBefore = await readTestFile(configTsPath(dir))` followed by wizard work and then assertions that never reference `configBefore`.

**Why:** A "before" snapshot is a promise that an `expect(after)` follows. This is the most dangerous shape in the weak-assertion family because the surviving assertions look thorough.

`scope-toggle-config-snapshot.e2e.test.ts` — _"should compile agent at project scope and preserve global"_ — snapshotted **both** configs under a comment reading `// BEFORE: Snapshot both configs` and compared **neither**. Its two after-assertions were `toContain("web-developer")` on each config, and the fixture writes `web-developer` into both files _before_ the toggle runs. **Both were already true of the pre-state**, so the spec would have passed with the toggle keystroke silently swallowed — a documented failure mode of this harness (see the [page-object key-press rule](./README.md)).

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

Related: check the scope you are actually running at. `scope-toggle-roundtrip.e2e.test.ts` asserted the global config was unchanged and dropped the project one — in a spec whose session runs at PROJECT scope, i.e. it checked the file the edit was least likely to touch and skipped the file it was most likely to touch.

### Never leave an assertion helper imported but uncalled

**What:** `import { expectCleanUninstall } from "../assertions/uninstall-assertions.js"` with no call site in the file.

**Why:** The hand-rolled subset a spec writes instead is always narrower than the shared helper. `plugin-uninstall-edge-cases.e2e.test.ts` imported `expectCleanUninstall` and never invoked it; its _"should also remove config by default"_ spec checked only that the config directory was gone. The word "also" claims the skills and agents went too, and nothing verified that — a leftover skill directory would have survived unnoticed. `expectCleanUninstall` is precisely the helper [§ Never omit negative assertions after removals](#never-omit-negative-assertions-after-removals) tells you to reach for, so the unused import was the fingerprint of an author who knew the rule and got interrupted.

**Instead:** call it, or state in the file JSDoc why the narrower check is deliberate. Applies to `expectCleanUninstall`, `expectFullInstallation`, `expectDualScopeInstallation`, `expectPhaseSuccess` and everything else under `e2e/assertions/`.

### Never delete an unused binding in a test without triaging it first

**What:** Clearing an `@typescript-eslint/no-unused-vars` report in a spec by deleting the binding.

**Why:** In production code a dead variable is usually just dead. **In a test, the binding is very often the thing the author intended to assert on** — so it marks the exact spot where an assertion was planned and never written. A destructured `stdout` / `exitCode` / `lastFrame` that is never asserted on means the test **ran the code and checked nothing about the result**.

The first pass of this rule over `e2e/` produced 15 reports, of which 8 were missing assertions — including three captured-but-unasserted exit codes, one with the missing assertion written out in English in the spec's own comment (`doctor-dual-scope.e2e.test.ts`: "the important thing is doctor runs without crashing on the extra directory", when `cc doctor` exits non-zero on any `fail` check, so "without crashing" had an exact checkable form).

**Instead:** ask what the author meant to do with it. Delete only after establishing that the binding names nothing the spec should have asserted. Where the intended assertion is not obvious, **report it rather than inventing one** — and never weaken an existing assertion to make the report go away. Derive added assertions from something already present: the spec's own name, its own comment, or a sibling spec in the same file.

See `.ai-docs/agent-findings/2026-08-01-e2e-specs-captured-exit-codes-and-config-snapshots-then-asserted-nothing.md` and its `src/`-side sibling `2026-08-01-unused-bindings-in-tests-mark-assertions-that-were-planned-but-never-written.md`.

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

### Never check the wrong scope directory

**What:** `await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer")` when agents compile to `fakeHome`.

**Why:** In dual-scope setups, agents default to global scope. Compiled agents go to `$HOME/.claude/agents/`, not `<project>/.claude/agents/`.

**Instead:** Check the correct directory for each scope. Use `expectDualScopeInstallation` for structured dual-scope checks.

### Never use toHaveAgentDynamicSkills for preloaded skills (or vice versa)

**What:** Checking for a preloaded skill in the body, or a dynamic skill in frontmatter.

**Why:** Preloaded skills appear in YAML frontmatter `skills:` array. Dynamic skills appear in `<skill_activation_protocol>` body section. They're mutually exclusive.

**Instead:** Check `create-e2e-source.ts` — `createMockSkillAssignment(id, true)` = preloaded (use `toHaveAgentFrontmatter`), default = dynamic (use `toHaveAgentDynamicSkills`).

### Never write assertion values without verifying them against production code

**What:** Writing `expect(config.agents).toStrictEqual([{ name: "web-developer", scope: "project" }])` without checking what the code actually produces.

**Why:** This was the #1 source of incorrect assertions (30+ instances). Common mistakes:

- Agents default to `scope: "global"`, not `"project"`
- Config preserves skills in domain iteration order, not alphabetical
- `compactStackAssignments` compacts `{ id, preloaded: false }` to bare string IDs
- `toStrictEqual` treats `excluded: undefined` as different from a missing `excluded` property

**Instead:** Read the production source to understand exact return types. Run the test once to see actual values. Only then write the expected values.

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

## Choosing the Wizard Launcher by Scope

The E2E sandbox defaults `HOME` to a sibling temp dir distinct from `projectDir` (`terminal-session.ts`), so a wizard launched with `launch()` / `launchInProject()` runs at genuine PROJECT scope (`isEditingFromGlobalScope === false`). Because skills and agents default to GLOBAL scope, their installed content lands under that global `HOME` — exposed to tests as `wizard.globalHome`, not `projectDir`. `launchInGlobal()` instead models editing the GLOBAL install (`HOME === cwd === projectDir`), where every artifact collapses back onto `projectDir`. Pick the launcher by what the test does, not by habit.

### Always match the launcher to the scope the test edits

**What:** Reaching for `launchInProject` on every ported test, or leaving `launch()` where the test installs and then asserts global content against `projectDir`.

**Why:** A project-scope edit installs global-default content under `wizard.globalHome`, not `projectDir`. A test that consumes or asserts that content against `projectDir` silently diverges from where the content actually landed.

**Instead:** Fresh init/edit that only ASSERTS installed content → `launchInProject` + redirect `.claude/` content matchers to `{ dir: wizard.globalHome }` (config stays on `projectDir`). Edits that mutate global content, or flows with a cwd-resolving follow-up → `launchInGlobal` (see below). Output-only navigation tests need neither — keep `launch()`.

### Never use `launchInProject` for a test that toggles a global skill's source

**What:** Porting a source-switch test (plugin ↔ eject during `cc edit`) to `launchInProject`.

**Why:** In a project edit, a globally-installed skill is rendered read-only in the Sources step (`source-grid.tsx` — "installed globally, not yours to change here"). The toggle is a silent no-op, the wizard exits `EDIT_UNCHANGED`, and the config never gains the new source — so the test fails downstream, not with an obvious error.

**Instead:** Use `launchInGlobal` (`HOME === cwd === projectDir`) to edit the scope where the skills live and are editable. Every artifact collapses onto `projectDir`, so the assertions need no redirect or split. See `.ai-docs/agent-findings/2026-07-24-d226-phase2-wave1-source-switch-lock-and-global-stack.md`.

### Never assert a global agent's stack on the project config

**What:** Loading `config.stack` via `loadConfigOrFail(projectDir)` after a default (all-global) init.

**Why:** `config-writer.ts` filters the stack to agents matching that config's scope. A default install's PROJECT config carries the flat skills/agents lists but NO stack for global agents — their stack is written to the GLOBAL config (`HOME/.claude-src/config.ts`).

**Instead:** Read the stack from the global home (`wizard.globalHome`), not `projectDir`. The project config carries only the stack slice for PROJECT-scoped agents. Same finding as above.

### Never use `launchInProject` when a follow-up command resolves its target from cwd

**What:** Porting an `init → … → cc uninstall` flow (or an edit that runs `claude plugin install`) to `launchInProject` + a redirected shared home.

**Why:** `cc uninstall` (`detectUninstallTarget`, cwd-only) and `claude plugin install` (writes `enabledPlugins` into HOME's `settings.json`) act on the content root at cwd/HOME. A default all-global install under `launchInProject` puts that content at `HOME ≠ projectDir`, so the follow-up silently no-ops ("not installed in this project", or plugin enablement in the wrong `settings.json`).

**Instead:** Model the whole flow as the GLOBAL install with `launchInGlobal` (`HOME === cwd === projectDir`) — every artifact collapses onto `projectDir` and the follow-up finds it. Use `launchInProject` + redirect ONLY when the test merely ASSERTS content; `cc compile` is the one follow-up that IS HOME/scope-aware and can straddle the split. See `.ai-docs/agent-findings/2026-07-24-d226-phase2-wave2-uninstall-cwd-only-launcher.md`.

### Never let two `launchInProject` phases allocate separate global HOMEs

**What:** A multi-phase test (init -> edit, or edit -> edit) that calls `launchInProject()` twice against the same project and expects phase 2 to see phase 1's global-scoped content.

**Why:** `launchInProject` allocates a FRESH global HOME per call, so phase 2's HOME is not phase 1's. Phase 1's compiled agents, ejected global skills, and plugin enablement are invisible to phase 2 — and the failure surfaces as "the wizard doesn't show what I just installed", not as a HOME problem.

**Instead:** allocate one dir in the test and pass it as `globalHome` to every launch. The option is honoured by `launchInProject` only; the wizard then does NOT own cleanup, so the test must clean it up itself. Pass the same dir to any `CLI.run` phase via `project.globalHome` (automatic when the handle came from the wizard) or an explicit `env.HOME`.

### Never use `launchInProjectShort` for a test that locates a skill by name

**What:** Reaching for `EditWizard.launchInProjectShort` because the scenario needs a short terminal, in a test that then calls `focusSkill` / `selectSkill`.

**Why:** That launcher deliberately skips the third settle wait (`BUILD`, the first category label), because at `TERMINAL_SIZE.SHORT` the grid overflows the viewport and "Framework" is overdrawn by later rows, never settling as a stable substring. `focusSkill` parses exactly that category layout to close its loop.

**Instead:** `launchInProjectShort` is for callers that step through the build step blind — pressing Enter to advance domains and toggling the already-focused skill. Anything that reads the grid needs the full `launchInProject` settle sequence.

---

## Rules Carried Forward from the Old Bible

These rules from the original `e2e-testing-bible.md` remain valid:

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
