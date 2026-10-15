import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { createTempDir, cleanupTempDir, readTreeSnapshot } from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION, ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * `edit --ui`, and the bare `edit` that does the same, end to end: the CLI hands the installation
 * in this directory to the editor.
 *
 * What it must prove is that an id is minted, the editor link is printed, and the directory is
 * left exactly as it was found. A spec that only checked the posted body would pass on a run that
 * rewrote the config on its way out.
 */

describe("edit --ui", () => {
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

  /** A fresh directory, cleaned up after the spec that took it. Its own HOME, so its own scope. */
  async function takeTempDir(): Promise<string> {
    const dir = await createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  describe.each([[["edit"]], [["edit", "--ui"]]])("%j", (argv) => {
    /** Runs `argv` against `store`; the spawned process has no TTY, so the link is only printed. */
    const runAgainst = (dir: string) =>
      CLI.run(argv, { dir }, { env: { AGENTS_INC_API_URL: store.url } });

    it("mints an id for what is installed here and names the editor it opens in", async () => {
      const project = await takeTempDir();
      store.publish(
        "UiOrigin1",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: {
            [E2E_SKILL.react.id]: ejectedGlobalSkill(),
            [E2E_SKILL.vitest.id]: ejectedGlobalSkill({
              assignments: { [E2E_AGENT["web-developer"].name]: "preloaded" },
            }),
          },
        }),
      );
      const installed = await runInitFrom(store, "UiOrigin1", { dir: project }, sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      store.reset();
      const before = await readTreeSnapshot(project);

      const { exitCode, output } = await runAgainst(project);

      expect(exitCode, `${argv.join(" ")} failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
      expect(store.minted).toHaveLength(1);
      const mintedId = firstElement(store.minted);
      expect(output).toContain(`Shared as ${mintedId}`);
      expect(output).toContain(STEP_TEXT.EDITOR_URL);
      // Opening the editor needs no catalogue, so none is loaded.
      expect(output).not.toContain(STEP_TEXT.LOADING_SKILLS);
      // Nothing was edited: the id is a reading of this installation, not a rewrite of it.
      expect(await readTreeSnapshot(project)).toStrictEqual(before);
    });

    it("refuses a directory with nothing installed, without spending a write", async () => {
      const empty = await takeTempDir();

      const { exitCode, output } = await runAgainst(empty);

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(flattenCliOutput(output)).toContain(STEP_TEXT.NO_INSTALLATION);
      // An id for an empty configuration is a dead link, and minting one spends a write from the
      // scarce half of the store's free tier.
      expect(store.requests).toStrictEqual([]);
    });
  });
});
