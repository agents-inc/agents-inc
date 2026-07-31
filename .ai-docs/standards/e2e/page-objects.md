---
last_validated: 2026-07-30
---

<!-- re-validated 2026-07-30 (product v0.146.0, test-harness pass): added the scope-explicit launchers (launchInProject / launchInGlobal / launchInProjectShort), the globalHome asserting getter, the globalHome? reuse option and abortAndDestroy to both wizard sections — the tables predated the D-226 HOME split entirely; rewrote the BuildStep table (11 methods were missing) and added a Closed-Loop Grid Navigation section documenting focusSkill's Tab-walk, the NO_COLOR cell-focus constraint and exact-label matching; added AgentsStep.toggleFocusedAgentAwaiting / getScopeBadgesForAgent, ConfirmStep.confirmAwaiting / confirmExpectingExit, DashboardSession.selectEdit, and the BaseStep cursor-anchored waits (waitForStepAfter, waitForWizardFooterAfter, getRawCursor, pressEnterAndWaitFor, getSummaryDiffEntries); added TerminalScreen's *After methods; recorded ProjectHandle.globalHome -->

# Page Objects

The Page Object Model (POM) framework -- how it works, how to use it, and how to extend it.

---

## Layer Architecture

The framework has 5 layers. Each layer may only call the layer directly below it. Tests (the top layer) must never reach down to the Session layer.

| Layer       | Responsibility                                                | Files                             |
| ----------- | ------------------------------------------------------------- | --------------------------------- |
| **Test**    | Launch, interact, assert. No terminal mechanics.              | `e2e/**/*.e2e.test.ts`            |
| **Wizard**  | Spawn session, return first step. Composite flows.            | `e2e/pages/wizards/*.ts`          |
| **Step**    | Model user actions on a single wizard step. Return next step. | `e2e/pages/steps/*.ts`            |
| **Screen**  | Auto-retrying text search. Stable render detection.           | `e2e/pages/terminal-screen.ts`    |
| **Session** | Raw PTY. Keystroke injection. Buffer management.              | `e2e/helpers/terminal-session.ts` |

**Enforcement:** Tests import from `e2e/pages/wizards/` and `e2e/fixtures/`, never from `e2e/helpers/terminal-session.ts`. Step classes use `protected` for all `TerminalSession`-touching methods, preventing tests from calling them even if they had a reference.

---

## Wizards

Entry points that spawn a `TerminalSession` and return the first step object.

### InitWizard

**File:** `e2e/pages/wizards/init-wizard.ts`

**Launch options (`InitWizardOptions`):**

| Option            | Type                                  | Default                | Purpose                                                                                                 |
| ----------------- | ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `source`          | `E2ESource`                           | Creates one internally | Pre-created source (`{ sourceDir, tempDir }`)                                                           |
| `projectDir`      | `string`                              | Creates temp dir       | Existing project directory                                                                              |
| `cols`            | `number`                              | Terminal default       | Terminal width                                                                                          |
| `rows`            | `number`                              | Terminal default       | Terminal height                                                                                         |
| `env`             | `Record<string, string \| undefined>` | `{}`                   | Extra env vars (merged with defaults)                                                                   |
| `noSource`        | `boolean`                             | `false`                | Launch without `--source` flag (uses default source / `BUILT_IN_MATRIX`)                                |
| `skipPermissions` | `boolean`                             | `false`                | Skip creating permissions file                                                                          |
| `loadTimeout`     | `number`                              | `TIMEOUTS.WIZARD_LOAD` | Override the initial `StackStep.waitForReady` timeout                                                   |
| `defaultTimeout`  | `number`                              | Session CI-aware       | Override the underlying `TerminalSession` default timeout                                               |
| `globalHome`      | `string`                              | Fresh dir allocated    | **`launchInProject` only.** Reuse an existing global HOME instead of allocating one. See "Scope" below. |

**Launch methods:**

| Method                                   | Returns                                      | Use When                                                                                         |
| ---------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `InitWizard.launch(options?)`            | `InitWizard` (with `stack: StackStep` ready) | Output-only navigation tests. Escape hatch — HOME is internal and `wizard.globalHome` throws.    |
| `InitWizard.launchInProject(options?)`   | `InitWizard`                                 | PROJECT install: HOME is a fresh dir distinct from `projectDir`, exposed as `wizard.globalHome`. |
| `InitWizard.launchInGlobal(options?)`    | `InitWizard`                                 | GLOBAL install: `HOME === cwd === projectDir`; `wizard.globalHome` equals `projectDir`.          |
| `InitWizard.launchRaw(options?)`         | `InitWizard` (no step wait)                  | Testing resize warnings or pre-step conditions. Escape hatch like `launch()`.                    |
| `InitWizard.launchForDashboard(options)` | `DashboardSession`                           | Testing dashboard mode (existing installation). Options: `{ projectDir, source?, env? }`.        |

