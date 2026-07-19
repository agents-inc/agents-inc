import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { INIT_TEST_SKILLS } from "../mock-data/mock-skills";
import { installEject } from "../../installation/local-installer";
import { recompileAgents } from "../../agents/agent-recompiler";
import type { AgentName, ProjectConfig, SkillId } from "../../../types";
import type { SourceLoadResult } from "../../loading/source-loader";
import { buildWizardResult, buildSourceResult } from "../factories/config-factories.js";
import { readTestYaml, readTestTsConfig } from "../helpers/config-io.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { fileExists, directoryExists, createTempDir, cleanupTempDir } from "../test-fs-utils";
import {
  expectConfigSkills,
  expectConfigOnDisk,
  expectCompiledAgents,
  expectInstallResult,
  assertConfigIntegrity,
} from "../assertions/index.js";
import { FULLSTACK_TRIO_MATRIX } from "../mock-data/mock-matrices";
import { deriveInstallMode } from "../../installation/installation";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { CLAUDE_DIR, CLAUDE_SRC_DIR, DEFAULT_SKILLS_SUBDIR, STANDARD_FILES } from "../../../consts";

const AGENTS_SUBDIR = "agents";
let fakeHomeDir: string;

// Matrix whose skill.path values match the file system layout from createTestSource.
// createMockSkill sets path to "skills/{category}/{id}/" and the copier resolves to
// "{sourcePath}/src/skills/{category}/{id}/".
const INIT_TEST_MATRIX = FULLSTACK_TRIO_MATRIX;

// Reusable selections for tests that need multiple skills and agents
const SELECTED_SKILLS_REACT_HONO: SkillId[] = ["web-framework-react", "api-framework-hono"];
const SELECTED_SKILLS_ALL: SkillId[] = [
  "web-framework-react",
  "api-framework-hono",
  "web-testing-vitest",
];
const SELECTED_AGENTS_WEB_API: AgentName[] = ["web-developer", "api-developer"];
const SELECTED_AGENTS_WITH_REVIEWER: AgentName[] = [
  "web-developer",
  "web-reviewer",
  "api-developer",
];

// Isolate all suites from the real home directory
beforeEach(async () => {
  fakeHomeDir = await createTempDir("cc-home-");
  vi.spyOn(os, "homedir").mockReturnValue(fakeHomeDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTempDir(fakeHomeDir);
});

// Shared per-test source/project setup for every suite in this file
let dirs: TestDirs;
let originalCwd: string;
let sourceResult: SourceLoadResult;

beforeEach(async () => {
  originalCwd = process.cwd();
  dirs = await createTestSource({ skills: INIT_TEST_SKILLS });
  process.chdir(dirs.projectDir);
  sourceResult = buildSourceResult(INIT_TEST_MATRIX, dirs.sourceDir);
  initializeMatrix(INIT_TEST_MATRIX);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await cleanupTestSource(dirs);
});

describe("Init Flow Integration: Eject Mode", () => {
  it("should create .claude-src/config.ts with correct structure", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_REACT_HONO), {
        selectedAgents: SELECTED_AGENTS_WEB_API,
      }),
      sourceResult,
      projectDir: dirs.projectDir,
      sourceFlag: dirs.sourceDir,
    });

    // config.ts should exist in .claude-src/
    const configPath = path.join(dirs.projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
    expect(result.configPath).toBe(configPath);
    expect(await fileExists(configPath)).toBe(true);

    // Parse and verify structure
    const config = await expectConfigOnDisk(configPath, {
      skillIds: [...SELECTED_SKILLS_REACT_HONO],
      agentNames: ["api-developer", "web-developer"],
      source: dirs.sourceDir,
    });
    expect(typeof config.name).toBe("string");
    expect(deriveInstallMode(config.skills)).toBe("eject");
  });

  it("should copy selected skills to .claude/skills/", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_REACT_HONO)),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // Skills directory should exist
    const skillsDir = path.join(dirs.projectDir, CLAUDE_DIR, DEFAULT_SKILLS_SUBDIR);
    expect(result.skillsDir).toBe(skillsDir);
    expect(await directoryExists(skillsDir)).toBe(true);

    // Copied skill IDs should match what was selected
    expectInstallResult(result, {
      copiedSkillIds: [...SELECTED_SKILLS_REACT_HONO],
    });

    // Each copied skill should have a SKILL.md
    for (const copiedSkill of result.copiedSkills) {
      expect(await fileExists(path.join(copiedSkill.destPath, STANDARD_FILES.SKILL_MD))).toBe(true);
    }
  });

  it("should compile agents to .claude/agents/", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_REACT_HONO), {
        selectedAgents: SELECTED_AGENTS_WEB_API,
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // Agents directory should exist
    const agentsDir = path.join(dirs.projectDir, CLAUDE_DIR, AGENTS_SUBDIR);
    expect(result.agentsDir).toBe(agentsDir);
    expect(await directoryExists(agentsDir)).toBe(true);

    // Selected agents should be compiled
    expectCompiledAgents(result, SELECTED_AGENTS_WEB_API);

    // Each compiled agent should have a .md file
    for (const agentName of result.compiledAgents) {
      const agentPath = path.join(agentsDir, `${agentName}.md`);
      expect(await fileExists(agentPath)).toBe(true);

      // Agent file should have content (frontmatter + body)
      const content = await readFile(agentPath, "utf-8");
      expect(content).not.toBe("");
      expect(content).toContain("---");
    }
  });

  it("should include selected skills in config.ts skills array", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_ALL)),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);

    // Config skills should exactly match selected skills
    expectConfigSkills(config, SELECTED_SKILLS_ALL);
  });

  it("assigns all selected skills to every selected agent", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_REACT_HONO), {
        selectedAgents: SELECTED_AGENTS_WEB_API,
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);

    expect(Object.keys(config.stack!).sort()).toStrictEqual([...SELECTED_AGENTS_WEB_API].sort());

    // Every agent receives all selected skill categories (no domain filtering).
    expect(Object.keys(config.stack!["web-developer"]!).sort()).toStrictEqual([
      "api-api",
      "web-framework",
    ]);
    expect(Object.keys(config.stack!["api-developer"]!).sort()).toStrictEqual([
      "api-api",
      "web-framework",
    ]);
  });
});

