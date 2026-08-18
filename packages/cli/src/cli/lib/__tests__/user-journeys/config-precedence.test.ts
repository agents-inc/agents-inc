import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, writeFile } from "fs/promises";
import {
  resolveSource,
  loadProjectSourceConfig,
  getProjectConfigPath,
  SOURCE_ENV_VAR,
  DEFAULT_SOURCE,
} from "../../configuration";
import { writeProjectPartial } from "../../config-gate/index.js";
import type { ProjectConfig } from "../../../types";
import {
  createTestSource,
  cleanupTestSource,
  fileExists,
  type TestDirs,
} from "../fixtures/create-test-source";
import {
  buildPreRenameProjectConfig,
  buildPreRenameSkillEntryConfig,
} from "../factories/config-factories.js";
import { readTestTsConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { TEST_CUSTOM_SOURCE_URL, TEST_SOURCE_URL } from "../test-constants.js";
import { renderConfigTs } from "../content-generators";
import { CLAUDE_SRC_DIR, DEFAULT_PUBLIC_SOURCE_NAME, STANDARD_FILES } from "../../../consts";

/** A third ref, distinct from the flag's and the config's, so each rung is identifiable. */
const ENV_SOURCE_REF = "github:env-named/skills";

async function createProjectConfig(
  projectDir: string,
  config: Partial<ProjectConfig>,
): Promise<string> {
  return writeTestTsConfig(projectDir, config);
}

describe("User Journey: Config Precedence - Source Resolution", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-config-precedence-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });

    delete process.env[SOURCE_ENV_VAR];
  });

  afterEach(async () => {
    delete process.env[SOURCE_ENV_VAR];
    await cleanupTempDir(tempDir);
  });

  describe("flag precedence (highest)", () => {
    it("should use --source flag value over environment variable", async () => {
      process.env[SOURCE_ENV_VAR] = "github:env/source";

      const result = await resolveSource({
        caller: "init",
        flag: "github:flag/source",
        projectDir,
      });

      expect(result.source).toBe("github:flag/source");
      expect(result.sourceOrigin).toBe("flag");
    });

    it("should use --source flag value over project config", async () => {
      await createProjectConfig(projectDir, {
        marketplace: "github:project/source",
      });

      const result = await resolveSource({
        caller: "init",
        flag: "github:flag/source",
        projectDir,
      });

      expect(result.source).toBe("github:flag/source");
      expect(result.sourceOrigin).toBe("flag");
    });

    it("should use --source flag when all layers are configured", async () => {
      // Set up all layers
      process.env[SOURCE_ENV_VAR] = "github:env/source";
      await createProjectConfig(projectDir, {
        marketplace: "github:project/source",
      });

      const result = await resolveSource({
        caller: "init",
        flag: "github:flag/source",
        projectDir,
      });

      expect(result.source).toBe("github:flag/source");
      expect(result.sourceOrigin).toBe("flag");
    });

    it("should reject empty flag value", async () => {
      await expect(resolveSource({ caller: "init", flag: "", projectDir })).rejects.toThrow(
        /The marketplace cannot be empty/,
      );
    });

    it("should reject whitespace-only flag value", async () => {
      await expect(resolveSource({ caller: "init", flag: "   ", projectDir })).rejects.toThrow(
        /The marketplace cannot be empty/,
      );
    });
  });

  describe("environment variable precedence — init's rung alone", () => {
    it("should use CC_SOURCE when no flag provided", async () => {
      process.env[SOURCE_ENV_VAR] = "github:env/source";

      const result = await resolveSource({ caller: "init", projectDir });

      expect(result.source).toBe("github:env/source");
      expect(result.sourceOrigin).toBe("env");
    });

    it("should use CC_SOURCE over project config", async () => {
      process.env[SOURCE_ENV_VAR] = "github:env/source";
      await createProjectConfig(projectDir, {
        marketplace: "github:project/source",
      });

      const result = await resolveSource({ caller: "init", projectDir });

      expect(result.source).toBe("github:env/source");
      expect(result.sourceOrigin).toBe("env");
    });

    it("should ignore CC_SOURCE for every command after init", async () => {
      process.env[SOURCE_ENV_VAR] = "github:env/source";
      await createProjectConfig(projectDir, {
        marketplace: "github:project/source",
      });

      const result = await resolveSource({ caller: "stored", projectDir });

      expect(
        result.source,
        "naming a source is an install-time decision, and the environment names one",
      ).toBe("github:project/source");
      expect(result.sourceOrigin).toBe("project");
    });

    it("should support various source formats in env var", async () => {
      const testSources = [
        "github:org/repo",
        "gh:org/repo",
        "gitlab:org/repo",
        "https://github.com/org/repo",
        "/local/path/to/source",
        "./relative/path",
      ];

      for (const source of testSources) {
        process.env[SOURCE_ENV_VAR] = source;
        const result = await resolveSource({ caller: "init", projectDir });
        expect(result.source).toBe(source);
        expect(result.sourceOrigin).toBe("env");
      }
    });
  });

  describe("project config precedence", () => {
    it("should use project config when no flag or env", async () => {
      await createProjectConfig(projectDir, {
        marketplace: "github:project/custom-source",
      });

      const result = await resolveSource({ caller: "stored", projectDir });

      expect(result.source).toBe("github:project/custom-source");
      expect(result.sourceOrigin).toBe("project");
    });

    it("should load project config from .claude-src/config.ts", async () => {
      const configPath = await createProjectConfig(projectDir, {
        marketplace: "github:my-company/internal-skills",
      });

      // Verify file exists where expected
      expect(await fileExists(configPath)).toBe(true);

      const config = await loadProjectSourceConfig(projectDir);
      expect(config?.marketplace).toBe("github:my-company/internal-skills");
    });

    it("should handle project config with multiple fields", async () => {
      await createProjectConfig(projectDir, {
        marketplace: "github:project/source",
        marketplaceName: "https://marketplace.example.com",
        agentsSource: "https://agents.example.com",
      });

      const config = await loadProjectSourceConfig(projectDir);

      expect(config?.marketplace).toBe("github:project/source");
      expect(config?.marketplaceName).toBe("https://marketplace.example.com");
      expect(config?.agentsSource).toBe("https://agents.example.com");
    });

    it("should return null for missing project config", async () => {
      // No config file created
      const config = await loadProjectSourceConfig(projectDir);
      expect(config).toBeNull();
    });

    it("should return null for invalid TypeScript in project config", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        "invalid typescript content {{",
      );

      const config = await loadProjectSourceConfig(projectDir);
      expect(config).toBeNull();
    });
  });

  describe("default precedence (lowest)", () => {
    it("should use default source when no config exists", async () => {
      // No flag, no env, no project config
      const result = await resolveSource({ caller: "stored", projectDir });

      expect(result.sourceOrigin).toBe("default");
      expect(result.source).toBe(DEFAULT_SOURCE);
    });

    it("should handle undefined project directory", async () => {
      const result = await resolveSource({ caller: "stored" });

      expect(result.sourceOrigin).toBe("default");
      expect(result.source).toBe(DEFAULT_SOURCE);
    });
  });

  describe("marketplace resolution", () => {
    it("should resolve marketplace from project config", async () => {
      await createProjectConfig(projectDir, {
        marketplaceName: "https://enterprise.example.com/plugins",
      });

      const result = await resolveSource({ caller: "stored", projectDir });

      expect(result.marketplace).toBe("https://enterprise.example.com/plugins");
    });

    it("should include marketplace alongside source", async () => {
      await createProjectConfig(projectDir, {
        marketplace: "github:myorg/skills",
        marketplaceName: "https://marketplace.example.com",
      });

      const result = await resolveSource({ caller: "stored", projectDir });

      expect(result.source).toBe("github:myorg/skills");
      expect(result.sourceOrigin).toBe("project");
      expect(result.marketplace).toBe("https://marketplace.example.com");
    });

    it("should return undefined marketplace when not configured in project", async () => {
      const result = await resolveSource({ caller: "stored", projectDir });

      expect(result.marketplace).toBeUndefined();
    });

    it("should preserve marketplace when using flag source", async () => {
      await createProjectConfig(projectDir, {
        marketplace: "github:project/source",
        marketplaceName: "https://marketplace.example.com",
      });

      // Flag overrides source but marketplace from config is preserved
      const result = await resolveSource({
        caller: "init",
        flag: "github:flag/source",
        projectDir,
      });

      expect(result.source).toBe("github:flag/source");
      expect(result.sourceOrigin).toBe("flag");
      expect(result.marketplace).toBe("https://marketplace.example.com");
    });
  });

  describe("the renamed marketplace fields", () => {
    it("keeps the ladder flag > env > project with the stored ref read from marketplace", async () => {
      await createProjectConfig(projectDir, { marketplace: TEST_SOURCE_URL });

      const flagged = await resolveSource({
        caller: "init",
        flag: TEST_CUSTOM_SOURCE_URL,
        projectDir,
      });
      expect(flagged.source).toBe(TEST_CUSTOM_SOURCE_URL);
      expect(flagged.sourceOrigin).toBe("flag");

      process.env[SOURCE_ENV_VAR] = ENV_SOURCE_REF;
      const fromEnv = await resolveSource({ caller: "init", projectDir });
      expect(fromEnv.source).toBe(ENV_SOURCE_REF);
      expect(fromEnv.sourceOrigin).toBe("env");

      delete process.env[SOURCE_ENV_VAR];
      const stored = await resolveSource({ caller: "stored", projectDir });
      expect(stored.source).toBe(TEST_SOURCE_URL);
      expect(stored.sourceOrigin).toBe("project");
    });

    it("takes the ref from marketplace and the label from marketplaceName", async () => {
      await createProjectConfig(projectDir, {
        marketplace: TEST_SOURCE_URL,
        marketplaceName: DEFAULT_PUBLIC_SOURCE_NAME,
      });

      const result = await resolveSource({ caller: "stored", projectDir });

      expect(result.source, "the ref is what the run fetches from").toBe(TEST_SOURCE_URL);
      expect(result.marketplace, "the name is what plugins are registered under").toBe(
        DEFAULT_PUBLIC_SOURCE_NAME,
      );
    });
  });

  /**
   * The install-repointing trap, closed. `loadSourceConfig` once turned EVERY load failure into
   * `null`, so a refusal raised in the Zod schema alone arrived here as "no config" — and
   * `resolveSource` reads the return value alone, so it walked past that rung to the public
   * marketplace instead of the one the config named. It now re-raises `ConfigSchemaError` and
   * `ConfigDefaultExportError`: a file that EVALUATED and said something the schema refuses is a
   * statement about this install, and only a file that could not be evaluated at all is still
   * reported as absence. These two hold the refusal at the caller — both assert that
   * `resolveSource` rejects, which is the shape a silent `null` could never produce.
   */
  describe("a config carrying a field name from before the rename", () => {
    it("refuses to resolve rather than repointing at the default marketplace", async () => {
      await writeTestTsConfig(projectDir, buildPreRenameProjectConfig());

      const resolution = resolveSource({ caller: "stored", projectDir });

      await expect(resolution).rejects.toThrow(/source/);
      await expect(resolution).rejects.toThrow(/marketplace/);
    });

    it("refuses to resolve when a skill entry's provenance sits under the old key", async () => {
      await writeTestTsConfig(projectDir, buildPreRenameSkillEntryConfig());

      const resolution = resolveSource({ caller: "stored", projectDir });

      await expect(resolution).rejects.toThrow(/source/);
      await expect(resolution).rejects.toThrow(/origin/);
    });
  });
});

