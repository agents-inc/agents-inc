import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir } from "fs/promises";
import { findPluginManifest } from "./plugin-manifest-finder";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE } from "../../consts";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { writeTestPluginManifest } from "../__tests__/helpers/disk-writers";

describe("plugin-manifest-finder", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("plugin-manifest-finder-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  async function createManifest(dir: string): Promise<string> {
    // findPluginManifest checks path/existence only, not content — version is added to
    // satisfy TestPluginManifest and is never read.
    return writeTestPluginManifest(
      dir,
      { name: "test-plugin", version: "1.0.0" },
      { pretty: false },
    );
  }

  describe("findPluginManifest", () => {
    it("should find plugin.json in .claude-plugin of the start directory", async () => {
      const expectedPath = await createManifest(tempDir);

      const result = await findPluginManifest(tempDir);

      expect(result).toBe(expectedPath);
    });

    it("should find plugin.json by walking up one level", async () => {
      const childDir = path.join(tempDir, "child");
      await mkdir(childDir, { recursive: true });
      const expectedPath = await createManifest(tempDir);

      const result = await findPluginManifest(childDir);

      expect(result).toBe(expectedPath);
    });

    it("should find plugin.json by walking up multiple levels", async () => {
      const deepDir = path.join(tempDir, "level1", "level2", "level3");
      await mkdir(deepDir, { recursive: true });
      const expectedPath = await createManifest(tempDir);

      const result = await findPluginManifest(deepDir);

      expect(result).toBe(expectedPath);
    });

    it("should return null when no manifest found anywhere up to root", async () => {
      const result = await findPluginManifest(tempDir);

      expect(result).toBeNull();
    });

    it("should return the correct absolute path to the found plugin.json", async () => {
      const midDir = path.join(tempDir, "project");
      const startDir = path.join(midDir, "src", "components");
      await mkdir(startDir, { recursive: true });
      const expectedPath = await createManifest(midDir);

      const result = await findPluginManifest(startDir);

      expect(result).toBe(expectedPath);
      expect(path.isAbsolute(result!)).toBe(true);
      expect(result).toBe(path.join(midDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE));
    });

    it("should handle start directory that does not exist", async () => {
      const nonExistentDir = path.join(tempDir, "does", "not", "exist");

      const result = await findPluginManifest(nonExistentDir);

      expect(result).toBeNull();
    });

    it("should find the nearest manifest when multiple exist in ancestor chain", async () => {
      const childDir = path.join(tempDir, "project");
      const grandchildDir = path.join(childDir, "src");
      await mkdir(grandchildDir, { recursive: true });

      await createManifest(tempDir);
      const nearestPath = await createManifest(childDir);

      const result = await findPluginManifest(grandchildDir);

      expect(result).toBe(nearestPath);
    });
  });
});
