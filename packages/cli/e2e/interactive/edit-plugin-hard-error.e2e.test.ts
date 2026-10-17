import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_AGENTS, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  configTsPath,
  flattenCliOutput,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  DIRS,
  EXIT_CODES,
  FILES,
  MANIFEST_REFUSAL_BUILDS_IN_ORDER,
  TERMINAL_SIZE,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import "../matchers/setup.js";

/**
 * The refusal names the marketplace and its builds; the word `source` must not appear, so
 * `createE2ESource` owes a directory segment spelling neither noun.
 */
const WITHDRAWN_NOUN = /\bsources?\b/i;

/**
 * Plugin intent over a local marketplace with no `.claude-plugin/marketplace.json`: `edit --from`
 * refuses at the load, exits non-zero, installs nothing and leaves config and settings as found; it
 * never substitutes eject for plugin. At a terminal, since without one `edit --from` refuses first.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const APPLIED_ID = "PlugHard1";

describe.skipIf(!claudeAvailable)("plugin install intent: hard-error paths", () => {
  /**
   * A legacy config without `marketplaceName`, naming a plain local directory: the refusal is the
   * load's.
   */
  describe("edit --from over a local marketplace with no marketplace.json", () => {
    let fixture: E2EPluginSource;
    let unbuilt: E2ESource;
    let store: SeedConfigStore;
    let prompt: InteractivePrompt | undefined;

    beforeAll(async () => {
      // Supplies the plugin-sourced skill ids the seeded config uses.
      fixture = await createE2EPluginSource();
      unbuilt = await createE2ESource({ unbuilt: true });
      store = await startSeedConfigStore();
      store.publish(
        APPLIED_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: { on: true, scope: "project" } },
        }),
      );
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await store.close();
      await cleanupFixture(fixture);
      await cleanupFixture(unbuilt);
    });

    afterEach(async () => {
      await prompt?.destroy();
      prompt = undefined;
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

        const configPath = configTsPath(project.dir);
        const settingsPath = path.join(project.dir, DIRS.CLAUDE, FILES.SETTINGS_JSON);
        const configBefore = await readTestFile(configPath);
        const settingsBefore = await readTestFile(settingsPath);

        prompt = new InteractivePrompt(["edit", "--from", APPLIED_ID], project.dir, {
          ...TERMINAL_SIZE.TALL,
          env: { AGENTS_INC_API_URL: store.url },
        });
        const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
        const output = prompt.getOutput();

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

        const configAfter = await readTestFile(configPath);
        const settingsAfter = await readTestFile(settingsPath);
        expect(configAfter).toStrictEqual(configBefore);
        expect(settingsAfter).toStrictEqual(settingsBefore);
      },
    );
  });
});
