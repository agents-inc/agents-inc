import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { runCliCommand } from "../../helpers/cli-runner.js";
import { fileExists, directoryExists } from "../../test-fs-utils";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { createImportSource } from "../../helpers/disk-writers.js";
import type { ImportSourceSkill } from "../../mock-data/mock-skills.js";
import { EXIT_CODES } from "../../../exit-codes";
import { LOCAL_SKILLS_PATH, STANDARD_FILES } from "../../../../consts";

// Plain directory name (no slashes/colons) so parseGitHubSource passes it
// through as-is and fetchFromSource treats it as a local path relative to cwd
const LOCAL_SOURCE_NAME = "testrepo";

function toImportSourceSkill(
  name: string,
  options?: { withMetadata?: boolean },
): ImportSourceSkill {
  return {
    name,
    content: `# ${name}\n\nThis is the ${name} skill.\n`,
    ...(options?.withMetadata && { metadata: { author: "@external" } }),
  };
}

async function createLocalSource(
  projectDir: string,
  skills: string[],
  options?: { withMetadata?: boolean },
): Promise<void> {
  await createImportSource(
    projectDir,
    LOCAL_SOURCE_NAME,
    skills.map((name) => toImportSourceSkill(name, options)),
  );
}

describe("import:skill command", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("import-skill-test-home-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("argument validation", () => {
    it("should reject missing source argument", async () => {
      const { error } = await runCliCommand(["import:skill"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("should require at least one of --skill, --all, or --list", async () => {
      const { error } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("should reject --skill and --all together", async () => {
      const { error } = await runCliCommand([
        "import:skill",
        LOCAL_SOURCE_NAME,
        "--skill",
        "my-skill",
        "--all",
      ]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });
  });

  describe("flag validation", () => {
    it("should accept --force flag", async () => {
      const { error } = await runCliCommand([
        "import:skill",
        LOCAL_SOURCE_NAME,
        "--all",
        "--force",
      ]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept -n shorthand for --skill", async () => {
      const { error } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "-n", "my-skill"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept -a shorthand for --all", async () => {
      const { error } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "-a"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept -l shorthand for --list", async () => {
      const { error } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "-l"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });
  });

  describe("source format parsing", () => {
    // These tests verify parseGitHubSource behavior indirectly by checking
    // that the command does not error on format parsing for different source styles.
    // All formats will fail on fetch (network error) but should not fail on
    // format parsing itself.

    it("should accept full GitHub URL format", async () => {
      const { error } = await runCliCommand([
        "import:skill",
        "https://github.com/owner/repo",
        "--list",
      ]);

      // Should not error on source format parsing (will fail on network)
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("invalid source format");
    });

    it("should accept github: prefix format", async () => {
      const { error } = await runCliCommand(["import:skill", "github:owner/repo", "--list"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("invalid source format");
    });

    it("should accept gh: prefix format", async () => {
      const { error } = await runCliCommand(["import:skill", "gh:owner/repo", "--list"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("invalid source format");
    });

    it("should accept bare owner/repo format", async () => {
      const { error } = await runCliCommand(["import:skill", "owner/repo", "--list"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("invalid source format");
    });
  });

  describe("--list mode", () => {
    it("should list available skills without error", async () => {
      await createLocalSource(projectDir, ["react-patterns", "testing-utils"]);

      const { error } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "--list"]);

      // Should complete without error exit code
      expect(error?.oclif?.exit).toBeUndefined();
    });

    it("should error when source has no valid skills", async () => {
      // Create source with empty skills directory (no SKILL.md files)
      const skillsDir = path.join(projectDir, LOCAL_SOURCE_NAME, "skills");
      await mkdir(skillsDir, { recursive: true });

      const { error } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "--list"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });
  });

  describe("--skill import", () => {
    it("should import a specific skill to .claude/skills/", async () => {
      await createLocalSource(projectDir, ["react-patterns", "testing-utils"]);

      const { error } = await runCliCommand([
        "import:skill",
        LOCAL_SOURCE_NAME,
        "--skill",
        "react-patterns",
      ]);

      expect(error?.oclif?.exit).toBeUndefined();

      // Verify skill was copied to the destination
      const destSkillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "react-patterns");
      expect(await directoryExists(destSkillDir)).toBe(true);
      expect(await fileExists(path.join(destSkillDir, STANDARD_FILES.SKILL_MD))).toBe(true);
    });

    it("should error when requested skill does not exist in source", async () => {
      await createLocalSource(projectDir, ["existing-skill"]);

      const { error } = await runCliCommand([
        "import:skill",
        LOCAL_SOURCE_NAME,
        "--skill",
        "nonexistent-skill",
      ]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("should inject forkedFrom metadata into metadata.yaml", async () => {
      await createLocalSource(projectDir, ["my-skill"]);

      const { error } = await runCliCommand([
        "import:skill",
        LOCAL_SOURCE_NAME,
        "--skill",
        "my-skill",
      ]);

      expect(error?.oclif?.exit).toBeUndefined();

      // Read the created metadata.yaml
      const metadataPath = path.join(
        projectDir,
        LOCAL_SKILLS_PATH,
        "my-skill",
        STANDARD_FILES.METADATA_YAML,
      );
      expect(await fileExists(metadataPath)).toBe(true);

      const content = await readFile(metadataPath, "utf-8");
      const metadata = parseYaml(content);

      expect(metadata.forkedFrom).toStrictEqual({
        skillName: "my-skill",
        source: LOCAL_SOURCE_NAME,
        contentHash: expect.any(String),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
    });

    it("should preserve existing metadata.yaml and add forkedFrom", async () => {
      await createLocalSource(projectDir, ["my-skill"], { withMetadata: true });

      const { error } = await runCliCommand([
        "import:skill",
        LOCAL_SOURCE_NAME,
        "--skill",
        "my-skill",
      ]);

      expect(error?.oclif?.exit).toBeUndefined();

      const metadataPath = path.join(
        projectDir,
        LOCAL_SKILLS_PATH,
        "my-skill",
        STANDARD_FILES.METADATA_YAML,
      );
      const content = await readFile(metadataPath, "utf-8");
      const metadata = parseYaml(content);

      // Original metadata fields should be preserved
      expect(metadata.author).toBe("@external");
      // forkedFrom should be injected
      expect(metadata.forkedFrom.skillName).toBe("my-skill");
    });
  });

  describe("--all import", () => {
    it("should import all skills from the repository", async () => {
      const skillNames = ["skill-alpha", "skill-beta", "skill-gamma"];
      await createLocalSource(projectDir, skillNames);

      const { error } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "--all"]);

      expect(error?.oclif?.exit).toBeUndefined();

      // Verify all skills were imported
      for (const name of skillNames) {
        const destDir = path.join(projectDir, LOCAL_SKILLS_PATH, name);
        expect(await directoryExists(destDir)).toBe(true);
        expect(await fileExists(path.join(destDir, STANDARD_FILES.SKILL_MD))).toBe(true);
      }
    });

    it("should error when source has no valid skills with --all", async () => {
      // Create source with a directory but no SKILL.md
      const invalidSkillDir = path.join(projectDir, LOCAL_SOURCE_NAME, "skills", "invalid-skill");
      await mkdir(invalidSkillDir, { recursive: true });
      await writeFile(path.join(invalidSkillDir, "README.md"), "# Not a skill");

      const { error } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "--all"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });
  });

  describe("--force flag behavior", () => {
    it("should skip existing skills without --force", async () => {
      await createLocalSource(projectDir, ["existing-skill"]);

      // Pre-create the destination skill directory
      const destSkillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "existing-skill");
      await mkdir(destSkillDir, { recursive: true });
      await writeFile(path.join(destSkillDir, STANDARD_FILES.SKILL_MD), "# Original content\n");

      const { error } = await runCliCommand([
        "import:skill",
        LOCAL_SOURCE_NAME,
        "--skill",
        "existing-skill",
      ]);

      // Command should complete (skipping is not an error)
      expect(error?.oclif?.exit).toBeUndefined();

      // Original content should be preserved (not overwritten)
      const content = await readFile(path.join(destSkillDir, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(content).toBe("# Original content\n");
    });

    it("should warn with --force suggestion when skill exists without --force", async () => {
      await createLocalSource(projectDir, ["existing-skill"]);

      // Pre-create the destination skill directory
      const destSkillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "existing-skill");
      await mkdir(destSkillDir, { recursive: true });
      await writeFile(path.join(destSkillDir, STANDARD_FILES.SKILL_MD), "# Original content\n");

      const { stderr } = await runCliCommand([
        "import:skill",
        LOCAL_SOURCE_NAME,
        "--skill",
        "existing-skill",
      ]);

      // Warning should mention --force
      expect(stderr).toContain("already exists");
      expect(stderr).toContain("--force");
    });

    it("should skip only existing skills in --all mode without --force", async () => {
      await createLocalSource(projectDir, ["skill-a", "skill-b", "skill-c"]);

      // Pre-create only skill-b at the destination
      const destSkillB = path.join(projectDir, LOCAL_SKILLS_PATH, "skill-b");
      await mkdir(destSkillB, { recursive: true });
      await writeFile(path.join(destSkillB, STANDARD_FILES.SKILL_MD), "# Original B\n");

      const { error, stderr } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "--all"]);

      expect(error?.oclif?.exit).toBeUndefined();

      // skill-b should be skipped with a warning
      expect(stderr).toContain("skill-b");
      expect(stderr).toContain("--force");

      // skill-a and skill-c should be imported
      expect(
        await fileExists(
          path.join(projectDir, LOCAL_SKILLS_PATH, "skill-a", STANDARD_FILES.SKILL_MD),
        ),
      ).toBe(true);
      expect(
        await fileExists(
          path.join(projectDir, LOCAL_SKILLS_PATH, "skill-c", STANDARD_FILES.SKILL_MD),
        ),
      ).toBe(true);

      // skill-b should retain original content
      const contentB = await readFile(path.join(destSkillB, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(contentB).toBe("# Original B\n");
    });

    it("should overwrite existing skills with --force", async () => {
      await createLocalSource(projectDir, ["existing-skill"]);

      // Pre-create the destination skill directory with old content
      const destSkillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "existing-skill");
      await mkdir(destSkillDir, { recursive: true });
      await writeFile(path.join(destSkillDir, STANDARD_FILES.SKILL_MD), "# Original content\n");

      const { error } = await runCliCommand([
        "import:skill",
        LOCAL_SOURCE_NAME,
        "--skill",
        "existing-skill",
        "--force",
      ]);

      expect(error?.oclif?.exit).toBeUndefined();

      // Content should be overwritten with the source version
      const content = await readFile(path.join(destSkillDir, STANDARD_FILES.SKILL_MD), "utf-8");
      expect(content).toContain("existing-skill");
      expect(content).not.toBe("# Original content\n");
    });

    it("should overwrite all existing skills with --force in --all mode", async () => {
      await createLocalSource(projectDir, ["skill-a", "skill-b"]);

      // Pre-create both destination skill directories
      for (const name of ["skill-a", "skill-b"]) {
        const destDir = path.join(projectDir, LOCAL_SKILLS_PATH, name);
        await mkdir(destDir, { recursive: true });
        await writeFile(path.join(destDir, STANDARD_FILES.SKILL_MD), "# Original\n");
      }

      const { error, stderr } = await runCliCommand([
        "import:skill",
        LOCAL_SOURCE_NAME,
        "--all",
        "--force",
      ]);

      expect(error?.oclif?.exit).toBeUndefined();

      // No skip warnings should appear
      expect(stderr).not.toContain("already exists");

      // Both skills should be overwritten
      for (const name of ["skill-a", "skill-b"]) {
        const content = await readFile(
          path.join(projectDir, LOCAL_SKILLS_PATH, name, STANDARD_FILES.SKILL_MD),
          "utf-8",
        );
        expect(content).not.toBe("# Original\n");
      }
    });
  });

  describe("error handling", () => {
    it("should error when source directory does not exist", async () => {
      // Use a source name that doesn't exist on the filesystem
      const { error } = await runCliCommand(["import:skill", "nonexistent-source", "--list"]);

      // fetchFromSource will throw for non-existent local paths
      expect(error?.oclif?.exit).toBe(EXIT_CODES.NETWORK_ERROR);
    });

    it("should error when skills subdirectory is missing", async () => {
      // Create the source dir but without a "skills" subdirectory
      await mkdir(path.join(projectDir, LOCAL_SOURCE_NAME), { recursive: true });

      const { error } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "--list"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });
  });
});
