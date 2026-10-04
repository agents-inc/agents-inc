import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import os from "os";
import path from "path";
import { mkdir } from "fs/promises";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { buildAgentConfigs, buildProjectConfig } from "../__tests__/factories/config-factories";
import { renderUnparseableConfigTs } from "../__tests__/factories/unloadable-config-factories";
import { writeRawTestConfig, writeTestTsConfig } from "../__tests__/helpers/config-io";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation";
import { SKILLS } from "../__tests__/test-fixtures";
import { CLAUDE_DIR, DEFAULT_PUBLIC_SOURCE_NAME, PLUGINS_SUBDIR } from "../../consts";
import { getProjectConfigPath } from "./install-base-dir.js";

// Mock logger (suppress verbose/warn output during tests)
vi.mock("../../utils/logger");

import { detectInstallation, detectProjectInstallation } from "./installation";

/**
 * An installation holding a sub-agent and no skill at all. The sub-agent is what makes it an
 * installation — a config declaring neither is content-less and detection answers `null` for it —
 * and the empty skill list is what `deriveInstallMode` reads as eject.
 */
const AN_EJECT_INSTALLATION = buildProjectConfig({
  name: "my-project",
  agents: buildAgentConfigs(["web-developer"]),
  skills: [],
});

/** The same installation with its one skill installed from the public marketplace: plugin mode. */
const A_PLUGIN_INSTALLATION = buildProjectConfig({
  name: "my-project",
  agents: buildAgentConfigs(["web-developer"]),
  skills: buildSkillConfigs([SKILLS.react.id], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
});

describe("installation", () => {
  let tempDir: string;
  let fakeHome: string;

  beforeEach(async () => {
    tempDir = await createTempDir("installation-test-");
    // Isolate from the dev machine's real ~/.agents-inc/claude so global-fallback
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
    it("detects a local installation from the config.ts in its source folder", async () => {
      await writeTestTsConfig(tempDir, AN_EJECT_INSTALLATION);

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe("eject");

      expect(result!.configPath).toBe(getProjectConfigPath(tempDir, "claude"));
      expect(result!.agentsDir).toBe(path.join(tempDir, CLAUDE_DIR, "agents"));
      expect(result!.skillsDir).toBe(path.join(tempDir, CLAUDE_DIR, "skills"));
      expect(result!.projectDir).toBe(tempDir);
    });

    it("defaults to eject mode for an installation holding no skill", async () => {
      await writeTestTsConfig(tempDir, AN_EJECT_INSTALLATION);

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe("eject");
    });

    it("detects plugin installation when its skill comes from a marketplace", async () => {
      await writeTestTsConfig(tempDir, A_PLUGIN_INSTALLATION);

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();
      expect(result!.mode).toBe("plugin");

      expect(result!.configPath).toBe(getProjectConfigPath(tempDir, "claude"));
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
      await writeRawTestConfig(tempDir, renderUnparseableConfigTs());

      await expect(detectInstallation(tempDir)).rejects.toThrow("could not be loaded");
    });

    it("uses provided projectDir parameter", async () => {
      // Empty dir — no installation at project level
      const result = await detectProjectInstallation(tempDir);

      expect(result).toBeNull();

      // The half that can fail. The null above holds for a detection that ignored its argument
      // and read the process's own working directory whenever that directory holds no
      // installation either, so the same directory is asked again once it holds one: an answer
      // that follows the directory handed in is what says the parameter is the one being read.
      await writeTestTsConfig(tempDir, AN_EJECT_INSTALLATION);

      expect(
        await detectInstallation(tempDir),
        "detection answered for a directory other than the one it was handed",
      ).toMatchObject({ projectDir: tempDir });
    });
  });

  describe("detectProjectInstallation", () => {
    it("returns project-scoped installation when config exists", async () => {
      await writeTestTsConfig(tempDir, AN_EJECT_INSTALLATION);

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
      await writeTestTsConfig(fakeHome, AN_EJECT_INSTALLATION);

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
      await writeTestTsConfig(tempDir, AN_EJECT_INSTALLATION);

      const result = await detectInstallation(tempDir);

      expect(result).not.toBeNull();

      expect(result!.projectDir).toBe(tempDir);
    });
  });
});
