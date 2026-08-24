import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildSharedSource,
  isSharedSource,
  removeSharedSource,
  sharedSourcePath,
} from "./shared-source.js";

afterEach(async () => {
  await removeSharedSource();
});

/** Writes a nested tree, so the freeze is exercised below the top directory as well as at it. */
async function writeATree(dir: string): Promise<void> {
  await mkdir(path.join(dir, "nested"), { recursive: true });
  await writeFile(path.join(dir, "top.txt"), "top\n");
  await writeFile(path.join(dir, "nested", "deep.txt"), "deep\n");
}

describe("the shared E2E source", () => {
  it("builds what its builder writes", async () => {
    await buildSharedSource(writeATree);

    expect(await readFile(path.join(sharedSourcePath(), "top.txt"), "utf-8")).toBe("top\n");
  });

  // The whole reason this fixture can be shared. A spec that writes into a source it does not own
  // must fail AT THE WRITE, in its own file, rather than leaving a mutation for some later spec to
  // trip over — a failure that would otherwise move between runs with the worker scheduling.
  it("refuses a write to a file, at the write", async () => {
    await buildSharedSource(writeATree);

    await expect(writeFile(path.join(sharedSourcePath(), "top.txt"), "tampered\n")).rejects.toThrow(
      /EACCES|EPERM/,
    );
  });

  // Nested, because freezing only the top directory would leave every file below it writable and
  // the guarantee would hold for exactly one level.
  it("refuses a write below the top directory too", async () => {
    await buildSharedSource(writeATree);

    await expect(
      writeFile(path.join(sharedSourcePath(), "nested", "deep.txt"), "tampered\n"),
    ).rejects.toThrow(/EACCES|EPERM/);
  });

  it("refuses a new file in a frozen directory", async () => {
    await buildSharedSource(writeATree);

    await expect(writeFile(path.join(sharedSourcePath(), "new.txt"), "x")).rejects.toThrow(
      /EACCES|EPERM/,
    );
  });

  // Teardown has to unfreeze before it can delete, or the run leaves the tree behind and the next
  // build inherits a half-removed one.
  it("removes itself despite being frozen", async () => {
    await buildSharedSource(writeATree);
    await removeSharedSource();

    await expect(stat(sharedSourcePath())).rejects.toThrow();
  });

  // A directory left by a killed run holds a half-built source, and reusing it would seat every
  // spec on a fixture nobody can describe.
  it("replaces a tree an earlier run left behind rather than reusing it", async () => {
    await buildSharedSource(async (dir) => {
      await writeFile(path.join(dir, "stale.txt"), "from the last run\n");
    });

    await buildSharedSource(writeATree);

    await expect(stat(path.join(sharedSourcePath(), "stale.txt"))).rejects.toThrow();
    expect(await readFile(path.join(sharedSourcePath(), "top.txt"), "utf-8")).toBe("top\n");
  });

  it("recognises its own path, so cleanup can refuse what it does not own", () => {
    expect(isSharedSource(sharedSourcePath())).toBe(true);
    expect(isSharedSource(path.join(sharedSourcePath(), "nested"))).toBe(false);
    expect(isSharedSource("/tmp/somebody-elses-fixture")).toBe(false);
  });
});
