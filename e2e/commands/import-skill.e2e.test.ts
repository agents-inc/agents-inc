import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { createTempDir, cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";

describe("import skill command", () => {
  let tempDir: string;
  let e2eSourceTempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
    if (e2eSourceTempDir) {
      await cleanupTempDir(e2eSourceTempDir);
      e2eSourceTempDir = undefined;
    }
  });

  it("should display help text", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["import", "skill", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Import a skill from a third-party GitHub repository");
    expect(stdout).toContain("--skill");
    expect(stdout).toContain("--all");
    expect(stdout).toContain("--list");
  });

  it("should not document removed --subdir flag in help output", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["import", "skill", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).not.toContain("--subdir");
    expect(stdout).not.toContain("--refresh");
  });

  it("should document --force flag in help output", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["import", "skill", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("--force");
  });

  it("should error when no source argument is provided", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["import", "skill"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("Missing 1 required arg");
  });

  it("should error when no action flag is specified", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["import", "skill", "github:nonexistent/repo"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("--skill");
  });

  it("should error gracefully with a nonexistent source", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(
      ["import", "skill", "github:totally-nonexistent-user-abc123/no-repo", "--list"],
      { dir: tempDir },
    );

    expect(exitCode).toBe(EXIT_CODES.NETWORK_ERROR);
    expect(output).toContain("Fetching repository");
  });

  it("should error when --skill and --all are used together", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(
      ["import", "skill", "github:some/repo", "--skill", "foo", "--all"],
      { dir: tempDir },
    );

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("Cannot use --skill and --all together");
  });

  // BUG: parseGitHubSource() in import/skill.ts prepends "github:" to any source path
  // containing "/" without ":", which corrupts local filesystem paths. The import command
  // does not support local source directories as its positional argument.
  it.fails("should list available skills from a local source", async () => {
    tempDir = await createTempDir();
    const { sourceDir, tempDir: srcTempDir } = await createE2ESource();
    e2eSourceTempDir = srcTempDir;

    const { exitCode, stdout } = await CLI.run(["import", "skill", sourceDir, "--list"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Available skills");
    expect(stdout).toMatch(/\(\d+\)/);
    expect(stdout).toContain("Use --skill <name>");
  });

  // BUG: Same parseGitHubSource() issue as --list test above. Local paths are not
  // supported as the positional source argument.
  it.fails("should import a specific skill from a local source", async () => {
    tempDir = await createTempDir();
    const { sourceDir, tempDir: srcTempDir } = await createE2ESource();
    e2eSourceTempDir = srcTempDir;

    const { exitCode, stdout } = await CLI.run(
      ["import", "skill", sourceDir, "--skill", E2E_SKILL.react.id],
      { dir: tempDir },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Imported:");
    expect(stdout).toContain(STEP_TEXT.IMPORT_SUCCESS);
    expect(stdout).toContain("compile");

    // Verify the skill was actually copied to .claude/skills/
    await expect({ dir: tempDir }).toHaveLocalSkills([E2E_SKILL.react.id]);
    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.react.id);
  });

  // BUG: Same parseGitHubSource() issue. Cannot reach the duplicate-detection logic
  // without a working local source.
  it.fails("should warn when importing the same skill twice without --force", async () => {
    tempDir = await createTempDir();
    const { sourceDir, tempDir: srcTempDir } = await createE2ESource();
    e2eSourceTempDir = srcTempDir;

    // First import
    await CLI.run(["import", "skill", sourceDir, "--skill", E2E_SKILL.react.id], {
      dir: tempDir,
    });

    // Second import should warn about skipping
    const { output } = await CLI.run(
      ["import", "skill", sourceDir, "--skill", E2E_SKILL.react.id],
      { dir: tempDir },
    );

    expect(output).toContain("Skipping");
  });

  // BUG: Same parseGitHubSource() issue. Cannot test --force without a working local source.
  it.fails("should overwrite existing skill with --force", async () => {
    tempDir = await createTempDir();
    const { sourceDir, tempDir: srcTempDir } = await createE2ESource();
    e2eSourceTempDir = srcTempDir;

    // First import
    await CLI.run(["import", "skill", sourceDir, "--skill", E2E_SKILL.react.id], {
      dir: tempDir,
    });

    // Second import with --force should succeed
    const { exitCode, stdout } = await CLI.run(
      ["import", "skill", sourceDir, "--skill", E2E_SKILL.react.id, "--force"],
      { dir: tempDir },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Imported:");
    expect(stdout).toContain(STEP_TEXT.IMPORT_SUCCESS);
  });

  // BUG: parseGitHubSource() corrupts local paths by prepending "github:" to any
  // source containing "/" without ":". Cannot test --all with a local source.
  it.fails("should import all skills with --all flag", async () => {
    tempDir = await createTempDir();
    const { sourceDir, tempDir: srcTempDir } = await createE2ESource();
    e2eSourceTempDir = srcTempDir;

    const { exitCode, stdout } = await CLI.run(["import", "skill", sourceDir, "--all"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.IMPORT_SUCCESS);
    expect(stdout).toContain("imported");

    // Verify imported skills exist in .claude/skills/
    await expect({ dir: tempDir }).toHaveLocalSkills();
  });

  it("should error with a completely invalid source path (no slash)", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["import", "skill", "not-a-source", "--list"], {
      dir: tempDir,
    });

    // Source without "/" or ":" is passed through as-is to giget, which fails
    expect(exitCode).toBe(EXIT_CODES.NETWORK_ERROR);
    expect(output).toContain("Fetching repository");
  });

  it("should error when --skill specifies a non-existent skill name (with github: prefix)", async () => {
    tempDir = await createTempDir();

    // This will fail at fetch time since the repo doesn't exist, but the
    // error path for a non-existent skill name is only reachable after a
    // successful fetch. We verify the fetch error is handled gracefully.
    const { exitCode, output } = await CLI.run(
      [
        "import",
        "skill",
        "github:totally-nonexistent-user-abc123/no-repo",
        "--skill",
        "nonexistent-skill",
      ],
      { dir: tempDir },
    );

    expect(exitCode).toBe(EXIT_CODES.NETWORK_ERROR);
    expect(output).toContain("Fetching repository");
  });

  it("should error when --list and --skill are not provided and --all is false", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["import", "skill", "github:some/repo"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("--skill");
    expect(output).toContain("--list");
  });
});
