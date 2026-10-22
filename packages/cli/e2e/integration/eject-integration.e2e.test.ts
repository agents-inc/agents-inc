import path from "path";
import { writeFile } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  createTempDir,
  directoryExists,
  getEjectedTemplatePath,
  listFiles,
  readCompiledAgents,
  readTestFile,
} from "../helpers/test-utils.js";
import { MINIMAL_PROJECT_AGENT_NAMES, ProjectBuilder } from "../fixtures/project-builder.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";

describe("eject command integration", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  // eject-compile's custom-intro spec pins that compile reads the ejected partials; this pins what
  // eject writes into them.
  it("recompiling through freshly ejected agent partials leaves every compiled agent unchanged", async () => {
    const project = await ProjectBuilder.minimal();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;

    const builtInCompile = await CLI.run(["compile"], { dir: projectDir });
    expect(builtInCompile.exitCode, builtInCompile.output).toBe(EXIT_CODES.SUCCESS);
    const throughBuiltIn = await readCompiledAgents(projectDir);
    expect(Object.keys(throughBuiltIn).sort()).toStrictEqual(
      MINIMAL_PROJECT_AGENT_NAMES.map((name) => `${name}.md`).sort(),
    );
    const configBefore = await readTestFile(configTsPath(projectDir));

    const ejectResult = await CLI.run(["eject", "agent-partials"], { dir: projectDir });
    expect(ejectResult.exitCode, ejectResult.output).toBe(EXIT_CODES.SUCCESS);
    expect(ejectResult.output).toContain(STEP_TEXT.EJECT_SUCCESS);

    const ejectedCompile = await CLI.run(["compile"], { dir: projectDir });
    expect(ejectedCompile.exitCode, ejectedCompile.output).toBe(EXIT_CODES.SUCCESS);
    expect(await readCompiledAgents(projectDir)).toStrictEqual(throughBuiltIn);
    expect(
      await readTestFile(configTsPath(projectDir)),
      "ejecting agent partials must leave config.ts byte-identical",
    ).toBe(configBefore);
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