describe("Init Flow Integration: Single Skill Selection", () => {
  it("should handle single skill selection correctly", async () => {
    const selectedSkills: SkillId[] = ["web-testing-vitest"];

    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(selectedSkills)),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // Only the selected skill should be copied
    expectInstallResult(result, {
      copiedSkillIds: ["web-testing-vitest"],
    });

    // Config should reflect single skill
    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    expectConfigSkills(config, ["web-testing-vitest"]);
  });
});

describe("Init Flow Integration: All Skills Selection", () => {
  it("should handle all skills selected from matrix", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_ALL), {
        selectedAgents: SELECTED_AGENTS_WEB_API,
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // All skills should be copied
    expectInstallResult(result, {
      copiedSkillIds: [...SELECTED_SKILLS_ALL],
    });

    // Config should include all skills and expected agents
    await expectConfigOnDisk(result.configPath, {
      skillIds: [...SELECTED_SKILLS_ALL],
      agentNames: ["api-developer", "web-developer"],
    });
  });
});

describe("Init Flow Integration: Source Configuration", () => {
  it("should save source flag to config.ts when provided", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(["web-framework-react"])),
      sourceResult,
      projectDir: dirs.projectDir,
      sourceFlag: dirs.sourceDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    expect(config.source).toBe(dirs.sourceDir);
  });

  it("should use sourceConfig source when no source flag provided", async () => {
    await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(["web-framework-react"])),
      sourceResult,
      projectDir: dirs.projectDir,
      // No sourceFlag — falls back to sourceResult.sourceConfig.source
    });

    const configPath = path.join(dirs.projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
    const config = await readTestTsConfig<ProjectConfig>(configPath);

    // Source comes from sourceResult.sourceConfig.source
    expect(config.source).toBe(dirs.sourceDir);
  });
});

