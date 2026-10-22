import { describe, it, expect, afterEach } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  E2E_MARKETPLACE_NAME,
  EJECT_SOURCE_NAME,
  EXIT_CODES,
  PUBLIC_MARKETPLACE_NAME,
} from "../pages/constants.js";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import type { SkillId } from "../../src/cli/types/index.js";

/**
 * Only on disk (the E2E source ships no `playwright-e2e`), with a title unlike its id so the two
 * identity columns cannot match one string.
 */
const LOCAL_ONLY_SKILL = {
  id: "web-mocks-msw",
  slug: "playwright-e2e",
  display: "Playwright On Disk",
  description: "Browser automation kept on disk",
} as const satisfies { id: SkillId; slug: string; display: string; description: string };

/**
 * `search <query>`: a read-only table of matching skills from this installation's marketplace plus
 * local skills. No flags.
 */
describe("search command", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  /**
   * `search` takes no marketplace flag or env, so the config is the only place its source comes
   * from.
   */
  async function createSourceFixture(): Promise<void> {
    await writeProjectConfig(tempDir, {
      name: "search-fixture",
      marketplace: E2E_SOURCE.sourceDir,
    });
  }

  async function createLocalOnlySkill(): Promise<void> {
    await createLocalSkill(tempDir, LOCAL_ONLY_SKILL.id, {
      description: LOCAL_ONLY_SKILL.description,
      metadata: renderMetadataYaml({
        displayName: LOCAL_ONLY_SKILL.display,
        category: "web-testing",
        slug: LOCAL_ONLY_SKILL.slug,
        domain: "web",
        contentHash: "e5f6a7b",
      }),
    });
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

  describe("identity columns", () => {
    it("prints the skill's id and its display name in the same row", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();
      const spare = E2E_SKILL["visual-regression"];

      const { exitCode, stdout } = await CLI.run(["search", spare.slug], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // One match means one table row, so both strings are its cells.
      expect(stdout).toContain(`Found 1 skill matching "${spare.slug}"`);
      expect(stdout).toContain(spare.id);
      expect(stdout).toContain(spare.display);
    });

    it("prints the id of a skill that only exists on disk", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();
      await createLocalOnlySkill();

      const { exitCode, stdout } = await CLI.run(["search", LOCAL_ONLY_SKILL.slug], {
        dir: tempDir,
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(`Found 1 skill matching "${LOCAL_ONLY_SKILL.slug}"`);
      expect(stdout).toContain(LOCAL_ONLY_SKILL.id);
      expect(stdout).toContain(LOCAL_ONLY_SKILL.display);
    });
  });

  describe("source column", () => {
    it("names the marketplace the installation reads for a catalog skill", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();
      const spare = E2E_SKILL["visual-regression"];

      const { exitCode, stdout } = await CLI.run(["search", spare.slug], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // One match is one row. A cell is bounded by spaces, since every fixture id carries the
      // marketplace name followed by `-`; not by `│`, which @oclif/table drops when CI is truthy.
      expect(stdout).toContain(`Found 1 skill matching "${spare.slug}"`);
      expect(stdout).toContain(` ${E2E_MARKETPLACE_NAME} `);
      expect(stdout).not.toContain(` ${PUBLIC_MARKETPLACE_NAME} `);
      expect(stdout.toLowerCase()).not.toContain(EJECT_SOURCE_NAME);
    });

    it("names the local source for a skill that only exists on disk", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();
      await createLocalOnlySkill();

      const { exitCode, stdout } = await CLI.run(["search", LOCAL_ONLY_SKILL.slug], {
        dir: tempDir,
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(`Found 1 skill matching "${LOCAL_ONLY_SKILL.slug}"`);
      expect(stdout.toLowerCase()).toContain(EJECT_SOURCE_NAME);
      expect(stdout).not.toContain(` ${E2E_MARKETPLACE_NAME} `);
    });
  });

  describe("primary source from the configuration", () => {
    it("should load skills from the source the installation records", async () => {
      tempDir = await createTempDir();
      await createSourceFixture();

      const { exitCode, stdout } = await CLI.run(["search", "framework"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // hono matches through "framework" in its description.
      expect(stdout).toContain("react");
      expect(stdout).toContain("hono");
    });
  });
});
