---
last_validated: 2026-07-30
---

# Patterns

Reusable recipes for each test type. Each pattern shows a complete minimal example.

---

## Command Test Pattern

Non-interactive tests: set up a project, run a CLI command, assert on exit code, output, and file system state.

```typescript
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES } from "../pages/constants.js";
import { cleanupTempDir } from "../helpers/test-utils.js";
import "../matchers/setup.js";

describe("compile command", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  it("should compile agents", async () => {
    const project = await ProjectBuilder.minimal();
    tempDir = path.dirname(project.dir);

    const { exitCode, output } = await CLI.run(["compile"], project);

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("Discovered 1 local skills");
    await expect(project).toHaveCompiledAgents();
  });
});
```

Key points:

- No `beforeAll` for the build: `e2e/setup.ts` registers the dist door once, in a `beforeAll`, so it runs before every spec file in the suite. It was `ensureBinaryExists()` called from each file's own `beforeAll` until 2026-08-24 — 248 files of per-file discipline with no checker over it, where forgetting the call bought a 45-second timeout naming nothing and no reader could tell a spec that omitted it correctly from one that forgot. `spec-gates.test.ts` now asserts the ABSENCE of the per-spec call, so the discipline cannot grow back.
- `ProjectBuilder.minimal()` creates the project; `tempDir` captures the parent for cleanup
- `CLI.run()` takes a `ProjectHandle` and returns ANSI-stripped output
- Matchers verify file system state without reading files in the test

---

## Wizard Happy-Path Pattern

Complete a wizard with defaults and verify the outcome. The simplest interactive test.

```typescript
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import "../matchers/setup.js";

it("should complete init with defaults", async () => {
  const wizard = await InitWizard.launch();
  const result = await wizard.completeWithDefaults();

  await expectPhaseSuccess(result, {
    skillIds: ["web-framework-react"],
    agents: ["web-developer", "api-developer"],
    source: "agents-inc",
  });
});
```

Cleanup: `wizard.destroy()` in `afterEach` cleans up both the session and temp dirs.

---

## Wizard Specific-Selection Pattern

Navigate through individual steps to make specific selections.

```typescript
it("should select specific stack and toggle skills", async () => {
  const wizard = await InitWizard.launch({ source });

  // Stack -> select by name
  const domain = await wizard.stack.selectStack("E2E Test Stack");

  // Domain -> accept defaults
  const build = await domain.acceptDefaults();

  // Build -> toggle a specific skill, advance through domains.
  // The label is the EXACT rendered display title, not a substring:
  // "React" would not match a cell whose title is "E2E React".
  await build.selectSkill(E2E_SKILL.react.display);
  await build.advanceDomain(); // Web
  await build.advanceDomain(); // API
  const sources = await build.advanceToSources(); // Shared

  // Sources -> set all to eject mode
  await sources.setAllLocal();
  const agents = await sources.advance();

  // Agents -> toggle a specific agent
  await agents.toggleAgent("API Developer");
  const confirm = await agents.advance("init");

  // Confirm
  const result = await confirm.confirm();
  expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
});
```

Key points:

- Each step method returns the next step object -- TypeScript enforces valid navigation
- Navigate by name (`selectStack("E2E Test Stack")`, `toggleAgent("API Developer")`) not by index
- Steps compose: `build.advanceDomain()` advances one domain, `build.passThroughAllDomains()` advances all three

---

## Lifecycle Pattern

Multi-phase tests where phases share project state. Use a single `it()` block with clearly separated phases.

```typescript
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";

it("full lifecycle: init -> compile -> uninstall", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
  // Phase 1: Init
  const wizard = await InitWizard.launch({
    source: { sourceDir, tempDir: sourceTempDir },
    projectDir,
  });
  const initResult = await wizard.completeWithDefaults();
  await expectPhaseSuccess(initResult, {
    skillIds: ["web-framework-react"],
    agents: ["web-developer"],
    source: "agents-inc",
  });
  await initResult.destroy(); // Clean up session before next phase

  // Phase 2: Compile
  const compileResult = await CLI.run(["compile"], { dir: projectDir });
  expect(compileResult.exitCode).toBe(EXIT_CODES.SUCCESS);

  // Phase 3: Uninstall
  const uninstallResult = await CLI.run(["uninstall", "--yes"], { dir: projectDir });
  expect(uninstallResult.exitCode).toBe(EXIT_CODES.SUCCESS);

  // Phase 4: Verify clean state
  await expectCleanUninstall(projectDir);
});
```

