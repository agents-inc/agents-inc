import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { HANDED_OUT_INVOCATIONS, cleanupTempDir, createTempDir } from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";

/**
 * A message that hands the reader an invocation is checked by RUNNING it, never by matching it.
 *
 * `compile`'s no-skills refusal named `agents-inc add <skill>` for as long as the message
 * existed, and there has never been an `add` command. Specs asserted the wording and were right
 * about it; the documentation quoted it and was right about it. The instruction still exited
 * 127, because a quotation is a claim about the past and the command roster is a fact about the
 * present — only the binary can be asked for it.
 *
 * `HANDED_OUT_INVOCATIONS` is not a list this file wrote. `src/cli/lib/__tests__/handed-out-
 * invocations.test.ts` reads every message in `src/cli/` and refuses a list that has stopped
 * describing them, so an invocation reaching a user reaches this run as well.
 *
 * The verdict is `SUCCESS` rather than "not 127", because the two ways to be absent differ and
 * only success is one value: measured on this binary, `init --help` exits 0, `add --help` exits
 * 2 on oclif's help-topic refusal, and a bare `add react` exits 127 through
 * `@oclif/plugin-not-found`.
 */
describe("every invocation the CLI hands out is one the CLI answers", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await createTempDir();
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  for (const invocation of HANDED_OUT_INVOCATIONS) {
    it(`answers '${invocation.join(" ")}'`, async () => {
      const { exitCode, output } = await CLI.run([...invocation, "--help"], { dir: tempDir });

      expect(
        exitCode,
        `guidance in src/cli tells the user to run '${invocation.join(" ")}', and this binary answered: ${output}`,
      ).toBe(EXIT_CODES.SUCCESS);
    });
  }
});
