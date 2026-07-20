import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, DIRS, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { cleanupTempDir, ensureBinaryExists, readTestFile, runCLI } from "../helpers/test-utils.js";
import { createTestEnvironment, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";

/**
 * Lifecycle E2E test: compile command after scope changes from edit wizard.
 *
 * Verifies that `cc compile` produces scope-correct agent output after
 * skills have been toggled between global and project scope via `cc edit`.
 */

describe("compile after scope change", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let testWizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
    await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);
  });

  afterEach(async () => {
    await testWizard?.destroy();
    testWizard = undefined;
    await cleanupTempDir(testTempDir);
  });

  it(
    "compile after G->P skill scope toggle produces scope-correct agents",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Phase C: Edit -- toggle web-framework-react from global to project scope
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain: toggle first focused skill (web-framework-react) scope to project
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- API domain (pass through)
      await wizard.build.advanceDomain();

      // Build step -- Shared domain, sources, agents and confirm (all pass through)
      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
      testWizard = undefined;

      // Phase D: Run cc compile --verbose
      const { exitCode: compileExitCode, combined } = await runCLI(
        ["compile", "--verbose"],
        projectDir,
        { env: { HOME: fakeHome } },
      );

      // D-1: Compile exits successfully
      expect(compileExitCode).toBe(EXIT_CODES.SUCCESS);

      // D-2: Output mentions compilation
      expect(combined).toContain(STEP_TEXT.COMPILE_SUCCESS);

      // D-3: web-developer.md at global scope starts with YAML frontmatter
      const globalWebDevPath = path.join(fakeHome, DIRS.CLAUDE, DIRS.AGENTS, "web-developer.md");
      const globalWebDevContent = await readTestFile(globalWebDevPath);
      expect(globalWebDevContent.startsWith("---")).toBe(true);

      // D-4: api-developer.md at project scope starts with YAML frontmatter
      const projectApiDevPath = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
      const projectApiDevContent = await readTestFile(projectApiDevPath);
      expect(projectApiDevContent.startsWith("---")).toBe(true);

      // D-5: Project api-developer.md contains api-framework-hono
      expect(projectApiDevContent).toContain("api-framework-hono");

      // D-6: Project api-developer.md contains web-framework-react (all skills go to all agents)
      expect(projectApiDevContent).toContain("web-framework-react");
    },
  );

  it(
    "compile after P->G skill scope toggle produces scope-correct agents",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Phase C: Edit -- toggle api-framework-hono from project to global scope
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain (pass through)
      await wizard.build.advanceDomain();

      // Build step -- API domain -- toggle api-framework-hono scope to global
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- Shared domain (pass through)
      const sources = await wizard.build.advanceToSources();

      // Sources step (pass through)
      await sources.waitForReady();
      const agents = await sources.advance();

      // Agents step (pass through)
      const confirm = await agents.acceptDefaults("edit");

      // Confirm step
      const result = await confirm.confirm();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
      testWizard = undefined;

      // Phase D: Run cc compile --verbose
      const { exitCode: compileExitCode } = await runCLI(["compile", "--verbose"], projectDir, {
        env: { HOME: fakeHome },
      });

      // D-1: Compile exits successfully
      expect(compileExitCode).toBe(EXIT_CODES.SUCCESS);

      // D-2: web-developer.md at global scope exists with frontmatter
      const globalWebDevPath = path.join(fakeHome, DIRS.CLAUDE, DIRS.AGENTS, "web-developer.md");
      const globalWebDevContent = await readTestFile(globalWebDevPath);
      expect(globalWebDevContent.startsWith("---")).toBe(true);

      // D-3: Global web-developer.md contains api-framework-hono (all skills go to all agents)
      expect(globalWebDevContent).toContain("api-framework-hono");
    },
  );

  it("compile is idempotent after scope change", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
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
