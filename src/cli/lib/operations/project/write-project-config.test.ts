import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentDefinition, AgentName, ProjectConfig } from "../../../types";
import type { WizardResultV2 } from "../../../components/wizard/wizard";
import type { SourceLoadResult } from "../../loading/source-loader";
import { createMockAgent } from "../../__tests__/factories/agent-factories";
import {
  buildWizardResult,
  buildProjectConfig,
  buildSourceResult,
} from "../../__tests__/factories/config-factories";
import { buildSkillConfigs } from "../../__tests__/helpers/wizard-simulation";
import { EMPTY_MATRIX } from "../../__tests__/mock-data/mock-matrices";

// --- Module-level mocks ---

// Use vi.hoisted so mock fn is available when vi.mock factory runs (hoisted to top)
const { mockRealpathSync } = vi.hoisted(() => ({
  mockRealpathSync: vi.fn((p: string) => p),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      realpathSync: mockRealpathSync,
    },
  };
});

vi.mock("../../installation/index.js", () => ({
  buildAndMergeConfig: vi.fn(),
  writeScopedConfigs: vi.fn(),
  resolveInstallPaths: vi.fn(),
}));

vi.mock("../../loading/index.js", () => ({
  loadAllAgents: vi.fn(),
}));

vi.mock("../../configuration/config-writer.js", () => ({
  ensureBlankGlobalConfig: vi.fn(),
}));

vi.mock("../../../utils/fs.js", () => ({
  ensureDir: vi.fn(),
}));

// --- Imports after mocks ---

import { writeProjectConfig } from "./write-project-config";
import {
  buildAndMergeConfig,
  writeScopedConfigs,
  resolveInstallPaths,
} from "../../installation/index.js";
import { loadAllAgents } from "../../loading/index.js";
import { ensureBlankGlobalConfig } from "../../configuration/config-writer.js";
import { ensureDir } from "../../../utils/fs.js";

const mockBuildAndMergeConfig = vi.mocked(buildAndMergeConfig);
const mockWriteScopedConfigs = vi.mocked(writeScopedConfigs);
const mockResolveInstallPaths = vi.mocked(resolveInstallPaths);
const mockLoadAllAgents = vi.mocked(loadAllAgents);
const mockEnsureBlankGlobalConfig = vi.mocked(ensureBlankGlobalConfig);
const mockEnsureDir = vi.mocked(ensureDir);

