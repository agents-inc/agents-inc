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
import { DIRS, STEP_TEXT } from "../pages/constants.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";

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
