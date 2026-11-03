import path from "path";
import { writeFile } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CLIResult } from "../fixtures/cli.js";
import { codexGlobalSkillsDir, INSTALL_WITH, SOURCE_FOLDER } from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigRequest,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  compactCliOutput,
  flattenCliOutput,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import type { Provider } from "../../src/cli/consts.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `init --from` naming no provider, in a fresh project under a home whose global config.ts does
 * not load. The project installs onto Claude, so a broken Claude global is refused before the
 * shared configuration is fetched, while a broken Codex global is another provider's and is let
 * through.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const AT_HOME = E2E_SKILL.hono.id;
const IN_THE_PROJECT = E2E_SKILL.react.id;

const HOME_SEED_ID = "BrkHome1";
const PROJECT_SEED_ID = "BrkProj1";

type FromABrokenHome = {
  env: TestEnvironment;
  brokenConfig: string;
  run: CLIResult;
  asked: SeedConfigRequest[];
  homeBefore: Record<string, TreeSnapshotEntry>;
  homeAfter: Record<string, TreeSnapshotEntry>;
};

function requestLines(requests: readonly SeedConfigRequest[]): string[] {
  return requests.map(({ method, url }) => `${method} ${url}`);
}

describe("init --from in a fresh project under a home whose global config.ts cannot be loaded", () => {
  let store: SeedConfigStore;
  const envs: TestEnvironment[] = [];

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      HOME_SEED_ID,
      buildSeedPayload({
        skills: {
          [AT_HOME]: buildSeedSkill({ scope: "global", assignments: { [API_DEV]: "preloaded" } }),
        },
        agents: { [API_DEV]: { scope: "global" } },
      }),
    );
    store.publish(
      PROJECT_SEED_ID,
      buildSeedPayload({
        skills: {
          [IN_THE_PROJECT]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await Promise.all(envs.map((env) => cleanupTempDir(env.tempDir)));
  });

  async function initFromUnderABrokenHome(home: Provider): Promise<FromABrokenHome> {
    const env = await createTestEnvironment({ permissions: false });
    envs.push(env);

    const atHome = await INSTALL_WITH[home](
      store,
      HOME_SEED_ID,
      { dir: env.fakeHome, globalHome: env.fakeHome },
      E2E_SOURCE.sourceDir,
    );
    expect(atHome.exitCode, flattenCliOutput(atHome.output)).toBe(EXIT_CODES.SUCCESS);
    const brokenConfig = path.join(env.fakeHome, SOURCE_FOLDER[home], FILES.CONFIG_TS);
    await writeFile(brokenConfig, renderUnparseableConfigTs());

    const homeBefore = await readTreeSnapshot(env.fakeHome);
    const askedBefore = store.requests.length;
    const run = await runInitFrom(
      store,
      PROJECT_SEED_ID,
      { dir: env.projectDir, globalHome: env.fakeHome },
      E2E_SOURCE.sourceDir,
    );

    return {
      env,
      brokenConfig,
      run,
      asked: store.requests.slice(askedBefore),
      homeBefore,
      homeAfter: await readTreeSnapshot(env.fakeHome),
    };
  }

  describe("whose broken config is Claude's, the provider the project installs onto", () => {
    let refused: FromABrokenHome;

    beforeAll(async () => {
      refused = await initFromUnderABrokenHome("claude");
    }, TIMEOUTS.LIFECYCLE);

    it("refuses, naming the global config by its path", () => {
      const { run, brokenConfig, env } = refused;
      expect(run.exitCode, flattenCliOutput(run.output)).toBe(EXIT_CODES.ERROR);
      const compacted = compactCliOutput(run.output);
      expect(compacted).toContain(
        compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_GLOBAL} '${brokenConfig}'`),
      );
      expect(flattenCliOutput(run.output)).toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
      expect(compacted).toContain(
        compactCliOutput(`${STEP_TEXT.CONFIG_UNREADABLE_RECREATE_FROM} '${env.fakeHome}'`),
      );
    });

    it("refuses before it fetches the shared configuration", () => {
      expect(requestLines(refused.asked)).toStrictEqual([]);
    });

    it("writes nothing, in the project or the home", async () => {
      const { env, brokenConfig, homeBefore, homeAfter } = refused;
      expect(Object.keys(homeBefore), "the snapshot holds the home's installation").toContain(
        path.relative(env.fakeHome, brokenConfig),
      );
      expect(homeAfter, "the project sits inside the home, so this covers both").toStrictEqual(
        homeBefore,
      );
      expect(await listFiles(env.projectDir)).toStrictEqual([]);
    });
  });

  describe("whose broken config is Codex's, another provider's", () => {
    let allowed: FromABrokenHome;

    beforeAll(async () => {
      allowed = await initFromUnderABrokenHome("codex");
    }, TIMEOUTS.LIFECYCLE);

    it("installs the project onto Claude", async () => {
      const { run, env } = allowed;
      expect(run.exitCode, flattenCliOutput(run.output)).toBe(EXIT_CODES.SUCCESS);
      expect(run.output).toContain(STEP_TEXT.INIT_SUCCESS);
      expect(run.output).not.toContain(STEP_TEXT.CONFIG_LOAD_FAILED);

      expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([IN_THE_PROJECT]);
      expect(await listFiles(path.join(env.projectDir, SOURCE_FOLDER.claude))).toContain(
        FILES.CONFIG_TS,
      );
      expect((await loadConfigOrFail(env.projectDir)).skills.map(({ id }) => id)).toStrictEqual([
        IN_THE_PROJECT,
      ]);
    });

    it("fetches the shared configuration it installs", () => {
      expect(requestLines(allowed.asked)).toStrictEqual([`GET /configs/${PROJECT_SEED_ID}`]);
    });

    it("leaves the Codex installation, broken config and all, as it was", async () => {
      const { env, brokenConfig } = allowed;
      expect(await readTestFile(brokenConfig)).toBe(renderUnparseableConfigTs());
      expect(await listFiles(codexGlobalSkillsDir(env.fakeHome))).toStrictEqual([AT_HOME]);
    });
  });
});