Key points:

- Source is created once in `beforeAll` and shared
- Project directory is created in `beforeAll` (not per-test)
- Each interactive session is destroyed before the next phase starts
- Set per-test timeout via `{ timeout: TIMEOUTS.LIFECYCLE }`
- Use `afterAll` (not `afterEach`) for cleanup

---

## Scope Testing Pattern

Dual-scope tests verify that global and project installations coexist correctly.

**Non-interactive (file assertions):**

```typescript
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

const { project, globalHome } = await ProjectBuilder.dualScope();

const { exitCode } = await CLI.run(["compile"], project, {
  env: { HOME: globalHome.dir },
});

expect(exitCode).toBe(EXIT_CODES.SUCCESS);
await expectDualScopeInstallation(globalHome.dir, project.dir, {
  global: { skillIds: ["web-framework-react"], agents: ["web-developer"] },
  project: { skillIds: ["api-framework-hono"], agents: ["api-developer"] },
});
```

**Interactive (wizard-based, builds scope through interactions):**

```typescript
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

const { tempDir, fakeHome, projectDir } = await createTestEnvironment();

await setupDualScope(sourceDir, sourceTempDir, fakeHome, projectDir);

// Both scopes have correct config and compiled agents
await expectDualScopeInstallation(fakeHome, projectDir, {
  global: { skillIds: ["web-framework-react"], agents: ["web-developer"] },
  project: { skillIds: ["api-framework-hono"], agents: ["api-developer"] },
});
```

Key points:

- Pass `HOME` via env to control where global config lives
- `ProjectBuilder.dualScope()` for pre-built file structures
- `dual-scope-helpers.ts` for state built through wizard interactions
- Scope indicators in wizard output: `"G "` prefix for global skills, `"P "` for project skills. Agent scope badges: `"[G]"`, `"[P]"`. Read them with `build.getScopeBadgesForSkill(label)` / `agents.getScopeBadgesForAgent(label)` rather than scanning the frame.
- **`s` round-trips a `[P][G]` pair** to `[G]` and back, for skills and agents alike. **What spacebar does depends on the path:** on a SKILL row it drops the half the PROJECT owns (the pair collapses to the inherited `[G]`, the global install untouched); on an AGENT row and on any `[G]`-only inherited row it is inert and emits the global-locked toast. Every collapse spec needs a proof-of-execution assertion on the badges (`["P"]` -> `["G"]`) so a refused press cannot masquerade as the rendering bug under test.
- A globally-OWNED skill or agent cannot be deselected from a project in ANY flow, including `init` — an inherited `[G]` row, or the plain active global an in-session collapse leaves behind. A spec that expects a project-scope deselect to uninstall a global entry is asserting removed behaviour; a spec that expects it to drop the PROJECT half of a `[P][G]` pair is asserting current behaviour.
- **A compile inside a project writes nothing outside that project.** A spec that runs `compile` from a project directory and asserts on `$HOME`'s compiled agents, on the global `config-types.ts`, or on another registered project is asserting removed behaviour: compile each scope from a run in that scope.

---

## Scope-Explicit Launch Pattern

Skills and agents default to GLOBAL scope, and the sandbox gives every session a HOME distinct from `projectDir`. So a project install's `.claude/` content does NOT land under `projectDir`. Pick the launcher by what the test does, then point each assertion at the root that actually received the artefact.

```typescript
// PROJECT install: config.ts on projectDir, global-default content on globalHome
const wizard = await InitWizard.launchInProject({ source, projectDir });
const result = await wizard.completeWithDefaults();

await expect(result.project).toHaveConfig({ skillIds: ["web-framework-react"] });
await expect({ dir: wizard.globalHome }).toHaveCompiledAgent("web-developer");
```

```typescript
// GLOBAL install: HOME === cwd === projectDir, so every artefact collapses onto projectDir
const wizard = await EditWizard.launchInGlobal({ projectDir, source });
const result = await wizard.completeFromBuild();

await expect(result.project).toHaveConfig({ skillIds: ["web-framework-react"] });
await expect(result.project).toHaveCompiledAgent("web-developer");
```

Key points:

