---
last_validated: 2026-08-21
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

| Option            | Type                                  | Default                | Purpose                                                                                                 |
| ----------------- | ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `source`          | `E2ESource`                           | Creates one internally | Pre-created source (`{ sourceDir, tempDir }`)                                                           |
| `projectDir`      | `string`                              | Creates temp dir       | Existing project directory                                                                              |
| `cols`            | `number`                              | Terminal default       | Terminal width                                                                                          |
| `rows`            | `number`                              | Terminal default       | Terminal height                                                                                         |
| `env`             | `Record<string, string \| undefined>` | `{}`                   | Extra env vars (merged with defaults)                                                                   |
| `noSource`        | `boolean`                             | `false`                | Launch without the `--marketplace` flag (uses default source / `BUILT_IN_MATRIX`)                       |
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

**Instance members:** `get globalHome`, `getOutput()`, `getScreen()`, `getRawOutput()`, `waitForExit(timeout?)`, `abort()`, `abortAndDestroy(timeout?)`, `destroy()`. There is no `escape()` — it was deleted once its last caller went, and a `wizard.escape()` in an older spec or doc is a reference to a method that no longer exists. `dashboard.escape()` is a different method on a different class and is live.

`abortAndDestroy(timeout?)` is the standard read-only-scenario teardown: Ctrl+C -> `waitForExit(timeout)` -> `destroy()` -> `expectCancelledExit(...)`, returning the exit code. `timeout` passes through verbatim, so omitting it falls back to the session default exactly as a bare `waitForExit()` does. **Prefer it over `abort()` in anything new** — one call covers the abort, the exit wait, the cleanup and the verdict, and a spec that stops at `abort()` has to own all four.

**It ASSERTS, and that is not an implementation detail of the teardown.** The last step is `expectCancelledExit` (`e2e/assertions/phase-assertions.ts`), so every aborted session is held to `EXIT_CODES.CANCELLED` rather than the five call sites of thirty-five that ever captured the return value. Three things about the placement are load-bearing:

- **It runs AFTER `destroy()`.** A throw between the exit wait and the teardown would leak the PTY session and the wizard's temp dirs, so cleanup completes and the verdict lands on the way out.
- **The message names which wizard.** This fires during teardown, and two callers abort from a `finally` or an `afterAll` (`getScopeBadgesForSkill` in `fixtures/dual-scope-helpers.ts` is the live one), where a teardown throw REPLACES the failure the block was already carrying.
- **Do not add a call-site copy.** The funnel throws first, so `expect(exitCode).not.toBe(SUCCESS)` after it is unreachable on the failure path — it reads as coverage and provides none. Three such sites were removed rather than tightened.

**Neither wizard extends the other, so the rule is held by a gate rather than by the copy that put it in both.** `InitWizard` and `EditWizard` share no base class and each `abortAndDestroy` is a byte-identical copy of the other — which is exactly how the assertion came to be missing from both. `src/cli/lib/__tests__/wizard-abort-exit-code.test.ts` DERIVES the roster: a module under `e2e/pages/wizards/` that touches `this.session.` owns a PTY it can end, so `global-home.ts` is absent from it because the scan does not find it rather than because anyone excluded it. A third wizard reddens the first assertion; once rostered, it reddens the second until its teardown reaches `expectCancelledExit`.

`abort()` on both wizards is **`async`** and must be awaited: it writes Ctrl+C and then waits `INTERNAL_DELAYS.KEYSTROKE`, for the reason every keypress wrapper in this framework carries a delay — a bare synchronous write races the handler the frame currently on screen registered. It does NOT call `waitForWizardFooter()` first, and should not: a wizard abort is valid from any screen, including ones that paint no footer, where that wait would hang for the full `TIMEOUTS.WIZARD_LOAD` instead of settling. This is a wizard-level method and is unrelated to `BaseStep.abort()`, which is a step-level method on a `WizardLayout` screen and does take the footer wait — see the `BaseStep` tables below.

