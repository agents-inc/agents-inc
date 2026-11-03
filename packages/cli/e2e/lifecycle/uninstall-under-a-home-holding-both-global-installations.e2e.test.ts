import path from "path";
import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { blankGlobalConfig } from "@workspace/compile/global-config";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import { configIn, INSTALL_WITH, SOURCE_FOLDER } from "../fixtures/codex-install.js";
import {
  createTestEnvironment,
  homeAndProjectTrees,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  directoryExists,
  flattenCliOutput,
  otherThan,
  readTestFile,
  writeProjectConfigIn,
} from "../helpers/test-utils.js";
import {
  DIRS,
  EXIT_CODES,
  FILES,
  REMOVED_MARKER,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import { PROVIDERS, type Provider } from "../../src/cli/consts.js";
import type { ProjectConfig } from "../../src/cli/types/index.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/project-config.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A project is registered with its own provider's global only, so uninstalling it takes it off that
 * one and leaves the other untouched. Claude is the control, being also the provider a home holding
 * both would otherwise be read as.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const GLOBAL_SEED_ID = "BothUnGl";
const PROJECT_SEED_ID = "BothUnPj";

const PROJECT_ONLY_SEED_ID = "HomeLsPj";

const HAND_WRITTEN_DESCRIPTION = "The sub-agents on this machine";

// Written out, not derived: a broken `otherThan` would empty every other-provider check.
const OTHER_PROVIDERS = {
  claude: ["codex"],
  codex: ["claude"],
} as const satisfies Record<Provider, readonly Provider[]>;

describe("uninstall in a project under a home holding a Claude and a Codex global installation", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it.each(PROVIDERS)(
    "takes the %s project off its own provider's global and leaves the other global untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async (provider) => {
      env = await createTestEnvironment({ permissions: false });
      const { fakeHome, projectDir } = env;
      const home = { dir: fakeHome, globalHome: fakeHome };
      const project = { dir: projectDir, globalHome: fakeHome };
      store.publish(
        GLOBAL_SEED_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "eject",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "global" } },
        }),
      );
      store.publish(
        PROJECT_SEED_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.hono.id]: buildSeedSkill({
              install: "eject",
              scope: "project",
              assignments: { [API_DEV]: "lazy" },
            }),
          },
          agents: { [API_DEV]: { scope: "project" } },
        }),
      );
      for (const atHome of PROVIDERS) {
        const installed = await INSTALL_WITH[atHome](
          store,
          GLOBAL_SEED_ID,
          home,
          E2E_SOURCE.sourceDir,
        );
        expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
      }
      const installed = await INSTALL_WITH[provider](
        store,
        PROJECT_SEED_ID,
        project,
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
      expect(
        otherThan(provider),
        "subject guard: the other global is the other provider's",
      ).toStrictEqual(OTHER_PROVIDERS[provider]);
      const otherGlobals = otherThan(provider).map((other) => configIn(fakeHome, other));
      const otherGlobalsBefore = await Promise.all(otherGlobals.map(readTestFile));
      expect(
        (await loadProjectConfigFromDir(fakeHome, provider))?.config.projects,
        "subject guard: init registered the project with its own provider's global",
      ).toStrictEqual([realpathSync(project.dir)]);

      const { exitCode, output } = await CLI.run(["uninstall", "--yes"], project);

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
      expect(await directoryExists(path.join(project.dir, SOURCE_FOLDER[provider]))).toBe(false);
      expect(
        (await loadProjectConfigFromDir(fakeHome, provider))?.config.projects,
        "the project is off its own provider's global",
      ).toStrictEqual([]);
      expect(
        await Promise.all(otherGlobals.map(readTestFile)),
        "the other global is untouched",
      ).toStrictEqual(otherGlobalsBefore);
    },
  );
});

