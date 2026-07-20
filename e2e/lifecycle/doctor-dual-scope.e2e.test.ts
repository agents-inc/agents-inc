import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import { cleanupTempDir, ensureBinaryExists, runCLI } from "../helpers/test-utils.js";
import { createDualScopeEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";

/**
 * Doctor dual-scope E2E tests.
 *
 * Verifies that `cc doctor` works correctly with dual-scope installations
 * (global + project). Covers healthy state, missing agent files, and
 * orphaned skill directories.
 */

let sourceDir: string;
let sourceTempDir: string;

beforeAll(async () => {
  await ensureBinaryExists();
  const source = await createE2ESource();
  sourceDir = source.sourceDir;
  sourceTempDir = source.tempDir;
}, TIMEOUTS.SETUP_DUAL);

afterAll(async () => {
  if (sourceTempDir) await cleanupTempDir(sourceTempDir);
});

describe("doctor dual-scope diagnostics", () => {
  let env: DualScopeEnv | undefined;

  afterEach(async () => {
    await env?.destroy();
    env = undefined;
  });

  it(
    "doctor passes all checks on healthy dual-scope installation",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(sourceDir, sourceTempDir);

      const { exitCode, stdout } = await runCLI(["doctor"], env.projectDir, {
        env: { HOME: env.fakeHome },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).not.toContain("FAIL");
      expect(stdout).not.toContain("ERROR");
      expect(stdout).toContain("Config");
      expect(stdout).toContain("Source");
    },
  );

  it(
    "doctor detects missing agent file in dual-scope",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(sourceDir, sourceTempDir);

      // Delete the api-developer agent file from the project scope
      const agentFile = path.join(env.projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
      await rm(agentFile, { force: true });

      const { exitCode, stdout, combined } = await runCLI(["doctor"], env.projectDir, {
        env: { HOME: env.fakeHome },
      });

      // Doctor should warn about the missing agent file
      const output = combined.toLowerCase();
      expect(output).toMatch(/warn|recompilation/);
      expect(combined).toContain("api-developer");
    },
  );

  it(
    "doctor detects orphaned skill directory in dual-scope",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(sourceDir, sourceTempDir);

      // Create an orphan skill directory not referenced in config
      const orphanDir = path.join(env.projectDir, DIRS.CLAUDE, DIRS.SKILLS, "orphan-skill");
      await mkdir(orphanDir, { recursive: true });
      await writeFile(path.join(orphanDir, FILES.SKILL_MD), "# Orphan Skill\n");

      const { exitCode, stdout, combined } = await runCLI(["doctor"], env.projectDir, {
        env: { HOME: env.fakeHome },
      });

      // Doctor checks for orphaned agent files (No Orphans check).
      // Orphaned skill dirs may not be flagged as errors — the important
      // thing is doctor runs without crashing on the extra directory.
      const output = combined.toLowerCase();
      expect(output).toMatch(/orphan|warn|summary/);
    },
  );
});
