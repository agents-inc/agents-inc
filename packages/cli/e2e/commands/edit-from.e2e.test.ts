import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import {
  cleanupTempDir,
  createTempDir,
  readTreeSnapshot,
  sourceFolderIn,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  createTestEnvironment,
  readSkillEntries,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import {
  runEditFrom,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * `edit --from <id>` with no TTY to confirm its removals refuses: exit non-zero, nothing on disk
 * moved. The id is fetched first, since only the plan can say whether anything needs confirming;
 * one that changes nothing says so and exits 0. `e2e/interactive/edit-from.e2e.test.ts` is the
 * approving counterpart.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const PUBLISHED_ID = "EditFrom1";
/** Zustand here beside a global skill in another category. */
const UNHIDDEN_ID = "EditFromSame1";
/** Zustand here beside Pinia in the global install: one category, one pick, so Pinia is hidden here. */
const HIDDEN_ID = "EditFromSame2";

function zustandHereBeside(globalSkillId: string) {
  return buildSeedPayload({
    skills: {
      [E2E_SKILL.zustand.id]: buildSeedSkill({
        install: "eject",
        scope: "project",
        assignments: { [WEB_DEV]: "lazy" },
      }),
      [globalSkillId]: buildSeedSkill({
        install: "eject",
        scope: "global",
        assignments: { [API_DEV]: "lazy" },
      }),
    },
    agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { scope: "global" } },
  });
}

/** Not HOME whole: the update check writes a version cache under `~/.cache/` on any run. */
function snapshotBothScopes(env: TestEnvironment): Promise<Record<string, TreeSnapshotEntry>[]> {
  return Promise.all(
    [env.fakeHome, env.projectDir]
      .flatMap((dir) => [sourceFolderIn(dir), path.join(dir, DIRS.CLAUDE)])
      .map(readTreeSnapshot),
  );
}

describe("edit --from <id> without a terminal", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /** A HOME of its own: at the home root a project-scoped configuration is refused first. */
  async function takeInstalledProject(): Promise<{ dir: string; globalHome: string }> {
    const project = await ProjectBuilder.editable({
      marketplace: sourceDir,
      skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
      agents: [WEB_DEV],
      domains: ["web"],
      forkedFrom: true,
    });
    tempDirs.push(path.dirname(project.dir));
    const globalHome = path.join(path.dirname(project.dir), "home");
    await mkdir(globalHome, { recursive: true });
    return { dir: project.dir, globalHome };
  }

  async function takeEmptyFolder(): Promise<string> {
    const tempDir = await createTempDir();
    tempDirs.push(tempDir);
    return tempDir;
  }

  /** Names one of the two installed skills, so the other would be removed. */
  function publishHalfOfIt(id: string): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
  }

  it("refuses, naming the id and the command that installs one headlessly", async () => {
    const project = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);

    const { exitCode, output } = await runEditFrom(store, PUBLISHED_ID, project);

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    const flattened = flattenCliOutput(output);
    expect(flattened).toContain(STEP_TEXT.SHARED_CONFIG_NEEDS_TERMINAL);
    // `init --from` removes nothing and needs no confirm, so it is the way forward for a pipeline.
    expect(flattened).toContain(`init --from ${PUBLISHED_ID}`);
  });

  /**
   * `edit --from` also refuses where nothing is installed, so that is said first, with the command
   * that installs here.
   */
  it("in a folder with nothing installed, says so instead of sending it to a terminal", async () => {
    const emptyDir = await takeEmptyFolder();
    publishHalfOfIt(PUBLISHED_ID);

    const { exitCode, output } = await runEditFrom(store, PUBLISHED_ID, { dir: emptyDir });

    const flattened = flattenCliOutput(output);
    expect(
      flattened,
      "a command suggested here must be one that does not refuse here as well",
    ).not.toContain(`edit --from ${PUBLISHED_ID}`);
    expect(exitCode, flattened).toBe(EXIT_CODES.ERROR);
    expect(flattened).toContain(STEP_TEXT.NO_INSTALLATION);
    expect(flattened, "the command that installs a configuration here").toContain(
      `init --from ${PUBLISHED_ID}`,
    );
    expect(store.requests, "a run that cannot apply anything spends no round trip").toStrictEqual(
      [],
    );
    expect(await readTreeSnapshot(emptyDir)).toStrictEqual({});
  });

  it("asks the store for the id before it refuses, and for nothing else", async () => {
    const project = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);

    await runEditFrom(store, PUBLISHED_ID, project);

    // Whether anything needs confirming is in the payload, so it is fetched, and nothing minted.
    expect(store.requests.map(({ method, url }) => ({ method, url }))).toStrictEqual([
      { method: "GET", url: `/configs/${PUBLISHED_ID}` },
    ]);
  });

  it("leaves the installation byte-identical", async () => {
    const project = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);
    const before = await readTreeSnapshot(project.dir);

    await runEditFrom(store, PUBLISHED_ID, project);

    expect(await readTreeSnapshot(project.dir)).toStrictEqual(before);
  });

  describe("for the configuration already installed", () => {
    /** Installed by `init --from` in a project with a HOME of its own. */
    async function takeProjectInstalledFrom(id: string): Promise<TestEnvironment> {
      const env = await createTestEnvironment();
      tempDirs.push(env.tempDir);
      const installed = await runInitFrom(
        store,
        id,
        { dir: env.projectDir, globalHome: env.fakeHome },
        sourceDir,
      );
      expect(installed.exitCode, installed.output).toBe(EXIT_CODES.SUCCESS);
      return env;
    }

    it("says nothing changed and exits 0, writing nothing", async () => {
      store.publish(UNHIDDEN_ID, zustandHereBeside(E2E_SKILL.vitest.id));
      const env = await takeProjectInstalledFrom(UNHIDDEN_ID);
      const before = await snapshotBothScopes(env);

      const { exitCode, output } = await runEditFrom(store, UNHIDDEN_ID, {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.EDIT_UNCHANGED);
      expect(await snapshotBothScopes(env)).toStrictEqual(before);
    });

    it("says nothing changed and exits 0 where its own skill hides a global one in their one-pick category, writing nothing", async () => {
      store.publish(HIDDEN_ID, zustandHereBeside(E2E_SKILL.pinia.id));
      const env = await takeProjectInstalledFrom(HIDDEN_ID);
      // Subject guard: the project's Zustand takes the category, so the global Pinia is hidden here.
      expect(await readSkillEntries(env.projectDir, E2E_SKILL.pinia.id)).toStrictEqual(
        buildSkillConfigs([E2E_SKILL.pinia.id], {
          scope: "global",
          origin: "eject",
          displayName: E2E_SKILL.pinia.display,
          excluded: true,
        }),
      );
      const before = await snapshotBothScopes(env);

      const { exitCode, output } = await runEditFrom(store, HIDDEN_ID, {
        dir: env.projectDir,
        globalHome: env.fakeHome,
      });

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.EDIT_UNCHANGED);
      expect(await snapshotBothScopes(env)).toStrictEqual(before);
    });
  });

  /**
   * `--ui` opens whatever `--from` names (owner ruling 2026-08-24); `commands/edit-ui-from` covers
   * the pairing, and this adds that the store is not touched.
   */
  it("opens the shared id without spending anything at the store", async () => {
    const project = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);

    const { exitCode, output } = await runEditFrom(store, PUBLISHED_ID, project, ["--ui"]);

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(output)).toContain(`?fromId=${PUBLISHED_ID}`);
    // Given both flags the id already exists, so neither the mint nor the fetch is needed.
    expect(store.requests).toStrictEqual([]);
  });
});
