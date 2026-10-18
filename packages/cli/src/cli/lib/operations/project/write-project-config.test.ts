import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentDefinition, AgentName } from "../../../types";
import type { InstallSelection } from "@workspace/compile/seed-to-config";
import type { SourceLoadResult } from "../../loading/source-loader";
import { buildAgentDefs, createMockAgent } from "../../__tests__/factories/agent-factories";
import {
  buildGateReport,
  buildInstallSelection,
  buildProjectConfig,
  buildSourceResult,
} from "../../__tests__/factories/config-factories";
import { buildSkillConfigs } from "../../__tests__/helpers/skill-config-builders";
import { EMPTY_MATRIX } from "../../__tests__/mock-data/mock-matrices";

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
  // Real isHomeDirectory so the realpathSync mock drives the project-vs-home branch.
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
  writeConfigByScope: vi.fn(),
}));

vi.mock("./load-agent-defs.js", () => ({
  loadAgentDefs: vi.fn(),
}));

vi.mock("../../../utils/fs.js", () => ({
  ensureDir: vi.fn(),
}));

import { writeProjectConfig } from "./write-project-config";
import { buildAndMergeConfig, resolveInstallPaths } from "../../installation/index.js";
import { loadAgentDefs } from "./load-agent-defs.js";
import { ensureBlankPair, writeConfigByScope } from "../../config-gate/index.js";
import { ensureDir } from "../../../utils/fs.js";

import { firstElement } from "../../__tests__/helpers/element-at.js";

const mockBuildAndMergeConfig = vi.mocked(buildAndMergeConfig);
const mockWriteConfigByScope = vi.mocked(writeConfigByScope);
const mockResolveInstallPaths = vi.mocked(resolveInstallPaths);
const mockLoadAgentDefs = vi.mocked(loadAgentDefs);
const mockEnsureBlankPair = vi.mocked(ensureBlankPair);
const mockEnsureDir = vi.mocked(ensureDir);

describe("write-project-config", () => {
  const projectDir = "/test/project";
  const sourcePath = "/test/source";
  const configPath = "/test/project/.agents-inc/claude/config.ts";
  const finalConfig = buildProjectConfig({ name: "test-project" });

  let selection: InstallSelection;
  let sourceResult: SourceLoadResult;

  beforeEach(() => {
    vi.clearAllMocks();

    selection = buildInstallSelection(buildSkillConfigs(["web-framework-react"]));
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

    mockLoadAgentDefs.mockResolvedValue(buildAgentDefs({}));
    mockEnsureBlankPair.mockResolvedValue(false);
    mockWriteConfigByScope.mockResolvedValue(buildGateReport());
    mockEnsureDir.mockResolvedValue(undefined);

    mockRealpathSync.mockImplementation((p) => String(p));
  });

  it("should build, merge, and write config in project context", async () => {
    mockLoadAgentDefs.mockResolvedValue(buildAgentDefs({}));

    const result = await writeProjectConfig({
      selection,
      sourceResult,
      projectDir,
    });

    expect(mockResolveInstallPaths).toHaveBeenCalledWith(projectDir, "project");
    expect(mockEnsureDir).toHaveBeenCalledWith("/test/project/.agents-inc/claude");
    expect(mockBuildAndMergeConfig).toHaveBeenCalledWith(
      selection,
      sourceResult,
      projectDir,
      undefined,
      undefined,
    );
    expect(mockEnsureBlankPair).toHaveBeenCalledWith("claude");
    expect(mockWriteConfigByScope).toHaveBeenCalledWith({
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
      propagation: buildGateReport(),
    });
  });

  it("hands the session's authority to the gate exactly as it handed it to the merge", async () => {
    await writeProjectConfig({ selection, sourceResult, projectDir, authoritativeScope: "all" });

    expect(mockBuildAndMergeConfig).toHaveBeenCalledWith(
      selection,
      sourceResult,
      projectDir,
      undefined,
      "all",
    );
    expect(mockWriteConfigByScope).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ authoritativeScope: "all" }),
    );
  });

  it("names no authority to the gate when the session claims none", async () => {
    await writeProjectConfig({ selection, sourceResult, projectDir });

    const [request] = firstElement(mockWriteConfigByScope.mock.calls);
    expect(request).not.toHaveProperty("authoritativeScope");
  });

  it("should skip ensureBlankPair when installing from homedir", async () => {
    const homeDir = "/home/user";
    mockLoadAgentDefs.mockResolvedValue(buildAgentDefs({}));

    mockRealpathSync.mockReturnValue(homeDir);

    const result = await writeProjectConfig({
      selection,
      sourceResult,
      projectDir: homeDir,
    });

    expect(mockEnsureBlankPair).not.toHaveBeenCalled();
    expect(mockWriteConfigByScope).toHaveBeenCalledWith({
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
      propagation: buildGateReport(),
    });
  });

  it("should use pre-loaded agents when provided", async () => {
    const preloadedAgents: Partial<Record<AgentName, AgentDefinition>> = {
      "web-developer": createMockAgent("web-developer"),
    };

    await writeProjectConfig({
      selection,
      sourceResult,
      projectDir,
      agentDefs: buildAgentDefs(preloadedAgents),
    });

    expect(mockLoadAgentDefs).not.toHaveBeenCalled();
    expect(mockWriteConfigByScope).toHaveBeenCalledWith({
      finalConfig,
      matrix: sourceResult.matrix,
      agents: preloadedAgents,
      projectDir,
      projectConfigPath: configPath,
      projectInstallationExists: true,
    });
  });

  it("loads the CLI's own sub-agent roster when none is provided, never the marketplace's", async () => {
    const cliAgents: Partial<Record<AgentName, AgentDefinition>> = {
      "web-developer": createMockAgent("web-developer"),
      "api-developer": createMockAgent("api-developer"),
    };

    mockLoadAgentDefs.mockResolvedValue(buildAgentDefs(cliAgents));

    await writeProjectConfig({
      selection,
      sourceResult,
      projectDir,
    });

    expect(mockLoadAgentDefs).toHaveBeenCalledWith();
    expect(mockWriteConfigByScope).toHaveBeenCalledWith({
      finalConfig,
      matrix: sourceResult.matrix,
      agents: cliAgents,
      projectDir,
      projectConfigPath: configPath,
      projectInstallationExists: true,
    });
  });

  it("should return correct ConfigWriteResult", async () => {
    mockBuildAndMergeConfig.mockResolvedValue({
      config: finalConfig,
      merged: true,
      existingConfigPath: "/test/project/.agents-inc/claude/config.ts.bak",
    });

    const result = await writeProjectConfig({
      selection,
      sourceResult,
      projectDir,
      sourceFlag: "github:org/skills",
    });

    expect(result).toStrictEqual({
      config: finalConfig,
      configPath,
      wasMerged: true,
      existingConfigPath: "/test/project/.agents-inc/claude/config.ts.bak",
      propagation: buildGateReport(),
    });
  });

  it("surfaces the registered projects propagation rewrote", async () => {
    mockWriteConfigByScope.mockResolvedValue(
      buildGateReport(["/other/project-a", "/other/project-b"]),
    );

    const result = await writeProjectConfig({
      selection,
      sourceResult,
      projectDir,
    });

    expect(
      result.propagation.propagated.updated,
      "propagated project dirs must reach the caller so it can report the recompile",
    ).toStrictEqual(["/other/project-a", "/other/project-b"]);
  });
});