describe("write-project-config", () => {
  const projectDir = "/test/project";
  const sourcePath = "/test/source";
  const configPath = "/test/project/.claude-src/config.ts";
  const finalConfig = buildProjectConfig({ name: "test-project" });

  let wizardResult: WizardResultV2;
  let sourceResult: SourceLoadResult;

  beforeEach(() => {
    vi.clearAllMocks();

    wizardResult = buildWizardResult(buildSkillConfigs(["web-framework-react"]));
    sourceResult = buildSourceResult(EMPTY_MATRIX, sourcePath);

    mockResolveInstallPaths.mockReturnValue({
      skillsDir: "/test/project/.claude/skills",
      agentsDir: "/test/project/.claude/agents",
      configPath,
    });

    mockBuildAndMergeConfig.mockResolvedValue({
      config: finalConfig,
      merged: false,
    });

    mockLoadAllAgents.mockResolvedValue({} as Record<AgentName, AgentDefinition>);
    mockEnsureBlankGlobalConfig.mockResolvedValue(false);
    mockWriteScopedConfigs.mockResolvedValue(undefined);
    mockEnsureDir.mockResolvedValue(undefined);

    // Default: project context (different from homedir)
    mockRealpathSync.mockImplementation((p) => String(p));
  });

  it("should build, merge, and write config in project context", async () => {
    const cliAgents = {} as Record<AgentName, AgentDefinition>;
    const sourceAgents = {} as Record<AgentName, AgentDefinition>;
    mockLoadAllAgents.mockResolvedValueOnce(cliAgents).mockResolvedValueOnce(sourceAgents);

    const result = await writeProjectConfig({
      wizardResult,
      sourceResult,
      projectDir,
    });

    expect(mockResolveInstallPaths).toHaveBeenCalledWith(projectDir, "project");
    expect(mockEnsureDir).toHaveBeenCalledWith("/test/project/.claude-src");
    expect(mockBuildAndMergeConfig).toHaveBeenCalledWith(
      wizardResult,
      sourceResult,
      projectDir,
      undefined,
      undefined,
    );
    expect(mockEnsureBlankGlobalConfig).toHaveBeenCalledWith();
    expect(mockWriteScopedConfigs).toHaveBeenCalledWith(
      finalConfig,
      sourceResult.matrix,
      { ...cliAgents, ...sourceAgents },
      projectDir,
      configPath,
      true,
    );
    expect(result).toStrictEqual({
      config: finalConfig,
      configPath,
      wasMerged: false,
      existingConfigPath: undefined,
      filesWritten: 4,
    });
  });

  it("should skip ensureBlankGlobalConfig when installing from homedir", async () => {
    const homeDir = "/home/user";
    const cliAgents = {} as Record<AgentName, AgentDefinition>;
    const sourceAgents = {} as Record<AgentName, AgentDefinition>;
    mockLoadAllAgents.mockResolvedValueOnce(cliAgents).mockResolvedValueOnce(sourceAgents);

    // Both resolve to the same path -> not a project context
    mockRealpathSync.mockReturnValue(homeDir);

    const result = await writeProjectConfig({
      wizardResult,
      sourceResult,
      projectDir: homeDir,
    });

    expect(mockEnsureBlankGlobalConfig).not.toHaveBeenCalled();
    expect(mockWriteScopedConfigs).toHaveBeenCalledWith(
      finalConfig,
      sourceResult.matrix,
      { ...cliAgents, ...sourceAgents },
      homeDir,
      configPath,
      false,
    );
    expect(result).toStrictEqual({
      config: finalConfig,
      configPath,
      wasMerged: false,
      existingConfigPath: undefined,
      filesWritten: 2,
    });
  });

  it("should use pre-loaded agents when provided", async () => {
    const preloadedAgents = {
      "web-developer": createMockAgent("web-developer"),
    } as Record<AgentName, AgentDefinition>;

    await writeProjectConfig({
      wizardResult,
      sourceResult,
      projectDir,
      agents: preloadedAgents,
    });

    expect(mockLoadAllAgents).not.toHaveBeenCalled();
    expect(mockWriteScopedConfigs).toHaveBeenCalledWith(
      finalConfig,
      sourceResult.matrix,
      preloadedAgents,
      projectDir,
      configPath,
      true,
    );
  });

  it("should load agents from CLI + source when not provided", async () => {
    const cliAgents = {
      "web-developer": createMockAgent("web-developer"),
    } as Record<AgentName, AgentDefinition>;
    const sourceAgents = {
      "api-developer": createMockAgent("api-developer"),
    } as Record<AgentName, AgentDefinition>;

    mockLoadAllAgents.mockResolvedValueOnce(cliAgents).mockResolvedValueOnce(sourceAgents);

    await writeProjectConfig({
      wizardResult,
      sourceResult,
      projectDir,
    });

    expect(mockLoadAllAgents).toHaveBeenCalledTimes(2);
    expect(mockWriteScopedConfigs).toHaveBeenCalledWith(
      finalConfig,
      sourceResult.matrix,
      { ...cliAgents, ...sourceAgents },
      projectDir,
      configPath,
      true,
    );
  });

  it("should return correct ConfigWriteResult", async () => {
    mockBuildAndMergeConfig.mockResolvedValue({
      config: finalConfig,
      merged: true,
      existingConfigPath: "/test/project/.claude-src/config.ts.bak",
    });

    const result = await writeProjectConfig({
      wizardResult,
      sourceResult,
      projectDir,
      sourceFlag: "github:org/skills",
    });

    expect(result).toStrictEqual({
      config: finalConfig,
      configPath,
      wasMerged: true,
      existingConfigPath: "/test/project/.claude-src/config.ts.bak",
      filesWritten: 4,
    });
  });
});
