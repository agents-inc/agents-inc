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
import { SKILLS } from "../__tests__/test-fixtures";
import { VITEST_REACT_HONO_MATRIX } from "../__tests__/mock-data/mock-matrices";
import { expectValidAgentMarkdown } from "../__tests__/assertions/agent-assertions";

const REACT_AND_VITEST_SKILLS: Record<string, { id: string; description: string; path: string }> = {
  [SKILLS.react.id]: {
    id: SKILLS.react.id,
    description: "React framework skill",
    path: `${SKILLS.react.id}/`,
  },
  [SKILLS.vitest.id]: {
    id: SKILLS.vitest.id,
    description: "Vitest testing skill",
    path: `${SKILLS.vitest.id}/`,
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
        agents: ["pm"], // PM is a simple agent likely to succeed
      });

      expect(result.compiled).toContain("pm");
      expect(result.failed).toStrictEqual([]);

      const agentPath = path.join(testDirs.agentsDir, "pm.md");
      expect(await fileExists(agentPath)).toBe(true);

      const content = await readFile(agentPath, "utf-8");
      expectValidAgentMarkdown(content, "pm");
    });

    it("writes an agent the scope map does not route into the caller's own agents directory", async () => {
      // `agents-inc update` recompiles with no scope map at all, and a hand-authored agent has no
      // config row in the map the other callers build — so an unrouted agent must stay where the
      // caller pointed rather than being relocated into the user's ~/.claude.
      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["pm"],
        agentScopeMap: new Map(),
      });

      expect(result.compiled).toStrictEqual(["pm"]);
      expect(await fileExists(path.join(testDirs.agentsDir, "pm.md"))).toBe(true);
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
        agents: buildAgentConfigs(["pm"]),
      });

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        projectDir: testDirs.projectDir,
      });

      expect(result.compiled).toContain("pm");
    });

    it("uses existing compiled agents when no config exists", async () => {
      await writeFile(path.join(testDirs.agentsDir, "pm.md"), "# Existing PM Agent\n");

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
      });

      expect(result.compiled).toContain("pm");
    });

    it("compiles multiple agents", async () => {
      await writeTestSkill(testDirs.skillsDir, "web-framework-react");
      await writeTestSkill(testDirs.skillsDir, "api-framework-hono");

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["web-developer", "api-developer", "pm"],
      });

      expect(result.compiled).toContain("web-developer");
      expect(result.compiled).toContain("api-developer");
      expect(result.compiled).toContain("pm");
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
        agents: ["pm"],
        skills: providedSkills,
      });

      expect(result.compiled).toContain("pm");
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
        agents: ["pm"],
        projectDir: testDirs.projectDir,
      });

      expect(result.compiled).toContain("pm");
    });

    it("should filter excluded skills from compiled agent output", async () => {
      await writeTestTsConfig(testDirs.projectDir, {
        name: "test-plugin",
        description: "Test plugin",
        agents: buildAgentConfigs(["web-developer"]),
        skills: [
          ...buildSkillConfigs([SKILLS.react.id]),
          ...buildSkillConfigs([SKILLS.vitest.id], { excluded: true }),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: SKILLS.react.id, preloaded: false }],
            "web-testing": [{ id: SKILLS.vitest.id, preloaded: false }],
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
      expect(content).not.toContain(SKILLS.vitest.id);
    });

    it("should filter project-scoped skills from global-scoped agents (D7 cross-scope safety)", async () => {
      await writeTestTsConfig(testDirs.projectDir, {
        name: "test-plugin",
        description: "Test plugin",
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        skills: [
          ...buildSkillConfigs([SKILLS.react.id]),
          ...buildSkillConfigs([SKILLS.vitest.id], { scope: "global" }),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: SKILLS.react.id, preloaded: false }],
            "web-testing": [{ id: SKILLS.vitest.id, preloaded: false }],
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
      expect(content).not.toContain(SKILLS.react.id);
    });
  });
});
