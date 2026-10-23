import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { chmod, cp, mkdir, readFile, readdir, rm, symlink, writeFile } from "fs/promises";
import { argOptionRefusal, parseRefusal, runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { fileExists, directoryExists } from "../test-fs-utils";
import { readTestYaml, readTestTsConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { compactCliOutput, flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { createMockMatrix } from "../factories/matrix-factories.js";
import {
  buildInstallSelection,
  buildProjectConfig,
  buildSourceResult,
} from "../factories/config-factories.js";
import { parseTestFrontmatter } from "../helpers/index.js";
import { SKILLS } from "../test-fixtures";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
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

/** The sub-agent directories the CLI ships under `developer/`, by name. */
const EJECTED_DEVELOPER_SUB_AGENTS = [
  "ai-developer",
  "api-developer",
  "cli-developer",
  "web-developer",
].sort();

/** What a user wrote into an ejected partial, which no eject without --force may replace. */
const USERS_OWN_PARTIAL = "the user's own edit to a partial";
/** What a user wrote into an ejected template, which no eject without --force may replace. */
const USERS_OWN_TEMPLATE = "the user's own template";
/** A link-local address the marketplace check refuses wherever the value comes from. */
const PRIVATE_ADDRESS_MARKETPLACE = "http://169.254.169.254/latest";

/** The skills the fixture marketplace publishes, as the folders an eject leaves. */
const MARKETPLACE_SKILL_IDS = inTestMarketplace(DEFAULT_TEST_SKILLS)
  .map((skill) => skill.id)
  .sort();

/** One ejected skill a user deleted, and one they edited, which a re-eject then skips. */
const REMOVED_SKILL_ID = testMarketplaceSkillId("web-framework-react");
const EDITED_SKILL_ID = testMarketplaceSkillId("web-state-zustand");
/** The one ejected skill a re-eject finds still there, once the user deleted every other. */
const KEPT_SKILL_ID = testMarketplaceSkillId("api-framework-hono");
const USERS_OWN_SKILL_EDIT = "the user's own edit to an ejected skill";

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
      // A literal: a folder name is text on disk.
      expect(configPath).toBe(
        path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS),
      );

      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("export default");
      expect(content).toContain("name: 'project'");
    });

    it("should leave an existing config.ts as it was", async () => {
      const configPath = await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ name: "my-custom-project" }),
      );
      const before = await readFile(configPath, "utf-8");

      await runCliCommand(["eject", "agent-partials"]);

      expect(await readFile(configPath, "utf-8")).toBe(before);
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

    it("should keep the partials and templates on a second run without --force", async () => {
      await runCliCommand(["eject", "agent-partials"]);

      const { stdout, stderr } = await runCliCommand(["eject", "agent-partials"]);

      expect(stderr).toContain("Agent partials already exist at");
      expect(stdout).not.toContain("Agent partials ejected");
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

    /** A category folder holds sub-agents rather than being one, so a file of the user's there stays. */
    it("should eject every sub-agent beside a category folder holding only a file of the user's", async () => {
      const agentsDir = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        path.basename(DIRS.agents),
      );
      const usersFile = path.join(agentsDir, "developer", STANDARD_FILES.AGENT_METADATA_YAML);
      await mkdir(path.dirname(usersFile), { recursive: true });
      await writeFile(usersFile, "id: developer");

      const { stdout } = await runCliCommand(["eject", "agent-partials"]);

      expect(stdout).toContain("Agent partials ejected");
      expect(await readFile(usersFile, "utf-8")).toBe("id: developer");
      expect([...(await readdir(path.join(agentsDir, "developer")))].sort()).toStrictEqual(
        [STANDARD_FILES.AGENT_METADATA_YAML, ...EJECTED_DEVELOPER_SUB_AGENTS].sort(),
      );
      expect([...(await readdir(agentsDir))].sort()).toStrictEqual(EJECTED_AGENT_DIRS);
    });

    it("should keep a sub-agent directory already there, naming it as skipped, and eject the others", async () => {
      const agentsDir = path.join(
        sourceFolderInUse(projectDir, "claude").dir,
        path.basename(DIRS.agents),
      );
      const keptSubAgentDir = path.join(agentsDir, "developer", "web-developer");
      const usersIdentity = path.join(keptSubAgentDir, STANDARD_FILES.IDENTITY_MD);
      await mkdir(keptSubAgentDir, { recursive: true });
      await writeFile(usersIdentity, USERS_OWN_PARTIAL);

      const { stdout, stderr } = await runCliCommand(["eject", "agent-partials"]);

      expect(flattenCliOutput(stderr)).toContain("skipped 1 sub-agent: web-developer.");
      expect(stdout).toContain("Agent partials ejected");
      expect(await readFile(usersIdentity, "utf-8")).toBe(USERS_OWN_PARTIAL);
      expect(
        await readdir(keptSubAgentDir),
        "a skipped sub-agent is left whole: none of the CLI's partials are written into it",
      ).toStrictEqual([STANDARD_FILES.IDENTITY_MD]);
      expect([...(await readdir(path.join(agentsDir, "developer")))].sort()).toStrictEqual(
        EJECTED_DEVELOPER_SUB_AGENTS,
      );
      expect([...(await readdir(agentsDir))].sort()).toStrictEqual(EJECTED_AGENT_DIRS);
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

/** What a person reads from each kind of eject, word for word, and what the run leaves on disk. */
describe("what eject says", () => {
  let tempDir: string;
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ tempDir, projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-eject-says-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  const HEADER = ["", "Agents Inc. Eject", ""];
  const ENDING = ["", "✓ Eject complete!", "", ""];
  const PARTIALS_CUSTOMIZABLE =
    "Each sub-agent directory there holds identity.md, playbook.md, critical-requirements.md, critical-reminders.md, output.md — edit those to customize that sub-agent.";

  function agentsDirOf(root: string): string {
    return path.join(sourceFolderInUse(root, "claude").dir, STANDARD_DIRS.AGENTS);
  }

  it("names where the partials went and the config it created, then that it is complete", async () => {
    const { stdout, stderr, error } = await runCliCommand(["eject", "agent-partials"]);

    expect(error).toBeUndefined();
    expect(stderr).toBe("");
    expect(stdout).toBe(
      [
        ...HEADER,
        `✓ Agent partials ejected to ${agentsDirOf(projectDir)}`,
        PARTIALS_CUSTOMIZABLE,
        "✓ Created .agents-inc/claude/config.ts",
        ...ENDING,
      ].join("\n"),
    );
  });

  it("ejects the partials into an agents folder that exists but holds nothing", async () => {
    await mkdir(agentsDirOf(projectDir), { recursive: true });

    const { stdout, error } = await runCliCommand(["eject", "agent-partials"]);

    expect(error).toBeUndefined();
    expect(stdout).toContain(`✓ Agent partials ejected to ${agentsDirOf(projectDir)}`);
  });

  it("keeps the partials and templates already there on a second run, saying so", async () => {
    await runCliCommand(["eject", "agent-partials"]);
    const template = path.join(
      agentsDirOf(projectDir),
      path.basename(DIRS.templates),
      "agent.liquid",
    );
    await writeFile(template, "the user's own template");
    const partial = path.join(
      agentsDirOf(projectDir),
      "developer",
      "web-developer",
      STANDARD_FILES.IDENTITY_MD,
    );
    await writeFile(partial, USERS_OWN_PARTIAL);

    const { stdout, stderr } = await runCliCommand(["eject", "agent-partials"]);

    expect(stdout).toBe([...HEADER, ...ENDING].join("\n"));
    expect(compactCliOutput(stderr)).toBe(
      compactCliOutput(
        `Warning: Agent partials already exist at ${agentsDirOf(projectDir)}. Use --force to overwrite.`,
      ),
    );
    expect(await readFile(template, "utf-8")).toBe("the user's own template");
    expect(await readFile(partial, "utf-8")).toBe(USERS_OWN_PARTIAL);
  });

  it("keeps the templates already there and ejects every sub-agent, naming none as skipped", async () => {
    const template = path.join(
      agentsDirOf(projectDir),
      path.basename(DIRS.templates),
      "agent.liquid",
    );
    await mkdir(path.dirname(template), { recursive: true });
    await writeFile(template, "the user's own template");

    const { stdout, stderr } = await runCliCommand(["eject", "agent-partials"]);

    expect(stdout).toBe(
      [
        ...HEADER,
        `✓ Agent partials ejected to ${agentsDirOf(projectDir)}`,
        PARTIALS_CUSTOMIZABLE,
        "✓ Created .agents-inc/claude/config.ts",
        ...ENDING,
      ].join("\n"),
    );
    expect(flattenCliOutput(stderr)).toBe(
      "Warning: Agent templates already exist — skipping templates, only ejecting agent partials.",
    );
    expect(await readFile(template, "utf-8")).toBe("the user's own template");
  });

  it("writes nothing into a templates folder it keeps, not even a folder the CLI ships in it", async () => {
    const templatesDir = path.join(agentsDirOf(projectDir), path.basename(DIRS.templates));
    await mkdir(templatesDir, { recursive: true });
    await writeFile(path.join(templatesDir, "agent.liquid"), "the user's own template");

    await runCliCommand(["eject", "agent-partials"]);

    expect(await readdir(templatesDir)).toStrictEqual(["agent.liquid"]);
  });

  it("overwrites the templates too with --force, without a warning", async () => {
    await runCliCommand(["eject", "agent-partials"]);
    const template = path.join(
      agentsDirOf(projectDir),
      path.basename(DIRS.templates),
      "agent.liquid",
    );
    await writeFile(template, "the user's own template");

    const { stderr } = await runCliCommand(["eject", "agent-partials", "--force"]);

    expect(stderr).toBe("");
    expect(await readFile(template, "utf-8")).not.toBe("the user's own template");
  });

  it("names where the templates went, and refuses to overwrite them without --force", async () => {
    const templatesDir = path.join(agentsDirOf(projectDir), path.basename(DIRS.templates));

    const first = await runCliCommand(["eject", "templates"]);
    const second = await runCliCommand(["eject", "templates"]);

    expect(first.stdout).toBe(
      [
        ...HEADER,
        `✓ Agent templates ejected to ${templatesDir}`,
        "You can now customize agent templates locally.",
        "✓ Created .agents-inc/claude/config.ts",
        ...ENDING,
      ].join("\n"),
    );
    expect(second.stdout).toBe([...HEADER, ...ENDING].join("\n"));
    expect(compactCliOutput(second.stderr)).toBe(
      compactCliOutput(
        `Warning: Agent templates already exist at ${templatesDir}. Use --force to overwrite.`,
      ),
    );
  });

  it("warns of nothing on a first templates eject, which skips no sub-agent and no templates", async () => {
    const { stderr, error } = await runCliCommand(["eject", "templates"]);

    expect(error).toBeUndefined();
    expect(stderr).toBe("");
  });

  it("skips a sub-agent the folder already holds, naming it, and ejects the rest", async () => {
    const agentsDir = agentsDirOf(projectDir);
    const keptSubAgentDir = path.join(agentsDir, "developer", "web-developer");
    await mkdir(keptSubAgentDir, { recursive: true });
    await writeFile(path.join(keptSubAgentDir, STANDARD_FILES.IDENTITY_MD), USERS_OWN_PARTIAL);

    const { stdout, stderr } = await runCliCommand(["eject", "agent-partials"]);

    expect(compactCliOutput(stderr)).toBe(
      compactCliOutput(
        `Warning: Agent partials already exist at ${agentsDir} — skipped 1 sub-agent: web-developer. Use --force to overwrite them.`,
      ),
    );
    expect(stdout).toBe(
      [
        ...HEADER,
        `✓ Agent partials ejected to ${agentsDir}`,
        PARTIALS_CUSTOMIZABLE,
        "✓ Created .agents-inc/claude/config.ts",
        ...ENDING,
      ].join("\n"),
    );
  });

  /** `developer/` comes before `meta/`, so the names in category order would be the other way round. */
  it("names the sub-agents it skipped bytewise, rather than in the order of their categories", async () => {
    const agentsDir = agentsDirOf(projectDir);
    const keptIdentities = [
      path.join(agentsDir, "developer", "web-developer", STANDARD_FILES.IDENTITY_MD),
      path.join(agentsDir, "meta", "agent-summoner", STANDARD_FILES.IDENTITY_MD),
    ];
    await Promise.all(
      keptIdentities.map(async (identity) => {
        await mkdir(path.dirname(identity), { recursive: true });
        await writeFile(identity, USERS_OWN_PARTIAL);
      }),
    );

    const { stderr } = await runCliCommand(["eject", "agent-partials"]);

    expect(compactCliOutput(stderr)).toBe(
      compactCliOutput(
        `Warning: Agent partials already exist at ${agentsDir} — skipped 2 sub-agents: agent-summoner, web-developer. Use --force to overwrite them.`,
      ),
    );
    expect(
      await Promise.all(keptIdentities.map((identity) => readFile(identity, "utf-8"))),
    ).toStrictEqual([USERS_OWN_PARTIAL, USERS_OWN_PARTIAL]);
  });

  it("names the output directory first when --output is given", async () => {
    const outputDir = path.join(tempDir, "custom-partials");

    const { stdout } = await runCliCommand(["eject", "agent-partials", "--output", outputDir]);

    expect(stdout).toBe(
      [
        ...HEADER,
        `Output directory: ${outputDir}`,
        `✓ Agent partials ejected to ${outputDir}`,
        PARTIALS_CUSTOMIZABLE,
        "✓ Created .agents-inc/claude/config.ts",
        ...ENDING,
      ].join("\n"),
    );
  });

  it("asks which kind to eject when none is named, as a usage error", async () => {
    const { error } = await runCliCommand(["eject"]);

    expect(error?.message).toBe(
      "Please specify what to eject: agent-partials, templates, skills, or all",
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
  });

  it("refuses an --output that names a file, as a usage error", async () => {
    const filePath = path.join(tempDir, "a-file");
    await writeFile(filePath, "");

    const { error } = await runCliCommand(["eject", "agent-partials", "--output", filePath]);

    expect(error?.message).toBe(`Output path exists as a file: ${filePath}`);
    expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
  });

  it("refuses an --output that is a link, as a usage error", async () => {
    const realDir = path.join(tempDir, "real-dir");
    const link = path.join(tempDir, "link");
    await mkdir(realDir);
    await symlink(realDir, link);

    const { error } = await runCliCommand(["eject", "agent-partials", "--output", link]);

    expect(error?.message).toBe(
      `Output path is a link: ${link}. Name the folder it points to instead.`,
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    expect(await readdir(realDir)).toStrictEqual([]);
    expect(await fileExists(getProjectConfigPath(projectDir, "claude"))).toBe(false);
  });

  /** The link is refused before the file check, so neither what it names nor its absence matters. */
  it("refuses an --output that is a link to a file, as it refuses a link to a folder", async () => {
    const realFile = path.join(tempDir, "a-file");
    const link = path.join(tempDir, "link");
    await writeFile(realFile, "");
    await symlink(realFile, link);

    const { error } = await runCliCommand(["eject", "agent-partials", "--output", link]);

    expect(error?.message).toBe(
      `Output path is a link: ${link}. Name the folder it points to instead.`,
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    expect(await readFile(realFile, "utf-8")).toBe("");
  });

  it("refuses an --output that is a link to nothing, writing nothing where it points", async () => {
    const missingTarget = path.join(tempDir, "not-there");
    const link = path.join(tempDir, "link");
    await symlink(missingTarget, link);

    const { error } = await runCliCommand(["eject", "agent-partials", "--output", link]);

    expect(error?.message).toBe(
      `Output path is a link: ${link}. Name the folder it points to instead.`,
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    expect(await directoryExists(missingTarget)).toBe(false);
    expect(await fileExists(missingTarget)).toBe(false);
  });

  it("ejects into an --output directory that already exists and holds nothing", async () => {
    const outputDir = path.join(tempDir, "made-beforehand");
    await mkdir(outputDir);

    const { stdout, error } = await runCliCommand([
      "eject",
      "agent-partials",
      "--output",
      outputDir,
    ]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        `Output directory: ${outputDir}`,
        `✓ Agent partials ejected to ${outputDir}`,
        PARTIALS_CUSTOMIZABLE,
        "✓ Created .agents-inc/claude/config.ts",
        ...ENDING,
      ].join("\n"),
    );
    expect([...(await readdir(outputDir))].sort()).toStrictEqual(EJECTED_AGENT_DIRS);
  });

  describe("skills", () => {
    let dirs: TestDirs;

    beforeEach(async () => {
      dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      await writeTestTsConfig(dirs.projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        marketplace: dirs.sourceDir,
      });
      process.chdir(dirs.projectDir);
    });

    afterEach(async () => {
      await cleanupTestSource(dirs);
    });

    it("says there is nothing to eject when the project holds a local copy of every skill", async () => {
      const outputDir = path.join(dirs.tempDir, "ejected");
      await runCliCommand(["eject", "skills", "--output", outputDir]);
      await cp(outputDir, path.join(dirs.projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS), {
        recursive: true,
      });

      const { stderr, error } = await runCliCommand(["eject", "skills", "--force"]);

      expect(error).toBeUndefined();
      expect(flattenCliOutput(stderr)).toBe(
        "Warning: No skills found in the marketplace to eject.",
      );
    });

    it("counts the skills it copied, naming where from, and refuses to copy over them again", async () => {
      const skillsDir = path.join(dirs.projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);

      const first = await runCliCommand(["eject", "skills"]);
      const second = await runCliCommand(["eject", "skills"]);

      expect(first.stdout).toBe(
        [
          ...HEADER,
          `✓ 4 skills ejected to ${skillsDir} from ${dirs.sourceDir}`,
          "You can now customize skill content locally.",
          ...ENDING,
        ].join("\n"),
      );
      expect(compactCliOutput(second.stderr)).toBe(
        compactCliOutput(
          `Warning: Skills already exist at ${skillsDir}. Use --force to overwrite.`,
        ),
      );
    });

    it("warns of nothing on a first skills eject, when no skill was there to skip", async () => {
      const { stderr, error } = await runCliCommand(["eject", "skills"]);

      expect(error).toBeUndefined();
      expect(stderr).toBe("");
    });

    it("ejects every skill into an --output folder that exists and holds nothing", async () => {
      const outputDir = path.join(dirs.tempDir, "made-beforehand");
      await mkdir(outputDir);

      const { stdout, error } = await runCliCommand(["eject", "skills", "--output", outputDir]);

      expect(error).toBeUndefined();
      expect(stdout).toBe(
        [
          ...HEADER,
          `Output directory: ${outputDir}`,
          `✓ 4 skills ejected to ${outputDir} from ${dirs.sourceDir}`,
          "You can now customize skill content locally.",
          ...ENDING,
        ].join("\n"),
      );
      expect([...(await readdir(outputDir))].sort()).toStrictEqual(MARKETPLACE_SKILL_IDS);
    });

    it("copies only the skills not already there, counting the ones it skipped", async () => {
      const outputDir = path.join(dirs.tempDir, "ejected");
      await runCliCommand(["eject", "skills", "--output", outputDir]);
      await rm(path.join(outputDir, REMOVED_SKILL_ID), { recursive: true });
      const editedSkillMd = path.join(outputDir, EDITED_SKILL_ID, STANDARD_FILES.SKILL_MD);
      await writeFile(editedSkillMd, USERS_OWN_SKILL_EDIT);

      const { stdout, stderr, error } = await runCliCommand([
        "eject",
        "skills",
        "--output",
        outputDir,
      ]);

      expect(error).toBeUndefined();
      expect(compactCliOutput(stderr)).toBe(
        compactCliOutput(
          `Warning: Skills already exist at ${outputDir} — skipped 3 skills. Use --force to overwrite them.`,
        ),
      );
      expect(stdout).toBe(
        [
          ...HEADER,
          `Output directory: ${outputDir}`,
          `✓ 1 skill ejected to ${outputDir} from ${dirs.sourceDir}`,
          "You can now customize skill content locally.",
          ...ENDING,
        ].join("\n"),
      );
      expect(await readFile(editedSkillMd, "utf-8")).toBe(USERS_OWN_SKILL_EDIT);
      expect([...(await readdir(outputDir))].sort()).toStrictEqual(MARKETPLACE_SKILL_IDS);
    });

    it("copies only the skills not already in the default destination, counting the ones it skipped", async () => {
      const skillsDir = path.join(dirs.projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      await runCliCommand(["eject", "skills"]);
      await rm(path.join(skillsDir, REMOVED_SKILL_ID), { recursive: true });

      const { stdout, stderr, error } = await runCliCommand(["eject", "skills"]);

      expect(error).toBeUndefined();
      expect(compactCliOutput(stderr)).toBe(
        compactCliOutput(
          `Warning: Skills already exist at ${skillsDir} — skipped 3 skills. Use --force to overwrite them.`,
        ),
      );
      expect(stdout).toBe(
        [
          ...HEADER,
          `✓ 1 skill ejected to ${skillsDir} from ${dirs.sourceDir}`,
          "You can now customize skill content locally.",
          ...ENDING,
        ].join("\n"),
      );
      expect([...(await readdir(skillsDir))].sort()).toStrictEqual(MARKETPLACE_SKILL_IDS);
    });

    it("counts a single skipped skill in the singular", async () => {
      const outputDir = path.join(dirs.tempDir, "ejected");
      await runCliCommand(["eject", "skills", "--output", outputDir]);
      await Promise.all(
        MARKETPLACE_SKILL_IDS.filter((id) => id !== KEPT_SKILL_ID).map((id) =>
          rm(path.join(outputDir, id), { recursive: true }),
        ),
      );

      const { stdout, stderr, error } = await runCliCommand([
        "eject",
        "skills",
        "--output",
        outputDir,
      ]);

      expect(error).toBeUndefined();
      expect(compactCliOutput(stderr)).toBe(
        compactCliOutput(
          `Warning: Skills already exist at ${outputDir} — skipped 1 skill. Use --force to overwrite them.`,
        ),
      );
      expect(stdout).toBe(
        [
          ...HEADER,
          `Output directory: ${outputDir}`,
          `✓ 3 skills ejected to ${outputDir} from ${dirs.sourceDir}`,
          "You can now customize skill content locally.",
          ...ENDING,
        ].join("\n"),
      );
      expect([...(await readdir(outputDir))].sort()).toStrictEqual(MARKETPLACE_SKILL_IDS);
    });

    it("leaves out a skill the project already holds a local copy of", async () => {
      const outputDir = path.join(dirs.tempDir, "ejected");
      await runCliCommand(["eject", "skills", "--output", outputDir]);
      const skillsDir = path.join(dirs.projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
      const ownCopy = firstElement(await readdir(outputDir));
      await cp(path.join(outputDir, ownCopy), path.join(skillsDir, ownCopy), { recursive: true });

      const { stdout } = await runCliCommand([
        "eject",
        "skills",
        "--output",
        path.join(dirs.tempDir, "again"),
      ]);

      expect(stdout).toContain(
        `✓ 3 skills ejected to ${path.join(dirs.tempDir, "again")} from ${dirs.sourceDir}`,
      );
    });
  });

  describe("eject all, run twice into the default destination", () => {
    let dirs: TestDirs;
    let template: string;

    beforeEach(async () => {
      dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      await writeTestTsConfig(
        dirs.projectDir,
        buildProjectConfig({ skills: [], agents: [], marketplace: dirs.sourceDir }),
      );
      process.chdir(dirs.projectDir);
      template = path.join(
        agentsDirOf(dirs.projectDir),
        path.basename(DIRS.templates),
        "agent.liquid",
      );
      await runCliCommand(["eject", "all"]);
      await writeFile(template, USERS_OWN_TEMPLATE);
    });

    afterEach(async () => {
      await cleanupTestSource(dirs);
    });

    it("keeps the templates a second eject all finds there, without --force", async () => {
      const skillsDir = path.join(dirs.projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);

      const { stdout, stderr, error } = await runCliCommand(["eject", "all"]);

      expect(error).toBeUndefined();
      expect(stdout).toBe([...HEADER, ...ENDING].join("\n"));
      expect(compactCliOutput(stderr)).toBe(
        compactCliOutput(
          [
            `Warning: Agent partials already exist at ${agentsDirOf(dirs.projectDir)}. Use --force to overwrite.`,
            `Warning: Skills already exist at ${skillsDir}. Use --force to overwrite.`,
          ].join("\n"),
        ),
      );
      expect(await readFile(template, "utf-8")).toBe(USERS_OWN_TEMPLATE);
    });

    it("replaces the templates on eject all --force", async () => {
      const { error } = await runCliCommand(["eject", "all", "--force"]);

      expect(error).toBeUndefined();
      expect(await readFile(template, "utf-8")).not.toBe(USERS_OWN_TEMPLATE);
    });
  });

  /** With --output every kind writes into the one directory, so the partials create it first. */
  describe("everything into one fresh --output directory", () => {
    let dirs: TestDirs;
    let outputDir: string;
    let run: Awaited<ReturnType<typeof runCliCommand>>;

    beforeEach(async () => {
      dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      await writeTestTsConfig(dirs.projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        marketplace: dirs.sourceDir,
      });
      process.chdir(dirs.projectDir);
      outputDir = path.join(dirs.tempDir, "everything");
      run = await runCliCommand(["eject", "all", "--output", outputDir]);
    });

    afterEach(async () => {
      await cleanupTestSource(dirs);
    });

    it("copies the marketplace's skills there too, rather than calling them already there", () => {
      expect(run.stdout).toContain(`✓ 4 skills ejected to ${outputDir} from ${dirs.sourceDir}`);
    });

    it("puts the skills on disk beside the partials, with the templates once, among them", async () => {
      const skillIds = inTestMarketplace(DEFAULT_TEST_SKILLS).map((skill) => skill.id);

      expect([...(await readdir(outputDir))].sort()).toStrictEqual(
        [...EJECTED_AGENT_DIRS, ...skillIds].sort(),
      );
      expect(
        [...(await readdir(path.join(outputDir, path.basename(DIRS.templates))))].sort(),
      ).toStrictEqual(EJECTED_TEMPLATE_ENTRIES);
    });

    it("still refuses to copy over skills already in the default destination", async () => {
      const skillsDir = path.join(dirs.projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      await runCliCommand(["eject", "all"]);

      const second = await runCliCommand(["eject", "all"]);

      expect(compactCliOutput(second.stderr)).toContain(
        compactCliOutput(
          `Warning: Skills already exist at ${skillsDir}. Use --force to overwrite.`,
        ),
      );
    });

    describe("again, into the directory the first run made", () => {
      let second: Awaited<ReturnType<typeof runCliCommand>>;

      beforeEach(async () => {
        second = await runCliCommand(["eject", "all", "--output", outputDir]);
      });

      it("skips the skills already there with a warning, rather than calling it a file", () => {
        expect(compactCliOutput(second.stderr)).toContain(
          compactCliOutput(
            `Warning: Skills already exist at ${outputDir}. Use --force to overwrite.`,
          ),
        );
      });
    });

    describe("again, after the user edited a skill the first run put there", () => {
      const EDITED_SKILL_MD = "the user's own edit to an ejected skill";
      const editedSkillMd = () =>
        path.join(
          outputDir,
          firstElement(inTestMarketplace(DEFAULT_TEST_SKILLS)).id,
          STANDARD_FILES.SKILL_MD,
        );

      beforeEach(async () => {
        await writeFile(editedSkillMd(), EDITED_SKILL_MD);
      });

      it("keeps the edit without --force, finishing without an error", async () => {
        const second = await runCliCommand(["eject", "all", "--output", outputDir]);

        expect(second.error).toBeUndefined();
        expect(await readFile(editedSkillMd(), "utf-8")).toBe(EDITED_SKILL_MD);
      });

      it("copies the skills over it with --force, saying so", async () => {
        const second = await runCliCommand(["eject", "all", "--output", outputDir, "--force"]);

        expect(second.error).toBeUndefined();
        expect(second.stdout).toContain(
          `✓ 4 skills ejected to ${outputDir} from ${dirs.sourceDir}`,
        );
        expect(await readFile(editedSkillMd(), "utf-8")).not.toBe(EDITED_SKILL_MD);
      });
    });
  });

  /** Only skills are copied from the marketplace, so only their eject needs it to load. */
  describe("with a configured marketplace that cannot be loaded", () => {
    let missingMarketplace: string;
    let configPath: string;
    let configBefore: string;

    beforeEach(async () => {
      missingMarketplace = path.join(tempDir, "no-such-marketplace");
      configPath = await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ skills: [], agents: [], marketplace: missingMarketplace }),
      );
      configBefore = await readFile(configPath, "utf-8");
    });

    it("refuses to eject skills, naming the path, and copies nothing", async () => {
      const { error } = await runCliCommand(["eject", "skills"]);

      expect([error?.name, error?.message]).toStrictEqual([
        "Error",
        [
          `Local marketplace not found: '${missingMarketplace}'`,
          "",
          "Nothing is at that path, and a local marketplace must be a directory holding skills.",
          "",
          "Check it for a typo, or name a marketplace that exists:",
          "  --marketplace github:agents-inc/skills",
        ].join("\n"),
      ]);
      expect([
        await directoryExists(path.join(projectDir, LOCAL_SKILLS_PATH)),
        await readFile(configPath, "utf-8"),
      ]).toStrictEqual([false, configBefore]);
    });

    it("still ejects the templates, which never read it", async () => {
      const templatesDir = path.join(agentsDirOf(projectDir), path.basename(DIRS.templates));

      const { stdout, stderr, error } = await runCliCommand(["eject", "templates"]);

      expect(error).toBeUndefined();
      expect(stderr).toBe("");
      expect(stdout).toBe(
        [
          ...HEADER,
          `✓ Agent templates ejected to ${templatesDir}`,
          "You can now customize agent templates locally.",
          ...ENDING,
        ].join("\n"),
      );
      expect([
        [...(await readdir(templatesDir))].sort(),
        await readFile(configPath, "utf-8"),
      ]).toStrictEqual([EJECTED_TEMPLATE_ENTRIES, configBefore]);
    });

    it("still ejects the agent partials, which never read it", async () => {
      const { stdout, stderr, error } = await runCliCommand(["eject", "agent-partials"]);

      expect(error).toBeUndefined();
      expect(stderr).toBe("");
      expect(stdout).toBe(
        [
          ...HEADER,
          `✓ Agent partials ejected to ${agentsDirOf(projectDir)}`,
          PARTIALS_CUSTOMIZABLE,
          ...ENDING,
        ].join("\n"),
      );
      expect([
        [...(await readdir(agentsDirOf(projectDir)))].sort(),
        await readFile(configPath, "utf-8"),
      ]).toStrictEqual([EJECTED_AGENT_DIRS, configBefore]);
    });
  });

  describe("with no config of its own", () => {
    it("records the marketplace it read in the config it creates", async () => {
      await runCliCommand(["eject", "agent-partials"]);

      const config = await readTestTsConfig<ProjectConfig>(
        getProjectConfigPath(projectDir, "claude"),
      );

      expect(config.marketplace).toBe("github:agents-inc/skills");
    });

    it("carries the marketplace name the global config records for that marketplace", async () => {
      await writeTestTsConfig(fakeHome, {
        name: "global",
        skills: [],
        agents: [],
        marketplace: "github:acme/skills",
        marketplaceName: "acme",
      });

      await runCliCommand(["eject", "agent-partials"]);

      const config = await readTestTsConfig<ProjectConfig>(
        getProjectConfigPath(projectDir, "claude"),
      );

      expect([config.marketplace, config.marketplaceName]).toStrictEqual([
        "github:acme/skills",
        "acme",
      ]);
    });

    it("refuses a marketplace the global config names as an error, naming the file and copying nothing", async () => {
      const globalConfigPath = await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          name: "global",
          skills: [],
          agents: [],
          marketplace: PRIVATE_ADDRESS_MARKETPLACE,
        }),
      );
      const globalConfigBefore = await readFile(globalConfigPath, "utf-8");

      const { error } = await runCliCommand(["eject", "skills"]);

      // `eject` does not catch this one, and the binary prints such an error as `<name>: <message>`.
      expect([error?.name, error?.message]).toStrictEqual([
        "Error",
        [
          `The marketplace in ${globalConfigPath} points to a private or reserved IP address: "${PRIVATE_ADDRESS_MARKETPLACE}"`,
          "",
          "Marketplace URLs must not target private network addresses.",
          "Use a public hostname instead.",
          "Examples:",
          "  marketplace: 'https://github.com/user/repo'",
          "  marketplace: 'https://gitlab.company.com/team/skills'",
        ].join("\n"),
      ]);
      expect([
        await directoryExists(path.join(projectDir, LOCAL_SKILLS_PATH)),
        await fileExists(getProjectConfigPath(projectDir, "claude")),
        await readFile(globalConfigPath, "utf-8"),
      ]).toStrictEqual([false, false, globalConfigBefore]);
    });

    it("at home, creates the global config pair and records the marketplace in it", async () => {
      process.chdir(fakeHome);

      const { stdout } = await runCliCommand(["eject", "agent-partials"]);

      const configPath = getProjectConfigPath(fakeHome, "claude");
      const config = await readTestTsConfig<ProjectConfig>(configPath);
      expect(stdout).toContain("✓ Created .agents-inc/claude/config.ts\n");
      expect(config.marketplace).toBe("github:agents-inc/skills");
      expect(
        await fileExists(path.join(path.dirname(configPath), STANDARD_FILES.CONFIG_TYPES_TS)),
      ).toBe(true);
    });

    // Root writes through the mode bits, so the failure under test cannot happen there.
    it.skipIf(process.getuid?.() === 0)(
      "says the config could not be created, withholds the success line and exits with failures",
      async () => {
        const outputDir = path.join(tempDir, "partials");
        await chmod(projectDir, 0o555);
        try {
          const { stdout, stderr, error } = await runCliCommand([
            "eject",
            "agent-partials",
            "--output",
            outputDir,
          ]);

          expect(stdout).not.toContain("✓ Eject complete!");
          expect(flattenCliOutput(stderr)).toContain(
            "Warning: Could not create .agents-inc/claude/config.ts: EACCES",
          );
          expect(stdout).toContain(
            "Completed with 1 failure(s) — the changes above landed, these did not:\n  Could not create .agents-inc/claude/config.ts: EACCES",
          );
          expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
        } finally {
          await chmod(projectDir, 0o755);
        }
      },
    );
  });
});