**One spec calls `abort()` directly rather than `abortAndDestroy()`, deliberately.** `init-wizard-sources-added-markers.e2e.test.ts` asserts that aborting a Sources-tab preview wrote nothing to `wizard.globalHome`, and `destroy()` deletes that directory — so folding the teardown in would delete the subject before the assertions read it. Its `afterEach` destroys the wizard instead. Any other spec reaching for a bare `abort()` should say why in the same shape, or use `abortAndDestroy()`.

**Cleanup:** `destroy()` tears down the PTY session and every dir in `cleanupDirs` — an internally-created source, an internally-created project dir, and a `launchInProject`-allocated global HOME. A caller-supplied `globalHome` is never in that list.

### EditWizard

**File:** `e2e/pages/wizards/edit-wizard.ts`

The edit wizard opens directly to the `BuildStep` (no stack or domain selection), exposed as `readonly build`.

`edit` carries no `--marketplace` and reads no `CC_MARKETPLACE` — both belong to `init` — so the
`source` option below is RECORDED in the install's config.ts by `recordInstallSource()` before the
session spawns. An install that already names a source (anything a wizard produced) is untouched.

**Launch options (`EditWizardOptions`):**

| Option           | Type                                  | Required | Purpose                                                                                         |
| ---------------- | ------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `projectDir`     | `string`                              | Yes      | Must have existing installation                                                                 |
| `source`         | `E2ESource`                           | No       | The source the INSTALL answers to — recorded in `projectDir`'s config.ts, not passed as a flag  |
| `cols`           | `number`                              | No       | Terminal width                                                                                  |
| `rows`           | `number`                              | No       | Terminal height                                                                                 |
| `env`            | `Record<string, string \| undefined>` | No       | Extra env vars                                                                                  |
| `extraArgs`      | `string[]`                            | No       | Extra CLI flags (e.g., `["--project-setup"]`)                                                   |
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

**Instance members:** `get globalHome`, `getOutput()`, `getRawOutput()`, `waitForExit(timeout?)`, `abort()`, `abortAndDestroy(timeout?)`, `destroy()`. `abort()` and `abortAndDestroy()` are identical to `InitWizard`'s, including `abort()` being `async` and carrying the keystroke delay — see the note under `InitWizard` above. Note there is no `getScreen()` on `EditWizard` (there is on `InitWizard`); reach the current frame through `wizard.build.getScreen()`, which returns scrollback plus viewport rather than the viewport alone.

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

