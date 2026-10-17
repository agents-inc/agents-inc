import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir } from "../test-fs-utils.js";
import {
  buildFrozenSourceTree,
  isSharedSource,
  removeFrozenSourceTree,
  sharedSourcePath,
} from "./shared-source.js";

// Never build at sharedSourcePath(): a concurrent E2E run is reading it.
let root: string;

beforeEach(async () => {
  root = await createTempDir("cc-frozen-source-spec-");
});

afterEach(async () => {
  await removeFrozenSourceTree(root);
});

async function writeATree(dir: string): Promise<void> {
  await mkdir(path.join(dir, "nested"), { recursive: true });
  await writeFile(path.join(dir, "top.txt"), "top\n");
  await writeFile(path.join(dir, "nested", "deep.txt"), "deep\n");
}

describe("a frozen source tree", () => {
  it("builds what its builder writes", async () => {
    await buildFrozenSourceTree(root, writeATree);

    expect(await readFile(path.join(root, "top.txt"), "utf-8")).toBe("top\n");
  });

  it("answers with the root it was given", async () => {
    expect(await buildFrozenSourceTree(root, writeATree)).toBe(root);
  });

  it("refuses a write to a file, at the write", async () => {
    await buildFrozenSourceTree(root, writeATree);

    await expect(writeFile(path.join(root, "top.txt"), "tampered\n")).rejects.toThrow(
      /EACCES|EPERM/,
    );
  });

  it("refuses a write below the top directory too", async () => {
    await buildFrozenSourceTree(root, writeATree);

    await expect(writeFile(path.join(root, "nested", "deep.txt"), "tampered\n")).rejects.toThrow(
      /EACCES|EPERM/,
    );
  });

  it("refuses a new file in a frozen directory", async () => {
    await buildFrozenSourceTree(root, writeATree);

    await expect(writeFile(path.join(root, "new.txt"), "x")).rejects.toThrow(/EACCES|EPERM/);
  });

  it("removes itself despite being frozen", async () => {
    await buildFrozenSourceTree(root, writeATree);
    await removeFrozenSourceTree(root);

    await expect(stat(root)).rejects.toThrow();
  });

  it("replaces a tree an earlier run left behind rather than reusing it", async () => {
    await buildFrozenSourceTree(root, async (dir) => {
      await writeFile(path.join(dir, "stale.txt"), "from the last run\n");
    });

    await buildFrozenSourceTree(root, writeATree);

    await expect(stat(path.join(root, "stale.txt"))).rejects.toThrow();
    expect(await readFile(path.join(root, "top.txt"), "utf-8")).toBe("top\n");
  });
});

// isSharedSource touches no disk, so naming the real path here is safe.
describe("the shared E2E source's address", () => {
  it("recognises its own path, so cleanup can refuse what it does not own", () => {
    expect(isSharedSource(sharedSourcePath())).toBe(true);
    expect(isSharedSource(path.join(sharedSourcePath(), "nested"))).toBe(false);
    expect(isSharedSource("/tmp/somebody-elses-fixture")).toBe(false);
  });

  it("is not a root any spec in this file builds at", () => {
    expect(isSharedSource(root)).toBe(false);
  });
});
