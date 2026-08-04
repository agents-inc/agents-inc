import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../loading/index.js", () => ({
  loadSkillsMatrixFromSource: vi.fn(),
}));

vi.mock("../../../utils/logger.js", () => ({
  enableBuffering: vi.fn(),
  drainBuffer: vi.fn(),
  disableBuffering: vi.fn(),
  verbose: vi.fn(),
  warn: vi.fn(),
  setVerbose: vi.fn(),
  log: vi.fn(),
  pushBufferMessage: vi.fn(),
}));

import { loadSource } from "./load-source";
import { loadSkillsMatrixFromSource } from "../../loading/index.js";
import { enableBuffering, drainBuffer, disableBuffering } from "../../../utils/logger.js";
import type { SourceLoadResult } from "../../loading/index.js";

const mockLoadSkillsMatrixFromSource = vi.mocked(loadSkillsMatrixFromSource);
const mockEnableBuffering = vi.mocked(enableBuffering);
const mockDrainBuffer = vi.mocked(drainBuffer);
const mockDisableBuffering = vi.mocked(disableBuffering);

// Boundary cast: partial mock — loadSource passes this through without inspecting shape
const MOCK_SOURCE_RESULT = {
  matrix: { skills: {}, categories: {} },
  sourceConfig: {
    source: "github:test/source",
    sourceOrigin: "default",
  },
  sourcePath: "/tmp/test-source",
  isLocal: false,
} as SourceLoadResult;

describe("loadSource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockLoadSkillsMatrixFromSource.mockResolvedValue(MOCK_SOURCE_RESULT);
    mockDrainBuffer.mockReturnValue([]);
  });

  it("should load source without buffering when captureStartupMessages is false", async () => {
    const result = await loadSource({
      projectDir: "/tmp/project",
      captureStartupMessages: false,
    });

    expect(mockLoadSkillsMatrixFromSource).toHaveBeenCalledWith({
      sourceFlag: undefined,
      projectDir: "/tmp/project",
      forceRefresh: undefined,
    });
    expect(result.sourceResult).toStrictEqual(MOCK_SOURCE_RESULT);
    expect(result.startupMessages).toStrictEqual([]);
  });

  it("should load source without buffering when captureStartupMessages is undefined", async () => {
    const result = await loadSource({
      projectDir: "/tmp/project",
    });

    expect(mockEnableBuffering).not.toHaveBeenCalled();
    expect(mockDrainBuffer).not.toHaveBeenCalled();
    expect(mockDisableBuffering).not.toHaveBeenCalled();
    expect(result.sourceResult).toStrictEqual(MOCK_SOURCE_RESULT);
    expect(result.startupMessages).toStrictEqual([]);
  });

  it("should enable buffering, drain, and disable when captureStartupMessages is true", async () => {
    const messages = [{ level: "warn" as const, text: "test warning" }];
    mockDrainBuffer.mockReturnValue(messages);

    await loadSource({
      projectDir: "/tmp/project",
      captureStartupMessages: true,
    });

    expect(mockEnableBuffering).toHaveBeenCalledOnce();
    expect(mockDrainBuffer).toHaveBeenCalledOnce();
    expect(mockDisableBuffering).toHaveBeenCalledOnce();
  });

  it("should return startup messages when captureStartupMessages is true", async () => {
    const messages = [
      { level: "warn" as const, text: "warning 1" },
      { level: "info" as const, text: "info 1" },
    ];
    mockDrainBuffer.mockReturnValue(messages);

    const result = await loadSource({
      projectDir: "/tmp/project",
      captureStartupMessages: true,
    });

    expect(result.startupMessages).toStrictEqual(messages);
  });

  it("should disable buffering on error when captureStartupMessages is true", async () => {
    const error = new Error("Source resolution failed");
    mockLoadSkillsMatrixFromSource.mockRejectedValue(error);

    await expect(
      loadSource({
        projectDir: "/tmp/project",
        captureStartupMessages: true,
      }),
    ).rejects.toThrow("Source resolution failed");

    expect(mockEnableBuffering).toHaveBeenCalledOnce();
    expect(mockDisableBuffering).toHaveBeenCalledOnce();
    expect(mockDrainBuffer).not.toHaveBeenCalled();
  });

  it("should re-throw errors from loadSkillsMatrixFromSource", async () => {
    const error = new Error("Network error");
    mockLoadSkillsMatrixFromSource.mockRejectedValue(error);

    await expect(
      loadSource({
        projectDir: "/tmp/project",
      }),
    ).rejects.toThrow("Network error");
  });

  it("should not call enableBuffering when captureStartupMessages is false", async () => {
    await loadSource({
      projectDir: "/tmp/project",
      captureStartupMessages: false,
    });

    expect(mockEnableBuffering).not.toHaveBeenCalled();
  });

  it("should pass sourceFlag and forceRefresh through to loadSkillsMatrixFromSource", async () => {
    await loadSource({
      projectDir: "/tmp/project",
      sourceFlag: "github:custom/source",
      forceRefresh: true,
    });

    expect(mockLoadSkillsMatrixFromSource).toHaveBeenCalledWith({
      sourceFlag: "github:custom/source",
      projectDir: "/tmp/project",
      forceRefresh: true,
    });
  });
});
