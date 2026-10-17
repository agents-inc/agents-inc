import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupTempDir,
  createTempDir,
  writeConfigTypes,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import "../matchers/setup.js";

/**
 * `uninstall --yes` prints and exits, so it skips the terminal size gate; held there it would never
 * finish.
 */
describe("uninstall on a terminal below the minimum size", () => {
  let tempDir: string | undefined;
  let prompt: InteractivePrompt | undefined;

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "does not wait for a bigger terminal before it starts",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const home = path.join(tempDir, "home");
      await writeProjectConfig(
        home,
        buildProjectConfig({ name: "small-terminal-uninstall", skills: [], agents: [] }),
      );
      await writeConfigTypes(home);

      // One row under the gate, where `TERMINAL_SIZE.SHORT` sits.
      prompt = new InteractivePrompt(["uninstall", "--yes"], home, {
        rows: TERMINAL_SIZE.SHORT.rows - 1,
        cols: TERMINAL_SIZE.SHORT.cols,
        env: { HOME: home },
      });
      // Bounded wait read as the answer: a run held at the gate never exits.
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT).catch(() => undefined);
      const output = prompt.getRawOutput();

      expect(output, "uninstall stopped to ask for a bigger terminal").not.toContain(
        STEP_TEXT.RESIZE_PROMPT,
      );
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      await expectNoSourceFolder(home, "uninstall removed the config it was asked to remove");
    },
  );
});
