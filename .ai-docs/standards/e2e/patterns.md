---
last_validated: 2026-04-21
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
import { ensureBinaryExists, cleanupTempDir } from "../helpers/test-utils.js";
import "../matchers/setup.js";

describe("compile command", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

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

- `beforeAll(ensureBinaryExists)` verifies the CLI binary exists
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

  // Build -> toggle a specific skill, advance through domains
  await build.selectSkill("react");
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
- Scope indicators in wizard output: `"G "` prefix for global skills, `"P "` for project skills. Agent scope badges: `"[G]"`, `"[P]"`

---

## Navigation Pattern

Always navigate by name, never by index.

```typescript
// Good: navigates to the item by label
await wizard.stack.selectStack("E2E Test Stack");
await agents.toggleAgent("API Developer");
await agents.navigateCursorToAgent("API Developer");
await domain.toggleDomain(STEP_TEXT.DOMAIN_API);

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
it("should handle cancellation gracefully", async () => {
  const wizard = await InitWizard.launch();
  wizard.abort(); // Ctrl+C
  const exitCode = await wizard.waitForExit();
  expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
});

it("should handle Escape from stack step", async () => {
  const wizard = await InitWizard.launch();
  wizard.escape();
  const exitCode = await wizard.waitForExit();
  expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
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
// BUG: CLI exits 0 with corrupt source -- falls back to default
// instead of reporting an error for the invalid --source directory.
it.fails("should error on corrupt source", async () => {
  const { exitCode } = await CLI.run(["init", "--source", "/bad"], project);
  expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
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
