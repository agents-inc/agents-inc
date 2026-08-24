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
  cleanupFixture,
  cleanupTempDir,
  completeWithLocalSources,
  createTempDir,
  directoryExists,
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
 *
 * "Bulk" here means EVERY SKILL, not a bulk keystroke. The Sources step's two
 * set-all keys are withdrawn; `setAllPlugin` / `setAllLocal` now commit the mode
 * on each row in turn (see `SourcesStep`). At global scope every row is editable,
 * so the walk reaches all of them and this file's subject is unchanged.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("install mode mid-lifecycle -- bulk switching", () => {
  let fixture: E2EPluginSource;

  let tempDir: string | undefined;

  beforeAll(async () => {
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
          source: fixture,
          projectDir,
        });

        // Navigate through init with eject source selection
        const initResult = await completeWithLocalSources(initWizard);

        await expectPhaseSuccess(initResult, {
          skillIds: [E2E_SKILL.react.id],
          origin: "eject",
          copiedSkills: [E2E_SKILL.react.id],
        });
        await initResult.destroy();

        // Inject marketplace into config (fixture setup for Phase 2)
        await injectMarketplaceIntoConfig(projectDir, fixture.marketplaceName);

        // Phase 2: Edit -- switch every skill to plugin, one row at a time
        const editWizard = await EditWizard.launchInGlobal({
          projectDir,
          source: fixture,
        });

        const editSources = await editWizard.build.passThroughAllDomains();
        await editSources.setAllPlugin();
        const editAgents = await editSources.advance();
        const editConfirm = await editAgents.acceptDefaults("edit");
        const editResult = await editConfirm.confirm();

        await expectPhaseSuccess(editResult, {
          skillIds: [E2E_SKILL.react.id],
          origin: fixture.marketplaceName,
          compiledAgents: E2E_AGENTS.WEB_AND_API,
        });

        const rawOutput = editResult.rawOutput;
        expect(rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.PLUGIN_NATIVE}`,
        );

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
          source: fixture,
          projectDir,
        });
        const initResult = await initWizard.completeWithDefaults();

        await expectPhaseSuccess(initResult, {
          skillIds: [E2E_SKILL.react.id],
          origin: fixture.marketplaceName,
          compiledAgents: E2E_AGENTS.WEB_AND_API,
        });
        await initResult.destroy();

        // Phase 2: Edit -- switch every skill to eject, one row at a time
        const editWizard = await EditWizard.launchInGlobal({
          projectDir,
          source: fixture,
        });

        const editSources = await editWizard.build.passThroughAllDomains();
        await editSources.setAllLocal();
        const editAgents = await editSources.advance();
        const editConfirm = await editAgents.acceptDefaults("edit");
        const editResult = await editConfirm.confirm();

        await expectPhaseSuccess(editResult, {
          skillIds: [E2E_SKILL.react.id],
          origin: "eject",
          copiedSkills: [E2E_SKILL.react.id],
        });

        const rawOutput = editResult.rawOutput;
        expect(rawOutput).toContain(
          `${STEP_TEXT.SWITCHING_SKILLS_SUFFIX} ${STEP_TEXT.EJECT_LOCAL_COPY}`,
        );

        // Same reasoning as the sibling above, in the other direction: the ejected
        // copy is back on disk and the plugin registration is gone.
        await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
        await expect({ dir: projectDir }).toHaveNoPlugins();

        // `launchInGlobal` collapses HOME, cwd and the install onto projectDir (see the
        // file header), so that is where the recompile has to land. The `os.homedir()`
        // fallback this replaces read the DEVELOPER'S OWN installation on any machine
        // with one, and passed there whatever the run under test compiled.
        await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");

        await editResult.destroy();
      },
    );
  });
});
