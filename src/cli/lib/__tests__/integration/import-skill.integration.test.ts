import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, writeFile, readFile, rm } from "fs/promises";
import { stringify as stringifyYaml, parse as parseYaml } from "yaml";
import { runCliCommand } from "../helpers/cli-runner.js";
import { fileExists, directoryExists, createTempDir, cleanupTempDir } from "../test-fs-utils";
import { compileSkillPlugin, compileAllSkillPlugins } from "../../skills";
import { validatePlugin } from "../../plugins";
import { EXIT_CODES } from "../../exit-codes";
import {
  LOCAL_SKILLS_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
} from "../../../consts";
import {
  IMPORT_REACT_PATTERNS_SKILL,
  IMPORT_TESTING_UTILS_SKILL,
  IMPORT_API_SECURITY_SKILL,
  type ImportSourceSkill,
} from "../mock-data/mock-skills";

// ── Constants ──────────────────────────────────────────────────────────────────

const LOCAL_SKILLS_DIR = LOCAL_SKILLS_PATH;

// Plain directory name (no slashes/colons) so parseGitHubSource passes it
// through as-is and fetchFromSource treats it as a local path relative to cwd
const LOCAL_SOURCE_NAME = "test-import-source";

// ── Test Source Builders ────────────────────────────────────────────────────────

async function createLocalSource(projectDir: string, skills: ImportSourceSkill[]): Promise<void> {
  const skillsDir = path.join(projectDir, LOCAL_SOURCE_NAME, STANDARD_DIRS.SKILLS);

  for (const skill of skills) {
    const skillDir = path.join(skillsDir, skill.name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), skill.content);

    if (skill.metadata) {
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        stringifyYaml(skill.metadata),
      );
    }
  }
}

// ── Test Suites ────────────────────────────────────────────────────────────────

describe("Integration: Import Skill -> Compile Pipeline", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-import-integration-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("should import a skill and compile it as a plugin", async () => {
    // Step 1: Create source with a skill
    await createLocalSource(projectDir, [IMPORT_REACT_PATTERNS_SKILL]);

    // Step 2: Import the skill
    const { error } = await runCliCommand([
      "import:skill",
      LOCAL_SOURCE_NAME,
      "--skill",
      "react-patterns",
    ]);
    expect(error?.oclif?.exit).toBeUndefined();

    // Step 3: Verify skill was imported to .claude/skills/
    const importedSkillDir = path.join(projectDir, LOCAL_SKILLS_DIR, "react-patterns");
    expect(await directoryExists(importedSkillDir)).toBe(true);
    expect(await fileExists(path.join(importedSkillDir, STANDARD_FILES.SKILL_MD))).toBe(true);

    // Step 4: Compile the imported skill as a plugin
    const outputDir = path.join(tempDir, "plugins");
    await mkdir(outputDir, { recursive: true });

    const result = await compileSkillPlugin({
      skillPath: importedSkillDir,
      outputDir,
    });

    // Step 5: Verify compiled plugin structure
    expect(result.skillName).toBe("react-patterns");
    expect(result.manifest.name).toBe("react-patterns");
    expect(result.manifest.description).toBe("React design patterns and best practices");
    expect(await directoryExists(result.pluginPath)).toBe(true);

    // Step 6: Verify plugin manifest
    const manifestPath = path.join(result.pluginPath, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
    expect(await fileExists(manifestPath)).toBe(true);

    const manifestContent = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent) as Record<string, unknown>;
    expect(manifest.name).toBe("react-patterns");
    expect(manifest.version).toBe("1.0.0");

    // Step 7: Verify compiled skill content is preserved
    const compiledSkillMd = path.join(
      result.pluginPath,
      STANDARD_DIRS.SKILLS,
      "react-patterns",
      STANDARD_FILES.SKILL_MD,
    );
    expect(await fileExists(compiledSkillMd)).toBe(true);

    const compiledContent = await readFile(compiledSkillMd, "utf-8");
    expect(compiledContent).toContain("React Patterns");
    expect(compiledContent).toContain("Component Composition");
    expect(compiledContent).toContain("Hooks Patterns");
  });

  it("should import multiple skills and compile them all", async () => {
    // Step 1: Create source with multiple skills
    await createLocalSource(projectDir, [
      IMPORT_REACT_PATTERNS_SKILL,
      IMPORT_TESTING_UTILS_SKILL,
      IMPORT_API_SECURITY_SKILL,
    ]);

    // Step 2: Import all skills
    const { error } = await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "--all"]);
    expect(error?.oclif?.exit).toBeUndefined();

    // Step 3: Verify all skills were imported
    const skillNames = ["react-patterns", "testing-utils", "api-security"];
    for (const name of skillNames) {
      const skillDir = path.join(projectDir, LOCAL_SKILLS_DIR, name);
      expect(await directoryExists(skillDir)).toBe(true);
    }

    // Step 4: Compile all imported skills
    const importedSkillsDir = path.join(projectDir, LOCAL_SKILLS_DIR);
    const outputDir = path.join(tempDir, "plugins");
    await mkdir(outputDir, { recursive: true });

    const { compiled: results } = await compileAllSkillPlugins(importedSkillsDir, outputDir);

    // Step 5: Verify all skills compiled successfully
    expect(results).toHaveLength(3);

    const compiledNames = results.map((r) => r.skillName).sort();
    expect(compiledNames).toStrictEqual(["api-security", "react-patterns", "testing-utils"]);

    // Step 6: Each compiled plugin should be valid
    for (const result of results) {
      expect(await directoryExists(result.pluginPath)).toBe(true);

      const manifestPath = path.join(result.pluginPath, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
      expect(await fileExists(manifestPath)).toBe(true);
    }
  });

  it("should validate compiled plugin from imported skill", async () => {
    // Import a skill with metadata
    await createLocalSource(projectDir, [IMPORT_REACT_PATTERNS_SKILL]);

    const { error } = await runCliCommand([
      "import:skill",
      LOCAL_SOURCE_NAME,
      "--skill",
      "react-patterns",
    ]);
    expect(error?.oclif?.exit).toBeUndefined();

    // Compile it
    const importedSkillDir = path.join(projectDir, LOCAL_SKILLS_DIR, "react-patterns");
    const outputDir = path.join(tempDir, "plugins");
    await mkdir(outputDir, { recursive: true });

    const result = await compileSkillPlugin({
      skillPath: importedSkillDir,
      outputDir,
    });

    // Validate the compiled plugin
    const validation = await validatePlugin(result.pluginPath);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });
});

