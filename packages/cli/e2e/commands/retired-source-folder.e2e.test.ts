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

/**
 * The retired source folder holds no installation: it is ignored and named at startup, once per
 * root that holds it, each line naming its root. Each spec pinning a line is paired with one where
 * the folder is absent.
 */
function notice(root: string): string {
  return `${path.join(root, DIRS.RETIRED_SOURCE)}/${STEP_TEXT.RETIRED_SOURCE_FOLDER_UNSUPPORTED}${path.join(root, DIRS.SOURCE_CLAUDE)}/.`;
}

/** A user's file in the retired folder, which no run may touch. */
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

  async function install(root: string, name: string): Promise<void> {
    await writeProjectConfigIn(
      root,
      DIRS.SOURCE_CLAUDE,
      buildProjectConfig({ name, skills: [], agents: [] }),
    );
    await writeConfigTypes(root, DIRS.SOURCE_CLAUDE);
  }

  async function retiredFolderIn(root: string, name: string): Promise<void> {
    await writeProjectConfigIn(
      root,
      DIRS.RETIRED_SOURCE,
      buildProjectConfig({ name, skills: [], agents: [] }),
    );
    await writeConfigTypes(root, DIRS.RETIRED_SOURCE);
    const kept = path.join(root, DIRS.RETIRED_SOURCE, KEPT_IN_THE_RETIRED_FOLDER);
    await mkdir(path.dirname(kept), { recursive: true });
    await writeFile(kept, KEPT_IN_THE_RETIRED_FOLDER_BODY);
  }

  async function run(args: string[], cwd: string = projectDir) {
    return runCLI(args, cwd, { env: { HOME: home } });
  }

  it("names each root that holds it once, HOME first, when the project and HOME both hold it, and the run goes on", async () => {
    await scopes();
    await install(projectDir, "current-project");
    await retiredFolderIn(projectDir, "retired-project");
    await retiredFolderIn(home, "retired-global");

    const { exitCode, combined } = await run(["doctor"]);

    expect(combined).toContain(notice(home));
    expect(combined).toContain(notice(projectDir));
    expect(combined.indexOf(notice(home)), "HOME's line comes first").toBeLessThan(
      combined.indexOf(notice(projectDir)),
    );
    expect(combined.indexOf(notice(home)), "HOME is named once").toBe(
      combined.lastIndexOf(notice(home)),
    );
    expect(combined.indexOf(notice(projectDir)), "the project is named once").toBe(
      combined.lastIndexOf(notice(projectDir)),
    );
    expect(exitCode, "the line is a notice, so the command it precedes still runs").toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(
      combined,
      "the command did its own work after the notice: it reported the installation's folder",
    ).toContain(STEP_TEXT.DOCTOR_LAYOUT_CURRENT);
  });

  it("names HOME alone when only HOME holds it", async () => {
    await scopes();
    await install(projectDir, "current-project");
    await retiredFolderIn(home, "retired-global");

    const { combined } = await run(["list"]);

    expect(combined).toContain(notice(home));
    expect(combined).not.toContain(`${path.join(projectDir, DIRS.RETIRED_SOURCE)}/`);
  });

  it("names the project alone when only the project holds it", async () => {
    await scopes();
    await install(projectDir, "current-project");
    await retiredFolderIn(projectDir, "retired-project");

    const { combined } = await run(["list"]);

    expect(combined).toContain(notice(projectDir));
    expect(combined).not.toContain(`${path.join(home, DIRS.RETIRED_SOURCE)}/`);
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
    ).not.toContain(STEP_TEXT.RETIRED_SOURCE_FOLDER_UNSUPPORTED);
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
