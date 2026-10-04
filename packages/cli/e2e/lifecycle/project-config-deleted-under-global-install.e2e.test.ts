import { mkdir, rm } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import { createDualScopeEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import {
  configTsPath,
  fileExists,
  readTreeSnapshot,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { DIRS, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { UI_SYMBOLS } from "../../src/cli/consts.js";

/**
 * `doctor`'s Config Valid row says whose config it read — journey 14's project half, driven from
 * a real global installation and a real project set up under it.
 *
 * A directory with no config of its own under a global installation inherits the global one:
 * detection falls back to it by design, and every command keeps working. The row used to name
 * this directory's path for the file it had just read out of the home directory, so a project
 * whose `config.ts` the user had deleted was told `.agents-inc/claude/config.ts is valid` — about
 * a file that was not there.
 *
 * **The ruling is a label and nothing else.** The row names the config it actually read, and
 * every Config Valid row leads with the scope it is about: `This project:` or
 * `The global installation:`, the nouns the Layout rows already lead with. What else `doctor`
 * reports over a deleted project config is out of scope, so nothing here pins it.
 *
 * The four states are read from one installation, in the order a user reaches them: the project
 * with its own config, the home directory, a directory under home that never had one, and the
 * project once its config is deleted. Each is the control for the others — a row that labelled
 * every config "This project" would pass the first and fail the second, and one that called
 * every inherited config the global one would fail the first.
 *
 * Against the unfixed binary the red is the label: every row printed the bare relative path, so
 * the deleted and the never-configured directories both claimed a project file was valid. The
 * no-write check cannot be reddened by reverting a fix, so it was checked by mutating the fixture
 * instead — a file written into the project between `doctor` and the second snapshot — and it
 * went red on its own assertion and nothing else new.
 */

/** The Config Valid row's lead, up to the message the row carries. */
const CONFIG_ROW_PASSING = `${STEP_TEXT.DOCTOR_CONFIG_CHECK}\\s+${UI_SYMBOLS.CHECK}\\s+`;

/** The installation's config as `doctor` names it from the directory holding it. */
const CONFIG_RELATIVE = `${DIRS.SOURCE_CLAUDE}/${FILES.CONFIG_TS}`;

/** A directory under home that was never set up — it holds nothing and inherits the global config. */
const NEVER_CONFIGURED = "never-configured";

describe("doctor's Config Valid row under a live global installation", () => {
  let env: DualScopeEnv;

  let ownConfig: CLIResult;
  let atHome: CLIResult;
  let neverConfigured: CLIResult;
  let deleted: CLIResult;
  let deletedTreeBefore: Record<string, TreeSnapshotEntry>;
  let deletedTreeAfter: Record<string, TreeSnapshotEntry>;

  beforeAll(async () => {
    env = await createDualScopeEnv(E2E_SOURCE);
    const { fakeHome, projectDir } = env;
    const asUser = { env: { HOME: fakeHome } };

    ownConfig = await CLI.run(["doctor"], { dir: projectDir }, asUser);
    atHome = await CLI.run(["doctor"], { dir: fakeHome }, asUser);

    const bareDir = path.join(fakeHome, NEVER_CONFIGURED);
    await mkdir(bareDir, { recursive: true });
    neverConfigured = await CLI.run(["doctor"], { dir: bareDir }, asUser);

    const projectConfig = configTsPath(projectDir);
    expect(await fileExists(projectConfig), "the project was set up with a config of its own").toBe(
      true,
    );
    await rm(projectConfig);
    expect(await fileExists(projectConfig)).toBe(false);
    deletedTreeBefore = await readTreeSnapshot(fakeHome);
    deleted = await CLI.run(["doctor"], { dir: projectDir }, asUser);
    deletedTreeAfter = await readTreeSnapshot(fakeHome);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await env.destroy();
  });

  it("labels a project's own config as this project's", () => {
    expect(ownConfig.stdout, ownConfig.output).toMatch(
      new RegExp(
        `${CONFIG_ROW_PASSING}${STEP_TEXT.DOCTOR_CONFIG_THIS_PROJECT} ${CONFIG_RELATIVE} ${STEP_TEXT.DOCTOR_CONFIG_IS_VALID}`,
      ),
    );
  });

  it("labels the config at the home directory as the global installation's, named from home", () => {
    expect(atHome.stdout, atHome.output).toMatch(
      new RegExp(
        `${CONFIG_ROW_PASSING}${STEP_TEXT.DOCTOR_CONFIG_THE_GLOBAL_INSTALLATION} ~/${CONFIG_RELATIVE} ${STEP_TEXT.DOCTOR_CONFIG_IS_VALID}`,
      ),
    );
  });

  it("names the global installation's file in a directory under home that never had a config", () => {
    expect(neverConfigured.stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
    expect(
      neverConfigured.stdout,
      "the row names a config this directory does not have",
    ).not.toMatch(
      new RegExp(`${CONFIG_ROW_PASSING}${CONFIG_RELATIVE} ${STEP_TEXT.DOCTOR_CONFIG_IS_VALID}`),
    );
    expect(neverConfigured.stdout, neverConfigured.output).toMatch(
      new RegExp(
        `${CONFIG_ROW_PASSING}${STEP_TEXT.DOCTOR_CONFIG_THIS_PROJECT} [^\\n]*${STEP_TEXT.DOCTOR_CONFIG_USING_GLOBAL} \\(~/${CONFIG_RELATIVE}\\)`,
      ),
    );
  });

  describe("once the project's config.ts is deleted", () => {
    it("names the global installation's file rather than the path of the one deleted", () => {
      expect(deleted.stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(
        deleted.stdout,
        "the row calls the deleted project config valid — it read the global one",
      ).not.toMatch(
        new RegExp(`${CONFIG_ROW_PASSING}${CONFIG_RELATIVE} ${STEP_TEXT.DOCTOR_CONFIG_IS_VALID}`),
      );
      expect(deleted.stdout, deleted.output).toMatch(
        new RegExp(
          `${CONFIG_ROW_PASSING}${STEP_TEXT.DOCTOR_CONFIG_THIS_PROJECT} [^\\n]*${STEP_TEXT.DOCTOR_CONFIG_USING_GLOBAL} \\(~/${CONFIG_RELATIVE}\\)`,
        ),
      );
    });

    it("writes nothing, recreating no config it names", () => {
      expect(
        Object.keys(deletedTreeBefore).length,
        "the snapshot holds the installation",
      ).toBeGreaterThan(0);
      expect(deletedTreeAfter, "doctor reports and writes to neither scope").toStrictEqual(
        deletedTreeBefore,
      );
    });
  });
});