**Scope.** The sandbox never lets HOME collapse onto the project dir by accident, and skills/agents default to GLOBAL scope — so a project install's `.claude/` content lands under the global HOME while `config.ts` stays under `projectDir`. `wizard.globalHome` is an **asserting getter**: it throws on a plain `launch()`/`launchRaw()` wizard, because those use an internal auto-allocated HOME that is deliberately unexposed. Pick the launcher by what the test does — see [anti-patterns.md § Choosing the Wizard Launcher by Scope](./anti-patterns.md#choosing-the-wizard-launcher-by-scope).

For a multi-phase test where a later wizard must see an earlier phase's global content, allocate one dir and pass it as `globalHome` to every `launchInProject` call. The wizard then does NOT own its cleanup — the allocator (the test) does.

**Composite flows:**

| Method                             | Flow                                                                     | Returns        |
| ---------------------------------- | ------------------------------------------------------------------------ | -------------- |
| `completeWithDefaults(stackName?)` | Stack -> Domain -> Build (all domains) -> Sources -> Agents -> Confirm   | `WizardResult` |
| `acceptStackDefaults()`            | Stack -> Domain -> Build -> "a" hotkey -> Confirm (unknown domain count) | `WizardResult` |

**Instance members:** `get globalHome`, `getOutput()`, `getScreen()`, `getRawOutput()`, `waitForExit(timeout?)`, `abort()`, `abortAndDestroy(timeout?)`, `escape()`, `destroy()`.

`abortAndDestroy(timeout?)` is the standard read-only-scenario teardown: Ctrl+C -> `waitForExit(timeout)` -> `destroy()`, returning the exit code. `timeout` passes through verbatim, so omitting it falls back to the session default exactly as a bare `waitForExit()` does.

**Cleanup:** `destroy()` tears down the PTY session and every dir in `cleanupDirs` — an internally-created source, an internally-created project dir, and a `launchInProject`-allocated global HOME. A caller-supplied `globalHome` is never in that list.

### EditWizard

**File:** `e2e/pages/wizards/edit-wizard.ts`

The edit wizard opens directly to the `BuildStep` (no stack or domain selection), exposed as `readonly build`.

**Launch options (`EditWizardOptions`):**

| Option           | Type                                  | Required | Purpose                                                                                         |
| ---------------- | ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `projectDir`     | `string`                              | Yes      | Must have existing installation                                                                 |
| `source`         | `E2ESource`                           | No       | Source for skill resolution                                                                     |
| `cols`           | `number`                              | No       | Terminal width                                                                                  |
| `rows`           | `number`                              | No       | Terminal height                                                                                 |
| `env`            | `Record<string, string \| undefined>` | No       | Extra env vars                                                                                  |
| `extraArgs`      | `string[]`                            | No       | Extra CLI flags (e.g., `["--refresh"]`)                                                         |
| `defaultTimeout` | `number`                              | No       | Override the underlying `TerminalSession` default timeout                                       |
| `globalHome`     | `string`                              | No       | **`launchInProject` / `launchInProjectShort` only.** Reuse an existing global HOME (see below). |

**Launch methods:**