| Method                                        | Returns             | Action                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `advanceDomain()`                             | `void`              | Advance current domain (Enter, cursor-anchored new-frame wait); resets the tracked column hint                                                                                                                                                                                                                                                                                                             |
| `focusSkill(label)`                           | `void`              | Move grid focus to a skill by EXACT rendered label, without toggling. Closed-loop — see below.                                                                                                                                                                                                                                                                                                             |
| `selectSkill(label)`                          | `void`              | `focusSkill`, then a CLOSED-LOOP Space — the target cell's rendered text is read, Space is pressed, and a press the grid never shows landing is re-pressed. It means the toggle LANDED: a refusal is reported, not passed on. See below.                                                                                                                                                                   |
| `toggleFocusedSkill()`                        | `void`              | Press Space on the focused cell, OPEN-LOOP and unclosable — it can name no subject, and for it a landed press need not change anything. See below.                                                                                                                                                                                                                                                         |
| `toggleFocusedSkillAwaiting(sentinel)`        | `void`              | Space, then wait for `sentinel` in RAW output after a pre-press cursor. Use whenever the assertion is on a TOAST.                                                                                                                                                                                                                                                                                          |
| `selectSkillAwaiting(label, sentinel)`        | `void`              | `focusSkill` then `toggleFocusedSkillAwaiting` — navigation happens BEFORE the cursor snapshot                                                                                                                                                                                                                                                                                                             |
| `toggleScopeOnFocusedSkill()`                 | `void`              | Press "s" on the focused cell                                                                                                                                                                                                                                                                                                                                                                              |
| `toggleScopeOnFocusedSkillAwaiting(sentinel)` | `void`              | "s", then wait for `sentinel` in RAW output after a pre-press cursor. The only way to see the global-context scope refusal: a row that has not moved is what BOTH its guards leave behind.                                                                                                                                                                                                                 |
| `passThroughAllDomains()`                     | `SourcesStep`       | Web -> API -> Methodology (standard E2E source)                                                                                                                                                                                                                                                                                                                                                            |
| `passThroughAllDomainsGeneric()`              | `SourcesStep`       | Keep pressing Enter until Sources appears (non-standard sources); throws after 10 presses                                                                                                                                                                                                                                                                                                                  |
| `passThroughScratchDomains()`                 | `SourcesStep`       | Web (focus + select react) -> API (Space) -> Mobile (advance)                                                                                                                                                                                                                                                                                                                                              |
| `passThroughWebAndMethodologyDomains()`       | `SourcesStep`       | Web -> Methodology (when API deselected)                                                                                                                                                                                                                                                                                                                                                                   |
| `advanceToSources()`                          | `SourcesStep`       | Advance single domain to Sources                                                                                                                                                                                                                                                                                                                                                                           |
| `saveFromBuild(wizardType)`                   | `WizardResult`      | Build -> Sources -> Agents -> Confirm -> `confirm()`. **Default path only** — see the carve-out below.                                                                                                                                                                                                                                                                                                     |
| `navigateToNextCategory()`                    | `void`              | Tab to next category within current domain                                                                                                                                                                                                                                                                                                                                                                 |
| `toggleLabels()`                              | `void`              | Press "d" to toggle compatibility labels                                                                                                                                                                                                                                                                                                                                                                   |
| `pressFilterIncompatibleHotkey()`             | `void`              | Press "f", which the build step binds to nothing — for specs that assert the withdrawn hotkey is inert                                                                                                                                                                                                                                                                                                     |
| `toggleInfoPanel()`                           | `void`              | Press "i" — renders a `SkillAgentSummary` overlay                                                                                                                                                                                                                                                                                                                                                          |
| `goBack()`                                    | `void`              | Press Escape                                                                                                                                                                                                                                                                                                                                                                                               |
| `getScopeBadgesForSkill(label)`               | `Array<"P" \| "G">` | Read-only: rendered scope badges for a skill — `[]`, `["P"]`, `["G"]`, `["P","G"]`, or `["G","P"]`                                                                                                                                                                                                                                                                                                         |
| `getExclusiveCategorySelectedCount(name)`     | `number`            | Read-only: the `(N of M)` counter an exclusive category header renders — and ONLY an exclusive one, so it says nothing about the rest of the grid. It is not the only text-observable signal of selected state: the cell's own text is, which is what `selectSkill` confirms against. The two can disagree, because this reads the option `selected` flags and the scope badge reads `skillConfigs.scope`. |

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

The algorithm: parse the current viewport into categories -> read which category is focused NOW -> if it holds the target, press nothing -> otherwise Tab-walk, each press confirmed against the frame before the next, until the focused category contains the target -> walk RIGHT to the target column from a column base the walk STATES: `0` when it arrived by Tab, the tracked `gridCol` when it never moved. The walk ends on observing a category it has already seen — a real lap, every category looked at exactly once — and raises `CategoryWalkError` naming the categories it walked, with the screen dumped.

**Two properties, and both are load-bearing.** Reading before pressing is what makes an already-focused target free: `web-framework` is category 1 of 33 in the default catalogue and is the likeliest target, so an unconditional first press bought a full lap back to where the grid opened. And confirming each press — `advanceCategoryFocus` re-presses until the frame SHOWS a different category focused — is what stops the walk reading the category it just left while standing on the next one, which is how it used to pass its own target unseen. There is no keystroke budget any more; `MAX_FOCUS_ATTEMPTS` was deleted 2026-08-20 (see the finding `2026-08-20-focus-walk-presses-before-it-looks.md`), because a press count reports the number the walk gave up at and says nothing about what it looked at.

**Labels match EXACTLY.** `cellLabel()` strips leading `P`/`G` scope badges and `+ - ✓ ✗ ⏏` diff glyphs, strips the trailing compatibility annotation (`(requires …)`, `(required by …)`, `(incompatible)`, `(discouraged)`), then trims — and the comparison is `===`, not `includes`. So `"React"` never stops the walk on a `"React Query"` cell, nor `"Vite"` on `"Vitest"`. Pass the exact rendered display title.

