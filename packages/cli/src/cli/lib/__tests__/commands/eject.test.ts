import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { argOptionRefusal, parseRefusal, runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { fileExists, directoryExists } from "../test-fs-utils";
import { readTestYaml, readTestTsConfig } from "../helpers/config-io.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { createMockMatrix } from "../factories/matrix-factories.js";
import { buildInstallSelection, buildSourceResult } from "../factories/config-factories.js";
import { parseTestFrontmatter } from "../helpers/index.js";
import { SKILLS } from "../test-fixtures";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { installThroughOperations } from "../helpers/install-through-operations.js";
import { writeProjectConfig } from "../../operations/project/write-project-config.js";
import { copySkillsToLocalFlattened } from "../../skills/skill-copier";
import Eject from "../../../commands/eject";
import {
  CLAUDE_DIR,
  DIRS,
  LOCAL_SKILLS_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../../consts";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import { sourceFolderInUse } from "../../installation/install-layout.js";
import { EXIT_CODES } from "../../exit-codes";
import { glob } from "../../../utils/fs";
import { typedKeys } from "../../../utils/typed-object";
import { initializeMatrix } from "../../matrix/matrix-provider";
import type { MergedSkillsMatrix, ProjectConfig, SkillId } from "../../../types";
import { firstElement } from "../helpers/element-at.js";

const EJECT_INSTALLED_SKILL_IDS: SkillId[] = ["web-framework-react", "api-framework-hono"];

/** By name, not count, so a roster reorganization names what moved. */
const EJECTED_AGENT_DIRS = [
  path.basename(DIRS.templates),
  "developer",
  "meta",
  "planning",
  "researcher",
  "reviewer",
  "tester",
].sort();

/** The partials `readAgentFiles` compiles from; the success log is asserted against this list. */
const EJECTED_AGENT_PARTIAL_FILES = [
  STANDARD_FILES.IDENTITY_MD,
  STANDARD_FILES.PLAYBOOK_MD,
  STANDARD_FILES.CRITICAL_REQUIREMENTS_MD,
  STANDARD_FILES.CRITICAL_REMINDERS_MD,
  STANDARD_FILES.OUTPUT_MD,
];

/** `agent-body.liquid` must eject with `agent.liquid`, which includes it. Named, not counted. */
const EJECTED_TEMPLATE_ENTRIES = ["agent.liquid", "agent-body.liquid", "methodologies"].sort();

/** A promise of a default, in a help text belonging to a flag that has none. */
const DEFAULT_PROMISE = /\bdefaults?\b/i;

describe("eject command", () => {
  let tempDir: string;
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ tempDir, projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-eject-test-"));
  });

  afterEach(async () => {
    await cleanup();
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
      expect(output).not.toContain(argOptionRefusal("agent-partials"));
    });

    it("should accept 'skills' as type", async () => {
      const { error } = await runCliCommand(["eject", "skills"]);

      const output = error?.message || "";
      expect(output).not.toContain(argOptionRefusal("skills"));
    });

    it("should accept 'all' as type", async () => {
      const { error } = await runCliCommand(["eject", "all"]);

      const output = error?.message || "";
      expect(output).not.toContain(argOptionRefusal("all"));
    });

    it("should accept 'templates' as type", async () => {
      const { error } = await runCliCommand(["eject", "templates"]);

      const output = error?.message || "";
      expect(output).not.toContain(argOptionRefusal("templates"));
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
      expect(output).not.toContain(parseRefusal("--force"));
    });

    it("should accept -f shorthand for force", async () => {
      const { error } = await runCliCommand(["eject", "agent-partials", "-f"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("-f"));
    });

    it("should accept --output flag", async () => {
      const outputDir = path.join(tempDir, "custom-output");

      const { error } = await runCliCommand(["eject", "agent-partials", "--output", outputDir]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--output"));
    });

    it("should accept -o shorthand for output", async () => {
      const outputDir = path.join(tempDir, "custom-output");

      const { error } = await runCliCommand(["eject", "agent-partials", "-o", outputDir]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("-o"));
    });

    it("rejects --refresh — every load revalidates, so there is nothing to force", async () => {
      const { error } = await runCliCommand(["eject", "skills", "--refresh"]);

      expect(error?.message).toContain(parseRefusal("--refresh"));
    });
  });

  describe("the --output flag's own description", () => {
    it("promises no default, because the flag declares none", () => {
      expect(Eject.flags.output.default).toBeUndefined();
      expect(Eject.flags.output.description).not.toMatch(DEFAULT_PROMISE);
    });

    it("names no destination, because the three eject types have three", () => {
      expect(Eject.flags.output.description).not.toContain(CLAUDE_DIR);
    });
  });

  describe("eject agent-partials", () => {
    it("should eject agent partials into the source folder's agents/ by default", async () => {
      const { stdout } = await runCliCommand(["eject", "agent-partials"]);

      expect(stdout).toContain("Agent partials ejected");

      const partialsDir = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        STANDARD_DIRS.AGENTS,
      );
      expect(await directoryExists(partialsDir)).toBe(true);
    });

    it("should name in its success log only partials it put on disk", async () => {
      const { stdout } = await runCliCommand(["eject", "agent-partials"]);

      const partialsDir = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        STANDARD_DIRS.AGENTS,
      );
      const ejectedNames = (await glob("**/*.md", partialsDir)).map((file) => path.basename(file));

      for (const partial of EJECTED_AGENT_PARTIAL_FILES) {
        expect(stdout, `the success log must name ${partial}`).toContain(partial);
        expect(ejectedNames, `${partial} must be on disk to be named`).toContain(partial);
      }
    });

    it("should create config.ts if it does not exist", async () => {
      await runCliCommand(["eject", "agent-partials"]);

      const configPath = getProjectConfigPath(projectDir, "claude");
      expect(await fileExists(configPath)).toBe(true);
      // A literal: a folder name is text on disk, and a fresh project's eject creates the new one.
      expect(configPath).toBe(
        path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS),
      );

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("export default");
      expect(content).toContain("name: 'project'");
    });

    it("should not overwrite existing config.yaml", async () => {
      // Eject checks both .ts and .yaml configs.
      const configDir = sourceFolderInUse(projectDir, "claude").dir;
      await mkdir(configDir, { recursive: true });
      const configPath = path.join(configDir, "config.yaml");
      const customContent = "name: my-custom-project\nauthor: test-author\n";
      await writeFile(configPath, customContent);

      await runCliCommand(["eject", "agent-partials"]);

      const content = await readFile(configPath, "utf-8");
      expect(content).toBe(customContent);
    });

    it("should still create config.ts when using --output flag", async () => {
      const outputDir = path.join(tempDir, "custom-output");

      await runCliCommand(["eject", "agent-partials", "--output", outputDir]);

      const configPath = getProjectConfigPath(projectDir, "claude");
      expect(await fileExists(configPath)).toBe(true);
    });

    it("should eject agent partials to custom output with --output", async () => {
      const outputDir = path.join(tempDir, "custom-partials");

      const { stdout, error } = await runCliCommand([
        "eject",
        "agent-partials",
        "--output",
        outputDir,
      ]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--output"));
      expect(stdout).toContain("Agent partials ejected");
      expect(await directoryExists(outputDir)).toBe(true);
    });

    /** The first eject leaves `_templates`, so the second re-ejects rather than refusing. */
    it("should skip templates and re-eject partials on a second run without --force", async () => {
      await runCliCommand(["eject", "agent-partials"]);

      const { stdout, stderr } = await runCliCommand(["eject", "agent-partials"]);

      expect(stderr).toContain("Agent templates already exist");
      expect(stdout).toContain("Agent partials ejected");
    });

    it("should overwrite partials when --force is used", async () => {
      await runCliCommand(["eject", "agent-partials"]);

      const { error } = await runCliCommand(["eject", "agent-partials", "--force"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--force"));
    });

    it("should preserve existing templates when ejecting agent-partials", async () => {
      const agentsDir = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        path.basename(DIRS.agents),
      );
      const templatesDir = path.join(agentsDir, path.basename(DIRS.templates));

      await mkdir(templatesDir, { recursive: true });
      await writeFile(path.join(templatesDir, "agent.liquid"), "custom template content");

      const { stdout, stderr } = await runCliCommand(["eject", "agent-partials"]);

      expect(stderr).toContain("templates already exist");
      expect(stdout).toContain("Agent partials ejected");

      const templateContent = await readFile(path.join(templatesDir, "agent.liquid"), "utf-8");
      expect(templateContent).toBe("custom template content");
    });

    it("should block agent-partials eject when agents/ contains actual agent dirs", async () => {
      const agentsDir = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        path.basename(DIRS.agents),
      );

      // An actual agent subdir simulates a prior full eject.
      await mkdir(path.join(agentsDir, "developer"), { recursive: true });
      await writeFile(
        path.join(agentsDir, "developer", STANDARD_FILES.AGENT_METADATA_YAML),
        "id: developer",
      );

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
        sourceFolderInUse(projectDir, "claude").dir,
        path.basename(DIRS.agents),
        path.basename(DIRS.templates),
      );
      expect(await directoryExists(templatesDir)).toBe(true);

      expect(
        [...(await readdir(templatesDir))].sort(),
        "the templates directory the CLI ships, by name — a count cannot tell a swap from a match",
      ).toStrictEqual(EJECTED_TEMPLATE_ENTRIES);
    });

    it("should not eject other agent partials", async () => {
      await runCliCommand(["eject", "templates"]);

      const agentsDir = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        path.basename(DIRS.agents),
      );
      const entries = await readdir(agentsDir);

      expect(entries).toStrictEqual([path.basename(DIRS.templates)]);
    });

    it("should warn with --force suggestion when templates already exist without --force", async () => {
      await runCliCommand(["eject", "templates"]);

      const { stderr } = await runCliCommand(["eject", "templates"]);

      expect(stderr).toContain("already exist");
      expect(stderr).toContain("--force");
    });

    it("should preserve existing templates without --force", async () => {
      await runCliCommand(["eject", "templates"]);

      const templatesDir = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        path.basename(DIRS.agents),
        path.basename(DIRS.templates),
      );

      const agentLiquidPath = path.join(templatesDir, "agent.liquid");
      await writeFile(agentLiquidPath, "custom template content");

      await runCliCommand(["eject", "templates"]);

      const afterContent = await readFile(agentLiquidPath, "utf-8");
      expect(afterContent).toBe("custom template content");
    });

    it("should overwrite existing templates with --force", async () => {
      await runCliCommand(["eject", "templates"]);

      const templatesDir = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        path.basename(DIRS.agents),
        path.basename(DIRS.templates),
      );

      const agentLiquidPath = path.join(templatesDir, "agent.liquid");
      await writeFile(agentLiquidPath, "custom template content");

      const { stdout } = await runCliCommand(["eject", "templates", "--force"]);

      expect(stdout).toContain("Agent templates ejected");

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
      const { stdout, error } = await runCliCommand(["eject", "skills"]);

      expect(error).toBeUndefined();
      // The count and source label vary by marketplace, so only the clause is asserted.
      expect(stdout).toMatch(/skills ejected to .+ from \S+/);
      expect(await directoryExists(path.join(projectDir, LOCAL_SKILLS_PATH))).toBe(true);
    });

    it("should accept --output flag for skills", async () => {
      const outputDir = path.join(tempDir, "custom-skills");

      const { error } = await runCliCommand(["eject", "skills", "--output", outputDir]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--output"));
    });

    it("should refuse a --source flag — it reads the configured source", async () => {
      const { error } = await runCliCommand(["eject", "skills", "--source", "/nonexistent/path"]);

      // Withdrawn, not ignored: accepting it would eject from one source and record another.
      expect(error?.message).toContain("--source");
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });
  });

  describe("eject all", () => {
    it("should eject all content types", async () => {
      const { stdout, error } = await runCliCommand(["eject", "all"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Agent partials ejected");
      expect(stdout).toContain("Agent templates ejected");
      // Only `all` ejects the third type.
      expect(stdout).toMatch(/skills ejected to .+ from \S+/);
    });

    it("should accept --force flag for all", async () => {
      const { error } = await runCliCommand(["eject", "all", "--force"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--force"));
    });

    it("should accept --output flag for all", async () => {
      const outputDir = path.join(tempDir, "custom-all");

      const { error } = await runCliCommand(["eject", "all", "--output", outputDir]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--output"));
    });

    it("should eject both agent-partials and templates", async () => {
      const { stdout } = await runCliCommand(["eject", "all"]);

      expect(stdout).toContain("Agent partials ejected");
      expect(stdout).toContain("Agent templates ejected");

      const agentsDir = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        path.basename(DIRS.agents),
      );
      const templatesDir = path.join(agentsDir, path.basename(DIRS.templates));
      expect(await directoryExists(templatesDir)).toBe(true);

      const entries = await readdir(agentsDir);
      expect([...entries].sort()).toStrictEqual(EJECTED_AGENT_DIRS);
    });
  });

  describe("error handling", () => {
    it("should error when output path is an existing file", async () => {
      const outputPath = path.join(tempDir, "existing-file");
      await writeFile(outputPath, "existing content");

      const { error } = await runCliCommand(["eject", "agent-partials", "--output", outputPath]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    /** The negation alone held either way; the HOME dir and absent literal `~` are the claim. */
    it("should expand tilde in output path", async () => {
      const { stdout, error } = await runCliCommand([
        "eject",
        "agent-partials",
        "--output",
        "~/test-eject",
      ]);

      expect(stdout).toContain("Agent partials ejected");
      expect(await directoryExists(path.join(fakeHome, "test-eject"))).toBe(true);
      expect(
        await directoryExists(path.join(projectDir, "~")),
        "an unexpanded tilde resolves against the project and writes a directory named `~`",
      ).toBe(false);
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("invalid path");
    });
  });
});

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

async function runEjectCopy(dirs: TestDirs, outputDir: string, localSkillIds?: SkillId[]) {
  const matrix = buildEjectMatrix(localSkillIds);
  const sourceResult = buildSourceResult(matrix, dirs.sourceDir);
  const skillIds = localSkillIds
    ? typedKeys<SkillId>(matrix.skills).filter((id) => !matrix.skills[id]?.local)
    : typedKeys<SkillId>(matrix.skills);
  return copySkillsToLocalFlattened(skillIds, outputDir, sourceResult);
}

// Tests the copy pipeline directly: the production categories schema needs a full matrix on disk.

describe("eject skills from initialized project", () => {
  let dirs: TestDirs;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dirs = await createTestSource();
    process.chdir(dirs.projectDir);

    const installMatrix = buildEjectMatrix();
    initializeMatrix(installMatrix);
    const installSource = buildSourceResult(installMatrix, dirs.sourceDir);
    await installThroughOperations({
      selection: buildInstallSelection(buildSkillConfigs(EJECT_INSTALLED_SKILL_IDS)),
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

    const partialsDir = path.join(
      sourceFolderInUse(dirs.projectDir, "claude").dir,
      STANDARD_DIRS.AGENTS,
    );
    expect(await directoryExists(partialsDir)).toBe(true);
  });

  it("should copy agent partial files when ejecting from initialized project", async () => {
    const { stdout } = await runCliCommand(["eject", "agent-partials", "--force"]);

    expect(stdout).toContain("Agent partials ejected");

    const partialsDir = path.join(
      sourceFolderInUse(dirs.projectDir, "claude").dir,
      STANDARD_DIRS.AGENTS,
    );
    const entries = await readdir(partialsDir);
    expect([...entries].sort()).toStrictEqual(EJECTED_AGENT_DIRS);
  });
});

// Plugin mode copies no skills locally, so every source skill is eligible for eject.

describe("eject in plugin mode", () => {
  let dirs: TestDirs;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dirs = await createTestSource();
    process.chdir(dirs.projectDir);

    // Plugin mode is the config write alone: `init` skips its copy step when nothing is ejected.
    const installMatrix = buildEjectMatrix();
    initializeMatrix(installMatrix);
    const installSource = buildSourceResult(installMatrix, dirs.sourceDir);
    await writeProjectConfig({
      selection: buildInstallSelection(
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
    const configPath = getProjectConfigPath(dirs.projectDir, "claude");
    expect(await fileExists(configPath)).toBe(true);

    const config = await readTestTsConfig<ProjectConfig>(configPath);
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

    for (const skill of DEFAULT_TEST_SKILLS) {
      const skillDir = path.join(defaultSkillsDir, skill.id);
      expect(await directoryExists(skillDir)).toBe(true);
    }
  });

  it("should report all skills ejected in plugin mode", async () => {
    const outputDir = path.join(dirs.tempDir, "ejected-plugin-skills");
    await mkdir(outputDir, { recursive: true });

    const copiedSkills = await runEjectCopy(dirs, outputDir);

    expect(copiedSkills.length).toBe(DEFAULT_TEST_SKILLS.length);
  });

  it("should eject agent-partials from plugin mode project", async () => {
    const { stdout } = await runCliCommand(["eject", "agent-partials", "--force"]);

    // Partials eject from CLI source, not project source.
    expect(stdout).toContain("Agent partials ejected");

    const partialsDir = path.join(
      sourceFolderInUse(dirs.projectDir, "claude").dir,
      STANDARD_DIRS.AGENTS,
    );
    expect(await directoryExists(partialsDir)).toBe(true);

    const entries = await readdir(partialsDir);
    expect([...entries].sort()).toStrictEqual(EJECTED_AGENT_DIRS);
  });
});
