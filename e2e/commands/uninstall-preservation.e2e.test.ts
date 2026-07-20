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
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import type { AgentName } from "../../src/cli/types/index.js";

/**
 * Uninstall preservation E2E tests.
 *
 * Tests that `uninstall --yes` preserves user-authored content while removing
 * CLI-managed artifacts, and that `uninstall --all --yes` removes everything
 * including .claude-src/.
 *
 * Gap 10 from e2e-test-gaps.md:
 * - 10a: Ejected templates preserved by --yes, removed by --all
 * - 10b: --all removes .claude-src entirely including ejected content
 * - 10c: Custom agent source in .claude-src preserved by --yes
 * - 10d: Only config-tracked agents removed, non-config agents preserved
 * - 10e: .claude/ directory preserved when it contains non-CLI content
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
    const templatePath = path.join(
      projectDir,
      DIRS.CLAUDE_SRC,
      "agents",
      "_templates",
      "agent.liquid",
    );
    expect(await fileExists(templatePath)).toBe(true);

    // Run uninstall --yes (without --all)
    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // .claude-src/ (including ejected templates) should be preserved
    expect(await fileExists(templatePath)).toBe(true);

    // Compiled artifacts should be removed
    const agentsDir = agentsPath(projectDir);
    expect(await directoryExists(agentsDir)).toBe(false);

    const skillsDir = skillsPath(projectDir);
    expect(await directoryExists(skillsDir)).toBe(false);
  });

  it("should remove .claude-src entirely with --all including ejected content", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    await addForkedFromMetadata(projectDir);

    // Eject templates
    const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
    expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    const claudeSrcDir = path.join(projectDir, DIRS.CLAUDE_SRC);
    expect(await directoryExists(claudeSrcDir)).toBe(true);

    // Run uninstall --all --yes
    const { exitCode, stdout } = await CLI.run(["uninstall", "--all", "--yes"], {
      dir: projectDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // .claude-src/ should be removed entirely
    expect(await directoryExists(claudeSrcDir)).toBe(false);
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
      domains: ["web"],
    });

    // Run uninstall --yes
    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // Custom agent SOURCE in .claude-src/ should be preserved (--yes does not touch .claude-src/)
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
