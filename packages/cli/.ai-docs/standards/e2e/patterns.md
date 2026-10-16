---
last_validated: 2026-10-15
---

# Patterns

Reusable recipes for each test type. Each pattern shows a complete minimal example.

---

## Command Test Pattern

Non-interactive tests: set up a project, run a CLI command, assert on exit code, output, and file system state.

```typescript
import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
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
    expect(output).toContain("Discovered 1 local skill");
    await expect(project).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      contains: ["name: web-developer"],
    });
  });
});
```

Key points:

- No `beforeAll` for the build: `e2e/setup.ts` registers the dist door once, in a `beforeAll`, so it runs before every spec file in the suite. It was `ensureBinaryExists()` called from each file's own `beforeAll` until 2026-08-24 — 248 files of per-file discipline with no checker over it, where forgetting the call bought a 45-second timeout naming nothing and no reader could tell a spec that omitted it correctly from one that forgot. `spec-gates.test.ts` now asserts the ABSENCE of the per-spec call, so the discipline cannot grow back.
- `ProjectBuilder.minimal()` creates the project; `tempDir` captures the parent for cleanup
- `CLI.run()` takes a `ProjectHandle` and returns ANSI-stripped output
- Matchers verify file system state without reading files in the test

---

## Lifecycle Pattern

Multi-phase tests where phases share project state. Use a single `it()` block with clearly separated phases.

```typescript
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import { installE2EStackGlobally } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";

describe("eject mode lifecycle: init -> compile -> uninstall", () => {
  let store: SeedConfigStore;
  let projectDir: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    projectDir = await createTempDir();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    if (projectDir) await cleanupTempDir(projectDir);
  });

  it("init -> compile -> uninstall", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    // Phase 1: Init -- `init --from` a configuration the store holds
    const initResult = await installE2EStackGlobally(store, projectDir);
    await expectPhaseSuccess(
      { project: { dir: projectDir }, exitCode: initResult.exitCode },
      { skillIds: [E2E_SKILL.react.id], agents: E2E_AGENTS.WEB_AND_API, origin: "eject" },
    );
    expect(initResult.output).toContain(STEP_TEXT.INIT_SUCCESS);

    // Phase 2: Compile
    const compileResult = await CLI.run(["compile"], { dir: projectDir });
    expect(compileResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    // Phase 3: Uninstall
    const uninstallResult = await CLI.run(["uninstall", "--yes"], { dir: projectDir });
    expect(uninstallResult.exitCode).toBe(EXIT_CODES.SUCCESS);
    await expectCleanUninstall(projectDir, { removeConfig: true });
  });
});
```

Key points:

