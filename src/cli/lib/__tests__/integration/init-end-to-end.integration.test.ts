import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "fs/promises";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { installEject, installPluginConfig } from "../../installation/local-installer";
import { useWizardStore } from "../../../stores/wizard-store";
import { STANDARD_FILES } from "../../../consts";
import type { MergedSkillsMatrix, ProjectConfig, SkillId } from "../../../types";
import type { SourceLoadResult } from "../../loading/source-loader";
import { createComprehensiveMatrix } from "../factories/matrix-factories.js";
import { buildAgentConfigs, initMatrixAndSource } from "../factories/config-factories.js";
import {
  buildSkillConfigs,
  buildWizardResultFromStore,
  simulateSkillSelections,
} from "../helpers/wizard-simulation.js";
import { readTestTsConfig } from "../helpers/config-io.js";
import { fileExists, directoryExists } from "../test-fs-utils";
import {
  expectConfigSkills,
  expectSkillConfigs,
  expectAgentConfigs,
  expectCompiledAgents,
  assertConfigIntegrity,
} from "../assertions/index.js";
import { EXPECTED_AGENTS, EXPECTED_SKILLS } from "../expected-values.js";
import { ALL_TEST_SKILLS } from "../mock-data/mock-skills";

/**
 * Expected config.stack shape after init: every WEB_AND_API agent carries the
 * same category->skills assignments (the fan-out the installer produces).
 */
function buildExpectedStack(assignments: Record<string, string[]>) {
  return Object.fromEntries(
    [...EXPECTED_AGENTS.WEB_AND_API].sort().map((name) => [name, assignments]),
  );
}