describe("User Journey: Project Config Save and Load", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-save-load-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /**
   * Records `source` in a project's config the way every caller does now that
   * the gate owns the write: read what is there, overlay the source, hand the
   * partial to `writeProjectPartial` (see `recordSource` in `eject.ts`).
   */
  async function saveSourceToProjectConfig(
    dir: string,
    source: string,
    fallbackName: string,
  ): Promise<void> {
    const existing = (await loadProjectSourceConfig(dir)) ?? {};
    await writeProjectPartial(dir, { ...existing, marketplace: source }, { fallbackName });
  }

  describe("saveSourceToProjectConfig", () => {
    it("should create config directory if it does not exist", async () => {
      await saveSourceToProjectConfig(projectDir, "github:test/repo", "test-project");

      const configPath = getProjectConfigPath(projectDir);
      expect(await fileExists(configPath)).toBe(true);

      // Boundary cast: config parse returns `unknown`
      const config = await readTestTsConfig<ProjectConfig>(configPath);
      expect(config.marketplace).toBe("github:test/repo");
    });

    it("should overwrite existing source", async () => {
      await saveSourceToProjectConfig(projectDir, "github:first/repo", "test-project");
      await saveSourceToProjectConfig(projectDir, "github:second/repo", "test-project");

      const configPath = getProjectConfigPath(projectDir);
      // Boundary cast: config parse returns `unknown`
      const config = await readTestTsConfig<ProjectConfig>(configPath);

      expect(config.marketplace).toBe("github:second/repo");
    });
  });

  describe("loadProjectSourceConfig", () => {
    it("should load saved config correctly", async () => {
      const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(configDir, { recursive: true });
      await writeFile(
        path.join(configDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs({
          marketplace: "github:company/private-skills",
          marketplaceName: "https://internal-marketplace.company.com",
        }),
      );

      const config = await loadProjectSourceConfig(projectDir);

      expect(config?.marketplace).toBe("github:company/private-skills");
      expect(config?.marketplaceName).toBe("https://internal-marketplace.company.com");
    });

    it("should return config path from getProjectConfigPath", () => {
      const configPath = getProjectConfigPath(projectDir);
      expect(configPath).toBe(path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS));
    });
  });
});

