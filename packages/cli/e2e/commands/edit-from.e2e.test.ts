import path from "path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import { cleanupTempDir, createTempDir, readTreeSnapshot } from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  runEditFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `edit --from <id>` with no TTY to confirm its removals refuses: exit non-zero, nothing fetched,
 * nothing on disk moved. `e2e/interactive/edit-from.e2e.test.ts` is the approving counterpart.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const PUBLISHED_ID = "EditFrom1";

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

  async function takeInstalledProject(): Promise<string> {
    const project = await ProjectBuilder.editable({
      marketplace: sourceDir,
      skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
      agents: [WEB_DEV],
      domains: ["web"],
      forkedFrom: true,
    });
    tempDirs.push(path.dirname(project.dir));
    return project.dir;
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
    const projectDir = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);

    const { exitCode, output } = await runEditFrom(store, PUBLISHED_ID, { dir: projectDir });

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

  it("refuses before it asks the store for anything", async () => {
    const projectDir = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);

    await runEditFrom(store, PUBLISHED_ID, { dir: projectDir });

    // Nothing in the payload can change the answer, so nothing is fetched.
    expect(store.requests).toStrictEqual([]);
  });

  it("leaves the installation byte-identical", async () => {
    const projectDir = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);
    const before = await readTreeSnapshot(projectDir);

    await runEditFrom(store, PUBLISHED_ID, { dir: projectDir });

    expect(await readTreeSnapshot(projectDir)).toStrictEqual(before);
  });

  /**
   * `--ui` opens whatever `--from` names; `commands/edit-ui-from` covers the pairing, and this adds
   * that the store is not touched.
   */
  it("opens the shared id without spending anything at the store", async () => {
    const projectDir = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);

    const { exitCode, output } = await runEditFrom(store, PUBLISHED_ID, { dir: projectDir }, [
      "--ui",
    ]);

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(output)).toContain(`?fromId=${PUBLISHED_ID}`);
    // Given both flags the id already exists, so neither the mint nor the fetch is needed.
    expect(store.requests).toStrictEqual([]);
  });
});
