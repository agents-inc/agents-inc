import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCliCommand } from "../helpers/cli-runner.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  TEST_MARKETPLACE_NAME,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { renderMetadataYaml, renderSkillMd } from "../content-generators";
import { SKILLS } from "../test-fixtures";
import {
  DEFAULT_PUBLIC_SOURCE_NAME,
  EJECT_SOURCE,
  LOCAL_SKILLS_PATH,
  STANDARD_FILES,
} from "../../../consts";
import type { SkillId } from "../../../types";
import { EXIT_CODES } from "../../exit-codes";

/**
 * A skill only on disk: no source ships it. Also the fixture the identity columns are read off,
 * since `createTestSource` writes each source skill's `displayName` as its id.
 */
const EJECTED_SKILL = {
  id: "web-testing-playwright-e2e",
  slug: "playwright-e2e",
  display: "Playwright On Disk",
  description: "Browser automation kept on disk",
} as const satisfies { id: SkillId; slug: string; display: string; description: string };

/** The escape and carriage return a hostile catalogue can reach this table with. */
const ESCAPE = "\u001B";
const CARRIAGE_RETURN = "\r";
const ERASE_LINE = `${ESCAPE}[2K`;

const HOSTILE_DISPLAY_NAME = `Playwright${ERASE_LINE}${CARRIAGE_RETURN} ›   VERIFIED PUBLISHER`;
const HOSTILE_DESCRIPTION = `Browser automation${ERASE_LINE}${CARRIAGE_RETURN} kept on disk`;

const INERT_DISPLAY_NAME = "Playwright ›   VERIFIED PUBLISHER";
const INERT_DESCRIPTION = "Browser automation kept on disk";

/** Asserted as a cell: every id the marketplace ships starts with its name too. */
const TEST_MARKETPLACE_ORIGIN_CELL = `│ ${TEST_MARKETPLACE_NAME} │`;

/** `build plugins` writes what `build marketplace` lists, so they are named in that order. */
const BUILDS_IN_ORDER = /build plugins[\s\S]*build marketplace/;

