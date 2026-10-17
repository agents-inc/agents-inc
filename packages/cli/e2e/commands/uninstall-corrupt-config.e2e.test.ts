import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  FORKED_FROM_METADATA,
  agentsPath,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createLocalSkill,
  createTempDir,
  fileExists,
  readTestFile,
  writeAgentFile,
  writeConfigTypes,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  renderSchemaViolatingConfigTs,
  renderUnparseableConfigTs,
} from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import "../matchers/setup.js";

/**
 * An unparseable config is the state a user uninstalls from, so `uninstall` warns and degrades: the
 * manifest and CLI-managed skills still go, and the run succeeds.
 */

const SYNTAX_ERROR = renderUnparseableConfigTs();

/** Parses but exports nothing. */
const NO_DEFAULT_EXPORT = "";

/** The schema rejects it: `skills` must be an array. */
const SCHEMA_VIOLATION = renderSchemaViolatingConfigTs();

describe("uninstall with an unreadable config", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  /** HOME kept apart from the project, or the command resolves to the global install. */
  async function uninstallWithCorruptProjectConfig(configSource: string) {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    await writeConfigTypes(project.dir);
    await writeCorruptConfig(project.dir, configSource);

    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });

    const result = await CLI.run(
      ["uninstall", "--yes"],
      { dir: project.dir },
      { env: { HOME: projectHome } },
    );
    return { project, result };
  }

  async function expectManifestRemovedDespiteWarning(configSource: string) {
    const { project, result } = await uninstallWithCorruptProjectConfig(configSource);

    expect(result.exitCode, `uninstall output:\n${result.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(result.output).toContain(STEP_TEXT.UNINSTALL_PROJECT_CONFIG_UNREADABLE);
    expect(result.output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(configTsPath(project.dir))).toBe(false);
    expect(await fileExists(configTypesTsPath(project.dir))).toBe(false);
    await expectNoSourceFolder(
      project.dir,
      "uninstall removed the manifest it could not read, and left no source folder behind",
    );
    await expect(project).toHaveNoLocalSkills();
  }

  it("warns and still removes the manifest when the project config has a syntax error", async () => {
    await expectManifestRemovedDespiteWarning(SYNTAX_ERROR);
  });

  it("warns and still removes the manifest when the project config exports nothing", async () => {
    await expectManifestRemovedDespiteWarning(NO_DEFAULT_EXPORT);
  });

  it("warns and still removes the manifest when the project config violates the loader schema", async () => {
    await expectManifestRemovedDespiteWarning(SCHEMA_VIOLATION);
  });

  /**
   * With no config, agents are identified by the compiler's provenance marker; this one is
   * hand-written, so the plan must say it is kept. Skills still go by their own `forked-from`
   * metadata.
   */
  it("keeps the compiled agents out of the removal plan when nothing identifies them", async () => {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    await writeAgentFile(project.dir, E2E_AGENT["web-developer"].name, { frontmatter: true });
    await writeConfigTypes(project.dir);
    await writeCorruptConfig(project.dir, SYNTAX_ERROR);

    const agentFile = path.join(agentsPath(project.dir), `${E2E_AGENT["web-developer"].name}.md`);
    const agentBefore = await readTestFile(agentFile);

    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: project.dir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_PROJECT_CONFIG_UNREADABLE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(output).not.toContain(STEP_TEXT.UNINSTALL_CLI_COMPILED);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_REASON);
    expect(output).toContain(STEP_TEXT.UNINSTALL_CLI_MANAGED_SECTION);

    expect(await fileExists(agentFile)).toBe(true);
    expect(await readTestFile(agentFile)).toBe(agentBefore);
    await expect(project).toHaveNoLocalSkills();
    expect(await fileExists(configTsPath(project.dir))).toBe(false);
  });

  /**
   * With the agents item gone the `CLI-managed files:` header must go too; `Config:` beneath it is
   * the control.
   */
  it("prints no CLI-managed files section when the kept agents were its only item", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });
    await writeAgentFile(projectDir, E2E_AGENT["web-developer"].name, { frontmatter: true });
    await writeConfigTypes(projectDir);
    await writeCorruptConfig(projectDir, SYNTAX_ERROR);

    const agentFile = path.join(agentsPath(projectDir), `${E2E_AGENT["web-developer"].name}.md`);
    const agentBefore = await readTestFile(agentFile);

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: projectDir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_PROJECT_CONFIG_UNREADABLE);

    expect(output).not.toContain(STEP_TEXT.UNINSTALL_CLI_MANAGED_SECTION);
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_CLI_COMPILED);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_REASON);
    expect(output).toContain(STEP_TEXT.UNINSTALL_CONFIG_SECTION);

    expect(await fileExists(agentFile)).toBe(true);
    expect(await readTestFile(agentFile)).toBe(agentBefore);
    expect(await fileExists(configTsPath(projectDir))).toBe(false);
    expect(await fileExists(configTypesTsPath(projectDir))).toBe(false);
  });

  /**
   * The `projects[]` registry is in the unreadable config, so the global manifest goes and no
   * project is touched.
   */
  it("removes the global manifest and leaves other projects untouched when the global config is unreadable", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const otherProject = path.join(tempDir, "other-project");

    await writeConfigTypes(globalHome);
    await writeCorruptConfig(globalHome, SYNTAX_ERROR);
    await writeProjectConfig(
      otherProject,
      buildProjectConfig({
        name: "bystander-project",
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
      }),
    );
    const otherConfigBefore = await readTestFile(configTsPath(otherProject));

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: globalHome },
      { env: { HOME: globalHome } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(
      output,
      "at the home directory the config uninstall could not read is the global one",
    ).toContain(STEP_TEXT.UNINSTALL_GLOBAL_CONFIG_UNREADABLE);
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_PROJECT_CONFIG_UNREADABLE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(configTsPath(globalHome))).toBe(false);
    expect(await fileExists(configTypesTsPath(globalHome))).toBe(false);
    await expectNoSourceFolder(
      globalHome,
      "the global uninstall removed the manifest it could not read, and left no source folder behind",
    );

    // Nothing could be read, so nothing is reported pruned.
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_PROJECTS_UPDATED_ONE);
    expect(await readTestFile(configTsPath(otherProject))).toBe(otherConfigBefore);
  });

  /** Control: an absent config stays silent. */
  it("does not warn about an unreadable config when no config file exists at all", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });
    await createLocalSkill(projectDir, E2E_SKILL.react.id, { metadata: FORKED_FROM_METADATA });

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: projectDir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_PROJECT_CONFIG_UNREADABLE);
    expect(output).not.toContain(STEP_TEXT.UNINSTALL_GLOBAL_CONFIG_UNREADABLE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    await expect({ dir: projectDir }).toHaveNoLocalSkills();
    expect(await fileExists(configTsPath(projectDir))).toBe(false);
  });
});
