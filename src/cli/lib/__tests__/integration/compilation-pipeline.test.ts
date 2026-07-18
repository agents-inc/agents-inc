import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, readFile, stat } from "fs/promises";
import { compileAllSkillPlugins } from "../../skills";
import { compileStackPlugin, loadStacks } from "../../stacks";
import {
  generateMarketplace,
  writeMarketplace,
  getMarketplaceStats,
} from "../../marketplace-generator";
import { validateAllPlugins, validatePlugin } from "../../plugins";
import {
  DEFAULT_BRANDING,
  DEFAULT_PLUGIN_NAME,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
} from "../../../consts";
import type { Marketplace, PluginManifest } from "../../../types";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { COMPILATION_TEST_STACK } from "../mock-data/mock-stacks.js";

async function readPluginManifest(pluginDir: string): Promise<PluginManifest | null> {
  const manifestPath = path.join(pluginDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE);
  return readFile(manifestPath, "utf-8")
    .then((content) => JSON.parse(content) as PluginManifest)
    .catch(() => null);
}

async function pathExists(p: string): Promise<boolean> {
  return stat(p)
    .then(() => true)
    .catch(() => false);
}

describe("Integration: Full Skill Pipeline", () => {
  let dirs: TestDirs;
  let tempDir: string;
  let outputDir: string;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    dirs = await createTestSource();
    tempDir = await createTempDir("skill-pipeline-test-");
    outputDir = path.join(tempDir, "plugins");
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestSource(dirs);
    await cleanupTempDir(tempDir);
  });

  it("should compile all skills to plugins without errors", async () => {
    const { compiled: results } = await compileAllSkillPlugins(dirs.skillsDir, outputDir);

    const expectedSkillNames = DEFAULT_TEST_SKILLS.map((s) => s.id).sort();
    expect(results.map((r) => r.skillName).sort()).toStrictEqual(expectedSkillNames);

    for (const result of results) {
      expect(result.pluginPath).toContain(outputDir);
      expect(result.manifest.name).toBe(result.skillName);
    }
  });

  it("should validate all compiled skill plugins", async () => {
    await compileAllSkillPlugins(dirs.skillsDir, outputDir);

    const validationResult = await validateAllPlugins(outputDir);

    expect(validationResult.summary.total).toBe(DEFAULT_TEST_SKILLS.length);
    expect(validationResult.summary.invalid).toBe(0);
  });

  it("should generate marketplace with correct plugin count", async () => {
    await compileAllSkillPlugins(dirs.skillsDir, outputDir);

    const marketplace = await generateMarketplace(outputDir, {
      name: "test-marketplace",
      ownerName: "Test Owner",
      pluginRoot: "./plugins",
    });

    const expectedSkillNames = DEFAULT_TEST_SKILLS.map((s) => s.id).sort();
    expect(marketplace.plugins.map((p) => p.name).sort()).toStrictEqual(expectedSkillNames);

    for (const plugin of marketplace.plugins) {
      expect(plugin.source).toBeTypeOf("string");
    }

    const stats = getMarketplaceStats(marketplace);
    expect(stats.total).toBe(expectedSkillNames.length);
    expect(Object.keys(stats.byCategory)).toHaveLength(1);
  });

  it("should produce plugins with unique names", async () => {
    const { compiled: results } = await compileAllSkillPlugins(dirs.skillsDir, outputDir);

    const names = results.map((r) => r.manifest.name);
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });
});

