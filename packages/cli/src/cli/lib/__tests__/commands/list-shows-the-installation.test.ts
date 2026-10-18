import path from "path";
import { captureOutput } from "@oclif/test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLI_ROOT, runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { buildSkillConfig } from "../helpers/index.js";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { forgetTheProviderChosenForThisRun } from "../../installation/install-layout.js";
import { VITEST_MATRIX } from "../mock-data/mock-matrices";

/**
 * Imported from source rather than run through `dist/`, so `--provider`'s choice for the run can be
 * forgotten between specs: a dist module's state would outlive the spec that set it. The terminal
 * specs go through `runCliCommand`, whose stdout answers Ink's write callbacks.
 */
const { default: List } = await import("../../../commands/list.js");

/** Literals: a test reading the folders off the product would move with them. */
const CLAUDE_FOLDER = ".agents-inc/claude";
const CODEX_FOLDER = ".agents-inc/codex";

const MARKETPLACE = "github:acme/skills";

function runList(argv: string[] = []): ReturnType<typeof captureOutput> {
  return captureOutput(() => List.run(argv, { root: CLI_ROOT }));
}

describe("what list shows", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-list-shows-test-"));
    initializeMatrix(VITEST_MATRIX);
  });

  afterEach(async () => {
    forgetTheProviderChosenForThisRun();
    await cleanup();
  });

  function installationLines(folder: string): string[] {
    return [
      "",
      "Installation: installation",
      "  Mode:    Eject",
      "  Skills:  1",
      "  Agents:  0",
      `  Config:  ${path.join(projectDir, folder, "config.ts")}`,
      "",
      "",
    ];
  }

  async function installAt(folder: string): Promise<void> {
    await writeTestTsConfig(projectDir, buildProjectConfig({ name: "installation" }), folder);
  }

  it("says there is no installation here and how to create one", async () => {
    const { stdout, error } = await runList();

    expect(error).toBeUndefined();
    expect(stdout).toBe("No installation found.\nRun 'npx agents-inc init' to create one.\n");
  });

  it("prints the installation between blank lines when nothing is at a terminal", async () => {
    await installAt(CLAUDE_FOLDER);

    const { stdout } = await runList();

    expect(stdout).toBe(installationLines(CLAUDE_FOLDER).join("\n"));
  });

  it("names which of two installations it shows, and how to show the other", async () => {
    await installAt(CLAUDE_FOLDER);
    await installAt(CODEX_FOLDER);

    const { stdout } = await runList();

    expect(stdout).toBe(
      [
        `${process.cwd()} holds 2 installations — claude and codex — and this is the claude one. Show another with --provider <claude|codex>.`,
        ...installationLines(CLAUDE_FOLDER),
      ].join("\n"),
    );
  });

  it("shows the installation --provider names, and says nothing of the other", async () => {
    await installAt(CLAUDE_FOLDER);
    await installAt(CODEX_FOLDER);

    const { stdout } = await runList(["--provider", "codex"]);

    expect(stdout).toBe(installationLines(CODEX_FOLDER).join("\n"));
  });

  describe("at a terminal", () => {
    standAtTerminal();

    it("shows the mode, the marketplace and each active row, leaving excluded entries out", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "installation",
          marketplace: MARKETPLACE,
          skills: [
            buildSkillConfig("web-testing-vitest", { origin: "acme" }),
            buildSkillConfig("web-framework-react", { origin: "acme", excluded: true }),
          ],
          agents: [
            ...buildAgentConfigs(["web-developer"]),
            ...buildAgentConfigs(["api-developer"], { excluded: true }),
          ],
        }),
        CLAUDE_FOLDER,
      );

      const { stdout, error } = await runCliCommand(["list"]);

      expect(error).toBeUndefined();
      expect(stdout).toMatchInlineSnapshot(`
        "
         Mode Plugin
         Marketplace github:acme/skills

         Skills                                            │  Agents
                                                           │
          Project                                          │   Project
         • Vitest                                          │  • web-developer

        "
      `);
    });

    it("shows a pair's project half alone, leaving the global install it masks out", async () => {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "installation",
          skills: [
            buildSkillConfig("web-framework-react", { scope: "project" }),
            buildSkillConfig("web-framework-react", { scope: "global", excluded: true }),
          ],
          agents: [
            ...buildAgentConfigs(["web-developer"], { scope: "project" }),
            ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
          ],
        }),
        CLAUDE_FOLDER,
      );

      const { stdout } = await runCliCommand(["list"]);

      expect(stdout).toMatchInlineSnapshot(`
        "
         Mode Eject

         Skills                                            │  Agents
                                                           │
          Project                                          │   Project
         • React ⏏                                         │  • web-developer

        "
      `);
    });

    it("draws no marketplace line for an installation that names none", async () => {
      await installAt(CLAUDE_FOLDER);

      const { stdout } = await runCliCommand(["list"]);

      expect(stdout).toMatchInlineSnapshot(`
        "
         Mode Eject

         Skills                                            │  Agents
                                                           │
          Project                                          │   Project
         • React ⏏                                         │  • web-developer

        "
      `);
    });
  });
});
