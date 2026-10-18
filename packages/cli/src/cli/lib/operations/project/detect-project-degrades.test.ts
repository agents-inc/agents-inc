import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { detectProject } from "./detect-project.js";
import { renderUnparseableConfigTs } from "../../__tests__/factories/unloadable-config-factories.js";
import { writeRawTestConfig } from "../../__tests__/helpers/config-io.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";

describe("detectProject on a config that cannot be read", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-detect-project-degrades-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  it("answers no project, as for a missing installation, rather than throwing", async () => {
    await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

    expect(await detectProject(projectDir)).toBeNull();
  });
});
