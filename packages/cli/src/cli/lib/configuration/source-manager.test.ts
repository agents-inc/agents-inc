import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addSource, removeSource, getSourceSummary } from "./source-manager";
import { loadProjectSourceConfig } from "./config";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { buildSourceConfig } from "../__tests__/factories/config-factories.js";
import { fetchMarketplace } from "../loading/source-fetcher";
import { discoverLocalSkills } from "../skills/local-skill-loader";
import { discoverAllPluginSkills } from "../plugins/plugin-discovery";

// Mock the source-fetcher module
vi.mock("../loading/source-fetcher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../loading/source-fetcher")>()),
  fetchMarketplace: vi.fn(),
}));

// Mock the local-skill-loader module
vi.mock("../skills/local-skill-loader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../skills/local-skill-loader")>()),
  discoverLocalSkills: vi.fn(),
}));

// Mock the plugin-discovery module
vi.mock("../plugins/plugin-discovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plugins/plugin-discovery")>()),
  discoverAllPluginSkills: vi.fn().mockResolvedValue({}),
}));

const mockFetchMarketplace = vi.mocked(fetchMarketplace);
const mockDiscoverLocalSkills = vi.mocked(discoverLocalSkills);
const mockDiscoverAllPluginSkills = vi.mocked(discoverAllPluginSkills);

