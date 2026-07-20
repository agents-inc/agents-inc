import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, FILES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  isClaudeCLIAvailable,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  initGlobal,
  initProject,
  readSkillEntries,
} from "../fixtures/dual-scope-helpers.js";

/**
 * Dual-scope edit lifecycle E2E test -- source changes via Sources step.
 * Requires Claude CLI to be available.
 *
 * Split from dual-scope-edit-integrity.e2e.test.ts for parallel execution.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "dual-scope edit lifecycle -- source changes via Sources step",
  () => {
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
      "Change a project skill's source from local to plugin",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        // Phase A + B: Use plugin source for init
        const phaseA = await initGlobal(pluginFixture.sourceDir, pluginFixture.tempDir, fakeHome);
        expect(phaseA.exitCode).toBe(EXIT_CODES.SUCCESS);

        const phaseB = await initProject(
          pluginFixture.sourceDir,
          pluginFixture.tempDir,
          fakeHome,
          projectDir,
        );
        expect(phaseB.exitCode).toBe(EXIT_CODES.SUCCESS);

        // Phase C: Edit -- switch api-framework-hono from local to plugin source
        wizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir: pluginFixture.sourceDir, tempDir: pluginFixture.tempDir },
          env: { HOME: fakeHome },
          ...TERMINAL_SIZE.TALL,
        });

        // Build step -- pass through all three domains
        const sources = await wizard.build.passThroughAllDomains();

        // Sources step -- press "p" to switch all skills from local to plugin
        await sources.waitForReady();
        await sources.setAllPlugin();
        const agents = await sources.advance();

        // Agents step
        const confirm = await agents.acceptDefaults("edit");

        // Confirm step
        const result = await confirm.confirm();

        // Phase D: Assertions
        const exitCode = await result.exitCode;
        expect(exitCode).toBe(EXIT_CODES.SUCCESS);

        // D-1: Output contains migration-related text
        const output = result.rawOutput;
        expect(output).toMatch(/[Ss]witch|[Ii]nstall/);

        // D-2: Local skill files removed (switched to plugin)
        const localSkillPath = path.join(
          skillsPath(projectDir),
          "api-framework-hono",
          FILES.SKILL_MD,
        );
        expect(await fileExists(localSkillPath)).toBe(false);

        // D-3: Project config has api-framework-hono and api-developer agent
        await expect({ dir: projectDir }).toHaveConfig({
          skillIds: ["api-framework-hono"],
          agents: ["api-developer"],
        });
        // Project-scoped api-framework-hono source must have been updated from eject to plugin
        // (excluded global entries may legitimately retain source:"eject")
        const projectHonoEntry = (await readSkillEntries(projectDir, "api-framework-hono")).find(
          (entry) => entry.scope === "project",
        );
        expect(
          projectHonoEntry,
          "project-scoped api-framework-hono must exist in config",
        ).toBeDefined();
        expect(projectHonoEntry?.source).not.toBe("eject");

        // D-4: Compiled agents exist at correct scopes
        await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

        await result.destroy();
        wizard = undefined;
      },
    );

    it(
      "Edit detects source migration from local to plugin for locally-initialized skills",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await createTestEnvironment();
        tempDir = env.tempDir;
        const { fakeHome, projectDir } = env;

        // Phase A + B: Init with plugin source -- initProject forces all sources
        // to local via the "l" hotkey. So after Phase B, all skills have
        // source: "eject" in config, even though the source has a marketplace.
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

        // D-1: Output contains migration text (local -> plugin migration detected)
        const output = result.rawOutput;
        expect(output).toMatch(/[Ss]witch/);

        // D-2: Local skill files deleted by migration (switched to plugin)
        const localSkillPath = path.join(
          skillsPath(projectDir),
          "api-framework-hono",
          FILES.SKILL_MD,
        );
        expect(await fileExists(localSkillPath)).toBe(false);

        // D-3: Project config has api-framework-hono and api-developer agent
        await expect({ dir: projectDir }).toHaveConfig({
          skillIds: ["api-framework-hono"],
          agents: ["api-developer"],
        });
        // Project-scoped api-framework-hono source must have been updated from eject to plugin
        // (excluded global entries may legitimately retain source:"eject")
        const projectHonoEntry = (await readSkillEntries(projectDir, "api-framework-hono")).find(
          (entry) => entry.scope === "project",
        );
        expect(
          projectHonoEntry,
          "project-scoped api-framework-hono must exist in config",
        ).toBeDefined();
        expect(projectHonoEntry?.source).not.toBe("eject");

        // D-4: Compiled agents exist at correct scopes
        await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

        await result.destroy();
        wizard = undefined;
      },
    );
  },
);