- `wizard.globalHome` throws on a plain `launch()` / `launchRaw()` — those keep HOME internal on purpose. Output-only navigation tests that assert nothing on disk should keep `launch()`.
- `config.ts` is project-side; installed content is scope-side. Move `.claude/` matchers to `globalHome` only for global-scoped content; project-scoped entries and pre-seeded `projectDir/.claude/skills` stay on `projectDir`.
- `CLI.run(args, result.project)` needs no extra plumbing: the handle carries `globalHome` and `CLI.run` prefers it over `project.dir`.
- Multi-phase flows share one global HOME by allocating it in the test and passing `globalHome` to every `launchInProject`. The test then owns its cleanup.

Full decision rules: [anti-patterns.md § Choosing the Wizard Launcher by Scope](./anti-patterns.md#choosing-the-wizard-launcher-by-scope).

---

## Closed-Loop Grid Navigation Pattern

The canonical pattern for moving focus in the build grid, and the model for any future grid navigator. It is implemented once, in `BuildStep.focusSkill` — tests call `focusSkill` / `selectSkill` and never re-implement it.

```typescript
// Good: name-addressed, closed-loop under the hood
await build.focusSkill(E2E_SKILL.react.display);
await build.toggleScopeOnFocusedSkill();

// Good: focus + toggle in one call
await build.selectSkill(E2E_SKILL.react.display);

// Bad: dead reckoning. The grid PRESERVES and clamps the column across
// arrow-DOWN, so a counted walk lands on — and toggles — the wrong skill.
await build.navigateDown();
await build.navigateRight();
await build.navigateRight();
```

Why it must be closed-loop:

| Signal               | Observable under `NO_COLOR`?          | Consequence                                               |
| -------------------- | ------------------------------------- | --------------------------------------------------------- |
| Focused **cell**     | No — border colour only               | Cell focus can never be verified from the frame           |
| Focused **category** | Yes — header paints one column deeper | Category focus CAN be verified by re-parsing the viewport |

And the two keys behave differently: **Tab** moves to the next category AND resets the column to 0; **arrow-DOWN** moves category but preserves and clamps the column. Only Tab yields a known column, so the walk Tabs between categories, re-reads the screen after every press, and only then walks RIGHT from a verified column zero.

Rules for callers:

- **Pass the EXACT rendered display title.** Matching is `===` after stripping scope badges, diff glyphs, and compatibility annotations — `"React"` will not match a `"React Query"` cell. No fixture title is a skill id: key off `E2E_SKILL_TITLES`, through `E2E_SKILL.<slug>.display`, rather than re-typing strings.
- **Never assert on which cell has focus.** Assert on a consequence instead: `getExclusiveCategorySelectedCount(category)` for in-grid selected state (the only text-observable signal), or `getScopeBadgesForSkill(label)` for scope.
- **Do not use `EditWizard.launchInProjectShort` with `focusSkill`.** That launcher skips the build-category settle wait, so the layout `focusSkill` parses may not have painted.

The RIGHT half of the walk is safe for a reason worth stating: `CategoryGrid`'s `findValidCol` is a plain cyclic wrap over the focused row's own rendered `options`, so arrow-RIGHT skips nothing — not even an incompatible cell — and the column counted off the screen is the column the keystrokes address.

---

## Toast Assertion Pattern

Toasts render in an absolutely-positioned row that Ink rewrites in place, so xterm's processed buffer has already lost the text by the time a test reads it. Use the `*Awaiting` step methods, which snapshot a raw cursor before the press and wait on raw output after it.

```typescript
// Good: the toast is waited for on the surface that retains it
await build.selectSkillAwaiting(E2E_SKILL.react.display, STEP_TEXT.GLOBAL_SKILLS_BLOCKED);

// Also available: toggleFocusedSkillAwaiting,
// AgentsStep.toggleFocusedAgentAwaiting, ConfirmStep.confirmAwaiting

// Bad: the toast may already be overwritten in the processed buffer
await build.selectSkill(E2E_SKILL.react.display);
expect(build.getOutput()).toContain(STEP_TEXT.GLOBAL_SKILLS_BLOCKED);
```

The pre-press cursor anchor is not optional: the footer sentinel is re-emitted on every frame, so a plain footer wait can fire on a repaint that precedes the toast, and an earlier frame's residue would satisfy a non-anchored raw match.

---

## Navigation Pattern

Always navigate by name, never by index.

```typescript
// Good: navigates to the item by label
await wizard.stack.selectStack("E2E Test Stack");
await agents.toggleAgent("API Developer");
await agents.navigateCursorToAgent("API Developer");
await domain.toggleDomain(STEP_TEXT.DOMAIN_API);
await build.focusSkill(E2E_SKILL.react.display);

// Bad: fragile index-based navigation
for (let i = 0; i < 3; i++) {
  await step.navigateDown();
}
```

**Exception:** `InteractivePrompt` (non-wizard prompts) still uses index-based navigation in some cases because the prompts lack unique text labels. Document the assumption with a comment when this is unavoidable:

```typescript
// Navigate to second option -- prompt items have no unique visible text
await prompt.arrowDown();
```

---

## Cancellation and Error Pattern

```typescript
// Preferred: one call covers the abort, the exit wait and the cleanup.
it("should handle cancellation gracefully", async () => {
  const wizard = await InitWizard.launch();
  const exitCode = await wizard.abortAndDestroy();
  expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
});

// Bare abort(), for the case where destroy() would delete the subject under
// assertion — it is `async`, so it is awaited like every other keypress here.
it("should leave the global home untouched when aborted", async () => {
  const wizard = await InitWizard.launchInProject({ projectDir });
  await wizard.abort();
  expect(await wizard.waitForExit()).not.toBe(EXIT_CODES.SUCCESS);
  await expect({ dir: wizard.globalHome }).toHaveNoLocalSkills();
});
```

---

## Resize Warning Pattern

Test terminal size warnings using `launchRaw()`, which does not wait for the stack step.

```typescript
it("should show too-narrow warning", async () => {
  const wizard = await InitWizard.launchRaw({ cols: 40, rows: 24 });

  const output = wizard.getOutput();
  expect(output).toContain(STEP_TEXT.TOO_NARROW);
});
```

---

## Dashboard Pattern

When `init` is run in a directory that already has an installation, it shows the dashboard instead of the wizard.

```typescript
it("should show dashboard for existing installation", async () => {
  // Create an installation first
  await ProjectBuilder.installation(projectDir);

  const dashboard = await InitWizard.launchForDashboard({
    projectDir,
    source,
  });

  await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_LOAD);
  const output = dashboard.getOutput();
  expect(output).toContain(STEP_TEXT.DASHBOARD);

  await dashboard.destroy();
});
```

---

## Plugin Mode Pattern

Plugin mode tests require the Claude CLI binary, which may not be available in all environments. Use `describe.skipIf`.

```typescript
const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("plugin mode", () => {
  it("should install plugins", async () => {
    const project = await ProjectBuilder.pluginProject({
      skills: ["web-framework-react"],
      marketplace: marketplaceName,
    });
    // ...
  });
});
```

---

## `it.fails()` for Known Bugs

When a test documents expected behavior that isn't implemented yet, use `it.fails()`. The test is expected to fail, keeping the suite green while documenting the bug.

```typescript
// BUG: `list` prints skill COUNTS only. A user cannot see which skills are
// installed, which is the question the command exists to answer.
it.fails("should show all skill IDs in output", async () => {
  const { exitCode, stdout } = await CLI.run(["list"], { dir: projectDir });
  expect(exitCode).toBe(EXIT_CODES.SUCCESS);
  expect(stdout).toContain(E2E_SKILL.react.id);
});
```

When the bug is fixed, remove `it.fails()` and the test passes -- no assertion changes needed. Never weaken assertions to accommodate bugs.

---

## Edit Wizard Pattern

The edit wizard opens directly to the build step (no stack or domain selection).

```typescript
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";

it("should edit and preserve agents", async () => {
  const project = await ProjectBuilder.editable({
    skills: ["web-framework-react"],
    agents: ["web-developer"],
    domains: ["web"],
  });

  const wizard = await EditWizard.launch({
    projectDir: project.dir,
    source,
  });
  const result = await wizard.passThrough();

  await expectPhaseSuccess(result, {
    skillIds: ["web-framework-react"],
    agents: ["web-developer"],
    source: "agents-inc",
  });
});
```

---

## Related

- [page-objects.md](./page-objects.md) -- Full page object API
- [test-data.md](./test-data.md) -- Project builder methods
- [assertions.md](./assertions.md) -- Matcher reference
