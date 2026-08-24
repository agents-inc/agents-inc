import path from "path";
import { describe, it, expect, afterAll, afterEach, beforeAll } from "vitest";
import "../matchers/setup.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  ensureBinaryExists,
  cleanupTempDir,
  createTempDir,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { E2E_MARKETPLACE_NAME, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import type { WizardResult, ProjectHandle } from "../pages/wizard-result.js";

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * POM Framework Smoke Tests
 *
 * These 3 tests prove the Page Object Model framework works end-to-end
 * before any existing test is migrated. Each test exercises a different
 * layer of the framework:
 *
 * 1. InitWizard.completeWithDefaults + toHaveConfig
 * 2. EditWizard.passThrough + toHaveCompiledAgents
 * 3. ProjectBuilder.minimal + CLI.run(compile) + toHaveCompiledAgents
 */

describe("POM Framework Smoke Tests", () => {
  beforeAll(ensureBinaryExists, TIMEOUTS.SETUP);

  describe.skipIf(!claudeAvailable)("InitWizard.completeWithDefaults", () => {
    let result: WizardResult | undefined;
    let pluginFixture: E2EPluginSource | undefined;
    let sharedHome: string | undefined;

    beforeAll(async () => {
      pluginFixture = await createE2EPluginSource();
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      if (pluginFixture) await cleanupTempDir(pluginFixture.tempDir);
    });

    afterEach(async () => {
      await result?.destroy();
      result = undefined;
      if (sharedHome) {
        await cleanupTempDir(sharedHome);
        sharedHome = undefined;
      }
    });

    it(
      "should complete init with defaults and produce config + compiled agents",
      async () => {
        // Default-scope compiled agents land in HOME, so drive the init as a
        // project install with an explicit global HOME: config.ts stays under
        // result.project, the compiled agents are read from sharedHome. The
        // afterEach owns cleanup (the reuse-param launch does not).
        sharedHome = await createTempDir();
        const wizard = await InitWizard.launchInProject({
          source: pluginFixture!,
          globalHome: sharedHome,
        });
        result = await wizard.completeWithDefaults();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          agents: ["web-developer", "api-developer"],
          origin: E2E_MARKETPLACE_NAME,
        });
        const globalProject = { dir: sharedHome };
        await expect(globalProject).toHaveCompiledAgent("web-developer");
        await expect(globalProject).toHaveCompiledAgent("api-developer");
      },
      TIMEOUTS.INTERACTIVE,
    );
  });

  describe("EditWizard.passThrough", () => {
    let result: WizardResult | undefined;
    let source: E2ESource | undefined;
    let project: ProjectHandle | undefined;

    afterEach(async () => {
      await result?.destroy();
      result = undefined;
      if (source) {
        await cleanupTempDir(source.tempDir);
        source = undefined;
      }
      if (project) {
        await cleanupTempDir(path.dirname(project.dir));
        project = undefined;
      }
    });

    it(
      "should pass through edit wizard and preserve compiled agents",
      async () => {
        source = await createE2ESource();
        project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id, E2E_SKILL.hono.id, E2E_SKILL["research-methodology"].id],
          agents: ["web-developer", "api-developer"],
          domains: ["web", "api", "meta"],
        });

        const wizard = await EditWizard.launch({
          projectDir: project.dir,
          source,
        });
        result = await wizard.passThrough();

        await expectPhaseSuccess(result, {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id, E2E_SKILL["research-methodology"].id],
          agents: ["web-developer", "api-developer"],
          compiledAgents: [],
        });
      },
      TIMEOUTS.INTERACTIVE,
    );
  });

  describe("ProjectBuilder.minimal + CLI.run(compile)", () => {
    let project: ProjectHandle | undefined;

    afterEach(async () => {
      if (project) {
        await cleanupTempDir(path.dirname(project.dir));
        project = undefined;
      }
    });

    it(
      "should compile a minimal project and produce compiled agents",
      async () => {
        project = await ProjectBuilder.minimal();

        const cliResult = await CLI.run(["compile", "--verbose"], project);

        expect(cliResult.exitCode).toBe(EXIT_CODES.SUCCESS);
        expect(cliResult.output).toContain(STEP_TEXT.COMPILE_SUCCESS);
        await expect(project).toHaveCompiledAgent("web-developer");
        await expect(project).toHaveCompiledAgent("api-developer");
      },
      TIMEOUTS.INTERACTIVE,
    );
  });
});
