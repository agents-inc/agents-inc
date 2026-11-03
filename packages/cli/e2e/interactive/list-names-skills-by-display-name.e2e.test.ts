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
  compactCliOutput,
  directoryExists,
  isClaudeCLIAvailable,
  matchedAsWritten,
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
 * Each screen is pinned whole at its width, so a line drawn under the last row fails it; the
 * sub-agent rows are the subject guard in each.
 *
 * A plugin leaves no copy, and its marketplace folder is moved away before the run, so the name its
 * install recorded is the only thing left that names it.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const BOTH_SCOPES_ID = "ListName1";
const PLUGIN_ID = "ListNamePlugin1";

/** Its first line fills its half at 80 columns. */
const FILLS_ITS_FIRST_LINE_AT_80 = "Acme React Component Patterns For Teams";
const FILLS_NO_LINE_AT_80 = "Acme Platform Release Notes Checklist For Every Squad";

/** The rows as drawn; the head compacted, as a Marketplace path that outruns its line wraps. */
function expectListScreen(
  screen: string,
  head: readonly string[],
  rows: readonly string[],
  message: string,
): void {
  expect(compactCliOutput(screen), message).toBe(
    compactCliOutput(["", ...head, "", ...rows].join("\n")),
  );
  expect(screen, message).toMatch(new RegExp(`\\n${matchedAsWritten(rows.join("\n"))}$`));
}

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
  async function listAtATerminal(
    installation: TestEnvironment,
    size: { cols: number; rows: number },
  ): Promise<string> {
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
      ...size,
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

      const screen = await listAtATerminal(installation, TERMINAL_SIZE.MIDDLE);

      expectListScreen(
        screen,
        [" Mode Eject", ` Marketplace ${E2E_SOURCE.sourceDir}`],
        [
          " Skills                                                         │  Agents",
          "                                                                │",
          "  Project                                                       │   Project",
          " • E2E Hono ⏏                                                   │  • api-developer",
          "                                                                │",
          "  Global                                                        │   Global",
          " • E2E React ⏏                                                  │  • web-developer",
        ],
        "each row is named as the install recorded it, not by its id, under the marketplace's path",
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

      const screen = await listAtATerminal(installation, TERMINAL_SIZE.MIDDLE);

      expectListScreen(
        screen,
        [" Mode Eject", ` Marketplace ${E2E_SOURCE.sourceDir}`],
        [
          " Skills                                                         │  Agents",
          "                                                                │",
          "  Project                                                       │   Project",
          " • e2e-test-fixture-api-framew                                  │  • api-developer",
          "   ork-hono ⏏                                                   │",
          "                                                                │   Global",
          "  Global                                                        │  • web-developer",
          " • e2e-test-fixture-web-framew                                  │",
          "   ork-react ⏏                                                  │",
        ],
        "an unrecorded row falls back to the built-in catalogue, then the id, never to its copy",
      );
    },
  );

  it(
    "keeps the rest of a recorded name under its first letter and ⏏ after its last where its first line fills its half at 80 columns",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const installation = await installBothScopes();
      await writeProjectConfig(
        installation.projectDir,
        buildProjectConfig({
          name: "project",
          marketplace: E2E_SOURCE.sourceDir,
          skills: [
            ...buildSkillConfigs([E2E_SKILL.hono.id], {
              scope: "project",
              displayName: FILLS_ITS_FIRST_LINE_AT_80,
            }),
            ...buildSkillConfigs([E2E_SKILL.react.id], {
              scope: "global",
              displayName: FILLS_NO_LINE_AT_80,
            }),
          ],
          agents: [
            ...buildAgentConfigs([API_DEV], { scope: "project" }),
            ...buildAgentConfigs([WEB_DEV], { scope: "global" }),
          ],
        }),
      );

      const screen = await listAtATerminal(installation, TERMINAL_SIZE.NARROWEST);

      expectListScreen(
        screen,
        [" Mode Eject", ` Marketplace ${E2E_SOURCE.sourceDir}`],
        [
          " Skills                                            │  Agents",
          "                                                   │",
          "  Project                                          │   Project",
          " • Acme React Component                            │  • api-developer",
          "   Patterns For Teams ⏏                            │",
          "                                                   │   Global",
          "  Global                                           │  • web-developer",
          " • Acme Platform                                   │",
          "   Release Notes                                   │",
          "   Checklist For Every                             │",
          "   Squad ⏏                                         │",
        ],
        "a name whose first line fills its half wraps under its first letter, ⏏ after its last, as one that fills none does",
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

        const screen = await listAtATerminal(installation, TERMINAL_SIZE.MIDDLE);

        expectListScreen(
          screen,
          [" Mode Mixed", ` Marketplace ${fixture.sourceDir}`],
          [
            " Skills                                                         │  Agents",
            "                                                                │",
            "  Project                                                       │   Project",
            " • E2E Hono                                                     │  • api-developer",
            "                                                                │",
            "  Global                                                        │   Global",
            " • E2E React ⏏                                                  │  • web-developer",
          ],
          "the plugin is named as its install recorded, with no copy and no marketplace left to name it",
        );
      },
    );
  });
});
