/**
 * What tells a fan-out's rewrite of a registered project's config pair from a re-emit of the same
 * bytes. Real configs on disk; a locked file stands for one the run cannot open.
 */

import path from "path";
import { chmod } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { pairsRewrittenSince, snapshotProjectPairs } from "../pair-snapshot.js";

const UNOPENABLE_FILE = 0o000;
const READ_WRITE_FILE = 0o644;

describe("the pair snapshot a fan-out is judged against", () => {
  let tempDir: string;
  let project: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-pair-snapshot-");
    project = path.join(tempDir, "project");
    configPath = await writeTestTsConfig(project, buildProjectConfig({ name: "project" }));
  });

  afterEach(async () => {
    await chmod(configPath, READ_WRITE_FILE);
    await cleanupTempDir(tempDir);
  });

  it("counts a pair it could not read before the fan-out as rewritten, and one it read unchanged as not", async () => {
    const other = path.join(tempDir, "other");
    await writeTestTsConfig(other, buildProjectConfig({ name: "other" }));
    await chmod(configPath, UNOPENABLE_FILE);

    const before = await snapshotProjectPairs([project, other], "claude");
    await chmod(configPath, READ_WRITE_FILE);

    expect(await pairsRewrittenSince(before, [project, other], "claude")).toStrictEqual(
      new Set([project]),
    );
  });

  it("refuses to judge a project no snapshot was taken of", async () => {
    const before = await snapshotProjectPairs([], "claude");

    await expect(pairsRewrittenSince(before, [project], "claude")).rejects.toThrow(
      `No snapshot of ${project} was taken before the fan-out`,
    );
  });
});
