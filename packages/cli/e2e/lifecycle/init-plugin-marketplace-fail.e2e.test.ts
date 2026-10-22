import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  compactCliOutput,
  createTempDir,
  flattenCliOutput,
} from "../helpers/test-utils.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  EXIT_CODES,
  MANIFEST_REFUSAL_BUILDS_IN_ORDER,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import "../matchers/setup.js";

/** `init` has no rollback, so the failure must resolve before its first filesystem mutation. */

describe("init over a marketplace that cannot serve it: filesystem integrity", () => {
  let unbuilt: E2ESource;
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    unbuilt = await createE2ESource({ unbuilt: true });
    store = await startSeedConfigStore();
    store.publish("Unbuilt1", e2eStackPayload());
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(unbuilt);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "should hard-error BEFORE copying any skill (no partial state on disk)",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, output: combined } = await runInitFrom(
        store,
        "Unbuilt1",
        { dir: projectDir, globalHome: tempDir },
        unbuilt.sourceDir,
      );

      const output = flattenCliOutput(combined);
      expect(
        output,
        "a marketplace with no marketplace.json must be refused, naming the builds that write one",
      ).toMatch(MANIFEST_REFUSAL_BUILDS_IN_ORDER);
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      // Compacted, both sides: oclif breaks a path longer than its line mid-word.
      expect(compactCliOutput(combined)).toContain(compactCliOutput(unbuilt.sourceDir));

      await expect({ dir: projectDir }).toHaveNoLocalSkills();
      await expect({ dir: tempDir }).toHaveNoLocalSkills();

      expect(output).not.toContain(STEP_TEXT.SKILLS_COPIED_TO);
    },
  );
});
