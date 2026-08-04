import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";

describe("doctor command", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should report config missing in unconfigured directory", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain("Doctor");
    expect(stdout).toContain("Checking configuration health");
    expect(stdout).toContain("Config Valid");
    expect(stdout).toContain("config.ts not found");
    expect(stdout).toContain("Summary:");
    expect(stdout).toContain("error");
  });

  it("should show skipped checks when config is missing", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain("Skills Resolved");
    expect(stdout).toContain("Skipped");
    expect(stdout).toContain("Agents Compiled");
    expect(stdout).toContain("No Orphans");
  });

  it("should show source reachable check", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain("Source Reachable");
  });

  it("should show tip to run init when config is missing", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain("Tip:");
    expect(stdout).toContain("init");
  });

  it("should pass config check with valid config file", async () => {
    tempDir = await createTempDir();
    await writeProjectConfig(tempDir, {
      name: "test-project",
      agents: [{ name: "web-developer", scope: "project" }],
    });

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Config Valid");
    expect(stdout).toContain("is valid");
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

      // Manual writeFile: intentionally creating a corrupt config.ts with invalid
      // JavaScript syntax. writeProjectConfig() generates valid configs, so manual
      // construction is required to test the error-handling path.
      const configDir = path.join(tempDir, DIRS.CLAUDE_SRC);
      await mkdir(configDir, { recursive: true });
      await writeFile(path.join(configDir, FILES.CONFIG_TS), "export default {{{CORRUPT SYNTAX!!!");

      const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

      // Doctor should not crash -- it should report a config error
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Config Valid");
      expect(stdout).toContain(FILES.CONFIG_TS);
      expect(stdout).toContain("Summary:");
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
      expect(stdout).toContain("Config Valid");
      expect(stdout).toContain("is valid");
    });
  });
});