describe("search command", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-search-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("argument validation", () => {
    it("should exit with error when query arg is missing", async () => {
      const { stderr, error } = await runCliCommand(["search"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
      const output = stderr + (error?.message ?? "");
      expect(output).toContain("Missing 1 required arg");
    });

    it("should accept the query positional", async () => {
      const sourceDirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      try {
        await writeTestTsConfig(projectDir, {
          name: "test-project",
          skills: [],
          agents: [],
          marketplace: sourceDirs.sourceDir,
        });

        const { stdout, error } = await runCliCommand(["search", "react"]);

        expect(error).toBeUndefined();
        expect(stdout).toContain("ID");
        expect(stdout).toContain("Origin");
        expect(stdout).toContain("Category");
        expect(stdout).toContain("Description");
      } finally {
        await cleanupTestSource(sourceDirs);
      }
    });
  });

  describe("output format", () => {
    it("should show loading message when starting", async () => {
      const { stdout } = await runCliCommand(["search", "anything"]);

      expect(stdout.toLowerCase()).toContain("loading");
    });
  });

  describe("with test source", () => {
    let sourceDirs: TestDirs;

    beforeEach(async () => {
      sourceDirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        marketplace: sourceDirs.sourceDir,
      });
    });

    afterEach(async () => {
      await cleanupTestSource(sourceDirs);
    });

    it("should return results matching query", async () => {
      const { stdout, error } = await runCliCommand(["search", "react"]);

      expect(error).toBeUndefined();
      expect(stdout.toLowerCase()).toContain("react");
    });

    it("names the source the installation reads rather than a fixed label", async () => {
      const { stdout, error } = await runCliCommand(["search", SKILLS.react.slug]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(`Found 1 skill matching "${SKILLS.react.slug}"`);
      expect(stdout).toContain(TEST_MARKETPLACE_ORIGIN_CELL);
      expect(stdout).not.toContain(`│ ${DEFAULT_PUBLIC_SOURCE_NAME} │`);
      expect(stdout).not.toContain("marketplace");
    });

    it("should return no results for unlikely query without crashing", async () => {
      const { stdout, stderr, error } = await runCliCommand(["search", "zzz-unlikely-query-xyz"]);

      expect(error).toBeUndefined();
      // this.warn() writes to stderr.
      const output = stdout + stderr;
      expect(output.toLowerCase()).toContain("no skills found");
    });
  });

  /** No `marketplace.json` is refused; "with test source" above is the permitted twin. */
  describe("with a marketplace nobody has built", () => {
    let sourceDirs: TestDirs;

    beforeEach(async () => {
      sourceDirs = await createTestSource({
        skills: inTestMarketplace(DEFAULT_TEST_SKILLS),
        unbuilt: true,
      });
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        marketplace: sourceDirs.sourceDir,
      });
    });

    afterEach(async () => {
      await cleanupTestSource(sourceDirs);
    });

    it("refuses rather than answering out of it, naming the builds that publish it", async () => {
      const { stdout, error } = await runCliCommand(["search", SKILLS.react.slug]);

      expect(error, "a marketplace with no marketplace.json must be refused").toBeDefined();
      expect(
        error?.message,
        "the refusal must name `build plugins` and then `build marketplace`",
      ).toMatch(BUILDS_IN_ORDER);
      expect(stdout, "a refused marketplace must not answer the query").not.toContain(
        `Found 1 skill matching "${SKILLS.react.slug}"`,
      );
    });
  });

  describe("with a skill ejected into the project", () => {
    let sourceDirs: TestDirs;

    beforeEach(async () => {
      sourceDirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        marketplace: sourceDirs.sourceDir,
      });
      await ejectSkillIntoProject();
    });

    afterEach(async () => {
      await cleanupTestSource(sourceDirs);
    });

    async function ejectSkillIntoProject(): Promise<void> {
      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, EJECTED_SKILL.id);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd(EJECTED_SKILL.id, EJECTED_SKILL.description),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({
          displayName: EJECTED_SKILL.display,
          category: "web-testing",
          slug: EJECTED_SKILL.slug,
          domain: "web",
          contentHash: "e5f6a7b",
        }),
      );
    }

    it("prints the skill's id and its display name in the same row", async () => {
      const { stdout, error } = await runCliCommand(["search", EJECTED_SKILL.slug]);

      expect(error).toBeUndefined();
      // One match: both strings below are cells of the one row.
      expect(stdout).toContain(`Found 1 skill matching "${EJECTED_SKILL.slug}"`);
      expect(stdout).toContain(EJECTED_SKILL.id);
      expect(stdout).toContain(EJECTED_SKILL.display);
    });

    it("names the local source for it, not the marketplace", async () => {
      const { stdout, error } = await runCliCommand(["search", EJECTED_SKILL.slug]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(`Found 1 skill matching "${EJECTED_SKILL.slug}"`);
      expect(stdout.toLowerCase()).toContain(EJECT_SOURCE);
      expect(stdout).not.toContain(TEST_MARKETPLACE_ORIGIN_CELL);
    });
  });

  describe("with a skill whose catalogue metadata carries terminal escapes", () => {
    let sourceDirs: TestDirs;

    beforeEach(async () => {
      sourceDirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        marketplace: sourceDirs.sourceDir,
      });
      await ejectHostileSkillIntoProject();
    });

    afterEach(async () => {
      await cleanupTestSource(sourceDirs);
    });

    /** `--marketplace` is supported, so a stranger's `metadata.yaml` fields reach this table. */
    async function ejectHostileSkillIntoProject(): Promise<void> {
      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, EJECTED_SKILL.id);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd(EJECTED_SKILL.id, HOSTILE_DESCRIPTION),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({
          displayName: HOSTILE_DISPLAY_NAME,
          category: "web-testing",
          slug: EJECTED_SKILL.slug,
          domain: "web",
          contentHash: "e5f6a7b",
        }),
      );
    }

    it("renders an author's display name and description without their escapes", async () => {
      const { rawStdout, stdout, error } = await runCliCommand(["search", EJECTED_SKILL.slug]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(`Found 1 skill matching "${EJECTED_SKILL.slug}"`);

      // Escape checked on `rawStdout`: `runCliCommand` strips ANSI from `stdout`, so a negation
      // there passes whatever was written.
      expect(rawStdout).not.toContain(ESCAPE);
      expect(rawStdout).not.toContain(CARRIAGE_RETURN);
      expect(stdout).toContain(INERT_DISPLAY_NAME);
      expect(stdout).toContain(INERT_DESCRIPTION);
    });

    it("still prints an ordinary row for a skill whose metadata is honest", async () => {
      // The permitted case: without it the spec above passes on a table that renders nothing.
      const { stdout, error } = await runCliCommand(["search", SKILLS.react.slug]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(SKILLS.react.displayName);
      expect(stdout).toContain(TEST_MARKETPLACE_ORIGIN_CELL);
    });
  });

  describe("what a search prints", () => {
    let sourceDirs: TestDirs;

    beforeEach(async () => {
      sourceDirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        marketplace: sourceDirs.sourceDir,
      });
    });

    afterEach(async () => {
      await cleanupTestSource(sourceDirs);
    });

    /** Two skills on disk whose names order differently by case: "_" sits between Z and a. */
    const BROWSER_SKILLS = [
      { id: "web-testing-playwright-e2e", slug: "playwright-e2e", display: "Browsers" },
      { id: "web-testing-cypress-e2e", slug: "cypress-e2e", display: "Browser_Tests" },
    ] as const satisfies readonly { id: SkillId; slug: string; display: string }[];

    async function ejectBrowserSkills(): Promise<void> {
      for (const skill of BROWSER_SKILLS) {
        const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, skill.id);
        await mkdir(skillDir, { recursive: true });
        await writeFile(
          path.join(skillDir, STANDARD_FILES.SKILL_MD),
          renderSkillMd(skill.id, "End-to-end browser testing"),
        );
        await writeFile(
          path.join(skillDir, STANDARD_FILES.METADATA_YAML),
          renderMetadataYaml({
            displayName: skill.display,
            category: "web-testing",
            slug: skill.slug,
            domain: "web",
            contentHash: "e5f6a7b",
          }),
        );
      }
    }

    it("counts the matches in the plural and lays them out as one table between blank lines", async () => {
      const { stdout, error } = await runCliCommand(["search", "web"]);

      expect(error).toBeUndefined();
      expect(stdout).toMatchInlineSnapshot(`
        "Loading skills...

        Found 4 skills matching "web"

        ┌──────────────────────────────────┬──────────────────────────────────┬──────────────┬──────────────────┬──────────────────────────────────────────────┐
        │ ID                               │ Name                             │ Origin       │ Category         │ Description                                  │
        ├──────────────────────────────────┼──────────────────────────────────┼──────────────┼──────────────────┼──────────────────────────────────────────────┤
        │ test-fixture-api-framework-hono  │ test-fixture-api-framework-hono  │ test-fixture │ api-api          │ Lightweight web framework for the edge       │
        ├──────────────────────────────────┼──────────────────────────────────┼──────────────┼──────────────────┼──────────────────────────────────────────────┤
        │ test-fixture-web-framework-react │ test-fixture-web-framework-react │ test-fixture │ web-framework    │ React framework for building user interfaces │
        ├──────────────────────────────────┼──────────────────────────────────┼──────────────┼──────────────────┼──────────────────────────────────────────────┤
        │ test-fixture-web-state-zustand   │ test-fixture-web-state-zustand   │ test-fixture │ web-client-state │ Bear necessities state management            │
        ├──────────────────────────────────┼──────────────────────────────────┼──────────────┼──────────────────┼──────────────────────────────────────────────┤
        │ test-fixture-web-testing-vitest  │ test-fixture-web-testing-vitest  │ test-fixture │ web-testing      │ Next generation testing framework            │
        └──────────────────────────────────┴──────────────────────────────────┴──────────────┴──────────────────┴──────────────────────────────────────────────┘


        "
      `);
    });

    it("orders the rows by display name whatever their case", async () => {
      await ejectBrowserSkills();

      const { stdout, error } = await runCliCommand(["search", "e2e"]);

      expect(error).toBeUndefined();
      expect(stdout).toMatchInlineSnapshot(`
        "Loading skills...

        Found 2 skills matching "e2e"

        ┌────────────────────────────┬───────────────┬────────┬─────────────┬────────────────────────────┐
        │ ID                         │ Name          │ Origin │ Category    │ Description                │
        ├────────────────────────────┼───────────────┼────────┼─────────────┼────────────────────────────┤
        │ web-testing-cypress-e2e    │ Browser_Tests │ eject  │ web-testing │ End-to-end browser testing │
        ├────────────────────────────┼───────────────┼────────┼─────────────┼────────────────────────────┤
        │ web-testing-playwright-e2e │ Browsers      │ eject  │ web-testing │ End-to-end browser testing │
        └────────────────────────────┴───────────────┴────────┴─────────────┴────────────────────────────┘


        "
      `);
    });
  });
});
