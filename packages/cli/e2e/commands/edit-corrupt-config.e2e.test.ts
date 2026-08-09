import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  listFiles,
  readTestFile,
  writeConfigTypes,
  writeCorruptConfig,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * A configuration that exists but cannot be read is not migrated and not repaired — it is
 * recreated. `edit` therefore refuses it outright rather than opening the wizard against a
 * config it only half-understands, and says what the way out is: `uninstall` (which
 * deliberately still works on an unreadable config) and then `init`, or a configuration built
 * in the editor and installed by id.
 *
 * The refusal is checked BEFORE any work, which is the point: an unreadable GLOBAL config
 * used to surface only at the config write, after the wizard had already copied skills and
 * installed plugins, as a warning that the write never happened.
 */

/** A genuine TypeScript syntax error — the loader throws while evaluating the file. */
const SYNTAX_ERROR = `export default {{{ not valid typescript`;

/** A file that parses cleanly but exports nothing, so the loader gets no config object at all. */
const NO_DEFAULT_EXPORT = "";

/** Valid TypeScript whose shape the loader schema rejects (`skills` must be an array). */
const SCHEMA_VIOLATION = [
  `export default {`,
  `  name: "schema-violation-fixture",`,
  `  skills: "nope",`,
  `  agents: [],`,
  `};`,
].join("\n");

describe("edit with an unreadable config", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  /**
   * An installed project whose config.ts has been replaced with `configSource`, run at genuine
   * PROJECT scope (HOME kept distinct from the project dir, otherwise the command resolves to
   * the global install instead).
   */
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

  /**
   * Every corruption kind reaches the same guard, so each case asserts the same refusal: the
   * offending file named, the recreate instruction, the editor URL, a non-zero exit — and the
   * config left exactly as it was, since a command that refuses to read it must not rewrite it.
   */
  async function expectRefusalNaming(configSource: string) {
    const { project, result } = await editWithCorruptProjectConfig(configSource);

    expect(result.exitCode, `edit output:\n${result.output}`).toBe(EXIT_CODES.ERROR);
    expect(result.output).toContain(configTsPath(project.dir));
    expect(result.output).toContain(STEP_TEXT.CONFIG_UNREADABLE_RECREATE);
    expect(result.output).toContain(STEP_TEXT.EDITOR_URL);
    // The third way out, and the last to become true: doctor reports this same file rather than
    // calling it missing and sending the reader back to a command that refuses it.
    expect(result.output).toContain(STEP_TEXT.CONFIG_UNREADABLE_DOCTOR);

    // The wizard must never have opened, and the misleading "no installation" line the
    // swallowed load error used to produce must be gone.
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
   * The global config is read and inlined by every project write, so an unreadable one is just
   * as fatal to an edit as the project's own — and used to be worse, because a valid project
   * config carried the run all the way past the wizard before the write failed.
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
    expect(output).toContain(configTsPath(globalHome));
    expect(output).toContain(STEP_TEXT.CONFIG_UNREADABLE_RECREATE);
    expect(output).toContain(STEP_TEXT.EDITOR_URL);

    expect(await readTestFile(configTsPath(project.dir))).toBe(projectConfigBefore);
    expect(await listFiles(agentsPath(project.dir))).toStrictEqual([]);
  });

  /**
   * The refusal and the way out, end to end: the same unreadable config `edit` will not touch
   * is one `uninstall` still clears. Without this pairing the guard would be a dead end.
   */
  it("leaves a config uninstall can still remove", async () => {
    const { project, projectHome, result } = await editWithCorruptProjectConfig(SYNTAX_ERROR);
    expect(result.exitCode).toBe(EXIT_CODES.ERROR);

    const uninstall = await CLI.run(
      ["uninstall", "--yes"],
      { dir: project.dir },
      { env: { HOME: projectHome } },
    );

    expect(uninstall.exitCode, `uninstall output:\n${uninstall.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(uninstall.output).toContain(STEP_TEXT.UNINSTALL_CONFIG_UNREADABLE);
    expect(uninstall.output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(configTsPath(project.dir))).toBe(false);
    expect(await fileExists(configTypesTsPath(project.dir))).toBe(false);
    expect(await directoryExists(path.join(project.dir, DIRS.CLAUDE_SRC))).toBe(false);
    await expect(project).toHaveNoLocalSkills();
  });

  /**
   * The control. A config that is simply absent is a legitimate state, not a corruption, and
   * must keep its own message — without this, a guard that fired unconditionally would satisfy
   * every case above.
   */
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
 * `init` reads the same two configs before it decides whether to show the dashboard or the
 * setup wizard, and used to let the raw `ConfigLoadError` escape — a stack-shaped message with
 * no way out in it. It refuses with the same guidance now, and still writes nothing.
 */
describe("init with an unreadable config", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

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
    expect(output).toContain(configTsPath(project.dir));
    expect(output).toContain(STEP_TEXT.CONFIG_UNREADABLE_RECREATE);
    expect(output).toContain(STEP_TEXT.EDITOR_URL);

    expect(await readTestFile(configTsPath(project.dir))).toBe(SYNTAX_ERROR);
    expect(await fileExists(configTypesTsPath(project.dir))).toBe(false);
  });
});
