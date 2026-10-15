import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  readTreeSnapshot,
  runCLI,
  sourceFolderIn,
} from "../helpers/test-utils.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";

const SECOND_PROJECT_DIR_NAME = "project-b";

/**
 * A compile run inside a project writes nothing outside that project — the
 * ruled containment. Propagation belongs to global operations; a
 * project-scope compile is not one.
 *
 * Both registered projects are set up with `init --from` over the global
 * installation, so the global config genuinely carries two registrations and the
 * fan-out this pins has somewhere to go. The snapshots carry each file's mtime alongside its bytes:
 * the out-of-scope writes this guards against rewrite unchanged configs and
 * unchanged agents, so a bytes-only comparison cannot see them at all — they
 * are visible in the command's log and in nothing else.
 */

/** The E2E stack with every skill and sub-agent global — what each run below installs. */
const ALL_GLOBAL_ID = "AllGlobal1";

describe("compile inside a project is contained to that project", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "leaves the global scope and every other registered project byte- and mtime-identical",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const { fakeHome, projectDir } = env;
      const allGlobal = e2eStackPayload();
      await installFromSeed(store, ALL_GLOBAL_ID, allGlobal, { dir: fakeHome, home: fakeHome });
      await installFromSeed(store, ALL_GLOBAL_ID, allGlobal, { dir: projectDir, home: fakeHome });

      const secondProjectDir = path.join(fakeHome, SECOND_PROJECT_DIR_NAME);
      await mkdir(secondProjectDir, { recursive: true });
      await createPermissionsFile(secondProjectDir);
      await installFromSeed(store, ALL_GLOBAL_ID, allGlobal, {
        dir: secondProjectDir,
        home: fakeHome,
      });

      const globalClaudeBefore = await readTreeSnapshot(path.join(fakeHome, DIRS.CLAUDE));
      const globalSrcBefore = await readTreeSnapshot(sourceFolderIn(fakeHome));
      const secondClaudeBefore = await readTreeSnapshot(path.join(secondProjectDir, DIRS.CLAUDE));
      const secondSrcBefore = await readTreeSnapshot(sourceFolderIn(secondProjectDir));
      expect(
        Object.keys(globalClaudeBefore).length,
        "the global scope must hold installed content, or its unchanged-ness is vacuous",
      ).toBeGreaterThan(0);
      expect(
        Object.keys(secondSrcBefore).length,
        "the second project must hold a config, or its unchanged-ness is vacuous",
      ).toBeGreaterThan(0);

      const { exitCode, combined } = await runCLI(["compile"], projectDir, {
        env: { HOME: fakeHome },
      });

      expect(exitCode, `compile failed: ${combined}`).toBe(EXIT_CODES.SUCCESS);
      expect(combined, "the project's own pass must run — the subject of the whole run").toContain(
        "Compiling project agents",
      );

      expect(
        await readTreeSnapshot(path.join(fakeHome, DIRS.CLAUDE)),
        "a project-scope compile must not write into the global install",
      ).toStrictEqual(globalClaudeBefore);
      expect(
        await readTreeSnapshot(sourceFolderIn(fakeHome)),
        "a project-scope compile must not write into the global config pair",
      ).toStrictEqual(globalSrcBefore);
      expect(
        await readTreeSnapshot(path.join(secondProjectDir, DIRS.CLAUDE)),
        "a project-scope compile must not write into another project's install",
      ).toStrictEqual(secondClaudeBefore);
      expect(
        await readTreeSnapshot(sourceFolderIn(secondProjectDir)),
        "a project-scope compile must not write into another project's config pair",
      ).toStrictEqual(secondSrcBefore);

      expect(combined, "a project-scope compile must not run a global pass").not.toContain(
        "Compiling global agents",
      );
      expect(
        combined,
        "a project-scope compile must not fan out to other registered projects",
      ).not.toContain(STEP_TEXT.PROPAGATED_RECOMPILE);
    },
  );
});
