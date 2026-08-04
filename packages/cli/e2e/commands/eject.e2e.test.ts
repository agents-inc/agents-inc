import path from "path";
import { chmod, mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT } from "../pages/constants.js";
import {
  configTsPath,
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  directoryExists,
  fileExists,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";

describe("eject command", () => {
  let tempDir: string;
  let readOnlyDir: string | undefined;
  // Created once for the whole file — eject only reads from the source
  let sourceDir: string;
  let e2eSourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
  });

  afterAll(async () => {
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    if (readOnlyDir) {
      await chmod(readOnlyDir, 0o755);
      readOnlyDir = undefined;
    }
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should error when no eject type is specified", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["eject"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("specify what to eject");
  });

  it("should error with invalid eject type", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["eject", "invalid-type"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("Expected");
  });

  it("should eject agent-partials to project directory", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "agent-partials"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Eject");
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);

    // Verify agent partials directory was created with content
    const agentsDir = path.join(tempDir, DIRS.CLAUDE_SRC, "agents");
    expect(await directoryExists(agentsDir)).toBe(true);
    const entries = await listFiles(agentsDir);
    expect(entries.length).toBeGreaterThan(0);

    // Verify at least one agent partial has expected structure (identity.md or metadata.yaml)
    const firstAgentDir = entries.find((e) => !e.startsWith("_"));
    expect(firstAgentDir).toBeDefined();
    const partialFiles = await listFiles(path.join(agentsDir, firstAgentDir!));
    expect(partialFiles.length).toBeGreaterThan(0);

    // At least one agent partial should contain agent content
    const partials = await listFiles(agentsDir);
    const agentPartials = partials.filter((e) => !e.startsWith("_"));
    expect(agentPartials.length).toBeGreaterThan(0);

    // Config should be created
    await expect({ dir: tempDir }).toHaveConfig();
  });

  it("should eject templates to project directory", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "templates"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);

    // Verify the template file was actually created with liquid content
    await expect({ dir: tempDir }).toHaveEjectedTemplate();
    const templatePath = path.join(
      tempDir,
      DIRS.CLAUDE_SRC,
      "agents",
      "_templates",
      "agent.liquid",
    );
    const templateContent = await readTestFile(templatePath);
    expect(templateContent).toContain("---");

    // Template must contain Liquid syntax
    expect(templateContent).toContain("{{");

    // Config should be created
    await expect({ dir: tempDir }).toHaveConfig();
  });

  it("should eject agent-partials to custom output directory", async () => {
    tempDir = await createTempDir();
    const outputDir = path.join(tempDir, "custom-output");

    const { exitCode, stdout } = await CLI.run(["eject", "agent-partials", "-o", outputDir], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);
    expect(await directoryExists(outputDir)).toBe(true);

    // Verify agent partial files were created in the custom directory
    const entries = await listFiles(outputDir);
    expect(entries.length).toBeGreaterThan(0);

    // Verify content: at least one agent partial has files
    const firstEntry = entries[0];
    const partialFiles = await listFiles(path.join(outputDir, firstEntry));
    expect(partialFiles.length).toBeGreaterThan(0);

    // Default .claude-src/agents should NOT exist (output was redirected)
    const defaultAgentsDir = path.join(tempDir, DIRS.CLAUDE_SRC, "agents");
    expect(await directoryExists(defaultAgentsDir)).toBe(false);
  });

  it("should warn when ejecting agent-partials twice without --force", async () => {
    tempDir = await createTempDir();

    const { exitCode: setupExitCode } = await CLI.run(["eject", "agent-partials"], {
      dir: tempDir,
    });
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, output } = await CLI.run(["eject", "agent-partials"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("already exist");
  });

  it("should allow re-eject with --force", async () => {
    tempDir = await createTempDir();

    const { exitCode: setupExitCode } = await CLI.run(["eject", "agent-partials"], {
      dir: tempDir,
    });
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, stdout } = await CLI.run(["eject", "agent-partials", "--force"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);
  });

  it("should eject skills from a local source", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "skills", "--source", sourceDir], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("skills ejected");

    const skillsDir = skillsPath(tempDir);
    expect(await directoryExists(skillsDir)).toBe(true);
    const files = await listFiles(skillsDir);
    expect(files).toHaveLength(9);

    // Verify specific ejected skills exist with expected content
    await expect({ dir: tempDir }).toHaveLocalSkills([
      E2E_SKILL.react.id,
      E2E_SKILL.vitest.id,
      E2E_SKILL.zustand.id,
      E2E_SKILL.hono.id,
    ]);

    // Verify each ejected skill has SKILL.md with content
    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.react.id);
    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.vitest.id);
    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.zustand.id);
    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.hono.id);

    // Verify SKILL.md content for a representative skill
    const skillMdPath = path.join(skillsDir, E2E_SKILL.react.id, FILES.SKILL_MD);
    const skillContent = await readTestFile(skillMdPath);
    expect(skillContent).toContain(E2E_SKILL.react.id);

    // Verify config was saved with source
    await expect({ dir: tempDir }).toHaveConfig({ source: sourceDir });
  });

  it("should eject all phases from a local source", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "all", "--source", sourceDir], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("ejected");
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);

    // Verify agent partials were created with content
    const agentsDir = path.join(tempDir, DIRS.CLAUDE_SRC, "agents");
    expect(await directoryExists(agentsDir)).toBe(true);
    const agentEntries = await listFiles(agentsDir);
    expect(agentEntries.length).toBeGreaterThan(1); // At least _templates + agent partials

    // Verify templates were created with liquid content
    await expect({ dir: tempDir }).toHaveEjectedTemplate();
    const templatePath = path.join(agentsDir, "_templates", "agent.liquid");
    const templateContent = await readTestFile(templatePath);
    expect(templateContent).toContain("---");

    // Verify skills were created with SKILL.md files
    await expect({ dir: tempDir }).toHaveLocalSkills([E2E_SKILL.react.id]);
    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.react.id);

    // Verify config was created with source reference
    await expect({ dir: tempDir }).toHaveConfig({ source: sourceDir });
  });

  it("should save source to config when --source flag is provided", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "skills", "--source", sourceDir], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Source saved to .claude-src/config.ts");

    // Verify the config file was actually created with source reference
    await expect({ dir: tempDir }).toHaveConfig({ source: sourceDir });

    const configContent = await readTestFile(configTsPath(tempDir));
    expect(configContent).toContain("source");
  });

  it("should create config.ts in a fresh directory after eject", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(["eject", "agent-partials"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Config file should exist with a project name (derived from the temp dir basename)
    const configContent = await readTestFile(configTsPath(tempDir));
    expect(configContent).toContain("name");
    expect(configContent).toContain("export default");
  });

  it("should display help text with --help flag", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("USAGE");
    expect(stdout).toContain("agent-partials");
    expect(stdout).toContain("templates");
    expect(stdout).toContain("skills");
    expect(stdout).toContain("all");
  });

  // BUG: CLI exits 0 with corrupt source — it falls back to default source
  // instead of reporting an error for the invalid --source directory.
  it.fails("should handle corrupt source without crashing", async () => {
    tempDir = await createTempDir();
    const corruptSourceDir = path.join(tempDir, "corrupt-source");
    await mkdir(corruptSourceDir, { recursive: true });
    await writeFile(path.join(corruptSourceDir, "garbage.txt"), "not a valid source");

    const { exitCode } = await CLI.run(["eject", "skills", "--source", corruptSourceDir], {
      dir: tempDir,
    });

    expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
  });

  it("should error when ejecting to a read-only directory", async () => {
    tempDir = await createTempDir();
    readOnlyDir = path.join(tempDir, "read-only");
    await mkdir(readOnlyDir, { recursive: true });
    await chmod(readOnlyDir, 0o444);

    const { exitCode } = await CLI.run(["eject", "agent-partials", "-o", readOnlyDir], {
      dir: tempDir,
    });

    expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
  });

  it("should eject templates and produce only the template file, not agent partials", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "templates"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Agent templates ejected");
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);

    // The agent.liquid template should exist
    await expect({ dir: tempDir }).toHaveEjectedTemplate();

    // Agent partial directories (e.g., developer, reviewer) should NOT exist
    const agentsDir = path.join(tempDir, DIRS.CLAUDE_SRC, "agents");
    const contents = await listFiles(agentsDir);
    // Only _templates should be present, not individual agent dirs
    expect(contents).toContain("_templates");
    const nonTemplateEntries = contents.filter((entry) => entry !== "_templates");
    expect(nonTemplateEntries.length).toBe(0);
  });

  it("should eject skills without ejecting agent partials or templates", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "skills", "--source", sourceDir], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("skills ejected");

    // Skills directory should exist with content
    await expect({ dir: tempDir }).toHaveLocalSkills();

    // The .claude-src/agents/ directory should NOT exist (no agent partials or templates ejected)
    const agentPartialsDir = path.join(tempDir, DIRS.CLAUDE_SRC, "agents");
    expect(await directoryExists(agentPartialsDir)).toBe(false);
  });

  it("should warn when ejecting templates twice without --force", async () => {
    tempDir = await createTempDir();

    const { exitCode: setupExitCode } = await CLI.run(["eject", "templates"], { dir: tempDir });
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, output } = await CLI.run(["eject", "templates"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("already exist");
  });

  it("should warn when ejecting skills twice without --force", async () => {
    tempDir = await createTempDir();

    const { exitCode: setupExitCode } = await CLI.run(["eject", "skills", "--source", sourceDir], {
      dir: tempDir,
    });
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, output } = await CLI.run(["eject", "skills", "--source", sourceDir], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("already exist");
  });

  // BUG: The second eject with --force succeeds (exit 0) but reports
  // "0 skills ejected" or skips the ejected-count log entirely. The --force
  // flag bypasses the "already exist" guard but copySkillsToLocalFlattened
  // returns an empty result on re-eject, so "skills ejected" is missing.
  it.fails("should overwrite existing skills with --force", async () => {
    tempDir = await createTempDir();

    const { exitCode: setupExitCode } = await CLI.run(["eject", "skills", "--source", sourceDir], {
      dir: tempDir,
    });
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, stdout } = await CLI.run(
      ["eject", "skills", "--source", sourceDir, "--force"],
      { dir: tempDir },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("skills ejected");
  });

  it("should eject templates to custom output directory", async () => {
    tempDir = await createTempDir();
    const outputDir = path.join(tempDir, "custom-templates");

    const { exitCode, stdout } = await CLI.run(["eject", "templates", "-o", outputDir], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);
    expect(stdout).toContain("Output directory:");
    expect(await directoryExists(outputDir)).toBe(true);

    // Verify the template file was created in the custom directory with content
    const entries = await listFiles(outputDir);
    expect(entries).toContain("agent.liquid");
    const templateContent = await readTestFile(path.join(outputDir, "agent.liquid"));
    expect(templateContent).toContain("---");

    // Default template location should NOT exist (output was redirected)
    const defaultTemplatePath = path.join(tempDir, DIRS.CLAUDE_SRC, "agents", "_templates");
    expect(await directoryExists(defaultTemplatePath)).toBe(false);
  });

  it("should eject skills to custom output directory", async () => {
    tempDir = await createTempDir();
    const outputDir = path.join(tempDir, "custom-skills");

    const { exitCode, stdout } = await CLI.run(
      ["eject", "skills", "--source", sourceDir, "-o", outputDir],
      { dir: tempDir },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("skills ejected");
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);
    expect(await directoryExists(outputDir)).toBe(true);
    const files = await listFiles(outputDir);
    expect(files).toHaveLength(9);

    // Verify skill content in custom output directory
    const skillMdPath = path.join(outputDir, E2E_SKILL.react.id, FILES.SKILL_MD);
    expect(await fileExists(skillMdPath)).toBe(true);
    const skillContent = await readTestFile(skillMdPath);
    expect(skillContent).toContain(E2E_SKILL.react.id);
  });

  it("should error when --output points to an existing file", async () => {
    tempDir = await createTempDir();
    const filePath = path.join(tempDir, "not-a-dir");
    await writeFile(filePath, "I am a file, not a directory");

    const { exitCode, output } = await CLI.run(["eject", "agent-partials", "-o", filePath], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("exists as a file");
  });
});
