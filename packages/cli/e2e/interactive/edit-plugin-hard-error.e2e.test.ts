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
 * The marketplace is a local directory with no `.claude-plugin/marketplace.json`. A custom
 * marketplace without a valid manifest is refused by every command that loads it (owner ruling
 * 2026-10-02), so `edit --from` stops at the load — before any plugin intent exists to substitute
 * — and what is held here is a non-zero exit, nothing installed, and the config and settings the
 * run found left exactly as it found them. `commands/marketplace-manifest-required` owns the
 * refusal's other commands and states, `init --from` among them.
 *
 * At a terminal, because `edit --from` refuses to apply where nobody can confirm it, and that
 * refusal would land before the load this spec is about.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const APPLIED_ID = "PlugHard1";

describe.skipIf(!claudeAvailable)("plugin install intent: hard-error paths", () => {
  /**
   * Project was built with plugin-sourced skills but config.ts was saved without the
   * `marketplaceName` field (legacy state), and the marketplace it names is a plain local
   * directory with no `.claude-plugin/marketplace.json`. `edit --from` loads that marketplace
   * before it plans anything, so the refusal is the load's, and the project state must remain
   * untouched.
   */
  describe("edit --from over a local marketplace with no marketplace.json", () => {
    let fixture: E2EPluginSource;
    let unbuilt: E2ESource;
    let store: SeedConfigStore;
    let prompt: InteractivePrompt | undefined;

    beforeAll(async () => {
      // fixture provides plugin-sourced skill IDs used in the seeded config.
      fixture = await createE2EPluginSource();
      // A directory nobody has built — the marketplace the load refuses.
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

        // Snapshot state that must NOT change on hard-error.
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

        // State integrity: neither config nor settings may mutate on hard-error.
        const configAfter = await readTestFile(configPath);
        const settingsAfter = await readTestFile(settingsPath);
        expect(configAfter).toStrictEqual(configBefore);
        expect(settingsAfter).toStrictEqual(settingsBefore);
      },
    );
  });
});
