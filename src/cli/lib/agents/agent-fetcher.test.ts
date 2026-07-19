import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir } from "fs/promises";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";

// Mock logger (suppress verbose output during tests)
vi.mock("../../utils/logger");

// Mock fetchFromSource (network call — must remain mocked)
vi.mock("../loading", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../loading")>()),
  fetchFromSource: vi.fn(),
}));

// Mock configuration — avoids real filesystem reads for source config
vi.mock("../configuration", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../configuration")>()),
  loadProjectSourceConfig: vi.fn(),
}));

let MOCK_PROJECT_ROOT: string;

// Mock consts — PROJECT_ROOT points to a temp dir set up per test
vi.mock("../../consts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../consts")>();
  return {
    ...actual,
    get PROJECT_ROOT() {
      return MOCK_PROJECT_ROOT;
    },
  };
});

import { CLAUDE_DIR } from "../../consts";
import {
  getAgentDefinitions,
  getLocalAgentDefinitions,
  fetchAgentDefinitionsFromRemote,
} from "./agent-fetcher";
import { fetchFromSource } from "../loading";
import { loadProjectSourceConfig } from "../configuration";

const mockFetchFromSource = vi.mocked(fetchFromSource);
const mockLoadProjectSourceConfig = vi.mocked(loadProjectSourceConfig);

const REMOTE_SOURCE = "github:my-org/agents";

/**
 * Creates a fetched-source dir containing `agentsSubdir` and points the
 * fetchFromSource mock at it. Returns the fetched dir.
 */
async function mockFetchedRemote(
  tempDir: string,
  agentsSubdir = "src/agents/_templates",
): Promise<string> {
  const fetchedDir = path.join(tempDir, "fetched");
  await mkdir(path.join(fetchedDir, agentsSubdir), { recursive: true });
  mockFetchFromSource.mockResolvedValue({
    path: fetchedDir,
    fromCache: false,
    source: REMOTE_SOURCE,
  });
  return fetchedDir;
}

async function createAgentDirStructure(
  root: string,
  options: { agents?: boolean; templates?: boolean } = {},
): Promise<void> {
  const { agents = true, templates = true } = options;
  if (agents) {
    await mkdir(path.join(root, "src/agents"), { recursive: true });
  }
  if (templates) {
    await mkdir(path.join(root, "src/agents/_templates"), { recursive: true });
  }
}