| Method                                     | Returns      | Use When                                                                                                                                                 |
| ------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EditWizard.launch(options)`               | `EditWizard` | Output-only navigation. Escape hatch — HOME is internal and `wizard.globalHome` throws.                                                                  |
| `EditWizard.launchInProject(options)`      | `EditWizard` | PROJECT edit: HOME is a fresh dir distinct from `projectDir`, exposed as `wizard.globalHome`; `destroy()` removes it.                                    |
| `EditWizard.launchInProjectShort(options)` | `EditWizard` | `launchInProject` at `TERMINAL_SIZE.SHORT`. See the settle-wait carve-out below.                                                                         |
| `EditWizard.launchInGlobal(options)`       | `EditWizard` | GLOBAL edit: `HOME === cwd === projectDir`; `wizard.globalHome` equals `projectDir`. Allocates no dir, so `destroy()` leaves `projectDir` to the caller. |

**Launch settle sequence.** `launch` waits on three sentinels before returning, all at `TIMEOUTS.WIZARD_TRANSITION`: `BUILD_FOOTER` ("Labels", the build-step-only footer hint on the first build frame) -> `waitForWizardFooter` (absorbs subsequent redraws) -> `BUILD` ("Framework", the first category label, ensuring build content has fully painted before callers read scrollback). Without the third wait, mid-redraw frames pollute `getFullOutput()` with category labels that later rows overwrite.

`launchInProjectShort` skips the third wait: at a very short terminal height the grid overflows the viewport and "Framework" is overdrawn by later rows, so it never settles as a stable substring. **It is ONLY valid for callers that step through the build step blind** — blind Enter advances and toggles of the already-focused skill. Never use it for a caller that locates a skill by name: `focusSkill` parses the category layout this variant deliberately does not wait for.

**Composite flows:**

| Method                | Flow                                                                  | Returns        |
| --------------------- | --------------------------------------------------------------------- | -------------- |
| `passThrough()`       | Build (all domains) -> Sources -> Agents -> Confirm, with no mutation | `WizardResult` |
| `completeFromBuild()` | Single-domain path via `build.saveFromBuild("edit")`                  | `WizardResult` |

**Instance members:** `get globalHome`, `getOutput()`, `getRawOutput()`, `waitForExit(timeout?)`, `abort()`, `abortAndDestroy(timeout?)`, `destroy()`. Note there is no `getScreen()` on `EditWizard` (there is on `InitWizard`); reach the viewport through `wizard.build.getScreen()`.

---

## Steps

Each step class models the user actions available on one wizard screen. Methods return the next step object, so TypeScript enforces valid navigation paths -- `buildStep.confirm()` is a compile error.

### StackStep

**File:** `e2e/pages/steps/stack-step.ts`

| Method               | Returns      | Action                                        |
| -------------------- | ------------ | --------------------------------------------- |
| `waitForReady()`     | `void`       | Wait for stack step to render                 |
| `selectFirstStack()` | `DomainStep` | Press Enter on default selection              |
| `selectStack(name)`  | `DomainStep` | Navigate to stack by name, press Enter        |
| `selectScratch()`    | `DomainStep` | Navigate to "Start from scratch", press Enter |
| `cancel()`           | `void`       | Press Escape                                  |

### DomainStep

**File:** `e2e/pages/steps/domain-step.ts`

| Method               | Returns     | Action                                      |
| -------------------- | ----------- | ------------------------------------------- |
| `acceptDefaults()`   | `BuildStep` | Press Enter with default selections         |
| `toggleDomain(name)` | `void`      | Navigate to domain by name, press Space     |
| `advance()`          | `BuildStep` | Press Enter to advance                      |
| `deselectAll()`      | `void`      | Walk the list, uncheck all selected domains |
| `goBack()`           | `StackStep` | Press Escape, wait for stack step           |

### BuildStep

**File:** `e2e/pages/steps/build-step.ts`

| Method                                       | Returns             | Action                                                                                                                                                      |
| -------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `advanceDomain()`                            | `void`              | Advance current domain (Enter, cursor-anchored new-frame wait); resets the tracked column hint                                                              |
| `focusSkill(label)`                          | `void`              | Move grid focus to a skill by EXACT rendered label, without toggling. Closed-loop — see below.                                                              |
| `selectSkill(label)`                         | `void`              | `focusSkill` then Space                                                                                                                                     |
| `toggleFocusedSkill()`                       | `void`              | Press Space on the focused cell                                                                                                                             |
| `toggleFocusedSkillAwaiting(sentinel)`       | `void`              | Space, then wait for `sentinel` in RAW output after a pre-press cursor. Use whenever the assertion is on a TOAST.                                           |
| `selectSkillAwaiting(label, sentinel)`       | `void`              | `focusSkill` then `toggleFocusedSkillAwaiting` — navigation happens BEFORE the cursor snapshot                                                              |
| `toggleScopeOnFocusedSkill()`                | `void`              | Press "s" on the focused cell                                                                                                                               |
| `passThroughAllDomains()`                    | `SourcesStep`       | Web -> API -> Methodology (standard E2E source)                                                                                                             |
| `passThroughAllDomainsGeneric()`             | `SourcesStep`       | Keep pressing Enter until Sources appears (non-standard sources); throws after 10 presses                                                                   |
| `passThroughScratchDomains()`                | `SourcesStep`       | Web (focus + select react) -> API (Space) -> Mobile (advance)                                                                                               |
| `passThroughWebAndMethodologyDomains()`      | `SourcesStep`       | Web -> Methodology (when API deselected)                                                                                                                    |
| `advanceToSources()`                         | `SourcesStep`       | Advance single domain to Sources                                                                                                                            |
| `saveFromBuild(wizardType)`                  | `WizardResult`      | Build -> Sources -> Agents -> Confirm -> `confirm()`. **Default path only** — see the carve-out below.                                                      |
| `navigateToNextCategory()`                   | `void`              | Tab to next category within current domain                                                                                                                  |
| `toggleLabels()`                             | `void`              | Press "d" to toggle compatibility labels                                                                                                                    |
| `toggleFilterIncompatible()`                 | `void`              | Press "f" to toggle filter-incompatible (gated by `FEATURE_FLAGS.FILTER_INCOMPATIBLE`)                                                                      |
| `toggleFilterIncompatibleAwaiting(sentinel)` | `void`              | Press "f", then wait for `sentinel` in RAW output after a pre-press cursor (toast assertions)                                                               |
| `toggleInfoPanel()`                          | `void`              | Press "i" — gated by `FEATURE_FLAGS.INFO_PANEL`; renders a `SkillAgentSummary` overlay                                                                      |
| `openSearch()`                               | `SearchModal`       | Press "/" to open search                                                                                                                                    |
| `goBack()`                                   | `void`              | Press Escape                                                                                                                                                |
| `getScopeBadgesForSkill(label)`              | `Array<"P" \| "G">` | Read-only: rendered scope badges for a skill — `[]`, `["P"]`, `["G"]`, `["P","G"]`, or `["G","P"]`                                                          |
| `getExclusiveCategorySelectedCount(name)`    | `number`            | Read-only: the `(N of M)` counter an exclusive category header renders. Under `NO_COLOR` this is the ONLY text-observable signal of in-grid selected state. |

**`saveFromBuild` carve-out.** It is valid ONLY where the sources step is passed through WITHOUT mutation and the agents step is accepted with defaults. Sites that call `setAllLocal` / `setAllPlugin` / `moveSourceColumnRight` / `selectFocusedSourceCell` on the sources step, or navigate/toggle scope on the agents step, or that stop at the confirm screen instead of confirming, MUST keep the explicit step-by-step sequence — this method would silently skip their mutation.

**Toast assertions use the `*Awaiting` variants.** Toasts render in an absolutely-positioned row that Ink rewrites in place, so xterm's processed buffer (`getOutput()` / `getScreen()`) has already lost the text by the time a test reads it. Raw output is append-only, so the toast survives there. The pre-press cursor anchor is required for two reasons: the footer sentinel is re-emitted on every frame (so a plain footer wait can fire on a repaint that precedes the toast), and an earlier frame's residue would satisfy a non-anchored raw match.

#### Closed-Loop Grid Navigation (`focusSkill`)

The canonical closed-loop navigation pattern in this framework. **Do not copy the old dead-reckoning shape into any new grid navigator.**

What went wrong before: `focusSkill` counted rows and assumed arrow-DOWN resets the grid column. The real grid PRESERVES and clamps it (`use-focused-list-item.ts`: `finalCol = min(currentCol, newColCount - 1)`), so a second `focusSkill` in the same domain started its RIGHT presses from a wrong column and, with cyclic wrap, toggled the WRONG skill — silently, since the test still passed.

Two observability facts constrain any fix:

| Fact                                                                                                                                                                          | Consequence                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| The focused **cell** has no text signal under `NO_COLOR` — `SkillTag` distinguishes it only via `borderColor` / `borderDimColor`, which the harness strips.                   | Cell-level focus can never be verified from the frame. No design may depend on it. |
| The focused **category header** IS observable — it paints as one background-highlighted text with one extra leading space, so it sits exactly one column deeper.              | Category focus can be closed-loop verified by re-parsing the viewport.             |
| **Tab** moves to the next category AND resets the column to 0 (`use-category-grid-input.ts` does `setFocused(nextSection, 0)`). **DOWN** moves category but keeps the column. | Only Tab yields a known column, so the walk is built on Tab.                       |

The algorithm: parse the current viewport into categories -> Tab-walk, re-reading the rendered screen after every press, until the focused category contains the target -> walk RIGHT from the screen-verified `(row, 0)` to the target column. Bounded by `MAX_FOCUS_ATTEMPTS = 30`; Tab wraps, so one cycle visits every category, and a swallowed keystroke self-corrects because a press that produced no fresh frame within `INTERNAL_RETRIES.INTERVAL_MS` is simply followed by another re-read. Exhaustion throws with the screen dumped.

**Labels match EXACTLY.** `cellLabel()` strips leading `P`/`G` scope badges and `+ - ✓ ✗ ⏏` diff glyphs, strips the trailing compatibility annotation (`(requires …)`, `(required by …)`, `(incompatible)`, `(recommended)`, `(discouraged)`), then trims — and the comparison is `===`, not `includes`. So `"React"` never stops the walk on a `"React Query"` cell, nor `"Vite"` on `"Vitest"`. Pass the exact rendered display title.

The one residual open-loop spot is a single-category grid with multiple cells: Tab is a guarded no-op there, so the walk cannot reset the column, and it falls back to a tracked column hint using the grid's real cyclic-wrap arithmetic. Single-category domains in the standard E2E source are all single-cell, so the fallback is effectively unreachable.

See `.ai-docs/agent-findings/2026-07-29-e2e-grid-focus-unobservable-under-no-color-closed-loop-tab-walk.md`.

### SourcesStep

**File:** `e2e/pages/steps/sources-step.ts`

| Method                      | Returns      | Action                                                          |
| --------------------------- | ------------ | --------------------------------------------------------------- |
| `waitForReady()`            | `void`       | Wait for sources step to render                                 |
| `acceptDefaults()`          | `AgentsStep` | Wait for ready, press Enter                                     |
| `setAllLocal()`             | `void`       | Press "l" (sets all to eject mode)                              |
| `setAllPlugin()`            | `void`       | Press "p"                                                       |
| `selectFocusedSourceCell()` | `void`       | Press Space — commits the focused column as that skill's source |
| `moveSourceColumnRight()`   | `void`       | Arrow Right — move the grid cursor one source column right      |
| `openSettings()`            | `void`       | Press "s"                                                       |
| `closeSettings()`           | `void`       | Press Escape                                                    |
| `pressAddSource()`          | `void`       | Press "a" (within settings)                                     |
| `pressDeleteSource()`       | `void`       | Press backspace (within settings)                               |
| `goBack()`                  | `BuildStep`  | Press Escape, wait for build step                               |
| `advance()`                 | `AgentsStep` | Press Enter                                                     |

### AgentsStep

**File:** `e2e/pages/steps/agents-step.ts`

| Method                                 | Returns             | Action                                                                                                                                                  |
| -------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acceptDefaults(wizardType?)`          | `ConfirmStep`       | Wait for agents step, press Enter (`wizardType` defaults to `"init"`)                                                                                   |
| `toggleAgent(name)`                    | `void`              | Navigate cursor to agent by name, press Space                                                                                                           |
| `navigateCursorToAgent(name)`          | `void`              | Navigate cursor to agent (no toggle)                                                                                                                    |
| `toggleFocusedAgentAwaiting(sentinel)` | `void`              | Space, then wait for `sentinel` in RAW output after a pre-press cursor. Toast-asserting counterpart of `toggleAgent`.                                   |
| `toggleScopeOnFocusedAgent()`          | `void`              | Press "s" on current item                                                                                                                               |
| `getScopeBadgesForAgent(label)`        | `Array<"P" \| "G">` | Read-only: the bracketed `[P]` / `[G]` badges between checkbox and label. Checkbox tokens (`[✓]`, `[ ]`) never match. Throws if the agent is not found. |
| `advance(wizardType?)`                 | `ConfirmStep`       | Press Enter                                                                                                                                             |
| `goBack()`                             | `SourcesStep`       | Press Escape, wait for sources step                                                                                                                     |

