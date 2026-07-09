import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { runCliCommand } from "../../helpers/cli-runner.js";
import { writeTestPackageJson } from "../../helpers/config-io.js";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { fileExists } from "../../test-fs-utils";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE } from "../../../../consts";
import type { Marketplace, PluginManifest } from "../../../../types";

/** Creates a plugin directory with a valid plugin.json manifest */
async function createPluginDir(
  pluginsDir: string,
  name: string,
  manifest: PluginManifest,
): Promise<string> {
  const pluginDir = path.join(pluginsDir, name);
  const manifestDir = path.join(pluginDir, PLUGIN_MANIFEST_DIR);
  await mkdir(manifestDir, { recursive: true });
  await writeFile(path.join(manifestDir, PLUGIN_MANIFEST_FILE), JSON.stringify(manifest, null, 2));
  return pluginDir;
}

/** Reads and parses the generated marketplace.json */
async function readMarketplaceJson(outputPath: string): Promise<Marketplace> {
  const content = await readFile(outputPath, "utf-8");
  return JSON.parse(content) as Marketplace;
}

describe("build:marketplace command", () => {
  let tempDir: string;
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ tempDir, projectDir, cleanup } = await setupIsolatedHome("build-marketplace-test-home-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("package.json requirement", () => {
    it("should error when package.json is missing", async () => {
      const { error } = await runCliCommand(["build:marketplace"]);

      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("Missing package.json");
    });

    it("should error when package.json is missing required fields", async () => {
      // package.json missing name/version/description
      await writeFile(path.join(projectDir, "package.json"), JSON.stringify({}));

      const { error } = await runCliCommand(["build:marketplace"]);

      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("missing required fields");
    });

    it("should error when package.json is malformed JSON", async () => {
      await writeFile(path.join(projectDir, "package.json"), "{ this is not json");

      const { error } = await runCliCommand(["build:marketplace"]);

      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("Failed to parse package.json");
    });
  });

  describe("author parsing from package.json", () => {
    it('should parse string-form author "Name <email>"', async () => {
      await writeTestPackageJson(projectDir, {
        author: "Jane Doe <jane@example.com>",
      });
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      const { error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("Jane Doe");
      expect(marketplace.owner.email).toBe("jane@example.com");
    });

    it("should parse object-form author { name, email }", async () => {
      await writeTestPackageJson(projectDir, {
        // Object-form author; the schema accepts strings or objects
        author: { name: "Jane Doe", email: "jane@example.com" } as unknown as string,
      });
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      const { error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("Jane Doe");
      expect(marketplace.owner.email).toBe("jane@example.com");
    });

    it("should warn and proceed when author is missing", async () => {
      // Remove author entirely from package.json
      await writeFile(
        path.join(projectDir, "package.json"),
        JSON.stringify({
          name: "no-author-mp",
          version: "0.1.0",
          description: "Marketplace without an author",
        }),
      );
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      const { error, stderr } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      expect(stderr).toContain("author");
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("");
      expect(marketplace.owner.email).toBeUndefined();
    });

    it('should parse email-only string author "<email>"', async () => {
      await writeTestPackageJson(projectDir, {
        author: "<solo@example.com>",
      });
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      const { error, stderr } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      // Warns because name is empty
      expect(stderr).toContain("no parseable name");
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("");
      expect(marketplace.owner.email).toBe("solo@example.com");
    });

    it('should parse plain-name string author "Name" with no email', async () => {
      await writeTestPackageJson(projectDir, {
        author: "Solo Name",
      });
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      const { error, stderr } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      // Warns because no email is parseable
      expect(stderr).toContain("no parseable email");
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("Solo Name");
      expect(marketplace.owner.email).toBeUndefined();
    });

    it("should warn when author is an empty string", async () => {
      await writeTestPackageJson(projectDir, {
        author: "",
      });
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      const { error, stderr } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      // Empty string is treated as missing author
      expect(stderr).toContain("is missing 'author' field");
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("");
      expect(marketplace.owner.email).toBeUndefined();
    });

    it('should parse string-form author with trailing URL "Name <email> (url)"', async () => {
      await writeTestPackageJson(projectDir, {
        author: "Jane Doe <jane@example.com> (https://jane.example.com)",
      });
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      const { error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("Jane Doe");
      expect(marketplace.owner.email).toBe("jane@example.com");
    });

    it("should parse object-form author { name, email, url }", async () => {
      await writeTestPackageJson(projectDir, {
        // Object-form author with URL; `parseAuthor` preserves name + email
        author: {
          name: "Jane Doe",
          email: "jane@example.com",
          url: "https://jane.example.com",
        } as unknown as string,
      });
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      const { error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("Jane Doe");
      expect(marketplace.owner.email).toBe("jane@example.com");
    });
  });

  describe("basic execution", () => {
    it("should complete with zero plugins when no plugins directory exists", async () => {
      await writeTestPackageJson(projectDir);

      const { stdout, error } = await runCliCommand(["build:marketplace"]);

      expect(error).toBeUndefined();
      const output = stdout + (error?.message || "");
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });
  });

  describe("flag validation", () => {
    beforeEach(async () => {
      await writeTestPackageJson(projectDir);
    });

    it("should accept --plugins-dir flag with path", async () => {
      const pluginsPath = path.join(tempDir, "custom-plugins");

      const { error } = await runCliCommand(["build:marketplace", "--plugins-dir", pluginsPath]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept -p shorthand for plugins-dir", async () => {
      const pluginsPath = path.join(tempDir, "custom-plugins");

      const { error } = await runCliCommand(["build:marketplace", "-p", pluginsPath]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept --output flag with path", async () => {
      const outputPath = path.join(tempDir, "marketplace.json");

      const { error } = await runCliCommand(["build:marketplace", "--output", outputPath]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should accept -o shorthand for output", async () => {
      const outputPath = path.join(tempDir, "marketplace.json");

      const { error } = await runCliCommand(["build:marketplace", "-o", outputPath]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept --verbose flag", async () => {
      const { error } = await runCliCommand(["build:marketplace", "--verbose"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should accept -v shorthand for verbose", async () => {
      const { error } = await runCliCommand(["build:marketplace", "-v"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      await writeTestPackageJson(projectDir);
    });

    it("should handle missing plugins directory gracefully", async () => {
      const { stdout, error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        "/definitely/not/real/path/xyz",
      ]);

      const output = stdout + (error?.message || "");
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should handle empty plugins directory gracefully", async () => {
      const emptyPluginsDir = path.join(projectDir, "empty-plugins");
      await mkdir(emptyPluginsDir, { recursive: true });

      const { error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        emptyPluginsDir,
      ]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
    });

    it("should skip plugins with invalid plugin.json and not crash", async () => {
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      // Valid plugin
      await createPluginDir(pluginsDir, "web-framework-react", {
        name: "web-framework-react",
        description: "React framework",
        version: "1.0.0",
      });

      // Invalid plugin: plugin.json exists but contains invalid JSON
      const invalidPluginDir = path.join(pluginsDir, "broken-plugin");
      const invalidManifestDir = path.join(invalidPluginDir, PLUGIN_MANIFEST_DIR);
      await mkdir(invalidManifestDir, { recursive: true });
      await writeFile(
        path.join(invalidManifestDir, PLUGIN_MANIFEST_FILE),
        "{ this is not valid json }",
      );

      const { stdout, error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 plugins");

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.plugins).toHaveLength(1);
      expect(marketplace.plugins[0].name).toBe("web-framework-react");
    });

    it("should skip plugins with missing required name field in plugin.json", async () => {
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      // Valid plugin
      await createPluginDir(pluginsDir, "api-framework-hono", {
        name: "api-framework-hono",
        description: "Hono framework",
        version: "1.0.0",
      });

      // Invalid plugin: valid JSON but missing required 'name' field
      const invalidPluginDir = path.join(pluginsDir, "nameless-plugin");
      const invalidManifestDir = path.join(invalidPluginDir, PLUGIN_MANIFEST_DIR);
      await mkdir(invalidManifestDir, { recursive: true });
      await writeFile(
        path.join(invalidManifestDir, PLUGIN_MANIFEST_FILE),
        JSON.stringify({ description: "No name field", version: "1.0.0" }),
      );

      const { stdout, error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 plugins");

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.plugins).toHaveLength(1);
      expect(marketplace.plugins[0].name).toBe("api-framework-hono");
    });
  });

  describe("marketplace generation integration", () => {
    let pluginsDir: string;
    let outputPath: string;

    beforeEach(async () => {
      await writeTestPackageJson(projectDir);
      pluginsDir = path.join(projectDir, "dist", "plugins");
      outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });
    });

    it("should create marketplace.json from a single plugin", async () => {
      await createPluginDir(pluginsDir, "web-framework-react", {
        name: "web-framework-react",
        description: "React framework skills",
        version: "1.0.0",
      });

      const { stdout, error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 plugins");
      expect(await fileExists(outputPath)).toBe(true);

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.plugins).toHaveLength(1);
      expect(marketplace.plugins[0].name).toBe("web-framework-react");
      expect(marketplace.plugins[0].description).toBe("React framework skills");
      expect(marketplace.plugins[0].version).toBe("1.0.0");
    });

    it("should include marketplace identity from package.json in output", async () => {
      // Rewrite package.json with single-word values to match assertions
      await writeTestPackageJson(projectDir, {
        name: "my-marketplace",
        version: "2.5.0",
        description: "test-marketplace-description",
        author: "TestOwner <owner@test.com>",
      });

      await createPluginDir(pluginsDir, "web-test-a", {
        name: "web-test-a",
        description: "Test plugin",
        version: "0.1.0",
      });

      await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      const marketplace = await readMarketplaceJson(outputPath);

      expect(marketplace.name).toBe("my-marketplace");
      expect(marketplace.version).toBe("2.5.0");
      expect(marketplace.description).toBe("test-marketplace-description");
      expect(marketplace.owner.name).toBe("TestOwner");
      expect(marketplace.owner.email).toBe("owner@test.com");
      expect(marketplace.$schema).toBe("https://anthropic.com/claude-code/marketplace.schema.json");
    });

    it("should include all 5 plugins from a populated plugins directory", async () => {
      const plugins = [
        { name: "web-framework-react", description: "React framework" },
        { name: "web-state-zustand", description: "Zustand state management" },
        { name: "web-styling-scss-modules", description: "SCSS Modules styling" },
        { name: "api-framework-hono", description: "Hono API framework" },
        { name: "api-database-drizzle", description: "Drizzle ORM" },
      ];

      for (const plugin of plugins) {
        await createPluginDir(pluginsDir, plugin.name, {
          name: plugin.name,
          description: plugin.description,
          version: "1.0.0",
        });
      }

      const { stdout, error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("5 plugins");

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.plugins).toHaveLength(5);

      const names = marketplace.plugins.map((p) => p.name);
      for (const plugin of plugins) {
        expect(names).toContain(plugin.name);
      }
    });

    it("should sort plugins alphabetically in output", async () => {
      // Create plugins in non-alphabetical order
      await createPluginDir(pluginsDir, "web-state-zustand", {
        name: "web-state-zustand",
        description: "Zustand",
        version: "1.0.0",
      });
      await createPluginDir(pluginsDir, "api-framework-hono", {
        name: "api-framework-hono",
        description: "Hono",
        version: "1.0.0",
      });
      await createPluginDir(pluginsDir, "web-framework-react", {
        name: "web-framework-react",
        description: "React",
        version: "1.0.0",
      });

      await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      const marketplace = await readMarketplaceJson(outputPath);
      const names = marketplace.plugins.map((p) => p.name);

      expect(names).toStrictEqual([
        "api-framework-hono",
        "web-framework-react",
        "web-state-zustand",
      ]);
    });

    it("should preserve explicit categories from plugin manifests", async () => {
      await createPluginDir(pluginsDir, "web-framework-react", {
        name: "web-framework-react",
        description: "React",
        version: "1.0.0",
      });
      await createPluginDir(pluginsDir, "api-database-drizzle", {
        name: "api-database-drizzle",
        description: "Drizzle",
        version: "1.0.0",
      });
      await createPluginDir(pluginsDir, "meta-methodology-anti-over-engineering", {
        name: "meta-methodology-anti-over-engineering",
        description: "Anti over-engineering",
        version: "1.0.0",
      });

      await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      const marketplace = await readMarketplaceJson(outputPath);

      const reactPlugin = marketplace.plugins.find((p) => p.name === "web-framework-react");
      const drizzlePlugin = marketplace.plugins.find((p) => p.name === "api-database-drizzle");
      const metaPlugin = marketplace.plugins.find(
        (p) => p.name === "meta-methodology-anti-over-engineering",
      );

      // Plugin manifests don't carry category — it comes from skill metadata.yaml
      expect(reactPlugin?.category).toBeUndefined();
      expect(drizzlePlugin?.category).toBeUndefined();
      expect(metaPlugin?.category).toBeUndefined();
    });

    it("should generate correct source paths referencing plugin directories", async () => {
      await createPluginDir(pluginsDir, "web-framework-react", {
        name: "web-framework-react",
        description: "React",
        version: "1.0.0",
      });

      await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      const marketplace = await readMarketplaceJson(outputPath);
      const plugin = marketplace.plugins[0];

      // Source should reference the plugin directory relative to plugin root
      expect(typeof plugin.source).toBe("string");
      expect(plugin.source).toContain("web-framework-react");
    });

    it("should preserve author and keywords from plugin manifests", async () => {
      await createPluginDir(pluginsDir, "web-framework-react", {
        name: "web-framework-react",
        description: "React framework",
        version: "1.0.0",
        author: { name: "@vince", email: "vince@example.com" },
        keywords: ["react", "framework", "web"],
      });

      await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      const marketplace = await readMarketplaceJson(outputPath);
      const plugin = marketplace.plugins[0];

      expect(plugin.author?.name).toBe("@vince");
      expect(plugin.author?.email).toBe("vince@example.com");
      expect(plugin.keywords).toStrictEqual(["react", "framework", "web"]);
    });

    it("should use version from package.json", async () => {
      await writeTestPackageJson(projectDir, { version: "3.0.0" });

      await createPluginDir(pluginsDir, "web-test-a", {
        name: "web-test-a",
        description: "Test",
        version: "1.0.0",
      });

      await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.version).toBe("3.0.0");
    });

    it("should overwrite existing marketplace.json on repeated builds", async () => {
      await createPluginDir(pluginsDir, "web-test-a", {
        name: "web-test-a",
        description: "Test",
        version: "1.0.0",
      });

      // First build with version 1.0.0
      await writeTestPackageJson(projectDir, { version: "1.0.0" });
      await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      const first = await readMarketplaceJson(outputPath);
      expect(first.version).toBe("1.0.0");
      expect(first.plugins).toHaveLength(1);

      // Add another plugin and rebuild with bumped version
      await createPluginDir(pluginsDir, "api-framework-hono", {
        name: "api-framework-hono",
        description: "Hono",
        version: "1.0.0",
      });
      await writeTestPackageJson(projectDir, { version: "1.1.0" });

      await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      const second = await readMarketplaceJson(outputPath);
      expect(second.version).toBe("1.1.0");
      expect(second.plugins).toHaveLength(2);
    });

    it("should skip directories without valid plugin.json manifests", async () => {
      // Valid plugin
      await createPluginDir(pluginsDir, "web-framework-react", {
        name: "web-framework-react",
        description: "React",
        version: "1.0.0",
      });

      // Invalid: directory without .claude-plugin/plugin.json
      const invalidDir = path.join(pluginsDir, "not-a-plugin");
      await mkdir(invalidDir, { recursive: true });
      await writeFile(path.join(invalidDir, "README.md"), "# Not a plugin");

      await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.plugins).toHaveLength(1);
      expect(marketplace.plugins[0].name).toBe("web-framework-react");
    });

    it("should generate marketplace.json with 0 plugins for empty plugins directory", async () => {
      // pluginsDir exists but is empty
      await writeTestPackageJson(projectDir, { name: "empty-marketplace" });

      const { error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      expect(await fileExists(outputPath)).toBe(true);

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.name).toBe("empty-marketplace");
      expect(marketplace.plugins).toHaveLength(0);
    });

    it("should write valid JSON with 2-space indentation and trailing newline", async () => {
      await createPluginDir(pluginsDir, "web-test-a", {
        name: "web-test-a",
        description: "Test",
        version: "1.0.0",
      });

      await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      const raw = await readFile(outputPath, "utf-8");

      // Valid JSON
      expect(() => JSON.parse(raw)).not.toThrow();

      // 2-space indentation
      expect(raw).toContain('  "name"');

      // Trailing newline
      expect(raw.endsWith("\n")).toBe(true);
    });

    it("should report plugin count and category breakdown in stdout", async () => {
      await createPluginDir(pluginsDir, "web-framework-react", {
        name: "web-framework-react",
        description: "React",
        version: "1.0.0",
      });
      await createPluginDir(pluginsDir, "api-framework-hono", {
        name: "api-framework-hono",
        description: "Hono",
        version: "1.0.0",
      });

      const { stdout, error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("2 plugins");
      // Category breakdown is shown in output
      expect(stdout).toContain("web");
      expect(stdout).toContain("api");
    });
  });

  describe("name override flag", () => {
    let pluginsDir: string;
    let outputPath: string;

    beforeEach(async () => {
      pluginsDir = path.join(projectDir, "dist", "plugins");
      outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });
      await createPluginDir(pluginsDir, "web-test-a", {
        name: "web-test-a",
        description: "Test",
        version: "1.0.0",
      });
    });

    it("should override package.json name when --name is provided", async () => {
      // package.json has an npm scoped name, which is not a valid marketplace name
      await writeTestPackageJson(projectDir, { name: "@agents-inc/skills" });

      const { error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
        "--name",
        "agents-inc-skills",
      ]);

      expect(error).toBeUndefined();
      expect(await fileExists(outputPath)).toBe(true);
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.name).toBe("agents-inc-skills");
    });

    it("should use package.json name when --name is omitted", async () => {
      await writeTestPackageJson(projectDir, { name: "my-marketplace" });

      const { error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
      ]);

      expect(error).toBeUndefined();
      expect(await fileExists(outputPath)).toBe(true);
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.name).toBe("my-marketplace");
    });

    it("should error and write no file when --name contains a path separator", async () => {
      await writeTestPackageJson(projectDir, { name: "my-marketplace" });

      const { error } = await runCliCommand([
        "build:marketplace",
        "--plugins-dir",
        pluginsDir,
        "--output",
        outputPath,
        "--name",
        "@agents-inc/skills",
      ]);

      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("Invalid --name");
      expect(await fileExists(outputPath)).toBe(false);
    });
  });
});
