import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  readTreeSnapshot,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * Ejected, so each row carries the ⏏ mark after its name. Both outrun their half at either width,
 * and the second sits in the right half, beside the table's border.
 */
const LONG_SKILL_IDS = ["acme-react-component-patterns", "acme-release-checklist-for-services"];

/** Longer than the line beside the Marketplace label at either width. */
const LONG_MARKETPLACE_PATH =
  "/home/alexandra-montgomery/projects/acme-corporation/internal-agent-skills-marketplace-v2";

/**
 * `list` draws its frame only at a terminal, and every other spec runs it on a pipe. The frame is
 * pinned whole at two widths: at 100 columns each half starts or ends mid-column, at 80 neither.
 */
describe("list at a terminal, beside names longer than their column", () => {
  let tempDir: string | undefined;
  let prompt: InteractivePrompt | undefined;

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  async function listAt(size: { cols: number; rows: number }): Promise<string> {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    await writeProjectConfig(
      projectDir,
      buildProjectConfig({
        name: "long-names",
        marketplace: LONG_MARKETPLACE_PATH,
        skills: buildSkillConfigs(LONG_SKILL_IDS),
        agents: buildAgentConfigs(["web-developer"]),
      }),
    );

    const before = await readTreeSnapshot(tempDir);

    prompt = new InteractivePrompt(["list"], projectDir, { ...size, env: { HOME: home } });
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT);

    expect(exitCode, prompt.getOutput()).toBe(EXIT_CODES.SUCCESS);
    expect(
      await readTreeSnapshot(tempDir),
      "list reads the installation and writes nothing",
    ).toStrictEqual(before);
    return prompt.getScreen();
  }

  it(
    "keeps the Marketplace label, every letter of a name and the table's border at 80 columns",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const screen = await listAt(TERMINAL_SIZE.NARROWEST);

      expect(screen).toMatchInlineSnapshot(`
        "
         Mode Eject
         Marketplace /home/alexandra-montgomery/projects/acme-corporation/internal-agen
                     t-skills-marketplace-v2

         Skills                                            │  Agents
                                                           │
          Project                                          │   Project
         • acme-react-component   • acme-release-checkli   │  • web-developer
           -patterns ⏏              st-for-services ⏏      │"
      `);
    },
  );

  it(
    "keeps the Marketplace label, every letter of a name and the table's border at 100 columns",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const screen = await listAt(TERMINAL_SIZE.MIDDLE);

      expect(screen).toMatchInlineSnapshot(`
        "
         Mode Eject
         Marketplace /home/alexandra-montgomery/projects/acme-corporation/internal-agent-skills-marketplace
                     -v2

         Skills                                                         │  Agents
                                                                        │
          Project                                                       │   Project
         • acme-react-component-patter   • acme-release-checklist-for-s │  • web-developer
           ns ⏏                            ervices ⏏                    │"
      `);
    },
  );
});