describe("Init Flow Integration: Directory Structure Verification", () => {
  it("should create complete directory structure", async () => {
    await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_REACT_HONO)),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // .claude-src/ should exist
    expect(await directoryExists(path.join(dirs.projectDir, CLAUDE_SRC_DIR))).toBe(true);

    // .claude-src/config.ts should exist
    expect(
      await fileExists(path.join(dirs.projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS)),
    ).toBe(true);

    // .claude/skills/ should exist
    expect(
      await directoryExists(path.join(dirs.projectDir, CLAUDE_DIR, DEFAULT_SKILLS_SUBDIR)),
    ).toBe(true);

    // .claude/agents/ should exist
    expect(await directoryExists(path.join(dirs.projectDir, CLAUDE_DIR, AGENTS_SUBDIR))).toBe(true);
  });

  it("should create skill directories with SKILL.md files", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(["web-framework-react"])),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // Skill directory should have been created
    const skillDir = result.copiedSkills[0].destPath;
    expect(await directoryExists(skillDir)).toBe(true);

    // SKILL.md should contain the skill content
    const skillMdPath = path.join(skillDir, STANDARD_FILES.SKILL_MD);
    expect(await fileExists(skillMdPath)).toBe(true);

    const content = await readFile(skillMdPath, "utf-8");
    expect(content).toContain("React");
  });

  it("should produce agent markdown with valid frontmatter", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_REACT_HONO), {
        selectedAgents: SELECTED_AGENTS_WEB_API,
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // Check at least one compiled agent has valid frontmatter
    const firstAgent = result.compiledAgents[0];
    const agentPath = path.join(result.agentsDir, `${firstAgent}.md`);
    const agentContent = await readFile(agentPath, "utf-8");

    // Should start with frontmatter delimiter
    expect(agentContent.startsWith("---")).toBe(true);

    // Should have closing frontmatter delimiter
    const closingIndex = agentContent.indexOf("---", 3);
    expect(closingIndex).toBeGreaterThan(3);

    // Frontmatter should parse as YAML
    const frontmatterStr = agentContent.slice(3, closingIndex).trim();
    const frontmatter = parseYaml(frontmatterStr) as Record<string, unknown>;
    expect(frontmatter).toHaveProperty("name");
    expect(frontmatter).toHaveProperty("description");
  });
});

describe("Init Flow Integration: Idempotency and Merge", () => {
  it("should merge with existing config on second init", async () => {
    // First init with one skill
    const firstResult = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(["web-framework-react"])),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    expect(firstResult.wasMerged).toBe(false);

    // Second init with additional skill
    const secondResult = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_REACT_HONO)),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    expect(secondResult.wasMerged).toBe(true);

    // Config should have exactly both skills
    const config = await readTestTsConfig<ProjectConfig>(secondResult.configPath);
    expectConfigSkills(config, SELECTED_SKILLS_REACT_HONO);
  });
});

describe("Init Flow Integration: Install Mode in Config", () => {
  it("should set installMode to eject in config", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(
        buildSkillConfigs(["web-framework-react"], { source: "eject" }),
      ),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    expect(deriveInstallMode(config.skills)).toBe("eject");
  });

  it("should set installMode to plugin when wizard selects plugin mode", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(
        buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
      ),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    expect(deriveInstallMode(config.skills)).toBe("plugin");
  });
});

describe("Init Flow Integration: Skill Content Verification", () => {
  it("should preserve skill content when copying", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_REACT_HONO)),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // Find the React skill
    const reactSkill = result.copiedSkills.find((s) => s.skillId === "web-framework-react");
    expect(reactSkill?.skillId).toBe("web-framework-react");

    const reactContent = await readFile(
      path.join(reactSkill!.destPath, STANDARD_FILES.SKILL_MD),
      "utf-8",
    );
    expect(reactContent).toContain("web-framework-react");
    expect(reactContent).toContain("React framework for building user interfaces");

    // Find the Hono skill
    const honoSkill = result.copiedSkills.find((s) => s.skillId === "api-framework-hono");
    expect(honoSkill?.skillId).toBe("api-framework-hono");

    const honoContent = await readFile(
      path.join(honoSkill!.destPath, STANDARD_FILES.SKILL_MD),
      "utf-8",
    );
    expect(honoContent).toContain("api-framework-hono");
    expect(honoContent).toContain("Lightweight web framework for the edge");
  });

  it("should inject forkedFrom metadata on copied skills", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(["web-framework-react"])),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const copiedSkill = result.copiedSkills[0];
    const metadataPath = path.join(copiedSkill.destPath, STANDARD_FILES.METADATA_YAML);
    expect(await fileExists(metadataPath)).toBe(true);

    const metadata = await readTestYaml<Record<string, unknown>>(metadataPath);
    // installEject calls injectForkedFromMetadata which adds forkedFrom
    expect(metadata).toHaveProperty("forkedFrom");

    const forkedFrom = metadata.forkedFrom as Record<string, unknown>;
    expect(forkedFrom.skillId).toBe("web-framework-react");
    expect(typeof forkedFrom.contentHash).toBe("string");
    expect(forkedFrom.contentHash).toHaveLength(7);
  });
});

