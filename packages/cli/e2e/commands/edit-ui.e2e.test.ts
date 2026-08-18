import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  flattenCliOutput,
  runEditUi,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * `edit --ui` end to end: the CLI hands the installation in this directory to the editor
 * instead of to the wizard.
 *
 * What it must prove is that the flag replaces the wizard rather than preceding it — an id is
 * minted, the editor link is printed, and the directory is left exactly as it was found. A
 * spec that only checked the posted body would pass on a run that also opened the wizard, or
 * on one that rewrote the config on its way out.
 */

/** A payload as the web app builds it, pinned to the wire version rather than the constant. */
function seedPayload(skills: Record<string, unknown>, agents: Record<string, unknown> = {}) {
  return { v: 5, matrixVersion: "1.0.0", stackId: null, skills, agents };
}

/**
 * One skill row. Eject and global for the same reasons the `init --from` specs give: the E2E
 * source is local and has no marketplace, and no payload here pins its sub-agent.
 */
function skillEntry(overrides: Record<string, unknown> = {}) {
  return {
    install: "eject",
    scope: "global",
    assignments: { [E2E_AGENT["web-developer"].name]: "lazy" },
    ...overrides,
  };
}

describe("edit --ui", () => {
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

  /** A fresh directory, cleaned up after the spec that took it. Its own HOME, so its own scope. */
  async function takeTempDir(): Promise<string> {
    const dir = await createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  it("mints an id for what is installed here and names the editor it opens in", async () => {
    const project = await takeTempDir();
    store.publish(
      "UiOrigin1",
      seedPayload({
        [E2E_SKILL.react.id]: skillEntry(),
        [E2E_SKILL.vitest.id]: skillEntry({
          assignments: { [E2E_AGENT["web-developer"].name]: "preloaded" },
        }),
      }),
    );
    const installed = await runInitFrom(store, "UiOrigin1", { dir: project }, sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    store.reset();
    const before = await readTreeSnapshot(project);

    const { exitCode, output } = await runEditUi(store, { dir: project });

    expect(exitCode, `edit --ui failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(store.minted).toHaveLength(1);
    const mintedId = firstElement(store.minted);
    expect(output).toContain(mintedId);
    expect(output).toContain(STEP_TEXT.EDITOR_URL);
    // The flag replaces the wizard; a run that opened it would have loaded the catalogue first.
    expect(output).not.toContain(STEP_TEXT.LOADING_SKILLS);
    // Nothing was edited: the id is a reading of this installation, not a rewrite of it.
    expect(await readTreeSnapshot(project)).toStrictEqual(before);
  });

  it("refuses a directory with nothing installed, without spending a write", async () => {
    const empty = await takeTempDir();

    const { exitCode, output } = await runEditUi(store, { dir: empty });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(STEP_TEXT.NO_INSTALLATION);
    // An id for an empty configuration is a dead link, and minting one spends a write from the
    // scarce half of the store's free tier.
    expect(store.requests).toStrictEqual([]);
  });
});