The one residual open-loop spot is a single-category grid with multiple cells: Tab is a guarded no-op there, so the walk cannot reset the column, and it falls back to a tracked column hint using the grid's real cyclic-wrap arithmetic. Single-category domains in the standard E2E source are all single-cell, so the fallback is effectively unreachable.

**Horizontal navigation skips nothing, and that is what makes the RIGHT half safe.** `CategoryGrid`'s `findValidCol` is a plain cyclic `wrapOptionIndex` over the focused row's own `options` — the same array the row renders — so arrow-RIGHT visits every painted cell, incompatible ones included, and the column index read off the screen is the column index the keystrokes address. The screen parse and the navigation cannot disagree. A navigator written on the opposite assumption drifts from the screen at the first row carrying such a cell.

#### A Toggle Cannot Take the Retry a Monotonic Key Takes (`selectSkill`)

The race is the one `focusSkill`'s Tab walk and `retryEnterUntil` already answer: Ink registers a
component's `useInput` handler in an effect, so a keystroke arriving between the render commit and
the effect flush is discarded with nothing on any surface to say so. The build grid remounts on
every domain change (`CategoryGrid key={activeDomain}`), and `use-category-grid-input.ts` carries a
comment about it ending _"causing the first space press to be silently lost"_.

**What must not be copied from those two loops is their confirmation.** Enter and Tab are
MONOTONIC — "did the next step paint", "did focus move" — so a re-press cannot un-answer them, and
confirming that SOMETHING happened is sound. Space TOGGLES. A re-press of a press that DID land
turns the selection back off, which is a worse defect than the dropped keystroke and is invisible to
every other assertion in the suite: a skill toggled twice leaves exactly the bytes of a skill never
toggled, and every spec reads where the selection ENDED.

Three properties make the Space loop safe, and none of them is optional:

| Property                                                                   | Why                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The confirmation observes the TARGET STATE of a NAMED subject              | One cell's own rendered text, matched on the exact label. "Did the frame change" is satisfiable by anything, and a retry built on it double-toggles.                                                                                                   |
| The target is computed ONCE from the pre-press reading and held            | Re-reading it per attempt turns "reach the flipped state" into "flip once more", which a late-landing press makes unterminating. Held, the loop exits on having OBSERVED the target, so the cell it leaves is the right one.                           |
| From the SECOND press on, the confirmation re-reads after a bounded margin | The first press has nothing in flight behind it and is accepted on the frame it is seen on. Every later press has an earlier one unaccounted for, and a toggle that lands twice comes back — which the re-read catches and answers with another press. |

That last one is the only margin in the design, and it is not a settle delay in disguise: it waits
on the single thing no surface can show, a press already written to the PTY whose effect has not
arrived, and it is paid only on the retry path. Do not generalise it into a delay before or after
every press.

**The signal is the whole rendered cell, not the scope badge.** The badge is the usual mover — a
selected skill always has an active `SkillConfig` whose `scope` is a required field, so it is
painted exactly while something selects the skill — but a dual-scope deselect collapses `[P][G]` to
`[G]` rather than clearing it, and `getCompatibilityLabel` paints `(required by …)` on the way OUT
of a selection. Comparing the cell's text catches all three; a badge-presence test catches one.

**`toggleFocusedSkill()` is open-loop and cannot honestly be made otherwise.** It has no subject to
name: under `NO_COLOR` the focused CELL has no text signal, so the page object cannot read which
skill it is about to toggle. And for it a landed press need not change anything — callers press
Space on a global-locked row precisely to assert it is INERT
(`dual-scope-s-round-trip-space-inert.e2e.test.ts`), so "the cell did not move" is a correct outcome
as often as it is a swallowed keystroke. Use `selectSkill` when the skill has a name and
`toggleFocusedSkillAwaiting` when the outcome is a toast; reach for the bare toggle only when
neither applies, and assert the outcome in the spec.

**`selectSkill` therefore MEANS the toggle landed**, and a press the product refuses — a
global-locked skill at project scope — is reported rather than passed on. That is a behaviour
change with a history: routing four call sites through the confirmation for the first time found
three lifecycle specs that had been pressing Space into a refusal and passing on its silence.
Specs whose subject IS the refusal use `selectSkillAwaiting`.

