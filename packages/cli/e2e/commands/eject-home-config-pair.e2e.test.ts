import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { typecheckGeneratedConfig } from "../helpers/type-check-probe.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createTempDir,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";

/**
 * `eject` at $HOME invents config.ts and must write config-types.ts beside it, since the config
 * imports its types. `agent-partials` because it reads no skills source, so the run stays offline.
 */
describe("eject at the home directory writes a complete config pair", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("writes config-types.ts beside the config.ts it invents, and the pair type-checks", async () => {
    const fakeHome = await createTempDir();
    tempDir = fakeHome;

    const { exitCode, output } = await CLI.run(
      ["eject", "agent-partials"],
      { dir: fakeHome },
      { env: { HOME: fakeHome } },
    );

    expect(exitCode, `eject at HOME failed: ${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.EJECT_SUCCESS);

    // Pre-condition: eject really invented a config that imports its own types.
    expect(
      await fileExists(configTsPath(fakeHome)),
      "eject must leave a config.ts in a directory that had none",
    ).toBe(true);
    expect(
      await readTestFile(configTsPath(fakeHome)),
      "the invented config.ts must import from its config-types sibling",
    ).toContain("from './config-types'");

    expect(
      await fileExists(configTypesTsPath(fakeHome)),
      `eject must write ${FILES.CONFIG_TYPES_TS} beside the ${FILES.CONFIG_TS} it invented`,
    ).toBe(true);

    const typecheck = await typecheckGeneratedConfig(path.dirname(configTsPath(fakeHome)));
    expect(
      typecheck.exitCode,
      `The config pair eject wrote must type-check.\ntsc output:\n${typecheck.output || "(no diagnostics)"}`,
    ).toBe(EXIT_CODES.SUCCESS);
  });
});
