import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupTempDir,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EJECT_SOURCE } from "../../src/cli/consts.js";

/**
 * The global config written during a PROJECT-scope init must carry the
 * `marketplace` field, because it is the only record tying globally-installed
 * plugins back to the marketplace they came from.
 *
 * `uninstall` resolves which plugins it owns via `getCliInstalledPluginKeys`.
 * Its primary key is `<id>@<skill.source>`, and `skill.source` is the wizard's
 * selected source label (the default public source name), NOT the marketplace
 * the plugin was actually registered under. Only the `config.marketplace`
 * variant key produces `<id>@<marketplace>`, which is the key the Claude plugin
 * registry uses. When the global config omits `marketplace`, no key matches: a
 * global `uninstall --yes` finds no CLI-owned plugins, skips the plugin branch
 * entirely, and then removes the `.claude-src/` config manifest — destroying the
 * only record of plugins that remain registered and enabled.
 *
 * The A/B control (init run FROM the home root) writes the config directly and
 * is expected to carry `marketplace` and `source`, isolating the defect to the
 * project-init scope-split path.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("project-scope plugin init writes a global config", () => {
  let fixture: E2EPluginSource;
  let wizard: InitWizard | undefined;
  let currentTempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (currentTempDir) {
      await cleanupTempDir(currentTempDir);
      currentTempDir = undefined;
    }
  });

  afterAll(async () => {
    if (fixture) await cleanupTempDir(fixture.tempDir);
  });

  it(
    "carries marketplace so a later global uninstall deregisters the plugins it installed",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      currentTempDir = tempDir;

      wizard = await InitWizard.launch({
        projectDir,
        source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      const initResult = await wizard.completeWithDefaults();
      expect(await initResult.exitCode, initResult.output).toBe(EXIT_CODES.SUCCESS);
      await initResult.destroy();

      const globalConfig = await loadConfigOrFail(fakeHome);
      const reactPluginKey = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;

      // Proof of execution: the project init really did route global-scoped,
      // marketplace-sourced skills into the global config, so the merge branch
      // that owns `marketplace` actually ran with non-empty incoming data.
      expect(
        globalConfig.skills.filter((s) => s.scope === "global" && !s.excluded).map((s) => s.id),
        "global config must own the globally-scoped skills the project init installed",
      ).toContain(E2E_SKILL.react.id);
      expect(
        globalConfig.skills.find((s) => s.id === E2E_SKILL.react.id)?.source,
        "global skill entry must be marketplace-sourced, not eject",
      ).not.toBe(EJECT_SOURCE);

      // Pre-condition: the plugins are genuinely registered and enabled at global scope.
      await expect({ dir: fakeHome }).toHavePluginInRegistry(reactPluginKey);
      await expect({ dir: fakeHome }).toHavePlugin(reactPluginKey);

      // The invariant under test. `source` travels with `marketplace` on the
      // scope split and is dropped by the same merge, so both are pinned here.
      expect(
        globalConfig.marketplace,
        "global config.ts must record the marketplace its plugins came from",
      ).toBe(fixture.marketplaceName);
      expect(
        globalConfig.source,
        "global config.ts must record the source it was installed from",
      ).toBeDefined();

      const uninstall = await CLI.run(
        ["uninstall", "--yes"],
        { dir: fakeHome },
        { env: { HOME: fakeHome } },
      );
      expect(uninstall.exitCode, uninstall.output).toBe(EXIT_CODES.SUCCESS);
      expect(
        uninstall.stdout,
        "a global uninstall that owns plugins must report the plugin removal",
      ).toContain("Uninstalled plugin");

      // Filesystem: the plugin is gone from both the enablement list and the registry.
      await expect({ dir: fakeHome }).not.toHavePlugin(reactPluginKey);
      await expect({ dir: fakeHome }).not.toHavePluginInRegistry(reactPluginKey);
    },
  );

  it(
    "control: init run from the home root carries marketplace and source in the global config",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome } = await createTestEnvironment();
      currentTempDir = tempDir;

      wizard = await InitWizard.launch({
        projectDir: fakeHome,
        source: { sourceDir: fixture.sourceDir, tempDir: fixture.tempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      const initResult = await wizard.completeWithDefaults();
      expect(await initResult.exitCode, initResult.output).toBe(EXIT_CODES.SUCCESS);
      await initResult.destroy();

      const globalConfig = await loadConfigOrFail(fakeHome);
      expect(globalConfig.marketplace).toBe(fixture.marketplaceName);
      expect(globalConfig.source).toBeDefined();
    },
  );
});
