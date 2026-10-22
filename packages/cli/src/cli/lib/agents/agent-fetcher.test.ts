import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir } from "fs/promises";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";

vi.mock("../../utils/logger");

let MOCK_PROJECT_ROOT: string;

vi.mock("../../consts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../consts")>();
  return {
    ...actual,
    get PROJECT_ROOT() {
      return MOCK_PROJECT_ROOT;
    },
  };
});

import { getLocalAgentDefinitions } from "./agent-fetcher";
import { verbose } from "../../utils/logger";

async function createAgentDirStructure(root: string): Promise<void> {
  await mkdir(path.join(root, "src/agents"), { recursive: true });
}

describe("agent-fetcher", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("agent-fetcher-test-");
    MOCK_PROJECT_ROOT = tempDir;
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
      await expect(getLocalAgentDefinitions()).rejects.toThrow("Agent partials not found at '");
    });
  });

  describe("what fetching agent partials says", () => {
    beforeEach(() => {
      vi.mocked(verbose).mockClear();
    });

    it("says it loaded the CLI's own partials, and from where", async () => {
      await createAgentDirStructure(tempDir);

      await getLocalAgentDefinitions();

      expect(verbose).toHaveBeenCalledExactlyOnceWith(
        `Agent partials loaded from CLI: ${path.join(tempDir, "src/agents")}`,
      );
    });
  });
});
