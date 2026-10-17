import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { cleanupTempDir, runCLI } from "../helpers/test-utils.js";
import type { TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { installDualScopeStack } from "../fixtures/e2e-stack-seed.js";

/** `doctor` on a dual-scope installation: healthy, missing agent file, orphaned skill directory. */

describe("doctor dual-scope diagnostics", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "doctor passes all checks on healthy dual-scope installation",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await installDualScopeStack(store, E2E_SOURCE.sourceDir);

      const { exitCode, stdout } = await runCLI(["doctor"], env.projectDir, {
        env: { HOME: env.fakeHome },
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // The summary counts: "FAIL" and "Config" match too much.
      expect(stdout).toMatch(
        new RegExp(`${STEP_TEXT.DOCTOR_SUMMARY}\\s+\\d+ passed, 0 warnings, 0 errors`),
      );
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
    },
  );

  it(
    "doctor detects missing agent file in dual-scope",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await installDualScopeStack(store, E2E_SOURCE.sourceDir);

      const agentFile = path.join(env.projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
      await rm(agentFile, { force: true });

      const { exitCode, combined } = await runCLI(["doctor"], env.projectDir, {
        env: { HOME: env.fakeHome },
      });

      // A missing compiled agent is a warning, not a failing check.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Which of the two: telling a warning from a recompilation notice is the subject.
      expect(combined).toMatch(
        new RegExp(`${STEP_TEXT.DOCTOR_SUMMARY}\\s+\\d+ passed, [1-9]\\d* warnings?, 0 errors`),
      );
      expect(combined).toContain("api-developer");
    },
  );

  it(
    "doctor names a skill directory nothing here installed in dual-scope",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await installDualScopeStack(store, E2E_SOURCE.sourceDir);

      const orphanDir = path.join(env.projectDir, DIRS.CLAUDE, DIRS.SKILLS, "orphan-skill");
      await mkdir(orphanDir, { recursive: true });
      await writeFile(path.join(orphanDir, FILES.SKILL_MD), "# Orphan Skill\n");

      const { exitCode, combined } = await runCLI(["doctor"], env.projectDir, {
        env: { HOME: env.fakeHome },
      });

      // A directory neither named by config nor marked by this CLI is named, not failed.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(combined).toContain("orphan-skill");
      expect(combined).toContain(STEP_TEXT.DOCTOR_FOREIGN_SKILL_DIR);
      expect(combined).not.toContain(`Missing ${FILES.METADATA_YAML}`);
    },
  );
});