- The seed store is created once in `beforeAll` and shared
- Project directory is created in `beforeAll` (not per-test)
- `installE2EStackGlobally(store, projectDir)` is a GLOBAL install (HOME === cwd === `projectDir`), so every phase reads where the last one wrote. HOME rules: [anti-patterns.md § Harness Invariants](./anti-patterns.md#harness-invariants)
- Each interactive session is destroyed before the next phase starts
- Set per-test timeout via `{ timeout: TIMEOUTS.LIFECYCLE }`
- Use `afterAll` (not `afterEach`) for cleanup

`e2e/lifecycle/local-lifecycle.e2e.test.ts` is the full spec.

---

## Scope Testing Pattern

Dual-scope tests verify that global and project installations coexist correctly.

**Pre-built (file assertions):**

```typescript
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

const { project, globalHome } = await ProjectBuilder.dualScope();
const env = { HOME: globalHome.dir };

expect((await CLI.run(["compile"], globalHome, { env })).exitCode).toBe(EXIT_CODES.SUCCESS);
expect((await CLI.run(["compile"], project, { env })).exitCode).toBe(EXIT_CODES.SUCCESS);

await expectDualScopeInstallation(globalHome.dir, project.dir, {
  global: { skillIds: ["web-testing-cypress-e2e"], agents: ["web-developer"] },
  project: { skillIds: ["web-mocks-msw"], agents: ["api-developer"] },
});
```

**Built through the CLI (one real `init --from` run):**

```typescript
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { installDualScopeStack } from "../fixtures/e2e-stack-seed.js";

const { tempDir, fakeHome, projectDir } = await installDualScopeStack(store, E2E_SOURCE.sourceDir);

// Both scopes have correct config and compiled agents
await expectDualScopeInstallation(fakeHome, projectDir, {
  global: {
    skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
    agents: [...E2E_AGENTS.WEB],
  },
  project: { skillIds: [E2E_SKILL.hono.id], agents: [...E2E_AGENTS.API] },
});
```

Key points:

- Pass `HOME` via env to control where global config lives
- `ProjectBuilder.dualScope()` for pre-built file structures
- `installDualScopeStack` / `createDualScopeEnvFromSeed` (`e2e/fixtures/e2e-stack-seed.ts`) for state built through real `init --from` runs
- `config.ts` is project-side; installed content is scope-side. `e2eStackPayload` rests skills and sub-agents at GLOBAL scope unless told otherwise, so a project install's global content lands under HOME, not `projectDir`: point each `.claude/` matcher at the root that actually received the artefact, and leave project-scoped entries and anything the spec pre-seeded under `projectDir/.claude/skills` on `projectDir`
- `CLI.run(args, project)` needs no extra plumbing when the handle carries `globalHome`: `CLI.run` prefers it over `project.dir`
- A globally-OWNED skill or sub-agent cannot be removed from a project in ANY flow. A spec that expects a project-scope run to uninstall a global entry is asserting removed behaviour; a spec that expects it to drop the PROJECT half of a `[P][G]` pair is asserting current behaviour.
- **A compile inside a project writes nothing outside that project.** A spec that runs `compile` from a project directory and asserts on `$HOME`'s compiled agents, on the global `config-types.ts`, or on another registered project is asserting removed behaviour: compile each scope from a run in that scope.

---

## Navigation Pattern

Always navigate by name, never by index alone. Rules: [anti-patterns.md § Index-Based Navigation](./anti-patterns.md#index-based-navigation).

```typescript
// Good: Enter only once the named row has focus -- a reordered menu fails on the wait
await dashboard.chooseOneKeyAtATime(2, STEP_TEXT.DASHBOARD_DOCTOR_FOCUSED);

// Bad: dead reckoning -- adding or reordering a row silently moves the target
for (let i = 0; i < 2; i++) {
  await dashboard.arrowDown();
}
```

Where the `InteractivePrompt` exception applies, the comment at the press names the assumption:

```typescript
// Navigate to second option -- prompt items have no unique visible text
await prompt.arrowDown();
```

---

## Cancellation and Error Pattern

```typescript
// `edit --from` at a terminal asks before it writes; declining writes nothing.
const before = await readTreeSnapshot(env.tempDir);
prompt = new InteractivePrompt(["edit", "--from", id], env.projectDir, {
  env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
});
await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
expect(prompt.getOutput()).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);

await prompt.deny();
expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
expect(await readTreeSnapshot(env.tempDir)).toStrictEqual(before);
```

---

## Resize Warning Pattern

Every command but `uninstall` holds at the startup size gate (`BaseCommand.ensureTerminalSize`) until the terminal clears `MIN_TERMINAL_SIZE`. Launch one row under it with an `InteractivePrompt`, and bound the exit wait: a run held at the gate never exits.

```typescript
prompt = new InteractivePrompt(["uninstall", "--yes"], home, {
  rows: TERMINAL_SIZE.SHORT.rows - 1,
  cols: TERMINAL_SIZE.SHORT.cols,
  env: { HOME: home },
});
const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT).catch(() => undefined);
expect(prompt.getRawOutput()).not.toContain(STEP_TEXT.RESIZE_PROMPT);
expect(exitCode).toBe(EXIT_CODES.SUCCESS);
```

`e2e/interactive/uninstall-below-the-minimum-terminal-size.e2e.test.ts` is the live spec. `TERMINAL_SIZE.SHORT` must sit on the gate: [README.md § Constants Quick-Reference](./README.md#constants-quick-reference).

---

## Dashboard Pattern

When `init` is run in a directory that already has an installation, it shows the dashboard.

```typescript
it("should show dashboard for existing installation", async () => {
  await ProjectBuilder.installation(projectDir);

  dashboard = await DashboardSession.launch({ projectDir });

  await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
  expect(dashboard.getOutput()).toContain(STEP_TEXT.DASHBOARD);
});
```

`dashboard.destroy()` runs in `afterEach`; `e2e/interactive/init-dashboard.e2e.test.ts` is the live spec.

---

## Plugin Mode Pattern

Plugin mode tests that run a real install require the Claude CLI binary, which may not be available in all environments. Use `describe.skipIf`. A test that needs only the installed state needs no gate: [test-data.md § Where Test Data Lives](./test-data.md#where-test-data-lives).

```typescript
const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("plugin mode", () => {
  it("should install plugins", async () => {
    const project = await ProjectBuilder.pluginProject({
      skills: [E2E_SKILL.react.id],
      marketplaceName: fixture.marketplaceName,
      marketplace: fixture.sourceDir,
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

## Edit Pattern

`edit --from <id>` at a terminal lists its plan and asks before writing; `applyFromSeed` publishes the payload, approves the plan and fails the spec unless the edit exits as expected.

```typescript
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import {
  applyFromSeed,
  e2eStackPayload,
  installE2EStackGlobally,
} from "../fixtures/e2e-stack-seed.js";

it("should edit and preserve agents", async () => {
  await installE2EStackGlobally(store, projectDir);

  const result = await applyFromSeed(
    store,
    "PlusSpare1",
    e2eStackPayload({
      plus: { [E2E_SKILL["visual-regression"].id]: [E2E_AGENT["web-developer"].name] },
    }),
    { dir: projectDir, home: projectDir },
  );

  await expectPhaseSuccess(
    { project: { dir: projectDir }, exitCode: result.exitCode },
    { skillIds: [E2E_SKILL.react.id], agents: ["web-developer"], origin: "eject" },
  );
});
```

---

## Related

- [page-objects.md](./page-objects.md) -- Full page object API
- [test-data.md](./test-data.md) -- Project builder methods
- [assertions.md](./assertions.md) -- Matcher reference
