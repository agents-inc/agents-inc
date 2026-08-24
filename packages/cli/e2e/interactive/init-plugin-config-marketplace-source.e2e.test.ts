import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { readAllSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";

/**
 * A local-directory source (`--marketplace /path`) whose `.claude-plugin/marketplace.json`
 * declares a name must have that name recorded as every plugin-installed skill's
 * `source` in config.ts — the same name the install log, `settings.json` and the
 * plugin registry already use.
 *
 * The whole suite is skipped when the Claude CLI is not available, matching
 * init-wizard-plugin.e2e.test.ts.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("init wizard — plugin source name in config.ts", () => {
  let fixture: E2EPluginSource;
  let wizard: InitWizard | undefined;

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

  it(
    "records the local source's marketplace name as every skill's source",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      wizard = await InitWizard.launchInProject({
        source: fixture,
      });
      const result = await wizard.completeWithDefaults();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const reactPluginKey = `${E2E_SKILL.react.id}@${fixture.marketplaceName}`;

      // What the CLI told the user it installed.
      expect(result.output).toContain(`Installed ${reactPluginKey}`);

      // Filesystem: Claude's own records agree with that log line. A default
      // (global-scope) install writes settings.json and the plugin registry
      // under the global HOME, not the project dir.
      await expect({ dir: wizard.globalHome }).toHavePlugin(reactPluginKey);
      await expect({ dir: wizard.globalHome }).toHavePluginInRegistry(reactPluginKey);

      // Proof the marketplace resolved at all: config.ts's own top-level
      // `marketplace` field carries the real name. Without this the per-skill
      // assertion below could not distinguish a stamping bug from a source
      // that simply never produced a marketplace.
      const config = await loadConfigOrFail(result.project.dir);
      expect(
        config.marketplaceName,
        "config.ts must record the source's resolved marketplace name",
      ).toBe(fixture.marketplaceName);

      // Config: every persisted skill entry must name the SAME marketplace.
      // The distinct-source set is asserted exhaustively rather than per-entry
      // so a stray extra source value cannot pass silently.
      const skillEntries = await readAllSkillEntries(result.project.dir);
      expect(
        skillEntries.map((entry) => entry.id),
        "config.ts must persist the installed skills",
      ).toContain(E2E_SKILL.react.id);
      expect(
        [...new Set(skillEntries.map((entry) => entry.origin))],
        "every config.ts skill entry must record the source's marketplace name",
      ).toStrictEqual([fixture.marketplaceName]);
    },
  );
});
