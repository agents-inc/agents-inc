import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  createTempDir,
  flattenCliOutput,
  isClaudeCLIAvailable,
  readTestFile,
  readTreeSnapshot,
  runCLI,
} from "../helpers/test-utils.js";
import {
  DIRS,
  EXIT_CODES,
  FILES,
  MANIFEST_REFUSAL_BUILDS_IN_ORDER,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * The word `source` withdraws from the user-facing surface, as a whole word. The refusal
 * under test names the marketplace it will not load and the builds that would make it one —
 * one noun for one thing, where it once spelled three. The refusal names a path the fixture
 * chose and this negative runs over the whole message, so `createE2ESource` owes it a
 * directory segment that spells neither noun.
 */
const WITHDRAWN_NOUN = /\bsources?\b/i;

/**
 * Hard-error coverage for plugin-install intent over a marketplace that cannot serve it.
 * Enforces the "never silently substitute eject for plugin" rule from
 * feedback_no_plugin_to_eject_fallback.md.
 *
 * Both scenarios are a local directory with no `.claude-plugin/marketplace.json`. They used to
 * reach the wizard, preselect Plugin rows, and hard-error only after Confirm ("marketplace could
 * not be resolved"). A custom marketplace without a valid manifest is now refused by every
 * command that loads it (owner ruling 2026-10-02), so the same two runs stop at the load — before
 * any wizard, so before any plugin intent exists to substitute — and what is held here is what
 * held before: a non-zero exit, nothing installed or copied, and the config and settings the run
 * found left exactly as it found them. `commands/marketplace-manifest-required` owns the
 * refusal's other commands and states.
 *
 * Without a terminal, as `init-edit-error-guards` runs them: the refusal lands before the
 * wizard mounts, so a run without a PTY can show it, and a build that mounts the wizard instead
 * dies on Ink's raw-mode error — which these assertions read as the missing refusal it is.
 *
 * Scenarios:
 *   - `cc edit` over a project whose config lacks `marketplaceName` AND whose marketplace is a
 *     local directory with no marketplace.json.
 *   - `cc init --marketplace` pointed at a local directory with no marketplace.json.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("plugin install intent: hard-error paths", () => {
  /**
   * Edit scenario: project was built with plugin-sourced skills but config.ts was saved without
   * the `marketplaceName` field (legacy state), and the marketplace it names is a plain local
   * directory with no `.claude-plugin/marketplace.json`. `edit` loads that marketplace before
   * anything else, so the refusal is the load's, and the project state must remain untouched.
   */
  describe("cc edit over a local marketplace with no marketplace.json", () => {
    let fixture: E2EPluginSource;
    let unbuilt: E2ESource;

    beforeAll(async () => {
      // fixture provides plugin-sourced skill IDs used in the seeded config.
      fixture = await createE2EPluginSource();
      // A directory nobody has built — the marketplace the load refuses.
      unbuilt = await createE2ESource({ unbuilt: true });
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await cleanupFixture(fixture);
      await cleanupFixture(unbuilt);
    });

    it(
      "should hard-error and leave config/settings untouched",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          marketplace: unbuilt.sourceDir,
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

        const { exitCode, output } = await CLI.run(["edit"], project);

        const refusal = flattenCliOutput(output);
        expect(
          refusal,
          "a marketplace with no marketplace.json must be refused, naming the builds that write one",
        ).toMatch(MANIFEST_REFUSAL_BUILDS_IN_ORDER);
        expect(exitCode).toBe(EXIT_CODES.ERROR);
        expect(
          refusal,
          "the refusal names the marketplace it will not load, not a source",
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
   * Init scenario: user runs `cc init --marketplace <localDir>` where <localDir> has no
   * marketplace.json. Previously the CLI silently copied the plugin-intended skills as eject
   * copies; then it hard-errored after Confirm through `requireMarketplaceOrExit`. Now the load
   * refuses the directory before the wizard, so nothing is selected, installed or copied.
   *
   * This documents the removal of the old "eject mode fallback" in init.tsx.
   */
  describe("cc init over a local marketplace with no marketplace.json", () => {
    let unbuilt: E2ESource;
    let tempDir: string | undefined;

    beforeAll(async () => {
      unbuilt = await createE2ESource({ unbuilt: true });
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupFixture(unbuilt);
      if (tempDir) await cleanupTempDir(tempDir);
    });

    it(
      "should hard-error instead of silently copying plugin skills as eject",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        tempDir = await createTempDir();
        const projectDir = path.join(tempDir, "project");
        await mkdir(projectDir, { recursive: true });

        const { exitCode, combined } = await runCLI(
          ["init", "--marketplace", unbuilt.sourceDir],
          projectDir,
          { env: { HOME: tempDir } },
        );

        const refusal = flattenCliOutput(combined);
        expect(
          refusal,
          "a marketplace with no marketplace.json must be refused, naming the builds that write one",
        ).toMatch(MANIFEST_REFUSAL_BUILDS_IN_ORDER);
        expect(exitCode).toBe(EXIT_CODES.ERROR);
        expect(
          refusal,
          "the refusal names the marketplace it will not load, not a source",
        ).not.toMatch(WITHDRAWN_NOUN);
        // The old silent fallback emitted the eject-copy line — it must be absent.
        expect(refusal).not.toContain(STEP_TEXT.SKILLS_COPIED_TO);
        expect(await readTreeSnapshot(projectDir), "nothing may be copied anywhere").toStrictEqual(
          {},
        );
      },
    );
  });
});
