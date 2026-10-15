import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  loadConfigOrFail,
} from "../helpers/test-utils.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `init --from` registers each project's realpath in the global config's `projects` array via
 * `registerProjectPath`. Two projects under the same HOME must both be registered, each exactly
 * once, with neither overwriting the other.
 *
 * The global HOME install itself is NOT self-registered — only project-context installs append to
 * `projects`. Each project install carries a project-scoped skill and sub-agent, so it writes a
 * project config of its own beside the global one.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const GLOBAL_ID = "Regist01";
const PROJECT_ID = "Regist02";

describe("init --from registers each project exactly once in the global projects array", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let tempDir: string;
  let fakeHome: string;
  let project1: string;
  let project2: string;

  let projectsAfterGlobalInit: string[] | undefined;
  let projectsAfterFirst: string[] | undefined;
  let projectsAfterSecond: string[] | undefined;
  let globalExit: number;
  let firstExit: number;
  let secondExit: number;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
    store.publish(
      GLOBAL_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { on: true, scope: "global" } },
      }),
    );
    store.publish(
      PROJECT_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.vitest.id]: buildSeedSkill({
            scope: "project",
            assignments: { [API_DEV]: "lazy" },
          }),
        },
        agents: { [API_DEV]: { on: true, scope: "project" } },
      }),
    );

    tempDir = await createTempDir();
    fakeHome = path.join(tempDir, "home");
    project1 = path.join(fakeHome, "project-1");
    project2 = path.join(fakeHome, "project-2");
    for (const dir of [fakeHome, project1, project2]) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    // Phase A: the global install at HOME.
    const globalRes = await runInitFrom(store, GLOBAL_ID, { dir: fakeHome }, source.sourceDir);
    globalExit = globalRes.exitCode;
    projectsAfterGlobalInit = (await loadConfigOrFail(fakeHome)).projects;

    // Phases B and C: one project install each, under the same HOME.
    const firstRes = await runInitFrom(
      store,
      PROJECT_ID,
      { dir: project1, globalHome: fakeHome },
      source.sourceDir,
    );
    firstExit = firstRes.exitCode;
    projectsAfterFirst = (await loadConfigOrFail(fakeHome)).projects;

    const secondRes = await runInitFrom(
      store,
      PROJECT_ID,
      { dir: project2, globalHome: fakeHome },
      source.sourceDir,
    );
    secondExit = secondRes.exitCode;
    projectsAfterSecond = (await loadConfigOrFail(fakeHome)).projects;
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("all three installs complete successfully", () => {
    expect(globalExit).toBe(EXIT_CODES.SUCCESS);
    expect(firstExit).toBe(EXIT_CODES.SUCCESS);
    expect(secondExit).toBe(EXIT_CODES.SUCCESS);
  });

  it("does not self-register the global HOME install", () => {
    // `toBeUndefined`, not `?? []` against `[]`. The fallback made the two states
    // indistinguishable, and they are not the same claim: a global install writes no
    // `projects` KEY at all, where `[]` would mean it wrote one and left it empty.
    expect(projectsAfterGlobalInit).toBeUndefined();
  });

  it("registers the first project exactly once", () => {
    expect(projectsAfterFirst).toStrictEqual([realpathSync(project1)]);
  });

  it("appends the second project without dropping or duplicating the first", () => {
    expect(projectsAfterSecond).toStrictEqual([realpathSync(project1), realpathSync(project2)]);
  });
});
