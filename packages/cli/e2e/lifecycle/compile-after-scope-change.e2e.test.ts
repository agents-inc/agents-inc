import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, DIRS, STEP_TEXT } from "../pages/constants.js";
import { cleanupTempDir, readTestFile, runCLI } from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { installDualScopeStack } from "../fixtures/e2e-stack-seed.js";

/** Lifecycle E2E test: `cc compile` over an installation split across both scopes. */

describe("compile over a dual-scope installation", () => {
  let store: SeedConfigStore;
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    ({
      tempDir: testTempDir,
      fakeHome,
      projectDir,
    } = await installDualScopeStack(store, E2E_SOURCE.sourceDir));
  }, TIMEOUTS.LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(testTempDir);
  });

  it(
    "compile from the project produces scope-correct agents",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { exitCode: compileExitCode, combined } = await runCLI(
        ["compile", "--verbose"],
        projectDir,
        { env: { HOME: fakeHome } },
      );

      expect(compileExitCode).toBe(EXIT_CODES.SUCCESS);
      expect(combined).toContain(STEP_TEXT.COMPILE_SUCCESS);

      // Each scope holds ITS OWN agent, named in parsed frontmatter — a `startsWith("---")`
      // is true of every compiled agent and cannot tell one scope's file from the other's.
      await expect({ dir: fakeHome }).toHaveAgentFrontmatter("web-developer", {
        name: "web-developer",
      });
      await expect({ dir: projectDir }).toHaveAgentFrontmatter("api-developer", {
        name: "api-developer",
      });

      const projectApiDevPath = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
      const projectApiDevContent = await readTestFile(projectApiDevPath);
      expect(projectApiDevContent).toContain(E2E_SKILL.hono.id);
      // Relevance-scoped assignment keeps the web skill off the api agent.
      expect(projectApiDevContent).not.toContain(E2E_SKILL.react.id);
    },
  );

  it("compile is idempotent", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    // Phase C: First compile
    const { exitCode: firstExitCode } = await runCLI(["compile"], projectDir, {
      env: { HOME: fakeHome },
    });
    expect(firstExitCode).toBe(EXIT_CODES.SUCCESS);

    // Read agent files after first compile
    const globalWebDevPath = path.join(fakeHome, DIRS.CLAUDE, DIRS.AGENTS, "web-developer.md");
    const projectApiDevPath = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
    const firstGlobalWebDev = await readTestFile(globalWebDevPath);
    const firstProjectApiDev = await readTestFile(projectApiDevPath);

    // Phase D: Second compile
    const { exitCode: secondExitCode } = await runCLI(["compile"], projectDir, {
      env: { HOME: fakeHome },
    });
    expect(secondExitCode).toBe(EXIT_CODES.SUCCESS);

    // Read agent files after second compile
    const secondGlobalWebDev = await readTestFile(globalWebDevPath);
    const secondProjectApiDev = await readTestFile(projectApiDevPath);

    // Agent file contents are identical between first and second compile
    expect(secondGlobalWebDev).toBe(firstGlobalWebDev);
    expect(secondProjectApiDev).toBe(firstProjectApiDev);
  });
});
