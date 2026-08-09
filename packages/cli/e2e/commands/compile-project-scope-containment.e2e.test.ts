import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  ensureBinaryExists,
  readTreeSnapshot,
  runCLI,
} from "../helpers/test-utils.js";
import { createGlobalOnlyEnv, initProjectAllGlobal } from "../fixtures/dual-scope-helpers.js";
import type { DualScopeEnv } from "../fixtures/dual-scope-helpers.js";

const SECOND_PROJECT_DIR_NAME = "project-b";

/**
 * A compile run inside a project writes nothing outside that project — the
 * ruled containment for CLI-438. Propagation belongs to global operations; a
 * project-scope compile is not one.
 *
 * Both registered projects are created through the real wizard, so the global
 * config genuinely carries two registrations and the fan-out this pins has
 * somewhere to go. The snapshots carry each file's mtime alongside its bytes:
 * the out-of-scope writes this guards against rewrite unchanged configs and
 * unchanged agents, so a bytes-only comparison cannot see them at all — they
 * are visible in the command's log and in nothing else.
 */

describe("compile inside a project is contained to that project", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let env: DualScopeEnv | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "leaves the global scope and every other registered project byte- and mtime-identical",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createGlobalOnlyEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      const secondProjectDir = path.join(fakeHome, SECOND_PROJECT_DIR_NAME);
      await mkdir(secondProjectDir, { recursive: true });
      await createPermissionsFile(secondProjectDir);
      const secondProject = await initProjectAllGlobal(
        sourceDir,
        sourceTempDir,
        fakeHome,
        secondProjectDir,
      );
      expect(secondProject.exitCode, `second project init failed: ${secondProject.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const globalClaudeBefore = await readTreeSnapshot(path.join(fakeHome, DIRS.CLAUDE));
      const globalSrcBefore = await readTreeSnapshot(path.join(fakeHome, DIRS.CLAUDE_SRC));
      const secondClaudeBefore = await readTreeSnapshot(path.join(secondProjectDir, DIRS.CLAUDE));
      const secondSrcBefore = await readTreeSnapshot(path.join(secondProjectDir, DIRS.CLAUDE_SRC));
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
        await readTreeSnapshot(path.join(fakeHome, DIRS.CLAUDE_SRC)),
        "a project-scope compile must not write into the global config pair",
      ).toStrictEqual(globalSrcBefore);
      expect(
        await readTreeSnapshot(path.join(secondProjectDir, DIRS.CLAUDE)),
        "a project-scope compile must not write into another project's install",
      ).toStrictEqual(secondClaudeBefore);
      expect(
        await readTreeSnapshot(path.join(secondProjectDir, DIRS.CLAUDE_SRC)),
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
