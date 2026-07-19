import { describe, it, expect, beforeAll, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { EXIT_CODES } from "../pages/constants.js";
import {
  createTempDir,
  cleanupTempDir,
  createE2ESource,
  ensureBinaryExists,
  renderSkillMd,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";

const EXTRA_SKILL_DIR = "extra-search-marker";
const EXTRA_SKILL_DESCRIPTION = "Extra-source-only marker skill for search merge tests";
const EXTRA_SOURCE_NAME = "acme-extra";

/**
 * Creates an extras-style source directory at `<dir>/skills/<skillDir>/SKILL.md`.
 * Search loads extras with this flat layout (not the primary `src/skills` layout).
 */
async function createExtrasSourceWithSkill(
  baseDir: string,
  skillDir: string,
  description: string,
): Promise<string> {
  const sourceDir = path.join(baseDir, "extra-source");
  const skillPath = path.join(sourceDir, "skills", skillDir);
  await mkdir(skillPath, { recursive: true });
  await writeFile(
    path.join(skillPath, "SKILL.md"),
    renderSkillMd(skillDir, description, `# ${skillDir}`),
  );
  return sourceDir;
}

/**
 * E2E tests for the `search` command.
 *
 * The search command takes a single required positional `query` arg and
 * prints a read-only table of matching skills across the primary source
 * plus any registered extras. There are no flags.
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

  async function createSourceFixture(): Promise<void> {
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
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

      const { exitCode, stdout } = await CLI.run(
        ["search", "react"],
        { dir: tempDir },
        { env: { CC_SOURCE: sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("react");
      expect(stdout).toContain("Category");
      expect(stdout).toContain("Description");
    });

    it("should show no results message for unmatched query", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();

      const { exitCode, output } = await CLI.run(
        ["search", "zzz-nonexistent-skill-xyz"],
        { dir: tempDir },
        { env: { CC_SOURCE: sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("No skills found");
    });
  });

  describe("no matching results", () => {
    it("should show no results and include query in warning", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();

      const { exitCode, output } = await CLI.run(
        ["search", "zzz-absolutely-nothing-xyz"],
        { dir: tempDir },
        { env: { CC_SOURCE: sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("No skills found");
      expect(output).toContain("zzz-absolutely-nothing-xyz");
    });
  });

  describe("primary source from CC_SOURCE env var", () => {
    it("should load skills from the source pointed to by CC_SOURCE", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();

      const { exitCode, stdout } = await CLI.run(
        ["search", "framework"],
        { dir: tempDir },
        { env: { CC_SOURCE: sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // E2E source has react (web-framework) and hono (api-api with "framework" in description)
      expect(stdout).toContain("react");
      expect(stdout).toContain("hono");
    });
  });

  describe("extras merge", () => {
    it("should include skills from registered extra sources in results", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();

      // Register an extra source via project config (`sources` field).
      // Extras are loaded with a flat `<source>/skills/<dir>/SKILL.md` layout.
      const extraSourceDir = await createExtrasSourceWithSkill(
        tempDir,
        EXTRA_SKILL_DIR,
        EXTRA_SKILL_DESCRIPTION,
      );

      await writeProjectConfig(tempDir, {
        name: "search-extras-test",
        sources: [{ name: EXTRA_SOURCE_NAME, url: extraSourceDir }],
      });

      const { exitCode, stdout } = await CLI.run(
        ["search", "marker"],
        { dir: tempDir },
        { env: { CC_SOURCE: sourceDir } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // Skill from the extra source appears in the results table
      expect(stdout).toContain(EXTRA_SKILL_DIR);
      // Source label for the extra is the configured `name`
      expect(stdout).toContain(EXTRA_SOURCE_NAME);
    });
  });
});
