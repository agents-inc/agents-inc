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
 * `eject` invents a `.claude-src/config.ts` when the directory has none. The
 * generated file opens with `import type { ProjectConfig } from "./config-types"`
 * — so writing it alone hands the user a config that cannot resolve its own
 * types. `config.ts` and `config-types.ts` are one artifact and every write of
 * either owes the other.
 *
 * Run at $HOME (cwd === HOME), the global scope, where the invented config
 * becomes the global manifest every project's generated types import from — the
 * scope where a half-written pair does the most damage.
 *
 * `agent-partials` rather than `skills`, and the eject type is not incidental: a
 * directory with no config has no source either — `--marketplace` and `CC_MARKETPLACE` are
 * `init`'s alone (CLI-466), so nothing can point this run at the E2E fixture — and
 * `agent-partials` is the eject that reads no skills source at all. It writes the
 * same invented pair through the same `ensureMinimalConfig`, offline, instead of
 * ejecting the default public marketplace over the network.
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

    // Pre-condition for everything below: eject genuinely invented a config in a
    // directory that had none, and that config imports its own types.
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
