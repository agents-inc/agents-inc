import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { copyFile, mkdir, writeFile, readFile } from "fs/promises";
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
import type { AgentName, SkillDefinitionMap } from "../../types";
import { writeTestTsConfig } from "../__tests__/helpers/config-io";
import { buildAgentConfigs, buildProjectConfig } from "../__tests__/factories/config-factories";
import { createMockSkillDefinition, sa } from "../__tests__/factories/skill-factories";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation";
import { renderAgentMd } from "../__tests__/content-generators";
import { CLAUDE_DIR } from "../../consts";
import { SKILLS } from "../__tests__/test-fixtures";
import { VITEST_REACT_HONO_MATRIX } from "../__tests__/mock-data/mock-matrices";
import { expectValidAgentMarkdown } from "../__tests__/assertions/agent-assertions";

/** The shared stand-in for a project's own `agent.liquid`, which `compiler.test.ts` copies too. */
const FIXTURE_AGENT_TEMPLATE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../__tests__/fixtures/agents/_templates/agent.liquid",
);

/** The line only the fixture template emits, and therefore the one that says which rendered. */
const PROJECT_TEMPLATE_MARKER = "Rendered by the project's own agent template.";

/** The skill definitions a caller hands the pass, in place of discovering them. */
const REACT_AND_VITEST_SKILLS: SkillDefinitionMap = {
  [SKILLS.react.id]: createMockSkillDefinition(SKILLS.react.id),
  [SKILLS.vitest.id]: createMockSkillDefinition(SKILLS.vitest.id),
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
        // Boundary cast: the CLI's own source defines every `AgentName`, so the name no
        // definition answers — one a hand-edited config.ts carries — lies outside the union.
        agents: ["non-existent-agent-xyz" as AgentName],
      });

      expect(result.compiled).toStrictEqual([]);
      expect(result.warnings).toContain(
        'Agent "non-existent-agent-xyz" not found in source definitions',
      );
    });

    it("uses config.ts agent list when present", async () => {
      await writeTestTsConfig(
        testDirs.projectDir,
        buildProjectConfig({ agents: buildAgentConfigs(["pm"]), skills: [] }),
      );

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        projectDir: testDirs.projectDir,
      });

      expect(result.compiled).toContain("pm");
    });

    it("uses existing compiled agents when no config exists", async () => {
      await writeFile(path.join(testDirs.agentsDir, "pm.md"), renderAgentMd("pm"));

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

    /**
     * The map handed in is where the pass reads a skill's definition from, and this case now
     * shows it. It used to hand a skill to `pm`, a sub-agent with no stack, and assert only that
     * `pm` compiled — which it does whatever happens to the map, so a pass that ignored the
     * option stayed green.
     *
     * Discovery reads the plugins Claude's registry names, and this tree registers none, so the
     * map is the only place the React definition exists: a compiled `web-developer` naming it
     * can only have read it from there.
     */
    it("uses provided skills instead of loading from plugin", async () => {
      await writeTestTsConfig(
        testDirs.projectDir,
        buildProjectConfig({
          agents: buildAgentConfigs(["web-developer"]),
          skills: buildSkillConfigs([SKILLS.react.id]),
          stack: { "web-developer": { "web-framework": [sa(SKILLS.react.id)] } },
        }),
      );

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["pm", "web-developer"],
        projectDir: testDirs.projectDir,
        skills: { [SKILLS.react.id]: createMockSkillDefinition(SKILLS.react.id) },
      });

      expect(result.compiled).toContain("pm");
      expect(
        await readFile(path.join(testDirs.agentsDir, "web-developer.md"), "utf-8"),
        "the only definition of this skill is the one handed in, so a pass that ignored the map compiles the sub-agent without it",
      ).toContain(SKILLS.react.id);
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

    /**
     * The project's own `agent.liquid` is what renders, which is the whole of what "respects
     * projectDir" can mean here. This case used to create the templates directory EMPTY and
     * assert only that `pm` compiled — an engine that never looked in the project compiles it
     * identically from the CLI's own template, so nothing here could go red.
     */
    it("respects projectDir for local template resolution", async () => {
      const localTemplatesDir = path.join(testDirs.projectDir, CLAUDE_DIR, "templates");
      await mkdir(localTemplatesDir, { recursive: true });
      await copyFile(FIXTURE_AGENT_TEMPLATE, path.join(localTemplatesDir, "agent.liquid"));

      const result = await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["pm"],
        projectDir: testDirs.projectDir,
      });

      expect(result.compiled).toContain("pm");
      expect(
        await readFile(path.join(testDirs.agentsDir, "pm.md"), "utf-8"),
        "the compiled sub-agent came from the CLI's template, so the project's own was never read",
      ).toContain(PROJECT_TEMPLATE_MARKER);
    });

    it("should filter excluded skills from compiled agent output", async () => {
      await writeTestTsConfig(
        testDirs.projectDir,
        buildProjectConfig({
          agents: buildAgentConfigs(["web-developer"]),
          skills: [
            ...buildSkillConfigs([SKILLS.react.id]),
            ...buildSkillConfigs([SKILLS.vitest.id], { excluded: true }),
          ],
          stack: {
            "web-developer": {
              "web-framework": [sa(SKILLS.react.id)],
              "web-testing": [sa(SKILLS.vitest.id)],
            },
          },
        }),
      );

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
      await writeTestTsConfig(
        testDirs.projectDir,
        buildProjectConfig({
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          skills: [
            ...buildSkillConfigs([SKILLS.react.id], { scope: "project" }),
            ...buildSkillConfigs([SKILLS.vitest.id], { scope: "global" }),
          ],
          stack: {
            "web-developer": {
              "web-framework": [sa(SKILLS.react.id)],
              "web-testing": [sa(SKILLS.vitest.id)],
            },
          },
        }),
      );

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
