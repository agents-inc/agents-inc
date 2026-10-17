import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import {
  cleanupTempDir,
  configTsPath,
  createTempDir,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  renderSchemaViolatingConfigTs,
  renderUnparseableConfigTs,
} from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

/**
 * An unparseable config is a content finding naming the file, with `uninstall` (not `init`) as the
 * remedy; the operational rows are not run on it.
 */

const SYNTAX_ERROR = renderUnparseableConfigTs();

/** Parses but exports nothing. */
const NO_DEFAULT_EXPORT = "";

/** A literal: this is text doctor prints, so it is not built from the product's constant. */
const GLOBAL_CONFIG_DISPLAY_PATH = path.join("~", ".agents-inc", "claude", FILES.CONFIG_TS);

/** The schema rejects it: `skills` must be an array. */
const SCHEMA_VIOLATION = renderSchemaViolatingConfigTs();

describe("doctor with an unreadable config", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  async function expectFindingNaming(configSource: string) {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });
    await writeCorruptConfig(projectDir, configSource);

    // HOME apart from the project, so the finding names the corrupt file by absolute path.
    const { exitCode, stdout } = await CLI.run(
      ["doctor"],
      { dir: projectDir },
      { env: { HOME: projectHome } },
    );

    expect(exitCode, `doctor output:\n${stdout}`).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain(configTsPath(projectDir));
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
    expect(stdout, "the file is on disk — it is not missing").not.toContain(
      STEP_TEXT.DOCTOR_CONFIG_NOT_FOUND,
    );

    expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_RECREATE_CONFIG);
    expect(stdout, "init does not clear an unreadable config; uninstall does").not.toContain(
      STEP_TEXT.DOCTOR_TIP_CREATE_CONFIG,
    );

    return stdout;
  }

  it("names the file and the state when the config has a syntax error", async () => {
    await expectFindingNaming(SYNTAX_ERROR);
  });

  it("names the file and the state when the config exports nothing", async () => {
    await expectFindingNaming(NO_DEFAULT_EXPORT);
  });

  it("names the file and the state when the config violates the loader schema", async () => {
    await expectFindingNaming(SCHEMA_VIOLATION);
  });

  /**
   * Asserted as one string: the reason must sit against the state label, not loose between rows.
   */
  it("carries the loader's reason inside the finding, on the row that names the state", async () => {
    const stdout = await expectFindingNaming(SYNTAX_ERROR);

    expect(stdout, "the finding states the reason, not only that there was one").toContain(
      `${STEP_TEXT.DOCTOR_CONFIG_UNREADABLE}: ${STEP_TEXT.CONFIG_LOAD_REASON}`,
    );
  });

  /**
   * The only content error that stands the whole operational layer down; others stand down only
   * their `blocks`.
   */
  it("skips the operational layer rather than reporting cascades of the same fault", async () => {
    const stdout = await expectFindingNaming(SYNTAX_ERROR);

    expect(stdout).toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR);
    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
  });

  it("names the global config when that is the unreadable one", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const globalHome = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await writeProjectConfig(
      projectDir,
      buildProjectConfig({ name: "intact-project", skills: [], agents: [] }),
    );
    await writeCorruptConfig(globalHome, SYNTAX_ERROR);

    const { exitCode, stdout } = await CLI.run(
      ["doctor"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode, `doctor output:\n${stdout}`).toBe(EXIT_CODES.ERROR);
    // The absolute path rides along in some loader reasons, so this pins the finding's own naming.
    expect(stdout).toContain(GLOBAL_CONFIG_DISPLAY_PATH);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
  });

  /** Control: an absent config keeps its own message and the `init` tip. */
  it("keeps the not-found message and the init tip when no config exists at all", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_NOT_FOUND);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_CREATE_CONFIG);
    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
  });

  it("reaches the operational layer when the config loads", async () => {
    tempDir = await createTempDir();
    await writeProjectConfig(
      tempDir,
      buildProjectConfig({ name: "intact-project", skills: [], agents: [] }),
    );

    const { stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
  });

  /**
   * `detectInstallation` returns null for a config declaring nothing, as for an absent file; the
   * row must not call it missing.
   */
  it("names a config that loads and declares nothing instead of calling it missing", async () => {
    tempDir = await createTempDir();
    await writeProjectConfig(
      tempDir,
      buildProjectConfig({ name: "declares-nothing", skills: [], agents: [] }),
    );

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(stdout, "the content layer already read and validated this file").toContain(
      STEP_TEXT.DOCTOR_ONE_CONFIG_VALIDATED,
    );
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_DECLARES_NOTHING);
    expect(stdout, "the file is on disk and it loaded — it is not missing").not.toContain(
      STEP_TEXT.DOCTOR_CONFIG_NOT_FOUND,
    );

    expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_NOTHING_CONFIGURED);
    expect(stdout, "there is nothing to create — the configuration is already there").not.toContain(
      STEP_TEXT.DOCTOR_TIP_CREATE_CONFIG,
    );

    // `init` writes exactly this shape as the blank global pair, so nothing fails.
    expect(exitCode, `doctor output:\n${stdout}`).toBe(EXIT_CODES.SUCCESS);
  });

  it("runs the rows underneath rather than skipping them as invalid", async () => {
    tempDir = await createTempDir();
    await writeProjectConfig(
      tempDir,
      buildProjectConfig({ name: "declares-nothing", skills: [], agents: [] }),
    );

    const { stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_NO_SKILLS_CONFIGURED);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_NO_AGENTS_CONFIGURED);
  });
});
