import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { writeRawTestConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { buildProjectConfig } from "../factories/config-factories.js";
import { renderUnparseableConfigTs } from "../factories/unloadable-config-factories.js";
import { CTRL_C, delay, RENDER_DELAY_MS } from "../test-constants";
import { EXIT_CODES } from "../../exit-codes";

/** The oclif `init` hook runs before every command, and is the whole of a run that names none. */
describe("the oclif init hook", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-bare-run-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("on a run that names no command", () => {
    it("shows the root help where nothing is installed, and leaves the run to oclif", async () => {
      const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

      const { stdout, error } = await runCliCommand([]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("USAGE\n  $ agents-inc [COMMAND]");
      expect(exit.mock.calls).toStrictEqual([]);
    });

    it("refuses an unreadable config, naming it and the way out", async () => {
      const configPath = await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

      const { error } = await runCliCommand([]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(flattenCliOutput(error?.message ?? "")).toContain(
        flattenCliOutput(`This project's config at '${configPath}' could not be loaded:`),
      );
      expect(flattenCliOutput(error?.message ?? "")).toContain(
        flattenCliOutput(
          `There is no automatic repair for this — fix the file, or recreate the configuration by running 'npx agents-inc uninstall' from '${process.cwd()}'`,
        ),
      );
    });

    it("prints the dashboard of an installation and ends the run there, successfully", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig({ name: "installation" }));
      const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

      const { stdout } = await runCliCommand([]);

      expect(
        stdout.startsWith(
          [
            "Agents Inc.",
            "",
            "  Skills:       1 installed",
            "  Agents:       0 compiled",
            "  Mode:         Eject",
            "",
            "  [Edit in the web editor]  [Compile]  [Doctor]  [List]",
            "",
          ].join("\n"),
        ),
      ).toBe(true);
      expect(exit.mock.calls).toStrictEqual([[EXIT_CODES.SUCCESS]]);
    });

    describe("at a terminal", () => {
      const terminal = standAtTerminal();

      it("cancels the run when the dashboard is interrupted", async () => {
        await writeTestTsConfig(projectDir, buildProjectConfig({ name: "installation" }));

        const run = runCliCommand([]);
        await delay(RENDER_DELAY_MS);
        terminal.input.push(CTRL_C);
        const { error } = await run;

        expect(error?.message).toBe("Cancelled");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.CANCELLED);
      });
    });
  });
});
