import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AgentName, SkillScope } from "../../../types";
import { buildAgentConfigs } from "../../__tests__/factories/config-factories.js";

vi.mock("../../agents/index.js", () => ({
  recompileAgents: vi.fn(),
}));

vi.mock("../../configuration/index.js", () => ({
  loadProjectConfigFromDir: vi.fn(),
}));

vi.mock("../../installation/index.js", () => ({
  buildAgentScopeMap: vi.fn(),
}));

import { compileAgents } from "./compile-agents";
import { recompileAgents } from "../../agents/index.js";
import { loadProjectConfigFromDir } from "../../configuration/index.js";
import { buildAgentScopeMap } from "../../installation/index.js";

const mockRecompileAgents = vi.mocked(recompileAgents);
const mockLoadProjectConfigFromDir = vi.mocked(loadProjectConfigFromDir);
const mockBuildAgentScopeMap = vi.mocked(buildAgentScopeMap);

describe("compile-agents", () => {
  const projectDir = "/test/project";
  const sourcePath = "/test/source";

  beforeEach(() => {
    vi.clearAllMocks();

    mockRecompileAgents.mockResolvedValue({
      compiled: ["web-developer"],
      rewritten: ["web-developer"],
      failed: [],
      warnings: [],
    });
  });

  it("should pass options through to recompileAgents", async () => {
    const result = await compileAgents({
      projectDir,
      sourcePath,
      pluginDir: "/test/plugin",
      outputDir: "/test/output",
    });

    expect(mockRecompileAgents).toHaveBeenCalledWith({
      pluginDir: "/test/plugin",
      sourcePath,
      agents: undefined,
      skills: undefined,
      projectDir,
      outputDir: "/test/output",
      agentScopeMap: undefined,
    });
    expect(result.compiled).toStrictEqual(["web-developer"]);
  });

  it("should use pluginDir defaulting to projectDir when not provided", async () => {
    await compileAgents({
      projectDir,
      sourcePath,
    });

    expect(mockRecompileAgents).toHaveBeenCalledWith({
      pluginDir: projectDir,
      sourcePath,
      agents: undefined,
      skills: undefined,
      projectDir,
      outputDir: undefined,
      agentScopeMap: undefined,
    });
  });

  it("should filter agents by scopeFilter when set", async () => {
    const config = {
      name: "test",
      agents: [
        ...buildAgentConfigs(["web-developer"]),
        ...buildAgentConfigs(["api-developer"], { scope: "global" }),
      ],
      skills: [],
    };
    const scopeMap = new Map<AgentName, SkillScope>([
      ["web-developer", "project"],
      ["api-developer", "global"],
    ]);

    mockLoadProjectConfigFromDir.mockResolvedValue({
      config,
      configPath: "/test/project/.claude-src/config.ts",
    });
    mockBuildAgentScopeMap.mockReturnValue(scopeMap);

    mockRecompileAgents.mockResolvedValue({
      compiled: ["web-developer"],
      rewritten: ["web-developer"],
      failed: [],
      warnings: [],
    });

    const result = await compileAgents({
      projectDir,
      sourcePath,
      scopeFilter: "project",
    });

    expect(mockLoadProjectConfigFromDir).toHaveBeenCalledWith(projectDir);
    expect(mockBuildAgentScopeMap).toHaveBeenCalledWith(config);
    expect(mockRecompileAgents).toHaveBeenCalledWith({
      pluginDir: projectDir,
      sourcePath,
      agents: ["web-developer"],
      skills: undefined,
      projectDir,
      outputDir: undefined,
      agentScopeMap: scopeMap,
    });
    expect(result.compiled).toStrictEqual(["web-developer"]);
  });

  it("should intersect scopeFilter with explicit agents list", async () => {
    const config = {
      name: "test",
      agents: [
        ...buildAgentConfigs(["web-developer", "api-developer"]),
        ...buildAgentConfigs(["pm"], { scope: "global" }),
      ],
      skills: [],
    };
    const scopeMap = new Map<AgentName, SkillScope>([
      ["web-developer", "project"],
      ["api-developer", "project"],
      ["pm", "global"],
    ]);

    mockLoadProjectConfigFromDir.mockResolvedValue({
      config,
      configPath: "/test/project/.claude-src/config.ts",
    });
    mockBuildAgentScopeMap.mockReturnValue(scopeMap);

    await compileAgents({
      projectDir,
      sourcePath,
      agents: ["web-developer", "pm"],
      scopeFilter: "project",
    });

    // Only web-developer matches both the explicit list AND the project scope filter
    expect(mockBuildAgentScopeMap).toHaveBeenCalledWith(config);
    expect(mockRecompileAgents).toHaveBeenCalledWith({
      pluginDir: projectDir,
      sourcePath,
      agents: ["web-developer"],
      skills: undefined,
      projectDir,
      outputDir: undefined,
      agentScopeMap: scopeMap,
    });
  });

  it("should exclude agents with excluded flag when using scopeFilter", async () => {
    const config = {
      name: "test",
      agents: [
        ...buildAgentConfigs(["web-developer"]),
        ...buildAgentConfigs(["api-developer"], { excluded: true }),
      ],
      skills: [],
    };
    const scopeMap = new Map<AgentName, SkillScope>([["web-developer", "project"]]);

    mockLoadProjectConfigFromDir.mockResolvedValue({
      config,
      configPath: "/test/project/.claude-src/config.ts",
    });
    mockBuildAgentScopeMap.mockReturnValue(scopeMap);

    await compileAgents({
      projectDir,
      sourcePath,
      scopeFilter: "project",
    });

    // api-developer is excluded, only web-developer should be compiled
    expect(mockRecompileAgents).toHaveBeenCalledWith({
      pluginDir: projectDir,
      sourcePath,
      agents: ["web-developer"],
      skills: undefined,
      projectDir,
      outputDir: undefined,
      agentScopeMap: scopeMap,
    });
  });

  // `rewritten` is a strict subset of `compiled` here on purpose: the two lists carry
  // different facts, so a pass-through that filled `rewritten` from `compiled` would
  // read as correct against equal lists and is caught by unequal ones.
  it("should return compilation result from recompileAgents", async () => {
    mockRecompileAgents.mockResolvedValue({
      compiled: ["web-developer", "api-developer"],
      rewritten: ["web-developer"],
      failed: ["pm"],
      warnings: ["Agent pm had issues"],
    });

    const result = await compileAgents({
      projectDir,
      sourcePath,
    });

    expect(result).toStrictEqual({
      compiled: ["web-developer", "api-developer"],
      rewritten: ["web-developer"],
      failed: ["pm"],
      warnings: ["Agent pm had issues"],
    });
  });
});
