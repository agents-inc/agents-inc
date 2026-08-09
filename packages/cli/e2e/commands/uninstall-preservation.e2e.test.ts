import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  cleanupTempDir,
  ensureBinaryExists,
  directoryExists,
  fileExists,
  readTestFile,
  writeProjectConfig,
  agentsPath,
  skillsPath,
  addForkedFromMetadata,
  writeAgentFile,
  configTsPath,
  getEjectedTemplatePath,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import type { AgentName } from "../../src/cli/types/index.js";

/**
 * Uninstall preservation E2E tests.
 *
 * Tests that `uninstall --yes` removes CLI-managed artifacts — including the
 * .claude-src/ config manifest (config.ts + config-types.ts) — while preserving
 * user-authored content. The manifest is always removed; user content in
 * .claude-src/ (e.g. ejected templates) keeps the directory alive.
 *
 * - Ejected templates preserved while the config manifest is removed
 * - .claude-src/ directory survives when it still holds ejected content
 * - Custom agent source in .claude-src preserved
 * - Only config-tracked agents removed, non-config agents preserved
 * - .claude/ directory preserved when it contains non-CLI content
 */

describe("uninstall preservation behavior", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should preserve ejected templates in .claude-src after uninstall --yes", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    await addForkedFromMetadata(projectDir);

    // Eject templates to .claude-src/agents/_templates/
    const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
    expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    // Verify ejected template exists before uninstall
    const claudeSrcDir = path.join(projectDir, DIRS.CLAUDE_SRC);
    const templatePath = getEjectedTemplatePath(projectDir);
    expect(await fileExists(templatePath)).toBe(true);
    expect(await directoryExists(claudeSrcDir)).toBe(true);

    // Run uninstall --yes
    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // The ejected template (user content) is preserved
    expect(await fileExists(templatePath)).toBe(true);

    // The config manifest is removed even though ejected content is preserved
    expect(await fileExists(configTsPath(projectDir))).toBe(false);

    // Ported from the deleted "should keep .claude-src/ when it still holds
    // ejected content": the directory itself survives its manifest, because only
    // an emptied one is removed.
    expect(await directoryExists(claudeSrcDir)).toBe(true);

    // Compiled artifacts should be removed
    const agentsDir = agentsPath(projectDir);
    expect(await directoryExists(agentsDir)).toBe(false);

    const skillsDir = skillsPath(projectDir);
    expect(await directoryExists(skillsDir)).toBe(false);
  });

  it("should preserve custom agent source in .claude-src/agents after uninstall --yes", async () => {
    const project = await ProjectBuilder.editable({
      skills: ["web-framework-react"],
      agents: ["web-developer"],
      domains: ["web"],
    });
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    await addForkedFromMetadata(projectDir);

    // Create a custom agent source directory in .claude-src/agents/
    const customAgentSrcDir = path.join(projectDir, DIRS.CLAUDE_SRC, "agents", "my-custom-agent");
    await mkdir(customAgentSrcDir, { recursive: true });
    await writeFile(
      path.join(customAgentSrcDir, FILES.METADATA_YAML),
      "id: my-custom-agent\ntitle: My Custom Agent\ndescription: A user-defined agent\ntools:\n  - Read\n",
    );
    await writeFile(
      path.join(customAgentSrcDir, FILES.IDENTITY_MD),
      "# My Custom Agent\n\nThis is a custom agent created by the user.",
    );

    // Create compiled output for the custom agent in .claude/agents/
    await writeAgentFile(projectDir, "my-custom-agent", {
      frontmatter: true,
      body: "# Custom Agent compiled",
    });

    // Add the custom agent to config so uninstall will track it
    await writeProjectConfig(projectDir, {
      name: "test-edit-project",
      skills: [{ id: "web-framework-react", scope: "project", source: "eject" }],
      agents: [
        { name: "web-developer", scope: "project" },
        { name: "my-custom-agent" as AgentName, scope: "project" }, // fabricated E2E test ID
      ],
      selectedDomains: ["web"],
    });

    // Run uninstall --yes
    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // The config manifest is removed, but the user's custom agent SOURCE under
    // .claude-src/agents/ is preserved (uninstall removes only config.ts + config-types.ts).
    expect(await fileExists(configTsPath(projectDir))).toBe(false);
    expect(await directoryExists(customAgentSrcDir)).toBe(true);
    expect(await fileExists(path.join(customAgentSrcDir, FILES.METADATA_YAML))).toBe(true);
    expect(await fileExists(path.join(customAgentSrcDir, FILES.IDENTITY_MD))).toBe(true);

    // Compiled agent artifact in .claude/agents/ should be removed (it was in config)
    expect(await fileExists(path.join(agentsPath(projectDir), "my-custom-agent.md"))).toBe(false);
  });

  it("should remove only config-tracked agents and preserve others", async () => {
    const project = await ProjectBuilder.editable({
      skills: ["web-framework-react"],
      agents: ["web-developer"],
      domains: ["web"],
    });
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    await addForkedFromMetadata(projectDir);

    // Config tracks only web-developer. Create compiled agent files for both
    // a tracked agent AND an extra non-tracked agent.
    await writeAgentFile(projectDir, "web-developer", {
      frontmatter: true,
      body: "# Web Developer Agent",
    });
    await writeAgentFile(projectDir, "extra-agent", {
      frontmatter: true,
      body: "# Extra Agent (not in config)",
    });

    // Verify both exist before uninstall
    const agentsDir = agentsPath(projectDir);
    expect(await fileExists(path.join(agentsDir, "web-developer.md"))).toBe(true);
    expect(await fileExists(path.join(agentsDir, "extra-agent.md"))).toBe(true);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // Config-tracked agent should be removed
    expect(await fileExists(path.join(agentsDir, "web-developer.md"))).toBe(false);

    // Non-config agent should be preserved
    expect(await fileExists(path.join(agentsDir, "extra-agent.md"))).toBe(true);
  });

  it("should preserve .claude directory when it contains non-CLI content", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    await addForkedFromMetadata(projectDir);

    // Add a user-created file to .claude/ that the CLI does not manage
    const claudeDir = path.join(projectDir, DIRS.CLAUDE);
    await writeFile(
      path.join(claudeDir, FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] }, userPreference: "keep-me" }),
    );

    // Verify structure before uninstall
    const skillsDir = skillsPath(projectDir);
    const agentsDir = agentsPath(projectDir);
    expect(await directoryExists(skillsDir)).toBe(true);
    expect(await directoryExists(agentsDir)).toBe(true);
    expect(await fileExists(path.join(claudeDir, FILES.SETTINGS_JSON))).toBe(true);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // .claude/ directory should still exist because it has user content
    expect(await directoryExists(claudeDir)).toBe(true);

    // User content should be preserved
    expect(await fileExists(path.join(claudeDir, FILES.SETTINGS_JSON))).toBe(true);
    const settingsContent = await readTestFile(path.join(claudeDir, FILES.SETTINGS_JSON));
    const settings = JSON.parse(settingsContent);
    expect(settings.userPreference).toBe("keep-me");

    // CLI-managed subdirectories should be removed
    expect(await directoryExists(skillsDir)).toBe(false);
    expect(await directoryExists(agentsDir)).toBe(false);

    // Verify the "Kept .claude/" message appears
    expect(stdout).toContain("Kept .claude/");
  });
});
