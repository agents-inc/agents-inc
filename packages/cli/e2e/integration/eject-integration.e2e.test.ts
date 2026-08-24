import path from "path";
import { writeFile } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  agentsPath,
  createTempDir,
  cleanupTempDir,
  directoryExists,
  getEjectedTemplatePath,
  listFiles,
  readTestFile,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";

/**
 * Eject command integration tests.
 *
 * These tests verify that ejected content integrates correctly with the
 * compilation pipeline. The existing eject.e2e.test.ts tests verify that
 * eject creates files; these tests verify the files are *usable*.
 *
 * Gap 7 from e2e-test-gaps.md: Eject Integration
 */

/**
 * The one ejected agent partial these specs read. `eject agent-partials` writes
 * the CLI's bundled `src/agents/<category>/<agent>/` tree verbatim, so naming a
 * member is the only way an assertion can tell the right tree from any tree —
 * the same pair `commands/eject.e2e.test.ts` pins.
 */
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

    // Eject templates to the default location
    const { exitCode, stdout } = await CLI.run(["eject", "templates"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);

    // The exact path createLiquidEngine() checks at compiler.ts:414
    await expect({ dir: tempDir }).toHaveEjectedTemplate();

    // Verify the file contains valid Liquid template syntax
    const templatePath = getEjectedTemplatePath(tempDir);
    const content = await readTestFile(templatePath);
    expect(content).toContain("{{ agent.name }}");
    expect(content).toMatch(/\{\{|\{%/);
  });

  it("ejected agent-partials structure matches readAgentFiles expectations", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(["eject", "agent-partials"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // The path loadProjectAgents() scans: .claude-src/agents/
    const agentsDir = path.join(tempDir, DIRS.CLAUDE_SRC, "agents");
    expect(await directoryExists(agentsDir)).toBe(true);

    // The named partial, not a search for any directory that happens to hold the
    // three files. The scan this replaced walked every category, took the first
    // complete agent it found, and asserted about that one — so it could not say
    // WHICH agent was ejected, and passed while `web-developer` was missing.
    expect(await listFiles(agentsDir)).toContain(EJECTED_PARTIAL_CATEGORY);
    const partialDir = path.join(agentsDir, EJECTED_PARTIAL_CATEGORY, EJECTED_PARTIAL_AGENT);
    const partialFiles = await listFiles(partialDir);
    expect(partialFiles).toContain(FILES.IDENTITY_MD);
    expect(partialFiles).toContain(FILES.PLAYBOOK_MD);
    expect(partialFiles).toContain(FILES.METADATA_YAML);

    // Verify the files contain meaningful prose content (readAgentFiles expects content)
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

    // Step 1: Eject templates
    const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
    expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    // Step 2: Modify agent.liquid with a unique marker
    await expect({ dir: projectDir }).toHaveEjectedTemplate();
    const templatePath = getEjectedTemplatePath(projectDir);

    const originalTemplate = await readTestFile(templatePath);
    const marker = "<!-- E2E-EJECT-INTEGRATION-MARKER -->";
    const modifiedTemplate = originalTemplate + "\n" + marker + "\n";
    await writeFile(templatePath, modifiedTemplate);

    // Step 3: Compile
    const compileResult = await CLI.run(["compile"], { dir: projectDir });
    expect(compileResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    // Step 4: Verify compiled agents contain the marker
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

    // First eject
    const firstResult = await CLI.run(["eject", "templates"], { dir: tempDir });
    expect(firstResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    // Modify the template with custom content
    const templatePath = getEjectedTemplatePath(tempDir);
    const customContent = "CUSTOM-USER-TEMPLATE-CONTENT-PRESERVED";
    await writeFile(templatePath, customContent);

    // Second eject WITHOUT --force
    const secondResult = await CLI.run(["eject", "templates"], { dir: tempDir });
    expect(secondResult.exitCode).toBe(EXIT_CODES.SUCCESS);
    // Should warn about existing templates
    expect(secondResult.output).toContain("already exist");

    // Custom content should be preserved (not overwritten)
    const afterContent = await readTestFile(templatePath);
    expect(afterContent).toBe(customContent);
  });

  it("eject with --force overwrites existing customizations", async () => {
    tempDir = await createTempDir();

    // First eject — get the original built-in content
    const firstResult = await CLI.run(["eject", "templates"], { dir: tempDir });
    expect(firstResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    const templatePath = getEjectedTemplatePath(tempDir);
    const builtInContent = await readTestFile(templatePath);

    // Modify with custom content
    const customContent = "CUSTOM-USER-TEMPLATE-WILL-BE-OVERWRITTEN";
    await writeFile(templatePath, customContent);

    // Verify the custom content is there
    expect(await readTestFile(templatePath)).toBe(customContent);

    // Second eject WITH --force
    const forceResult = await CLI.run(["eject", "templates", "--force"], { dir: tempDir });
    expect(forceResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    // Custom content should be overwritten with built-in content
    const afterForce = await readTestFile(templatePath);
    expect(afterForce).not.toContain(customContent);
    expect(afterForce).toBe(builtInContent);
  });
});