describe("agent-fetcher", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("agent-fetcher-test-");
    MOCK_PROJECT_ROOT = tempDir;
    mockFetchFromSource.mockReset();
    mockLoadProjectSourceConfig.mockReset();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("getLocalAgentDefinitions", () => {
    it("should return agent source paths when agents directory exists", async () => {
      await createAgentDirStructure(tempDir);

      const result = await getLocalAgentDefinitions();

      expect(result).toStrictEqual({
        agentsDir: path.join(tempDir, "src/agents"),
        templatesDir: path.join(tempDir, "src/agents/_templates"),
        sourcePath: tempDir,
      });
    });

    it("should throw when agents directory does not exist", async () => {
      // Empty temp dir — no agents directory
      await expect(getLocalAgentDefinitions()).rejects.toThrow("Agent partials not found at '");
    });

    it("should use local templates when projectDir is provided and local templates exist", async () => {
      await createAgentDirStructure(tempDir);

      // Create local templates in a separate project dir
      const projectDir = path.join(tempDir, "my-project");
      await mkdir(path.join(projectDir, CLAUDE_DIR, "templates"), { recursive: true });

      const result = await getLocalAgentDefinitions({ projectDir });

      expect(result.templatesDir).toBe(path.join(projectDir, CLAUDE_DIR, "templates"));
      expect(result.agentsDir).toBe(path.join(tempDir, "src/agents"));
      expect(result.sourcePath).toBe(tempDir);
    });

    it("should fall back to default templates when local templates directory does not exist", async () => {
      await createAgentDirStructure(tempDir);

      // Project dir without local templates
      const projectDir = path.join(tempDir, "my-project");
      await mkdir(projectDir, { recursive: true });

      const result = await getLocalAgentDefinitions({ projectDir });

      expect(result.templatesDir).toBe(path.join(tempDir, "src/agents/_templates"));
    });

    it("should still succeed when templates directory does not exist", async () => {
      // Create agents dir but NOT templates dir
      await createAgentDirStructure(tempDir, { templates: false });

      const result = await getLocalAgentDefinitions();
      expect(result.agentsDir).toBe(path.join(tempDir, "src/agents"));
      expect(result.templatesDir).toBe(path.join(tempDir, "src/agents/_templates"));
    });
  });

  describe("fetchAgentDefinitionsFromRemote", () => {
    it("should fetch agent definitions from remote source", async () => {
      // Create a temp dir simulating the fetched remote content
      const fetchedDir = await mockFetchedRemote(tempDir);

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(mockFetchFromSource).toHaveBeenCalledWith(REMOTE_SOURCE, {
        forceRefresh: undefined,
        subdir: "",
      });
      expect(result).toStrictEqual({
        agentsDir: path.join(fetchedDir, "src", "agents"),
        templatesDir: path.join(fetchedDir, "src", "agents", "_templates"),
        sourcePath: fetchedDir,
      });
    });

    it("should pass forceRefresh option to fetchFromSource", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir);

      await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE, {
        forceRefresh: true,
      });

      expect(mockFetchFromSource).toHaveBeenCalledWith(REMOTE_SOURCE, {
        forceRefresh: true,
        subdir: "",
      });
    });

    it("should throw when remote agents directory does not exist", async () => {
      // Fetched dir exists but has no agents subdirectory
      const fetchedDir = path.join(tempDir, "fetched-empty");
      await mkdir(fetchedDir, { recursive: true });

      mockFetchFromSource.mockResolvedValue({
        path: fetchedDir,
        fromCache: false,
        source: REMOTE_SOURCE,
      });

      await expect(fetchAgentDefinitionsFromRemote(REMOTE_SOURCE)).rejects.toThrow(
        "Agent partials not found at '",
      );
    });

    it("when fetchFromSource throws a network error, should propagate it to caller", async () => {
      mockFetchFromSource.mockRejectedValue(
        new Error("Network error fetching: github:my-org/agents"),
      );

      await expect(fetchAgentDefinitionsFromRemote(REMOTE_SOURCE)).rejects.toThrow(
        "Network error fetching:",
      );
    });

    it("should use custom agentsDir when provided", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir, "lib/agents/_templates");

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE, {
        agentsDir: "lib/agents",
      });

      expect(result.agentsDir).toBe(path.join(fetchedDir, "lib/agents"));
      expect(result.templatesDir).toBe(path.join(fetchedDir, "lib/agents", "_templates"));
    });

    it("should use default DIRS.agents when agentsDir is not provided", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir);

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(result.agentsDir).toBe(path.join(fetchedDir, "src/agents"));
    });

    it("should succeed even when remote templates directory does not exist", async () => {
      const fetchedDir = path.join(tempDir, "fetched");
      // Create agents dir but NOT templates dir
      await mkdir(path.join(fetchedDir, "src/agents"), { recursive: true });

      mockFetchFromSource.mockResolvedValue({
        path: fetchedDir,
        fromCache: false,
        source: REMOTE_SOURCE,
      });

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(result.agentsDir).toBe(path.join(fetchedDir, "src", "agents"));
      expect(result.templatesDir).toBe(path.join(fetchedDir, "src", "agents", "_templates"));
    });

    it("should use agentsDir from source project config when set", async () => {
      const fetchedDir = path.join(tempDir, "fetched-config");
      await mkdir(path.join(fetchedDir, "lib/agents/_templates"), { recursive: true });

      mockFetchFromSource.mockResolvedValue({
        path: fetchedDir,
        fromCache: false,
        source: REMOTE_SOURCE,
      });

      // Source config declares custom agentsDir
      mockLoadProjectSourceConfig.mockResolvedValue({
        agentsDir: "lib/agents",
      });

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(mockLoadProjectSourceConfig).toHaveBeenCalledWith(fetchedDir);
      expect(result.agentsDir).toBe(path.join(fetchedDir, "lib/agents"));
      expect(result.templatesDir).toBe(path.join(fetchedDir, "lib/agents", "_templates"));
    });

    it("should fall back to default agents dir when source config has no agentsDir", async () => {
      const fetchedDir = path.join(tempDir, "fetched-no-agents-dir");
      await mkdir(path.join(fetchedDir, "src/agents/_templates"), { recursive: true });

      mockFetchFromSource.mockResolvedValue({
        path: fetchedDir,
        fromCache: false,
        source: REMOTE_SOURCE,
      });

      // Source config exists but without agentsDir
      mockLoadProjectSourceConfig.mockResolvedValue({
        source: "github:myorg/skills",
      });

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(result.agentsDir).toBe(path.join(fetchedDir, "src/agents"));
    });

    it("should fall back to default when source has no config at all", async () => {
      const fetchedDir = path.join(tempDir, "fetched-no-config");
      await mkdir(path.join(fetchedDir, "src/agents/_templates"), { recursive: true });

      mockFetchFromSource.mockResolvedValue({
        path: fetchedDir,
        fromCache: false,
        source: REMOTE_SOURCE,
      });

      // No source config found
      mockLoadProjectSourceConfig.mockResolvedValue(null);

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(result.agentsDir).toBe(path.join(fetchedDir, "src/agents"));
    });

    it("should prefer explicit agentsDir option over source config agentsDir", async () => {
      const fetchedDir = path.join(tempDir, "fetched-override");
      await mkdir(path.join(fetchedDir, "custom/agents/_templates"), { recursive: true });

      mockFetchFromSource.mockResolvedValue({
        path: fetchedDir,
        fromCache: false,
        source: REMOTE_SOURCE,
      });

      // Source config declares one path, but explicit option takes precedence
      mockLoadProjectSourceConfig.mockResolvedValue({
        agentsDir: "lib/agents",
      });

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE, {
        agentsDir: "custom/agents",
      });

      // Should NOT call loadProjectSourceConfig when explicit option is provided
      expect(mockLoadProjectSourceConfig).not.toHaveBeenCalled();
      expect(result.agentsDir).toBe(path.join(fetchedDir, "custom/agents"));
    });

    it("should throw when agentsDir from config points to non-existent directory", async () => {
      const fetchedDir = path.join(tempDir, "fetched-bad-config");
      await mkdir(fetchedDir, { recursive: true });

      mockFetchFromSource.mockResolvedValue({
        path: fetchedDir,
        fromCache: false,
        source: REMOTE_SOURCE,
      });

      // Source config points to a directory that doesn't exist
      mockLoadProjectSourceConfig.mockResolvedValue({
        agentsDir: "nonexistent/agents",
      });

      await expect(fetchAgentDefinitionsFromRemote(REMOTE_SOURCE)).rejects.toThrow(
        "Agent partials not found at '",
      );
    });
  });

  describe("getAgentDefinitions", () => {
    it("should delegate to fetchAgentDefinitionsFromRemote when remoteSource is provided", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir);

      const result = await getAgentDefinitions(REMOTE_SOURCE);

      expect(mockFetchFromSource).toHaveBeenCalledWith(REMOTE_SOURCE, {
        forceRefresh: undefined,
        subdir: "",
      });
      expect(result.sourcePath).toBe(fetchedDir);
    });

    it("should delegate to getLocalAgentDefinitions when no remoteSource is provided", async () => {
      await createAgentDirStructure(tempDir);

      const result = await getAgentDefinitions();

      expect(mockFetchFromSource).not.toHaveBeenCalled();
      expect(result.sourcePath).toBe(tempDir);
    });

    it("should delegate to getLocalAgentDefinitions when remoteSource is undefined", async () => {
      await createAgentDirStructure(tempDir);

      const result = await getAgentDefinitions(undefined);

      expect(mockFetchFromSource).not.toHaveBeenCalled();
      expect(result.sourcePath).toBe(tempDir);
    });

    it("should pass options through to fetchAgentDefinitionsFromRemote", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir);

      await getAgentDefinitions(REMOTE_SOURCE, { forceRefresh: true });

      expect(mockFetchFromSource).toHaveBeenCalledWith(REMOTE_SOURCE, {
        forceRefresh: true,
        subdir: "",
      });
    });

    it("should pass projectDir option through to getLocalAgentDefinitions", async () => {
      await createAgentDirStructure(tempDir);

      // Create local templates in project dir
      const projectDir = path.join(tempDir, "my-project");
      await mkdir(path.join(projectDir, CLAUDE_DIR, "templates"), { recursive: true });

      const result = await getAgentDefinitions(undefined, { projectDir });

      expect(result.templatesDir).toBe(path.join(projectDir, CLAUDE_DIR, "templates"));
    });
  });
});
