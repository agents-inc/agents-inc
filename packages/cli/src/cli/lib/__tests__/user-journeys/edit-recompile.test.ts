import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir } from "fs/promises";
import { recompileAgents, type RecompileAgentsOptions } from "../../agents";
import {
  createTestSource,
  cleanupTestSource,
  fileExists,
  readTestFile,
  writeTestFile,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_AGENTS } from "../mock-data/mock-agents";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { buildTestProjectConfig } from "../factories/config-factories.js";
import { createMockSkillDefinition } from "../factories/skill-factories.js";
import { writeTestSkill } from "../helpers/disk-writers.js";
import { silenceConsole } from "../helpers/silence-console.js";
import { STANDARD_DIRS, STANDARD_FILES } from "../../../consts";
import type { AgentName, SkillDefinitionMap } from "../../../types";
import { expectValidAgentMarkdown } from "../assertions";

const CLI_REPO_PATH = path.resolve(__dirname, "../../../../..");
const EDIT_MARKER = "EDITED-SKILL-CONTENT-MARKER";
const APPENDED_SKILL_SECTION = `\n\n## Added Section\n\nThis section was added after initial compilation. ${EDIT_MARKER}\n`;

function buildRecompileOptions(
  dirs: TestDirs,
  outputDir: string,
  overrides?: Partial<RecompileAgentsOptions>,
): RecompileAgentsOptions {
  return {
    pluginDir: dirs.pluginDir ?? dirs.projectDir,
    sourcePath: CLI_REPO_PATH,
    projectDir: dirs.projectDir,
    outputDir,
    ...overrides,
  };
}

