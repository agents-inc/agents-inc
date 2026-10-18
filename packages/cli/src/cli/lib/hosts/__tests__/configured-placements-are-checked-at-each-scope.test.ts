import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { unofferablePlacementsFound } from "../configured-placements.js";
import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { renderUnparseableConfigTs } from "../../__tests__/factories/unloadable-config-factories.js";
import { writeRawTestConfig, writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { buildSkillConfigs } from "../../__tests__/helpers/skill-config-builders.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";

/** Where a Codex installation's config sits under a project; a literal, as a person types it. */
const CODEX_INSTALLATION_FOLDER = ".agents-inc/codex";

describe("unofferablePlacementsFound", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-configured-placements-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  it("finds a plugin skill a project's Codex installation cannot place, and says why", async () => {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "agents-inc",
        }),
      }),
      CODEX_INSTALLATION_FOLDER,
    );

    expect(await unofferablePlacementsFound(projectDir)).toStrictEqual([
      "Refusing to install web-framework-react as plugin+project: the codex host offers plugin+global, eject+global, eject+project. Nothing has been changed.",
    ]);
  });

  it("finds nothing in a config it cannot read, which is reported elsewhere by name", async () => {
    await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

    expect(await unofferablePlacementsFound(projectDir)).toStrictEqual([]);
  });
});
