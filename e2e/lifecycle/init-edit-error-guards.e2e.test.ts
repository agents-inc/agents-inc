import { mkdir } from "fs/promises";
import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  renderMetadataYaml,
  runCLI,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * Error guard E2E tests for init, compile, and edit commands.
 *
 * Covers: invalid source flag handling, missing skills directory,
 * empty skills config, and edit with nonexistent source path.
 */

describe("init/edit error guards", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  it(
    "init with invalid source flag should error gracefully",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, combined } = await runCLI(
        ["init", "--source", "/tmp/not-a-real-source-path-xyz"],
        projectDir,
        { env: { HOME: tempDir } },
      );

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      // The source loader should report an error about the nonexistent source
      expect(combined.length).toBeGreaterThan(0);
    },
  );

  it(
    "compile with missing skills directory should error",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // Create config referencing a skill, but do NOT create .claude/skills/
      await writeProjectConfig(projectDir, {
        name: "test-missing-skills",
        skills: [{ id: "web-framework-react", scope: "project", source: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      // Create .claude/ directory without skills/ subdirectory
      await mkdir(path.join(projectDir, DIRS.CLAUDE), { recursive: true });

      const { exitCode, combined } = await runCLI(["compile"], projectDir, {
        env: { HOME: tempDir },
      });

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      expect(combined).toContain(STEP_TEXT.NO_SKILLS_FOUND);
    },
  );

  it(
    "compile with empty config skills array should handle gracefully",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // A content-less config (no skills, no agents) is not a real installation,
      // so compile fails gracefully with a not-installed error.
      await writeProjectConfig(projectDir, {
        name: "test-empty-skills",
        skills: [],
        agents: [],
      });

      const { exitCode, combined } = await runCLI(["compile"], projectDir, {
        env: { HOME: tempDir },
      });

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      expect(combined).toContain(STEP_TEXT.NO_INSTALLATION);
    },
  );

  it(
    "edit with --source pointing to nonexistent path should error",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // Create a minimal installation so detectProject() succeeds
      await writeProjectConfig(projectDir, {
        name: "test-edit-bad-source",
        skills: [{ id: "web-framework-react", scope: "project", source: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      await createLocalSkill(projectDir, "web-framework-react", {
        description: "Minimal skill for edit error test",
        metadata: renderMetadataYaml({ contentHash: "hash-edit-err" }),
      });

      const { exitCode, combined } = await runCLI(
        ["edit", "--source", "/nonexistent/path/xyz"],
        projectDir,
        { env: { HOME: tempDir } },
      );

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      // The source loader should report an error about the nonexistent path
      expect(combined.length).toBeGreaterThan(0);
    },
  );
});
