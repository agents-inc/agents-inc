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
 * A skill present only in the project's `.claude/skills/` — `DEFAULT_TEST_SKILLS`
 * ships no playwright skill, so the matrix can only have reached it from disk and
 * its own metadata.yaml is the only thing naming it.
 *
 * That is also why it is the fixture the identity columns are read off:
 * `createTestSource` writes every source skill's `displayName` as its id, so a
 * source skill satisfies "shows the id" and "shows the display name" with one
 * string and tells the two columns apart for nobody.
 */
const EJECTED_SKILL = {
  id: "web-testing-playwright-e2e",
  slug: "playwright-e2e",
  display: "Playwright On Disk",
  description: "Browser automation kept on disk",
} as const satisfies { id: SkillId; slug: string; display: string; description: string };

/**
 * The escape a hostile catalogue reaches this table with, and the carriage return beside it —
 * the pair the CLI-855 lane watched a real terminal obey in a 503 body.
 */
const ESCAPE = "\u001B";
const CARRIAGE_RETURN = "\r";
const ERASE_LINE = `${ESCAPE}[2K`;

/** A display name and a description as a stranger's `metadata.yaml` would carry them. */
const HOSTILE_DISPLAY_NAME = `Playwright${ERASE_LINE}${CARRIAGE_RETURN} ›   VERIFIED PUBLISHER`;
const HOSTILE_DESCRIPTION = `Browser automation${ERASE_LINE}${CARRIAGE_RETURN} kept on disk`;

/** The same strings once the terminal can no longer act on them. */
const INERT_DISPLAY_NAME = "Playwright ›   VERIFIED PUBLISHER";
const INERT_DESCRIPTION = "Browser automation kept on disk";

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
        // The table prints headers when there are matches
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

      // Should show loading message as first output
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
      expect(stdout).toContain(DEFAULT_PUBLIC_SOURCE_NAME);
      expect(stdout).not.toContain("marketplace");
    });

    it("should return no results for unlikely query without crashing", async () => {
      const { stdout, stderr, error } = await runCliCommand(["search", "zzz-unlikely-query-xyz"]);

      // Should complete without crashing — warns about no results
      expect(error).toBeUndefined();
      // this.warn() writes to stderr in oclif
      const output = stdout + stderr;
      expect(output.toLowerCase()).toContain("no skills found");
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

    /** Writes {@link EJECTED_SKILL} where an eject-mode install leaves a skill. */
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
      // One match means the table body is one row, so both strings below are cells of it.
      expect(stdout).toContain(`Found 1 skill matching "${EJECTED_SKILL.slug}"`);
      expect(stdout).toContain(EJECTED_SKILL.id);
      expect(stdout).toContain(EJECTED_SKILL.display);
    });

    it("names the local source for it, not the marketplace", async () => {
      const { stdout, error } = await runCliCommand(["search", EJECTED_SKILL.slug]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(`Found 1 skill matching "${EJECTED_SKILL.slug}"`);
      expect(stdout.toLowerCase()).toContain(EJECT_SOURCE);
      expect(stdout).not.toContain(DEFAULT_PUBLIC_SOURCE_NAME);
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

    /**
     * The same eject the block above writes, with the two fields an author controls carrying the
     * sequence that forged a store refusal. `metadata.yaml` is the whole vector: `--marketplace`
     * is a supported input, so the display name and description in a stranger's repository reach
     * this table by the product's advertised route rather than by an attack on it.
     */
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

      // The words survive; the terminal's ability to act on them does not. Asserted on the
      // rendered table rather than on a cell picked back out of it.
      //
      // The escape half is read off `rawStdout` rather than `stdout`, and that is the whole of
      // what makes it an assertion: `runCliCommand` puts `stdout` through `ansis.strip`, so a
      // negation of an escape made against it passes whatever the command wrote. The carriage
      // return survives that strip and its negation always bit, which is why only one of this
      // pair was ever load-bearing. The escape this now sees is `@oclif/table`'s own SGR reset
      // as much as the catalogue's erase-line — the table sizes its columns over those bytes,
      // so a leak moves the border as well as the cursor.
      expect(rawStdout).not.toContain(ESCAPE);
      expect(rawStdout).not.toContain(CARRIAGE_RETURN);
      expect(stdout).toContain(INERT_DISPLAY_NAME);
      expect(stdout).toContain(INERT_DESCRIPTION);
    });

    it("still prints an ordinary row for a skill whose metadata is honest", async () => {
      // The permitted case. Without it the spec above is satisfied by a table that renders
      // nothing at all, and the one that follows cannot tell a strip from a blank column.
      const { stdout, error } = await runCliCommand(["search", SKILLS.react.slug]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(SKILLS.react.displayName);
      expect(stdout).toContain(DEFAULT_PUBLIC_SOURCE_NAME);
    });
  });
});
