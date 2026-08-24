import path from "path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import { cleanupTempDir, ensureBinaryExists, readTreeSnapshot } from "../helpers/test-utils.js";
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
 * `edit --from <id>` where there is nobody to confirm the removals.
 *
 * The command is destructive by ruling — the project is made to MATCH the payload — so it shows
 * the removals and asks. A confirm nobody can answer must never become a yes, so a spawned
 * process with no TTY refuses instead, and the refusal is what this file proves: refused, exit
 * non-zero, nothing fetched, nothing on disk moved.
 *
 * The counterpart is `e2e/interactive/edit-from.e2e.test.ts`, which drives the same command
 * through a real terminal and approves.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const PUBLISHED_ID = "EditFrom1";

describe("edit --from <id> without a terminal", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    await ensureBinaryExists();
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

  /** An installed project carrying two skills, cleaned up after the spec that took it. */
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

  /** A configuration naming one of the two installed skills — so the other would be removed. */
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
    // `init --from` is the whole of what a pipeline can do with an id: it installs into a clean
    // directory and removes nothing, so it needs no confirm. A refusal that named no way
    // forward would read as "this id is unusable here".
    expect(flattened).toContain(`init --from ${PUBLISHED_ID}`);
  });

  it("refuses before it asks the store for anything", async () => {
    const projectDir = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);

    await runEditFrom(store, PUBLISHED_ID, { dir: projectDir });

    // Nothing in the payload can change the answer, so the round trip is spent on a run that
    // was already over — the same reasoning that puts `init --from`'s greenfield check ahead of
    // its fetch.
    expect(store.requests).toStrictEqual([]);
  });

  it("leaves the installation byte-identical", async () => {
    const projectDir = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);
    const before = await readTreeSnapshot(projectDir);

    await runEditFrom(store, PUBLISHED_ID, { dir: projectDir });

    // The refusal's whole claim: a destructive command that could not ask permission removed
    // nothing, rewrote no config and recompiled no agent.
    expect(await readTreeSnapshot(projectDir)).toStrictEqual(before);
  });

  it("refuses both directions of the round trip in one run", async () => {
    const projectDir = await takeInstalledProject();
    publishHalfOfIt(PUBLISHED_ID);

    const { exitCode, output } = await runEditFrom(store, PUBLISHED_ID, { dir: projectDir }, [
      "--ui",
    ]);

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(STEP_TEXT.SHARED_CONFIG_ONE_DIRECTION);
    // `--ui` alone would have posted this installation and minted an id. A refused run must not
    // first spend a write on the store.
    expect(store.requests).toStrictEqual([]);
  });
});
