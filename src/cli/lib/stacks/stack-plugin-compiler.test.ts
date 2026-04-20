/**
 * Unit tests for stack-plugin-compiler. Includes coverage for D-217 (per-skill
 * source-based skill reference formats in compiled agent output).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, readFile, stat } from "fs/promises";
import {
  compileAgentForPlugin,
  compileStackPlugin,
  printStackCompilationSummary,
} from "./stack-plugin-compiler";
import {
  createTestSource,
  cleanupTestSource,
  writeTestFile,
  type TestDirs,
} from "../__tests__/fixtures/create-test-source";
import { createMockAgentConfig } from "../__tests__/factories/agent-factories";
import { createMockCompiledStackPlugin } from "../__tests__/factories/plugin-factories";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE, STANDARD_FILES } from "../../consts";

import type { SkillAssignment, SkillId, Stack, StackAgentConfig, Category } from "../../types";
import { renderAgentYaml, renderConfigTs, renderSkillMd } from "../__tests__/content-generators";
import { expectValidAgentMarkdown } from "../__tests__/assertions";
import { REACT_SKILL_PRELOADED, VITEST_SKILL } from "../__tests__/mock-data/mock-skills";
import { AGENT_DEFS } from "../__tests__/mock-data/mock-agents";
import { createMockSkillEntry } from "../__tests__/factories/skill-factories";
import { SKILLS } from "../__tests__/test-fixtures";

describe("stack-plugin-compiler", () => {
  const REACT_SKILL_ID = "web-framework-react";

  let dirs: TestDirs;
  let projectRoot: string;
  let outputDir: string;
  let testCounter = 0;

  // Generate unique stack ID to avoid cache collisions between tests
  // The loader caches stacks by mode:stackId, so we need unique IDs per test
  function uniqueStackId(base = "test-stack"): string {
    testCounter++;
    return `${base}-${testCounter}-${Date.now()}`;
  }

  beforeEach(async () => {
    // createTestSource sets up source dir with agents/, skills/, config/, and templates
    dirs = await createTestSource({ skills: [], agents: [] });
    // The compiler uses sourceDir as projectRoot (contains src/agents/, src/skills/, config/)
    projectRoot = dirs.sourceDir;
    outputDir = path.join(dirs.tempDir, "output");
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  /** Write agent files (metadata.yaml, identity.md, playbook.md) into the agents directory */
  async function createAgent(
    agentId: string,
    config: {
      title: string;
      description: string;
      tools: string[];
      identity?: string;
      playbook?: string;
    },
  ) {
    const agentDir = path.join(dirs.agentsDir, agentId);
    await mkdir(agentDir, { recursive: true });

    await writeTestFile(
      path.join(agentDir, STANDARD_FILES.AGENT_METADATA_YAML),
      renderAgentYaml(agentId, config.description, { title: config.title, tools: config.tools }),
    );
    await writeTestFile(
      path.join(agentDir, STANDARD_FILES.IDENTITY_MD),
      config.identity || `# ${config.title}\n\nThis is the ${agentId} agent.`,
    );
    await writeTestFile(
      path.join(agentDir, STANDARD_FILES.PLAYBOOK_MD),
      config.playbook || `## Workflow\n\n1. Analyze\n2. Implement\n3. Test`,
    );
  }

  function createStack(
    stackId: string,
    config: {
      name: string;
      description?: string;
      agents: string[];
      philosophy?: string;
      /** Skill assignments per agent, keyed by category */
      agentSkills?: Record<string, Partial<Record<Category, SkillAssignment[]>>>;
    },
  ): Stack {
    // Convert agents array to Record<string, StackAgentConfig>
    const agentsRecord: Record<string, StackAgentConfig> = {};
    for (const agentId of config.agents) {
      agentsRecord[agentId] = config.agentSkills?.[agentId] ?? {};
    }

    return {
      id: stackId,
      name: config.name,
      description: config.description || "",
      agents: agentsRecord,
      philosophy: config.philosophy,
    };
  }

  /** Write a SKILL.md file at the given path under src/skills/ */
  async function createSkillInSource(
    directoryPath: string,
    config: { name: string; description: string; content?: string },
  ) {
    const skillDir = path.join(dirs.skillsDir, directoryPath);
    await mkdir(skillDir, { recursive: true });

    await writeTestFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd(config.name, config.description, config.content),
    );
  }

  describe("compileStackPlugin", () => {
    it("should create plugin directory structure", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
      });

      // Create skill in src/skills/ (new architecture)
      // Directory path is where the files live, frontmatter name is the canonical ID
      const directoryPath = "web/framework/react";
      const frontmatterName = REACT_SKILL_ID;
      await createSkillInSource(directoryPath, {
        name: frontmatterName,
        description: "React development skills",
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        description: "A test stack",
        agents: ["web-developer"],
        agentSkills: {
          "web-developer": {
            "web-framework": [{ id: frontmatterName, preloaded: true }],
          },
        },
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      // Verify directory exists
      const stats = await stat(result.pluginPath);
      expect(stats.isDirectory()).toBe(true);

      // Verify agents subdirectory
      const agentsDirOutput = path.join(result.pluginPath, "agents");
      const agentStats = await stat(agentsDirOutput);
      expect(agentStats.isDirectory()).toBe(true);
    });

    it("should generate valid plugin.json in .claude-plugin directory", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read", "Write"],
      });

      const stackId = uniqueStackId("my-stack");
      const stack = createStack(stackId, {
        name: "My Stack",
        description: "My custom stack",
        agents: ["web-developer"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      const manifestPath = path.join(result.pluginPath, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
      const manifestContent = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestContent);

      expect(manifest.name).toBe(stackId);
      expect(manifest.description).toBe("My custom stack");
      expect(manifest.version).toBe("1.0.0"); // Semver versioning
      // contentHash and updated are no longer in manifest - stored internally
      expect(manifest.contentHash).toBeUndefined();
      expect(manifest.updated).toBeUndefined();
      // Claude Code discovers agents automatically from ./agents/ directory
      expect(manifest.agents).toBeUndefined();
    });

    it("should compile agent markdown files to agents directory", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read", "Write"],
        identity: "# Frontend Developer\n\nThis is the intro.",
        playbook: "## Workflow\n\n1. Build components",
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        agents: ["web-developer"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      const agentMdPath = path.join(result.pluginPath, "agents", "web-developer.md");
      const agentContent = await readFile(agentMdPath, "utf-8");

      expectValidAgentMarkdown(agentContent, "web-developer");
      expect(agentContent).toContain("Frontend Developer");
      expect(agentContent).toContain("Build components");
    });

    it("should generate README.md with stack information", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        description: "A comprehensive test stack",
        agents: ["web-developer"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      const readmePath = path.join(result.pluginPath, "README.md");
      const readmeContent = await readFile(readmePath, "utf-8");

      expect(readmeContent).toContain("# Test Stack");
      expect(readmeContent).toContain("A comprehensive test stack");
      expect(readmeContent).toContain("## Installation");
      expect(readmeContent).toContain(stackId);
    });

    it("should list agents in README", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read", "Write"],
      });

      await createAgent("api-developer", {
        ...AGENT_DEFS.apiDev,
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        agents: ["web-developer", "api-developer"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      const readmePath = path.join(result.pluginPath, "README.md");
      const readmeContent = await readFile(readmePath, "utf-8");

      expect(readmeContent).toContain("## Agents");
      expect(readmeContent).toContain("`web-developer`");
      expect(readmeContent).toContain("`api-developer`");
    });

    it("should return compiled agents list", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      await createAgent("web-tester", {
        ...AGENT_DEFS.webTester,
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        agents: ["web-developer", "web-tester"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      expect(result.agents).toStrictEqual(["web-developer", "web-tester"]);
    });

    it("should return skill plugin references", async () => {
      // Create skills in src/skills/ (new architecture)
      const reactDirPath = "web/framework/react";
      const reactCanonicalId = REACT_SKILL_ID;
      const tsDirPath = "shared/tooling/typescript-config";
      const tsCanonicalId = "shared-tooling-typescript-config";

      await createSkillInSource(reactDirPath, {
        name: reactCanonicalId,
        description: "React development",
      });

      await createSkillInSource(tsDirPath, {
        name: tsCanonicalId,
        description: "TypeScript development",
      });

      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      const stackId = uniqueStackId();
      // Skills assigned via stack agent config (current architecture)
      const stack = createStack(stackId, {
        name: "Test Stack",
        agents: ["web-developer"],
        agentSkills: {
          "web-developer": {
            "web-framework": [{ id: reactCanonicalId, preloaded: true }],
            "shared-tooling": [{ id: tsCanonicalId }],
            // Boundary cast: string keys to branded Category
          } as Partial<Record<Category, SkillAssignment[]>>,
        },
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      // Skill plugins use canonical frontmatter names
      expect(result.skillPlugins).toStrictEqual([
        "web-framework-react",
        "shared-tooling-typescript-config",
      ]);
    });

    it("should return correct manifest structure", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        description: "A versioned stack",
        agents: ["web-developer"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      expect(result.manifest.name).toBe(stackId);
      expect(result.manifest.description).toBe("A versioned stack");
      expect(result.manifest.version).toBe("1.0.0"); // Semver versioning
      // Author comes from stack.author which is empty in new format
    });

    it("should return stack name from config", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Modern React Stack",
        agents: ["web-developer"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      expect(result.stackName).toBe("Modern React Stack");
    });
  });

  describe("compileStackPlugin - error handling", () => {
    it("should throw error when stack config is missing", async () => {
      // Project structure already created in beforeEach via createTestSource

      await expect(
        compileStackPlugin({
          stackId: "nonexistent-stack",
          outputDir,
          projectRoot,
        }),
      ).rejects.toThrow();
    });

    it("should throw error when agent is missing", async () => {
      // Project structure already created in beforeEach via createTestSource

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        agents: ["missing-agent"],
      });

      await expect(
        compileStackPlugin({
          stackId,
          outputDir,
          projectRoot,
          stack,
        }),
      ).rejects.toThrow();
    });
  });

  describe("compileStackPlugin - edge cases", () => {
    it("should handle stack with no skills (empty skillPlugins)", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        agents: ["web-developer"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      expect(result.skillPlugins).toHaveLength(0);
    });

    it.each([
      ["skills", "## Required Skill Plugins"],
      ["philosophy", "## Philosophy"],
      ["principles", "## Principles"],
    ])("should omit %s section from README when stack has none", async (_field, readmeSection) => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        agents: ["web-developer"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      const readmePath = path.join(result.pluginPath, "README.md");
      const readmeContent = await readFile(readmePath, "utf-8");
      expect(readmeContent).not.toContain(readmeSection);
    });

    it("should handle stack with no description", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        agents: ["web-developer"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      const readmePath = path.join(result.pluginPath, "README.md");
      const readmeContent = await readFile(readmePath, "utf-8");
      // Should use default description
      expect(readmeContent).toContain("A Claude Code stack plugin.");
    });

    it("should handle stack without CLAUDE.md", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Test Stack",
        agents: ["web-developer"],
      });

      // Don't create CLAUDE.md

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      // Plugin should still be created successfully
      expect(result.pluginPath).toContain(stackId);

      // CLAUDE.md should not exist in output
      await expect(stat(path.join(result.pluginPath, "CLAUDE.md"))).rejects.toThrow();
    });

    it("should handle multiple agents in a single stack", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read", "Write"],
      });

      await createAgent("api-developer", {
        ...AGENT_DEFS.apiDev,
      });

      await createAgent("web-tester", {
        ...AGENT_DEFS.webTester,
        description: "A web-tester agent",
      });

      const stackId = uniqueStackId();
      const stack = createStack(stackId, {
        name: "Full Stack",
        agents: ["web-developer", "api-developer", "web-tester"],
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      // All agents should be compiled
      expect(result.agents).toHaveLength(3);
      expect(result.agents).toContain("web-developer");
      expect(result.agents).toContain("api-developer");
      expect(result.agents).toContain("web-tester");

      // All agent files should exist
      for (const agent of result.agents) {
        const agentPath = path.join(result.pluginPath, "agents", `${agent}.md`);
        const agentStats = await stat(agentPath);
        expect(agentStats.isFile()).toBe(true);
      }
    });

    it("should include skill plugins in README when skills are present", async () => {
      // Create skills in src/skills/ (new architecture)
      const reactDirPath = "web/framework/react";
      const reactCanonicalId = REACT_SKILL_ID;
      const zustandDirPath = "web/client-state-management/zustand";
      const zustandCanonicalId = "web-state-zustand";

      await createSkillInSource(reactDirPath, {
        name: reactCanonicalId,
        description: "React development",
      });

      await createSkillInSource(zustandDirPath, {
        name: zustandCanonicalId,
        description: "State management",
      });

      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      const stackId = uniqueStackId();
      // Skills assigned via stack agent config (current architecture)
      const stack = createStack(stackId, {
        name: "Test Stack",
        agents: ["web-developer"],
        agentSkills: {
          "web-developer": {
            "web-framework": [{ id: reactCanonicalId, preloaded: true }],
            "web-client-state": [{ id: zustandCanonicalId }],
          },
        },
      });

      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
        stack,
      });

      const readmePath = path.join(result.pluginPath, "README.md");
      const readmeContent = await readFile(readmePath, "utf-8");

      // README uses "Included Skills" with canonical IDs
      expect(readmeContent).toContain("## Included Skills");
      expect(readmeContent).toContain("`web-framework-react`");
      expect(readmeContent).toContain("`web-state-zustand`");
    });
  });

  describe("compileStackPlugin - remote source (projectRoot differs from CLI)", () => {
    async function createStacks(dir: string, stackId: string, agentIds: string[]) {
      const agents: Record<string, Record<string, never>> = {};
      for (const a of agentIds) {
        agents[a] = {};
      }
      const stacksContent = {
        stacks: [
          {
            id: stackId,
            name: "Remote Source Stack",
            description: "A stack from a remote source",
            agents,
          },
        ],
      };
      await writeTestFile(path.join(dir, "config", "stacks.ts"), renderConfigTs(stacksContent));
    }

    it("should load stack from projectRoot when not in CLI stacks.ts", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read", "Write"],
      });

      const stackId = uniqueStackId("remote-stack");

      // Create stacks.ts in projectRoot (simulates a remote/private source)
      // No skills matrix in projectRoot — falls back to CLI matrix
      await createStacks(projectRoot, stackId, ["web-developer"]);

      // No stack option passed — must load from projectRoot's stacks.ts
      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
      });

      expect(result.stackName).toBe("Remote Source Stack");
      expect(result.agents).toContain("web-developer");
    });

    it("should fall back to CLI matrix when projectRoot has no skills matrix", async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read"],
      });

      const stackId = uniqueStackId("matrix-fallback-stack");

      // Create stacks.ts in projectRoot but no skill-categories.ts
      await createStacks(projectRoot, stackId, ["web-developer"]);

      // Should succeed using CLI's skills matrix as fallback
      const result = await compileStackPlugin({
        stackId,
        outputDir,
        projectRoot,
      });

      expect(result.stackName).toBe("Remote Source Stack");
      expect(result.pluginPath).toContain(stackId);
    });
  });

  describe("printStackCompilationSummary", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should print stack name and path", () => {
      printStackCompilationSummary(
        createMockCompiledStackPlugin({
          pluginPath: "/output/test-stack",
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Test Stack"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("/output/test-stack"));
    });

    it("should print agent count and list", () => {
      printStackCompilationSummary(
        createMockCompiledStackPlugin({
          agents: ["web-developer", "api-developer", "web-tester"],
          skillPlugins: [],
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Agents: 3"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("web-developer"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("api-developer"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("web-tester"));
    });

    it("should print skill plugins when present", () => {
      printStackCompilationSummary(
        createMockCompiledStackPlugin({
          skillPlugins: [
            "web-framework-react",
            "web-state-zustand",
            "web-language-typescript" as SkillId,
          ],
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Skills included: 3"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("web-framework-react"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("web-state-zustand"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("web-language-typescript"));
    });

    it("should not print skill plugins section when empty", () => {
      printStackCompilationSummary(
        createMockCompiledStackPlugin({
          skillPlugins: [],
        }),
      );

      // Check that "Skills included" was never called
      const calls = consoleSpy.mock.calls.flat().join("\n");
      expect(calls).not.toContain("Skills included");
    });

    it("should print hooks status when enabled", () => {
      printStackCompilationSummary(
        createMockCompiledStackPlugin({
          skillPlugins: [],
          hasHooks: true,
        }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Hooks: enabled"));
    });

    it("should not print hooks status when disabled", () => {
      printStackCompilationSummary(
        createMockCompiledStackPlugin({
          skillPlugins: [],
        }),
      );

      const calls = consoleSpy.mock.calls.flat().join("\n");
      expect(calls).not.toContain("Hooks:");
    });
  });

  describe("compileAgentForPlugin - per-skill source-based references", () => {
    // Use the real agent.liquid template (includes dynamic skills section)
    const realTemplateDir = path.resolve(__dirname, "../../../../src/agents/_templates");

    // Per-skill source variants. The compiler attaches pluginRef per-skill from
    // `s.source !== undefined && s.source !== "eject"`.
    const REACT_PRELOADED_PLUGIN = createMockSkillEntry(SKILLS.react.id, true, {
      source: "agents-inc",
    });
    const REACT_PRELOADED_EJECT = createMockSkillEntry(SKILLS.react.id, true, {
      source: "eject",
    });
    const VITEST_DYNAMIC_PLUGIN = createMockSkillEntry(SKILLS.vitest.id, false, {
      source: "agents-inc",
    });
    const VITEST_DYNAMIC_EJECT = createMockSkillEntry(SKILLS.vitest.id, false, {
      source: "eject",
    });

    const AGENT_PURE_PLUGIN = createMockAgentConfig(
      "web-developer",
      [REACT_PRELOADED_PLUGIN, VITEST_DYNAMIC_PLUGIN],
      { title: AGENT_DEFS.webDev.title, description: AGENT_DEFS.webDev.description },
    );

    const AGENT_PURE_EJECT = createMockAgentConfig(
      "web-developer",
      [REACT_PRELOADED_EJECT, VITEST_DYNAMIC_EJECT],
      { title: AGENT_DEFS.webDev.title, description: AGENT_DEFS.webDev.description },
    );

    const AGENT_MIXED = createMockAgentConfig(
      "web-developer",
      [REACT_PRELOADED_PLUGIN, VITEST_DYNAMIC_EJECT],
      { title: AGENT_DEFS.webDev.title, description: AGENT_DEFS.webDev.description },
    );

    // Skills WITHOUT a `source` field — represents a user-authored local skill
    // loaded from .claude/skills/ that has no SkillConfig entry.
    const AGENT_NO_SOURCE = createMockAgentConfig(
      "web-developer",
      [REACT_SKILL_PRELOADED, VITEST_SKILL],
      { title: AGENT_DEFS.webDev.title, description: AGENT_DEFS.webDev.description },
    );

    // Dual-scope: same skill id appears twice in the resolved skill list,
    // once as project-eject and once as global-plugin. Each must emit
    // independently. Both react entries are dynamic (preloaded: false) so
    // they appear in body invocations and we can scrape both lines.
    const REACT_DYNAMIC_PROJECT_EJECT = createMockSkillEntry(SKILLS.react.id, false, {
      source: "eject",
    });
    const REACT_DYNAMIC_GLOBAL_PLUGIN = createMockSkillEntry(SKILLS.react.id, false, {
      source: "agents-inc",
    });
    const AGENT_DUAL_SCOPE = createMockAgentConfig(
      "web-developer",
      [REACT_DYNAMIC_PROJECT_EJECT, REACT_DYNAMIC_GLOBAL_PLUGIN],
      { title: AGENT_DEFS.webDev.title, description: AGENT_DEFS.webDev.description },
    );

    // Shared Liquid engine — created per test via beforeEach
    // Boundary cast: dynamic import type not available at declaration
    let engine: import("liquidjs").Liquid;

    beforeEach(async () => {
      await createAgent("web-developer", {
        ...AGENT_DEFS.webDev,
        tools: ["Read", "Write"],
        identity: "# Frontend Dev\n\nIntro.",
        playbook: "## Workflow\n\n1. Build",
      });

      const { Liquid } = await import("liquidjs");
      engine = new Liquid({
        root: [realTemplateDir],
        extname: ".liquid",
        strictVariables: false,
        strictFilters: true,
      });
    });

    it("pure plugin mode: every skill emits pluginRef in frontmatter and body", async () => {
      const output = await compileAgentForPlugin(
        "web-developer",
        AGENT_PURE_PLUGIN,
        projectRoot,
        engine,
      );

      // Preloaded skill (react) → frontmatter `skills:` entry uses pluginRef form.
      expect(output).toContain("web-framework-react:web-framework-react");
      // Dynamic skill (vitest) → body `skill:` invocation uses pluginRef form.
      expect(output).toContain('skill: "web-testing-vitest:web-testing-vitest"');
    });

    it("pure eject mode: every skill emits bare id in frontmatter and body", async () => {
      const output = await compileAgentForPlugin(
        "web-developer",
        AGENT_PURE_EJECT,
        projectRoot,
        engine,
      );

      // Bare ids in both positions; no `id:id` form anywhere.
      expect(output).toContain("web-framework-react");
      expect(output).not.toContain("web-framework-react:web-framework-react");
      expect(output).toContain('skill: "web-testing-vitest"');
      expect(output).not.toContain('skill: "web-testing-vitest:web-testing-vitest"');
    });

    it("mixed mode: plugin skill emits pluginRef, eject skill emits bare id, in same agent", async () => {
      const output = await compileAgentForPlugin("web-developer", AGENT_MIXED, projectRoot, engine);

      // The plugin-source preloaded skill (react) renders `id:id` in frontmatter.
      expect(output).toContain("web-framework-react:web-framework-react");
      // The eject-source dynamic skill (vitest) renders bare id in body invocation.
      expect(output).toContain('skill: "web-testing-vitest"');
      // The eject skill must NOT be wrapped in plugin form.
      expect(output).not.toContain('skill: "web-testing-vitest:web-testing-vitest"');
    });

    it("undefined source (user-authored local skill): emits bare id (treated as eject)", async () => {
      const output = await compileAgentForPlugin(
        "web-developer",
        AGENT_NO_SOURCE,
        projectRoot,
        engine,
      );

      // Skills without `source` are user-authored local — must NOT get pluginRef.
      expect(output).toContain("web-framework-react");
      expect(output).not.toContain("web-framework-react:web-framework-react");
      expect(output).toContain('skill: "web-testing-vitest"');
      expect(output).not.toContain('skill: "web-testing-vitest:web-testing-vitest"');
    });

    it("dual-scope same id: each entry emits the form dictated by its own source", async () => {
      const output = await compileAgentForPlugin(
        "web-developer",
        AGENT_DUAL_SCOPE,
        projectRoot,
        engine,
      );

      // Both react entries are dynamic — both should appear as `skill: "..."` lines.
      // The eject entry → bare id; the plugin entry → `id:id`. They must coexist.
      expect(output).toContain('skill: "web-framework-react"');
      expect(output).toContain('skill: "web-framework-react:web-framework-react"');
    });
  });
});
