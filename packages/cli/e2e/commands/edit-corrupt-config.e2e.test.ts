import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  agentsPath,
  cleanupTempDir,
  compactCliOutput,
  configTsPath,
  configTypesTsPath,
  createTempDir,
  fileExists,
  listFiles,
  readTestFile,
  writeConfigTypes,
  writeCorruptConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import {
  renderSchemaViolatingConfigTs,
  renderUnparseableConfigTs,
} from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import "../matchers/setup.js";

/**
 * `edit` refuses an unreadable config before any work and names the way out: `uninstall` then
 * `init`, or an editor-built config installed by id.
 */

const SYNTAX_ERROR = renderUnparseableConfigTs();

/** Parses but exports nothing. */
const NO_DEFAULT_EXPORT = "";

/** The schema rejects it: `skills` must be an array. */
const SCHEMA_VIOLATION = renderSchemaViolatingConfigTs();

describe("edit with an unreadable config", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  /** HOME kept apart from the project, or the command resolves to the global install. */
  async function editWithCorruptProjectConfig(configSource: string) {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    await writeConfigTypes(project.dir);
    await writeCorruptConfig(project.dir, configSource);

    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });

    const result = await CLI.run(["edit"], { dir: project.dir }, { env: { HOME: projectHome } });
    return { project, projectHome, result };
  }

  /** The config must be left as it was: a command that refuses to read it must not rewrite it. */
  async function expectRefusalNaming(configSource: string) {
    const { project, result } = await editWithCorruptProjectConfig(configSource);

    expect(result.exitCode, `edit output:\n${result.output}`).toBe(EXIT_CODES.ERROR);
    // Compacted: oclif breaks a long path mid-word.
    expect(compactCliOutput(result.output)).toContain(compactCliOutput(configTsPath(project.dir)));
    expect(result.output).toContain(STEP_TEXT.CONFIG_UNREADABLE_RECREATE);
    expect(result.output).toContain(STEP_TEXT.EDITOR_URL);
    expect(result.output).toContain(STEP_TEXT.CONFIG_UNREADABLE_DOCTOR);

    expect(result.output).not.toContain(STEP_TEXT.NO_INSTALLATION);
    expect(result.output).not.toContain(STEP_TEXT.EDIT_SUCCESS);

    expect(await readTestFile(configTsPath(project.dir))).toBe(configSource);
    expect(await listFiles(agentsPath(project.dir))).toStrictEqual([]);
  }

  it("refuses when the project config has a syntax error", async () => {
    await expectRefusalNaming(SYNTAX_ERROR);
  });

  it("refuses when the project config exports nothing", async () => {
    await expectRefusalNaming(NO_DEFAULT_EXPORT);
  });

  it("refuses when the project config violates the loader schema", async () => {
    await expectRefusalNaming(SCHEMA_VIOLATION);
  });

  /**
   * The global config is inlined by every project write, so an unreadable one is as fatal as the
   * project's own.
   */
  it("refuses when the global config is the unreadable one and the project config is intact", async () => {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    const projectConfigBefore = await readTestFile(configTsPath(project.dir));

    const globalHome = path.join(tempDir, "home");
    await writeCorruptConfig(globalHome, SYNTAX_ERROR);

    const { exitCode, output } = await CLI.run(
      ["edit"],
      { dir: project.dir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode, `edit output:\n${output}`).toBe(EXIT_CODES.ERROR);
    expect(compactCliOutput(output)).toContain(compactCliOutput(configTsPath(globalHome)));
    expect(output).toContain(STEP_TEXT.CONFIG_UNREADABLE_RECREATE);
    expect(output).toContain(STEP_TEXT.EDITOR_URL);

    expect(await readTestFile(configTsPath(project.dir))).toBe(projectConfigBefore);
    expect(await listFiles(agentsPath(project.dir))).toStrictEqual([]);
  });

  /** Without this pairing the guard would be a dead end. */
  it("leaves a config uninstall can still remove", async () => {
    const { project, projectHome, result } = await editWithCorruptProjectConfig(SYNTAX_ERROR);
    expect(result.exitCode).toBe(EXIT_CODES.ERROR);

    const uninstall = await CLI.run(
      ["uninstall", "--yes"],
      { dir: project.dir },
      { env: { HOME: projectHome } },
    );

    expect(uninstall.exitCode, `uninstall output:\n${uninstall.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(uninstall.output).toContain(STEP_TEXT.UNINSTALL_PROJECT_CONFIG_UNREADABLE);
    expect(uninstall.output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(configTsPath(project.dir))).toBe(false);
    expect(await fileExists(configTypesTsPath(project.dir))).toBe(false);
    await expectNoSourceFolder(
      project.dir,
      "uninstall removed the manifest it could not read, and left no source folder behind",
    );
    await expect(project).toHaveNoLocalSkills();
  });

  /** Control: an absent config keeps its own message. */
  it("keeps the no-installation message when no config file exists at all", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const projectHome = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await mkdir(projectHome, { recursive: true });

    const { exitCode, output } = await CLI.run(
      ["edit"],
      { dir: projectDir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `edit output:\n${output}`).toBe(EXIT_CODES.ERROR);
    expect(output).toContain(STEP_TEXT.NO_INSTALLATION);
    expect(output).not.toContain(STEP_TEXT.CONFIG_UNREADABLE_RECREATE);
  });
});

/**
 * `init` reads the same two configs before choosing the dashboard, so it refuses with the same
 * guidance and writes nothing.
 */
describe("init with an unreadable config", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  it("refuses with the recreate guidance and clobbers nothing", async () => {
    const project = await ProjectBuilder.editable({ forkedFrom: true });
    tempDir = path.dirname(project.dir);
    await writeCorruptConfig(project.dir, SYNTAX_ERROR);

    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });

    const { exitCode, output } = await CLI.run(
      ["init"],
      { dir: project.dir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `init output:\n${output}`).toBe(EXIT_CODES.ERROR);
    expect(compactCliOutput(output)).toContain(compactCliOutput(configTsPath(project.dir)));
    expect(output).toContain(STEP_TEXT.CONFIG_UNREADABLE_RECREATE);
    expect(output).toContain(STEP_TEXT.EDITOR_URL);

    expect(await readTestFile(configTsPath(project.dir))).toBe(SYNTAX_ERROR);
    expect(await fileExists(configTypesTsPath(project.dir))).toBe(false);
  });
});
