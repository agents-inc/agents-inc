import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  addForkedFromMetadata,
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  fileExists,
  getEjectedTemplatePath,
  readTestFile,
  renderAgentYaml,
  skillsPath,
  sourceFolderIn,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EXIT_CODES, DIRS, FILES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";
import type { AgentName } from "../../src/cli/types/index.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * `uninstall --yes` removes CLI-managed artifacts and the config manifest while preserving user
 * content; ejected content keeps `.agents-inc/claude/` alive.
 */

describe("uninstall preservation behavior", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should preserve ejected templates in .agents-inc/claude after uninstall --yes", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    await addForkedFromMetadata(projectDir, E2E_SKILL.react.id);

    const ejectResult = await CLI.run(["eject", "templates"], { dir: projectDir });
    expect(ejectResult.exitCode).toBe(EXIT_CODES.SUCCESS);

    const sourceFolder = sourceFolderIn(projectDir);
    const templatePath = getEjectedTemplatePath(projectDir);
    expect(await fileExists(templatePath)).toBe(true);
    expect(await directoryExists(sourceFolder)).toBe(true);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(templatePath)).toBe(true);

    expect(await fileExists(configTsPath(projectDir))).toBe(false);

    // Only an emptied directory is removed.
    expect(await directoryExists(sourceFolder)).toBe(true);

    const agentsDir = agentsPath(projectDir);
    expect(await directoryExists(agentsDir)).toBe(false);

    const skillsDir = skillsPath(projectDir);
    expect(await directoryExists(skillsDir)).toBe(false);
  });

  it("should preserve custom agent source in .agents-inc/claude/agents after uninstall --yes", async () => {
    const project = await ProjectBuilder.editable({
      skills: [E2E_SKILL.react.id],
      agents: ["web-developer"],
      domains: ["web"],
    });
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    await addForkedFromMetadata(projectDir, E2E_SKILL.react.id);

    const customAgentSrcDir = path.join(sourceFolderIn(projectDir), "agents", "my-custom-agent");
    await mkdir(customAgentSrcDir, { recursive: true });
    await writeFile(
      path.join(customAgentSrcDir, FILES.METADATA_YAML),
      renderAgentYaml("my-custom-agent", "A user-defined agent", {
        title: "My Custom Agent",
        tools: ["Read"],
      }),
    );
    await writeFile(
      path.join(customAgentSrcDir, FILES.IDENTITY_MD),
      "# My Custom Agent\n\nThis is a custom agent created by the user.",
    );

    await writeAgentFile(projectDir, "my-custom-agent", {
      frontmatter: true,
      body: "# Custom Agent compiled",
    });

    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "test-edit-project",
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs(
          [
            "web-developer",
            // A user-defined agent outside the generated roster; the fixture config type widens
            // skill ids but not agent names.
            "my-custom-agent" as AgentName,
          ],
          { scope: "project" },
        ),
        selectedDomains: ["web"],
      }),
    );

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // Uninstall removes only config.ts and config-types.ts, so the custom agent source stays.
    expect(await fileExists(configTsPath(projectDir))).toBe(false);
    expect(await directoryExists(customAgentSrcDir)).toBe(true);
    expect(await fileExists(path.join(customAgentSrcDir, FILES.METADATA_YAML))).toBe(true);
    expect(await fileExists(path.join(customAgentSrcDir, FILES.IDENTITY_MD))).toBe(true);

    expect(await fileExists(path.join(agentsPath(projectDir), "my-custom-agent.md"))).toBe(false);
  });

  it("should remove only config-tracked agents and preserve others", async () => {
    const project = await ProjectBuilder.editable({
      skills: [E2E_SKILL.react.id],
      agents: ["web-developer"],
      domains: ["web"],
    });
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    await addForkedFromMetadata(projectDir, E2E_SKILL.react.id);

    await writeAgentFile(projectDir, "web-developer", {
      frontmatter: true,
      body: "# Web Developer Agent",
    });
    await writeAgentFile(projectDir, "extra-agent", {
      frontmatter: true,
      body: "# Extra Agent (not in config)",
    });

    const agentsDir = agentsPath(projectDir);
    expect(await fileExists(path.join(agentsDir, "web-developer.md"))).toBe(true);
    expect(await fileExists(path.join(agentsDir, "extra-agent.md"))).toBe(true);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(path.join(agentsDir, "web-developer.md"))).toBe(false);

    expect(await fileExists(path.join(agentsDir, "extra-agent.md"))).toBe(true);
  });

  it("should preserve .claude directory when it contains non-CLI content", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;
    await addForkedFromMetadata(projectDir, E2E_SKILL.react.id);

    const claudeDir = path.join(projectDir, DIRS.CLAUDE);
    await writeFile(
      path.join(claudeDir, FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] }, userPreference: "keep-me" }),
    );

    const skillsDir = skillsPath(projectDir);
    const agentsDir = agentsPath(projectDir);
    expect(await directoryExists(skillsDir)).toBe(true);
    expect(await directoryExists(agentsDir)).toBe(true);
    expect(await fileExists(path.join(claudeDir, FILES.SETTINGS_JSON))).toBe(true);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await directoryExists(claudeDir)).toBe(true);

    expect(await fileExists(path.join(claudeDir, FILES.SETTINGS_JSON))).toBe(true);
    const settingsContent = await readTestFile(path.join(claudeDir, FILES.SETTINGS_JSON));
    const settings = JSON.parse(settingsContent);
    expect(settings.userPreference).toBe("keep-me");

    expect(await directoryExists(skillsDir)).toBe(false);
    expect(await directoryExists(agentsDir)).toBe(false);

    expect(stdout).toContain("Kept .claude/");
  });
});