describe("User Journey: Config Precedence with CLI", () => {
  let dirs: TestDirs;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    delete process.env[SOURCE_ENV_VAR];
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    delete process.env[SOURCE_ENV_VAR];
    await cleanupTestSource(dirs);
  });

  it("should respect config precedence in actual command execution", async () => {
    // Create test fixture with project config
    dirs = await createTestSource({
      projectConfig: {
        name: "test-project",
        // Note: source is in project config, not plugin config
      },
    });

    process.chdir(dirs.projectDir);

    // Create project-level config with custom source
    await createProjectConfig(dirs.projectDir, {
      marketplace: "github:my-company/internal-skills",
    });

    // Verify project config was created
    const config = await loadProjectSourceConfig(dirs.projectDir);
    expect(config?.marketplace).toBe("github:my-company/internal-skills");
  });

  it("should allow environment variable to override project config", async () => {
    dirs = await createTestSource({
      projectConfig: {
        name: "test-project",
      },
    });

    process.chdir(dirs.projectDir);

    await createProjectConfig(dirs.projectDir, {
      marketplace: "github:project/source",
    });

    // Set environment variable
    process.env[SOURCE_ENV_VAR] = "github:env/override";

    // Resolve source as the install-time caller — env should win
    const result = await resolveSource({ caller: "init", projectDir: dirs.projectDir });

    expect(result.source).toBe("github:env/override");
    expect(result.sourceOrigin).toBe("env");
  });
});

