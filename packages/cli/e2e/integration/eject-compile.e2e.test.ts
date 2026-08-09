import path from "path";
import { writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  agentsPath,
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  directoryExists,
  getEjectedTemplatePath,
  listFiles,
  readCompiledAgents,
  readTestFile,
  renderMetadataYaml,
  writeProjectConfig,
  createLocalSkill,
} from "../helpers/test-utils.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { MINIMAL_PROJECT_AGENT_NAMES, ProjectBuilder } from "../fixtures/project-builder.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES } from "../pages/constants.js";
import type { SkillId } from "../../src/cli/types/index.js";
import { CLI } from "../fixtures/cli.js";

const E2E_FIRST_SKILL = "web-testing-e2e-first" as SkillId;
const E2E_SECOND_SKILL = "web-testing-e2e-second" as SkillId;

const CUSTOM_TEMPLATE_MARKER = "<!-- E2E-CUSTOM-TEMPLATE-MARKER -->";
const CUSTOM_INTRO_MARKER = "E2E-CUSTOM-INTRO-CONTENT";

describe("template ejection + custom compilation", () => {
  let tempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("eject templates, modify, compile", () => {
    // One run for what three `it`s each did in full: eject templates onto
    // `ProjectBuilder.minimal()`, append a marker, compile, and look for the marker.
    // "uses the custom template", "applies it to ALL agents" and "prefers the
    // project-local template over the built-in" are three readings of the same
    // observation — the built-in template always exists, so a marker that only the
    // ejected copy carries reaching the output IS the precedence claim.
    it("should compile every agent through the ejected template rather than the built-in", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;
      const agentsDir = agentsPath(project.dir);

      // Step 1: Eject templates
      const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
      expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Step 2: Verify ejected template exists at the expected path
      await expect({ dir: projectDir }).toHaveEjectedTemplate();
      const ejectedTemplatePath = getEjectedTemplatePath(projectDir);

      // Step 3: Modify the ejected template by appending a unique marker
      const originalTemplate = await readTestFile(ejectedTemplatePath);
      await writeFile(ejectedTemplatePath, originalTemplate + "\n" + CUSTOM_TEMPLATE_MARKER + "\n");

      // Step 4: Compile
      const compileResult = await CLI.run(["compile"], { dir: projectDir });
      expect(compileResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Step 5: EVERY agent the fixture declares went through the custom template.
      // The roster is pinned rather than counted — `length >= 2` passed for a run
      // that wrote two of two, and for one that wrote two of three.
      const compiled = await readCompiledAgents(projectDir);
      expect(Object.keys(compiled).sort()).toStrictEqual(
        MINIMAL_PROJECT_AGENT_NAMES.map((name) => `${name}.md`).sort(),
      );
      for (const [file, content] of Object.entries(compiled)) {
        expect(content, `${file} was not rendered through the ejected template`).toContain(
          CUSTOM_TEMPLATE_MARKER,
        );
      }

      // The template swap did not cost the agents their frontmatter.
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

      // Step 1: Eject agent-partials
      const ejectResult = await CLI.run(["eject", "agent-partials"], { dir: projectDir });
      expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Step 2: Verify ejected agent partials exist
      const ejectedAgentsDir = path.join(projectDir, DIRS.CLAUDE_SRC, "agents");
      expect(await directoryExists(ejectedAgentsDir)).toBe(true);

      // Step 3: Modify web-developer's identity.md at its deterministic ejected
      // path — eject copies from PROJECT_ROOT/src/agents/, which nests agents
      // as developer/web-developer/.
      const webDevIntroPath = path.join(
        ejectedAgentsDir,
        "developer",
        "web-developer",
        FILES.IDENTITY_MD,
      );
      expect(await fileExists(webDevIntroPath)).toBe(true);
      await writeFile(webDevIntroPath, `# Custom Web Developer\n\n${CUSTOM_INTRO_MARKER}\n`);

      // Step 4: Compile — the ejected agent-partials should take precedence
      // because loadProjectAgents() reads .claude-src/agents/ and overrides built-in agents
      const compileResult = await CLI.run(["compile"], { dir: projectDir });
      expect(compileResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Step 5: Check if any compiled agent contains the custom intro
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

      // Create project with multiple skills and agents
      await writeProjectConfig(projectDir, {
        name: "multi-skill-test",
        skills: [
          { id: E2E_FIRST_SKILL, scope: "project", source: "eject" },
          { id: E2E_SECOND_SKILL, scope: "project", source: "eject" },
        ],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "project" },
          { name: E2E_AGENT["api-developer"].name, scope: "project" },
        ],
      });

      await createLocalSkill(projectDir, E2E_FIRST_SKILL, {
        description: "First test skill",
        metadata: renderMetadataYaml({ contentHash: "hash-first" }),
      });
      await createLocalSkill(projectDir, E2E_SECOND_SKILL, {
        description: "Second test skill",
        metadata: renderMetadataYaml({ contentHash: "hash-second" }),
      });

      // Eject templates
      const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
      expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Modify template
      const ejectedTemplatePath = getEjectedTemplatePath(projectDir);
      const originalTemplate = await readTestFile(ejectedTemplatePath);
      await writeFile(ejectedTemplatePath, originalTemplate + "\n" + CUSTOM_TEMPLATE_MARKER + "\n");

      // Compile
      const compileResult = await CLI.run(["compile"], { dir: projectDir });
      expect(compileResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify ALL compiled agents contain the marker. The roster is the two the
      // config declares, named — a count floor passed for a run that wrote one of
      // them twice under different names.
      const compiled = await readCompiledAgents(projectDir);
      expect(Object.keys(compiled).sort()).toStrictEqual(
        [`${E2E_AGENT["web-developer"].name}.md`, `${E2E_AGENT["api-developer"].name}.md`].sort(),
      );

      for (const [file, content] of Object.entries(compiled)) {
        expect(content, `${file} was not rendered through the ejected template`).toContain(
          CUSTOM_TEMPLATE_MARKER,
        );
        // Also verify the agents still have valid frontmatter
        expect(content).toMatch(/^---\n/);
        expect(content).toContain("description:");
      }
    });
  });

  describe("edge cases", () => {
    // BUG: Compile exits 0 even when the custom template has broken Liquid syntax.
    // The compile pipeline catches per-agent errors and continues, reporting them
    // as warnings rather than failing the command. This means broken templates
    // silently produce incomplete or missing agent output.
    it.fails("should fail gracefully when ejected template has broken Liquid syntax", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Eject templates
      const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
      expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Replace template with broken Liquid syntax (mismatched if/endfor)
      const ejectedTemplatePath = getEjectedTemplatePath(projectDir);
      await writeFile(ejectedTemplatePath, "{% if agent.name %}{{ agent.name }{% endfor %}");

      // Compile should fail with a useful error, but currently exits 0
      const compileResult = await CLI.run(["compile"], { dir: projectDir });
      expect(compileResult.exitCode).not.toBe(EXIT_CODES.SUCCESS);
    });

    it("should verify ejected template path matches Liquid engine resolution path", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Eject templates
      const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
      expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify the file exists at the exact path createLiquidEngine() checks:
      // .claude-src/agents/_templates/agent.liquid
      await expect({ dir: projectDir }).toHaveEjectedTemplate();

      // Read the template to verify it's valid Liquid content
      const expectedPath = getEjectedTemplatePath(projectDir);
      const content = await readTestFile(expectedPath);
      expect(content).toContain("{{ agent.name }}");
      expect(content).toContain("{{ agent.description }}");
    });
  });
});