describe("Init Flow Integration: Selected Agents Filtering", () => {
  it("should only include selected agents and exclude DEFAULT_AGENTS from stack", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_REACT_HONO), {
        selectedAgents: SELECTED_AGENTS_WITH_REVIEWER,
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);

    assertConfigIntegrity(config, SELECTED_SKILLS_REACT_HONO, SELECTED_AGENTS_WITH_REVIEWER);
  });

  it("assigns all selected skills to every selected agent", async () => {
    const result = await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_REACT_HONO), {
        selectedAgents: SELECTED_AGENTS_WITH_REVIEWER,
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);

    expect(Object.keys(config.stack!).sort()).toStrictEqual(
      [...SELECTED_AGENTS_WITH_REVIEWER].sort(),
    );

    // Every agent receives all selected skill categories (no domain filtering).
    for (const agentId of SELECTED_AGENTS_WITH_REVIEWER) {
      const agentStack = config.stack![agentId] as Record<string, unknown>;
      expect(Object.keys(agentStack).sort()).toStrictEqual(["api-api", "web-framework"]);
    }
  });
});

describe("Init Flow Integration: Recompile Round-Trip", () => {
  it("should recompile agents from installEject output", async () => {
    const wizardResult = buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_ALL), {
      selectedAgents: SELECTED_AGENTS_WEB_API,
    });

    const installResult = await installEject({
      wizardResult,
      sourceResult,
      projectDir: dirs.projectDir,
    });

    expectCompiledAgents(installResult, SELECTED_AGENTS_WEB_API);

    // In eject mode, pluginDir is the project dir itself
    const recompileResult = await recompileAgents({
      pluginDir: dirs.projectDir,
      sourcePath: dirs.sourceDir,
      projectDir: dirs.projectDir,
      outputDir: path.join(dirs.projectDir, CLAUDE_DIR, AGENTS_SUBDIR),
    });

    expect(recompileResult.failed).toHaveLength(0);
    expectCompiledAgents({ compiledAgents: recompileResult.compiled }, SELECTED_AGENTS_WEB_API);

    for (const agentName of recompileResult.compiled) {
      const agentPath = path.join(dirs.projectDir, CLAUDE_DIR, AGENTS_SUBDIR, `${agentName}.md`);
      expect(await fileExists(agentPath)).toBe(true);

      const recompiledContent = await readFile(agentPath, "utf-8");
      expect(recompiledContent).toContain("---");
    }
  });

  it("should produce agents that contain skill content from source", async () => {
    const wizardResult = buildWizardResult(buildSkillConfigs(SELECTED_SKILLS_ALL), {
      selectedAgents: SELECTED_AGENTS_WEB_API,
    });

    const installResult = await installEject({
      wizardResult,
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const agentContents = await Promise.all(
      installResult.compiledAgents.map((agentName) =>
        readFile(path.join(dirs.projectDir, CLAUDE_DIR, AGENTS_SUBDIR, `${agentName}.md`), "utf-8"),
      ),
    );

    const foundSkillContent = agentContents.some((agentContent) =>
      INIT_TEST_SKILLS.some(
        (skill) => agentContent.includes(skill.description) || agentContent.includes(skill.id),
      ),
    );
    expect(foundSkillContent).toBe(true);
  });
});

describe("Init Flow Integration: Global Scope Skills", () => {
  it("should route global-scoped skills to home dir and project-scoped to project dir", async () => {
    const projectSkill: SkillId = "web-framework-react";
    const globalSkill: SkillId = "api-framework-hono";

    const skills = [
      { id: projectSkill, scope: "project" as const, source: "eject" as const },
      { id: globalSkill, scope: "global" as const, source: "eject" as const },
    ];

    const result = await installEject({
      wizardResult: buildWizardResult(skills, {
        selectedAgents: SELECTED_AGENTS_WEB_API,
      }),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // Project skill should be under projectDir/.claude/skills/
    const projectSkillDir = path.join(dirs.projectDir, CLAUDE_DIR, DEFAULT_SKILLS_SUBDIR);
    expect(await directoryExists(projectSkillDir)).toBe(true);
    const projectSkillPath = path.join(projectSkillDir, projectSkill, STANDARD_FILES.SKILL_MD);
    expect(await fileExists(projectSkillPath)).toBe(true);

    // Global skill should be under fakeHomeDir/.claude/skills/
    const globalSkillDir = path.join(fakeHomeDir, CLAUDE_DIR, DEFAULT_SKILLS_SUBDIR);
    expect(await directoryExists(globalSkillDir)).toBe(true);
    const globalSkillPath = path.join(globalSkillDir, globalSkill, STANDARD_FILES.SKILL_MD);
    expect(await fileExists(globalSkillPath)).toBe(true);

    // Global skill should NOT be under projectDir
    const wrongPath = path.join(projectSkillDir, globalSkill);
    expect(await directoryExists(wrongPath)).toBe(false);

    // Copied skills should be exactly the two selected skills
    expectInstallResult(result, {
      copiedSkillIds: [projectSkill, globalSkill],
    });
  });
});