**The rule is held by a gate, not by review.**
`src/cli/lib/__tests__/page-object-space-presses.test.ts` rosters every Space press in
`e2e/pages/**` with its posture and the reason for it, and separately requires that
`this.session.space()` is written from `BaseStep.pressSpace` and nowhere else. A new step-page-object
method that presses Space fails there until it is given a confirmation or written into the roster
with the reason it cannot have one. Two of the roster's open-loop entries are marked CLOSEABLE and
deliberately left: `AgentsStep.toggleAgent` and `DomainStep.toggleDomain` act on LISTS, which render
`[✓]` checkboxes and therefore do have the text-observable selected state the build grid's cells
lack — `DomainStep.deselectAll` already reads that marker before deciding to press.

### SourcesStep

**File:** `e2e/pages/steps/sources-step.ts`

| Method                      | Returns      | Action                                                              |
| --------------------------- | ------------ | ------------------------------------------------------------------- |
| `waitForReady()`            | `void`       | Wait for sources step to render                                     |
| `acceptDefaults()`          | `AgentsStep` | Wait for ready, press Enter                                         |
| `setAllLocal()`             | `void`       | Press "l" (every skill installs locally)                            |
| `setAllPlugin()`            | `void`       | Press "p" (every skill installs as a plugin)                        |
| `selectFocusedSourceCell()` | `void`       | Press Space — commits the focused cell as that skill's install mode |
| `moveSourceColumnRight()`   | `void`       | Arrow Right — `Local` to `Plugin`, wrapping back from `Plugin`      |
| `goBack()`                  | `BuildStep`  | Press Escape, wait for build step                                   |
| `advance()`                 | `AgentsStep` | Press Enter                                                         |

Each row is one skill carrying a two-state control: `Local` at column 0, `Plugin` at column 1. There
is no settings overlay to open — the `openSettings` / `pressAddSource` / `addSourceUrl` family drove
the marketplace-sources screen, which was withdrawn with the marketplace axis.

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

| Method                                  | Returns        | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `waitForReady()`                        | `void`         | Wait for confirm step text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `confirm()`                             | `WizardResult` | Press Enter, then wait — `INIT_SUCCESS` for init, or EITHER `EDIT_SUCCESS` or `EDIT_UNCHANGED` for edit, both off the xterm buffer within `TIMEOUTS.INSTALL`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `confirmAwaiting(sentinel, timeoutMs)`  | `WizardResult` | Press Enter, then wait for ONE exact `sentinel` in RAW output on the caller's budget. Use when a test must pin one sentinel, read it from raw output, or allow the longer real-`claude plugin install` budget (`TIMEOUTS.PLUGIN_INSTALL`) — rather than widening `confirm()` for every other caller.                                                                                                                                                                                                                                                                     |
| `confirmExpectingExit()`                | `WizardResult` | Press Enter and return without requiring a success banner. For flows expected to hard-error at the install step; callers assert on exit code and output.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `scrollSummaryToBottom(maxAttempts=30)` | `void`         | Run the summary viewport to the end of its scroll range, **closed-loop**: press down while the current frame still reports `STEP_TEXT.SCROLL_MORE_BELOW`, and THROW with a screen dump rather than return short. Not a fixed press count — the summary's height depends on how many skills and agents the run selected. **Required before any assertion about a summary row at `TERMINAL_SIZE.SHORT`**, where the panel's five-row viewport is entirely filled by the `Marketplace` / `Stack` header and the first summary row is six presses down a twelve-press range. |
| `goBack()`                              | `void`         | Press Escape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `goBackToAgents()`                      | `AgentsStep`   | Press Escape, wait for agents step                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

## BaseStep Internals

**File:** `e2e/pages/base-step.ts`

All step classes extend `BaseStep`. Its methods are `protected` -- tests cannot call them. This enforces the layer boundary.

