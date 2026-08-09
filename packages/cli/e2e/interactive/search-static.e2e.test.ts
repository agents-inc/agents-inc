import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { EXIT_CODES } from "../pages/constants.js";
import {
  createTempDir,
  cleanupTempDir,
  createE2ESource,
  ensureBinaryExists,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";

/**
 * E2E tests for the `search` command.
 *
 * The search command takes a single required positional `query` arg and
 * prints a read-only table of matching skills from the one marketplace this
 * installation reads, plus the local skills already on disk. There are no flags.
 */
describe("search command", () => {
  let tempDir: string;
  let sourceDir: string | undefined;
  let sourceTempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
    if (sourceTempDir) {
      await cleanupTempDir(sourceTempDir);
      sourceTempDir = undefined;
    }
  });

  /**
   * An installation in `tempDir` whose config names a fresh E2E source.
   *
   * `search` has no flags and reads no `CC_SOURCE` — naming a source is `init`'s decision —
   * so the config is the only place the source it answers from can come from.
   */
  async function createSourceFixture(): Promise<void> {
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
    await writeProjectConfig(tempDir, { name: "search-fixture", source: sourceDir });
  }

  describe("search --help", () => {
    it("should display help text with command description", async () => {
      tempDir = await createTempDir();

      const { exitCode, stdout } = await CLI.run(["search", "--help"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Search");
      expect(stdout).toContain("USAGE");
      expect(stdout).toContain("query");
    });
  });

  describe("argument validation", () => {
    it("should exit with INVALID_ARGS when query is missing", async () => {
      tempDir = await createTempDir();

      const { exitCode, output } = await CLI.run(["search"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
      expect(output).toContain("Missing 1 required arg");
    });
  });

  describe("search with query argument", () => {
    it("should display a table of matching skills", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();

      const { exitCode, stdout } = await CLI.run(["search", "react"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("react");
      expect(stdout).toContain("Category");
      expect(stdout).toContain("Description");
    });

    it("should show no results message for unmatched query", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();

      const { exitCode, output } = await CLI.run(["search", "zzz-nonexistent-skill-xyz"], {
        dir: tempDir,
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("No skills found");
    });
  });

  describe("no matching results", () => {
    it("should show no results and include query in warning", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();

      const { exitCode, output } = await CLI.run(["search", "zzz-absolutely-nothing-xyz"], {
        dir: tempDir,
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("No skills found");
      expect(output).toContain("zzz-absolutely-nothing-xyz");
    });
  });

  describe("primary source from the configuration", () => {
    it("should load skills from the source the installation records", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();

      const { exitCode, stdout } = await CLI.run(["search", "framework"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // E2E source has react (web-framework) and hono (api-api with "framework" in description)
      expect(stdout).toContain("react");
      expect(stdout).toContain("hono");
    });
  });
});
