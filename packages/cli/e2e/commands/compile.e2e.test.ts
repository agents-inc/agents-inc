import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  directoryExists,
  ensureBinaryExists,
  listFiles,
  readTestFile,
  renderMetadataYaml,
  renderSkillMd,
  agentsPath,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  CUSTOM_PROJECT_SKILL_ID,
  MINIMAL_PROJECT_AGENT_NAMES,
  MINIMAL_PROJECT_SKILL_ID,
  ProjectBuilder,
} from "../fixtures/project-builder.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT } from "../pages/constants.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";

describe("compile command", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should compile agents to default output directory", async () => {
    const project = await ProjectBuilder.minimal();
    tempDir = path.dirname(project.dir);

    const { exitCode, output } = await CLI.run(["compile"], project);

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("Compiling global agents");
    expect(output).toContain("Discovered 1 local skills");
    expect(output).toMatch(/\d+ global agents rewritten, \d+ unchanged/);
    expect(output).toContain("Global compile complete");

    await expect(project).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      contains: ["name: web-developer"],
    });
    await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: ["name: api-developer"],
    });

    // Compiled agent should start with YAML frontmatter
    const agentContent = await readTestFile(path.join(agentsPath(project.dir), "web-developer.md"));
    expect(agentContent).toMatch(/^---\n/);
  });

  it("should produce valid compiled agent files with frontmatter", async () => {
    const project = await ProjectBuilder.minimal();
    tempDir = path.dirname(project.dir);

    const { exitCode } = await CLI.run(["compile"], project);

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect(project).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      contains: ["name: web-developer", "description:", "tools:", "model:", "#"],
    });
    await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: ["name: api-developer", "description:", "tools:", "model:", "#"],
    });
  });

  it("should fail when no skills are available", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "empty-project");
    await mkdir(projectDir, { recursive: true });
    // Declare an agent so the project is a detected installation; compile then
    // reaches the no-skills-found failure because no skills exist on disk.
    await writeProjectConfig(projectDir, {
      name: "empty",
      skills: [],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
    });

    const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

    expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.NO_SKILLS_FOUND);

    // No agent files should be created on compile failure
    const agentsDirPath = agentsPath(projectDir);
    expect(
      await directoryExists(agentsDirPath),
      "agents directory should not exist after compile failure",
    ).toBe(false);
  });

  describe("multiple skills", () => {
    it("should compile with multiple local skills", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      // Declare the agents so the project is a detected installation; the local
      // skills under test are discovered from disk independently of the config.
      await writeProjectConfig(projectDir, {
        name: "e2e-test",
        skills: [],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "project" },
          { name: E2E_AGENT["api-developer"].name, scope: "project" },
        ],
      });

      await createLocalSkill(projectDir, "web-testing-react-testing-library", {
        description: "First test skill",
        metadata: renderMetadataYaml({ contentHash: "hash-first" }),
      });
      await createLocalSkill(projectDir, "web-testing-vue-test-utils", {
        description: "Second test skill",
        metadata: renderMetadataYaml({ contentHash: "hash-second" }),
      });
      await createLocalSkill(projectDir, "web-mocks-msw", {
        description: "Third test skill",
        metadata: renderMetadataYaml({ contentHash: "hash-third" }),
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 3 local skills");
      expect(output).toMatch(/\d+ global agents rewritten, \d+ unchanged/);

      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer"],
        },
      );
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["api-developer"].name,
        {
          contains: ["name: api-developer"],
        },
      );

      // Both agents must exist with valid YAML frontmatter
      await expect({ dir: projectDir }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
      await expect({ dir: projectDir }).toHaveCompiledAgent(E2E_AGENT["api-developer"].name);
      // Agent frontmatter must have name field
      await expect({ dir: projectDir }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
        name: E2E_AGENT["web-developer"].name,
      });
    });
  });

  describe("verbose output", () => {
    it("should name every loaded skill and every compiled agent in verbose mode", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);

      const { exitCode, output } = await CLI.run(["compile", "--verbose"], { dir: project.dir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skills");
      expect(output).toMatch(/\d+ global agents rewritten, \d+ unchanged/);
      expect(output).toContain(`${STEP_TEXT.LOADED_SKILL} ${MINIMAL_PROJECT_SKILL_ID}`);
      expect(
        output,
        "--verbose must add the per-agent listing the default output leaves out",
      ).toContain(`${STEP_TEXT.COMPILED_LIST} ${MINIMAL_PROJECT_AGENT_NAMES.join(", ")}`);

      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
        contains: ["name: web-developer"],
      });
      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
        contains: ["name: api-developer"],
      });
    });
  });

  describe("invalid skill handling", () => {
    it("should skip skill with missing metadata.yaml", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      // Declare the agents so the project is a detected installation; the local
      // skills under test are discovered from disk independently of the config.
      await writeProjectConfig(projectDir, {
        name: "e2e-test",
        skills: [],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "project" },
          { name: E2E_AGENT["api-developer"].name, scope: "project" },
        ],
      });

      // Create a valid skill
      await createLocalSkill(projectDir, "web-state-jotai", {
        description: "Valid skill",
        metadata: renderMetadataYaml({ contentHash: "hash-valid" }),
      });

      const invalidSkillDir = path.join(skillsPath(projectDir), "web-state-mobx");
      await mkdir(invalidSkillDir, { recursive: true });
      await writeFile(
        path.join(invalidSkillDir, FILES.SKILL_MD),
        renderSkillMd("web-state-mobx", "Missing metadata", "# No Metadata"),
      );

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("missing metadata.yaml");
      expect(output).toContain("Discovered 1 local skills");

      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer"],
          notContains: ["web-state-mobx"],
        },
      );
    });
  });

  describe("help output", () => {
    it("should display help with expected flags and description", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      const { exitCode, stdout } = await CLI.run(["compile", "--help"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("USAGE");
      expect(stdout).toContain("Compile agents");
      expect(stdout).toContain("--verbose");
      expect(stdout, "compile reads the source its config records").not.toContain("--source");
    });
  });

  describe("missing skills directory", () => {
    it("should exit with error when .claude/skills/ directory does not exist", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      // Create project with .claude/ but no skills/ subdirectory
      await mkdir(path.join(projectDir, DIRS.CLAUDE), { recursive: true });
      // Declare an agent so the project is a detected installation; compile then
      // reaches the no-skills-found failure because no skills/ directory exists.
      await writeProjectConfig(projectDir, {
        name: "empty",
        skills: [],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.NO_SKILLS_FOUND);
    });
  });

  describe("output directory with existing files", () => {
    it("should write compiled agents alongside pre-existing files", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;
      const agentsDir = agentsPath(project.dir);

      // Place a pre-existing file in the agents directory
      const preExistingFile = "existing-notes.txt";
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, preExistingFile), "pre-existing content");

      const { exitCode } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      const outputFiles = await listFiles(agentsDir);

      // Pre-existing file should still be present
      expect(outputFiles).toContain(preExistingFile);

      // Compiled agent files should also be present with correct content
      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
        contains: ["name: web-developer"],
      });
      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
        contains: ["name: api-developer"],
      });
    });
  });

  describe("agent YAML content verification", () => {
    it("should produce agents with content after frontmatter", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);

      const { exitCode } = await CLI.run(["compile"], { dir: project.dir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      for (const agentName of MINIMAL_PROJECT_AGENT_NAMES) {
        // The matcher strips the frontmatter block before looking, so a file that
        // is frontmatter and nothing else cannot satisfy it — which a `contains`
        // check for a "#" anywhere in the file could.
        await expect(project).toHaveAgentDynamicSkills(agentName, {
          hasActivationProtocol: true,
        });

        // …and the body opens with a heading immediately after the terminator,
        // rather than the terminator being the last thing in the file.
        const agentContent = await readTestFile(
          path.join(agentsPath(project.dir), `${agentName}.md`),
        );
        expect(agentContent).toMatch(/^---\n[\s\S]+?\n---\n\n#\s+\S/);
      }
    });

    it("should produce distinct content for each compiled agent", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const agentsDir = agentsPath(project.dir);

      const { exitCode } = await CLI.run(["compile"], { dir: project.dir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify each agent has its own name in frontmatter
      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
        contains: ["name: web-developer"],
      });
      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
        contains: ["name: api-developer"],
      });

      // Compare raw content to verify agents are distinct (no matcher for cross-file comparison)
      const webDevContent = await readTestFile(path.join(agentsDir, "web-developer.md"));
      const apiDevContent = await readTestFile(path.join(agentsDir, "api-developer.md"));
      expect(webDevContent).not.toBe(apiDevContent);
    });
  });

  describe("custom skills in project config", () => {
    it("should compile agents with custom skills in config", async () => {
      const project = await ProjectBuilder.withCustomSkill();
      tempDir = path.dirname(project.dir);

      const { exitCode, output } = await CLI.run(["compile"], { dir: project.dir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toMatch(/\d+ global agents rewritten, \d+ unchanged/);

      await expect({ dir: project.dir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer", CUSTOM_PROJECT_SKILL_ID],
        },
      );
    });

    it("should include custom skill in compiled agent frontmatter", async () => {
      const project = await ProjectBuilder.withCustomSkill();
      tempDir = path.dirname(project.dir);

      const { exitCode } = await CLI.run(["compile"], { dir: project.dir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // The custom skill is the stack's only preloaded assignment, so the parsed
      // frontmatter's skills list must be exactly it. `contains` on the whole
      // file cannot tell frontmatter from body and so cannot make this claim.
      await expect({ dir: project.dir }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
        name: E2E_AGENT["web-developer"].name,
        exactSkills: [CUSTOM_PROJECT_SKILL_ID],
      });
    });
  });

  describe("stored source resolution", () => {
    let sourceTempDir: string;

    afterEach(async () => {
      if (sourceTempDir) {
        await cleanupTempDir(sourceTempDir);
      }
    });

    it("should compile from the source the installation recorded", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      // Declare the agents so the project is a detected installation; the local
      // skill under test is discovered from disk independently of the config.
      // Create an E2E source directory (provides agent definitions + templates)
      const { sourceDir, tempDir: srcTempDir } = await createE2ESource();
      sourceTempDir = srcTempDir;

      await writeProjectConfig(projectDir, {
        name: "e2e-test",
        skills: [],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "project" },
          { name: E2E_AGENT["api-developer"].name, scope: "project" },
        ],
        source: sourceDir,
      });

      // Create a local skill in the project
      await createLocalSkill(projectDir, "web-state-pinia", {
        description: "Skill for stored-source verification",
        metadata: renderMetadataYaml({ contentHash: "hash-source-stored" }),
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skills");
      expect(
        output,
        "the source came from the project's own config, not from a flag or the environment",
      ).toContain("Source: project");
      expect(output).toMatch(/\d+ global agents rewritten, \d+ unchanged/);

      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer"],
        },
      );
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["api-developer"].name,
        {
          contains: ["name: api-developer"],
        },
      );
    });
  });

  describe("global installation fallback", () => {
    it("should use global installation paths when no project config exists", async () => {
      tempDir = await createTempDir();

      // Create a "global home" directory with .claude-src/config.ts and .claude/skills/
      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(globalHome, {
        name: "global-test",
        skills: [{ id: "web-testing-cypress-e2e", scope: "project", source: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
      });

      // Create a local skill in the global home directory
      await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
        description: "Global skill for compile fallback",
        metadata: renderMetadataYaml({ contentHash: "hash-global" }),
      });

      // Create a project directory WITHOUT config
      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      // Run compile with HOME pointing to globalHome so detectInstallation falls back to global
      // compile without --output uses detectInstallation() which falls back to global
      const { exitCode, output } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // When using global installation, dual-pass compile runs the global pass
      expect(output).toContain("Compiling global agents");

      await expect({ dir: globalHome }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer"],
        },
      );
    });
  });
});
