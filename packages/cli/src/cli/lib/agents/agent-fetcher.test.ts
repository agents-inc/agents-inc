import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir } from "fs/promises";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { buildSourceConfig } from "../__tests__/factories/config-factories";

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
  loadSourceRepoConfig: vi.fn(),
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

import {
  getAgentDefinitions,
  getLocalAgentDefinitions,
  fetchAgentDefinitionsFromRemote,
} from "./agent-fetcher";
import { fetchFromSource } from "../loading";
import { loadSourceRepoConfig } from "../configuration";

const mockFetchFromSource = vi.mocked(fetchFromSource);
const mockLoadSourceRepoConfig = vi.mocked(loadSourceRepoConfig);

const REMOTE_SOURCE = "github:my-org/agents";

/**
 * Creates a fetched-source dir holding `agentsSubdir` — or holding nothing, for `null` — and
 * points the fetchFromSource mock at it. Returns the fetched dir.
 *
 * The subdirectory is named at every call rather than defaulted, because it is what the
 * assertions read back: a case asserting the default `src/agents` passes only when that is the
 * directory the fetched source actually holds.
 */
async function mockFetchedRemote(tempDir: string, agentsSubdir: string | null): Promise<string> {
  const fetchedDir = path.join(tempDir, "fetched");
  await mkdir(agentsSubdir === null ? fetchedDir : path.join(fetchedDir, agentsSubdir), {
    recursive: true,
  });
  mockFetchFromSource.mockResolvedValue({
    path: fetchedDir,
    fromCache: false,
    source: REMOTE_SOURCE,
  });
  return fetchedDir;
}

async function createAgentDirStructure(root: string): Promise<void> {
  await mkdir(path.join(root, "src/agents"), { recursive: true });
}

describe("agent-fetcher", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("agent-fetcher-test-");
    MOCK_PROJECT_ROOT = tempDir;
    mockFetchFromSource.mockReset();
    mockLoadSourceRepoConfig.mockReset();
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
        sourcePath: tempDir,
      });
    });

    it("should throw when agents directory does not exist", async () => {
      // Empty temp dir — no agents directory
      await expect(getLocalAgentDefinitions()).rejects.toThrow("Agent partials not found at '");
    });
  });

  describe("fetchAgentDefinitionsFromRemote", () => {
    it("should fetch agent definitions from remote source", async () => {
      // Create a temp dir simulating the fetched remote content
      const fetchedDir = await mockFetchedRemote(tempDir, "src/agents");

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(mockFetchFromSource).toHaveBeenCalledWith(REMOTE_SOURCE, { subdir: "" });
      expect(result).toStrictEqual({
        agentsDir: path.join(fetchedDir, "src", "agents"),
        sourcePath: fetchedDir,
      });
    });

    it("should throw when remote agents directory does not exist", async () => {
      // Fetched dir exists but has no agents subdirectory
      await mockFetchedRemote(tempDir, null);

      await expect(fetchAgentDefinitionsFromRemote(REMOTE_SOURCE)).rejects.toThrow(
        "Agent partials not found at '",
      );
    });

    it("when fetchFromSource throws a network error, should propagate it to caller", async () => {
      mockFetchFromSource.mockRejectedValue(new Error(`Network error fetching: ${REMOTE_SOURCE}`));

      await expect(fetchAgentDefinitionsFromRemote(REMOTE_SOURCE)).rejects.toThrow(
        "Network error fetching:",
      );
    });

    it("should use custom agentsDir when provided", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir, "lib/agents");

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE, {
        agentsDir: "lib/agents",
      });

      expect(result.agentsDir).toBe(path.join(fetchedDir, "lib/agents"));
    });

    it("should use default DIRS.agents when agentsDir is not provided", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir, "src/agents");

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(result.agentsDir).toBe(path.join(fetchedDir, "src/agents"));
    });

    it("should use agentsDir from source project config when set", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir, "lib/agents");

      // Source config declares custom agentsDir
      mockLoadSourceRepoConfig.mockResolvedValue(buildSourceConfig({ agentsDir: "lib/agents" }));

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(mockLoadSourceRepoConfig).toHaveBeenCalledWith(fetchedDir);
      expect(result.agentsDir).toBe(path.join(fetchedDir, "lib/agents"));
    });

    it("should fall back to default agents dir when source config has no agentsDir", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir, "src/agents");

      // Source config exists but without agentsDir
      mockLoadSourceRepoConfig.mockResolvedValue(
        buildSourceConfig({ marketplace: "github:myorg/skills" }),
      );

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(result.agentsDir).toBe(path.join(fetchedDir, "src/agents"));
    });

    it("should fall back to default when source has no config at all", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir, "src/agents");

      // No source config found
      mockLoadSourceRepoConfig.mockResolvedValue(null);

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE);

      expect(result.agentsDir).toBe(path.join(fetchedDir, "src/agents"));
    });

    it("should prefer explicit agentsDir option over source config agentsDir", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir, "custom/agents");

      // Source config declares one path, but explicit option takes precedence
      mockLoadSourceRepoConfig.mockResolvedValue(buildSourceConfig({ agentsDir: "lib/agents" }));

      const result = await fetchAgentDefinitionsFromRemote(REMOTE_SOURCE, {
        agentsDir: "custom/agents",
      });

      // Should NOT call loadSourceRepoConfig when explicit option is provided
      expect(mockLoadSourceRepoConfig).not.toHaveBeenCalled();
      expect(result.agentsDir).toBe(path.join(fetchedDir, "custom/agents"));
    });

    it("should throw when agentsDir from config points to non-existent directory", async () => {
      await mockFetchedRemote(tempDir, null);

      // Source config points to a directory that doesn't exist
      mockLoadSourceRepoConfig.mockResolvedValue(
        buildSourceConfig({ agentsDir: "nonexistent/agents" }),
      );

      await expect(fetchAgentDefinitionsFromRemote(REMOTE_SOURCE)).rejects.toThrow(
        "Agent partials not found at '",
      );
    });
  });

  describe("getAgentDefinitions", () => {
    it("should delegate to fetchAgentDefinitionsFromRemote when remoteSource is provided", async () => {
      const fetchedDir = await mockFetchedRemote(tempDir, "src/agents");

      const result = await getAgentDefinitions(REMOTE_SOURCE);

      expect(mockFetchFromSource).toHaveBeenCalledWith(REMOTE_SOURCE, { subdir: "" });
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
  });
});
