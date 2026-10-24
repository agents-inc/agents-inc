import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import { doctorRow, EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import {
  cleanupTempDir,
  createTempDir,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

/** Skipped together, so naming them tells a skip from a report that stopped early. */
const CONFIG_DEPENDENT_ROWS = [
  STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED,
  STEP_TEXT.DOCTOR_ROW_AGENTS_COMPILED,
  STEP_TEXT.DOCTOR_ROW_NO_ORPHANS,
  STEP_TEXT.DOCTOR_ROW_SKILLS_INSTALLED,
  STEP_TEXT.DOCTOR_ROW_PLUGINS_INSTALLED,
] as const;

describe("doctor command", () => {
  let tempDir: string;

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

    for (const row of CONFIG_DEPENDENT_ROWS) {
      expect(stdout).toMatch(
        doctorRow(row, STEP_TEXT.DOCTOR_STATUS_SKIP, STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID),
      );
    }
    expect(stdout).toContain(STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE);

    // The count, not the word: `toContain("error")` matches any id or path.
    expect(stdout).toContain(`${STEP_TEXT.DOCTOR_SUMMARY} 7 passed, 0 warnings, 1 error`);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_CREATE_CONFIG);
  });

  it("should pass config check with valid config file", async () => {
    tempDir = await createTempDir();
    await writeProjectConfig(
      tempDir,
      buildProjectConfig({
        name: "test-project",
        skills: [],
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      }),
    );

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
    it("should not crash and should report config error with corrupt config.ts", async () => {
      tempDir = await createTempDir();

      // writeProjectConfig() emits only valid configs, so the unparseable one uses the error-path
      // writer.
      await writeCorruptConfig(tempDir, renderUnparseableConfigTs());

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
      expect(stdout).toContain(FILES.CONFIG_TS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_SUMMARY);
    });
  });

  describe("global installation fallback", () => {
    it("should validate global installation when no project config exists", async () => {
      tempDir = await createTempDir();

      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "global-test",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        }),
      );

      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, stdout } = await CLI.run(
        ["doctor"],
        { dir: projectDir },
        {
          env: { HOME: globalHome },
        },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_IS_VALID);
    });
  });
});