describe("source-manager", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-source-mgr-test-");
    vi.resetAllMocks();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("addSource", () => {
    it("should add a source after validating via fetchMarketplace", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ name: "test-project" }));

      mockFetchMarketplace.mockResolvedValue({
        marketplace: {
          name: "acme-corp",
          version: "1.0.0",
          owner: { name: "Acme Corp" },
          plugins: [
            { name: "skill-1", source: "skills/skill-1", category: "web-framework" },
            { name: "skill-2", source: "skills/skill-2", category: "api-database" },
          ],
        },
        sourcePath: "/tmp/cached",
        fromCache: false,
      });

      const result = await addSource(tempDir, "github:acme-corp/claude-skills");

      expect(result.name).toBe("acme-corp");
      expect(result.skillCount).toBe(2);
      expect(fetchMarketplace).toHaveBeenCalledWith("github:acme-corp/claude-skills", {
        forceRefresh: true,
      });

      // Verify it was saved to config
      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.sources).toStrictEqual([
        { name: "acme-corp", url: "github:acme-corp/claude-skills" },
      ]);
    });

    it("should throw if source name already exists", async () => {
      // Set up existing config
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          sources: [{ name: "acme-corp", url: "github:acme-corp/skills" }],
        }),
      );

      mockFetchMarketplace.mockResolvedValue({
        marketplace: {
          name: "acme-corp",
          version: "1.0.0",
          owner: { name: "Acme Corp" },
          plugins: [],
        },
        sourcePath: "/tmp/cached",
        fromCache: false,
      });

      await expect(addSource(tempDir, "github:acme-corp/other-skills")).rejects.toThrow(
        'Source "acme-corp" already exists',
      );
    });

    it("should throw if fetchMarketplace fails", async () => {
      mockFetchMarketplace.mockRejectedValue(new Error("Repository not found"));

      await expect(addSource(tempDir, "github:nonexistent/repo")).rejects.toThrow(
        "Repository not found",
      );
    });

    it("should add a source when config exists but has no sources array", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({ name: "test-project", source: "github:custom/skills" }),
      );

      mockFetchMarketplace.mockResolvedValue({
        marketplace: {
          name: "team-skills",
          version: "1.0.0",
          owner: { name: "Team" },
          plugins: [{ name: "skill-a", source: "skills/skill-a", category: "web-framework" }],
        },
        sourcePath: "/tmp/cached",
        fromCache: false,
      });

      const result = await addSource(tempDir, "github:team/skills");

      expect(result.name).toBe("team-skills");
      expect(result.skillCount).toBe(1);

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.sources).toStrictEqual([{ name: "team-skills", url: "github:team/skills" }]);
      expect(config?.source).toBe("github:custom/skills");
    });

    it("should throw when no config file exists", async () => {
      mockFetchMarketplace.mockResolvedValue({
        marketplace: {
          name: "new-source",
          version: "1.0.0",
          owner: { name: "Owner" },
          plugins: [],
        },
        sourcePath: "/tmp/cached",
        fromCache: false,
      });

      await expect(addSource(tempDir, "github:owner/new-source")).rejects.toThrow(
        "no project config found",
      );
    });

    it("should not save config when duplicate check fails", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          sources: [{ name: "existing", url: "github:org/existing" }],
        }),
      );

      mockFetchMarketplace.mockResolvedValue({
        marketplace: {
          name: "existing",
          version: "1.0.0",
          owner: { name: "Org" },
          plugins: [{ name: "s1", source: "skills/s1", category: "web-framework" }],
        },
        sourcePath: "/tmp/cached",
        fromCache: false,
      });

      await expect(addSource(tempDir, "github:org/another")).rejects.toThrow(
        'Source "existing" already exists',
      );

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.sources).toHaveLength(1);
    });
  });

  describe("removeSource", () => {
    it("should remove a source by name", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          name: "test-project",
          sources: [
            { name: "acme-corp", url: "github:acme-corp/skills" },
            { name: "team-skills", url: "github:team/skills" },
          ],
        }),
      );

      await removeSource(tempDir, "acme-corp");

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.sources).toStrictEqual([{ name: "team-skills", url: "github:team/skills" }]);
    });

    it("should throw when trying to remove 'public'", async () => {
      await expect(removeSource(tempDir, "public")).rejects.toThrow(
        'Cannot remove the "public" source',
      );
    });

    it("should throw when source not found", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          name: "test-project",
          sources: [{ name: "acme-corp", url: "github:acme-corp/skills" }],
        }),
      );

      await expect(removeSource(tempDir, "nonexistent")).rejects.toThrow(
        'Source "nonexistent" not found',
      );
    });

    it("should result in empty sources array when removing the last source", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          name: "test-project",
          sources: [{ name: "only-source", url: "github:org/only" }],
        }),
      );

      await removeSource(tempDir, "only-source");

      const config = await loadProjectSourceConfig(tempDir);
      expect(config?.sources).toStrictEqual([]);
    });

    it("should throw when source not found and no config file exists", async () => {
      await expect(removeSource(tempDir, "nonexistent")).rejects.toThrow(
        'Source "nonexistent" not found',
      );
    });

    it("should throw when source not found and config has no sources array", async () => {
      await writeTestTsConfig(tempDir, buildSourceConfig({ source: "github:custom/skills" }));

      await expect(removeSource(tempDir, "nonexistent")).rejects.toThrow(
        'Source "nonexistent" not found',
      );
    });
  });

  describe("getSourceSummary", () => {
    it("should return default public source when no config exists", async () => {
      mockDiscoverLocalSkills.mockResolvedValue(null);

      const summary = await getSourceSummary(tempDir);

      expect(summary.sources).toHaveLength(1);
      expect(summary.sources[0].name).toBe("public");
      expect(summary.sources[0].enabled).toBe(true);
      expect(summary.localSkillCount).toBe(0);
      expect(summary.pluginSkillCount).toBe(0);
    });

    it("should include configured sources", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          sources: [{ name: "acme-corp", url: "github:acme-corp/skills" }],
        }),
      );

      mockDiscoverLocalSkills.mockResolvedValue(null);

      const summary = await getSourceSummary(tempDir);

      expect(summary.sources).toHaveLength(2);
      expect(summary.sources[0].name).toBe("public");
      expect(summary.sources[1].name).toBe("acme-corp");
      expect(summary.sources[1].url).toBe("github:acme-corp/skills");
    });

    it("should count local skills", async () => {
      mockDiscoverLocalSkills.mockResolvedValue({
        // Boundary cast: only the array length feeds localSkillCount
        skills: [{ id: "skill-1" }, { id: "skill-2" }, { id: "skill-3" }] as never,
        localSkillsPath: "/project/.claude/skills",
      });

      const summary = await getSourceSummary(tempDir);

      expect(summary.localSkillCount).toBe(3);
    });

    it("when discoverLocalSkills throws a permission error, should return localSkillCount of 0", async () => {
      mockDiscoverLocalSkills.mockRejectedValue(new Error("Permission denied"));

      const summary = await getSourceSummary(tempDir);

      expect(summary.localSkillCount).toBe(0);
    });

    it("should count plugin skills via discoverAllPluginSkills", async () => {
      mockDiscoverLocalSkills.mockResolvedValue(null);

      mockDiscoverAllPluginSkills.mockResolvedValue({
        "web-framework-react": {
          id: "web-framework-react",
          path: "skills/react/",
          description: "React",
        },
        "web-state-zustand": {
          id: "web-state-zustand",
          path: "skills/zustand/",
          description: "Zustand",
        },
        // Boundary cast: only the key count feeds pluginSkillCount
      } as never);

      const summary = await getSourceSummary(tempDir);

      expect(summary.pluginSkillCount).toBe(2);
    });

    it("should return pluginSkillCount of 0 when discoverAllPluginSkills throws", async () => {
      mockDiscoverLocalSkills.mockResolvedValue(null);

      mockDiscoverAllPluginSkills.mockRejectedValue(new Error("ENOENT: no such file or directory"));

      const summary = await getSourceSummary(tempDir);

      expect(summary.pluginSkillCount).toBe(0);
    });

    it("should use custom source URL from config for public source", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          source: "github:custom-org/custom-skills",
        }),
      );

      mockDiscoverLocalSkills.mockResolvedValue(null);

      const summary = await getSourceSummary(tempDir);

      expect(summary.sources[0].name).toBe("public");
      expect(summary.sources[0].url).toBe("github:custom-org/custom-skills");
    });

    it("should include multiple configured sources in order", async () => {
      await writeTestTsConfig(
        tempDir,
        buildSourceConfig({
          sources: [
            { name: "source-a", url: "github:org/source-a" },
            { name: "source-b", url: "github:org/source-b" },
            { name: "source-c", url: "github:org/source-c" },
          ],
        }),
      );

      mockDiscoverLocalSkills.mockResolvedValue(null);

      const summary = await getSourceSummary(tempDir);

      expect(summary.sources).toHaveLength(4);
      expect(summary.sources.map((s) => s.name)).toStrictEqual([
        "public",
        "source-a",
        "source-b",
        "source-c",
      ]);
      expect(summary.sources.every((s) => s.enabled)).toBe(true);
    });

    it("should return 0 local skills when discoverLocalSkills returns empty array", async () => {
      mockDiscoverLocalSkills.mockResolvedValue({
        skills: [],
        localSkillsPath: "/project/.claude/skills",
      });

      const summary = await getSourceSummary(tempDir);

      expect(summary.localSkillCount).toBe(0);
    });

    it("should count both local and plugin skills together", async () => {
      mockDiscoverLocalSkills.mockResolvedValue({
        // Boundary cast: only the array length feeds localSkillCount
        skills: [{ id: "local-1" }, { id: "local-2" }] as never,
        localSkillsPath: "/project/.claude/skills",
      });

      mockDiscoverAllPluginSkills.mockResolvedValue({
        "web-framework-react": {
          id: "web-framework-react",
          path: "skills/react/",
          description: "React",
        },
        "web-state-zustand": {
          id: "web-state-zustand",
          path: "skills/zustand/",
          description: "Zustand",
        },
        "api-framework-hono": {
          id: "api-framework-hono",
          path: "skills/hono/",
          description: "Hono",
        },
      } as never);

      const summary = await getSourceSummary(tempDir);

      expect(summary.localSkillCount).toBe(2);
      expect(summary.pluginSkillCount).toBe(3);
    });
  });
});
