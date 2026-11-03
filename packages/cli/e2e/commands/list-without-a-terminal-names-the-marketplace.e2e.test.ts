import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder, type EditableOptions } from "../fixtures/project-builder.js";
import { cleanupTempDir } from "../helpers/test-utils.js";
import { EXIT_CODES, PUBLIC_MARKETPLACE_SOURCE, STEP_TEXT } from "../pages/constants.js";

describe("list without a terminal", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  /** Under a HOME of its own, so the project is not the home root. */
  async function listOverAPipe(options: EditableOptions): Promise<string> {
    const project = await ProjectBuilder.editable(options);
    tempDir = path.dirname(project.dir);
    const home = path.join(tempDir, "home");
    await mkdir(home, { recursive: true });

    const { exitCode, stdout, output } = await CLI.run(["list"], {
      dir: project.dir,
      globalHome: home,
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    return stdout;
  }

  it("names the marketplace the configuration records, as the terminal view does", async () => {
    const stdout = await listOverAPipe({ marketplace: PUBLIC_MARKETPLACE_SOURCE });

    expect(stdout).toContain(`\n${STEP_TEXT.LIST_MARKETPLACE_LINE}${PUBLIC_MARKETPLACE_SOURCE}\n`);
  });

  it("prints no marketplace line for a configuration that records none", async () => {
    const stdout = await listOverAPipe({});

    expect(
      stdout,
      "the installation is listed, so the absence is not a run that printed nothing",
    ).toContain("Installation: ");
    expect(stdout).not.toContain(STEP_TEXT.LIST_MARKETPLACE_LINE);
  });
});
