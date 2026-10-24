import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
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
  configTsPath,
  isClaudeCLIAvailable,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  EJECT_SOURCE_NAME,
  EXIT_CODES,
  FILES,
  LOCAL_COPY_MARK,
  REMOVED_MARKER,
  TIMEOUTS,
  panelRow,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * The fixture's namespaced ids are in no catalogue the CLI ships, so a panel row reads as a display
 * name only if `uninstall` reads one — a removed copy's from its metadata.yaml; a kept global
 * entry's and a plugin's from the name the install recorded on its config.ts entry — as
 * `init --from` and `edit --from` print the same skills. In each
 * frame the project copy being removed is the allowed case, named by its own metadata.yaml; the
 * whole-panel assertion, last, is the one an id row reddens. Its lines are this run at the 80
 * columns a pipe measures, and end on the line after the panel.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const KEPT_GLOBAL_ID = "KeptGlob1";
const PLUGIN_REMOVED_ID = "PluginRm1";

describe("uninstall --yes names a global copy it keeps as its install recorded it", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      KEPT_GLOBAL_ID,
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
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "names the global copy it keeps by the name its install recorded, beside the project copy it removes",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const project = { dir: env.projectDir, globalHome: env.fakeHome };
      const installed = await runInitFrom(store, KEPT_GLOBAL_ID, project, E2E_SOURCE.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

      const keptCopyMetadata = path.join(E2E_SKILL.react.id, FILES.METADATA_YAML);
      expect(
        (await loadConfigOrFail(env.fakeHome)).skills,
        "the global entry the project keeps must record the name its row is held to",
      ).toStrictEqual(
        buildSkillConfigs([E2E_SKILL.react.id], {
          scope: "global",
          origin: EJECT_SOURCE_NAME,
          displayName: E2E_SKILL.react.display,
        }),
      );
      const globalCopiesBefore = await readTreeSnapshot(skillsPath(env.fakeHome));
      expect(Object.keys(globalCopiesBefore)).toContain(keptCopyMetadata);
      const globalConfigBefore = await loadConfigOrFail(env.fakeHome);

      const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], project);

      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
      expect(
        stdout,
        "a copy in the scope being uninstalled is named by its own metadata.yaml",
      ).toContain(panelRow(REMOVED_MARKER, `${E2E_SKILL.hono.display} ${LOCAL_COPY_MARK}`));
      await expectCleanUninstall(env.projectDir, { removeConfig: true });
      expect(
        await readTreeSnapshot(skillsPath(env.fakeHome)),
        "a project uninstall keeps every global copy byte for byte",
      ).toStrictEqual(globalCopiesBefore);
      expect(
        await loadConfigOrFail(env.fakeHome),
        "a project uninstall deregisters the project and changes nothing else in the global config",
      ).toStrictEqual({ ...globalConfigBefore, projects: [] });
      expect(
        stdout,
        "the global copy the project uninstall keeps is named by the name its install recorded, not by its id",
      ).toContain(
        [
          "│  Skills                                         │  Agents                    │",
          "│                                                 │                            │",
          "│   Project                                       │   Project                  │",
          "│  - E2E Hono ⏏                                   │  - api-developer           │",
          "│                                                 │                            │",
          "│   Global                                        │   Global                   │",
          "│  • E2E React ⏏                                  │  • web-developer           │",
          "└──────────────────────────────────────────────────────────────────────────────┘",
          `${REMOVED_MARKER} ${configTsPath(env.projectDir)}`,
          "",
        ].join("\n"),
      );
    },
  );
});

/** Plugin mode needs the real Claude binary and the built plugin marketplace. */
describe.skipIf(!claudeAvailable)(
  "uninstall --yes names a plugin skill it removes by its display name",
  () => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let env: TestEnvironment | undefined;

    beforeAll(async () => {
      fixture = await createE2EPluginSource();
      store = await startSeedConfigStore();
      store.publish(
        PLUGIN_REMOVED_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              scope: "project",
              assignments: { [WEB_DEV]: "preloaded" },
            }),
            [E2E_SKILL.hono.id]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [API_DEV]: "preloaded" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: "project" } },
        }),
      );
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await store.close();
      await cleanupFixture(fixture);
    });

    afterEach(async () => {
      if (env) await cleanupTempDir(env.tempDir);
      env = undefined;
    });

    it(
      "names the plugin skill it removes by its display name, beside the copy it removes",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        env = await createTestEnvironment({ permissions: false });
        const project = { dir: env.projectDir, globalHome: env.fakeHome };
        const honoRef = pluginKeyFor(E2E_SKILL.hono.id, fixture.marketplaceName);
        const installed = await runInitFrom(store, PLUGIN_REMOVED_ID, project, fixture.sourceDir);
        expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
        await expect({ dir: env.projectDir }).toHavePlugin(honoRef);

        const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], project);

        expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
        expect(
          stdout,
          "a copy in the scope being uninstalled is named by its own metadata.yaml",
        ).toContain(panelRow(REMOVED_MARKER, `${E2E_SKILL.react.display} ${LOCAL_COPY_MARK}`));
        await expect({ dir: env.projectDir }).toHaveNoPlugins();
        await expectCleanUninstall(env.projectDir, { removeConfig: true });
        // Copies first, then plugins, two to a line; a plugin carries no local-copy mark.
        expect(
          stdout,
          "the plugin skill the project uninstall removes is named by its display name, not by its id",
        ).toContain(
          [
            "│  Skills                                         │  Agents                    │",
            "│                                                 │                            │",
            "│   Project                                       │   Project                  │",
            "│  - E2E React ⏏           - E2E Hono             │  - api-developer           │",
            "│                                                 │  - web-developer           │",
            "└──────────────────────────────────────────────────────────────────────────────┘",
            `${REMOVED_MARKER} ${configTsPath(env.projectDir)}`,
            "",
          ].join("\n"),
        );
      },
    );
  },
);
