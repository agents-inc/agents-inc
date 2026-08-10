import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import type { AgentName, SkillScope } from "../../../types";
import { buildAgentConfigs } from "../../__tests__/factories/config-factories.js";
import { renderAgentMd } from "../../__tests__/content-generators.js";
import {
  cleanupTempDir,
  createTempDir,
  directoryExists,
  fileExists,
} from "../../__tests__/test-fs-utils.js";

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

  describe("stale-agent pruning", () => {
    const STALE_AGENT: AgentName = "api-developer";
    const KEPT_AGENT: AgentName = "web-developer";
    // Basename outside the AgentName union — a file the CLI never compiled.
    const HAND_AUTHORED_AGENT = "my-custom-agent";

    let tempDir: string;
    let outputDir: string;

    beforeEach(async () => {
      tempDir = await createTempDir("cc-compile-agents-prune-");
      outputDir = path.join(tempDir, "agents");
    });

    afterEach(async () => {
      await cleanupTempDir(tempDir);
    });

    const seedAgentFile = async (name: string): Promise<string> => {
      const filePath = path.join(outputDir, `${name}.md`);
      await writeFile(filePath, renderAgentMd(name));
      return filePath;
    };

    const seedOutputDir = async (names: string[]): Promise<void> => {
      await mkdir(outputDir, { recursive: true });
      for (const name of names) await seedAgentFile(name);
    };

    it("removes the output agents directory when the prune leaves nothing in it", async () => {
      await seedOutputDir([STALE_AGENT]);
      mockRecompileAgents.mockResolvedValue({
        compiled: [],
        rewritten: [],
        failed: [],
        warnings: [],
      });

      await compileAgents({ projectDir, sourcePath, outputDir });

      expect(
        await fileExists(path.join(outputDir, `${STALE_AGENT}.md`)),
        "the stale compiled agent must be pruned",
      ).toBe(false);
      expect(
        await directoryExists(outputDir),
        "an emptied agents directory must not survive the prune",
      ).toBe(false);
    });

    it("keeps the output agents directory when a hand-authored agent survives the prune", async () => {
      await seedOutputDir([STALE_AGENT, HAND_AUTHORED_AGENT]);
      mockRecompileAgents.mockResolvedValue({
        compiled: [],
        rewritten: [],
        failed: [],
        warnings: [],
      });

      await compileAgents({ projectDir, sourcePath, outputDir });

      expect(await fileExists(path.join(outputDir, `${STALE_AGENT}.md`))).toBe(false);
      expect(
        await fileExists(path.join(outputDir, `${HAND_AUTHORED_AGENT}.md`)),
        "a hand-authored agent is never pruned",
      ).toBe(true);
      expect(
        await directoryExists(outputDir),
        "a directory that still holds anything must never be deleted",
      ).toBe(true);
    });

    it("keeps the output agents directory when a compiled agent remains", async () => {
      await seedOutputDir([KEPT_AGENT, STALE_AGENT]);
      mockRecompileAgents.mockResolvedValue({
        compiled: [KEPT_AGENT],
        rewritten: [KEPT_AGENT],
        failed: [],
        warnings: [],
      });

      await compileAgents({ projectDir, sourcePath, outputDir });

      expect(await fileExists(path.join(outputDir, `${STALE_AGENT}.md`))).toBe(false);
      expect(await fileExists(path.join(outputDir, `${KEPT_AGENT}.md`))).toBe(true);
      expect(await directoryExists(outputDir)).toBe(true);
    });

    it("leaves the output agents directory untouched on a scope-filtered pass", async () => {
      await seedOutputDir([STALE_AGENT]);
      mockRecompileAgents.mockResolvedValue({
        compiled: [],
        rewritten: [],
        failed: [],
        warnings: [],
      });

      await compileAgents({ projectDir, sourcePath, outputDir, scopeFilter: "project" });

      expect(
        await fileExists(path.join(outputDir, `${STALE_AGENT}.md`)),
        "a filtered pass sees one scope only and must delete nothing",
      ).toBe(true);
      expect(await directoryExists(outputDir)).toBe(true);
    });
  });
});
