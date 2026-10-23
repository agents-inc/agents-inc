import path from "path";
import { realpathSync } from "fs";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { runInitFromOnClaude, runInitFromOnCodex } from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  directoryExists,
  flattenCliOutput,
  readTestFile,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { PROVIDERS, type Provider } from "../../src/cli/consts.js";
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

const INSTALL_WITH = {
  claude: runInitFromOnClaude,
  codex: runInitFromOnCodex,
} as const satisfies Record<Provider, typeof runInitFromOnClaude>;

const SOURCE_FOLDER = {
  claude: DIRS.SOURCE_CLAUDE,
  codex: DIRS.SOURCE_CODEX,
} as const satisfies Record<Provider, string>;

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
      const otherGlobals = PROVIDERS.filter((atHome) => atHome !== provider).map((atHome) =>
        path.join(fakeHome, SOURCE_FOLDER[atHome], FILES.CONFIG_TS),
      );
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
