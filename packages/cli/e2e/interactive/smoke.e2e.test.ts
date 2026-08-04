import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ensureBinaryExists, cleanupTempDir, createTempDir } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES } from "../pages/constants.js";

/**
 * Smoke tests for the CLI binary and E2E infrastructure.
 *
 * These verify that the CLI binary exists, can be spawned,
 * and produces expected output for non-interactive commands.
 */
describe("CLI smoke tests", () => {
  let projectDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    projectDir = await createTempDir();
  });

  afterAll(async () => {
    await cleanupTempDir(projectDir);
  });

  it("should capture --help output", async () => {
    const { exitCode, output } = await CLI.run(["--help"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("agents-inc");
    expect(output).toContain("TOPICS");
    expect(output).toContain("compile");
    expect(output).toContain("init");
  });

  it("should capture compile --help output", async () => {
    const { exitCode, output } = await CLI.run(["compile", "--help"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("compile");
    expect(output).toContain("--verbose");
    expect(output).toContain("USAGE");
  });

  it("should report exit code for non-interactive commands", async () => {
    const { exitCode } = await CLI.run(["--help"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
  });
});
