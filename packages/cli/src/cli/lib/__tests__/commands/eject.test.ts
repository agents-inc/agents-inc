import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir, fileExists, directoryExists } from "../test-fs-utils";
import { readTestYaml, readTestTsConfig } from "../helpers/config-io.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { createMockMatrix } from "../factories/matrix-factories.js";
import { buildWizardResult, buildSourceResult } from "../factories/config-factories.js";
import { parseTestFrontmatter } from "../helpers/index.js";
import { SKILLS } from "../test-fixtures";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { installEject, installPluginConfig } from "../../installation/local-installer";
import { copySkillsToLocalFlattened } from "../../skills/skill-copier";
import {
  CLAUDE_SRC_DIR,
  DIRS,
  LOCAL_SKILLS_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import { typedKeys } from "../../../utils/typed-object";
import { initializeMatrix } from "../../matrix/matrix-provider";
import type { MergedSkillsMatrix, ProjectConfig, SkillId } from "../../../types";
import { firstElement } from "../helpers/element-at.js";

const EJECT_INSTALLED_SKILL_IDS: SkillId[] = ["web-framework-react", "api-framework-hono"];

/**
 * Every directory `eject agent-partials` copies out of `src/agents/` — the
 * templates directory plus one directory per agent role. Asserted by name
 * rather than by count so a roster reorganization names what moved.
 */
const EJECTED_AGENT_DIRS = [
  path.basename(DIRS.templates),
  "developer",
  "meta",
  "planning",
  "researcher",
  "reviewer",
  "tester",
].sort();

describe("eject command", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-eject-test-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  describe("argument validation", () => {
    it("should require type argument", async () => {
      const { error } = await runCliCommand(["eject"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("should error on invalid type", async () => {
      const { error } = await runCliCommand(["eject", "invalid-type"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("should accept 'agent-partials' as type", async () => {
      const { error } = await runCliCommand(["eject", "agent-partials"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept 'skills' as type", async () => {
      const { error } = await runCliCommand(["eject", "skills"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown eject type");
    });

    it("should accept 'all' as type", async () => {
      const { error } = await runCliCommand(["eject", "all"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept 'templates' as type", async () => {
      const { error } = await runCliCommand(["eject", "templates"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should reject old type 'config'", async () => {
      const { error } = await runCliCommand(["eject", "config"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("should reject old type 'agents'", async () => {
      const { error } = await runCliCommand(["eject", "agents"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });
  });

  describe("flag validation", () => {
    it("should accept --force flag", async () => {
      const { error } = await runCliCommand(["eject", "agent-partials", "--force"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept -f shorthand for force", async () => {
      const { error } = await runCliCommand(["eject", "agent-partials", "-f"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept --output flag", async () => {
      const outputDir = path.join(tempDir, "custom-output");

      const { error } = await runCliCommand(["eject", "agent-partials", "--output", outputDir]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept -o shorthand for output", async () => {
      const outputDir = path.join(tempDir, "custom-output");

      const { error } = await runCliCommand(["eject", "agent-partials", "-o", outputDir]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("rejects --refresh — every load revalidates, so there is nothing to force", async () => {
      const { error } = await runCliCommand(["eject", "skills", "--refresh"]);

      expect(error?.message).toContain("Nonexistent flag: --refresh");
    });
  });

  describe("eject agent-partials", () => {
    it("should eject agent partials to .claude/agents/_partials by default", async () => {
      const { error } = await runCliCommand(["eject", "agent-partials"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unexpected argument");

      const partialsDir = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_DIRS.AGENTS);
      expect(await directoryExists(partialsDir)).toBe(true);
    });

    it("should create config.ts if it does not exist", async () => {
      await runCliCommand(["eject", "agent-partials"]);

      const configPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      expect(await fileExists(configPath)).toBe(true);

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("export default");
      expect(content).toContain('"name": "project"');
    });

    it("should not overwrite existing config.yaml", async () => {
      // Create existing config with custom YAML content (eject checks both .ts and .yaml)
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, "config.yaml");
      const customContent = "name: my-custom-project\nauthor: test-author\n";
      await writeFile(configPath, customContent);

      await runCliCommand(["eject", "agent-partials"]);

      // YAML config should still exist unchanged
      const content = await readFile(configPath, "utf-8");
      expect(content).toBe(customContent);
    });

    it("should still create config.ts when using --output flag", async () => {
      const outputDir = path.join(tempDir, "custom-output");

      await runCliCommand(["eject", "agent-partials", "--output", outputDir]);

      const configPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
      expect(await fileExists(configPath)).toBe(true);
    });

    it("should eject agent partials to custom output with --output", async () => {
      const outputDir = path.join(tempDir, "custom-partials");

      const { error } = await runCliCommand(["eject", "agent-partials", "--output", outputDir]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should warn when partials already exist without --force", async () => {
      // First eject
      await runCliCommand(["eject", "agent-partials"]);

      // Second eject without --force should warn (not error)
      const { error } = await runCliCommand(["eject", "agent-partials"]);

      // Should not crash, may warn
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("crash");
    });

    it("should overwrite partials when --force is used", async () => {
      // First eject
      await runCliCommand(["eject", "agent-partials"]);

      // Second eject with --force
      const { error } = await runCliCommand(["eject", "agent-partials", "--force"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should preserve existing templates when ejecting agent-partials", async () => {
      const agentsDir = path.join(projectDir, CLAUDE_SRC_DIR, path.basename(DIRS.agents));
      const templatesDir = path.join(agentsDir, path.basename(DIRS.templates));

      await mkdir(templatesDir, { recursive: true });
      await writeFile(path.join(templatesDir, "agent.liquid"), "custom template content");

      const { stdout, stderr } = await runCliCommand(["eject", "agent-partials"]);

      expect(stderr).toContain("templates already exist");
      expect(stdout).toContain("Agent partials ejected");

      // Custom template content should be preserved
      const templateContent = await readFile(path.join(templatesDir, "agent.liquid"), "utf-8");
      expect(templateContent).toBe("custom template content");
    });

    it("should block agent-partials eject when agents/ contains actual agent dirs", async () => {
      const agentsDir = path.join(projectDir, CLAUDE_SRC_DIR, path.basename(DIRS.agents));

      // Manually create agents/ with an actual agent subdir to simulate a prior full eject
      await mkdir(path.join(agentsDir, "developer"), { recursive: true });
      await writeFile(
        path.join(agentsDir, "developer", STANDARD_FILES.AGENT_METADATA_YAML),
        "id: developer",
      );

      // Second full eject without --force should be blocked
      const { stderr } = await runCliCommand(["eject", "agent-partials"]);

      expect(stderr).toContain("already exist");
      expect(stderr).toContain("--force");
    });
  });

  describe("eject templates", () => {
    it("should eject only templates directory", async () => {
      const { stdout } = await runCliCommand(["eject", "templates"]);

      expect(stdout).toContain("Agent templates ejected");

      const templatesDir = path.join(
        projectDir,
        CLAUDE_SRC_DIR,
        path.basename(DIRS.agents),
        path.basename(DIRS.templates),
      );
      expect(await directoryExists(templatesDir)).toBe(true);

      const entries = await readdir(templatesDir);
      expect(entries).toHaveLength(2);
      expect(entries).toContain("agent.liquid");
    });

    it("should not eject other agent partials", async () => {
      await runCliCommand(["eject", "templates"]);

      const agentsDir = path.join(projectDir, CLAUDE_SRC_DIR, path.basename(DIRS.agents));
      const entries = await readdir(agentsDir);

      // Only _templates should exist, not developer/, reviewer/, etc.
      expect(entries).toStrictEqual([path.basename(DIRS.templates)]);
    });

    it("should warn with --force suggestion when templates already exist without --force", async () => {
      // First eject creates the templates
      await runCliCommand(["eject", "templates"]);

      // Second eject without --force should warn
      const { stderr } = await runCliCommand(["eject", "templates"]);

      expect(stderr).toContain("already exist");
      expect(stderr).toContain("--force");
    });

    it("should preserve existing templates without --force", async () => {
      // First eject creates the templates
      await runCliCommand(["eject", "templates"]);

      const templatesDir = path.join(
        projectDir,
        CLAUDE_SRC_DIR,
        path.basename(DIRS.agents),
        path.basename(DIRS.templates),
      );

      // Modify a template file to detect overwrites
      const agentLiquidPath = path.join(templatesDir, "agent.liquid");
      await writeFile(agentLiquidPath, "custom template content");

      // Second eject without --force
      await runCliCommand(["eject", "templates"]);

      // Custom content should be preserved
      const afterContent = await readFile(agentLiquidPath, "utf-8");
      expect(afterContent).toBe("custom template content");
    });

    it("should overwrite existing templates with --force", async () => {
      // First eject creates the templates
      await runCliCommand(["eject", "templates"]);

      const templatesDir = path.join(
        projectDir,
        CLAUDE_SRC_DIR,
        path.basename(DIRS.agents),
        path.basename(DIRS.templates),
      );

      // Modify a template file
      const agentLiquidPath = path.join(templatesDir, "agent.liquid");
      await writeFile(agentLiquidPath, "custom template content");

      // Second eject with --force should overwrite
      const { stdout } = await runCliCommand(["eject", "templates", "--force"]);

      expect(stdout).toContain("Agent templates ejected");

      // Content should be replaced with fresh copy from CLI source
      const afterContent = await readFile(agentLiquidPath, "utf-8");
      expect(afterContent).not.toBe("custom template content");
    });

    it("should work with --output flag", async () => {
      const outputDir = path.join(tempDir, "custom-templates");

      const { stdout } = await runCliCommand(["eject", "templates", "--output", outputDir]);

      expect(stdout).toContain("Agent templates ejected");
      expect(await directoryExists(outputDir)).toBe(true);
    });
  });

  describe("eject skills", () => {
    it("should load skills from source", async () => {
      const { error } = await runCliCommand(["eject", "skills"]);

      // May warn about no skills found if source not configured, but should not crash
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("crash");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept --output flag for skills", async () => {
      const outputDir = path.join(tempDir, "custom-skills");

      const { error } = await runCliCommand(["eject", "skills", "--output", outputDir]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should refuse a --source flag — it reads the configured source", async () => {
      const { error } = await runCliCommand(["eject", "skills", "--source", "/nonexistent/path"]);

      // The flag is withdrawn, not merely ignored: silently accepting it would eject from one
      // source while recording another in config.ts (CLI-450).
      expect(error?.message).toContain("--source");
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });
  });

  describe("eject all", () => {
    it("should eject all content types", async () => {
      const { error } = await runCliCommand(["eject", "all"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept --force flag for all", async () => {
      const { error } = await runCliCommand(["eject", "all", "--force"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept --output flag for all", async () => {
      const outputDir = path.join(tempDir, "custom-all");

      const { error } = await runCliCommand(["eject", "all", "--output", outputDir]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should eject both agent-partials and templates", async () => {
      const { stdout } = await runCliCommand(["eject", "all"]);

      expect(stdout).toContain("Agent partials ejected");
      expect(stdout).toContain("Agent templates ejected");

      const agentsDir = path.join(projectDir, CLAUDE_SRC_DIR, path.basename(DIRS.agents));
      const templatesDir = path.join(agentsDir, path.basename(DIRS.templates));
      expect(await directoryExists(templatesDir)).toBe(true);

      const entries = await readdir(agentsDir);
      // Should have templates AND other agent dirs
      expect([...entries].sort()).toStrictEqual(EJECTED_AGENT_DIRS);
    });
  });

  describe("error handling", () => {
    it("should error when output path is an existing file", async () => {
      // Create a file where output directory would be
      const outputPath = path.join(tempDir, "existing-file");
      await writeFile(outputPath, "existing content");

      const { error } = await runCliCommand(["eject", "agent-partials", "--output", outputPath]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("should expand tilde in output path", async () => {
      const { error } = await runCliCommand([
        "eject",
        "agent-partials",
        "--output",
        "~/test-eject",
      ]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("invalid path");
    });
  });
});

// Skills that exist in the source but are NOT installed locally (eligible for eject)
const NON_INSTALLED_SKILLS = DEFAULT_TEST_SKILLS.filter(
  (s) => !EJECT_INSTALLED_SKILL_IDS.includes(s.id as SkillId),
);

function buildEjectMatrix(localSkillIds: SkillId[] = []): MergedSkillsMatrix {
  const baseSkills = [SKILLS.react, SKILLS.zustand, SKILLS.vitest, SKILLS.hono];
  return createMockMatrix(
    ...baseSkills.map((skill) =>
      localSkillIds.includes(skill.id)
        ? { ...skill, local: true, localPath: `/mock-project/.claude/skills/${skill.id}/` }
        : skill,
    ),
  );
}

/**
 * Builds the matrix, source result, and skill IDs for eject operations.
 * When localSkillIds is provided, marks those skills as local and filters them out.
 * When omitted, returns all skill IDs (plugin mode behavior).
 */
async function runEjectCopy(dirs: TestDirs, outputDir: string, localSkillIds?: SkillId[]) {
  const matrix = buildEjectMatrix(localSkillIds);
  const sourceResult = buildSourceResult(matrix, dirs.sourceDir);
  const skillIds = localSkillIds
    ? typedKeys<SkillId>(matrix.skills).filter((id) => !matrix.skills[id]?.local)
    : typedKeys<SkillId>(matrix.skills);
  return copySkillsToLocalFlattened(skillIds, outputDir, sourceResult);
}

// These tests exercise the eject skill-copying pipeline directly by calling
// copySkillsToLocalFlattened. The production eject command calls this same
// function after loading the matrix via loadSkillsMatrixFromSource, but the
// production skillCategoriesFileSchema has hardcoded z.enum values that
// require ALL categories and display names to be present — which prevents
// test source matrices from validating. By testing the copying logic directly,
// we verify the core eject behavior (filtering, file copying, metadata
// injection) without requiring a valid full-production matrix on disk.

describe("eject skills from initialized project", () => {
  let dirs: TestDirs;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dirs = await createTestSource();
    process.chdir(dirs.projectDir);

    // Run installEject to create a real initialized project with 2 skills
    const installMatrix = buildEjectMatrix();
    initializeMatrix(installMatrix);
    const installSource = buildSourceResult(installMatrix, dirs.sourceDir);
    await installEject({
      wizardResult: buildWizardResult(buildSkillConfigs(EJECT_INSTALLED_SKILL_IDS)),
      sourceResult: installSource,
      projectDir: dirs.projectDir,
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTestSource(dirs);
  });

  it("should copy non-local skill directories to the output location", async () => {
    const outputDir = path.join(dirs.tempDir, "ejected-skills");
    await mkdir(outputDir, { recursive: true });

    await runEjectCopy(dirs, outputDir, EJECT_INSTALLED_SKILL_IDS);

    for (const skill of NON_INSTALLED_SKILLS) {
      const skillDir = path.join(outputDir, skill.id);
      expect(await directoryExists(skillDir)).toBe(true);
    }
  });

  it("should not include locally installed skills in the eject output", async () => {
    const outputDir = path.join(dirs.tempDir, "ejected-skills");
    await mkdir(outputDir, { recursive: true });

    await runEjectCopy(dirs, outputDir, EJECT_INSTALLED_SKILL_IDS);

    for (const skillId of EJECT_INSTALLED_SKILL_IDS) {
      const skillDir = path.join(outputDir, skillId);
      expect(await directoryExists(skillDir)).toBe(false);
    }
  });

  it("should preserve SKILL.md content for ejected skills", async () => {
    const outputDir = path.join(dirs.tempDir, "ejected-skills");
    await mkdir(outputDir, { recursive: true });

    await runEjectCopy(dirs, outputDir, EJECT_INSTALLED_SKILL_IDS);

    for (const skill of NON_INSTALLED_SKILLS) {
      const ejectedSkillMd = path.join(outputDir, skill.id, STANDARD_FILES.SKILL_MD);
      expect(await fileExists(ejectedSkillMd)).toBe(true);

      const content = await readFile(ejectedSkillMd, "utf-8");
      const frontmatter = parseTestFrontmatter(content);
      expect(frontmatter).not.toBeNull();
      expect(frontmatter?.name).toBe(skill.id);
    }
  });

  it("should include metadata.yaml with forkedFrom for ejected skills", async () => {
    const outputDir = path.join(dirs.tempDir, "ejected-skills");
    await mkdir(outputDir, { recursive: true });

    await runEjectCopy(dirs, outputDir, EJECT_INSTALLED_SKILL_IDS);

    const targetSkill = firstElement(NON_INSTALLED_SKILLS);
    const metadataPath = path.join(outputDir, targetSkill.id, STANDARD_FILES.METADATA_YAML);
    expect(await fileExists(metadataPath)).toBe(true);

    const metadata = await readTestYaml<Record<string, unknown>>(metadataPath);
    // copySkillsToLocalFlattened injects forkedFrom with skillId, contentHash, date, source
    expect(metadata.forkedFrom).toStrictEqual({
      skillId: targetSkill.id,
      contentHash: expect.any(String),
      date: expect.any(String),
      source: expect.any(String),
    });
  });

  it("should report the correct number of non-local skills ejected", async () => {
    const outputDir = path.join(dirs.tempDir, "ejected-skills");
    await mkdir(outputDir, { recursive: true });

    const copiedSkills = await runEjectCopy(dirs, outputDir, EJECT_INSTALLED_SKILL_IDS);

    expect(copiedSkills.length).toBe(NON_INSTALLED_SKILLS.length);
  });

  it("should eject non-local skills to default .claude/skills/ path", async () => {
    const defaultSkillsDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH);
    await mkdir(defaultSkillsDir, { recursive: true });

    await runEjectCopy(dirs, defaultSkillsDir, EJECT_INSTALLED_SKILL_IDS);

    for (const skill of NON_INSTALLED_SKILLS) {
      const skillDir = path.join(defaultSkillsDir, skill.id);
      expect(await directoryExists(skillDir)).toBe(true);
    }
  });

  it("should eject agent-partials from initialized project", async () => {
    const { stdout } = await runCliCommand(["eject", "agent-partials", "--force"]);

    expect(stdout).toContain("Agent partials ejected");

    const partialsDir = path.join(dirs.projectDir, CLAUDE_SRC_DIR, STANDARD_DIRS.AGENTS);
    expect(await directoryExists(partialsDir)).toBe(true);
  });

  it("should copy agent partial files when ejecting from initialized project", async () => {
    const { stdout } = await runCliCommand(["eject", "agent-partials", "--force"]);

    expect(stdout).toContain("Agent partials ejected");

    const partialsDir = path.join(dirs.projectDir, CLAUDE_SRC_DIR, STANDARD_DIRS.AGENTS);
    const entries = await readdir(partialsDir);
    expect([...entries].sort()).toStrictEqual(EJECTED_AGENT_DIRS);
  });
});

// Plugin mode uses installPluginConfig which writes config and agents but does
// NOT copy skills to .claude/skills/. Therefore, when ejecting skills from a
// plugin mode project, ALL source skills should be eligible (none are local).

describe("eject in plugin mode", () => {
  let dirs: TestDirs;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dirs = await createTestSource();
    process.chdir(dirs.projectDir);

    // Use installPluginConfig for plugin mode: writes config and agents
    // but does NOT copy skills to .claude/skills/ (skills live in plugins)
    const installMatrix = buildEjectMatrix();
    initializeMatrix(installMatrix);
    const installSource = buildSourceResult(installMatrix, dirs.sourceDir);
    await installPluginConfig({
      wizardResult: buildWizardResult(
        buildSkillConfigs(EJECT_INSTALLED_SKILL_IDS, { origin: "agents-inc" }),
      ),
      sourceResult: installSource,
      projectDir: dirs.projectDir,
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTestSource(dirs);
  });

  it("should have plugin-sourced skills in config after init", async () => {
    const configPath = path.join(dirs.projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
    expect(await fileExists(configPath)).toBe(true);

    const config = await readTestTsConfig<ProjectConfig>(configPath);
    // installMode is derived at runtime from skills; all skills should have non-local source
    expect(config.skills.every((s) => s.origin !== "eject")).toBe(true);
  });

  it("should copy all skill directories to output in plugin mode", async () => {
    const outputDir = path.join(dirs.tempDir, "ejected-plugin-skills");
    await mkdir(outputDir, { recursive: true });

    await runEjectCopy(dirs, outputDir);

    for (const skill of DEFAULT_TEST_SKILLS) {
      const skillDir = path.join(outputDir, skill.id);
      expect(await directoryExists(skillDir)).toBe(true);
    }
  });

  it("should preserve skill content when ejecting from plugin mode", async () => {
    const outputDir = path.join(dirs.tempDir, "ejected-plugin-skills");
    await mkdir(outputDir, { recursive: true });

    await runEjectCopy(dirs, outputDir);

    const targetSkill = firstElement(DEFAULT_TEST_SKILLS);
    const skillMdPath = path.join(outputDir, targetSkill.id, STANDARD_FILES.SKILL_MD);
    expect(await fileExists(skillMdPath)).toBe(true);

    const content = await readFile(skillMdPath, "utf-8");
    const frontmatter = parseTestFrontmatter(content);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter?.name).toBe(targetSkill.id);
  });

  it("should include metadata.yaml with forkedFrom in plugin mode", async () => {
    const outputDir = path.join(dirs.tempDir, "ejected-plugin-skills");
    await mkdir(outputDir, { recursive: true });

    await runEjectCopy(dirs, outputDir);

    const targetSkill = firstElement(DEFAULT_TEST_SKILLS);
    const metadataPath = path.join(outputDir, targetSkill.id, STANDARD_FILES.METADATA_YAML);
    expect(await fileExists(metadataPath)).toBe(true);

    const metadata = await readTestYaml<Record<string, unknown>>(metadataPath);
    expect(metadata.forkedFrom).toStrictEqual({
      skillId: targetSkill.id,
      contentHash: expect.any(String),
      date: expect.any(String),
      source: expect.any(String),
    });
  });

  it("should eject all skills to default .claude/skills/ in plugin mode", async () => {
    const defaultSkillsDir = path.join(dirs.projectDir, LOCAL_SKILLS_PATH);
    await mkdir(defaultSkillsDir, { recursive: true });

    await runEjectCopy(dirs, defaultSkillsDir);

    // All source skills should be present (none are local in plugin mode)
    for (const skill of DEFAULT_TEST_SKILLS) {
      const skillDir = path.join(defaultSkillsDir, skill.id);
      expect(await directoryExists(skillDir)).toBe(true);
    }
  });

  it("should report all skills ejected in plugin mode", async () => {
    const outputDir = path.join(dirs.tempDir, "ejected-plugin-skills");
    await mkdir(outputDir, { recursive: true });

    const copiedSkills = await runEjectCopy(dirs, outputDir);

    // All source skills should be ejected (none are local in plugin mode)
    expect(copiedSkills.length).toBe(DEFAULT_TEST_SKILLS.length);
  });

  it("should eject agent-partials from plugin mode project", async () => {
    const { stdout } = await runCliCommand(["eject", "agent-partials", "--force"]);

    // Partials eject from CLI source, not project source
    expect(stdout).toContain("Agent partials ejected");

    const partialsDir = path.join(dirs.projectDir, CLAUDE_SRC_DIR, STANDARD_DIRS.AGENTS);
    expect(await directoryExists(partialsDir)).toBe(true);

    const entries = await readdir(partialsDir);
    expect([...entries].sort()).toStrictEqual(EJECTED_AGENT_DIRS);
  });
});