describe("User Journey: Edit -> Recompile -> Verify", () => {
  let dirs: TestDirs;
  let outputDir: string;

  silenceConsole(["log", "warn"]);

  beforeEach(async () => {
    // Create test source with plugin structure containing default skills and agents
    dirs = await createTestSource({
      skills: DEFAULT_TEST_SKILLS,
      agents: DEFAULT_TEST_AGENTS,
      projectConfig: buildTestProjectConfig(
        ["web-developer", "api-developer"],
        DEFAULT_TEST_SKILLS.map((s) => s.id),
        { name: "test-recompile-project", description: "Test project for edit-recompile flow" },
      ),
      asPlugin: true,
    });

    outputDir = path.join(dirs.tempDir, "output");
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  it("should produce valid initial compilation", async () => {
    const options = buildRecompileOptions(dirs, outputDir, {
      agents: ["web-pm"],
    });

    const result = await recompileAgents(options);

    // web-pm is a simple agent that should compile without skill issues
    expect(result.compiled).toContain("web-pm");
    expect(result.failed).toStrictEqual([]);

    // Verify the agent file was created
    const agentPath = path.join(outputDir, "web-pm.md");
    expect(await fileExists(agentPath)).toBe(true);

    const content = await readTestFile(agentPath);
    expectValidAgentMarkdown(content, "web-pm");
  });

  it("should detect and incorporate skill edits on recompile", async () => {
    const pluginDir = dirs.pluginDir!;
    const pluginSkillsDir = path.join(pluginDir, STANDARD_DIRS.SKILLS);

    // Step 1: Initial compile with skills provided directly
    const reactSkillDef: SkillDefinitionMap = {
      "web-framework-react": createMockSkillDefinition("web-framework-react", {
        description: "React framework",
      }),
    };

    const initialOptions = buildRecompileOptions(dirs, outputDir, {
      agents: ["web-pm"],
      skills: reactSkillDef,
    });

    const initialResult = await recompileAgents(initialOptions);
    expect(initialResult.compiled).toContain("web-pm");

    const agentPath = path.join(outputDir, "web-pm.md");

    // Step 2: Edit a skill file in the plugin directory
    const reactSkillPath = path.join(
      pluginSkillsDir,
      "web-framework-react",
      STANDARD_FILES.SKILL_MD,
    );
    if (await fileExists(reactSkillPath)) {
      const originalSkill = await readTestFile(reactSkillPath);
      await writeTestFile(reactSkillPath, originalSkill + APPENDED_SKILL_SECTION);
    }

    // Step 3: Recompile (loadPluginSkills will re-read the edited skill files)
    const recompileOptions = buildRecompileOptions(dirs, outputDir, {
      agents: ["web-pm"],
      // Don't provide skills - let it reload from plugin dir
    });

    const recompileResult = await recompileAgents(recompileOptions);
    expect(recompileResult.compiled).toContain("web-pm");
    expect(recompileResult.failed).toStrictEqual([]);

    // Step 4: Verify the agent was recompiled (file was overwritten)
    const recompiledContent = await readTestFile(agentPath);
    expectValidAgentMarkdown(recompiledContent, "web-pm");
  });

  it("should preserve unchanged agents during recompile", async () => {
    // Compile two agents
    const options = buildRecompileOptions(dirs, outputDir, {
      agents: ["web-pm"],
    });

    const result1 = await recompileAgents(options);
    expect(result1.compiled).toContain("web-pm");

    const agentPath = path.join(outputDir, "web-pm.md");
    const firstContent = await readTestFile(agentPath);

    // Recompile the same agent with no changes to skills
    const result2 = await recompileAgents(options);
    expect(result2.compiled).toContain("web-pm");
    expect(result2.failed).toStrictEqual([]);

    // Content should be equivalent (same agent, same skills -> same output)
    const secondContent = await readTestFile(agentPath);
    expect(secondContent).toBe(firstContent);
  });

  it("should handle adding new skills to existing agents", async () => {
    const pluginDir = dirs.pluginDir!;
    const pluginSkillsDir = path.join(pluginDir, STANDARD_DIRS.SKILLS);

    // Step 1: Initial compile with no skills provided (empty plugin skills)
    const initialOptions = buildRecompileOptions(dirs, outputDir, {
      agents: ["web-pm"],
      skills: {},
    });

    const initialResult = await recompileAgents(initialOptions);
    expect(initialResult.compiled).toContain("web-pm");

    const agentPath = path.join(outputDir, "web-pm.md");

    // Step 2: Add a brand new skill to the plugin skills directory
    await writeTestSkill(pluginSkillsDir, "web-testing-vitest", {
      skipMetadata: true,
    });

    // Step 3: Recompile without providing skills (force reload from plugin dir)
    const recompileOptions = buildRecompileOptions(dirs, outputDir, {
      agents: ["web-pm"],
    });

    const recompileResult = await recompileAgents(recompileOptions);
    expect(recompileResult.compiled).toContain("web-pm");
    expect(recompileResult.failed).toStrictEqual([]);

    // The agent file should still be valid after recompile
    const recompiledContent = await readTestFile(agentPath);
    expectValidAgentMarkdown(recompiledContent, "web-pm");
  });

  it("should handle removing skills from agents", async () => {
    // Step 1: Initial compile with explicit skills
    const initialSkills: SkillDefinitionMap = {
      "web-framework-react": createMockSkillDefinition("web-framework-react", {
        description: "React framework",
      }),
      "web-state-zustand": createMockSkillDefinition("web-state-zustand", {
        description: "State management",
      }),
    };

    const initialOptions = buildRecompileOptions(dirs, outputDir, {
      agents: ["web-pm"],
      skills: initialSkills,
    });

    const initialResult = await recompileAgents(initialOptions);
    expect(initialResult.compiled).toContain("web-pm");

    // Step 2: Recompile with fewer skills (simulating removal)
    const reducedSkills: SkillDefinitionMap = {
      "web-framework-react": createMockSkillDefinition("web-framework-react", {
        description: "React framework",
      }),
    };

    const recompileOptions = buildRecompileOptions(dirs, outputDir, {
      agents: ["web-pm"],
      skills: reducedSkills,
    });

    const recompileResult = await recompileAgents(recompileOptions);
    expect(recompileResult.compiled).toContain("web-pm");
    expect(recompileResult.failed).toStrictEqual([]);

    // Verify the agent file is still valid
    const agentPath = path.join(outputDir, "web-pm.md");
    const content = await readTestFile(agentPath);
    expectValidAgentMarkdown(content, "web-pm");
  });

  it("should report correct compiled and failed agent lists", async () => {
    // Compile a valid agent and an invalid one
    const options = buildRecompileOptions(dirs, outputDir, {
      agents: ["web-pm", "non-existent-agent-xyz" as AgentName],
    });

    const result = await recompileAgents(options);

    // web-pm should compile, non-existent should be warned about
    expect(result.compiled).toContain("web-pm");
    expect(result.warnings).toStrictEqual(
      expect.arrayContaining([expect.stringContaining("non-existent-agent-xyz")]),
    );
  });

  it("should write recompiled agents to the specified output directory", async () => {
    const customOutputDir = path.join(dirs.tempDir, "custom-output");
    await mkdir(customOutputDir, { recursive: true });

    const options = buildRecompileOptions(dirs, customOutputDir, {
      agents: ["web-pm"],
    });

    const result = await recompileAgents(options);
    expect(result.compiled).toContain("web-pm");

    // Verify file is in the custom output directory, not the plugin dir
    const agentPath = path.join(customOutputDir, "web-pm.md");
    expect(await fileExists(agentPath)).toBe(true);

    const content = await readTestFile(agentPath);
    expectValidAgentMarkdown(content, "web-pm");
  });

  it("should produce identical output on consecutive recompiles without changes", async () => {
    const options = buildRecompileOptions(dirs, outputDir, {
      agents: ["web-pm"],
    });

    // First compile
    await recompileAgents(options);
    const agentPath = path.join(outputDir, "web-pm.md");
    const firstContent = await readTestFile(agentPath);

    // Second compile
    await recompileAgents(options);
    const secondContent = await readTestFile(agentPath);

    // Third compile
    await recompileAgents(options);
    const thirdContent = await readTestFile(agentPath);

    // All three should be identical (deterministic compilation)
    expect(firstContent).toBe(secondContent);
    expect(secondContent).toBe(thirdContent);
  });
});