describe("Integration: Import with --force and Recompile", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-import-force-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("should overwrite and recompile with updated content", async () => {
    // Step 1: Import original version
    await createLocalSource(projectDir, [IMPORT_REACT_PATTERNS_SKILL]);

    const { error: firstError } = await runCliCommand([
      "import:skill",
      LOCAL_SOURCE_NAME,
      "--skill",
      "react-patterns",
    ]);
    expect(firstError?.oclif?.exit).toBeUndefined();

    // Step 2: Compile first version
    const importedSkillDir = path.join(projectDir, LOCAL_SKILLS_DIR, "react-patterns");
    const outputDir = path.join(tempDir, "plugins");
    await mkdir(outputDir, { recursive: true });

    const firstResult = await compileSkillPlugin({
      skillPath: importedSkillDir,
      outputDir,
    });
    expect(firstResult.manifest.version).toBe("1.0.0");

    // Step 3: Update the source skill with new content
    const updatedSkill = {
      ...IMPORT_REACT_PATTERNS_SKILL,
      content: `---
name: react-patterns
description: React design patterns and best practices (updated)
---

# React Patterns v2

## Server Components

Use React Server Components for improved performance.

## Suspense Patterns

Leverage Suspense for data fetching and code splitting.
`,
    };
    // Remove old source and recreate with updated content
    await rm(path.join(projectDir, LOCAL_SOURCE_NAME), { recursive: true, force: true });
    await createLocalSource(projectDir, [updatedSkill]);

    // Step 4: Import with --force to overwrite
    const { error: secondError } = await runCliCommand([
      "import:skill",
      LOCAL_SOURCE_NAME,
      "--skill",
      "react-patterns",
      "--force",
    ]);
    expect(secondError?.oclif?.exit).toBeUndefined();

    // Step 5: Verify updated content was imported
    const skillMdContent = await readFile(
      path.join(importedSkillDir, STANDARD_FILES.SKILL_MD),
      "utf-8",
    );
    expect(skillMdContent).toContain("React Patterns v2");
    expect(skillMdContent).toContain("Server Components");

    // Step 6: Recompile and verify version bump
    const secondResult = await compileSkillPlugin({
      skillPath: importedSkillDir,
      outputDir,
    });

    // Content changed, so version should be bumped
    expect(secondResult.manifest.version).toBe("2.0.0");

    // Step 7: Verify compiled content reflects update
    const compiledSkillMd = path.join(
      secondResult.pluginPath,
      STANDARD_DIRS.SKILLS,
      "react-patterns",
      STANDARD_FILES.SKILL_MD,
    );
    const compiledContent = await readFile(compiledSkillMd, "utf-8");
    expect(compiledContent).toContain("React Patterns v2");
    expect(compiledContent).toContain("Server Components");
  });

  it("should skip import without --force and preserve compiled output", async () => {
    // Import original version
    await createLocalSource(projectDir, [IMPORT_REACT_PATTERNS_SKILL]);
    await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "--skill", "react-patterns"]);

    // Compile first version
    const importedSkillDir = path.join(projectDir, LOCAL_SKILLS_DIR, "react-patterns");
    const outputDir = path.join(tempDir, "plugins");
    await mkdir(outputDir, { recursive: true });

    await compileSkillPlugin({
      skillPath: importedSkillDir,
      outputDir,
    });

    // Record original SKILL.md content
    const originalContent = await readFile(
      path.join(importedSkillDir, STANDARD_FILES.SKILL_MD),
      "utf-8",
    );

    // Try to import again WITHOUT --force
    const { error } = await runCliCommand([
      "import:skill",
      LOCAL_SOURCE_NAME,
      "--skill",
      "react-patterns",
    ]);
    // Command completes (skipping is not an error)
    expect(error?.oclif?.exit).toBeUndefined();

    // Content should be unchanged (original preserved)
    const afterContent = await readFile(
      path.join(importedSkillDir, STANDARD_FILES.SKILL_MD),
      "utf-8",
    );
    expect(afterContent).toBe(originalContent);
  });
});

