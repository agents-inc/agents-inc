import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  DEFAULT_PLUGIN_NAME,
  STANDARD_FILES,
} from "../../../consts";
import { buildProjectConfig } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { detectInstallation, getInstallationOrThrow } from "../../installation";
import { writeTestTsConfig } from "../helpers/config-io.js";
import type { ProjectConfig } from "../../../types";

/** Writes a `.claude-src/config.ts` with the given config into the temp dir. */
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
    it("should return eject installation when .claude-src/config.ts exists", async () => {
      await writeInstallationConfig(tempDir, buildProjectConfig());

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.mode).toBe("eject");
      expect(result?.configPath).toBe(path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS));
      expect(result?.projectDir).toBe(tempDir);
    });

    it("should default to eject mode when installMode is not in config", async () => {
      await writeInstallationConfig(tempDir, buildProjectConfig());

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.mode).toBe("eject");
    });

    it("should use correct paths for agentsDir and skillsDir in eject mode", async () => {
      const claudeDir = path.join(tempDir, CLAUDE_DIR);
      await writeInstallationConfig(tempDir, buildProjectConfig());

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.agentsDir).toBe(path.join(claudeDir, "agents"));
      expect(result?.skillsDir).toBe(path.join(claudeDir, "skills"));
    });
  });

  describe("detectInstallation - plugin mode", () => {
    it("should return plugin installation when skills have non-local sources", async () => {
      await writeInstallationConfig(
        tempDir,
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
        }),
      );

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.mode).toBe("plugin");
      expect(result?.configPath).toBe(path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS));
      expect(result?.projectDir).toBe(tempDir);
    });

    it("should use correct plugin paths for agentsDir and skillsDir", async () => {
      const claudeDir = path.join(tempDir, CLAUDE_DIR);
      await writeInstallationConfig(
        tempDir,
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
        }),
      );

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.agentsDir).toBe(path.join(claudeDir, "agents"));
      expect(result?.skillsDir).toBe(path.join(claudeDir, "plugins"));
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

  describe("getInstallationOrThrow", () => {
    it("should throw helpful error when no installation found", async () => {
      await expect(getInstallationOrThrow(tempDir)).rejects.toThrow(
        `No ${DEFAULT_BRANDING.NAME} installation found`,
      );
    });

    it("should include init suggestion in error message", async () => {
      await expect(getInstallationOrThrow(tempDir)).rejects.toThrow(`${CLI_INVOKE_COMMAND} init`);
    });

    it("should return installation when found (local)", async () => {
      await writeInstallationConfig(tempDir, buildProjectConfig());

      const result = await getInstallationOrThrow(tempDir);

      expect(result).not.toBeNull();
      expect(result.mode).toBe("eject");
      expect(result.projectDir).toBe(tempDir);
    });

    it("should return installation when found (plugin)", async () => {
      await writeInstallationConfig(
        tempDir,
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
        }),
      );

      const result = await getInstallationOrThrow(tempDir);

      expect(result).not.toBeNull();
      expect(result.mode).toBe("plugin");
      expect(result.projectDir).toBe(tempDir);
    });
  });

  describe("edge cases", () => {
    it("should derive plugin mode from skills with non-local sources", async () => {
      await writeInstallationConfig(
        tempDir,
        buildProjectConfig({
          skills: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
        }),
      );

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result?.mode).toBe("plugin");
      expect(result?.configPath).toBe(path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS));
    });

    it("surfaces a corrupt config file instead of treating it as eject mode", async () => {
      const claudeSrcDir = path.join(tempDir, CLAUDE_SRC_DIR);
      await mkdir(claudeSrcDir, { recursive: true });
      await writeFile(
        path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS),
        "invalid typescript content {{",
      );

      // A file that exists but cannot be parsed must not become a phantom eject
      // installation — detection surfaces the corruption so callers can report it.
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
