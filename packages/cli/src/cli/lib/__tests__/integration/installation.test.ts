import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { mkdir } from "fs/promises";
import { CLAUDE_DIR, DEFAULT_PLUGIN_NAME } from "../../../consts";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import { buildProjectConfig } from "../factories/config-factories.js";
import { renderUnparseableConfigTs } from "../factories/unloadable-config-factories.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { detectInstallation } from "../../installation";
import { writeRawTestConfig, writeTestTsConfig } from "../helpers/config-io.js";
import type { ProjectConfig } from "../../../types";

/** Writes a `config.ts` into the source folder the temp dir is on. */
async function writeInstallationConfig(tempDir: string, config: ProjectConfig): Promise<void> {
  await writeTestTsConfig(tempDir, config);
}

describe("installation", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-installation-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("detectInstallation - eject mode", () => {
    it("should return eject installation when the project config.ts exists", async () => {
      await writeInstallationConfig(tempDir, buildProjectConfig());

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.mode).toBe("eject");
      expect(result?.configPath).toBe(getProjectConfigPath(tempDir, "claude"));
      expect(result?.projectDir).toBe(tempDir);
    });

    it("should default to eject mode when installMode is not in config", async () => {
      await writeInstallationConfig(tempDir, buildProjectConfig());

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.mode).toBe("eject");
    });

    it("should use the correct paths in eject mode", async () => {
      const claudeDir = path.join(tempDir, CLAUDE_DIR);
      await writeInstallationConfig(tempDir, buildProjectConfig());

      const result = await detectInstallation(tempDir);

      expect(result).toStrictEqual({
        mode: "eject",
        configPath: getProjectConfigPath(tempDir, "claude"),
        agentsDir: path.join(claudeDir, "agents"),
        projectDir: tempDir,
      });
    });
  });

  describe("detectInstallation - plugin mode", () => {
    it("should return plugin installation when skills have non-local sources", async () => {
      await writeInstallationConfig(
        tempDir,
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
        }),
      );

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.mode).toBe("plugin");
      expect(result?.configPath).toBe(getProjectConfigPath(tempDir, "claude"));
      expect(result?.projectDir).toBe(tempDir);
    });

    it("should use the correct paths in plugin mode", async () => {
      const claudeDir = path.join(tempDir, CLAUDE_DIR);
      await writeInstallationConfig(
        tempDir,
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
        }),
      );

      const result = await detectInstallation(tempDir);

      expect(result).toStrictEqual({
        mode: "plugin",
        configPath: getProjectConfigPath(tempDir, "claude"),
        agentsDir: path.join(claudeDir, "agents"),
        projectDir: tempDir,
      });
    });

    it("should return null when only plugin directory exists without config", async () => {
      const pluginDir = path.join(tempDir, CLAUDE_DIR, "plugins", DEFAULT_PLUGIN_NAME);
      await mkdir(pluginDir, { recursive: true });

      const result = await detectInstallation(tempDir);

      expect(result).toBeNull();
    });
  });

  describe("detectInstallation - no installation", () => {
    it("should return null when neither local nor plugin exists", async () => {
      const result = await detectInstallation(tempDir);

      expect(result).toBeNull();
    });

    it("should return null when .claude exists but no config.ts or plugin", async () => {
      const claudeDir = path.join(tempDir, CLAUDE_DIR);
      await mkdir(claudeDir, { recursive: true });

      const result = await detectInstallation(tempDir);

      expect(result).toBeNull();
    });
  });

  describe("detectInstallation - priority", () => {
    it("should detect local installation from config.ts", async () => {
      const claudeDir = path.join(tempDir, CLAUDE_DIR);
      await writeInstallationConfig(tempDir, buildProjectConfig());

      const pluginDir = path.join(claudeDir, "plugins", DEFAULT_PLUGIN_NAME);
      await mkdir(pluginDir, { recursive: true });

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.mode).toBe("eject");
    });
  });

  describe("edge cases", () => {
    it("should derive plugin mode from skills with non-local sources", async () => {
      await writeInstallationConfig(
        tempDir,
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
        }),
      );

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.mode).toBe("plugin");
      expect(result?.configPath).toBe(getProjectConfigPath(tempDir, "claude"));
    });

    it("surfaces a corrupt config file instead of treating it as eject mode", async () => {
      await writeRawTestConfig(tempDir, renderUnparseableConfigTs());

      // A parse failure must surface, not read as an eject installation.
      await expect(detectInstallation(tempDir)).rejects.toThrow("could not be loaded");
    });

    it("should use process.cwd() as default when projectDir is not provided", async () => {
      const originalCwd = process.cwd();
      process.chdir(tempDir);

      await writeInstallationConfig(tempDir, buildProjectConfig());

      const result = await detectInstallation();

      expect(result).not.toBeNull();
      expect(result?.mode).toBe("eject");
      expect(result?.projectDir).toBe(fs.realpathSync(tempDir));

      process.chdir(originalCwd);
    });
  });
});
