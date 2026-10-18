import path from "path";
import { chmod, mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../../helpers/cli-runner.js";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { directoryExists, fileExists } from "../../test-fs-utils";
import { EXIT_CODES } from "../../../exit-codes";
import {
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  STACKS_FILE_PATH,
  STANDARD_FILES,
} from "../../../../consts";
import { sourceDir } from "../../../installation/install-layout.js";

const MARKETPLACE_NAME = "acme";

/** Spelled out, not imported: a test reading the module's own list would agree with any list. */
const RESERVED_MARKETPLACE_NAMES = ["agents-inc", "external", "local", "eject"] as const;

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
      expect(
        await directoryExists(sourceDir(path.join(projectDir, MARKETPLACE_NAME), "claude")),
      ).toBe(false);
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

  describe("what it says, word for word", () => {
    it("lists what it wrote, then numbers each next step", async () => {
      const marketplaceDir = path.join(projectDir, MARKETPLACE_NAME);

      const { stdout, error } = await runCliCommand(["new", "marketplace", MARKETPLACE_NAME]);

      expect(error).toBeUndefined();
      expect(stdout).toBe(
        [
          "",
          `✓ Created marketplace '${MARKETPLACE_NAME}' at ${marketplaceDir}`,
          "  package.json",
          "  config/skill-categories.ts",
          "  config/skill-rules.ts",
          "  config/stacks.ts",
          "  src/skills/acme-example-skill/SKILL.md",
          "  src/skills/acme-example-skill/metadata.yaml",
          "",
          "Next steps:",
          "  1. cd acme",
          "  2. Replace the placeholder 'author' in package.json with your own handle — it is what 'build marketplace' records as this marketplace's owner",
          "  3. Replace src/skills/acme-example-skill/ with a skill of your own. Every skill id must begin with 'acme-'",
          "  4. npx agents-inc build plugins",
          "  5. npx agents-inc build marketplace",
          "  6. Push it to GitHub, then add it from the Marketplace button at https://agentsinc.sh/editor",
          `  7. npx agents-inc init --from <id> --marketplace ${marketplaceDir}   (from a project — tests your local changes against a configuration built there)`,
          "",
          "",
        ].join("\n"),
      );
    });

    it("says what a marketplace name must look like", async () => {
      const { error } = await runCliCommand(["new", "marketplace", "AcmeSkills"]);

      expect(error?.message).toBe(
        "Marketplace name must be kebab-case (lowercase letters, numbers, and hyphens, starting with a letter)",
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("says why a reserved name is refused and which command to run instead", async () => {
      const { error } = await runCliCommand(["new", "marketplace", "local"]);

      expect(error?.message).toBe(
        "Marketplace name 'local' is reserved. 'agents-inc' is the public catalogue's own namespace, 'external' and 'local' hold the skills that belong to no marketplace, and 'eject' is what an installation records for a skill copied into it rather than installed as a plugin — a marketplace under any of them is read back as something it is not. Choose a name of your own: run 'npx agents-inc new marketplace <other-name>'.",
      );
    });

    it("says why it will not write into a directory that already holds files", async () => {
      const occupied = path.join(projectDir, MARKETPLACE_NAME);
      await mkdir(occupied, { recursive: true });
      await writeFile(path.join(occupied, STANDARD_FILES.PACKAGE_JSON), "{}\n");

      const { error } = await runCliCommand(["new", "marketplace", MARKETPLACE_NAME]);

      expect(error?.message).toBe(
        `${occupied} already holds files. A scaffold writes a whole marketplace, so it will not write into a directory that already has contents. Choose another name, or empty that directory first.`,
      );
    });

    // Root writes through the mode bits, so the refusal under test cannot happen there.
    it.skipIf(process.getuid?.() === 0)(
      "fails with the cause when the scaffold cannot be written",
      async () => {
        await chmod(projectDir, 0o555);
        try {
          const { error } = await runCliCommand(["new", "marketplace", MARKETPLACE_NAME]);

          expect(error?.message).toBe(
            `EACCES: permission denied, mkdir '${path.join(projectDir, MARKETPLACE_NAME)}'`,
          );
          expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        } finally {
          await chmod(projectDir, 0o755);
        }
      },
    );
  });
});