`BaseStep.defaultTimeout` is `TIMEOUTS.WIZARD_LOAD` (45s), used by every wait below that takes an optional timeout.

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
| `waitForWizardFooter(t?)`                     | Wait for the wizard footer sentinel `"select"`, then assert the painted frame is wholly on screen (see below). `WizardLayout` screens ONLY.                                                                                                                                                                                                                             |
| `waitForWizardFooterAfter(cursor, t?)`        | Cursor-anchored footer wait. Required at step transitions: the footer is present in EVERY wizard step, so the non-anchored variant returns instantly on scrollback residue.                                                                                                                                                                                             |
| `getRawCursor()`                              | Raw-output offset snapshot, for pairing with the `*After` waits                                                                                                                                                                                                                                                                                                         |
| `waitForItemVisible(label, maxAttempts=30)`   | Scroll down until label is on screen (VISIBILITY only — does not confirm cursor position)                                                                                                                                                                                                                                                                               |
| `navigateCursorToItem(label, maxAttempts=30)` | Scroll down until the `❯`-marked line contains the label (CURSOR check). Prefer this whenever the next action depends on cursor position.                                                                                                                                                                                                                               |
| `pressEnterAndWaitFor(nextStepText)`          | Footer wait, then closed-loop `retryEnterUntil` — snapshot cursor, press Enter, poll for `nextStepText` after cursor, re-press up to `INTERNAL_RETRIES.MAX_ATTEMPTS` (5). **The sentinel must be unique to the next step's first frame**; text also present in the current footer (e.g. `"select"`) returns instantly on the Enter's own repaint and defeats the retry. |

### `waitForWizardFooter()` also asserts the frame is wholly on screen

After the sentinel settles it calls the private `assertWizardScreenIsWhollyVisible()`, which throws
when `TerminalSession.linesAboveViewport()` is non-empty — one entry per buffer row driven above the
top of the viewport. **Every interactive spec inherits this at every keypress**, because the keypress
rule already routes every press through this one method: it is the only place in the suite that knows
a wizard frame is painted, so the obligation hangs off it rather than off one spec.

Zero is the floor on wizard screens and nowhere else. `WizardLayout` sizes its root box to the
terminal height, and a load that opens a wizard prints nothing on the way there (`init` and `edit`
pass `captureStartupMessages`, and the buffered lines are painted as a band inside the frame) — so a
correct frame fills the viewport with nothing above it. A non-wizard screen is entitled to scroll,
which is one more reason this rule lives on `BaseStep` alone.

**Do not write a per-spec version of this check, and do not weaken it to a baseline comparison.**
Recording the viewport at the first frame and demanding it not GROW is measured to be blind to the
defect worth catching: a layout that overflows by a constant overflows the FIRST frame too, so the
baseline absorbs it. What the check cannot see is a frame that overflowed and has already been
replaced by one that fits — read it while the frame is on screen. Mechanics:
[reference/testing/e2e-infrastructure.md](../../reference/testing/e2e-infrastructure.md).

**Public methods** available to tests via any step:

