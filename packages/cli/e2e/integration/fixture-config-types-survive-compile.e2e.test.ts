import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, configTypesTsPath, readTestFile } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES } from "../pages/constants.js";

describe("a ProjectBuilder config-types.ts is the file compile writes for its config", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("leaves withCustomSkill's config-types.ts as the fixture wrote it", async () => {
    const project = await ProjectBuilder.withCustomSkill();
    tempDir = path.dirname(project.dir);
    const written = await readTestFile(configTypesTsPath(project.dir));

    const { exitCode, output } = await CLI.run(["compile"], project);

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(
      await readTestFile(configTypesTsPath(project.dir)),
      "compile rewrote the fixture's config-types.ts, so the fixture held a file the CLI would not have written",
    ).toBe(written);
  });

  it("leaves dualScopeWithGlobalTypes's global config-types.ts as the fixture wrote it", async () => {
    const { project, globalHome } = await ProjectBuilder.dualScopeWithGlobalTypes();
    tempDir = path.dirname(project.dir);
    const written = await readTestFile(configTypesTsPath(globalHome.dir));

    const { exitCode, output } = await CLI.run(["compile"], globalHome, {
      env: { HOME: globalHome.dir },
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(
      await readTestFile(configTypesTsPath(globalHome.dir)),
      "compile rewrote the fixture's global config-types.ts, so the fixture held a file the CLI would not have written",
    ).toBe(written);
  });

  it("leaves dualScopeWithGlobalTypes's project config-types.ts as the fixture wrote it", async () => {
    const { project, globalHome } = await ProjectBuilder.dualScopeWithGlobalTypes();
    tempDir = path.dirname(project.dir);
    const written = await readTestFile(configTypesTsPath(project.dir));

    const { exitCode, output } = await CLI.run(["compile"], project, {
      env: { HOME: globalHome.dir },
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(
      await readTestFile(configTypesTsPath(project.dir)),
      "compile rewrote the fixture's project config-types.ts, so the fixture held a file the CLI would not have written",
    ).toBe(written);
  });
});
