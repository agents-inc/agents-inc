import path from "path";
import { CLI } from "../fixtures/cli.js";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { EXIT_CODES, FILES, SOURCE_PATHS } from "../pages/constants.js";
import {
  configTsPath,
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  readMarketplaceJson,
  readTestFile,
  directoryExists,
} from "../helpers/test-utils.js";

// D-214: `cc new marketplace` is gated behind FEATURE_FLAGS.NEW_MARKETPLACE_COMMAND (default false).
// E2E tests spawn the CLI binary as a separate process, so vi.mock cannot override
// the flag. Re-enable once D-214 is resolved and the flag flips back to true, or once
// the feature-flags module supports an env-var override that the E2E harness can set
// (see CLI-323, formerly R-01, in todo/cli.md).
describe.skip("new marketplace command", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should display help text", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["new", "marketplace", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Scaffold a new private marketplace project");
    expect(stdout).toContain("--force");
    expect(stdout).not.toContain("--output");
  });

  it("should error when no name is provided", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["new", "marketplace"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("Missing 1 required arg");
  });

  it("should error with an invalid marketplace name", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["new", "marketplace", "InvalidName"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("kebab-case");
  });

  it("should create a marketplace with proper directory structure", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "my-test-marketplace";

    const { exitCode, stdout } = await CLI.run(["new", "marketplace", marketplaceName], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Create New Marketplace");
    expect(stdout).toContain("Marketplace created successfully");

    const marketplaceDir = path.join(tempDir, marketplaceName);
    expect(await directoryExists(marketplaceDir)).toBe(true);

    // Verify stacks.ts exists
    const stacksPath = path.join(marketplaceDir, SOURCE_PATHS.STACKS_FILE);
    expect(await fileExists(stacksPath)).toBe(true);

    // Verify skills directory exists with dummy skill
    const dummySkillDir = path.join(marketplaceDir, SOURCE_PATHS.SKILLS_DIR, "dummy-skill");
    expect(await directoryExists(dummySkillDir)).toBe(true);

    // Verify SKILL.md and metadata.yaml for dummy skill
    expect(await fileExists(path.join(dummySkillDir, FILES.SKILL_MD))).toBe(true);
    expect(await fileExists(path.join(dummySkillDir, FILES.METADATA_YAML))).toBe(true);

    // Verify README.md exists
    expect(await fileExists(path.join(marketplaceDir, "README.md"))).toBe(true);

    // Verify .claude-src/config.ts exists (installation marker)
    const configPath = configTsPath(marketplaceDir);
    expect(await fileExists(configPath)).toBe(true);
  });

  it("should produce a valid stacks.ts with marketplace name", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "my-stacks-test";

    const { exitCode } = await CLI.run(["new", "marketplace", marketplaceName], { dir: tempDir });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const stacksPath = path.join(tempDir, marketplaceName, SOURCE_PATHS.STACKS_FILE);
    const content = await readTestFile(stacksPath);

    expect(content).toContain('"stacks"');
    expect(content).toContain(marketplaceName);
    expect(content).toContain("dummy-stack");
  });

  it("should produce a README with marketplace name", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "my-readme-test";

    const { exitCode } = await CLI.run(["new", "marketplace", marketplaceName], { dir: tempDir });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const readmePath = path.join(tempDir, marketplaceName, "README.md");
    const content = await readTestFile(readmePath);

    expect(content).toContain(`# ${marketplaceName}`);
    expect(content).toContain("Private marketplace");
    expect(content).toContain(SOURCE_PATHS.STACKS_FILE);
    expect(content).toContain(SOURCE_PATHS.SKILLS_DIR);
  });

  it("should build marketplace.json during scaffold", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "my-build-test";

    const { exitCode, stdout } = await CLI.run(["new", "marketplace", marketplaceName], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Building plugins");
    expect(stdout).toContain("Generating marketplace.json");

    const marketplaceJsonPath = path.join(
      tempDir,
      marketplaceName,
      SOURCE_PATHS.PLUGIN_MANIFEST_DIR,
      "marketplace.json",
    );
    expect(await fileExists(marketplaceJsonPath)).toBe(true);
  });

  it("should produce a marketplace.json containing the dummy-skill plugin entry", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "dummy-skill-verify";

    const { exitCode } = await CLI.run(["new", "marketplace", marketplaceName], { dir: tempDir });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const marketplaceJsonPath = path.join(
      tempDir,
      marketplaceName,
      SOURCE_PATHS.PLUGIN_MANIFEST_DIR,
      "marketplace.json",
    );
    const marketplace = await readMarketplaceJson(marketplaceJsonPath);

    expect(marketplace.plugins.length).toBeGreaterThanOrEqual(1);
    const dummyPlugin = marketplace.plugins.find((p) => p.name === "dummy-skill");
    expect(dummyPlugin, "Expected dummy-skill plugin entry in marketplace.json").toBeDefined();
  });

  it("should error when marketplace already exists without --force", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "duplicate-marketplace";

    const { exitCode: setupExitCode } = await CLI.run(["new", "marketplace", marketplaceName], {
      dir: tempDir,
    });
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, output } = await CLI.run(["new", "marketplace", marketplaceName], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(output).toContain("already exists");
  });

  it("should overwrite existing marketplace with --force", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "force-marketplace";

    const { exitCode: setupExitCode } = await CLI.run(["new", "marketplace", marketplaceName], {
      dir: tempDir,
    });
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, stdout } = await CLI.run(["new", "marketplace", marketplaceName, "--force"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Marketplace created successfully");
  });

  it("should produce a valid skill-categories.ts with dummy category", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "my-categories-test";

    const { exitCode } = await CLI.run(["new", "marketplace", marketplaceName], { dir: tempDir });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const categoriesPath = path.join(tempDir, marketplaceName, SOURCE_PATHS.SKILL_CATEGORIES);
    expect(await fileExists(categoriesPath)).toBe(true);

    const content = await readTestFile(categoriesPath);
    expect(content).toContain("export default");
    expect(content).toContain('"version": "1.0.0"');
    expect(content).toContain('"dummy-category"');
    expect(content).toContain('"id": "dummy-category"');
    expect(content).toContain('"custom": true');
  });

  it("should error with a numbers-only marketplace name", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["new", "marketplace", "12345"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("kebab-case");
  });

  it("should accept a single character marketplace name", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["new", "marketplace", "a"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Marketplace created successfully");
  });

  it("should produce a valid skill-rules.ts with dummy skill alias", async () => {
    tempDir = await createTempDir();
    const marketplaceName = "my-rules-test";

    const { exitCode } = await CLI.run(["new", "marketplace", marketplaceName], { dir: tempDir });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const rulesPath = path.join(tempDir, marketplaceName, SOURCE_PATHS.SKILL_RULES);
    expect(await fileExists(rulesPath)).toBe(true);

    const content = await readTestFile(rulesPath);
    expect(content).toContain("export default");
    expect(content).toContain('"version": "1.0.0"');
    expect(content).toContain('"relationships"');
  });
});
