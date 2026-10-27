import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  readTreeSnapshot,
  runCLI,
  writeRetiredSourceFolder,
} from "../helpers/test-utils.js";
import { STEP_TEXT } from "../pages/constants.js";

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

  async function run(args: string[], cwd: string = projectDir) {
    return runCLI(args, cwd, { env: { HOME: home } });
  }

  it("is ignored: a project holding only it has no config, and the folder is left untouched", async () => {
    await scopes();
    await writeRetiredSourceFolder(projectDir);
    const before = await readTreeSnapshot(projectDir);

    const { combined } = await run(["doctor"]);

    expect(
      combined,
      "the config under the retired folder is not read, so the project's own config is the missing one",
    ).toContain(STEP_TEXT.DOCTOR_CONFIG_NOT_FOUND);
    expect(await readTreeSnapshot(projectDir)).toStrictEqual(before);
  });
});
