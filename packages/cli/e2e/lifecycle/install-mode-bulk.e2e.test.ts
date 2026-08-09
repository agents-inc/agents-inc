import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  cleanupFixture,
  cleanupTempDir,
  completeWithLocalSources,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  skillsPath,
  injectMarketplaceIntoConfig,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";

/**
 * Install-mode lifecycle E2E tests -- bulk switching.
 *
 * Tests the full flow of switching EVERY skill's install mode mid-lifecycle:
 *   9a: Init local -> edit switch ALL to plugin -> verify plugin state
 *   9b: Init plugin -> edit switch ALL to local -> verify local state
 *
 * These tests require the Claude CLI for plugin install/uninstall operations.
 *
 * Note: isClaudeCLIAvailable is re-exported from test-utils for skip detection.
 *
 * Both tests switch the SOURCE of default-scope (global) skills mid-edit. A
 * project edit renders global skills as locked (readOnly) and refuses the
 * toggle, so both phases model editing the GLOBAL install via launchInGlobal:
 * HOME == cwd == projectDir, the skills are editable, and all content + config
 * collapse onto projectDir (which every assertion below reads).
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("install mode mid-lifecycle -- bulk switching", () => {
  let fixture: E2EPluginSource;

  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("init local, edit switch all to plugin", () => {
    it(
      "should switch all skills from eject to plugin mode via edit wizard",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = path.join(tempDir, "project");

        // Phase 1: Init in eject mode using page objects
        const initWizard = await InitWizard.launchInGlobal({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir,
        });

        // Navigate through init with eject source selection
        const initResult = await completeWithLocalSources(initWizard);

        await expectPhaseSuccess(initResult, {
          skillIds: ["web-framework-react"],
          source: "eject",
          copiedSkills: ["web-framework-react"],
        });
        await initResult.destroy();

        // Inject marketplace into config (fixture setup for Phase 2)
        await injectMarketplaceIntoConfig(projectDir, fixture.marketplaceName);

        // Phase 2: Edit -- switch ALL to plugin via "p" hotkey
        const editWizard = await EditWizard.launchInGlobal({
          projectDir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });

        const editSources = await editWizard.build.passThroughAllDomains();
        await editSources.setAllPlugin();
        const editAgents = await editSources.advance();
        const editConfirm = await editAgents.acceptDefaults("edit");
        const editResult = await editConfirm.confirm();

        await expectPhaseSuccess(editResult, {
          skillIds: ["web-framework-react"],
          source: fixture.marketplaceName,
          compiledAgents: E2E_AGENTS.WEB_AND_API,
        });

        const rawOutput = editResult.rawOutput;
        expect(rawOutput).toContain(STEP_TEXT.SWITCHING_SKILLS_PREFIX);
        expect(rawOutput).toContain(`to `);

        // The narration is what the run SAID; the install mode is what it DID, and
        // that is this file's subject. A plugin-mode skill is registered in
        // settings.json and its ejected copy is gone from .claude/skills/.
        await expect({ dir: projectDir }).toHavePlugin(
          `${E2E_SKILL.react.id}@${fixture.marketplaceName}`,
        );
        expect(
          await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.react.id)),
          "switching to plugin mode must remove the ejected copy",
        ).toBe(false);

        await editResult.destroy();
      },
    );
  });

  describe("init plugin, edit switch all to eject", () => {
    it(
      "should switch all skills from plugin to eject mode via edit wizard",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = path.join(tempDir, "project");

        // Phase 1: Init in plugin mode
        const initWizard = await InitWizard.launchInGlobal({
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
          projectDir,
        });
        const initResult = await initWizard.completeWithDefaults();

        await expectPhaseSuccess(initResult, {
          skillIds: ["web-framework-react"],
          source: fixture.marketplaceName,
          compiledAgents: E2E_AGENTS.WEB_AND_API,
        });
        await initResult.destroy();

        // Phase 2: Edit -- switch ALL to eject via "l" hotkey
        const editWizard = await EditWizard.launchInGlobal({
          projectDir,
          source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        });

        const editSources = await editWizard.build.passThroughAllDomains();
        await editSources.setAllLocal();
        const editAgents = await editSources.advance();
        const editConfirm = await editAgents.acceptDefaults("edit");
        const editResult = await editConfirm.confirm();

        await expectPhaseSuccess(editResult, {
          skillIds: ["web-framework-react"],
          source: "eject",
          copiedSkills: ["web-framework-react"],
        });

        const rawOutput = editResult.rawOutput;
        expect(rawOutput).toContain(STEP_TEXT.SWITCHING_SKILLS_PREFIX);
        expect(rawOutput).toContain(`to `);

        // Same reasoning as the sibling above, in the other direction: the ejected
        // copy is back on disk and the plugin registration is gone.
        await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: projectDir }).toHaveNoPlugins();

        // Agent may be compiled at project or global scope
        const projectAgentPath = path.join(agentsPath(projectDir), "web-developer.md");
        const checkDir = (await fileExists(projectAgentPath)) ? projectDir : os.homedir();
        await expect({ dir: checkDir }).toHaveCompiledAgent("web-developer");

        await editResult.destroy();
      },
    );
  });
});