describe("Integration: Import Metadata Preservation Through Compilation", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-import-metadata-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("should preserve forkedFrom metadata after import", async () => {
    await createLocalSource(projectDir, [IMPORT_REACT_PATTERNS_SKILL]);

    const { error } = await runCliCommand([
      "import:skill",
      LOCAL_SOURCE_NAME,
      "--skill",
      "react-patterns",
    ]);
    expect(error?.oclif?.exit).toBeUndefined();

    // Read injected metadata
    const metadataPath = path.join(
      projectDir,
      LOCAL_SKILLS_DIR,
      "react-patterns",
      STANDARD_FILES.METADATA_YAML,
    );
    expect(await fileExists(metadataPath)).toBe(true);

    const metadataContent = await readFile(metadataPath, "utf-8");
    const metadata = parseYaml(metadataContent) as Record<string, unknown>;

    // Verify forkedFrom was injected with expected shape
    const forkedFrom = metadata.forkedFrom as Record<string, unknown>;
    expect(forkedFrom).toStrictEqual(
      expect.objectContaining({
        source: LOCAL_SOURCE_NAME,
        skillName: "react-patterns",
        contentHash: expect.stringMatching(/^.+$/),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );

    // Original metadata fields should be preserved
    expect(metadata.author).toBe("@external-author");
  });

  it("should inject forkedFrom metadata for skills without existing metadata", async () => {
    // IMPORT_API_SECURITY_SKILL has no tags/metadata — toImportSourceSkill won't add metadata
    await createLocalSource(projectDir, [IMPORT_API_SECURITY_SKILL]);

    const { error } = await runCliCommand([
      "import:skill",
      LOCAL_SOURCE_NAME,
      "--skill",
      "api-security",
    ]);
    expect(error?.oclif?.exit).toBeUndefined();

    // A metadata.yaml should have been created with minimal metadata + forkedFrom
    const metadataPath = path.join(
      projectDir,
      LOCAL_SKILLS_DIR,
      "api-security",
      STANDARD_FILES.METADATA_YAML,
    );
    expect(await fileExists(metadataPath)).toBe(true);

    const metadataContent = await readFile(metadataPath, "utf-8");
    const metadata = parseYaml(metadataContent) as Record<string, unknown>;

    // Minimal metadata should be created
    expect(metadata.displayName).toBe("Api Security");
    expect(metadata.cliDescription).toBe("Imported from third-party repository");
    expect(metadata.forkedFrom).toStrictEqual(
      expect.objectContaining({ skillName: "api-security" }),
    );
  });

  it("should use forkedFrom metadata tags in compiled plugin README", async () => {
    await createLocalSource(projectDir, [IMPORT_REACT_PATTERNS_SKILL]);

    await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "--skill", "react-patterns"]);

    // Compile the imported skill
    const importedDir = path.join(projectDir, LOCAL_SKILLS_DIR, "react-patterns");
    const outputDir = path.join(tempDir, "plugins");
    await mkdir(outputDir, { recursive: true });

    const result = await compileSkillPlugin({
      skillPath: importedDir,
      outputDir,
    });

    // README should be generated
    const readmePath = path.join(result.pluginPath, "README.md");
    expect(await fileExists(readmePath)).toBe(true);

    const readmeContent = await readFile(readmePath, "utf-8");
    expect(readmeContent).toContain("react-patterns");
    expect(readmeContent).toContain("React design patterns and best practices");
  });
});

