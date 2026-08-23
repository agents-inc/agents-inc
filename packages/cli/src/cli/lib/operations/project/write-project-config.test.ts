import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentDefinition, AgentName } from "../../../types";
import type { WizardResultV2 } from "../../../components/wizard/wizard";
import type { SourceLoadResult } from "../../loading/source-loader";
import { buildAgentDefs, createMockAgent } from "../../__tests__/factories/agent-factories";
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

vi.mock("./load-agent-defs.js", () => ({
  loadAgentDefs: vi.fn(),
}));

vi.mock("../../../utils/fs.js", () => ({
  ensureDir: vi.fn(),
}));

import { writeProjectConfig } from "./write-project-config";
import { buildAndMergeConfig, resolveInstallPaths } from "../../installation/index.js";
import { loadAgentDefs } from "./load-agent-defs.js";
import { ensureBlankPair, writeScopedFromWizard } from "../../config-gate/index.js";
import { ensureDir } from "../../../utils/fs.js";

const mockBuildAndMergeConfig = vi.mocked(buildAndMergeConfig);
const mockWriteScopedFromWizard = vi.mocked(writeScopedFromWizard);
const mockResolveInstallPaths = vi.mocked(resolveInstallPaths);
const mockLoadAgentDefs = vi.mocked(loadAgentDefs);
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

    mockLoadAgentDefs.mockResolvedValue(buildAgentDefs({}));
    mockEnsureBlankPair.mockResolvedValue(false);
    mockWriteScopedFromWizard.mockResolvedValue(buildGateReport());
    mockEnsureDir.mockResolvedValue(undefined);

    // Default: project context (different from homedir)
    mockRealpathSync.mockImplementation((p) => String(p));
  });

  it("should build, merge, and write config in project context", async () => {
    mockLoadAgentDefs.mockResolvedValue(buildAgentDefs({}));

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
      filesWritten: 4,
      propagation: buildGateReport(),
    });
  });

  it("should skip ensureBlankPair when installing from homedir", async () => {
    const homeDir = "/home/user";
    mockLoadAgentDefs.mockResolvedValue(buildAgentDefs({}));

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
      filesWritten: 2,
      propagation: buildGateReport(),
    });
  });

  /**
   * The option takes the WHOLE `AgentDefs` value rather than a bare roster map, so the
   * only thing a caller can hand over is what `loadAgentDefs` answered. It used to take
   * `Partial<Record<AgentName, AgentDefinition>>` — any map at all — which made "a roster
   * different from the one the CLI would load" a representable argument, and the sub-agent
   * unions this function emits are built from whatever it is given.
   */
  it("should use pre-loaded agents when provided", async () => {
    const preloadedAgents: Partial<Record<AgentName, AgentDefinition>> = {
      "web-developer": createMockAgent("web-developer"),
    };

    await writeProjectConfig({
      wizardResult,
      sourceResult,
      projectDir,
      agentDefs: buildAgentDefs(preloadedAgents),
    });

    expect(mockLoadAgentDefs).not.toHaveBeenCalled();
    expect(mockWriteScopedFromWizard).toHaveBeenCalledWith({
      finalConfig,
      matrix: sourceResult.matrix,
      agents: preloadedAgents,
      projectDir,
      projectConfigPath: configPath,
      projectInstallationExists: true,
    });
  });

  /**
   * The sub-agent roster the emitted `AgentName` / `SelectedAgentName` unions are built from, and
   * the one thing about it that matters: it is the CLI's own, taken from `loadAgentDefs` and NOT
   * from the marketplace `sourceResult` names. This site loaded `loadMergedAgents(sourcePath)`
   * until 2026-08-21, which made `init` emit a different config-types.ts from the one `edit` and
   * `compile` emit for the same config.
   */
  it("loads the CLI's own sub-agent roster when none is provided, never the marketplace's", async () => {
    const cliAgents: Partial<Record<AgentName, AgentDefinition>> = {
      "web-developer": createMockAgent("web-developer"),
      "api-developer": createMockAgent("api-developer"),
    };

    mockLoadAgentDefs.mockResolvedValue(buildAgentDefs(cliAgents));

    await writeProjectConfig({
      wizardResult,
      sourceResult,
      projectDir,
    });

    expect(mockLoadAgentDefs).toHaveBeenCalledWith();
    expect(mockWriteScopedFromWizard).toHaveBeenCalledWith({
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
