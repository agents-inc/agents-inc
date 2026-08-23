import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import {
  cleanupTempDir,
  configTsPath,
  createTempDir,
  ensureBinaryExists,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";

/**
 * A configuration that exists and cannot be parsed is a state of its own, and `doctor` — the one
 * command whose entire job is to name the state — used to call it `not found` and tell the user to
 * run `init`, which does not clear it. `uninstall` does.
 *
 * The parse failure is a CONTENT finding: it is file-level validation of something on disk, and
 * every operational row underneath it would be a cascade of the same fact. That placement is also
 * what stops the loader's own `Failed to load project source config` line printing four times over
 * between the rows — the operational layer and the sources check are the readers that produced it,
 * and neither runs once the file has been reported as unreadable.
 */

/** A genuine TypeScript syntax error — the loader throws while evaluating the file. */
const SYNTAX_ERROR = `export default {{{ not valid typescript`;

/** A file that parses cleanly but exports nothing, so the loader gets no config object at all. */
const NO_DEFAULT_EXPORT = "";

/** How a config under the user's own home is rendered in a finding — `~/`-relative, as they say it. */
const GLOBAL_CONFIG_DISPLAY_PATH = path.join("~", DIRS.CLAUDE_SRC, FILES.CONFIG_TS);

/** Valid TypeScript whose shape the loader schema rejects (`skills` must be an array). */
const SCHEMA_VIOLATION = [
  `export default {`,
  `  name: "schema-violation-fixture",`,
  `  skills: "nope",`,
  `  agents: [],`,
  `};`,
].join("\n");

describe("doctor with an unreadable config", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  /**
   * Every corruption kind reaches the same finding, so each case asserts the same four things:
   * the file named, the real state named, the false one gone, and the remedy that actually
   * applies in place of the one that does not.
   */
  async function expectFindingNaming(configSource: string) {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const projectHome = path.join(tempDir, "home");
    await mkdir(projectHome, { recursive: true });
    await writeCorruptConfig(projectDir, configSource);

    // HOME is kept distinct from the project, so the only config in play is the corrupt one and
    // the finding names it by its own absolute path rather than the `~/`-relative global form.
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
   * The reason was never absent from the old output — it arrived as repeated unstructured loader
   * lines spliced between the check rows. It belongs to the finding now, and only to the finding.
   *
   * This asserted the ABSENCE of that loose loader line until 2026-08-20, when the unreadable-config
   * ruling turned the `verbose()` it was copied from into a throw. Nothing emits the string any
   * more, so the absence could no longer fail and the spec was green for a reason unrelated to its
   * name. The claim worth pinning is the surviving half, and it is a positive one: the finding
   * carries the reason ITSELF. Asserted as one string so the adjacency is the assertion — a reason
   * printed loose between the rows again would not sit against the state label.
   */
  it("carries the loader's reason inside the finding, on the row that names the state", async () => {
    const stdout = await expectFindingNaming(SYNTAX_ERROR);

    expect(stdout, "the finding states the reason, not only that there was one").toContain(
      `${STEP_TEXT.DOCTOR_CONFIG_UNREADABLE}: ${STEP_TEXT.CONFIG_LOAD_REASON}`,
    );
  });

  /**
   * The operational layer reads the config for every one of its rows, so its findings on an
   * unreadable one are cascades. This is the ONLY content error that stands the whole layer down —
   * every other one is scoped to the rows the failing pass names in its `blocks` list.
   */
  it("skips the operational layer rather than reporting cascades of the same fault", async () => {
    const stdout = await expectFindingNaming(SYNTAX_ERROR);

    expect(stdout).toContain(STEP_TEXT.DOCTOR_SKIP_AFTER_CONFIG_ERROR);
    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
  });

  /**
   * The global config is inlined into every project write, so an unreadable one is a finding about
   * this project too — and naming the file is the whole point when two are in play.
   */
  it("names the global config when that is the unreadable one", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const globalHome = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await writeProjectConfig(projectDir, { name: "intact-project", agents: [] });
    await writeCorruptConfig(globalHome, SYNTAX_ERROR);

    const { exitCode, stdout } = await CLI.run(
      ["doctor"],
      { dir: projectDir },
      { env: { HOME: globalHome } },
    );

    expect(exitCode, `doctor output:\n${stdout}`).toBe(EXIT_CODES.ERROR);
    // Under the user's own home the finding names the file the way the user does. Asserted
    // explicitly because the absolute path also rides along inside some loader reasons and not
    // others — this pins the finding's own naming rather than the reason's.
    expect(stdout).toContain(GLOBAL_CONFIG_DISPLAY_PATH);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
  });

  /**
   * The control that stops every assertion above passing on a guard that fires unconditionally.
   * An absent config is a legitimate state with its own message and its own remedy — `init` is
   * the right advice there, and only there.
   */
  it("keeps the not-found message and the init tip when no config exists at all", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_NOT_FOUND);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_TIP_CREATE_CONFIG);
    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
  });

  /** The other control: a readable config reaches the operational layer as it always did. */
  it("reaches the operational layer when the config loads", async () => {
    tempDir = await createTempDir();
    await writeProjectConfig(tempDir, { name: "intact-project", agents: [] });

    const { stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_CONFIG_UNREADABLE);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
  });

  /**
   * The state that reaches the operational layer and has nothing to install: the file loads, and
   * declares neither skills nor agents. `detectInstallation` answers "is there an installation
   * here" and hands back the same `null` an absent file produces, which the row printed as
   * `not found` — four lines under the content layer's own `1 config validated` about that very
   * file. One screen, two verdicts, and the one the reader can act on was the false one.
   */
  it("names a config that loads and declares nothing instead of calling it missing", async () => {
    tempDir = await createTempDir();
    await writeProjectConfig(tempDir, { name: "declares-nothing", agents: [] });

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

    // A valid file with nothing in it is not a fault: `init` writes exactly this shape as the
    // blank global pair on every project setup. Nothing needs repairing, so nothing fails.
    expect(exitCode, `doctor output:\n${stdout}`).toBe(EXIT_CODES.SUCCESS);
  });

  /**
   * The rows underneath used to read `Skipped (config invalid)` about a config that is valid —
   * the same falsehood one layer down, and five times over. They run on it now and say what is
   * true of an empty config.
   */
  it("runs the rows underneath rather than skipping them as invalid", async () => {
    tempDir = await createTempDir();
    await writeProjectConfig(tempDir, { name: "declares-nothing", agents: [] });

    const { stdout } = await CLI.run(["doctor"], { dir: tempDir });

    expect(stdout).not.toContain(STEP_TEXT.DOCTOR_SKIPPED_CONFIG_INVALID);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_NO_SKILLS_CONFIGURED);
    expect(stdout).toContain(STEP_TEXT.DOCTOR_NO_AGENTS_CONFIGURED);
  });
});
