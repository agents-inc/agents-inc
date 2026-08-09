import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT } from "../pages/constants.js";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";

/**
 * The operational rows whose every check needs a loadable config. `doctor` skips
 * all of them together, so naming them is what tells a skip apart from a report
 * that stopped early.
 */
const CONFIG_DEPENDENT_ROWS = [
  STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED,
  STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED,
  STEP_TEXT.DOCTOR_ROW_NO_ORPHANS,
  STEP_TEXT.DOCTOR_ROW_SKILLS_INSTALLED,
  STEP_TEXT.DOCTOR_ROW_PLUGINS_INSTALLED,
] as const;

describe("doctor command", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should report a missing config, skip every check that depends on it, and tip at init", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain("Doctor");
    expect(stdout).toContain("Checking configuration health");
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_NOT_FOUND);

    // Every row that needs a config is skipped, and the one that does not is
    // still run — otherwise "skipped" cannot be told from "the report stopped".
    for (const row of CONFIG_DEPENDENT_ROWS) {
      expect(stdout).toMatch(
        new RegExp(
          `${row}\\s+-\\s+${STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID.replace(/[()]/g, "\\$&")}`,
        ),
      );
    }
    expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE);

    // The count, not the word: `toContain("error")` matches any text carrying it,
    // including a skill id or a path.
    expect(stdout).toContain(`${STEP_TEXT.DOCTOR_SUMMARY} 6 passed, 0 warnings, 1 error`);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_CREATE_CONFIG);
  });

  it("should pass config check with valid config file", async () => {
    tempDir = await createTempDir();
    await writeProjectConfig(tempDir, {
      name: "test-project",
      agents: [{ name: "web-developer", scope: "project" }],
    });

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_IS_VALID);
  });

  describe("--help flag", () => {
    it("should display help output", async () => {
      tempDir = await createTempDir();

      const { exitCode, stdout } = await CLI.run(["doctor", "--help"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Diagnose");
      expect(stdout).not.toContain("--verbose");
    });
  });

  describe("corrupt config file", () => {
    // What the finding says, and why the operational layer is absent from it, is
    // doctor-corrupt-config.e2e.test.ts's subject. This one keeps its original claim: the run
    // survives the file and still produces a report.
    it("should not crash and should report config error with corrupt config.ts", async () => {
      tempDir = await createTempDir();

      // Manual writeFile: intentionally creating a corrupt config.ts with invalid
      // JavaScript syntax. writeProjectConfig() generates valid configs, so manual
      // construction is required to test the error-handling path.
      const configDir = path.join(tempDir, DIRS.CLAUDE_SRC);
      await mkdir(configDir, { recursive: true });
      await writeFile(path.join(configDir, FILES.CONFIG_TS), "export default {{{CORRUPT SYNTAX!!!");

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

      // Doctor should not crash -- it should report a config error
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
      expect(stdout).toContain(FILES.CONFIG_TS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SUMMARY);
    });
  });

  describe("global installation fallback", () => {
    it("should validate global installation when no project config exists", async () => {
      tempDir = await createTempDir();

      // Create a "global home" directory with valid .claude-src/config.ts
      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(globalHome, {
        name: "global-test",
        agents: [{ name: "web-developer", scope: "project" }],
      });

      // Create a project directory WITHOUT config
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      // Run doctor with HOME pointing to globalHome
      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        {
          env: { HOME: globalHome },
        },
      );

      // Doctor should detect the global config and validate it
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_IS_VALID);
    });
  });
});