### ConfirmStep

**File:** `e2e/pages/steps/confirm-step.ts`

Constructed with a `WizardType` (`"init" | "edit"`), which decides which success sentinel `confirm()` waits for.

| Method                                 | Returns        | Action                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waitForReady()`                       | `void`         | Wait for confirm step text                                                                                                                                                                                                                                                                           |
| `confirm()`                            | `WizardResult` | Press Enter, then wait — `INIT_SUCCESS` for init, or EITHER `EDIT_SUCCESS` or `EDIT_UNCHANGED` for edit, both off the xterm buffer within `TIMEOUTS.INSTALL`                                                                                                                                         |
| `confirmAwaiting(sentinel, timeoutMs)` | `WizardResult` | Press Enter, then wait for ONE exact `sentinel` in RAW output on the caller's budget. Use when a test must pin one sentinel, read it from raw output, or allow the longer real-`claude plugin install` budget (`TIMEOUTS.PLUGIN_INSTALL`) — rather than widening `confirm()` for every other caller. |
| `confirmExpectingExit()`               | `WizardResult` | Press Enter and return without requiring a success banner. For flows expected to hard-error at the install step; callers assert on exit code and output.                                                                                                                                             |
| `goBack()`                             | `void`         | Press Escape                                                                                                                                                                                                                                                                                         |
| `goBackToAgents()`                     | `AgentsStep`   | Press Escape, wait for agents step                                                                                                                                                                                                                                                                   |

### SearchModal

**File:** `e2e/pages/steps/search-modal.ts`

An overlay opened from `BuildStep`. Known to be buggy -- tests for search should use `it.fails()`.

| Method                | Returns  | Action                        |
| --------------------- | -------- | ----------------------------- |
| `type(query)`         | `void`   | Type characters one at a time |
| `selectResult(label)` | `void`   | Scroll to result, press Enter |
| `close()`             | `void`   | Press Escape                  |
| `getResults()`        | `string` | Get current screen content    |

---

## BaseStep Internals

**File:** `e2e/pages/base-step.ts`

All step classes extend `BaseStep`. Its methods are `protected` -- tests cannot call them. This enforces the layer boundary.

`BaseStep.defaultTimeout` is `TIMEOUTS.WIZARD_LOAD` (45s since 0.145.0), used by every wait below that takes an optional timeout.

| Protected Method                              | Purpose                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pressEnter()`                                | Enter + STEP_TRANSITION delay (500ms)                                                                                                                                                                                                                                                                                                                                   |
| `pressSpace()`                                | Space + KEYSTROKE delay (150ms)                                                                                                                                                                                                                                                                                                                                         |
| `pressKey(key)`                               | Write key + KEYSTROKE delay                                                                                                                                                                                                                                                                                                                                             |
| `pressEscape()`                               | Escape + KEYSTROKE delay                                                                                                                                                                                                                                                                                                                                                |
| `pressArrowDown()`                            | Arrow down + KEYSTROKE delay                                                                                                                                                                                                                                                                                                                                            |
| `pressArrowUp()`                              | Arrow up + KEYSTROKE delay                                                                                                                                                                                                                                                                                                                                              |
| `pressArrowRight()`                           | Arrow right + KEYSTROKE delay                                                                                                                                                                                                                                                                                                                                           |
| `pressCtrlC()`                                | Ctrl+C + KEYSTROKE delay                                                                                                                                                                                                                                                                                                                                                |
| `waitForStep(text, t?)`                       | Wait for step identification text anywhere in full output                                                                                                                                                                                                                                                                                                               |
| `waitForStepAfter(text, cursor, t?)`          | Cursor-anchored variant — waits for `text` in RAW output after `cursor`. Use when a prior step left identical scrollback text (e.g. the "API" / "Methodology" tab labels every build-step frame renders).                                                                                                                                                               |
| `waitForWizardFooter(t?)`                     | Wait for the wizard footer sentinel `"select"`. `WizardLayout` screens ONLY.                                                                                                                                                                                                                                                                                            |
| `waitForWizardFooterAfter(cursor, t?)`        | Cursor-anchored footer wait. Required at step transitions: the footer is present in EVERY wizard step, so the non-anchored variant returns instantly on scrollback residue.                                                                                                                                                                                             |
| `getRawCursor()`                              | Raw-output offset snapshot, for pairing with the `*After` waits                                                                                                                                                                                                                                                                                                         |
| `waitForItemVisible(label, maxAttempts=30)`   | Scroll down until label is on screen (VISIBILITY only — does not confirm cursor position)                                                                                                                                                                                                                                                                               |
| `navigateCursorToItem(label, maxAttempts=30)` | Scroll down until the `❯`-marked line contains the label (CURSOR check). Prefer this whenever the next action depends on cursor position.                                                                                                                                                                                                                               |
| `pressEnterAndWaitFor(nextStepText)`          | Footer wait, then closed-loop `retryEnterUntil` — snapshot cursor, press Enter, poll for `nextStepText` after cursor, re-press up to `INTERNAL_RETRIES.MAX_ATTEMPTS` (5). **The sentinel must be unique to the next step's first frame**; text also present in the current footer (e.g. `"select"`) returns instantly on the Enter's own repaint and defeats the retry. |
| `delay(ms)`                                   | Internal delay (wraps `test-utils.delay`)                                                                                                                                                                                                                                                                                                                               |