/** A project's first install makes the home config it registers the project in. */
describe("uninstall and the home config a project's install made", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      PROJECT_ONLY_SEED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function freshProject(): Promise<{
    on: TestEnvironment;
    project: Required<ProjectHandle>;
  }> {
    env = await createTestEnvironment({ permissions: false });
    return { on: env, project: { dir: env.projectDir, globalHome: env.fakeHome } };
  }

  async function succeeded(run: Promise<CLIResult>): Promise<CLIResult> {
    const result = await run;
    expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
    return result;
  }

  function installInTheProject(provider: Provider, project: ProjectHandle): Promise<CLIResult> {
    return succeeded(
      INSTALL_WITH[provider](store, PROJECT_ONLY_SEED_ID, project, E2E_SOURCE.sourceDir),
    );
  }

  function uninstallIn(project: ProjectHandle): Promise<CLIResult> {
    return succeeded(CLI.run(["uninstall", "--yes"], project));
  }

  async function homeConfig(home: string, provider: Provider): Promise<ProjectConfig> {
    const loaded = await loadProjectConfigFromDir(home, provider);
    if (!loaded) throw new Error(`the ${provider} home config must exist at ${home}`);
    return loaded.config;
  }

  function homeTypes(home: string, provider: Provider): Promise<string> {
    return readTestFile(path.join(home, SOURCE_FOLDER[provider], FILES.CONFIG_TYPES_TS));
  }

  it.each(PROVIDERS)(
    "after a refused install, takes away the %s home config once it lists nothing, so the same install again says and writes what the first did",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async (provider) => {
      const { on, project } = await freshProject();
      const first = await installInTheProject(provider, project);
      expect(
        await homeConfig(project.globalHome, provider),
        "subject guard: the install made the home config, listing only this project",
      ).toStrictEqual({ ...blankGlobalConfig(), projects: [realpathSync(project.dir)] });
      const installed = await homeAndProjectTrees(on);
      const refused = await INSTALL_WITH[provider](
        store,
        PROJECT_ONLY_SEED_ID,
        project,
        E2E_SOURCE.sourceDir,
      );
      expect(refused.exitCode, refused.output).toBe(EXIT_CODES.ERROR);
      expect(refused.output).toContain(STEP_TEXT.SHARED_CONFIG_EXISTING_INSTALL);

      const { output } = await uninstallIn(project);

      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
      expect(
        await directoryExists(path.join(project.globalHome, DIRS.SOURCE_ROOT)),
        "the home config listed nothing once the project was off it, so it and the folders it emptied are gone",
      ).toBe(false);
      expect(output, "subject guard: uninstall names a file it removes by its path").toContain(
        `${REMOVED_MARKER} ${configIn(project.dir, provider)}`,
      );
      expect(output).not.toContain(path.join(project.globalHome, DIRS.SOURCE_ROOT));
      expect(output).not.toContain(path.join(realpathSync(project.globalHome), DIRS.SOURCE_ROOT));

      const again = await installInTheProject(provider, project);

      expect(again.output).toContain(STEP_TEXT.INIT_SUCCESS);
      expect(again.output).not.toContain(STEP_TEXT.INIT_MERGED_WITH_EXISTING_CONFIG);
      expect(again.output, "the same install again says what the first said").toBe(first.output);
      expect(
        await homeAndProjectTrees(on),
        "the same install again writes what the first wrote, in the home and the project",
      ).toStrictEqual(installed);
    },
  );

  it.each(PROVIDERS)(
    "keeps the %s home config while it lists another project, taking only this one off",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async (provider) => {
      const { on, project } = await freshProject();
      const neighbour = { dir: path.join(on.tempDir, "neighbour"), globalHome: project.globalHome };
      await mkdir(neighbour.dir, { recursive: true });
      await installInTheProject(provider, project);
      await installInTheProject(provider, neighbour);
      const configBefore = await homeConfig(project.globalHome, provider);
      expect(configBefore.projects, "subject guard: both projects are registered").toStrictEqual([
        realpathSync(project.dir),
        realpathSync(neighbour.dir),
      ]);
      const typesBefore = await homeTypes(project.globalHome, provider);

      await uninstallIn(project);

      expect(await homeConfig(project.globalHome, provider)).toStrictEqual({
        ...configBefore,
        projects: [realpathSync(neighbour.dir)],
      });
      expect(await homeTypes(project.globalHome, provider)).toBe(typesBefore);

      const again = await installInTheProject(provider, project);

      expect(
        again.output,
        "a home config still listing something is merged into, and the reinstall says so",
      ).toContain(
        `${STEP_TEXT.INIT_MERGED_WITH_EXISTING_CONFIG} ${configIn(project.globalHome, provider)}`,
      );
    },
  );

  it.each(PROVIDERS)(
    "keeps the %s home config holding a description its user wrote, taking only this project off",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async (provider) => {
      const { project } = await freshProject();
      await installInTheProject(provider, project);
      await writeProjectConfigIn(project.globalHome, SOURCE_FOLDER[provider], {
        ...(await homeConfig(project.globalHome, provider)),
        description: HAND_WRITTEN_DESCRIPTION,
      });
      const configBefore = await homeConfig(project.globalHome, provider);
      expect(configBefore.description).toBe(HAND_WRITTEN_DESCRIPTION);
      const typesBefore = await homeTypes(project.globalHome, provider);

      await uninstallIn(project);

      expect(await homeConfig(project.globalHome, provider)).toStrictEqual({
        ...configBefore,
        projects: [],
      });
      expect(await homeTypes(project.globalHome, provider)).toBe(typesBefore);
    },
  );
});