describe("Integration: Full Stack Pipeline", () => {
  let dirs: TestDirs;
  let tempDir: string;
  let outputDir: string;

  beforeEach(async () => {
    dirs = await createTestSource();
    tempDir = await createTempDir("stack-pipeline-test-");
    outputDir = path.join(tempDir, "stacks");
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
    await cleanupTempDir(tempDir);
  });

  it("should list available stacks from fixture", async () => {
    // Create a source with stacks defined in config/stacks.ts
    const stackDirs = await createTestSource({
      stacks: [
        {
          id: COMPILATION_TEST_STACK.id,
          name: COMPILATION_TEST_STACK.name,
          description: COMPILATION_TEST_STACK.description,
          // Boundary cast: createTestSource expects simplified agent record
          agents: COMPILATION_TEST_STACK.agents as unknown as Record<
            string,
            Record<string, string>
          >,
        },
      ],
    });

    const stacks = await loadStacks(stackDirs.sourceDir);

    expect(stacks).toHaveLength(1);
    expect(stacks.map((s) => s.id)).toStrictEqual(["test-stack"]);

    await cleanupTestSource(stackDirs);
  });

  it("should compile test stack successfully", async () => {
    const result = await compileStackPlugin({
      stackId: COMPILATION_TEST_STACK.id,
      outputDir,
      projectRoot: dirs.sourceDir,
      agentSourcePath: dirs.sourceDir,
      stack: COMPILATION_TEST_STACK,
    });

    expect(result.pluginPath).toBe(path.join(outputDir, COMPILATION_TEST_STACK.id));
    expect(result.stackName).toBe("Test Stack");
    expect(result.agents.sort()).toStrictEqual(["api-developer", "web-developer"]);

    expect(await pathExists(result.pluginPath)).toBe(true);
    expect(await pathExists(path.join(result.pluginPath, "agents"))).toBe(true);
    expect(
      await pathExists(path.join(result.pluginPath, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE)),
    ).toBe(true);
    expect(await pathExists(path.join(result.pluginPath, "README.md"))).toBe(true);

    const manifest = await readPluginManifest(result.pluginPath);
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe(COMPILATION_TEST_STACK.id);
    // Claude Code discovers agents automatically from ./agents/ directory
    expect(manifest!.agents).toBeUndefined();
  });

  it("should generate README with agent list", async () => {
    const result = await compileStackPlugin({
      stackId: COMPILATION_TEST_STACK.id,
      outputDir,
      projectRoot: dirs.sourceDir,
      agentSourcePath: dirs.sourceDir,
      stack: COMPILATION_TEST_STACK,
    });

    const readmePath = path.join(result.pluginPath, "README.md");
    const readme = await readFile(readmePath, "utf-8");

    expect(readme).toContain("# ");
    expect(readme).toContain("## Agents");
    expect(readme).toContain("## Installation");

    for (const agent of result.agents) {
      expect(readme).toContain(agent);
    }
  });

  it("should include skill plugin references in manifest", async () => {
    const result = await compileStackPlugin({
      stackId: COMPILATION_TEST_STACK.id,
      outputDir,
      projectRoot: dirs.sourceDir,
      agentSourcePath: dirs.sourceDir,
      stack: COMPILATION_TEST_STACK,
    });

    expect(result.skillPlugins.sort()).toStrictEqual(["api-framework-hono", "web-framework-react"]);
  });

  it("should validate compiled stack plugins", async () => {
    await compileStackPlugin({
      stackId: COMPILATION_TEST_STACK.id,
      outputDir,
      projectRoot: dirs.sourceDir,
      agentSourcePath: dirs.sourceDir,
      stack: COMPILATION_TEST_STACK,
    });

    const pluginPath = path.join(outputDir, COMPILATION_TEST_STACK.id);
    const validationResult = await validatePlugin(pluginPath);

    expect(validationResult.valid).toBe(true);
    expect(validationResult.errors).toHaveLength(0);
  });
});

describe("Integration: Marketplace Integrity", () => {
  let dirs: TestDirs;
  let tempDir: string;
  let pluginsDir: string;
  let marketplacePath: string;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    dirs = await createTestSource();
    tempDir = await createTempDir("marketplace-test-");
    pluginsDir = path.join(tempDir, "plugins");
    marketplacePath = path.join(tempDir, "marketplace.json");
    await mkdir(pluginsDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestSource(dirs);
    await cleanupTempDir(tempDir);
  });

  it("should generate valid marketplace.json", async () => {
    await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);

    const marketplace = await generateMarketplace(pluginsDir, {
      name: DEFAULT_PLUGIN_NAME,
      version: "1.0.0",
      description: `${DEFAULT_BRANDING.NAME} Skills Marketplace`,
      ownerName: DEFAULT_BRANDING.NAME,
      ownerEmail: "hello@example.com",
      pluginRoot: "./plugins",
    });

    await writeMarketplace(marketplacePath, marketplace);

    const content = await readFile(marketplacePath, "utf-8");
    const parsed = JSON.parse(content) as Marketplace;

    expect(parsed.$schema).toBe("https://anthropic.com/claude-code/marketplace.schema.json");
    expect(parsed.name).toBe(DEFAULT_PLUGIN_NAME);
    expect(parsed.version).toBe("1.0.0");
    expect(parsed.owner.name).toBe(DEFAULT_BRANDING.NAME);
    expect(parsed.owner.email).toBe("hello@example.com");
    expect(parsed.metadata?.pluginRoot).toBe("./plugins");
    expect(parsed.plugins.length).toBe(DEFAULT_TEST_SKILLS.length);
  });

  it("should have no duplicate plugin names", async () => {
    await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);

    const marketplace = await generateMarketplace(pluginsDir, {
      name: "test-marketplace",
      ownerName: "Test Owner",
      pluginRoot: "./plugins",
    });

    const names = marketplace.plugins.map((p) => p.name);
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });

  it("should have all plugin source paths resolvable", async () => {
    await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);

    const marketplace = await generateMarketplace(pluginsDir, {
      name: "test-marketplace",
      ownerName: "Test Owner",
      pluginRoot: "./plugins",
    });

    for (const plugin of marketplace.plugins) {
      if (typeof plugin.source === "string") {
        const relativePath = plugin.source.replace("./plugins/", "");
        const absolutePath = path.join(pluginsDir, relativePath);

        const exists = await pathExists(absolutePath);
        expect(exists).toBe(true);
      }
    }
  });

  it("should have plugins sorted alphabetically", async () => {
    await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);

    const marketplace = await generateMarketplace(pluginsDir, {
      name: "test-marketplace",
      ownerName: "Test Owner",
      pluginRoot: "./plugins",
    });

    const names = marketplace.plugins.map((p) => p.name);
    const sortedNames = [...names].sort((a, b) => a.localeCompare(b));

    expect(names).toStrictEqual(sortedNames);
  });

  it("should categorize plugins correctly", async () => {
    await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);

    const marketplace = await generateMarketplace(pluginsDir, {
      name: "test-marketplace",
      ownerName: "Test Owner",
      pluginRoot: "./plugins",
    });

    const stats = getMarketplaceStats(marketplace);

    // Plugin manifests don't carry category — all plugins are uncategorized
    // Categories come from skill metadata.yaml, not from plugin.json
    expect(stats.byCategory["uncategorized"]).toBe(marketplace.plugins.length);
  });
});