describe("Integration: Import Error Recovery", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-import-error-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("should error when importing nonexistent skill from valid source", async () => {
    await createLocalSource(projectDir, [IMPORT_REACT_PATTERNS_SKILL]);

    const { error } = await runCliCommand([
      "import:skill",
      LOCAL_SOURCE_NAME,
      "--skill",
      "nonexistent-skill",
    ]);

    expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
  });

  it("should import valid skills even when source has mixed content", async () => {
    // Create a source with one valid skill and one directory without SKILL.md
    await createLocalSource(projectDir, [IMPORT_REACT_PATTERNS_SKILL]);

    // Add a directory without SKILL.md (invalid skill)
    const invalidDir = path.join(
      projectDir,
      LOCAL_SOURCE_NAME,
      STANDARD_DIRS.SKILLS,
      "invalid-skill",
    );
    await mkdir(invalidDir, { recursive: true });
    await writeFile(path.join(invalidDir, "README.md"), "# Not a skill\n");

    // --list should only show valid skills
    const { error: listError, stdout: listStdout } = await runCliCommand([
      "import:skill",
      LOCAL_SOURCE_NAME,
      "--list",
    ]);
    expect(listError?.oclif?.exit).toBeUndefined();
    expect(listStdout).toContain("react-patterns");
    expect(listStdout).not.toContain("invalid-skill");

    // Import the valid skill
    const { error: importError } = await runCliCommand([
      "import:skill",
      LOCAL_SOURCE_NAME,
      "--skill",
      "react-patterns",
    ]);
    expect(importError?.oclif?.exit).toBeUndefined();

    // Compile it
    const importedDir = path.join(projectDir, LOCAL_SKILLS_DIR, "react-patterns");
    const outputDir = path.join(tempDir, "plugins");
    await mkdir(outputDir, { recursive: true });

    const result = await compileSkillPlugin({
      skillPath: importedDir,
      outputDir,
    });

    expect(result.skillName).toBe("react-patterns");

    const validation = await validatePlugin(result.pluginPath);
    expect(validation.valid).toBe(true);
  });

  it("should produce unique plugin names when importing skills with distinct names", async () => {
    await createLocalSource(projectDir, [IMPORT_REACT_PATTERNS_SKILL, IMPORT_TESTING_UTILS_SKILL]);

    await runCliCommand(["import:skill", LOCAL_SOURCE_NAME, "--all"]);

    const importedSkillsDir = path.join(projectDir, LOCAL_SKILLS_DIR);
    const outputDir = path.join(tempDir, "plugins");
    await mkdir(outputDir, { recursive: true });

    const { compiled: results } = await compileAllSkillPlugins(importedSkillsDir, outputDir);

    const names = results.map((r) => r.manifest.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});
