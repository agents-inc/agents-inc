import path from "path";
import { writeFile } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  CLI_ROOT,
  createLocalSkill,
  createTempDir,
  directoryExists,
  fileExists,
  getEjectedTemplatePath,
  listFiles,
  readCompiledAgents,
  readTestFile,
  renderMetadataYaml,
  sourceFolderIn,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import {
  MINIMAL_PROJECT_AGENT_NAMES,
  ProjectBuilder,
  metadataFieldsFor,
} from "../fixtures/project-builder.js";
import "../matchers/setup.js";
import { EXIT_CODES, FILES } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

const E2E_FIRST_SKILL = "web-testing-e2e-first";
const E2E_SECOND_SKILL = "web-testing-e2e-second";

const CUSTOM_TEMPLATE_MARKER = "<!-- E2E-CUSTOM-TEMPLATE-MARKER -->";
const CUSTOM_INTRO_MARKER = "E2E-CUSTOM-INTRO-CONTENT";

describe("template ejection + custom compilation", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("eject templates, modify, compile", () => {
    // The built-in template always exists, so the ejected copy's marker reaching every agent IS the
    // precedence claim.
    it("should compile every agent through the ejected template rather than the built-in", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;
      const agentsDir = agentsPath(project.dir);

      const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
      expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      await expect({ dir: projectDir }).toHaveEjectedTemplate();
      const ejectedTemplatePath = getEjectedTemplatePath(projectDir);

      const originalTemplate = await readTestFile(ejectedTemplatePath);
      await writeFile(ejectedTemplatePath, originalTemplate + "\n" + CUSTOM_TEMPLATE_MARKER + "\n");

      const compileResult = await CLI.run(["compile"], { dir: projectDir });
      expect(compileResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      const compiled = await readCompiledAgents(projectDir);
      expect(Object.keys(compiled).sort()).toStrictEqual(
        MINIMAL_PROJECT_AGENT_NAMES.map((name) => `${name}.md`).sort(),
      );
      for (const [file, content] of Object.entries(compiled)) {
        expect(content, `${file} was not rendered through the ejected template`).toContain(
          CUSTOM_TEMPLATE_MARKER,
        );
      }

      await expect({ dir: projectDir }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
      const webDevPath = path.join(agentsDir, `${E2E_AGENT["web-developer"].name}.md`);
      expect(await readTestFile(webDevPath)).toContain("name: web-developer");
    });
  });

  describe("eject agent-partials, modify intro, compile", () => {
    it("should use custom intro in compiled output", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;
      const agentsDir = agentsPath(project.dir);

      const ejectResult = await CLI.run(["eject", "agent-partials"], { dir: projectDir });
      expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      const ejectedAgentsDir = path.join(sourceFolderIn(projectDir), "agents");
      expect(await directoryExists(ejectedAgentsDir)).toBe(true);

      // Eject nests agents as developer/web-developer/, as in src/agents/.
      const webDevIntroPath = path.join(
        ejectedAgentsDir,
        "developer",
        "web-developer",
        FILES.IDENTITY_MD,
      );
      expect(await fileExists(webDevIntroPath)).toBe(true);
      await writeFile(webDevIntroPath, `# Custom Web Developer\n\n${CUSTOM_INTRO_MARKER}\n`);

      const compileResult = await CLI.run(["compile"], { dir: projectDir });
      expect(compileResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      const outputFiles = await listFiles(agentsDir);
      expect(outputFiles).toContain(`${E2E_AGENT["web-developer"].name}.md`);

      const contents = await Promise.all(
        outputFiles.map((file) => readTestFile(path.join(agentsDir, file))),
      );
      expect(contents.some((content) => content.includes(CUSTOM_INTRO_MARKER))).toBe(true);
    });
  });

  describe("eject templates with multiple skills", () => {
    it("should produce all agents with custom template when project has multiple skills", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "multi-skill-test",
          skills: buildSkillConfigs([E2E_FIRST_SKILL, E2E_SECOND_SKILL], {
            scope: "project",
            origin: "eject",
          }),
          agents: buildAgentConfigs(
            [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name],
            { scope: "project" },
          ),
        }),
      );

      await createLocalSkill(projectDir, E2E_FIRST_SKILL, {
        description: "First test skill",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(E2E_FIRST_SKILL),
          contentHash: "hash-first",
        }),
      });
      await createLocalSkill(projectDir, E2E_SECOND_SKILL, {
        description: "Second test skill",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor(E2E_SECOND_SKILL),
          contentHash: "hash-second",
        }),
      });

      const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
      expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      const ejectedTemplatePath = getEjectedTemplatePath(projectDir);
      const originalTemplate = await readTestFile(ejectedTemplatePath);
      await writeFile(ejectedTemplatePath, originalTemplate + "\n" + CUSTOM_TEMPLATE_MARKER + "\n");

      const compileResult = await CLI.run(["compile"], { dir: projectDir });
      expect(compileResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      const compiled = await readCompiledAgents(projectDir);
      expect(Object.keys(compiled).sort()).toStrictEqual(
        [`${E2E_AGENT["web-developer"].name}.md`, `${E2E_AGENT["api-developer"].name}.md`].sort(),
      );

      for (const [file, content] of Object.entries(compiled)) {
        expect(content, `${file} was not rendered through the ejected template`).toContain(
          CUSTOM_TEMPLATE_MARKER,
        );
        expect(content).toMatch(/^---\n/);
        expect(content).toContain("description:");
      }
    });
  });

  describe("edge cases", () => {
    // BUG: compile reports per-agent template errors as warnings and exits 0.
    it.fails("should fail gracefully when ejected template has broken Liquid syntax", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
      expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      const ejectedTemplatePath = getEjectedTemplatePath(projectDir);
      await writeFile(ejectedTemplatePath, "{% if agent.name %}{{ agent.name }{% endfor %}");

      const compileResult = await CLI.run(["compile"], { dir: projectDir });
      expect(compileResult.exitCode).not.toBe(EXIT_CODES.SUCCESS);
    });

    it("should verify ejected template path matches Liquid engine resolution path", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
      expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      // The path createLiquidEngine() resolves.
      await expect({ dir: projectDir }).toHaveEjectedTemplate();

      // Eject copies byte-for-byte; compare the whole file, since a substring check missed real drift.
      const sourceTemplatePath = path.join(CLI_ROOT, "src", "agents", "_templates", "agent.liquid");
      const expectedPath = getEjectedTemplatePath(projectDir);
      const [ejectedContent, sourceContent] = await Promise.all([
        readTestFile(expectedPath),
        readTestFile(sourceTemplatePath),
      ]);
      expect(ejectedContent).toStrictEqual(sourceContent);
    });
  });
});
