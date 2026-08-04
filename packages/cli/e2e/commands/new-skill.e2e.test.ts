import path from "path";
import { CLI } from "../fixtures/cli.js";
import { rm } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { EXIT_CODES, DIRS, FILES, SOURCE_PATHS } from "../pages/constants.js";
import {
  createTempDir,
  cleanupTempDir,
  configTypesTsPath,
  ensureBinaryExists,
  fileExists,
  readTestFile,
  directoryExists,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";

// D-212: `cc new skill` is gated behind FEATURE_FLAGS.NEW_SKILL_COMMAND (default false).
// E2E tests spawn the CLI binary as a separate process, so vi.mock cannot override
// the flag. Re-enable once D-212 is resolved and the flag flips back to true, or once
// the feature-flags module supports an env-var override that the E2E harness can set.
describe.skip("new skill command", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should display help text", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["new", "skill", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Create a new local skill");
    expect(stdout).toContain("--author");
    expect(stdout).toContain("--category");
    expect(stdout).toContain("--force");
  });

  it("should error when no skill name is provided", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["new", "skill"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("Missing 1 required arg");
  });

  it("should error with an invalid skill name", async () => {
    tempDir = await createTempDir();
    await ProjectBuilder.installation(tempDir);

    const { exitCode, output } = await CLI.run(["new", "skill", "InvalidName"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("kebab-case");
  });

  it("should create a new skill with SKILL.md and metadata.yaml", async () => {
    tempDir = await createTempDir();
    await ProjectBuilder.installation(tempDir);
    const skillName = "my-test-skill";

    const { exitCode, stdout } = await CLI.run(["new", "skill", skillName, "--domain", "shared"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Create New Skill");
    expect(stdout).toContain(skillName);
    expect(stdout).toContain("Skill created successfully");

    const skillDir = path.join(tempDir, DIRS.CLAUDE, DIRS.SKILLS, skillName);

    expect(await directoryExists(skillDir)).toBe(true);

    const skillMdPath = path.join(skillDir, FILES.SKILL_MD);
    const metadataPath = path.join(skillDir, FILES.METADATA_YAML);

    expect(await fileExists(skillMdPath)).toBe(true);
    expect(await fileExists(metadataPath)).toBe(true);
  });

  it("should produce SKILL.md with proper frontmatter", async () => {
    tempDir = await createTempDir();
    await ProjectBuilder.installation(tempDir);
    const skillName = "my-frontmatter-skill";

    const { exitCode } = await CLI.run(["new", "skill", skillName, "--domain", "shared"], {
      dir: tempDir,
    });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const skillMdPath = path.join(tempDir, DIRS.CLAUDE, DIRS.SKILLS, skillName, FILES.SKILL_MD);
    const content = await readTestFile(skillMdPath);

    expect(content).toMatch(/^---\n/);
    expect(content).toContain(`name: ${skillName}`);
    expect(content).toContain("description:");
    expect(content).toContain("# My Frontmatter Skill");
  });

  it("should produce a valid metadata.yaml", async () => {
    tempDir = await createTempDir();
    await ProjectBuilder.installation(tempDir);
    const skillName = "my-metadata-skill";

    const { exitCode } = await CLI.run(["new", "skill", skillName, "--domain", "shared"], {
      dir: tempDir,
    });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const metadataPath = path.join(
      tempDir,
      DIRS.CLAUDE,
      DIRS.SKILLS,
      skillName,
      FILES.METADATA_YAML,
    );
    const content = await readTestFile(metadataPath);

    expect(content).toContain("category:");
    expect(content).toContain("author:");
    expect(content).toContain("contentHash:");
    expect(content).toContain("custom: true");
  });

  it("should error when skill already exists without --force", async () => {
    tempDir = await createTempDir();
    await ProjectBuilder.installation(tempDir);
    const skillName = "duplicate-skill";

    const { exitCode: setupExitCode } = await CLI.run(
      ["new", "skill", skillName, "--domain", "shared"],
      { dir: tempDir },
    );
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, output } = await CLI.run(["new", "skill", skillName, "--domain", "shared"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(output).toContain("already exists");
  });

  it("should overwrite existing skill with --force", async () => {
    tempDir = await createTempDir();
    await ProjectBuilder.installation(tempDir);
    const skillName = "force-skill";

    await CLI.run(["new", "skill", skillName, "--domain", "shared"], { dir: tempDir });

    const { exitCode, stdout } = await CLI.run(
      ["new", "skill", skillName, "--force", "--domain", "shared"],
      { dir: tempDir },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Skill created successfully");
  });

  it("should update config files when creating a skill in marketplace context", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "mp-skill-config";

    // First scaffold a marketplace to establish the context
    const { exitCode: mpExitCode } = await CLI.run(["new", "marketplace", marketplaceName], {
      dir: tempDir,
    });
    expect(mpExitCode).toBe(EXIT_CODES.SUCCESS);

    const marketplaceDir = path.join(tempDir, marketplaceName);
    await ProjectBuilder.installation(marketplaceDir);

    // Create a new skill inside the marketplace directory
    const { exitCode, stdout } = await CLI.run(
      ["new", "skill", "my-extra-skill", "--category", "api-database", "--domain", "api"],
      { dir: marketplaceDir },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Skill created successfully");

    // Verify skill-categories.ts was updated with the new category
    const categoriesPath = path.join(marketplaceDir, SOURCE_PATHS.SKILL_CATEGORIES);
    const categoriesContent = await readTestFile(categoriesPath);
    expect(categoriesContent).toContain('"api-database"');
    expect(categoriesContent).toContain('"domain": "api"');

    // Verify skill-rules.ts exists (created by marketplace scaffold, not modified by new skill)
    const rulesPath = path.join(marketplaceDir, SOURCE_PATHS.SKILL_RULES);
    const rulesContent = await readTestFile(rulesPath);
    expect(rulesContent).toContain('"relationships"');
  });

  it("should accept a skill name containing numbers", async () => {
    tempDir = await createTempDir();
    await ProjectBuilder.installation(tempDir);
    const skillName = "skill123";

    const { exitCode, stdout } = await CLI.run(["new", "skill", skillName, "--domain", "shared"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Skill created successfully");
  });

  it("should accept a long skill name", async () => {
    tempDir = await createTempDir();
    await ProjectBuilder.installation(tempDir);
    const skillName = "my-very-long-skill-name-that-has-many-segments";

    const { exitCode, stdout } = await CLI.run(["new", "skill", skillName, "--domain", "shared"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Skill created successfully");
  });

  it("should set category in metadata.yaml when --category flag is provided", async () => {
    tempDir = await createTempDir();
    await ProjectBuilder.installation(tempDir);
    const skillName = "my-cat-skill";

    const { exitCode, stdout } = await CLI.run(
      ["new", "skill", skillName, "--category", "api-database", "--domain", "api"],
      { dir: tempDir },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Skill created successfully");

    const metadataPath = path.join(
      tempDir,
      DIRS.CLAUDE,
      DIRS.SKILLS,
      skillName,
      FILES.METADATA_YAML,
    );
    const content = await readTestFile(metadataPath);

    expect(content).toContain("category: api-database");
  });

  it("should not create config files when creating a local skill", async () => {
    tempDir = await createTempDir();
    await ProjectBuilder.installation(tempDir);
    const skillName = "local-only-skill";

    const { exitCode } = await CLI.run(["new", "skill", skillName, "--domain", "shared"], {
      dir: tempDir,
    });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Config files should NOT exist for local skills
    expect(await fileExists(path.join(tempDir, SOURCE_PATHS.SKILL_CATEGORIES))).toBe(false);
    expect(await fileExists(path.join(tempDir, SOURCE_PATHS.SKILL_RULES))).toBe(false);
  });

  it("should regenerate config-types.ts with custom skill in marketplace context", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "mp-types-test";

    // Scaffold a marketplace to establish the source context (src/skills/, config/, etc.)
    const { exitCode: mpExitCode } = await CLI.run(["new", "marketplace", marketplaceName], {
      dir: tempDir,
    });
    expect(mpExitCode).toBe(EXIT_CODES.SUCCESS);

    const marketplaceDir = path.join(tempDir, marketplaceName);

    // Remove scaffolded config files that contain invalid dummy domain values.
    // loadSkillsMatrixFromSource validates these with Zod, and "dummy" is not
    // a valid domain. Removing them lets the source loader fall back to CLI defaults.
    await rm(path.join(marketplaceDir, SOURCE_PATHS.SKILL_CATEGORIES), { force: true });
    await rm(path.join(marketplaceDir, SOURCE_PATHS.SKILL_RULES), { force: true });

    // Create a new skill with custom domain/category. `new skill` auto-detects marketplace
    // context via .claude-plugin/marketplace.json, so no --source flag is needed.
    const { exitCode, stdout } = await CLI.run(
      [
        "new",
        "skill",
        "custom-types-skill",
        "--domain",
        "custom-e2e-domain",
        "--category",
        "custom-e2e-category",
      ],
      { dir: marketplaceDir },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Skill created successfully");

    // Verify config-types.ts was regenerated with custom values
    const configTypesPath = configTypesTsPath(marketplaceDir);
    expect(await fileExists(configTypesPath)).toBe(true);

    const configTypesContent = await readTestFile(configTypesPath);

    // Header comment
    expect(configTypesContent).toContain("AUTO-GENERATED");

    // Custom skill ID appears in SkillId union
    expect(configTypesContent).toContain('"custom-types-skill"');

    // Custom domain appears in Domain union
    expect(configTypesContent).toContain('"custom-e2e-domain"');

    // Custom category appears in Category union
    expect(configTypesContent).toContain('"custom-e2e-category"');
  });
});
