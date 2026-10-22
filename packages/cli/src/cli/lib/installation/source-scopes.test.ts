import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { sourceScopesInPlay } from "./source-scopes.js";
import { buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { useFakeHome } from "../__tests__/helpers/isolated-home.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";

describe("sourceScopesInPlay", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-source-scopes-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  const scopeAt = (kind: "global" | "project", root: string) => ({
    kind,
    root,
    provider: "claude",
    relName: ".agents-inc/claude",
  });

  it("describes each scope whose source folder is there, global first", async () => {
    await writeTestTsConfig(projectDir, buildProjectConfig());
    await writeTestTsConfig(home.dir, buildProjectConfig());

    expect(await sourceScopesInPlay(projectDir)).toStrictEqual([
      scopeAt("global", home.dir),
      scopeAt("project", projectDir),
    ]);
  });

  it("leaves out a scope with no source folder", async () => {
    await writeTestTsConfig(projectDir, buildProjectConfig());

    expect(await sourceScopesInPlay(projectDir)).toStrictEqual([scopeAt("project", projectDir)]);
  });

  it("describes one scope, the global one, from home", async () => {
    await writeTestTsConfig(home.dir, buildProjectConfig());

    expect(await sourceScopesInPlay(home.dir)).toStrictEqual([scopeAt("global", home.dir)]);
  });

  it("describes none where no scope has a source folder", async () => {
    expect(await sourceScopesInPlay(projectDir)).toStrictEqual([]);
  });
});
