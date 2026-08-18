import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import {
  generateMarketplace,
  writeMarketplace,
  getMarketplaceStats,
  validateMarketplaceName,
  validateSkillIdNamespace,
} from "./marketplace-generator";
import type { Marketplace } from "../types";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE } from "../consts";
import { createTempDir, cleanupTempDir } from "./__tests__/test-fs-utils";
import { firstElement } from "./__tests__/helpers/element-at.js";

/** Standard marketplace-generation options shared across tests. */
const TEST_MARKETPLACE_OPTIONS = {
  name: "test-marketplace",
  ownerName: "Test Owner",
  pluginRoot: "./plugins",
};

/** An ordinary author's package.json name — no claim on any reserved namespace. */
const AUTHOR_PACKAGE_NAME = "acme-skills";

/** The npm package the public catalogue publishes from, and the only holder of its name. */
const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

/** The name the public catalogue publishes its marketplace under. */
const PUBLIC_CATALOGUE_NAME = "agents-inc";

/** How many offending ids a namespace refusal spells out before summarising. */
const LISTED_VIOLATIONS = 10;

/** Enough beyond {@link LISTED_VIOLATIONS} that the summary line has to appear. */
const OVERFLOWING_VIOLATIONS = 3;

/** A marketplace published under `name` listing exactly `pluginNames`. */
function marketplaceListing(name: string, pluginNames: string[]): Marketplace {
  return {
    name,
    version: "1.0.0",
    owner: { name: "Test Owner" },
    plugins: pluginNames.map((pluginName) => ({
      name: pluginName,
      source: `./plugins/${pluginName}`,
    })),
  };
}

