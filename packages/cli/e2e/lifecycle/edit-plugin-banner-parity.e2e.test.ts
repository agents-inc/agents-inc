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
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { applyEditFrom, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  injectMarketplaceIntoConfig,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";

/**
 * `edit` narrates a plugin install the way `init` does: the same skill installed as a plugin by
 * both, every narration line asserted against BOTH outputs. Real install; requires the Claude CLI.
 */

/** A pattern, not a literal: the count differs by run, and the noun follows it. */
const INSTALLED_PLUGIN_TOTAL = /Installed \d+ skill plugins?\b/;

const claudeAvailable = await isClaudeCLIAvailable();

const PLUGIN_STACK_ID = "PlugStk5";

const EJECT_STACK_ID = "EjctStk1";

describe.skipIf(!claudeAvailable)("edit narrates a plugin install the way init does", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
    store.publish(PLUGIN_STACK_ID, e2eStackPayload({ scope: "global", install: "plugin" }));
    store.publish(EJECT_STACK_ID, e2eStackPayload({ scope: "global" }));
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
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

      const initDir = path.join(tempDir, "init-project");
      await createPermissionsFile(initDir);
      const pluginInitResult = await runInitFrom(
        store,
        PLUGIN_STACK_ID,
        { dir: initDir },
        fixture.sourceDir,
      );
      await expectPhaseSuccess(
        { project: { dir: initDir }, exitCode: pluginInitResult.exitCode },
        { skillIds: [E2E_SKILL.react.id], origin: fixture.marketplaceName },
      );
      const initOutput = pluginInitResult.output;

      expect(initOutput).toContain(STEP_TEXT.INSTALLING_PLUGINS_ELLIPSIS);
      expect(initOutput).toContain(STEP_TEXT.PLUGIN_NATIVE);
      expect(initOutput).toContain(`Installed ${reactPluginRef}`);
      expect(initOutput).toMatch(INSTALLED_PLUGIN_TOTAL);

      const editDir = path.join(tempDir, "edit-project");
      await createPermissionsFile(editDir);
      const ejectInitResult = await runInitFrom(
        store,
        EJECT_STACK_ID,
        { dir: editDir },
        fixture.sourceDir,
      );
      await expectPhaseSuccess(
        { project: { dir: editDir }, exitCode: ejectInitResult.exitCode },
        { skillIds: [E2E_SKILL.react.id], origin: "eject", copiedSkills: [E2E_SKILL.react.id] },
      );
      await injectMarketplaceIntoConfig(editDir, fixture.marketplaceName);

      const editResult = await applyEditFrom(store, PLUGIN_STACK_ID, { dir: editDir });

      await expectPhaseSuccess(
        { project: { dir: editDir }, exitCode: editResult.exitCode },
        { skillIds: [E2E_SKILL.react.id], origin: fixture.marketplaceName },
      );
      const editOutput = editResult.output;

      await expect({ dir: editDir }).toHavePlugin(reactPluginRef);

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
    },
  );
});
