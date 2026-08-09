import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
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

      // The summary counts, not a generic absence: `not.toContain("FAIL")` is
      // tripped by any text carrying those letters, and `toContain("Config")`
      // matches a pass row, a warn row and a path alike.
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
      env = await createDualScopeEnv(sourceDir, sourceTempDir);

      // Delete the api-developer agent file from the project scope
      const agentFile = path.join(env.projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
      await rm(agentFile, { force: true });

      const { exitCode, combined } = await runCLI(["doctor"], env.projectDir, {
        env: { HOME: env.fakeHome },
      });

      // A missing compiled agent is a recompilation warning, not a failing check,
      // so doctor must still exit successfully.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Which of the two the report said, not either: an alternation cannot tell
      // a warning apart from a recompilation notice, and telling them apart is
      // this spec's whole subject.
      expect(combined).toMatch(
        new RegExp(`${STEP_TEXT.DOCTOR_SUMMARY}\\s+\\d+ passed, [1-9]\\d* warnings?, 0 errors`),
      );
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

      const { exitCode, combined } = await runCLI(["doctor"], env.projectDir, {
        env: { HOME: env.fakeHome },
      });

      // The operational No Orphans check only looks at agent files, but the content
      // layer walks every directory under .claude/skills/ regardless of config — a
      // skill directory with no metadata.yaml is content Claude Code would load.
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(combined).toContain("orphan-skill");
      expect(combined).toContain(`Missing ${FILES.METADATA_YAML}`);
    },
  );
});