describe("User Journey: Config Edge Cases", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-edge-cases-");
    delete process.env[SOURCE_ENV_VAR];
  });

  afterEach(async () => {
    delete process.env[SOURCE_ENV_VAR];
    await cleanupTempDir(tempDir);
  });

  it("should handle config with only optional fields", async () => {
    const projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });

    await createProjectConfig(projectDir, {
      marketplaceName: "https://marketplace.example.com",
      // No marketplace ref field
    });

    const config = await loadProjectSourceConfig(projectDir);
    expect(config?.marketplace).toBeUndefined();
    expect(config?.marketplaceName).toBe("https://marketplace.example.com");

    // Resolve should fall back to default for source
    const result = await resolveSource({ caller: "stored", projectDir });
    expect(result.sourceOrigin).toBe("default");
    // But should still have marketplace
    expect(result.marketplace).toBe("https://marketplace.example.com");
  });

  it("should handle empty config file gracefully", async () => {
    const projectDir = path.join(tempDir, "project");
    const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, STANDARD_FILES.CONFIG_TS), "export default {};");

    const config = await loadProjectSourceConfig(projectDir);
    // Empty config (zero keys) is treated as "not installed" — loadConfig returns null
    // for empty module objects since they are indistinguishable from files with no default export.
    expect(config).toBeNull();
  });

  it("should allow extra unknown fields (passthrough schema)", async () => {
    // projectSourceConfigSchema uses .passthrough() so unknown fields are preserved
    // rather than rejected. This enables forward compatibility — older CLI versions
    // can load configs written by newer versions without breaking.
    const projectDir = path.join(tempDir, "project");
    const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      renderConfigTs({
        marketplace: "github:valid/source",
        unknown_field: "should_be_ignored",
        another_unknown: "also_ignored",
      }),
    );

    const config = await loadProjectSourceConfig(projectDir);
    expect(config?.marketplace).toBe("github:valid/source");
  });

  it("should support local file paths as source", async () => {
    const localPath = path.join(tempDir, "local-skills");
    await mkdir(localPath, { recursive: true });

    const result = await resolveSource({ caller: "init", flag: localPath });

    expect(result.source).toBe(localPath);
    expect(result.sourceOrigin).toBe("flag");
  });

  it("should support relative paths as source", async () => {
    const result = await resolveSource({ caller: "init", flag: "./relative/path" });

    expect(result.source).toBe("./relative/path");
    expect(result.sourceOrigin).toBe("flag");
  });
});
