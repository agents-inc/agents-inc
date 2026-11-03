import { run } from "@oclif/core";
import { Chalk } from "chalk";
import { describe, expect, it, vi } from "vitest";

import { CLI_COLORS } from "../../../consts.js";
import { runCliCommand } from "./cli-runner.js";

vi.mock("@oclif/core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@oclif/core")>()),
  run: vi.fn(),
}));

// `vitest.setup.ts` turns the shared chalk's colour off, so a command run here would print none.
const TRUECOLOR_CHALK_LEVEL = 3;
const inColour = new Chalk({ level: TRUECOLOR_CHALK_LEVEL }).hex(CLI_COLORS.WARNING);

describe("runCliCommand", () => {
  it("hands back stdout, stderr and the error's message without colour, and rawStdout with it", async () => {
    vi.mocked(run).mockImplementation(async () => {
      process.stdout.write(`${inColour("written")}\n`);
      console.log(inColour("logged"));
      process.stderr.write(`${inColour("written")}\n`);
      console.warn(inColour("warned"));
      console.error(inColour("errored"));
      throw new Error(inColour("refused"));
    });

    const { stdout, stderr, rawStdout, error } = await runCliCommand(["any-command"]);

    expect(stdout).toBe("written\nlogged\n");
    expect(stderr).toBe("written\nwarned\nerrored\n");
    expect(error?.message).toBe("refused");
    expect(rawStdout).toBe(`${inColour("written")}\n${inColour("logged")}\n`);
    expect(rawStdout, "the command printed in colour").not.toBe(stdout);
  });
});
