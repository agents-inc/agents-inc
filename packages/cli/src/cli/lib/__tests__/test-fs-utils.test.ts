import os from "os";
import path from "path";
import { mkdir, realpath, symlink } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanupTempDir, createTempDir } from "./test-fs-utils.js";

// macOS's TMPDIR sits under /var, a symlink to /private/var, and process.cwd() answers the real path.
describe("createTempDir", () => {
  let fixtureRoot: string;
  let realTmp: string;
  let linkedTmp: string;

  beforeEach(async () => {
    fixtureRoot = await realpath(await createTempDir("cc-temp-dir-spec-"));
    realTmp = path.join(fixtureRoot, "tmp-real");
    linkedTmp = path.join(fixtureRoot, "tmp-link");
    await mkdir(realTmp);
    await symlink(realTmp, linkedTmp, "dir");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(fixtureRoot);
  });

  it("hands out the real path of a folder made under a TMPDIR reached through a symlink", async () => {
    vi.stubEnv("TMPDIR", linkedTmp);
    expect(os.tmpdir(), "subject guard: the temp dir is the symlink").toBe(linkedTmp);

    const dir = await createTempDir();

    expect(dir).toBe(await realpath(dir));
    expect(path.dirname(dir)).toBe(realTmp);
  });

  it("hands out a folder directly under a TMPDIR that is already a real path", async () => {
    vi.stubEnv("TMPDIR", realTmp);

    const dir = await createTempDir();

    expect(path.dirname(dir)).toBe(realTmp);
    expect(dir).toBe(await realpath(dir));
  });

  it("names the folder with the prefix it is given", async () => {
    vi.stubEnv("TMPDIR", linkedTmp);

    const dir = await createTempDir("cc-named-");

    expect(path.basename(dir)).toMatch(/^cc-named-/);
  });
});
