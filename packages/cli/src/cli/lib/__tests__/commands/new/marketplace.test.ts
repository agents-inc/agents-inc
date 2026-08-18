import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../../helpers/cli-runner.js";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { directoryExists, fileExists } from "../../test-fs-utils";
import { EXIT_CODES } from "../../../exit-codes";
import {
  CLAUDE_SRC_DIR,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  STACKS_FILE_PATH,
  STANDARD_FILES,
} from "../../../../consts";

/** The name every scaffold under test publishes under. */
const MARKETPLACE_NAME = "acme";

/**
 * The names no marketplace may publish under. Spelled out rather than imported:
 * the rule is these three strings, and a test that read the module's own list
 * would agree with any list it grew.
 */
const RESERVED_MARKETPLACE_NAMES = ["agents-inc", "external", "local"] as const;

/** Every file the published guide promises a marketplace directory holds. */
const PROMISED_FILES = [
  STANDARD_FILES.PACKAGE_JSON,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  STACKS_FILE_PATH,
  path.join(SKILLS_DIR_PATH, `${MARKETPLACE_NAME}-example-skill`, STANDARD_FILES.SKILL_MD),
  path.join(SKILLS_DIR_PATH, `${MARKETPLACE_NAME}-example-skill`, STANDARD_FILES.METADATA_YAML),
] as const;

describe("new:marketplace command", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("new-marketplace-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("name validation", () => {
    it("refuses a missing name argument", async () => {
      const { error } = await runCliCommand(["new:marketplace"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("refuses a name that is not kebab-case", async () => {
      const { error } = await runCliCommand(["new:marketplace", "AcmeSkills"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
      expect(error?.message).toContain("kebab-case");
    });

    it.each(RESERVED_MARKETPLACE_NAMES)(
      "refuses the reserved name '%s' and says why",
      async (reservedName) => {
        const { error } = await runCliCommand(["new:marketplace", reservedName]);

        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        expect(error?.message).toContain("reserved");
        expect(
          await directoryExists(path.join(projectDir, reservedName)),
          "a name that could never be published must leave no directory behind",
        ).toBe(false);
      },
    );
  });

  describe("existing target directory", () => {
    it("refuses a directory that already holds something, naming it", async () => {
      const occupied = path.join(projectDir, MARKETPLACE_NAME);
      await mkdir(occupied, { recursive: true });
      await writeFile(path.join(occupied, STANDARD_FILES.PACKAGE_JSON), "{}\n");

      const { error } = await runCliCommand(["new:marketplace", MARKETPLACE_NAME]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(occupied);
      expect(
        await fileExists(path.join(occupied, STACKS_FILE_PATH)),
        "a refused scaffold writes nothing into the directory it refused",
      ).toBe(false);
    });

    it("scaffolds into a directory that exists and is empty", async () => {
      await mkdir(path.join(projectDir, MARKETPLACE_NAME), { recursive: true });

      const { error } = await runCliCommand(["new:marketplace", MARKETPLACE_NAME]);

      expect(error?.oclif?.exit).toBeUndefined();
      expect(await fileExists(path.join(projectDir, MARKETPLACE_NAME, STACKS_FILE_PATH))).toBe(
        true,
      );
    });
  });

  describe("what a successful run leaves behind", () => {
    beforeEach(async () => {
      const { error } = await runCliCommand(["new:marketplace", MARKETPLACE_NAME]);
      expect(error?.message).toBeUndefined();
    });

    it.each(PROMISED_FILES)("writes %s", async (relPath) => {
      expect(await fileExists(path.join(projectDir, MARKETPLACE_NAME, relPath))).toBe(true);
    });

    it("leaves no config manifest — a marketplace is not an installation", async () => {
      expect(await directoryExists(path.join(projectDir, MARKETPLACE_NAME, CLAUDE_SRC_DIR))).toBe(
        false,
      );
    });
  });

  describe("what it tells the author to do next", () => {
    it("names the build commands that turn the scaffold into a published marketplace", async () => {
      const { stdout } = await runCliCommand(["new:marketplace", MARKETPLACE_NAME]);

      expect(stdout).toContain("build plugins");
      expect(stdout).toContain("build marketplace");
    });

    it("names the namespace every id the author adds must carry", async () => {
      const { stdout } = await runCliCommand(["new:marketplace", MARKETPLACE_NAME]);

      expect(stdout).toContain(`${MARKETPLACE_NAME}-`);
    });
  });
});