describe("marketplace-generator", () => {
  let tempDir: string;
  let pluginsDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("marketplace-test-");
    pluginsDir = path.join(tempDir, "plugins");
    await mkdir(pluginsDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  // Helper to create a plugin with manifest
  async function createPlugin(name: string, manifest: Record<string, unknown>): Promise<void> {
    const pluginDir = path.join(pluginsDir, name);
    await mkdir(path.join(pluginDir, PLUGIN_MANIFEST_DIR), { recursive: true });
    await writeFile(
      path.join(pluginDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE),
      JSON.stringify(manifest, null, 2),
    );
    await writeFile(path.join(pluginDir, "README.md"), `# ${name}`);
  }

  describe("generateMarketplace", () => {
    it("should include all plugins from directory", async () => {
      await createPlugin("web-framework-react", {
        name: "web-framework-react",
        description: "React skills",
        version: "1.0.0",
      });
      await createPlugin("web-framework-vue", {
        name: "web-framework-vue",
        description: "Vue skills",
        version: "1.0.0",
      });

      const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

      expect(marketplace.plugins).toHaveLength(2);
      const names = marketplace.plugins.map((p) => p.name);
      expect(names).toContain("web-framework-react");
      expect(names).toContain("web-framework-vue");
    });

    it("should include plugin category in marketplace entry", async () => {
      await createPlugin("web-framework-react", {
        name: "web-framework-react",
        description: "React framework",
        version: "1.0.0",
        category: "web-framework",
      });

      const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

      const reactPlugin = marketplace.plugins.find((p) => p.name === "web-framework-react");
      expect(reactPlugin?.category).toBe("web-framework");
    });

    it("should generate plugin without category when the manifest carries none", async () => {
      await createPlugin("web-framework-react", {
        name: "web-framework-react",
        description: "React framework",
        version: "1.0.0",
      });

      const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

      const reactPlugin = marketplace.plugins.find((p) => p.name === "web-framework-react");
      expect(reactPlugin?.category).toBeUndefined();
    });

    it("should sort plugins alphabetically", async () => {
      await createPlugin("web-state-zustand", {
        name: "web-state-zustand",
        description: "Zustand state",
        version: "1.0.0",
      });
      await createPlugin("api-http-axios", {
        name: "api-http-axios",
        description: "Axios HTTP",
        version: "1.0.0",
      });
      await createPlugin("web-state-mobx", {
        name: "web-state-mobx",
        description: "MobX state",
        version: "1.0.0",
      });

      const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

      const names = marketplace.plugins.map((p) => p.name);
      expect(names).toStrictEqual(["api-http-axios", "web-state-mobx", "web-state-zustand"]);
    });

    it("should include marketplace metadata", async () => {
      await createPlugin("web-test-a", {
        name: "web-test-a",
        description: "Test",
        version: "1.0.0",
      });

      const marketplace = await generateMarketplace(pluginsDir, {
        name: "my-marketplace",
        version: "2.0.0",
        description: "My awesome marketplace",
        ownerName: "Claude",
        ownerEmail: "claude@example.com",
        pluginRoot: "./dist/plugins",
      });

      expect(marketplace.name).toBe("my-marketplace");
      expect(marketplace.version).toBe("2.0.0");
      expect(marketplace.description).toBe("My awesome marketplace");
      expect(marketplace.owner.name).toBe("Claude");
      expect(marketplace.owner.email).toBe("claude@example.com");
      expect(marketplace.metadata?.pluginRoot).toBe("./dist/plugins");
    });

    it("should include $schema field", async () => {
      await createPlugin("web-test-a", {
        name: "web-test-a",
        description: "Test",
        version: "1.0.0",
      });

      const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

      expect(marketplace.$schema).toBe("https://anthropic.com/claude-code/marketplace.schema.json");
    });

    it("should use default version 1.0.0 when not specified", async () => {
      await createPlugin("web-test-a", {
        name: "web-test-a",
        description: "Test",
        version: "1.0.0",
      });

      const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

      expect(marketplace.version).toBe("1.0.0");
    });

    it("should handle empty plugins directory", async () => {
      const marketplace = await generateMarketplace(pluginsDir, {
        name: "empty-marketplace",
        ownerName: "Test Owner",
        pluginRoot: "./plugins",
      });

      expect(marketplace.plugins).toHaveLength(0);
    });

    it("should skip directories without valid plugin.json", async () => {
      // Create a valid plugin
      await createPlugin("web-valid-a", {
        name: "web-valid-a",
        description: "Valid plugin",
        version: "1.0.0",
      });

      // Create an invalid directory (no .claude-plugin)
      await mkdir(path.join(pluginsDir, "not-a-plugin"), { recursive: true });
      await writeFile(path.join(pluginsDir, "not-a-plugin", "README.md"), "# Not a plugin");

      const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

      expect(marketplace.plugins).toHaveLength(1);
      expect(firstElement(marketplace.plugins).name).toBe("web-valid-a");
    });

    it("should include plugin author in marketplace entry", async () => {
      await createPlugin("web-with-author", {
        name: "web-with-author",
        description: "Plugin with author",
        version: "1.0.0",
        author: {
          name: "@vince",
          email: "vince@example.com",
        },
      });

      const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

      const plugin = firstElement(marketplace.plugins);
      expect(plugin.author?.name).toBe("@vince");
      expect(plugin.author?.email).toBe("vince@example.com");
    });

    it("should include plugin keywords in marketplace entry", async () => {
      await createPlugin("web-with-keywords", {
        name: "web-with-keywords",
        description: "Plugin with keywords",
        version: "1.0.0",
        keywords: ["web", "react", "ui"],
      });

      const marketplace = await generateMarketplace(pluginsDir, TEST_MARKETPLACE_OPTIONS);

      const plugin = firstElement(marketplace.plugins);
      expect(plugin.keywords).toStrictEqual(["web", "react", "ui"]);
    });

    it("should generate correct source paths for plugins", async () => {
      await createPlugin("web-test-a", {
        name: "web-test-a",
        description: "Test plugin",
        version: "1.0.0",
      });

      const marketplace = await generateMarketplace(pluginsDir, {
        name: "test-marketplace",
        ownerName: "Test Owner",
        pluginRoot: "./dist/plugins",
      });

      const plugin = firstElement(marketplace.plugins);
      expect(plugin.source).toBe("./dist/plugins/web-test-a");
    });
  });

  describe("writeMarketplace", () => {
    it("should create parent directories", async () => {
      const marketplace: Marketplace = {
        $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
        name: "test",
        version: "1.0.0",
        owner: { name: "Test" },
        plugins: [],
      };

      const nestedPath = path.join(tempDir, "nested", "dir", "marketplace.json");
      await writeMarketplace(nestedPath, marketplace);

      const content = await readFile(nestedPath, "utf-8");
      expect(JSON.parse(content).name).toBe("test");
    });

    it("should write valid JSON", async () => {
      const marketplace: Marketplace = {
        $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
        name: "valid-marketplace",
        version: "1.0.0",
        description: "Test description",
        owner: { name: "Test Owner", email: "test@example.com" },
        plugins: [
          {
            name: "web-framework-react",
            source: "./plugins/web-framework-react",
            description: "React skills",
            version: "1.0.0",
          },
        ],
      };

      const outputPath = path.join(tempDir, "marketplace.json");
      await writeMarketplace(outputPath, marketplace);

      const content = await readFile(outputPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.name).toBe("valid-marketplace");
      expect(parsed.version).toBe("1.0.0");
      expect(parsed.plugins).toHaveLength(1);
      expect(parsed.plugins[0].name).toBe("web-framework-react");
    });

    it("should include $schema field", async () => {
      const marketplace: Marketplace = {
        $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
        name: "test",
        version: "1.0.0",
        owner: { name: "Test" },
        plugins: [],
      };

      const outputPath = path.join(tempDir, "marketplace.json");
      await writeMarketplace(outputPath, marketplace);

      const content = await readFile(outputPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.$schema).toBe("https://anthropic.com/claude-code/marketplace.schema.json");
    });

    it("should format JSON with 2-space indentation", async () => {
      const marketplace: Marketplace = {
        name: "test",
        version: "1.0.0",
        owner: { name: "Test" },
        plugins: [],
      };

      const outputPath = path.join(tempDir, "marketplace.json");
      await writeMarketplace(outputPath, marketplace);

      const content = await readFile(outputPath, "utf-8");
      // Check for 2-space indentation
      expect(content).toContain('  "name"');
      expect(content).toContain('  "version"');
    });

    it("should add trailing newline", async () => {
      const marketplace: Marketplace = {
        name: "test",
        version: "1.0.0",
        owner: { name: "Test" },
        plugins: [],
      };

      const outputPath = path.join(tempDir, "marketplace.json");
      await writeMarketplace(outputPath, marketplace);

      const content = await readFile(outputPath, "utf-8");
      expect(content.endsWith("\n")).toBe(true);
    });
  });

  describe("getMarketplaceStats", () => {
    it("should count total plugins", () => {
      const marketplace: Marketplace = {
        name: "test",
        version: "1.0.0",
        owner: { name: "Test" },
        plugins: [
          { name: "plugin-1", source: "./p1", category: "web-framework" },
          { name: "plugin-2", source: "./p2", category: "api-api" },
          { name: "plugin-3", source: "./p3", category: "web-testing" },
        ],
      };

      const stats = getMarketplaceStats(marketplace);
      expect(stats.total).toBe(3);
    });

    it("should count by category", () => {
      const marketplace: Marketplace = {
        name: "test",
        version: "1.0.0",
        owner: { name: "Test" },
        plugins: [
          { name: "web-framework-react", source: "./p1", category: "web-framework" },
          { name: "web-framework-vue", source: "./p2", category: "web-framework" },
          { name: "api-framework-express", source: "./p3", category: "api-api" },
          { name: "web-testing-vitest", source: "./p4", category: "web-testing" },
        ],
      };

      const stats = getMarketplaceStats(marketplace);

      expect(stats.byCategory["web-framework"]).toBe(2);
      expect(stats.byCategory["api-api"]).toBe(1);
      expect(stats.byCategory["web-testing"]).toBe(1);
    });

    it("should handle empty plugins array", () => {
      const marketplace: Marketplace = {
        name: "test",
        version: "1.0.0",
        owner: { name: "Test" },
        plugins: [],
      };

      const stats = getMarketplaceStats(marketplace);

      expect(stats.total).toBe(0);
      expect(Object.keys(stats.byCategory)).toHaveLength(0);
    });

    it("should handle single plugin", () => {
      const marketplace: Marketplace = {
        name: "test",
        version: "1.0.0",
        owner: { name: "Test" },
        plugins: [{ name: "web-solo-a", source: "./p1", category: "shared-tooling" }],
      };

      const stats = getMarketplaceStats(marketplace);

      expect(stats.total).toBe(1);
      expect(stats.byCategory["shared-tooling"]).toBe(1);
    });

    it("should return correct stats structure", () => {
      const marketplace: Marketplace = {
        name: "test",
        version: "1.0.0",
        owner: { name: "Test" },
        plugins: [
          { name: "p1", source: "./p1", category: "web-framework" },
          { name: "p2", source: "./p2", category: "api-orm" },
        ],
      };

      const stats = getMarketplaceStats(marketplace);

      expect(stats).toStrictEqual({
        total: 2,
        byCategory: {
          "web-framework": 1,
          "api-orm": 1,
        },
      });
    });
  });

  describe("validateMarketplaceName", () => {
    it("accepts a name no other namespace owns", () => {
      expect(validateMarketplaceName("acme", AUTHOR_PACKAGE_NAME)).toBeNull();
    });

    it("refuses the public catalogue's name from any other package", () => {
      const error = validateMarketplaceName(PUBLIC_CATALOGUE_NAME, AUTHOR_PACKAGE_NAME);

      expect(error).not.toBeNull();
      expect(error).toContain(PUBLIC_CATALOGUE_NAME);
      expect(error).toContain("reserved");
    });

    it("refuses the namespace held by skills that have no marketplace", () => {
      const error = validateMarketplaceName("external", AUTHOR_PACKAGE_NAME);

      expect(error).not.toBeNull();
      expect(error).toContain("external");
    });

    it("refuses the namespace held by locally created skills", () => {
      const error = validateMarketplaceName("local", AUTHOR_PACKAGE_NAME);

      expect(error).not.toBeNull();
      expect(error).toContain("local");
    });

    it("lets the public catalogue's own package publish under the name it owns", () => {
      expect(validateMarketplaceName(PUBLIC_CATALOGUE_NAME, PUBLIC_CATALOGUE_PACKAGE)).toBeNull();
    });

    it("refuses the marketplace-less namespaces even to the public catalogue's package", () => {
      expect(validateMarketplaceName("external", PUBLIC_CATALOGUE_PACKAGE)).not.toBeNull();
      expect(validateMarketplaceName("local", PUBLIC_CATALOGUE_PACKAGE)).not.toBeNull();
    });
  });

  describe("validateSkillIdNamespace", () => {
    it("accepts a marketplace whose every skill id carries its name", () => {
      const marketplace = marketplaceListing("acme", [
        "acme-web-framework-react",
        "acme-api-framework-hono",
      ]);

      expect(validateSkillIdNamespace(marketplace)).toBeNull();
    });

    it("accepts a marketplace with no skills at all", () => {
      expect(validateSkillIdNamespace(marketplaceListing("acme", []))).toBeNull();
    });

    it("refuses a bare skill id, naming the marketplace and the id it expected", () => {
      const marketplace = marketplaceListing("acme", [
        "acme-api-framework-hono",
        "web-framework-react",
      ]);

      const error = validateSkillIdNamespace(marketplace);

      expect(error).not.toBeNull();
      expect(error).toContain("acme");
      expect(error).toContain("web-framework-react");
      expect(error).toContain("acme-web-framework-react");
    });

    it("names every id outside the namespace, not just the first", () => {
      const marketplace = marketplaceListing("acme", ["web-framework-react", "api-framework-hono"]);

      const error = validateSkillIdNamespace(marketplace);

      expect(error).toContain("acme-web-framework-react");
      expect(error).toContain("acme-api-framework-hono");
    });

    it("summarises the remainder rather than listing a whole broken catalogue", () => {
      const foreignIds = Array.from(
        { length: LISTED_VIOLATIONS + OVERFLOWING_VIOLATIONS },
        (_unused, index) => `web-framework-${index}`,
      );

      const error = validateSkillIdNamespace(marketplaceListing("acme", foreignIds));

      expect(error).toContain(`acme-${foreignIds[0]}`);
      expect(error).toContain(`... and ${OVERFLOWING_VIOLATIONS} more`);
      expect(
        error,
        "an id past the listing cap belongs to the summary, not to the list",
      ).not.toContain(`acme-${foreignIds[foreignIds.length - 1]}`);
    });

    it("refuses an id that is the marketplace's name with no skill after it", () => {
      expect(validateSkillIdNamespace(marketplaceListing("acme", ["acme"]))).not.toBeNull();
    });

    it("refuses a prefix that only shares a leading substring with the name", () => {
      const marketplace = marketplaceListing("acme", ["acmewide-web-framework-react"]);

      expect(validateSkillIdNamespace(marketplace)).not.toBeNull();
    });

    it("accepts the public catalogue's unprefixed ids", () => {
      const marketplace = marketplaceListing(PUBLIC_CATALOGUE_NAME, [
        "web-framework-react",
        "api-framework-hono",
      ]);

      expect(validateSkillIdNamespace(marketplace)).toBeNull();
    });
  });
});
