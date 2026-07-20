---
last_validated: 2026-04-21
---

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

| Option            | Type                                  | Default                | Purpose                               |
| ----------------- | ------------------------------------- | ---------------------- | ------------------------------------- |
| `source`          | `{ sourceDir, tempDir }`              | Creates one internally | Pre-created source                    |
| `projectDir`      | `string`                              | Creates temp dir       | Existing project directory            |
| `cols`            | `number`                              | Terminal default       | Terminal width                        |
| `rows`            | `number`                              | Terminal default       | Terminal height                       |
| `env`             | `Record<string, string \| undefined>` | `{}`                   | Extra env vars (merged with defaults) |
| `noSource`        | `boolean`                             | `false`                | Launch without `--source` flag        |
| `skipPermissions` | `boolean`                             | `false`                | Skip creating permissions file        |
| `loadTimeout`     | `number`                              | `TIMEOUTS.WIZARD_LOAD` | Override default wizard load timeout  |

**Launch methods:**

| Method                                   | Returns                                      | Use When                                       |
| ---------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `InitWizard.launch(options?)`            | `InitWizard` (with `stack: StackStep` ready) | Normal wizard tests                            |
| `InitWizard.launchRaw(options?)`         | `InitWizard` (no step wait)                  | Testing resize warnings or pre-step conditions |
| `InitWizard.launchForDashboard(options)` | `DashboardSession`                           | Testing dashboard mode (existing installation) |

**Composite flows:**

| Method                             | Flow                                                                   | Returns        |
| ---------------------------------- | ---------------------------------------------------------------------- | -------------- |
| `completeWithDefaults(stackName?)` | Stack -> Domain -> Build (all domains) -> Sources -> Agents -> Confirm | `WizardResult` |
| `acceptStackDefaults()`            | Stack -> Domain -> Build -> "A" hotkey -> Confirm                      | `WizardResult` |

**Instance methods:** `getOutput()`, `getScreen()`, `getRawOutput()`, `waitForExit(timeout?)`, `abort()`, `escape()`, `destroy()`.

**Cleanup:** `destroy()` tears down both the PTY session and any temp dirs created during launch.

### EditWizard

**File:** `e2e/pages/wizards/edit-wizard.ts`

The edit wizard opens directly to the `BuildStep` (no stack or domain selection).

**Launch options (`EditWizardOptions`):**

| Option       | Type                                  | Required | Purpose                                            |
| ------------ | ------------------------------------- | -------- | -------------------------------------------------- |
| `projectDir` | `string`                              | Yes      | Must have existing installation                    |
| `source`     | `{ sourceDir, tempDir }`              | No       | Source for skill resolution                        |
| `cols`       | `number`                              | No       | Terminal width                                     |
| `rows`       | `number`                              | No       | Terminal height                                    |
| `env`        | `Record<string, string \| undefined>` | No       | Extra env vars                                     |
| `extraArgs`  | `string[]`                            | No       | Extra CLI flags (e.g., `["--agent-source", path]`) |

**Composite flows:**

| Method          | Flow                                                | Returns        |
| --------------- | --------------------------------------------------- | -------------- |
| `passThrough()` | Build (all domains) -> Sources -> Agents -> Confirm | `WizardResult` |

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

| Method                                  | Returns       | Action                                                           |
| --------------------------------------- | ------------- | ---------------------------------------------------------------- |
| `advanceDomain()`                       | `void`        | Advance current domain (Enter)                                   |
| `selectSkill(label)`                    | `void`        | Navigate grid to skill by (row, col), press Space                |
| `toggleFocusedSkill()`                  | `void`        | Press Space on current item                                      |
| `toggleScopeOnFocusedSkill()`           | `void`        | Press "s" on current item                                        |
| `passThroughAllDomains()`               | `SourcesStep` | Web -> API -> Methodology (standard E2E source)                  |
| `passThroughAllDomainsGeneric()`        | `SourcesStep` | Keep pressing Enter until Sources appears (non-standard sources) |
| `passThroughScratchDomains()`           | `SourcesStep` | Web (select skill) -> API (select skill) -> Mobile (advance)     |
| `passThroughWebAndMethodologyDomains()` | `SourcesStep` | Web -> Methodology (when API deselected)                         |
| `advanceToSources()`                    | `SourcesStep` | Advance single domain to Sources                                 |
| `navigateToNextCategory()`              | `void`        | Tab to next category within current domain                       |
| `toggleLabels()`                        | `void`        | Press "d" to toggle compatibility labels                         |
| `toggleFilterIncompatible()`            | `void`        | Press "f" to toggle filter incompatible skills                   |
| `openSearch()`                          | `SearchModal` | Press "/" to open search                                         |
| `goBack()`                              | `void`        | Press Escape                                                     |

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

