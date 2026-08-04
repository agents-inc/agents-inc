import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { typecheckGeneratedConfig } from "../helpers/type-check-probe.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createTempDir,
  ensureBinaryExists,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

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
 * CURRENTLY RED, deliberately: `ensureMinimalConfig` (eject.ts) writes
 * `config.ts` with a bare `writeFile` and no types sibling. Both the
 * `config-types.ts` existence assertion and the `tsc` verdict carry the red; the
 * tsc failure is `TS2307`, "cannot find module './config-types'".
 */
describe("eject at the home directory writes a complete config pair", () => {
  let tempDir: string | undefined;
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("writes config-types.ts beside the config.ts it invents, and the pair type-checks", async () => {
    const fakeHome = await createTempDir();
    tempDir = fakeHome;

    const { exitCode, output } = await CLI.run(
      ["eject", "skills", "--source", sourceDir],
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
    ).toContain(`from "./config-types"`);

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
