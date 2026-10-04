import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import { expectCleanUninstall } from "../assertions/uninstall-assertions.js";
import {
  addForkedFromMetadata,
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  directoryExists,
  fileExists,
  readTestFile,
  renderMetadataYaml,
  skillsPath,
  sourceFolderIn,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { metadataFieldsFor, ProjectBuilder } from "../fixtures/project-builder.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { CLI } from "../fixtures/cli.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import "../matchers/setup.js";

describe("uninstall command", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should display help text with --help flag", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["uninstall", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Remove");
    expect(stdout).toContain("--yes");
    // The --all flag was removed; the config manifest is now always uninstalled
    expect(stdout).not.toContain("--all");
    // The description qualifies WHICH skills it removes — "matched by source" is the one
    // place this command's help names the thing an installation reads from.
    expect(
      stdout,
      "the description names the marketplace its matching is against, not a source",
    ).not.toMatch(/\bsources?\b/i);
  });

  it("should warn when no installation is found", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["uninstall", "--yes"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOTHING_TO_UNINSTALL);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOT_INSTALLED);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NO_CHANGES_MADE);
    // The discriminating negative: the same three lines would be printed by a run
    // that had deleted everything and then reported an empty directory.
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_SUCCESS);
  });

  // One scenario, one run. Four `it`s previously built the same
  // `ProjectBuilder.editable()` + `addForkedFromMetadata` fixture, ran the same
  // `uninstall --yes`, and each ended in `expectCleanUninstall`; every pre-check
  // and every unique output assertion from those four is folded in here.
  it("should remove skills, agents and the config manifest with --yes", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;

    await addForkedFromMetadata(projectDir, E2E_SKILL.react.id);

    // Overwrite config with source field so skills match
    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "test-edit-project",
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
        selectedDomains: ["web"],
      }),
    );

    // Every directory the run must remove is there beforehand — otherwise the
    // post-conditions below are satisfied by a run that removed nothing.
    const configDir = sourceFolderIn(projectDir);
    expect(await directoryExists(skillsPath(projectDir))).toBe(true);
    expect(await directoryExists(agentsPath(projectDir))).toBe(true);
    expect(await directoryExists(configDir)).toBe(true);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
    // The plan names the agents directory as the CLI's to delete.
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_CLI_COMPILED);

    // Skills, agents, and the config manifest should all be removed by default
    await expectCleanUninstall(projectDir, { removeConfig: true });

    // Config directory removed (config.ts was the only .agents-inc/claude content)
    expect(await directoryExists(configDir)).toBe(false);
  });

  it("should preserve agents not listed in config", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;

    // ProjectBuilder.editable() generates config with agents: ["web-developer"]
    // Add an extra agent file NOT in the config
    await writeAgentFile(projectDir, "my-custom-agent", { body: "# Custom Agent" });

    const { exitCode } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Custom agent should be preserved (not in config.agents)
    const agentsDir = agentsPath(projectDir);
    expect(await fileExists(path.join(agentsDir, "my-custom-agent.md"))).toBe(true);

    // CLI-managed agent (web-developer) should be removed
    expect(await fileExists(path.join(agentsDir, `${E2E_AGENT["web-developer"].name}.md`))).toBe(
      false,
    );
  });

  it("should skip user-created skills without forkedFrom metadata", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;

    // Create a user-created skill with no forkedFrom metadata
    await createLocalSkill(projectDir, "my-custom-skill", {
      description: "User created",
      body: "# My Custom Skill",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("my-custom-skill"),
        author: "@user",
        contentHash: "user-hash",
      }),
    });

    await addForkedFromMetadata(projectDir, E2E_SKILL.react.id);

    const { exitCode, output } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // User-created skill should be skipped
    expect(output).toContain("Skipping");
    expect(output).toContain("my-custom-skill");

    // User skill should still exist, CLI-managed skill should be removed
    await expectCleanUninstall(projectDir, {
      preservedSkills: ["my-custom-skill"],
    });
  });

  it("should skip all skills when only user-created skills exist", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    // No `forkedFrom` in its metadata, so nothing marks it as this CLI's.
    const userSkillDir = await createLocalSkill(projectDir, "my-custom-skill", {
      description: "User created",
      body: "# My Custom Skill",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor("my-custom-skill"),
        author: "@user",
        contentHash: "user-hash",
      }),
    });

    const { exitCode, output } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("Skipping");
    expect(output).toContain("my-custom-skill");
    expect(await directoryExists(userSkillDir)).toBe(true);
  });

  it("should print removal list before proceeding with --yes", async () => {
    const project = await ProjectBuilder.editable();
    tempDir = path.dirname(project.dir);
    const projectDir = project.dir;

    await addForkedFromMetadata(projectDir, E2E_SKILL.react.id);

    const { exitCode, stdout } = await CLI.run(["uninstall", "--yes"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // --yes should print what will be removed (without interactive prompt)
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_PREVIEW_HEADING);
    expect(stdout).toContain("CLI-managed files:");
    // The plan lists the config manifest that is now always removed. A literal, not the
    // constant the product builds the line from: text the CLI renders, and an assertion that
    // imported that constant would move with it and could never fail.
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_CONFIG_SECTION);
    expect(stdout).toContain(".agents-inc/claude/config.ts");
  });

  it("should report nothing to uninstall for empty directory with HOME override", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const emptyDir = path.join(tempDir, "empty-project");
    await mkdir(globalHome, { recursive: true });
    await mkdir(emptyDir, { recursive: true });

    // Global home has config but no skills/agents
    await writeProjectConfig(
      globalHome,
      buildProjectConfig({ name: "global-test", skills: [], agents: [] }),
    );

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: emptyDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // No local skills or agents in the empty project dir
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOTHING_TO_UNINSTALL);
  });

  /**
   * A compiled-agents directory nobody can identify is not a removal: `removeMatchingAgents`
   * matches on-disk basenames against `config.agents`, so with no config to read the run leaves
   * every file exactly where it is. With those agents the only thing installed, the plan is left
   * with no removal to carry — and the heading it would be printed under, along with the success
   * line at the end, each report a removal this run never makes.
   *
   * HOME is kept distinct from the project dir, otherwise the command resolves this as the global
   * install and takes the other branch entirely.
   */
  it("should report nothing to uninstall when unidentifiable agents are all that is installed", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });
    await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, { frontmatter: true });

    const agentFile = path.join(agentsPath(projectDir), `${E2E_AGENT["web-developer"].name}.md`);
    const agentBefore = await readTestFile(agentFile);

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: projectDir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOTHING_TO_UNINSTALL);
    expect(output).toContain(STEP_TEXT.UNINSTALL_NOT_INSTALLED);

    expect(output).not.toContain(STEP_TEXT.UNINSTALL_PREVIEW_HEADING);
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_CLI_COMPILED);
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(agentFile)).toBe(true);
    expect(await readTestFile(agentFile)).toBe(agentBefore);
    await expectNoSourceFolder(
      projectDir,
      "a declined uninstall in a project that never had one leaves no source folder",
    );
  });

  it("should succeed with --yes when config dir exists but no skills", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    // Write only config — no skills or agents directories
    await writeProjectConfig(
      projectDir,
      buildProjectConfig({ name: "config-only-test", skills: [], agents: [] }),
    );

    const configDir = sourceFolderIn(projectDir);
    expect(await directoryExists(configDir)).toBe(true);

    const { exitCode } = await CLI.run(["uninstall", "--yes"], {
      dir: projectDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Config dir, skills, and agents should all be removed by default
    await expectCleanUninstall(projectDir, { removeConfig: true });
  });
});
