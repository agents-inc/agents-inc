import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { TIMEOUTS, EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  isClaudeCLIAvailable,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  initGlobal,
  initProject,
  readSkillEntries,
} from "../fixtures/dual-scope-helpers.js";

/**
 * Dual-scope edit lifecycle E2E test -- mixed source coexistence.
 * Requires Claude CLI to be available.
 *
 * Split from dual-scope-edit-integrity.e2e.test.ts for parallel execution.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("dual-scope edit lifecycle -- mixed source coexistence", () => {
  let pluginFixture: E2EPluginSource;
  let pluginSourceTempDir: string;
  let tempDir: string;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    pluginFixture = await createE2EPluginSource();
    pluginSourceTempDir = pluginFixture.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  afterAll(async () => {
    if (pluginSourceTempDir) await cleanupTempDir(pluginSourceTempDir);
  });

  it(
    "Edit detects source migration for locally-initialized skills with marketplace source",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      const phaseA = await initGlobal(pluginFixture.sourceDir, pluginFixture.tempDir, fakeHome);
      expect(phaseA.exitCode).toBe(EXIT_CODES.SUCCESS);

      const phaseB = await initProject(
        pluginFixture.sourceDir,
        pluginFixture.tempDir,
        fakeHome,
        projectDir,
      );
      expect(phaseB.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Phase C: Edit -- switch all to plugin
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir: pluginFixture.sourceDir, tempDir: pluginFixture.tempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      const sources = await wizard.build.passThroughAllDomains();

      await sources.waitForReady();
      await sources.setAllPlugin();
      const agents = await sources.advance();

      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      // Phase D: Assertions
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      const output = result.rawOutput;
      expect(output).toMatch(/[Ss]witch/);

      // D-3: api-framework-hono local files deleted (migrated to plugin)
      const localSkillPath = path.join(
        projectDir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "api-framework-hono",
        FILES.SKILL_MD,
      );
      expect(await fileExists(localSkillPath)).toBe(false);

      // D-4: Both scopes have correct config and compiled agents
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
          agents: ["web-developer"],
        },
        project: {
          skillIds: ["api-framework-hono"],
          agents: ["api-developer"],
        },
      });

      // D-5: Project-scoped api-framework-hono source must have been updated from eject to plugin
      // (excluded global entries may legitimately retain source:"eject")
      const projectHonoEntry = (await readSkillEntries(projectDir, "api-framework-hono")).find(
        (entry) => entry.scope === "project",
      );
      expect(
        projectHonoEntry,
        "project-scoped api-framework-hono must exist in config",
      ).toBeDefined();
      expect(projectHonoEntry?.source).not.toBe("eject");

      await result.destroy();
    },
  );

  it(
    "Compiled agents reference both plugin and local skills correctly",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 1 },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      const phaseA = await initGlobal(pluginFixture.sourceDir, pluginFixture.tempDir, fakeHome);
      expect(phaseA.exitCode).toBe(EXIT_CODES.SUCCESS);

      const phaseB = await initProject(
        pluginFixture.sourceDir,
        pluginFixture.tempDir,
        fakeHome,
        projectDir,
      );
      expect(phaseB.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Phase C: Edit -- switch api-framework-hono to local
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir: pluginFixture.sourceDir, tempDir: pluginFixture.tempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      const sources = await wizard.build.passThroughAllDomains();

      // Sources step -- navigate to switch individual skill
      await sources.waitForReady();
      // Use "l" to set all to local for this test variant
      await sources.setAllLocal();
      const agents = await sources.advance();

      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();

      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Phase D: Verify agent content

      // D-1: web-developer.md (global) contains all selected skills
      const globalWebDevPath = path.join(fakeHome, DIRS.CLAUDE, DIRS.AGENTS, "web-developer.md");
      expect(await fileExists(globalWebDevPath)).toBe(true);
      const webDevContent = await readTestFile(globalWebDevPath);
      expect(webDevContent).toContain("web-framework-react");
      // web-developer contains api-framework-hono (all skills go to all agents)
      expect(webDevContent).toContain("api-framework-hono");

      // D-2: api-developer.md (project) contains all selected skills
      const projectApiDevPath = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
      expect(await fileExists(projectApiDevPath)).toBe(true);
      const apiDevContent = await readTestFile(projectApiDevPath);
      expect(apiDevContent).toContain("api-framework-hono");
      // api-developer contains web-framework-react (all skills go to all agents)
      expect(apiDevContent).toContain("web-framework-react");

      await result.destroy();
    },
  );
});