describe("end-to-end: wizard store -> handleComplete -> installEject", () => {
  let dirs: TestDirs;
  let originalCwd: string;
  let matrix: MergedSkillsMatrix;
  let sourceResult: SourceLoadResult;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dirs = await createTestSource({ skills: ALL_TEST_SKILLS });
    process.chdir(dirs.projectDir);

    // Mock os.homedir() to return the project dir so writeScopedConfigs treats this
    // as a home-dir install (no scope splitting) and compileAndWriteAgents writes
    // all agents to the project's .claude/agents/ instead of the real ~/.claude/agents/
    vi.spyOn(os, "homedir").mockReturnValue(dirs.projectDir);

    matrix = createComprehensiveMatrix();
    sourceResult = initMatrixAndSource(matrix, dirs.sourceDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await cleanupTestSource(dirs);
  });

  describe("customize path with explicit agent selection", () => {
    it("should produce config with preselected agents sorted alphabetically", async () => {
      const selectedSkillIds: SkillId[] = [
        "web-framework-react",
        "web-state-zustand",
        "web-styling-scss-modules",
        "api-framework-hono",
      ];

      // Simulate user selecting skills
      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api"]);

      // Simulate navigating to agents step and preselecting agents from domains
      useWizardStore.getState().preselectAgentsFromDomains();

      const wizardResult = buildWizardResultFromStore();

      // Verify agents were preselected from domains (sorted)
      expect(wizardResult.selectedAgents).toStrictEqual(EXPECTED_AGENTS.WEB_AND_API);

      // Install
      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
        sourceFlag: dirs.sourceDir,
      });

      // Read config and verify full shape
      const config = await readTestTsConfig<ProjectConfig>(result.configPath);

      // Full agents shape check (sorted alphabetically)
      expectAgentConfigs(
        config,
        buildAgentConfigs(EXPECTED_AGENTS.WEB_AND_API, { scope: "global" }),
      );

      // Full skills shape check
      expectSkillConfigs(
        config,
        buildSkillConfigs(selectedSkillIds, { scope: "global", source: "agents-inc" }),
      );

      // All selected skills are assigned to every selected agent (no domain filtering).
      const allAssignments = {
        "api-api": ["api-framework-hono"],
        "web-client-state": ["web-state-zustand"],
        "web-framework": ["web-framework-react"],
        "web-styling": ["web-styling-scss-modules"],
      };
      expect(config.stack).toStrictEqual(buildExpectedStack(allAssignments));
    });

    it("should assign skills only to agents in the user's selection", async () => {
      const selectedSkillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];

      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api"]);
      useWizardStore.getState().preselectAgentsFromDomains();

      const wizardResult = buildWizardResultFromStore();
      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
      });

      const config = await readTestTsConfig<ProjectConfig>(result.configPath);

      assertConfigIntegrity(config, selectedSkillIds);

      expectSkillConfigs(
        config,
        buildSkillConfigs(selectedSkillIds, { scope: "global", source: "agents-inc" }),
      );

      expectAgentConfigs(
        config,
        buildAgentConfigs(EXPECTED_AGENTS.WEB_AND_API, { scope: "global" }),
      );

      // All selected skills are assigned to every selected agent.
      const allAssignments = {
        "api-api": ["api-framework-hono"],
        "web-framework": ["web-framework-react"],
      };
      expect(config.stack).toStrictEqual(buildExpectedStack(allAssignments));
    });

    it("should compile agent .md files that exist and have content", async () => {
      const selectedSkillIds: SkillId[] = [
        "web-framework-react",
        "web-state-zustand",
        "api-framework-hono",
      ];

      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api"]);
      useWizardStore.getState().preselectAgentsFromDomains();

      const wizardResult = buildWizardResultFromStore();
      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
      });

      expectCompiledAgents(result, EXPECTED_AGENTS.WEB_AND_API);

      for (const agentName of result.compiledAgents) {
        const agentPath = path.join(result.agentsDir, `${agentName}.md`);
        expect(await fileExists(agentPath)).toBe(true);

        const content = await readFile(agentPath, "utf-8");
        expect(content).not.toBe("");
        expect(content).toContain("---");
      }
    });
  });

  describe("accept defaults path (selectedAgents = empty)", () => {
    it("should produce empty agents when no explicit agent selection", async () => {
      const selectedSkillIds: SkillId[] = [
        "web-framework-react",
        "web-state-zustand",
        "api-framework-hono",
      ];

      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api"]);

      // Do NOT call preselectAgentsFromDomains — selectedAgents stays []
      const wizardResult = buildWizardResultFromStore();
      expect(wizardResult.selectedAgents).toStrictEqual([]);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
      });

      const config = await readTestTsConfig<ProjectConfig>(result.configPath);

      // When selectedAgents is empty, no agents are assigned
      expectAgentConfigs(config, []);

      // Full skills shape check
      expectSkillConfigs(config, buildSkillConfigs(selectedSkillIds));

      // No stack when no agents
      expect(config.stack).toBeUndefined();
    });

    it("should produce empty agents and no stack when no agent selection is made", async () => {
      const selectedSkillIds: SkillId[] = ["web-framework-react"];

      simulateSkillSelections(selectedSkillIds, matrix, ["web"]);
      // No preselectAgentsFromDomains call -> selectedAgents stays []

      const wizardResult = buildWizardResultFromStore();
      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
      });

      const config = await readTestTsConfig<ProjectConfig>(result.configPath);

      // When no agents are selected, agents list is empty and no stack is built
      expectAgentConfigs(config, []);
      expectSkillConfigs(config, buildSkillConfigs(["web-framework-react"]));
      expect(config.stack).toBeUndefined();
    });
  });

  describe("plugin mode with explicit agent selection", () => {
    it("should generate config and compile agents without copying skills", async () => {
      const selectedSkillIds: SkillId[] = [
        "web-framework-react",
        "web-state-zustand",
        "api-framework-hono",
      ];

      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api"]);
      useWizardStore.getState().preselectAgentsFromDomains();

      const wizardResult = buildWizardResultFromStore();

      const result = await installPluginConfig({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
        sourceFlag: dirs.sourceDir,
      });

      // Config should exist
      expect(await fileExists(result.configPath)).toBe(true);

      const config = await readTestTsConfig<ProjectConfig>(result.configPath);

      expectAgentConfigs(
        config,
        buildAgentConfigs(EXPECTED_AGENTS.WEB_AND_API, { scope: "global" }),
      );

      expectSkillConfigs(
        config,
        buildSkillConfigs(selectedSkillIds, { scope: "global", source: "agents-inc" }),
      );

      // All selected skills are assigned to every selected agent (no domain filtering).
      const allAssignments = {
        "api-api": ["api-framework-hono"],
        "web-client-state": ["web-state-zustand"],
        "web-framework": ["web-framework-react"],
      };
      expect(config.stack).toStrictEqual(buildExpectedStack(allAssignments));

      // Compiled agents should exist as .md files
      expectCompiledAgents(result, EXPECTED_AGENTS.WEB_AND_API);
      for (const agentName of result.compiledAgents) {
        const agentPath = path.join(result.agentsDir, `${agentName}.md`);
        expect(await fileExists(agentPath)).toBe(true);
      }

      // Plugin mode: no copiedSkills property (not part of PluginConfigResult)
      // Verify by checking the result type doesn't have copiedSkills
      expect("copiedSkills" in result).toBe(false);
    });

    it("should produce same agent list as eject mode for same selections", async () => {
      const selectedSkillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];

      // Setup for plugin mode
      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api"]);
      useWizardStore.getState().preselectAgentsFromDomains();
      const pluginResult = buildWizardResultFromStore();
      const pluginAgents = [...pluginResult.selectedAgents].sort();

      // Reset and setup for eject mode with same selections
      useWizardStore.getState().reset();
      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api"]);
      useWizardStore.getState().preselectAgentsFromDomains();
      const ejectResult = buildWizardResultFromStore();
      const ejectAgents = [...ejectResult.selectedAgents].sort();

      // Same selections should produce same agent list
      expect(pluginAgents).toStrictEqual(ejectAgents);

      // Same skills (including methodology)
      expect([...pluginResult.skills.map((s) => s.id)].sort()).toStrictEqual(
        [...ejectResult.skills.map((s) => s.id)].sort(),
      );
    });
  });

  describe("stack consistency invariants", () => {
    it("every agent in config.stack should be in config.agents", async () => {
      const selectedSkillIds: SkillId[] = [
        "web-framework-react",
        "web-state-zustand",
        "web-styling-scss-modules",
        "api-framework-hono",
        "api-database-drizzle",
        "web-testing-vitest",
      ];

      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api", "shared"]);
      useWizardStore.getState().preselectAgentsFromDomains();

      const wizardResult = buildWizardResultFromStore();
      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
      });

      const config = await readTestTsConfig<ProjectConfig>(result.configPath);

      assertConfigIntegrity(config, selectedSkillIds);

      expectSkillConfigs(
        config,
        buildSkillConfigs(selectedSkillIds, { scope: "global", source: "agents-inc" }),
      );

      expectAgentConfigs(
        config,
        buildAgentConfigs(EXPECTED_AGENTS.WEB_AND_API, { scope: "global" }),
      );

      // All selected skills are assigned to every selected agent (no domain filtering).
      const allAssignments = {
        "api-api": ["api-framework-hono"],
        "api-database": ["api-database-drizzle"],
        "web-client-state": ["web-state-zustand"],
        "web-framework": ["web-framework-react"],
        "web-styling": ["web-styling-scss-modules"],
        "web-testing": ["web-testing-vitest"],
      };
      expect(config.stack).toStrictEqual(buildExpectedStack(allAssignments));
    });

    it("every skill ID in config.stack should be in config.skills", async () => {
      const selectedSkillIds: SkillId[] = [
        "web-framework-react",
        "web-state-zustand",
        "api-framework-hono",
        "api-database-drizzle",
      ];

      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api"]);
      useWizardStore.getState().preselectAgentsFromDomains();

      const wizardResult = buildWizardResultFromStore();
      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
      });

      const config = await readTestTsConfig<ProjectConfig>(result.configPath);

      expectSkillConfigs(
        config,
        buildSkillConfigs(selectedSkillIds, { scope: "global", source: "agents-inc" }),
      );

      expectAgentConfigs(
        config,
        buildAgentConfigs(EXPECTED_AGENTS.WEB_AND_API, { scope: "global" }),
      );

      // All selected skills are assigned to every selected agent (no domain filtering).
      const allAssignments = {
        "api-api": ["api-framework-hono"],
        "api-database": ["api-database-drizzle"],
        "web-client-state": ["web-state-zustand"],
        "web-framework": ["web-framework-react"],
      };
      expect(config.stack).toStrictEqual(buildExpectedStack(allAssignments));
    });

    it("no DEFAULT_AGENTS in stack when selectedAgents is populated without them", async () => {
      const selectedSkillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];

      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api"]);
      useWizardStore.getState().preselectAgentsFromDomains();

      // Verify that preselectAgentsFromDomains does NOT include default meta agents
      const store = useWizardStore.getState();
      expect(store.selectedAgents).not.toContain("agent-summoner");
      expect(store.selectedAgents).not.toContain("skill-summoner");
      expect(store.selectedAgents).not.toContain("codex-keeper");

      const wizardResult = buildWizardResultFromStore();
      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
      });

      const config = await readTestTsConfig<ProjectConfig>(result.configPath);

      assertConfigIntegrity(config, selectedSkillIds);
    });
  });

  describe("preselectAgentsFromDomains behavior", () => {
    it("should select web domain agents when web domain is selected", () => {
      useWizardStore.setState({
        selectedDomains: ["web"],
      });

      useWizardStore.getState().preselectAgentsFromDomains();
      const store = useWizardStore.getState();

      expect(store.selectedAgents).toStrictEqual(EXPECTED_AGENTS.WEB);
    });

    it("should select combined agents for web + api domains", () => {
      useWizardStore.setState({
        selectedDomains: ["web", "api"],
      });

      useWizardStore.getState().preselectAgentsFromDomains();
      const store = useWizardStore.getState();

      expect(store.selectedAgents).toStrictEqual(EXPECTED_AGENTS.WEB_AND_API);
    });

    it("should select cli agents when cli domain is selected", () => {
      useWizardStore.setState({
        selectedDomains: ["cli"],
      });

      useWizardStore.getState().preselectAgentsFromDomains();
      const store = useWizardStore.getState();

      expect(store.selectedAgents).toStrictEqual(EXPECTED_AGENTS.CLI);
    });
  });

  describe("validation runs correctly", () => {
    it("should produce valid validation for non-conflicting skills", () => {
      const selectedSkillIds: SkillId[] = [...EXPECTED_SKILLS.WEB_DEFAULT];

      simulateSkillSelections(selectedSkillIds, matrix, ["web"]);
      const wizardResult = buildWizardResultFromStore();

      expect(wizardResult.validation.valid).toBe(true);
      expect(wizardResult.validation.errors).toHaveLength(0);
    });

    it("should detect conflicts for react + vue selection", () => {
      // React and Vue conflict with each other in the comprehensive matrix
      const selectedSkillIds: SkillId[] = [
        "web-framework-react",
        "web-framework-vue-composition-api",
      ];

      simulateSkillSelections(selectedSkillIds, matrix, ["web"]);
      const wizardResult = buildWizardResultFromStore();

      // Validation should report errors for conflicting skills
      expect(wizardResult.validation.errors).toHaveLength(1);
    });
  });

  describe("stack defaults path through wizard store", () => {
    it("should use stack allSkillIds when stackAction is defaults", async () => {
      const stackId = "nextjs-fullstack";
      const stack = matrix.suggestedStacks.find((s) => s.id === stackId);
      expect(stack?.id).toBe(stackId);

      // Simulate selecting a stack and accepting defaults
      useWizardStore.setState({
        selectedStackId: stackId,
        stackAction: "defaults",
        approach: "stack",
        selectedDomains: ["web", "api"],
        step: "confirm",
      });

      // Preselect agents from domains
      useWizardStore.getState().preselectAgentsFromDomains();

      const wizardResult = buildWizardResultFromStore();

      // Skills should come from stack.allSkillIds (exact match)
      const sortedStackSkillIds = [...stack!.allSkillIds].sort();
      expect(wizardResult.skills.map((s) => s.id).sort()).toStrictEqual(sortedStackSkillIds);

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
      });

      const config = await readTestTsConfig<ProjectConfig>(result.configPath);

      // Config should include exactly the stack skills
      expectConfigSkills(config, sortedStackSkillIds);
    });
  });

  describe("file system output verification", () => {
    it("should create the complete directory structure", async () => {
      const selectedSkillIds: SkillId[] = ["web-framework-react", "api-framework-hono"];

      simulateSkillSelections(selectedSkillIds, matrix, ["web", "api"]);
      useWizardStore.getState().preselectAgentsFromDomains();

      const wizardResult = buildWizardResultFromStore();
      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
      });

      // .claude-src/config.ts
      expect(await fileExists(result.configPath)).toBe(true);

      // .claude/skills/
      expect(await directoryExists(result.skillsDir)).toBe(true);

      // .claude/agents/
      expect(await directoryExists(result.agentsDir)).toBe(true);

      // Copied skills should have SKILL.md
      for (const copiedSkill of result.copiedSkills) {
        expect(await fileExists(path.join(copiedSkill.destPath, STANDARD_FILES.SKILL_MD))).toBe(
          true,
        );
      }
    });

    it("should write config.ts with satisfies ProjectConfig", async () => {
      const selectedSkillIds: SkillId[] = ["web-framework-react"];

      simulateSkillSelections(selectedSkillIds, matrix, ["web"]);
      const wizardResult = buildWizardResultFromStore();

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
      });

      const configContent = await readFile(result.configPath, "utf-8");

      // Should use plain object export with satisfies
      expect(configContent).not.toContain("defineConfig");
      expect(configContent).toContain("export default {");
      expect(configContent).toContain("satisfies ProjectConfig");

      // Should parse back to valid config
      const config = await readTestTsConfig<ProjectConfig>(result.configPath);
      expect(typeof config.name).toBe("string");
      expect(Array.isArray(config.agents)).toBe(true);
      expectConfigSkills(config, ["web-framework-react"]);
    });

    it("should set source flag in config when provided", async () => {
      const selectedSkillIds: SkillId[] = ["web-framework-react"];

      simulateSkillSelections(selectedSkillIds, matrix, ["web"]);
      const wizardResult = buildWizardResultFromStore();

      const result = await installEject({
        wizardResult,
        sourceResult,
        projectDir: dirs.projectDir,
        sourceFlag: "github:my-org/my-marketplace",
      });

      const config = await readTestTsConfig<ProjectConfig>(result.configPath);
      expect(config.source).toBe("github:my-org/my-marketplace");
    });
  });
});
