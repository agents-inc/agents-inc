import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { HANDED_OUT_INVOCATIONS, cleanupTempDir, createTempDir } from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";

/**
 * Each invocation the CLI hands out is checked by running it. `HANDED_OUT_INVOCATIONS` is held to
 * the messages in `src/cli/` by `src/cli/lib/__tests__/handed-out-invocations.test.ts`. The verdict
 * is `SUCCESS`, not "not 127": a missing command can also exit 2.
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
