import path from "path";
import { writeFile } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  createTempDir,
  directoryExists,
  getEjectedTemplatePath,
  listFiles,
  readTestFile,
  sourceFolderIn,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import "../matchers/setup.js";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";

/** A named member, so an assertion can tell the right ejected tree from any tree. */
const EJECTED_PARTIAL_CATEGORY = "developer";
const EJECTED_PARTIAL_AGENT = "web-developer";

describe("eject command integration", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it("ejected template path matches Liquid engine resolution", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "templates"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);

    // The path createLiquidEngine() checks.
    await expect({ dir: tempDir }).toHaveEjectedTemplate();

    const templatePath = getEjectedTemplatePath(tempDir);
    const content = await readTestFile(templatePath);
    expect(content).toContain("{{ agent.name }}");
    expect(content).toMatch(/\{\{|\{%/);
  });

  it("ejected agent-partials structure matches readAgentFiles expectations", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(["eject", "agent-partials"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // The path loadProjectAgents() scans.
    const agentsDir = path.join(sourceFolderIn(tempDir), "agents");
    expect(await directoryExists(agentsDir)).toBe(true);

    expect(await listFiles(agentsDir)).toContain(EJECTED_PARTIAL_CATEGORY);
    const partialDir = path.join(agentsDir, EJECTED_PARTIAL_CATEGORY, EJECTED_PARTIAL_AGENT);
    const partialFiles = await listFiles(partialDir);
    expect(partialFiles).toContain(FILES.IDENTITY_MD);
    expect(partialFiles).toContain(FILES.PLAYBOOK_MD);
    expect(partialFiles).toContain(FILES.METADATA_YAML);

    const identity = await readTestFile(path.join(partialDir, FILES.IDENTITY_MD));
    expect(identity).toMatch(/\w+ \w+/);

    const playbook = await readTestFile(path.join(partialDir, FILES.PLAYBOOK_MD));
    expect(playbook).toContain("##");
  });

  it("eject templates -> modify -> compile picks up modified template", async () => {
    const project = await ProjectBuilder.minimal();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    const agentsDir = agentsPath(project.dir);

    const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
    expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    await expect({ dir: projectDir }).toHaveEjectedTemplate();
    const templatePath = getEjectedTemplatePath(projectDir);

    const originalTemplate = await readTestFile(templatePath);
    const marker = "<!-- E2E-EJECT-INTEGRATION-MARKER -->";
    const modifiedTemplate = originalTemplate + "\n" + marker + "\n";
    await writeFile(templatePath, modifiedTemplate);

    const compileResult = await CLI.run(["compile"], { dir: projectDir });
    expect(compileResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    expect(await directoryExists(agentsDir)).toBe(true);
    const agentFiles = await listFiles(agentsDir);
    const mdFiles = agentFiles.filter((f) => f.endsWith(".md"));
    expect(mdFiles).toContain("web-developer.md");

    for (const mdFile of mdFiles) {
      const agentContent = await readTestFile(path.join(agentsDir, mdFile));
      expect(agentContent).toContain(marker);
    }
  });

  it("eject without --force preserves existing customizations", async () => {
    tempDir = await createTempDir();

    const firstResult = await CLI.run(["eject", "templates"], { dir: tempDir });
    expect(firstResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    const templatePath = getEjectedTemplatePath(tempDir);
    const customContent = "CUSTOM-USER-TEMPLATE-CONTENT-PRESERVED";
    await writeFile(templatePath, customContent);

    const secondResult = await CLI.run(["eject", "templates"], { dir: tempDir });
    expect(secondResult.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(secondResult.output).toContain("already exist");

    const afterContent = await readTestFile(templatePath);
    expect(afterContent).toBe(customContent);
  });

  it("eject with --force overwrites existing customizations", async () => {
    tempDir = await createTempDir();

    const firstResult = await CLI.run(["eject", "templates"], { dir: tempDir });
    expect(firstResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    const templatePath = getEjectedTemplatePath(tempDir);
    const builtInContent = await readTestFile(templatePath);

    const customContent = "CUSTOM-USER-TEMPLATE-WILL-BE-OVERWRITTEN";
    await writeFile(templatePath, customContent);

    expect(await readTestFile(templatePath)).toBe(customContent);

    const forceResult = await CLI.run(["eject", "templates", "--force"], { dir: tempDir });
    expect(forceResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    const afterForce = await readTestFile(templatePath);
    expect(afterForce).not.toContain(customContent);
    expect(afterForce).toBe(builtInContent);
  });
});
