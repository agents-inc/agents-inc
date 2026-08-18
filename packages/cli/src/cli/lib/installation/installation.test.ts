import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { buildProjectConfig } from "../__tests__/factories/config-factories";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  PLUGINS_SUBDIR,
  STANDARD_FILES,
} from "../../consts";

// Mock logger (suppress verbose/warn output during tests)
vi.mock("../../utils/logger");

import {
  detectInstallation,
  detectProjectInstallation,
  getInstallationOrThrow,
} from "./installation";
import { renderConfigTs } from "../__tests__/content-generators";

const LOCAL_CONFIG = buildProjectConfig({
  name: "my-project",
  skills: [],
});

async function createLocalProject(
  projectDir: string,
  options: { configContent?: Record<string, unknown> } = {},
): Promise<void> {
  const { configContent = LOCAL_CONFIG } = options;
  const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, STANDARD_FILES.CONFIG_TS), renderConfigTs(configContent));
}

const PLUGIN_CONFIG = buildProjectConfig({
  name: "my-project",
  skills: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
});

async function createPluginProject(projectDir: string): Promise<void> {
  const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, STANDARD_FILES.CONFIG_TS), renderConfigTs(PLUGIN_CONFIG));
}

describe("installation", () => {
  let tempDir: string;
  let fakeHome: string;

  beforeEach(async () => {
    tempDir = await createTempDir("installation-test-");
    // Isolate from the dev machine's real ~/.claude-src so global-fallback
    // behavior is deterministic
    fakeHome = await createTempDir("installation-test-home-");
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTempDir(tempDir);
    await cleanupTempDir(fakeHome);
  });

  describe("detectInstallation", () => {
    it("detects local installation with .claude-src/config.ts", async () => {
      await createLocalProject(tempDir);

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe("eject");

      expect(result!.configPath).toBe(path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS));
      expect(result!.agentsDir).toBe(path.join(tempDir, CLAUDE_DIR, "agents"));
      expect(result!.skillsDir).toBe(path.join(tempDir, CLAUDE_DIR, "skills"));
      expect(result!.projectDir).toBe(tempDir);
    });

    it("defaults to eject mode when installMode is not set", async () => {
      await createLocalProject(tempDir, { configContent: LOCAL_CONFIG });

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe("eject");
    });

    it("detects plugin installation when installMode is plugin", async () => {
      await createPluginProject(tempDir);

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe("plugin");

      expect(result!.configPath).toBe(path.join(tempDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS));
      expect(result!.agentsDir).toBe(path.join(tempDir, CLAUDE_DIR, "agents"));
      expect(result!.skillsDir).toBe(path.join(tempDir, CLAUDE_DIR, PLUGINS_SUBDIR));
      expect(result!.projectDir).toBe(tempDir);
    });

    it("returns null for project-level detection when no installation found", async () => {
      // Empty temp dir — no config, no plugin
      // Use detectProjectInstallation to avoid global fallback
      const result = await detectProjectInstallation(tempDir);
      expect(result).toBeNull();
    });

    it("returns null when no config file exists even if plugin dirs exist", async () => {
      // Just having plugin directories without a config file is not sufficient
      const pluginDir = path.join(tempDir, CLAUDE_DIR, PLUGINS_SUBDIR, "some-skill@public");
      await mkdir(pluginDir, { recursive: true });

      // detectProjectInstallation returns null for project check
      const projectResult = await detectProjectInstallation(tempDir);
      expect(projectResult).toBeNull();
    });

    it("surfaces a corrupt config instead of a phantom eject installation", async () => {
      // A config file that exists but cannot be parsed must NOT be treated as an
      // eject installation — that phantom install lets compile run config-less and
      // resurrect deselected agents. Detection surfaces the corruption instead.
      const configDir = path.join(tempDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        "invalid typescript content {{",
      );

      await expect(detectInstallation(tempDir)).rejects.toThrow("could not be loaded");
    });

    it("uses provided projectDir parameter", async () => {
      // Empty dir — no installation at project level
      const result = await detectProjectInstallation(tempDir);

      expect(result).toBeNull();
    });
  });

  describe("detectProjectInstallation", () => {
    it("returns project-scoped installation when config exists", async () => {
      await createLocalProject(tempDir);

      const result = await detectProjectInstallation(tempDir);

      expect(result).not.toBeNull();

      expect(result!.projectDir).toBe(tempDir);
    });

    it("returns null when no config exists (no global fallback)", async () => {
      const result = await detectProjectInstallation(tempDir);

      expect(result).toBeNull();
    });
  });

  describe("global fallback", () => {
    it("falls back to global when project config not found", async () => {
      // Project dir has no config; the isolated home does -> fallback to global
      await createLocalProject(fakeHome);

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result!.projectDir).toBe(fakeHome);
    });

    it("returns null when neither project nor global config exists", async () => {
      const result = await detectInstallation(tempDir);

      expect(result).toBeNull();
    });

    it("project takes precedence over global", async () => {
      // Project config exists — should use project, not global
      await createLocalProject(tempDir);

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();

      expect(result!.projectDir).toBe(tempDir);
    });
  });

  describe("getInstallationOrThrow", () => {
    it("returns installation when found", async () => {
      await createLocalProject(tempDir);

      const result = await getInstallationOrThrow(tempDir);

      expect(result.mode).toBe("eject");

      expect(result.projectDir).toBe(tempDir);
    });

    it("throws error when no installation found", async () => {
      await expect(getInstallationOrThrow(tempDir)).rejects.toThrow(
        "No Agents Inc. installation found",
      );
    });

    it("error message suggests running init", async () => {
      await expect(getInstallationOrThrow(tempDir)).rejects.toThrow(`${CLI_INVOKE_COMMAND} init`);
    });

    it("returns plugin installation when config has installMode: plugin", async () => {
      await createPluginProject(tempDir);

      const result = await getInstallationOrThrow(tempDir);

      expect(result.mode).toBe("plugin");
    });
  });
});
