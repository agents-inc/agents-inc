import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createTempDir,
  isClaudeCLIAvailable,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("plugin mode lifecycle: init -> uninstall", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let tempDir: string;
  let projectDir: string;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();

    tempDir = await createTempDir();
    projectDir = tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
    await cleanupFixture(fixture);
  });

  it(
    "should complete full plugin lifecycle: init -> uninstall",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Modelled as the global install (HOME === cwd) so the follow-up uninstall, which resolves
      // its target from cwd, finds the same content.
      const initResult = await installFromSeed(
        store,
        "Plugins1",
        e2eStackPayload({ install: "plugin" }),
        { dir: projectDir, home: projectDir },
        fixture.sourceDir,
      );

      await expectPhaseSuccess(
        { project: { dir: projectDir }, exitCode: initResult.exitCode },
        {
          skillIds: [
            E2E_SKILL.react.id,
            E2E_SKILL.vitest.id,
            E2E_SKILL.zustand.id,
            E2E_SKILL.hono.id,
          ],
          agents: ["web-developer", "api-developer"],
          origin: fixture.marketplaceName,
        },
      );

      const initOutput = initResult.output;
      expect(initOutput).toContain(STEP_TEXT.INSTALLING_PLUGINS_ELLIPSIS);
      expect(initOutput).toContain(STEP_TEXT.PLUGIN_NATIVE);
      expect(initOutput).toContain(`Installed ${E2E_SKILL.react.id}@${fixture.marketplaceName}`);
      expect(initOutput).not.toContain(STEP_TEXT.SKILLS_COPIED_TO);

      // "Failed to" is absent either way, so assert the positive sentinel.
      expect(initOutput).toContain(STEP_TEXT.INIT_SUCCESS);

      const uninstallResult = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        {
          env: { CC_MARKETPLACE: undefined },
        },
      );

      expect(uninstallResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(uninstallResult.stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      await expectCleanUninstall(projectDir, { removeConfig: true });
    },
  );
});
