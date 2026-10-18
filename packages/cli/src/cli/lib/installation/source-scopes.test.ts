import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { describeScope } from "./source-scopes.js";
import { buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";

describe("describeScope", () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDir("cc-source-scopes-");
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(root);
  });

  it("describes a scope whose provider folder is there", async () => {
    await writeTestTsConfig(root, buildProjectConfig());

    expect(await describeScope("project", root, "claude")).toStrictEqual({
      kind: "project",
      root,
      provider: "claude",
      relName: ".agents-inc/claude",
    });
  });

  it("describes nothing for a scope with no provider folder", async () => {
    expect(await describeScope("project", root, "claude")).toBeNull();
  });
});
