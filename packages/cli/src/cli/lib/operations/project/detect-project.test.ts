import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { buildInstallation } from "../../__tests__/factories/installation-factories.js";

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

/** What `detectInstallation` answers — handed back whole, so any installation serves. */
const MOCK_INSTALLATION = buildInstallation();

/** What `loadProjectConfig` answers — handed back whole, so any config serves. */
const MOCK_CONFIG = buildProjectConfig();

/** Where the loaded config says it was read from — the path `detectProject` reports. */
const LOADED_CONFIG_PATH = "/tmp/project/.claude-src/config.ts";

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
      configPath: LOADED_CONFIG_PATH,
      provider: "claude",
    });

    const result = await detectProject("/tmp/project");

    expect(result).toStrictEqual({
      installation: MOCK_INSTALLATION,
      config: MOCK_CONFIG,
      configPath: LOADED_CONFIG_PATH,
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