describe("Integration: End-to-End Pipeline", () => {
  let dirs: TestDirs;
  let tempDir: string;
  let pluginsDir: string;
  let stacksDir: string;

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    dirs = await createTestSource();
    tempDir = await createTempDir("e2e-pipeline-test-");
    pluginsDir = path.join(tempDir, "plugins");
    stacksDir = path.join(tempDir, "stacks");
    await mkdir(pluginsDir, { recursive: true });
    await mkdir(stacksDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestSource(dirs);
    await cleanupTempDir(tempDir);
  });

  it("should compile skills then stacks in sequence", async () => {
    const { compiled: skillResults } = await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);
    const expectedSkillNames = DEFAULT_TEST_SKILLS.map((s) => s.id).sort();
    expect(skillResults.map((r) => r.skillName).sort()).toStrictEqual(expectedSkillNames);

    const skillValidation = await validateAllPlugins(pluginsDir);
    expect(skillValidation.summary.invalid).toBe(0);

    const stackResult = await compileStackPlugin({
      stackId: COMPILATION_TEST_STACK.id,
      outputDir: stacksDir,
      projectRoot: dirs.sourceDir,
      agentSourcePath: dirs.sourceDir,
      stack: COMPILATION_TEST_STACK,
    });
    expect(stackResult.agents.sort()).toStrictEqual(["api-developer", "web-developer"]);

    const stackValidation = await validatePlugin(stackResult.pluginPath);
    expect(stackValidation.valid).toBe(true);

    const marketplace = await generateMarketplace(pluginsDir, {
      name: "test-marketplace",
      ownerName: "Test Owner",
      pluginRoot: "./plugins",
    });
    expect(marketplace.plugins.map((p) => p.name).sort()).toStrictEqual(expectedSkillNames);
  });

  it("should have valid skill plugin reference format", async () => {
    const stackResult = await compileStackPlugin({
      stackId: COMPILATION_TEST_STACK.id,
      outputDir: stacksDir,
      projectRoot: dirs.sourceDir,
      agentSourcePath: dirs.sourceDir,
      stack: COMPILATION_TEST_STACK,
    });

    expect(stackResult.skillPlugins.sort()).toStrictEqual([
      "api-framework-hono",
      "web-framework-react",
    ]);
  });

  it("should compile skills and stacks that share common patterns", async () => {
    const { compiled: skillResults } = await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);

    const stackResult = await compileStackPlugin({
      stackId: COMPILATION_TEST_STACK.id,
      outputDir: stacksDir,
      projectRoot: dirs.sourceDir,
      agentSourcePath: dirs.sourceDir,
      stack: COMPILATION_TEST_STACK,
    });

    const stackSkillNames = new Set(stackResult.skillPlugins);
    const compiledSkillNames = new Set(skillResults.map((r) => r.manifest.name));

    const commonSkills = [...stackSkillNames].filter((name) => compiledSkillNames.has(name)).sort();
    expect(commonSkills).toStrictEqual(["api-framework-hono", "web-framework-react"]);
  });
});
