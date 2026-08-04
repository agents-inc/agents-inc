import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentDefinition, AgentName } from "../../../types";
import type { WizardResultV2 } from "../../../components/wizard/wizard";
import type { SourceLoadResult } from "../../loading/source-loader";
import { createMockAgent } from "../../__tests__/factories/agent-factories";
import {
  buildGateReport,
  buildWizardResult,
  buildProjectConfig,
  buildSourceResult,
} from "../../__tests__/factories/config-factories";
import { buildSkillConfigs } from "../../__tests__/helpers/wizard-simulation";
import { EMPTY_MATRIX } from "../../__tests__/mock-data/mock-matrices";

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

vi.mock("../../installation/index.js", async () => {
  // Real isHomeDirectory so the fs.realpathSync mock above keeps driving the
  // project-vs-home branch; the heavy installer exports stay mocked.
  const { isHomeDirectory } = await vi.importActual<
    typeof import("../../installation/is-home-directory.js")
  >("../../installation/is-home-directory.js");
  return {
    buildAndMergeConfig: vi.fn(),
    resolveInstallPaths: vi.fn(),
    isHomeDirectory,
  };
});

vi.mock("../../config-gate/index.js", () => ({
  ensureBlankPair: vi.fn(),
  writeScopedFromWizard: vi.fn(),
}));

vi.mock("../../loading/index.js", () => ({
  loadMergedAgents: vi.fn(),
}));

vi.mock("../../../utils/fs.js", () => ({
  ensureDir: vi.fn(),
}));

import { writeProjectConfig } from "./write-project-config";
import { buildAndMergeConfig, resolveInstallPaths } from "../../installation/index.js";
import { loadMergedAgents } from "../../loading/index.js";
import { ensureBlankPair, writeScopedFromWizard } from "../../config-gate/index.js";
import { ensureDir } from "../../../utils/fs.js";

const mockBuildAndMergeConfig = vi.mocked(buildAndMergeConfig);
const mockWriteScopedFromWizard = vi.mocked(writeScopedFromWizard);
const mockResolveInstallPaths = vi.mocked(resolveInstallPaths);
const mockLoadMergedAgents = vi.mocked(loadMergedAgents);
const mockEnsureBlankPair = vi.mocked(ensureBlankPair);
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

    mockLoadMergedAgents.mockResolvedValue({} as Record<AgentName, AgentDefinition>);
    mockEnsureBlankPair.mockResolvedValue(false);
    mockWriteScopedFromWizard.mockResolvedValue(buildGateReport());
    mockEnsureDir.mockResolvedValue(undefined);

    // Default: project context (different from homedir)
    mockRealpathSync.mockImplementation((p) => String(p));
  });

  it("should build, merge, and write config in project context", async () => {
    mockLoadMergedAgents.mockResolvedValue({} as Record<AgentName, AgentDefinition>);

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
    expect(mockEnsureBlankPair).toHaveBeenCalledWith();
    expect(mockWriteScopedFromWizard).toHaveBeenCalledWith({
      finalConfig,
      matrix: sourceResult.matrix,
      agents: {},
      projectDir,
      projectConfigPath: configPath,
      projectInstallationExists: true,
    });
    expect(result).toStrictEqual({
      config: finalConfig,
      configPath,
      wasMerged: false,
      existingConfigPath: undefined,
      filesWritten: 4,
      propagation: buildGateReport(),
    });
  });

  it("should skip ensureBlankPair when installing from homedir", async () => {
    const homeDir = "/home/user";
    mockLoadMergedAgents.mockResolvedValue({} as Record<AgentName, AgentDefinition>);

    // Both resolve to the same path -> not a project context
    mockRealpathSync.mockReturnValue(homeDir);

    const result = await writeProjectConfig({
      wizardResult,
      sourceResult,
      projectDir: homeDir,
    });

    expect(mockEnsureBlankPair).not.toHaveBeenCalled();
    expect(mockWriteScopedFromWizard).toHaveBeenCalledWith({
      finalConfig,
      matrix: sourceResult.matrix,
      agents: {},
      projectDir: homeDir,
      projectConfigPath: configPath,
      projectInstallationExists: false,
    });
    expect(result).toStrictEqual({
      config: finalConfig,
      configPath,
      wasMerged: false,
      existingConfigPath: undefined,
      filesWritten: 2,
      propagation: buildGateReport(),
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

    expect(mockLoadMergedAgents).not.toHaveBeenCalled();
    expect(mockWriteScopedFromWizard).toHaveBeenCalledWith({
      finalConfig,
      matrix: sourceResult.matrix,
      agents: preloadedAgents,
      projectDir,
      projectConfigPath: configPath,
      projectInstallationExists: true,
    });
  });

  it("should load merged agents when not provided", async () => {
    const mergedAgents = {
      "web-developer": createMockAgent("web-developer"),
      "api-developer": createMockAgent("api-developer"),
    } as Record<AgentName, AgentDefinition>;

    mockLoadMergedAgents.mockResolvedValue(mergedAgents);

    await writeProjectConfig({
      wizardResult,
      sourceResult,
      projectDir,
    });

    expect(mockLoadMergedAgents).toHaveBeenCalledWith(sourceResult.sourcePath);
    expect(mockWriteScopedFromWizard).toHaveBeenCalledWith({
      finalConfig,
      matrix: sourceResult.matrix,
      agents: mergedAgents,
      projectDir,
      projectConfigPath: configPath,
      projectInstallationExists: true,
    });
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
      propagation: buildGateReport(),
    });
  });

  it("surfaces the registered projects propagation rewrote", async () => {
    mockWriteScopedFromWizard.mockResolvedValue(
      buildGateReport(["/other/project-a", "/other/project-b"]),
    );

    const result = await writeProjectConfig({
      wizardResult,
      sourceResult,
      projectDir,
    });

    expect(
      result.propagation.propagated.updated,
      "propagated project dirs must reach the caller so it can report the recompile",
    ).toStrictEqual(["/other/project-a", "/other/project-b"]);
  });
});
