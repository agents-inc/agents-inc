import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Installation } from "../../installation/index.js";
import type { ProjectConfig } from "../../../types/index.js";

vi.mock("../../installation/index.js", () => ({
  detectInstallation: vi.fn(),
}));

vi.mock("../../configuration/index.js", () => ({
  loadProjectConfig: vi.fn(),
}));

import { detectProject } from "./detect-project";
import { detectInstallation } from "../../installation/index.js";
import { loadProjectConfig } from "../../configuration/index.js";

const mockDetectInstallation = vi.mocked(detectInstallation);
const mockLoadProjectConfig = vi.mocked(loadProjectConfig);

const MOCK_INSTALLATION: Installation = {
  mode: "eject",
  configPath: "/tmp/project/.claude-src/config.ts",
  agentsDir: "/tmp/project/.claude/agents",
  skillsDir: "/tmp/project/.claude/skills",
  projectDir: "/tmp/project",
};

const MOCK_CONFIG: ProjectConfig = {
  name: "test-project",
  skills: [],
  agents: [],
};

describe("detectProject", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("should return null when no installation found", async () => {
    mockDetectInstallation.mockResolvedValue(null);

    const result = await detectProject("/tmp/project");

    expect(result).toBeNull();
    expect(mockLoadProjectConfig).not.toHaveBeenCalled();
  });

  it("should return installation with config when both exist", async () => {
    mockDetectInstallation.mockResolvedValue(MOCK_INSTALLATION);
    mockLoadProjectConfig.mockResolvedValue({
      config: MOCK_CONFIG,
      configPath: "/tmp/project/.claude-src/config.ts",
    });

    const result = await detectProject("/tmp/project");

    expect(result).toStrictEqual({
      installation: MOCK_INSTALLATION,
      config: MOCK_CONFIG,
      configPath: "/tmp/project/.claude-src/config.ts",
    });
  });

  it("should return installation with null config when config not found", async () => {
    mockDetectInstallation.mockResolvedValue(MOCK_INSTALLATION);
    mockLoadProjectConfig.mockResolvedValue(null);

    const result = await detectProject("/tmp/project");

    expect(result).toStrictEqual({
      installation: MOCK_INSTALLATION,
      config: null,
      configPath: null,
    });
  });

  it("should use process.cwd() when no projectDir provided", async () => {
    mockDetectInstallation.mockResolvedValue(null);

    await detectProject();

    expect(mockDetectInstallation).toHaveBeenCalledWith(process.cwd());
  });

  it("should pass projectDir to detectInstallation", async () => {
    mockDetectInstallation.mockResolvedValue(null);

    await detectProject("/custom/dir");

    expect(mockDetectInstallation).toHaveBeenCalledWith("/custom/dir");
  });
});
