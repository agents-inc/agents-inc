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

/**
 * Every build here is driven at a root this file created, never at {@link sharedSourcePath}.
 *
 * The two are the same mechanism and only the address differs — which is the whole reason this
 * file has to name its own. `sharedSourcePath()` is a fixed `os.tmpdir()` path that the E2E run
 * builds in its `globalSetup` and that its specs read for the length of that run; this file is
 * collected by the UNIT project, which is a different vitest run that nothing orders against it.
 * Calling `buildSharedSource`/`removeSharedSource` here — which is what these specs did until
 * 2026-09-02 — deletes that fixture out from under a concurrent E2E run, and every spec on both
 * sides still reports a pass. `shared-source.ts` carries the rule in full.
 */
let root: string;

beforeEach(async () => {
  root = await createTempDir("cc-frozen-source-spec-");
});

afterEach(async () => {
  await removeFrozenSourceTree(root);
});

/** Writes a nested tree, so the freeze is exercised below the top directory as well as at it. */
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

  // The whole reason this fixture can be shared. A spec that writes into a source it does not own
  // must fail AT THE WRITE, in its own file, rather than leaving a mutation for some later spec to
  // trip over — a failure that would otherwise move between runs with the worker scheduling.
  it("refuses a write to a file, at the write", async () => {
    await buildFrozenSourceTree(root, writeATree);

    await expect(writeFile(path.join(root, "top.txt"), "tampered\n")).rejects.toThrow(
      /EACCES|EPERM/,
    );
  });

  // Nested, because freezing only the top directory would leave every file below it writable and
  // the guarantee would hold for exactly one level.
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

  // Teardown has to unfreeze before it can delete, or the run leaves the tree behind and the next
  // build inherits a half-removed one.
  it("removes itself despite being frozen", async () => {
    await buildFrozenSourceTree(root, writeATree);
    await removeFrozenSourceTree(root);

    await expect(stat(root)).rejects.toThrow();
  });

  // A directory left by a killed run holds a half-built source, and reusing it would seat every
  // spec on a fixture nobody can describe.
  it("replaces a tree an earlier run left behind rather than reusing it", async () => {
    await buildFrozenSourceTree(root, async (dir) => {
      await writeFile(path.join(dir, "stale.txt"), "from the last run\n");
    });

    await buildFrozenSourceTree(root, writeATree);

    await expect(stat(path.join(root, "stale.txt"))).rejects.toThrow();
    expect(await readFile(path.join(root, "top.txt"), "utf-8")).toBe("top\n");
  });
});

/**
 * The shared address, asserted about and never built at. `isSharedSource` is a path comparison and
 * touches no disk, which is what lets this describe name the real fixture at all.
 */
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
