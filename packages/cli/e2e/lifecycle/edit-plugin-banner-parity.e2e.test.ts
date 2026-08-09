import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupFixture,
  cleanupTempDir,
  completeWithLocalSources,
  createTempDir,
  ensureBinaryExists,
  injectMarketplaceIntoConfig,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";

/**
 * `edit` narrates a plugin install the way `init` does, because it is the same
 * operation.
 *
 * Both runs below install the same skill as a plugin against the same
 * marketplace — `init` as a fresh plugin-mode install, `edit` as an eject→plugin
 * switch — so every informational line one prints about that operation the other
 * owes. The spec asserts the strings against BOTH outputs rather than against
 * `edit` alone: a line that drifts on one side only is the divergence this pins,
 * and a one-sided assertion would let the pair fall apart the moment `init`
 * rewords something.
 *
 * The install is real (the Claude CLI is required, and the plugin registration is
 * asserted), so the narration cannot be satisfied by printing a banner over work
 * that never happened.
 */

/**
 * The line that closes a plugin install. Matched as a pattern rather than a
 * `STEP_TEXT` literal because the count differs by run — a fresh install carries
 * the whole selection, a mode switch carries only what was switched — and it is
 * the sentence, not the number, that has to be the same on both paths.
 */
const INSTALLED_PLUGIN_TOTAL = /Installed \d+ skill plugins/;

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("edit narrates a plugin install the way init does", () => {
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
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "prints the same plugin-install banner, per-skill lines and total that init prints",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const reactPluginRef = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;

      // --- The reference: a plugin-mode init installing the same skill. ---

      const initDir = path.join(tempDir, "init-project");
      const pluginInit = await InitWizard.launchInGlobal({
        source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        projectDir: initDir,
      });
      const pluginInitResult = await pluginInit.completeWithDefaults();
      await expectPhaseSuccess(pluginInitResult, {
        skillIds: [E2E_SKILL.react.id],
        source: fixture.marketplaceName,
      });
      const initOutput = pluginInitResult.output;
      await pluginInitResult.destroy();

      expect(initOutput).toContain(STEP_TEXT.INSTALLING_PLUGINS_ELLIPSIS);
      expect(initOutput).toContain(STEP_TEXT.PLUGIN_NATIVE);
      expect(initOutput).toContain(`Installed ${reactPluginRef}`);
      expect(initOutput).toMatch(INSTALLED_PLUGIN_TOTAL);

      // --- The subject: an edit performing that same install. ---

      const editDir = path.join(tempDir, "edit-project");
      const ejectInit = await InitWizard.launchInGlobal({
        source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        projectDir: editDir,
      });
      const ejectInitResult = await completeWithLocalSources(ejectInit);
      await expectPhaseSuccess(ejectInitResult, {
        skillIds: [E2E_SKILL.react.id],
        source: "eject",
        copiedSkills: [E2E_SKILL.react.id],
      });
      await ejectInitResult.destroy();
      await injectMarketplaceIntoConfig(editDir, fixture.marketplaceName);

      const editWizard = await EditWizard.launchInGlobal({
        projectDir: editDir,
        source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
      });
      const editSources = await editWizard.build.passThroughAllDomains();
      await editSources.setAllPlugin();
      const editAgents = await editSources.advance();
      const editConfirm = await editAgents.acceptDefaults("edit");
      const editResult = await editConfirm.confirm();

      await expectPhaseSuccess(editResult, {
        skillIds: [E2E_SKILL.react.id],
        source: fixture.marketplaceName,
      });
      const editOutput = editResult.rawOutput;

      // The install really happened, so the narration below describes real work.
      await expect(editResult.project).toHavePlugin(reactPluginRef);

      expect(
        editOutput,
        "an edit switching a skill to plugin mode must name the mode init names",
      ).toContain(STEP_TEXT.PLUGIN_NATIVE);
      expect(
        editOutput,
        "the banner init prints before installing plugins belongs to the operation, not to init",
      ).toContain(STEP_TEXT.INSTALLING_PLUGINS_ELLIPSIS);
      expect(
        editOutput,
        "the per-skill line naming what was installed is the same line on both paths",
      ).toContain(`Installed ${reactPluginRef}`);
      expect(editOutput, "the closing total is the same line on both paths").toMatch(
        INSTALLED_PLUGIN_TOTAL,
      );

      expect(editOutput).not.toContain("Failed to install plugin");
      await editResult.destroy();
    },
  );
});
