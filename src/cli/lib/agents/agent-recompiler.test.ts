import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { recompileAgents } from "./agent-recompiler";
import { CLI_ROOT } from "../__tests__/helpers/cli-runner";
import {
  createTestDirs,
  cleanupTestDirs,
  type PluginTestDirs,
} from "../__tests__/helpers/test-dir-setup";
import { writeTestSkill } from "../__tests__/helpers/disk-writers";
import { fileExists } from "../__tests__/test-fs-utils";
import { initializeMatrix } from "../matrix/matrix-provider";
import type { AgentName, SkillId } from "../../types";
import { writeTestTsConfig } from "../__tests__/helpers/config-io";
import { buildAgentConfigs } from "../__tests__/factories/config-factories";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation";
import { CLAUDE_DIR } from "../../consts";
import { VITEST_REACT_HONO_MATRIX } from "../__tests__/mock-data/mock-matrices";
import { expectValidAgentMarkdown } from "../__tests__/assertions/agent-assertions";

const REACT_AND_VITEST_SKILLS: Record<string, { id: string; description: string; path: string }> = {
  "web-framework-react": {
    id: "web-framework-react",
    description: "React framework skill",
    path: "web-framework-react/",
  },
  "web-testing-vitest": {
    id: "web-testing-vitest",
    description: "Vitest testing skill",
    path: "web-testing-vitest/",
  },
};

describe("agent-recompiler", () => {
  let testDirs: PluginTestDirs;

  beforeEach(async () => {
    testDirs = await createTestDirs("cc-recompiler-test-");

    initializeMatrix(VITEST_REACT_HONO_MATRIX);
  });

  afterEach(async () => {
    await cleanupTestDirs(testDirs);
  });

  describe("recompileAgents", () => {
    it("returns empty compiled list when no agents exist", async () => {
      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
      });

      expect(result.compiled).toStrictEqual([]);
      expect(result.warnings).toContain("No agents found to recompile");
    });

    it("recompiles a single agent specified in options", async () => {
      await writeTestSkill(testDirs.skillsDir, "web-testing-vitest");

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["web-pm"], // PM is a simple agent likely to succeed
      });

      expect(result.compiled).toContain("web-pm");
      expect(result.failed).toStrictEqual([]);

      const agentPath = path.join(testDirs.agentsDir, "web-pm.md");
      expect(await fileExists(agentPath)).toBe(true);

      const content = await readFile(agentPath, "utf-8");
      expectValidAgentMarkdown(content, "web-pm");
    });

    it("handles missing agent definitions gracefully", async () => {
      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["non-existent-agent-xyz" as AgentName],
      });

      expect(result.compiled).toStrictEqual([]);
      expect(result.warnings).toContain(
        'Agent "non-existent-agent-xyz" not found in source definitions',
      );
    });

    it("uses config.ts agent list when present", async () => {
      await writeTestTsConfig(testDirs.projectDir, {
        name: "test-plugin",
        description: "Test plugin",
        agents: buildAgentConfigs(["web-pm"]),
      });

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        projectDir: testDirs.projectDir,
      });

      expect(result.compiled).toContain("web-pm");
    });

    it("uses existing compiled agents when no config exists", async () => {
      await writeFile(path.join(testDirs.agentsDir, "web-pm.md"), "# Existing PM Agent\n");

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
      });

      expect(result.compiled).toContain("web-pm");
    });

    it("compiles multiple agents", async () => {
      await writeTestSkill(testDirs.skillsDir, "web-framework-react");
      await writeTestSkill(testDirs.skillsDir, "api-framework-hono");

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["web-developer", "api-developer", "web-pm"],
      });

      expect(result.compiled).toContain("web-developer");
      expect(result.compiled).toContain("api-developer");
      expect(result.compiled).toContain("web-pm");
      expect(result.compiled).toHaveLength(3);
      expect(result.failed).toStrictEqual([]);

      // Verify all 3 agent files exist
      for (const agentName of result.compiled) {
        const agentPath = path.join(testDirs.agentsDir, `${agentName}.md`);
        expect(await fileExists(agentPath)).toBe(true);
      }
    });

    it("uses provided skills instead of loading from plugin", async () => {
      const skillId = "web-custom-skill" as SkillId;
      const providedSkills = {
        [skillId]: {
          id: skillId,
          description: "Custom skill",
          path: "custom-skill/",
        },
      };

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["web-pm"],
        skills: providedSkills,
      });

      expect(result.compiled).toContain("web-pm");
    });

    it("generates valid agent markdown with frontmatter", async () => {
      await writeTestSkill(testDirs.skillsDir, "web-testing-vitest");

      await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["web-developer"],
      });

      const agentPath = path.join(testDirs.agentsDir, "web-developer.md");
      const content = await readFile(agentPath, "utf-8");

      expectValidAgentMarkdown(content, "web-developer");
    });

    it("respects projectDir for local template resolution", async () => {
      const localTemplatesDir = path.join(testDirs.projectDir, CLAUDE_DIR, "templates");
      await mkdir(localTemplatesDir, { recursive: true });

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["web-pm"],
        projectDir: testDirs.projectDir,
      });

      expect(result.compiled).toContain("web-pm");
    });

    it("should filter excluded skills from compiled agent output", async () => {
      await writeTestTsConfig(testDirs.projectDir, {
        name: "test-plugin",
        description: "Test plugin",
        agents: buildAgentConfigs(["web-developer"]),
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-testing-vitest"], { excluded: true }),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      });

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        projectDir: testDirs.projectDir,
        skills: REACT_AND_VITEST_SKILLS,
      });

      expect(result.compiled).toContain("web-developer");

      const agentPath = path.join(testDirs.agentsDir, "web-developer.md");
      const content = await readFile(agentPath, "utf-8");

      // Active skill should appear in compiled agent
      expect(content).toContain("web-framework-react");
      // Excluded skill should NOT appear in compiled agent
      expect(content).not.toContain("web-testing-vitest");
    });

    it("should filter project-scoped skills from global-scoped agents (D7 cross-scope safety)", async () => {
      await writeTestTsConfig(testDirs.projectDir, {
        name: "test-plugin",
        description: "Test plugin",
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "global" }),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      });

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        projectDir: testDirs.projectDir,
        skills: REACT_AND_VITEST_SKILLS,
      });

      expect(result.compiled).toContain("web-developer");

      const agentPath = path.join(testDirs.agentsDir, "web-developer.md");
      const content = await readFile(agentPath, "utf-8");

      // Global skill should appear in global-scoped agent
      expect(content).toContain("web-testing-vitest");
      // Project-scoped skill should NOT appear in global-scoped agent
      expect(content).not.toContain("web-framework-react");
    });
  });
});
