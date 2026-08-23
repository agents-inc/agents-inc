import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupFixture,
  configTsPath,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * The word `source` withdraws from the user-facing surface, as a whole word. The refusal
 * under test reads "marketplace could not be resolved from '<ref>' … fix the marketplace
 * or switch the affected skills to eject mode" — one noun for one thing, where it once
 * spelled three. `<ref>` is a path the fixture chose and this negative runs over the whole
 * message, so `createE2ESource` owes it a directory segment that spells neither noun.
 */
const WITHDRAWN_NOUN = /\bsources?\b/i;

/**
 * Hard-error coverage for plugin-install intent when marketplace resolution
 * fails. Enforces the "never silently substitute eject for plugin" rule from
 * feedback_no_plugin_to_eject_fallback.md.
 *
 * The edit refusal below replaces a silence, which is why it asserts an exit code and a
 * byte-identical config rather than a state change. `cc edit` once gated its whole plugin
 * install/uninstall block on the project-level marketplace string, so a config.ts saved
 * without a `marketplace:` field skipped the block entirely: the added skill reached
 * config.ts, `claude plugin install` was never invoked, and `enabledPlugins` in
 * settings.json disagreed with the config while the command exited 0. Install intent is
 * per skill (`origin !== EJECT_SOURCE`) and a project-level truthiness check cannot read
 * it, so once plugin work is requested and the marketplace will not resolve, stopping is
 * the only answer that leaves the two views agreeing.
 *
 * Scenarios:
 *   - `cc edit` against a project whose config lacks `marketplace` AND whose
 *     --marketplace points at a local directory with no marketplace.json. Adding a
 *     plugin-sourced skill MUST hard-error, not silently skip.
 *   - `cc init` against a local source with no marketplace.json. With plugin
 *     mode implied by the default `primarySource`, the old behavior copied the
 *     skills as eject. The fix converts this into a hard error.
 *
 * Both paths require the Claude CLI at some point in the stack (marketplace
 * resolution calls `fetchMarketplace`, which is pure I/O, but `ensureMarketplace`
 * invokes `claudePluginMarketplaceExists` — skip when unavailable).
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("plugin install intent: hard-error paths", () => {
  /**
   * Edit scenario: project was built with plugin-sourced skills but config.ts
   * was saved without the `marketplace` field (legacy state). Source flag
   * points at a plain local source with no `.claude-plugin/marketplace.json`.
   *
   * Adding a new plugin-sourced skill triggers `applyPluginChanges`, which
   * calls `requireMarketplace`. The helper resolves marketplace via
   * `ensureMarketplace` -> `fetchMarketplace`. Both fail because the source
   * has no marketplace manifest, so the helper must hard-error with
   * EXIT_CODES.ERROR and a clear message mentioning "marketplace could not
   * be resolved". The project state must remain untouched.
   */
  describe("cc edit with local source (no marketplace) + plugin skill addition", () => {
    let fixture: E2EPluginSource;
    let localSource: E2ESource;
    let wizard: EditWizard | undefined;

    beforeAll(async () => {
      await ensureBinaryExists();
      // fixture provides plugin-sourced skill IDs used in the seeded config.
      fixture = await createE2EPluginSource();
      // localSource is a plain directory with NO marketplace.json — the
      // resolution path we expect to fail.
      localSource = await createE2ESource();
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await cleanupFixture(fixture);
      await cleanupFixture(localSource);
    });

    afterEach(async () => {
      await wizard?.destroy();
      wizard = undefined;
    });

    it(
      "should hard-error and leave config/settings untouched",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          // The local source with no marketplace.json — the resolution failure point.
          marketplace: localSource.sourceDir,
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: [...E2E_AGENTS.WEB],
          domains: ["web"],
          omitMarketplaceField: true,
        });

        // Snapshot state that must NOT change on hard-error.
        const configPath = configTsPath(project.dir);
        const settingsPath = path.join(project.dir, DIRS.CLAUDE, FILES.SETTINGS_JSON);
        const configBefore = await readTestFile(configPath);
        const settingsBefore = await readTestFile(settingsPath);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          // local source without marketplace.json — the resolution failure point
          source: { sourceDir: localSource.sourceDir, tempDir: localSource.tempDir },
          ...TERMINAL_SIZE.TALL,
        });

        // Add a new skill — newly added skills default to a plugin-intent
        // source (DEFAULT_PUBLIC_SOURCE_NAME / primarySource), never "eject".
        await wizard.build.navigateDown();
        await wizard.build.toggleFocusedSkill();

        const sources = await wizard.build.passThroughAllDomainsGeneric();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirmExpectingExit();

        expect(await result.exitCode).toBe(EXIT_CODES.ERROR);

        const output = result.output;
        expect(output).toContain("marketplace could not be resolved");
        expect(
          output,
          "the refusal names the marketplace it could not resolve, not a source",
        ).not.toMatch(WITHDRAWN_NOUN);
        expect(output).not.toContain("Installed");

        // State integrity: neither config nor settings may mutate on hard-error.
        const configAfter = await readTestFile(configPath);
        const settingsAfter = await readTestFile(settingsPath);
        expect(configAfter).toStrictEqual(configBefore);
        expect(settingsAfter).toStrictEqual(settingsBefore);
      },
    );
  });

  /**
   * Init scenario: user runs `cc init --marketplace <localDir>` where <localDir>
   * has no marketplace.json. Default skill sources carry plugin intent
   * (primarySource / DEFAULT_PUBLIC_SOURCE_NAME). Previously the CLI silently
   * copied the plugin-intended skills as eject copies. After the fix,
   * `handleInstallation` resolves the marketplace through
   * `BaseCommand.requireMarketplaceOrExit`, which hard-errors via `EXIT_CODES.ERROR`.
   *
   * This documents the removal of the old "eject mode fallback" in init.tsx.
   */
  describe("cc init with local source (no marketplace) + default plugin intent", () => {
    let localSource: E2ESource;
    let wizard: InitWizard | undefined;

    beforeAll(async () => {
      await ensureBinaryExists();
      localSource = await createE2ESource();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupFixture(localSource);
    });

    afterEach(async () => {
      await wizard?.destroy();
      wizard = undefined;
    });

    it(
      "should hard-error instead of silently copying plugin skills as eject",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        wizard = await InitWizard.launch({
          source: { sourceDir: localSource.sourceDir, tempDir: localSource.tempDir },
        });
        // Step through the wizard manually so we can confirm without waiting
        // for a success banner that will never arrive.
        const domain = await wizard.stack.selectFirstStack();
        const build = await domain.acceptDefaults();
        const sources = await build.passThroughAllDomains();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("init");
        const result = await confirm.confirmExpectingExit();

        expect(await result.exitCode).toBe(EXIT_CODES.ERROR);

        const output = result.output;
        expect(output).toContain("marketplace could not be resolved");
        expect(
          output,
          "the refusal names the marketplace it could not resolve, not a source",
        ).not.toMatch(WITHDRAWN_NOUN);
        // The old silent fallback emitted the eject-copy line — it must be absent.
        expect(output).not.toContain(STEP_TEXT.SKILLS_COPIED_TO);
      },
    );
  });
});