**Public methods** available to tests via any step:

| Method                               | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getOutput()`                        | xterm's PROCESSED buffer — current screen plus genuine scrollback. **Not a frame log** (Ink repaints overwrite in place).                                                                                                                                                                                                                                                                                                                   |
| `getScreen()`                        | Visible viewport only                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `getSummaryDiffEntries(displayName)` | Parses the rendered `SkillAgentSummary` panel (confirm step or build-step info overlay — same component) into `{ prefix, scope }[]`, where prefix is `+` new / `-` removed / `~` source-changed / `•` unchanged and scope is `Project` or `Global`. Splits on the `│` column divider and tracks scope PER COLUMN, because Skills and Agents transition to Global at different vertical positions. Pass a display name unique to one column. |
| `abort()`                            | Footer wait, then Ctrl+C                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `navigateDown()`                     | Footer wait, then arrow down                                                                                                                                                                                                                                                                                                                                                                                                                |
| `navigateUp()`                       | Footer wait, then arrow up                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `navigateRight()`                    | Footer wait, then arrow right                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## TerminalScreen

**File:** `e2e/pages/terminal-screen.ts`

Wraps `TerminalSession` with auto-retrying text matchers. Used internally by steps -- tests do not interact with it directly.

All `waitFor*` methods delegate to the shared `pollUntil` skeleton (50ms interval, predicate evaluated BEFORE the first delay) and press no keys. Every one takes an explicit `timeoutMs` — there is no built-in default at this layer.

| Method                                        | Surface                       | Purpose                                                                 |
| --------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| `waitForText(text, timeoutMs)`                | full output (xterm buffer)    | Poll until text appears anywhere                                        |
| `waitForTextAfter(text, cursor, timeoutMs)`   | raw output sliced at `cursor` | Poll append-only raw output past a `getRawCursor()` snapshot            |
| `waitForRawText(text, timeoutMs)`             | raw PTY output                | Poll raw output (bypasses xterm buffer limits and in-place repaints)    |
| `waitForEither(textA, textB, timeoutMs)`      | full output                   | Poll until either text appears                                          |
| `waitForWizardFooter(timeoutMs)`              | full output                   | Wait for the "select" wizard footer text. `WizardLayout` only.          |
| `waitForWizardFooterAfter(cursor, timeoutMs)` | raw output after `cursor`     | Cursor-anchored footer wait. `WizardLayout` only.                       |
| `getRawCursor()`                              | —                             | Current raw-output length, for pairing with the `*After` waits          |
| `getScreen()`                                 | —                             | Current visible viewport                                                |
| `getFullOutput()`                             | —                             | Processed buffer: screen + genuine scrollback                           |
| `getRawOutput()`                              | —                             | Raw PTY output with ANSI stripped — the only frame-accumulating surface |

---

## WizardResult

**File:** `e2e/pages/wizard-result.ts`

Returned by `confirm.confirm()`. Represents the outcome of a completed wizard.

| Property/Method | Type              | Purpose                                                     |
| --------------- | ----------------- | ----------------------------------------------------------- |
| `project`       | `ProjectHandle`   | `{ dir, globalHome? }` -- use with matchers                 |
| `exitCode`      | `Promise<number>` | Waits for process exit (`TIMEOUTS.EXIT_WAIT`), returns code |
| `output`        | `string`          | Full output (xterm buffer)                                  |
| `rawOutput`     | `string`          | Raw PTY output (captures text overwritten by Ink)           |
| `destroy()`     | `Promise<void>`   | Clean up session                                            |

**ProjectHandle** is `{ dir: string; globalHome?: string }` -- the universal type for referring to a project directory. Used by matchers, `CLI.run()`, wizard launch options, and `ProjectBuilder` return values.

`WizardResult` stamps `project.globalHome` from `session.globalHome`, so `CLI.run(args, result.project)` targets the same global root the wizard wrote. It is `undefined` for a plain `launch()`, in which case `CLI.run` falls back to `project.dir`. HOME precedence in `CLI.run` is `options.env.HOME` > `project.globalHome` > `project.dir`.

---

## DashboardSession

**File:** `e2e/pages/dashboard-session.ts`

For testing dashboard mode (when `init` is run on an existing installation). Not a wizard -- has a simpler API than the wizard/step system.

Exposes `readonly projectDir`. **The dashboard paints no wizard footer**, so its key methods gate on their own sentinels and MUST NOT call `waitForWizardFooter` — that sentinel never appears here and the wait burns the full `TIMEOUTS.WIZARD_LOAD` (45s) instead of settling. Applying the guard to the dashboard once cost 72 failures across 35 files.

| Method                         | Purpose                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `waitForText(text, timeoutMs)` | Wait for text to appear                                                                                                                                                                                                                        |
| `getOutput()`                  | Full output                                                                                                                                                                                                                                    |
| `getScreen()`                  | Visible screen                                                                                                                                                                                                                                 |
| `escape()`                     | Press Escape (synchronous)                                                                                                                                                                                                                     |
| `ctrlC()`                      | Press Ctrl+C (synchronous)                                                                                                                                                                                                                     |
| `arrowDown()`                  | Navigate down (with `INTERNAL_DELAYS.KEYSTROKE`)                                                                                                                                                                                               |
| `arrowUp()`                    | Navigate up (with `INTERNAL_DELAYS.KEYSTROKE`)                                                                                                                                                                                                 |
| `selectEdit()`                 | Enter on the default-focused "Edit" option via the shared closed-loop `retryEnterUntil` (waits `BUILD_FOOTER` after cursor, then the footer, then `BUILD` after cursor); launches the edit wizard in the SAME PTY and returns its `BuildStep`. |
| `waitForExit(timeoutMs?)`      | Wait for process exit                                                                                                                                                                                                                          |
| `destroy()`                    | Clean up session + temp dirs                                                                                                                                                                                                                   |

---

## InteractivePrompt

**File:** `e2e/fixtures/interactive-prompt.ts`

For testing non-wizard interactive prompts (uninstall confirmation, update confirmation, build stack selector, search UI). Wraps `TerminalSession` + `TerminalScreen` so test files never import `TerminalSession`.

This is an architectural boundary -- it uses index-based navigation methods (`arrowDown`, `arrowUp`) because non-wizard prompts don't have the step/cursor model. Document assumptions when using index-based navigation.

| Method                                         | Purpose                      |
| ---------------------------------------------- | ---------------------------- |
| `waitForText(text, timeout?)`                  | Wait for text in full output |
| `waitForRawText(text, timeout?)`               | Wait for text in raw output  |
| `confirm()`                                    | Type "y" + Enter             |
| `deny()`                                       | Type "n" + Enter             |
| `pressEnter()`                                 | Enter with delay             |
| `arrowDown()`, `arrowUp()`                     | Navigation with delay        |
| `pressKey(key)`                                | Write key with delay         |
| `ctrlC()`, `escape()`                          | Control keys with delay      |
| `waitForExit(timeout?)`                        | Wait for process exit        |
| `getOutput()`, `getScreen()`, `getRawOutput()` | Read output                  |
| `destroy()`                                    | Clean up session             |

---

## How to Extend

### Adding a New Step

1. Create `e2e/pages/steps/new-step.ts` extending `BaseStep`
2. Add a `waitForReady()` method that waits for the step's identifying text
3. Add action methods that return the next step object
4. Update the preceding step's advance method to return the new step
5. Add the new step to the import chain in the wizard

### Adding a New Wizard Method

1. Add the method to the step class (e.g., `BuildStep.toggleLabel()`)
2. Use the `protected` methods from `BaseStep` (`pressKey`, `waitForWizardFooter`, etc.). **Never call `pressKey` / `pressSpace` / `pressEnter` / `pressEscape` / `pressArrowX` / `session.*` without a preceding `await this.waitForWizardFooter()` in the same method** — every keypress needs the wait under parallel suite contention, not just the first one. Post-press waits don't substitute; the race sits upstream of the keystroke. The wait is a one-string match on the footer text `"select"` that only `WizardLayout` paints, so it is valid on `BaseStep` subclasses only — a non-wizard page object (e.g. `DashboardSession`) must wait on its own screen-specific sentinel instead, or it hangs for the full timeout. See `.ai-docs/agent-findings/2026-04-21-e2e-build-step-keypress-missing-stable-render.md` and `.ai-docs/agent-findings/2026-07-20-waitforstablerender-is-a-wizard-footer-sentinel-not-a-generic-primitive.md`.
3. If the method transitions to a new step, return the new step object

**Self-check before committing a new step method:** grep the method body for `this.session.` and `this.press*`. Every hit MUST be immediately preceded by `await this.waitForWizardFooter()` in the same method. A `waitForWizardFooter` elsewhere in the method (after the press, in a loop body) does not count — the wait must sit upstream of every PTY write. Helpers that loop over keypresses (arrow-down walks, per-character typing) need the wait inside the loop body before each press, or refactored to walk via a single `waitForItemVisible` + keypress call. Coverage audit: `.ai-docs/reference/testing/e2e-infrastructure.md` § "Page-Object Keypress Rule" tracks the per-method state of every step file.

### Adding a New Wizard Type

1. Create `e2e/pages/wizards/new-wizard.ts`
2. Follow the `InitWizard`/`EditWizard` pattern: spawn session, wait for first step, return wizard object
3. Expose the first step as a public property
4. Add `destroy()` method for cleanup

---

## Related

- [test-structure.md](./test-structure.md) -- How tests use page objects
- [patterns.md](./patterns.md) -- Complete examples for each test type
- [anti-patterns.md](./anti-patterns.md) -- Session leakage rules
