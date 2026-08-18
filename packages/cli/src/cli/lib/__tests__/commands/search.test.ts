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

const COMMAND_TIMEOUT = 30_000;

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
    it(
      "should exit with error when query arg is missing",
      { timeout: COMMAND_TIMEOUT },
      async () => {
        const { stderr, error } = await runCliCommand(["search"]);

        expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
        const output = stderr + (error?.message ?? "");
        expect(output).toContain("Missing 1 required arg");
      },
    );

    it("should accept the query positional", { timeout: COMMAND_TIMEOUT }, async () => {
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
    it("should show loading message when starting", { timeout: COMMAND_TIMEOUT }, async () => {
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

    it("should return results matching query", { timeout: COMMAND_TIMEOUT }, async () => {
      const { stdout, error } = await runCliCommand(["search", "react"]);

      expect(error).toBeUndefined();
      expect(stdout.toLowerCase()).toContain("react");
    });

    it(
      "names the source the installation reads rather than a fixed label",
      { timeout: COMMAND_TIMEOUT },
      async () => {
        const { stdout, error } = await runCliCommand(["search", SKILLS.react.slug]);

        expect(error).toBeUndefined();
        expect(stdout).toContain(`Found 1 skill matching "${SKILLS.react.slug}"`);
        expect(stdout).toContain(DEFAULT_PUBLIC_SOURCE_NAME);
        expect(stdout).not.toContain("marketplace");
      },
    );

    it(
      "should return no results for unlikely query without crashing",
      { timeout: COMMAND_TIMEOUT },
      async () => {
        const { stdout, stderr, error } = await runCliCommand(["search", "zzz-unlikely-query-xyz"]);

        // Should complete without crashing — warns about no results
        expect(error).toBeUndefined();
        // this.warn() writes to stderr in oclif
        const output = stdout + stderr;
        expect(output.toLowerCase()).toContain("no skills found");
      },
    );
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

    it(
      "prints the skill's id and its display name in the same row",
      { timeout: COMMAND_TIMEOUT },
      async () => {
        const { stdout, error } = await runCliCommand(["search", EJECTED_SKILL.slug]);

        expect(error).toBeUndefined();
        // One match means the table body is one row, so both strings below are cells of it.
        expect(stdout).toContain(`Found 1 skill matching "${EJECTED_SKILL.slug}"`);
        expect(stdout).toContain(EJECTED_SKILL.id);
        expect(stdout).toContain(EJECTED_SKILL.display);
      },
    );

    it(
      "names the local source for it, not the marketplace",
      { timeout: COMMAND_TIMEOUT },
      async () => {
        const { stdout, error } = await runCliCommand(["search", EJECTED_SKILL.slug]);

        expect(error).toBeUndefined();
        expect(stdout).toContain(`Found 1 skill matching "${EJECTED_SKILL.slug}"`);
        expect(stdout.toLowerCase()).toContain(EJECT_SOURCE);
        expect(stdout).not.toContain(DEFAULT_PUBLIC_SOURCE_NAME);
      },
    );
  });
});
