import path from "path";
import { realpathSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  listFiles,
  readTestFile,
  renderMetadataYaml,
  sourceFolderIn,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  CUSTOM_PROJECT_SKILL_ID,
  MINIMAL_PROJECT_AGENT_NAMES,
  MINIMAL_PROJECT_SKILL_ID,
  ProjectBuilder,
  metadataFieldsFor,
} from "../fixtures/project-builder.js";
import { readGeneratedUnionMembers } from "../../src/cli/lib/__tests__/helpers/generated-types.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { saUnflagged } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import { provenanceMarker } from "../../src/cli/lib/agents/agent-provenance.js";
import "../matchers/setup.js";

/**
 * Differs from every HOME answer: fixture ids are outside the public catalogue, so an unmerged
 * catalogue answers with the placeholder.
 */
const PROJECT_SKILL_USAGE = "Use when testing E2E scenarios";

const EJECT_ORIGIN = "eject";

describe("compile command", () => {
  let tempDir: string;

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
    expect(output).toContain("Discovered 1 local skill");
    expect(output).not.toContain("Discovered 1 local skills");
    expect(output).toMatch(/\d+ global agents? rewritten, \d+ unchanged/);
    expect(output).toContain("Global compile complete");

    await expect(project).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      contains: ["name: web-developer"],
    });
    await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: ["name: api-developer"],
    });

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

  /**
   * The `Category` union is emitted from the categories discovered skills joined, so a dropped
   * skill leaves it `never` while compile still succeeds.
   */
  it("registers the project's local skill under the category its metadata states", async () => {
    const project = await ProjectBuilder.minimal();
    tempDir = path.dirname(project.dir);

    const { exitCode, output } = await CLI.run(["compile"], project);

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(
      output,
      "a skill wearing the placeholder category belongs to no domain and reaches no sub-agent",
    ).not.toContain(STEP_TEXT.LOCAL_SKILL_PLACEHOLDER_CATEGORY);

    const generatedTypes = await readTestFile(
      path.join(sourceFolderIn(project.dir), FILES.CONFIG_TYPES_TS),
    );
    expect(
      readGeneratedUnionMembers(generatedTypes, "Category"),
      "the Category union names every category a discovered skill joined",
    ).toStrictEqual([metadataFieldsFor(MINIMAL_PROJECT_SKILL_ID).category]);
  });

  it("should fail when no skills are available", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "empty-project");
    await mkdir(projectDir, { recursive: true });
    // A declared skill not on disk is a lost installation, which compile refuses.
    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "empty",
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: EJECT_ORIGIN }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
      }),
    );

    const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

    expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.NO_SKILLS_FOUND);

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
      // Agents declared so the project is a detected installation; local skills come from disk.
      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "e2e-test",
          skills: [],
          agents: buildAgentConfigs(
            [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name],
            { scope: "project" },
          ),
        }),
      );

      await createLocalSkill(projectDir, "web-testing-react-testing-library", {
        description: "First test skill",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-testing-react-testing-library"),
          contentHash: "hash-first",
        }),
      });
      await createLocalSkill(projectDir, "web-testing-vue-test-utils", {
        description: "Second test skill",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-testing-vue-test-utils"),
          contentHash: "hash-second",
        }),
      });
      await createLocalSkill(projectDir, "web-mocks-msw", {
        description: "Third test skill",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-mocks-msw"),
          contentHash: "hash-third",
        }),
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 3 local skills");
      expect(output).toMatch(/\d+ global agents? rewritten, \d+ unchanged/);

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

      await expect({ dir: projectDir }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
      await expect({ dir: projectDir }).toHaveCompiledAgent(E2E_AGENT["api-developer"].name);
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
      expect(output).toContain("Discovered 1 local skill");
      expect(output).not.toContain("Discovered 1 local skills");
      expect(output).toMatch(/\d+ global agents? rewritten, \d+ unchanged/);
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
      // Agents declared so the project is a detected installation; local skills come from disk.
      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "e2e-test",
          skills: [],
          agents: buildAgentConfigs(
            [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name],
            { scope: "project" },
          ),
        }),
      );

      await createLocalSkill(projectDir, "web-state-jotai", {
        description: "Valid skill",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-state-jotai"),
          contentHash: "hash-valid",
        }),
      });

      // SKILL.md only, no metadata.yaml.
      await createLocalSkill(projectDir, "web-state-mobx", {
        description: "Missing metadata",
        body: "# No Metadata",
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("missing metadata.yaml");
      expect(output).toContain("Discovered 1 local skill");
      expect(output).not.toContain("Discovered 1 local skills");

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
      expect(stdout, "compile reads the marketplace its config records").not.toContain(
        "--marketplace",
      );
    });
  });

  describe("missing skills directory", () => {
    it("should exit with error when .claude/skills/ directory does not exist", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await mkdir(path.join(projectDir, DIRS.CLAUDE), { recursive: true });
      // Declares a skill, so compile refuses rather than compiling base agents.
      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "empty",
          skills: buildSkillConfigs([E2E_SKILL.react.id], {
            scope: "project",
            origin: EJECT_ORIGIN,
          }),
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
        }),
      );

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

      const preExistingFile = "existing-notes.txt";
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, preExistingFile), "pre-existing content");

      const { exitCode } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      const outputFiles = await listFiles(agentsDir);

      expect(outputFiles).toContain(preExistingFile);

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
        // No skill is assigned, so both skill lists are empty and the one discovered local skill
        // must not be swept in.
        await expect(project).toHaveAgentDynamicSkills(agentName, {
          allPreloaded: true,
          noSkillIds: [MINIMAL_PROJECT_SKILL_ID],
        });

        // The body opens with the provenance marker and a heading, so the file is more than
        // frontmatter.
        const agentContent = await readTestFile(
          path.join(agentsPath(project.dir), `${agentName}.md`),
        );
        expect(agentContent.startsWith("---\n")).toBe(true);
        expect(agentContent).toContain(`\n---\n${provenanceMarker()}\n\n# `);
      }
    });

    it("should produce distinct content for each compiled agent", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const agentsDir = agentsPath(project.dir);

      const { exitCode } = await CLI.run(["compile"], { dir: project.dir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
        contains: ["name: web-developer"],
      });
      await expect(project).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
        contains: ["name: api-developer"],
      });

      // No matcher compares two files, so raw content is compared.
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
      expect(output).toMatch(/\d+ global agents? rewritten, \d+ unchanged/);

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

      // `contains` on the file cannot tell frontmatter from body.
      await expect({ dir: project.dir }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
        name: E2E_AGENT["web-developer"].name,
        exactSkills: [CUSTOM_PROJECT_SKILL_ID],
      });
    });
  });

  describe("stored marketplace resolution", () => {
    let sourceTempDir: string;

    afterEach(async () => {
      if (sourceTempDir) {
        await cleanupTempDir(sourceTempDir);
      }
    });

    it("should compile from the marketplace the installation recorded", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      // Agents declared so the project is a detected installation; the local skill comes from disk.
      const { sourceDir, tempDir: srcTempDir } = await createE2ESource();
      sourceTempDir = srcTempDir;

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "e2e-test",
          skills: [],
          agents: buildAgentConfigs(
            [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name],
            { scope: "project" },
          ),
          marketplace: sourceDir,
        }),
      );

      await createLocalSkill(projectDir, E2E_SKILL.pinia.id, {
        description: "Skill for stored-source verification",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(E2E_SKILL.pinia.id),
          contentHash: "hash-source-stored",
        }),
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skill");
      expect(output).not.toContain("Discovered 1 local skills");
      expect(
        output,
        "the marketplace came from the config the installation recorded — this run's cwd is its home root, so that config is the global one",
      ).toContain("Marketplace: global");
      expect(output).toMatch(/\d+ global agents? rewritten, \d+ unchanged/);

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

    it("should name the marketplace global when compiling at the home root", async () => {
      tempDir = await createTempDir();
      const { sourceDir, tempDir: srcTempDir } = await createE2ESource();
      sourceTempDir = srcTempDir;

      // No project here, so the run reads only the global config.
      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "global-install",
          skills: [],
          agents: buildAgentConfigs(
            [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name],
            { scope: "global" },
          ),
          marketplace: sourceDir,
        }),
      );
      await createLocalSkill(globalHome, E2E_SKILL.pinia.id, {
        description: "Skill for home-root source labelling",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(E2E_SKILL.pinia.id),
          contentHash: "hash-home-root",
        }),
      });

      const { exitCode, output } = await CLI.run(
        ["compile"],
        { dir: globalHome },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output, "the home root compiles the global installation").toContain(
        "Compiling global agents",
      );
      expect(output).toContain("Discovered 1 local skill");
      expect(output).not.toContain("Discovered 1 local skills");
      expect(
        output,
        "the marketplace came from the global config — the home root has no project config to read",
      ).toContain("Marketplace: global");

      await expect({ dir: globalHome }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer"],
        },
      );
    });

    it("should name the config it read at the home root as the global one", async () => {
      tempDir = await createTempDir();
      const { sourceDir, tempDir: srcTempDir } = await createE2ESource();
      sourceTempDir = srcTempDir;

      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "global-install",
          skills: [],
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
          marketplace: sourceDir,
        }),
      );
      await createLocalSkill(globalHome, E2E_SKILL.pinia.id, {
        description: "Skill for home-root config labelling",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(E2E_SKILL.pinia.id),
          contentHash: "hash-home-verbose",
        }),
      });

      const { exitCode, output } = await CLI.run(
        ["compile", "--verbose"],
        { dir: globalHome },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output, "the home root compiles the global installation").toContain(
        "Compiling global agents",
      );
      // Scoped by path: a verbose run also reads the source repository's own config.
      expect(output, "the verbose run names the config it read at the home root").toContain(
        `global config from ${globalHome}`,
      );
      expect(
        output,
        "there is no project config at the home root — the file it read is the global one",
      ).not.toContain(`project config from ${globalHome}`);
    });

    it("should name the marketplace project when the project is not the home root", async () => {
      tempDir = await createTempDir();
      const { sourceDir, tempDir: srcTempDir } = await createE2ESource();
      sourceTempDir = srcTempDir;

      // A home with no installation, so only the project's config is in play.
      const separateHome = path.join(tempDir, "home");
      await mkdir(separateHome, { recursive: true });

      const projectDir = path.join(tempDir, "project");
      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "e2e-test",
          skills: [],
          agents: buildAgentConfigs(
            [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name],
            { scope: "global" },
          ),
          marketplace: sourceDir,
        }),
      );
      await createLocalSkill(projectDir, E2E_SKILL.pinia.id, {
        description: "Skill for project source labelling",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(E2E_SKILL.pinia.id),
          contentHash: "hash-project-root",
        }),
      });

      const { exitCode, output } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: separateHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output, "a project directory compiles the project installation").toContain(
        "Compiling project agents",
      );
      expect(
        output,
        "the marketplace came from the project's own config, whatever scope its entries carry",
      ).toContain("Marketplace: project");

      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer"],
        },
      );
    });
  });

  describe("global installation fallback", () => {
    it("should use global installation paths when no project config exists", async () => {
      tempDir = await createTempDir();

      const globalHome = path.join(tempDir, "global-home");
      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "global-test",
          skills: buildSkillConfigs(["web-testing-cypress-e2e"], {
            scope: "project",
            origin: EJECT_ORIGIN,
          }),
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
        }),
      );

      await createLocalSkill(globalHome, "web-testing-cypress-e2e", {
        description: "Global skill for compile fallback",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-testing-cypress-e2e"),
          contentHash: "hash-global",
        }),
      });

      const projectDir = path.join(tempDir, "project");
      await mkdir(projectDir, { recursive: true });

      // HOME at globalHome, so detection falls back to the global installation.
      const { exitCode, output } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Compiling global agents");

      await expect({ dir: globalHome }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer"],
        },
      );
    });
  });

  /**
   * A global fan-out must seat each registered project's own catalogue, or project-local
   * `usageGuidance` becomes the placeholder and the next project compile writes it back. Arranged
   * inside the `it`: each run mutates what the next reads.
   */
  describe("a global fan-out into a registered project", () => {
    const PROJECT_PASS_ALL_UNCHANGED = `0 project ${STEP_TEXT.AGENTS_REWRITTEN}, 1 ${STEP_TEXT.UNCHANGED}`;

    it(
      "seats that project's own catalogue, so its next compile has nothing to undo",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const globalHome = path.join(tempDir, "home");
        const projectDir = path.join(tempDir, "registered-project");
        for (const dir of [globalHome, projectDir]) {
          await mkdir(dir, { recursive: true });
          await createPermissionsFile(dir);
        }

        const globalSkill = E2E_SKILL.react;
        const projectSkill = E2E_SKILL.vitest;
        const globalAgent = E2E_AGENT["web-developer"];
        const projectAgent = E2E_AGENT["api-developer"];

        await writeProjectConfig(
          globalHome,
          buildProjectConfig({
            name: "fan-out-seat-global",
            skills: buildSkillConfigs([globalSkill.id], { scope: "global", origin: EJECT_ORIGIN }),
            agents: buildAgentConfigs([globalAgent.name], { scope: "global" }),
            stack: { [globalAgent.name]: { "web-framework": [saUnflagged(globalSkill.id)] } },
            projects: [realpathSync(projectDir)],
          }),
        );
        await createLocalSkill(globalHome, globalSkill.id, {
          description: "Global skill inherited by the registered project",
          metadata: renderMetadataYaml({
            ...metadataFieldsFor(globalSkill.id),
            cliDescription: "E2E test skill",
            usageGuidance: "Use when working on the global half of this fixture",
            contentHash: "hash-global",
          }),
        });

        await writeProjectConfig(
          projectDir,
          buildProjectConfig({
            name: "fan-out-seat-project",
            skills: [
              ...buildSkillConfigs([globalSkill.id], { scope: "global", origin: EJECT_ORIGIN }),
              ...buildSkillConfigs([projectSkill.id], { scope: "project", origin: EJECT_ORIGIN }),
            ],
            agents: buildAgentConfigs([projectAgent.name], { scope: "project" }),
            stack: { [projectAgent.name]: { "web-testing": [saUnflagged(projectSkill.id)] } },
          }),
        );
        await createLocalSkill(projectDir, projectSkill.id, {
          description: "Project-owned skill compiled into the project's own agent",
          metadata: renderMetadataYaml({
            ...metadataFieldsFor(projectSkill.id),
            cliDescription: "E2E test skill",
            usageGuidance: PROJECT_SKILL_USAGE,
            contentHash: "hash-project",
          }),
        });

        const projectAgentMd = path.join(agentsPath(projectDir), `${projectAgent.name}.md`);
        const inProject = { dir: projectDir };
        const atHome = { dir: globalHome };
        const asHome = { env: { HOME: globalHome } };

        const firstProjectRun = await CLI.run(["compile"], inProject, asHome);
        expect(
          firstProjectRun.exitCode,
          `first compile in the project failed: ${firstProjectRun.output}`,
        ).toBe(EXIT_CODES.SUCCESS);

        const agentAfterProjectCompile = await readTestFile(projectAgentMd);
        expect(
          agentAfterProjectCompile,
          "the project's own compile must render the skill's stated cue",
        ).toContain(PROJECT_SKILL_USAGE);

        const settledRun = await CLI.run(["compile"], inProject, asHome);
        expect(
          settledRun.exitCode,
          `second compile in the project failed: ${settledRun.output}`,
        ).toBe(EXIT_CODES.SUCCESS);
        expect(
          settledRun.output,
          "a project compile over its own output must rewrite nothing",
        ).toContain(PROJECT_PASS_ALL_UNCHANGED);

        const globalRun = await CLI.run(["compile"], atHome, asHome);
        expect(globalRun.exitCode, `compile at HOME failed: ${globalRun.output}`).toBe(
          EXIT_CODES.SUCCESS,
        );
        expect(globalRun.output, "the fan-out must have reached the registered project").toContain(
          STEP_TEXT.PROPAGATED_RECOMPILE,
        );

        expect(
          await readTestFile(projectAgentMd),
          "the fan-out must not replace a project-local skill's stated cue",
        ).toContain(PROJECT_SKILL_USAGE);
        expect(
          await readTestFile(projectAgentMd),
          "a fan-out that changes no value must not move a byte of the project's compiled agent",
        ).toBe(agentAfterProjectCompile);

        const thirdProjectRun = await CLI.run(["compile"], inProject, asHome);
        expect(
          thirdProjectRun.exitCode,
          `third compile in the project failed: ${thirdProjectRun.output}`,
        ).toBe(EXIT_CODES.SUCCESS);
        expect(
          thirdProjectRun.output,
          "a project compile following a global one must have nothing to undo",
        ).toContain(PROJECT_PASS_ALL_UNCHANGED);
      },
    );
  });
});
