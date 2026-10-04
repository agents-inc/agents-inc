import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  readTreeSnapshot,
  runCLI,
  writeConfigTypes,
  writeProjectConfigIn,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { RETIRED_SOURCE_FOLDER } from "../../src/cli/lib/installation/install-layout.js";

/**
 * The retired source folder is ignored, and named once at startup.
 *
 * An installation is `.agents-inc/<provider>/` and nothing else, so a folder in the retired place
 * holds no installation. What the user is owed instead is one line, printed before the command
 * runs, wherever the project or HOME holds the folder. Each spec that pins the line is paired with
 * one where the folder is absent and the line is not printed, because a line that only ever
 * appears cannot tell a check of the disk from an unconditional print.
 *
 * The folder's name comes from the product's one declaration of it rather than being spelled here.
 */
const NOTICE = `${RETIRED_SOURCE_FOLDER}/ ${STEP_TEXT.RETIRED_SOURCE_FOLDER_UNSUPPORTED}`;

/** A file the user keeps in the retired folder: whatever a run does, it must not touch it. */
const KEPT_IN_THE_RETIRED_FOLDER = path.join("agents", "my-agent", "identity.md");
const KEPT_IN_THE_RETIRED_FOLDER_BODY = "An agent the user wrote under the retired folder.\n";

describe("the retired source folder", () => {
  let tempDir: string;
  let projectDir: string;
  let home: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  async function scopes(): Promise<void> {
    tempDir = await createTempDir();
    projectDir = path.join(tempDir, "project");
    home = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await mkdir(home, { recursive: true });
  }

  /** An installation on the only layout there is. */
  async function install(root: string, name: string): Promise<void> {
    await writeProjectConfigIn(
      root,
      DIRS.SOURCE_CLAUDE,
      buildProjectConfig({ name, skills: [], agents: [] }),
    );
    await writeConfigTypes(root, DIRS.SOURCE_CLAUDE);
  }

  /** What an old installation left behind: a config pair, and a file of the user's own. */
  async function retiredFolderIn(root: string, name: string): Promise<void> {
    await writeProjectConfigIn(
      root,
      RETIRED_SOURCE_FOLDER,
      buildProjectConfig({ name, skills: [], agents: [] }),
    );
    await writeConfigTypes(root, RETIRED_SOURCE_FOLDER);
    const kept = path.join(root, RETIRED_SOURCE_FOLDER, KEPT_IN_THE_RETIRED_FOLDER);
    await mkdir(path.dirname(kept), { recursive: true });
    await writeFile(kept, KEPT_IN_THE_RETIRED_FOLDER_BODY);
  }

  async function run(args: string[], cwd: string = projectDir) {
    return runCLI(args, cwd, { env: { HOME: home } });
  }

  it("is named once, not once per scope, when the project and HOME both hold it, and the run goes on", async () => {
    await scopes();
    await install(projectDir, "current-project");
    await retiredFolderIn(projectDir, "retired-project");
    await retiredFolderIn(home, "retired-global");

    const { exitCode, combined } = await run(["doctor"]);

    expect(combined).toContain(NOTICE);
    expect(combined.indexOf(NOTICE), "said once, not once per scope").toBe(
      combined.lastIndexOf(NOTICE),
    );
    expect(exitCode, "the line is a notice, so the command it precedes still runs").toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(
      combined,
      "the command did its own work after the notice: it reported the installation's folder",
    ).toContain(STEP_TEXT.DOCTOR_LAYOUT_CURRENT);
  });

  it("is named when only HOME holds it", async () => {
    await scopes();
    await install(projectDir, "current-project");
    await retiredFolderIn(home, "retired-global");

    const { combined } = await run(["list"]);

    expect(combined).toContain(NOTICE);
  });

  it("is not named when neither the project nor HOME holds it", async () => {
    await scopes();
    await install(projectDir, "current-project");
    await install(home, "current-global");

    const { exitCode, combined } = await run(["list"]);

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(
      combined,
      "without this the specs above cannot tell a check of the disk from a line printed on every run",
    ).not.toContain(NOTICE);
  });

  it("is ignored: a project holding only it has no config, and the folder is left untouched", async () => {
    await scopes();
    await retiredFolderIn(projectDir, "retired-project");
    const before = await readTreeSnapshot(projectDir);

    const { combined } = await run(["doctor"]);

    expect(
      combined,
      "the config under the retired folder is not read, so the project's own config is the missing one",
    ).toContain(STEP_TEXT.DOCTOR_CONFIG_NOT_FOUND);
    expect(await readTreeSnapshot(projectDir)).toStrictEqual(before);
  });
});