| Method                        | Returns       | Action                                 |
| ----------------------------- | ------------- | -------------------------------------- |
| `acceptDefaults(wizardType?)` | `ConfirmStep` | Wait for agents step, press Enter      |
| `toggleAgent(name)`           | `void`        | Navigate to agent by name, press Space |
| `navigateCursorToAgent(name)` | `void`        | Navigate cursor to agent (no toggle)   |
| `toggleScopeOnFocusedAgent()` | `void`        | Press "s" on current item              |
| `advance(wizardType?)`        | `ConfirmStep` | Press Enter                            |
| `goBack()`                    | `SourcesStep` | Press Escape, wait for sources step    |

### ConfirmStep

**File:** `e2e/pages/steps/confirm-step.ts`

| Method             | Returns        | Action                             |
| ------------------ | -------------- | ---------------------------------- |
| `waitForReady()`   | `void`         | Wait for confirm step text         |
| `confirm()`        | `WizardResult` | Press Enter, wait for success text |
| `goBack()`         | `void`         | Press Escape                       |
| `goBackToAgents()` | `AgentsStep`   | Press Escape, wait for agents step |

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

| Protected Method                            | Purpose                                      |
| ------------------------------------------- | -------------------------------------------- |
| `pressEnter()`                              | Enter + STEP_TRANSITION delay                |
| `pressSpace()`                              | Space + KEYSTROKE delay                      |
| `pressKey(key)`                             | Write key + KEYSTROKE delay                  |
| `pressEscape()`                             | Escape + KEYSTROKE delay                     |
| `pressArrowDown()`                          | Arrow down + KEYSTROKE delay                 |
| `pressArrowUp()`                            | Arrow up + KEYSTROKE delay                   |
| `pressArrowRight()`                         | Arrow right + KEYSTROKE delay                |
| `pressCtrlC()`                              | Ctrl+C + KEYSTROKE delay                     |
| `waitForStep(text)`                         | Wait for step identification text            |
| `waitForWizardFooter()`                     | Wait for wizard footer ("select") text       |
| `waitForItemVisible(label, maxAttempts?)`   | Scroll down until label is on screen         |
| `navigateCursorToItem(label, maxAttempts?)` | Scroll down until cursor line contains label |
| `delay(ms)`                                 | Internal delay (wraps `test-utils.delay`)    |

**Public methods** available to tests via any step:

| Method            | Purpose                          |
| ----------------- | -------------------------------- |
| `getOutput()`     | Full output including scrollback |
| `getScreen()`     | Visible viewport only            |
| `abort()`         | Ctrl+C                           |
| `navigateDown()`  | Arrow down                       |
| `navigateUp()`    | Arrow up                         |
| `navigateRight()` | Arrow right                      |

---

## TerminalScreen

**File:** `e2e/pages/terminal-screen.ts`

Wraps `TerminalSession` with auto-retrying text matchers. Used internally by steps -- tests do not interact with it directly.

| Method                                   | Purpose                                            |
| ---------------------------------------- | -------------------------------------------------- |
| `waitForText(text, timeoutMs)`           | Poll full output until text appears                |
| `waitForRawText(text, timeoutMs)`        | Poll raw PTY output (bypasses xterm buffer limits) |
| `waitForEither(textA, textB, timeoutMs)` | Poll until either text appears                     |
| `waitForWizardFooter(timeoutMs)`         | Wait for "select" wizard footer text               |
| `getScreen()`                            | Current visible viewport                           |
| `getFullOutput()`                        | All output including scrollback                    |
| `getRawOutput()`                         | Raw PTY output with ANSI stripped                  |

---

## WizardResult

**File:** `e2e/pages/wizard-result.ts`

Returned by `confirm.confirm()`. Represents the outcome of a completed wizard.

| Property/Method | Type              | Purpose                                           |
| --------------- | ----------------- | ------------------------------------------------- |
| `project`       | `ProjectHandle`   | `{ dir: string }` -- use with matchers            |
| `exitCode`      | `Promise<number>` | Waits for process exit, returns code              |
| `output`        | `string`          | Full output (xterm buffer)                        |
| `rawOutput`     | `string`          | Raw PTY output (captures text overwritten by Ink) |
| `destroy()`     | `Promise<void>`   | Clean up session                                  |

**ProjectHandle** is `{ dir: string }` -- the universal type for referring to a project directory. Used by matchers, `CLI.run()`, wizard launch options, and `ProjectBuilder` return values.

---

## DashboardSession

**File:** `e2e/pages/dashboard-session.ts`

For testing dashboard mode (when `init` is run on an existing installation). Not a wizard -- has a simpler API than the wizard/step system.

| Method                         | Purpose                      |
| ------------------------------ | ---------------------------- |
| `waitForText(text, timeoutMs)` | Wait for text to appear      |
| `getOutput()`                  | Full output                  |
| `getScreen()`                  | Visible screen               |
| `escape()`                     | Press Escape                 |
| `ctrlC()`                      | Press Ctrl+C                 |
| `arrowDown()`                  | Navigate down (with delay)   |
| `arrowUp()`                    | Navigate up (with delay)     |
| `waitForExit(timeoutMs?)`      | Wait for process exit        |
| `destroy()`                    | Clean up session + temp dirs |

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
