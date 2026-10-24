import path from "path";
import { rename } from "fs/promises";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  isClaudeCLIAvailable,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * At a terminal, `list` names each skill as its install recorded it — the `displayName` CLI-963
 * writes on each config.ts entry — though no catalogue the CLI ships lists the fixture's namespaced
 * ids, as `init --from` printed the same two skills a moment earlier.
 *
 * Its control is the same installation under a config.ts written before names were recorded: it
 * draws exactly what 0.173.0 draws, ids, though each copy's metadata.yaml still names it, because
 * one record names every summary and no copy is read for a name. Each screen is pinned whole at
 * `MIDDLE`'s 100 columns, so a line drawn under the last row fails it and the Marketplace line stays
 * the path it names; the sub-agent rows are the subject guard in each. The piped half is
 * `commands/list-prints-paths-beside-recorded-names`.
 *
 * A plugin leaves no copy, and its marketplace folder is moved away before the run, so the name its
 * install recorded is the only thing left that names it. That spec was written after the product
 * already passed it, so it was checked by deleting the plugin's recorded name from the project's
 * config.ts before the run: its row went to the wrapped id.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const BOTH_SCOPES_ID = "ListName1";
const PLUGIN_ID = "ListNamePlugin1";

describe("list at a terminal over skills the built-in catalogue does not list", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      BOTH_SCOPES_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "preloaded" },
          }),
          [E2E_SKILL.hono.id]: buildSeedSkill({
            scope: "project",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "project" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function installBothScopes(): Promise<TestEnvironment> {
    env = await createTestEnvironment();
    const installed = await runInitFrom(
      store,
      BOTH_SCOPES_ID,
      { dir: env.projectDir, globalHome: env.fakeHome },
      E2E_SOURCE.sourceDir,
    );
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    return env;
  }

  /** Runs `list` at the terminal and holds that it wrote nothing at either scope. */
  async function listAtATerminal(installation: TestEnvironment): Promise<string> {
    // Not HOME whole: the project sits inside it.
    const installSurfaces = [
      installation.projectDir,
      path.join(installation.fakeHome, DIRS.CLAUDE),
      path.join(installation.fakeHome, DIRS.SOURCE_ROOT),
    ];
    const before = await Promise.all(installSurfaces.map(readTreeSnapshot));
    expect(
      before.map((snapshot) => Object.keys(snapshot).length > 0),
      "each install surface holds files, or the equality after the run holds for nothing",
    ).toStrictEqual([true, true, true]);

    prompt = new InteractivePrompt(["list"], installation.projectDir, {
      ...TERMINAL_SIZE.MIDDLE,
      env: { HOME: installation.fakeHome },
    });
    expect(await prompt.waitForExit(TIMEOUTS.EXIT), prompt.getOutput()).toBe(EXIT_CODES.SUCCESS);
    expect(
      await Promise.all(installSurfaces.map(readTreeSnapshot)),
      "list reads the installation and writes nothing at either scope",
    ).toStrictEqual(before);
    return prompt.getScreen();
  }

  it(
    "names the project copy and the global copy each by the name its install recorded",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const installation = await installBothScopes();

      const screen = await listAtATerminal(installation);

      expect(
        screen,
        "each row is named as the install recorded it, not by its id, under the marketplace's path",
      ).toBe(
        [
          "",
          " Mode Eject",
          ` Marketplace ${E2E_SOURCE.sourceDir}`,
          "",
          " Skills                                                         │  Agents",
          "                                                                │",
          "  Project                                                       │   Project",
          " • E2E Hono ⏏                                                   │  • api-developer",
          "                                                                │",
          "  Global                                                        │   Global",
          " • E2E React ⏏                                                  │  • web-developer",
        ].join("\n"),
      );
    },
  );

  it(
    "names each copy by its id where the install recorded no name, as 0.173.0 does, though the copy names itself",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const installation = await installBothScopes();
      await writeProjectConfig(
        installation.projectDir,
        buildProjectConfig({
          name: "project",
          marketplace: E2E_SOURCE.sourceDir,
          skills: [
            ...buildSkillConfigs([E2E_SKILL.hono.id], { scope: "project" }),
            ...buildSkillConfigs([E2E_SKILL.react.id], { scope: "global" }),
          ],
          agents: [
            ...buildAgentConfigs([API_DEV], { scope: "project" }),
            ...buildAgentConfigs([WEB_DEV], { scope: "global" }),
          ],
        }),
      );
      const metadataOf = (skillId: string): string => path.join(skillId, FILES.METADATA_YAML);
      expect(
        await readTestFile(
          path.join(skillsPath(installation.projectDir), metadataOf(E2E_SKILL.hono.id)),
        ),
        "the project copy names itself, so an id row means list read no copy",
      ).toContain(`displayName: ${E2E_SKILL.hono.display}\n`);
      expect(
        await readTestFile(
          path.join(skillsPath(installation.fakeHome), metadataOf(E2E_SKILL.react.id)),
        ),
        "the global copy names itself, so an id row means list read no copy",
      ).toContain(`displayName: ${E2E_SKILL.react.display}\n`);

      const screen = await listAtATerminal(installation);

      expect(
        screen,
        "an unrecorded row falls back to the built-in catalogue, then the id, never to its copy",
      ).toBe(
        [
          "",
          " Mode Eject",
          ` Marketplace ${E2E_SOURCE.sourceDir}`,
          "",
          " Skills                                                         │  Agents",
          "                                                                │",
          "  Project                                                       │   Project",
          " • e2e-test-fixture-api-framew                                  │  • api-developer",
          "   ork-hono ⏏                                                   │",
          "                                                                │   Global",
          "  Global                                                        │  • web-developer",
          " • e2e-test-fixture-web-framew                                  │",
          "   ork-react ⏏                                                  │",
        ].join("\n"),
      );
    },
  );

  describe.skipIf(!claudeAvailable)("with a plugin whose marketplace folder has gone", () => {
    let fixture: E2EPluginSource;

    beforeAll(() => {
      store.publish(
        PLUGIN_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              scope: "global",
              assignments: { [WEB_DEV]: "preloaded" },
            }),
            [E2E_SKILL.hono.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [API_DEV]: "preloaded" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "project" } },
        }),
      );
    });

    beforeEach(async () => {
      fixture = await createE2EPluginSource({ owned: true });
    }, TIMEOUTS.SETUP);

    afterEach(async () => {
      await cleanupFixture(fixture);
    });

    async function installWithAPlugin(): Promise<TestEnvironment> {
      env = await createTestEnvironment({ permissions: false });
      const installed = await runInitFrom(
        store,
        PLUGIN_ID,
        { dir: env.projectDir, globalHome: env.fakeHome },
        fixture.sourceDir,
      );
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      await expect({ dir: env.projectDir }).toHavePlugin(
        pluginKeyFor(E2E_SKILL.hono.id, fixture.marketplaceName),
      );
      return env;
    }

    async function moveTheMarketplaceAway(): Promise<void> {
      await rename(fixture.sourceDir, `${fixture.sourceDir}-moved`);
      expect(
        await directoryExists(fixture.sourceDir),
        "the marketplace folder must be gone, or the run could still read the plugin's name from it",
      ).toBe(false);
    }

    it(
      "names a plugin skill from a marketplace the built-in catalogue does not list by the name its install recorded",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const installation = await installWithAPlugin();
        await moveTheMarketplaceAway();

        const screen = await listAtATerminal(installation);

        expect(
          screen,
          "the plugin is named as its install recorded, with no copy and no marketplace left to name it",
        ).toBe(
          [
            "",
            " Mode Mixed",
            ` Marketplace ${fixture.sourceDir}`,
            "",
            " Skills                                                         │  Agents",
            "                                                                │",
            "  Project                                                       │   Project",
            " • E2E Hono                                                     │  • api-developer",
            "                                                                │",
            "  Global                                                        │   Global",
            " • E2E React ⏏                                                  │  • web-developer",
          ].join("\n"),
        );
      },
    );
  });
});