| Method                               | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getOutput()`                        | xterm's PROCESSED buffer — current screen plus genuine scrollback. **Not a frame log** (Ink repaints overwrite in place).                                                                                                                                                                                                                                                                                                                 |
| `getScreen()`                        | **Scrollback + viewport — NOT viewport-only**, despite the name. It reads absolute buffer lines `0 .. viewportY + rows`. Safe for POSITIVE assertions about current content; never use it for `not.toContain` on text the session once legitimately drew. See [assertions.md § Negative Assertions](./assertions.md).                                                                                                                     |
| `resizeBelowMinimum(cols, rows)`     | Snapshot raw cursor → resize PTY **and** xterm → `waitForTextAfter(STEP_TEXT.RESIZE_PROMPT, cursor)`. Drives the `WizardLayout` mid-session size guard. Use `TERMINAL_SIZE.BELOW_MINIMUM`; never LAUNCH a session at that geometry (the pre-Ink startup gate blocks and the session hangs to timeout).                                                                                                                                    |
| `resizeAboveMinimum(cols, rows)`     | Snapshot raw cursor → resize PTY **and** xterm → `waitForWizardFooterAfter(cursor)`. Anchored on the footer emitted AFTER the resize, not the copy already in scrollback from before the shrink. Selections survive the round trip.                                                                                                                                                                                                       |
| `getSummaryDiffEntries(displayName)` | Parses the rendered `SkillAgentSummary` panel (confirm step or build-step info overlay — same component) into `{ prefix, scope }[]`, where prefix is `+` new / `-` removed / `~` mode-changed / `•` unchanged and scope is `Project` or `Global`. Splits on the `│` column divider and tracks scope PER COLUMN, because Skills and Agents transition to Global at different vertical positions. Pass a display name unique to one column. |
| `abort()`                            | Footer wait, then Ctrl+C                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `navigateDown()`                     | Footer wait, then arrow down                                                                                                                                                                                                                                                                                                                                                                                                              |
| `navigateUp()`                       | Footer wait, then arrow up                                                                                                                                                                                                                                                                                                                                                                                                                |
| `navigateRight()`                    | Footer wait, then arrow right                                                                                                                                                                                                                                                                                                                                                                                                             |

---

## TerminalScreen

**File:** `e2e/pages/terminal-screen.ts`

Wraps `TerminalSession` with auto-retrying text matchers. Used internally by steps -- tests do not interact with it directly.

All `waitFor*` methods delegate to the shared `pollUntil` skeleton (50ms interval, predicate evaluated BEFORE the first delay) and press no keys. Every one takes an explicit `timeoutMs` — there is no built-in default at this layer.

| Method                                        | Surface                       | Purpose                                                                     |
| --------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `waitForText(text, timeoutMs)`                | full output (xterm buffer)    | Poll until text appears anywhere                                            |
| `waitForTextAfter(text, cursor, timeoutMs)`   | raw output sliced at `cursor` | Poll append-only raw output past a `getRawCursor()` snapshot                |
| `waitForRawText(text, timeoutMs)`             | raw PTY output                | Poll raw output (bypasses xterm buffer limits and in-place repaints)        |
| `waitForEither(textA, textB, timeoutMs)`      | full output                   | Poll until either text appears                                              |
| `waitForWizardFooter(timeoutMs)`              | full output                   | Wait for the "select" wizard footer text. `WizardLayout` only.              |
| `waitForWizardFooterAfter(cursor, timeoutMs)` | raw output after `cursor`     | Cursor-anchored footer wait. `WizardLayout` only.                           |
| `getRawCursor()`                              | —                             | Current raw-output length, for pairing with the `*After` waits              |
| `getScreen()`                                 | —                             | **Scrollback + viewport, NOT viewport-only** — see the `BaseStep` row above |
| `getFullOutput()`                             | —                             | Processed buffer: screen + genuine scrollback                               |
| `getRawOutput()`                              | —                             | Raw PTY output with ANSI stripped — the only frame-accumulating surface     |

### An unanchored `waitForText` sentinel must be a string only the awaited screen can paint

`waitForText` reads the whole buffer, so it settles on any frame the session has drawn — including
one drawn by the step BEFORE the one you are waiting for. **`STEP_TEXT` members are step LABELS, not
proofs of step identity**, and several are substrings of another step's body copy. The live one:
`STEP_TEXT.DOMAINS` is `"Select domains"`, and the STACK step paints it too — `SCRATCH_DESCRIPTION`
in `src/cli/components/wizard/stack-selection.tsx` is `"Select domains and skills manually"`, the
body copy of its `SCRATCH_LABEL` row. A wait for `STEP_TEXT.DOMAINS` therefore settles on a frame of
the stack step.

```
grep -rn 'Select domains' src/cli/components src/cli/consts.ts --include='*.tsx' --include='*.ts' | grep -v '\.test\.'
```

Two hits, one of them `stack-selection.tsx`. Run the same grep for any string you are about to make
a sentinel; more than one painting file means it is not one.

**Most waits survive the collision by accident of anchoring, which is why it is worth stating
rather than assuming.** `pressEnterAndWaitFor`, and everything built on it, is cursor-anchored on
append-only raw output, so the earlier step's frame sits before the cursor and cannot match. The
collision bites only a wait with no cursor to anchor to — a launcher waiting for the wizard's FIRST
frame is the whole of that class. `InitWizard.launchOnDomainsInProject` is the live one, and it
carries the note at the wait.

Where no unique string exists, the sentinel is product copy and changing it to suit a test is the
wrong direction: document the collision at the wait and keep the discriminating assertion in the
spec. That is what turned this into a good failure rather than a silent one — the launcher returned
on the stack step's frame and the spec failed one line later on `not.toContain("Choose a stack")`.
A spec that only drove the wizard onward from there would have driven the wrong step.

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
| `getScreen()`                  | **Scrollback + viewport, NOT viewport-only** — see the `BaseStep` row above                                                                                                                                                                    |
| `escape()`                     | `async` — Escape + `INTERNAL_DELAYS.KEYSTROKE`. **Await it.** It does not wait on a sentinel first (the dashboard paints no wizard footer); the delay is what stops a bare synchronous write racing the handler the current frame registered.  |
| `ctrlC()`                      | `async` — Ctrl+C + `INTERNAL_DELAYS.KEYSTROKE`, same reasoning as `escape()`                                                                                                                                                                   |
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
2. Use the `protected` methods from `BaseStep` (`pressKey`, `waitForWizardFooter`, etc.). **Never call `pressKey` / `pressSpace` / `pressEnter` / `pressEscape` / `pressArrowX` / `session.*` without a preceding `await this.waitForWizardFooter()` in the same method** — every keypress needs the wait under parallel suite contention, not just the first one. Post-press waits don't substitute; the race sits upstream of the keystroke. The wait is a one-string match on the footer text `"select"` that only `WizardLayout` paints, so it is valid on `BaseStep` subclasses only — a non-wizard page object (e.g. `DashboardSession`) must wait on its own screen-specific sentinel instead, or it hangs for the full timeout. The rule reads absolutely because its qualified form is what let it drift: while it said "if it's the first interaction after a launch or step transition", seven `BuildStep` methods sat unguarded, two of them holding a wait AFTER the press, where it cannot close a race that has already been lost.
3. If the method transitions to a new step, return the new step object

**The keypress rule above is the PRE-press half. There is a post-press half for one key.** Space
toggles, so a method that presses it owes a statement of how it knows the press landed — a
confirmation against the target state of a named subject, or the reason it can have none. That is
rostered in `src/cli/lib/__tests__/page-object-space-presses.test.ts` and explained in
[§ A Toggle Cannot Take the Retry a Monotonic Key Takes](#a-toggle-cannot-take-the-retry-a-monotonic-key-takes-selectskill).

**Self-check before committing a new step method:** grep the method body for `this.session.` and `this.press*`. Every hit MUST be immediately preceded by `await this.waitForWizardFooter()` in the same method. A `waitForWizardFooter` elsewhere in the method (after the press, in a loop body) does not count — the wait must sit upstream of every PTY write. Helpers that loop over keypresses (arrow-down walks, per-character typing) need the wait inside the loop body before each press, or refactored to walk via a single `waitForItemVisible` + keypress call. Coverage audit: `.ai-docs/reference/testing/e2e-infrastructure.md` § "Page-Object Keypress Rule" tracks the per-method state of every step file.

### Adding a New Wizard Type

1. Create `e2e/pages/wizards/new-wizard.ts`
2. Follow the `InitWizard`/`EditWizard` pattern: spawn session, wait for first step, return wizard object
3. Expose the first step as a public property
4. Add `destroy()` method for cleanup
5. Add `abortAndDestroy()`, ending in `expectCancelledExit(exitCode, <wizard>)` AFTER the `destroy()`

Step 5 is not optional and is not on the honour system. `src/cli/lib/__tests__/wizard-abort-exit-code.test.ts` finds the new class the moment it touches `this.session.` and goes red twice: once because the derived roster no longer matches its named list, and again because nothing in the new file asserts the exit code. Both messages say what to do. The two existing wizards share no base class, so there is nothing for a third to inherit the verdict FROM — which is the whole reason the gate exists rather than a review note.

---

## Related

- [test-structure.md](./test-structure.md) -- How tests use page objects
- [patterns.md](./patterns.md) -- Complete examples for each test type
- [anti-patterns.md](./anti-patterns.md) -- Session leakage rules
