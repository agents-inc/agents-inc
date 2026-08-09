import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { cleanupFixture, ensureBinaryExists, isClaudeCLIAvailable } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * E2E tests for the edit wizard — mode migration between local and plugin.
 *
 * Test scenarios:
 *   P-EDIT-3: Mode migration local -> plugin
 *   P-EDIT-4: Mode migration plugin -> local
 *
 * The entire suite is skipped when the Claude CLI is not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("edit wizard — plugin mode migration", () => {
  let fixture: E2EPluginSource;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("mode migration local -> plugin", () => {
    it(
      "should switch skills from local to plugin mode",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.localProjectWithMarketplace({
          skills: [E2E_SKILL.react.id],
          marketplace: fixture.marketplaceName,
          agents: [...E2E_AGENTS.WEB],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });

        // Build -> Sources (customize view)
        const sources = await wizard.build.advanceToSources();

        // Press "p" hotkey to set ALL skills to plugin mode
        await sources.setAllPlugin();

        // Sources -> Agents -> Confirm -> Complete
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        // The whole composed narration line, count included: the bare verb
        // cannot tell a switch TO plugin from the switch BACK that the sibling
        // block drives, and the count is what tells a per-skill switch from a
        // bulk one.
        const rawOutput = result.rawOutput;
        expect(rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.PLUGIN_NATIVE}`,
        );
        expect(rawOutput).not.toContain(STEP_TEXT.EJECT_LOCAL_COPY);

        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          source: fixture.marketplaceName,
        });

        await expect(result.project).toHaveCompiledAgent("web-developer");
      },
    );
  });

  describe("mode migration plugin -> eject", () => {
    it(
      "should switch skills from plugin to eject mode",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          marketplace: fixture.marketplaceName,
          agents: [...E2E_AGENTS.WEB],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });

        // Build -> Sources (customize view)
        const sources = await wizard.build.advanceToSources();

        // Press "l" hotkey to set ALL skills to eject mode
        await sources.setAllLocal();

        // Sources -> Agents -> Confirm -> Complete
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;
        expect(rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_PREFIX} 1 ${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.EJECT_LOCAL_COPY}`,
        );
        expect(rawOutput).not.toContain(STEP_TEXT.PLUGIN_NATIVE);

        await expect(result.project).toHaveSkillCopied(E2E_SKILL.react.id);
        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
          source: "eject",
        });

        await expect(result.project).toHaveCompiledAgent("web-developer");
      },
    );
  });
});
