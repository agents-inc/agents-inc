import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, readFile } from "fs/promises";
import { compileAllSkillPlugins } from "../../skills";
import { loadStacks } from "../../stacks";
import {
  generateMarketplace,
  writeMarketplace,
  getMarketplaceStats,
} from "../../marketplace-generator";
import { validateAllPlugins } from "../../plugins";
import { DEFAULT_BRANDING, DEFAULT_PLUGIN_NAME } from "../../../consts";
import type { Marketplace } from "../../../types";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { createTempDir, cleanupTempDir, directoryExists } from "../test-fs-utils";
import { silenceConsole } from "../helpers/silence-console.js";
import { COMPILATION_TEST_STACK } from "../mock-data/mock-stacks.js";

/** Standard marketplace-generation options shared across pipeline tests. */
const TEST_MARKETPLACE_OPTIONS = {
  name: "test-marketplace",
  ownerName: "Test Owner",
  pluginRoot: "./plugins",
};

describe("Integration: Full Skill Pipeline", () => {
  let dirs: TestDirs;
  let tempDir: string;
  let outputDir: string;

  silenceConsole(["log", "warn"]);

  beforeEach(async () => {
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

    const marketplace = await generateMarketplace(outputDir, TEST_MARKETPLACE_OPTIONS);

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

describe("Integration: Stack Discovery", () => {
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
});

describe("Integration: Marketplace Integrity", () => {
  let dirs: TestDirs;
  let tempDir: string;
  let pluginsDir: string;
  let marketplacePath: string;

  silenceConsole(["log", "warn"]);

  beforeEach(async () => {
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

    const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

    const names = marketplace.plugins.map((p) => p.name);
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });

  it("should have all plugin source paths resolvable", async () => {
    await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);

    const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

    for (const plugin of marketplace.plugins) {
      if (typeof plugin.source === "string") {
        const relativePath = plugin.source.replace("./plugins/", "");
        const absolutePath = path.join(pluginsDir, relativePath);

        const exists = await directoryExists(absolutePath);
        expect(exists).toBe(true);
      }
    }
  });

  it("should have plugins sorted alphabetically", async () => {
    await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);

    const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

    const names = marketplace.plugins.map((p) => p.name);
    const sortedNames = [...names].sort((a, b) => a.localeCompare(b));

    expect(names).toStrictEqual(sortedNames);
  });

  it("should categorize plugins correctly", async () => {
    await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);

    const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

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

  silenceConsole(["log", "warn"]);

  beforeEach(async () => {
    dirs = await createTestSource();
    tempDir = await createTempDir("e2e-pipeline-test-");
    pluginsDir = path.join(tempDir, "plugins");
    await mkdir(pluginsDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTestSource(dirs);
    await cleanupTempDir(tempDir);
  });

  it("should compile, validate and publish skills in sequence", async () => {
    const { compiled: skillResults } = await compileAllSkillPlugins(dirs.skillsDir, pluginsDir);
    const expectedSkillNames = DEFAULT_TEST_SKILLS.map((s) => s.id).sort();
    expect(skillResults.map((r) => r.skillName).sort()).toStrictEqual(expectedSkillNames);

    const skillValidation = await validateAllPlugins(pluginsDir);
    expect(skillValidation.summary.invalid).toBe(0);

    const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);
    expect(marketplace.plugins.map((p) => p.name).sort()).toStrictEqual(expectedSkillNames);
  });
});
