import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { TIMEOUTS, EXIT_CODES, FILES, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  isClaudeCLIAvailable,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
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
  }, TIMEOUTS.SETUP_DUAL);

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

      const phaseA = await initGlobal(pluginFixture, fakeHome);
      expect(phaseA.exitCode).toBe(EXIT_CODES.SUCCESS);

      const phaseB = await initProject(pluginFixture, fakeHome, projectDir);
      expect(phaseB.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Phase C: Edit -- switch all to plugin
      wizard = await EditWizard.launch({
        projectDir,
        source: pluginFixture,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
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

      // Which direction the switch went, not merely that the word appeared. The
      // alternation that stood here (`/[Ss]witch/`) was satisfied by a switch BACK
      // to eject, which is the other half of the matrix this file exists to tell apart.
      const output = result.rawOutput;
      expect(output).toContain(STEP_TEXT.SWITCHING_SKILLS_SUFFIX);
      expect(output).toContain(STEP_TEXT.PLUGIN_NATIVE);
      expect(output).not.toContain(STEP_TEXT.EJECT_LOCAL_COPY);

      // D-3: api-framework-hono local files deleted (migrated to plugin)
      const localSkillPath = path.join(skillsPath(projectDir), E2E_SKILL.hono.id, FILES.SKILL_MD);
      expect(await fileExists(localSkillPath)).toBe(false);

      // D-4: Both scopes have correct config and compiled agents
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          agents: ["web-developer"],
        },
        project: {
          skillIds: [E2E_SKILL.hono.id],
          agents: ["api-developer"],
        },
      });

      // D-5: Project-scoped api-framework-hono source must have been updated from eject to plugin
      // (excluded global entries may legitimately retain source:"eject")
      const projectHonoEntry = (await readSkillEntries(projectDir, E2E_SKILL.hono.id)).find(
        (entry) => entry.scope === "project",
      );
      expect(
        projectHonoEntry,
        "project-scoped api-framework-hono must exist in config",
      ).toBeDefined();
      expect(projectHonoEntry?.origin).not.toBe("eject");

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

      const phaseA = await initGlobal(pluginFixture, fakeHome);
      expect(phaseA.exitCode).toBe(EXIT_CODES.SUCCESS);

      const phaseB = await initProject(pluginFixture, fakeHome, projectDir);
      expect(phaseB.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Phase C: Edit -- switch api-framework-hono to local
      wizard = await EditWizard.launch({
        projectDir,
        source: pluginFixture,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
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

      // D-1: web-developer.md (global) contains its own domain's skill and,
      // under relevance-scoped assignment, never the api one.
      const globalWebDevPath = path.join(agentsPath(fakeHome), "web-developer.md");
      expect(await fileExists(globalWebDevPath)).toBe(true);
      const webDevContent = await readTestFile(globalWebDevPath);
      expect(webDevContent).toContain(E2E_SKILL.react.id);
      expect(webDevContent).not.toContain(E2E_SKILL.hono.id);

      // D-2: api-developer.md (project) mirrors it — the api skill alone.
      const projectApiDevPath = path.join(agentsPath(projectDir), "api-developer.md");
      expect(await fileExists(projectApiDevPath)).toBe(true);
      const apiDevContent = await readTestFile(projectApiDevPath);
      expect(apiDevContent).toContain(E2E_SKILL.hono.id);
      expect(apiDevContent).not.toContain(E2E_SKILL.react.id);

      await result.destroy();
    },
  );
});
