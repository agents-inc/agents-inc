import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { parseRefusal, runCliCommand } from "../../helpers/cli-runner.js";
import { readTestJson, writeTestPackageJson } from "../../helpers/config-io.js";
import { writeTestPluginManifest } from "../../helpers/disk-writers.js";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { fileExists } from "../../test-fs-utils";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE, PLUGINS_DIST_PATH } from "../../../../consts";
import { EXIT_CODES } from "../../../exit-codes";
import { VALID_PACKAGE_JSON_FILE } from "../../mock-data/mock-source-files.js";
import type { Marketplace, PluginManifest } from "../../../../types";
import { firstElement } from "../../helpers/element-at.js";

/** The marketplace name every build here publishes under unless it overrides it. */
const MARKETPLACE_NAME = VALID_PACKAGE_JSON_FILE.name;

/** The valid fixture's identity fields, minus the `author` the refusal cases vary. */
const { author: _fixtureAuthor, ...PACKAGE_IDENTITY_WITHOUT_AUTHOR } = VALID_PACKAGE_JSON_FILE;

/**
 * The names no marketplace may publish under. Spelled out rather than imported:
 * the rule is these three strings, and a test that read the module's own list
 * would agree with any list it grew.
 */
const RESERVED_MARKETPLACE_NAMES = ["agents-inc", "external", "local"] as const;

/** The npm package the public catalogue publishes from — the sole holder of its name. */
const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

/** The marketplace name that package publishes under, and no other may. */
const PUBLIC_CATALOGUE_NAME = "agents-inc";

/**
 * Composes a skill id in a marketplace's own namespace.
 *
 * A marketplace's skill ids carry its name as their prefix, so a fixture plugin's
 * name and the name its build publishes under are one string — spelling either
 * alone produces a build the namespace validator refuses.
 */
function namespacedId(marketplaceName: string, bare: string): string {
  return `${marketplaceName}-${bare}`;
}

/** {@link namespacedId} in the default {@link MARKETPLACE_NAME} namespace. */
function skillId(bare: string): string {
  return namespacedId(MARKETPLACE_NAME, bare);
}

/**
 * Creates a plugin directory with a valid plugin.json manifest. The manifest
 * name mirrors the directory name and version defaults to "1.0.0".
 */
async function createPluginDir(
  pluginsDir: string,
  name: string,
  description: string,
  overrides?: Partial<PluginManifest>,
): Promise<string> {
  const pluginDir = path.join(pluginsDir, name);
  const manifest: PluginManifest = { name, description, version: "1.0.0", ...overrides };
  await writeTestPluginManifest(pluginDir, manifest);
  return pluginDir;
}

/** Reads and parses the generated marketplace.json */
async function readMarketplaceJson(outputPath: string): Promise<Marketplace> {
  return readTestJson<Marketplace>(outputPath);
}

/** Runs `build:marketplace` against the given plugins dir and output path. */
function runBuildMarketplace(pluginsDir: string, outputPath: string, ...extraArgs: string[]) {
  return runCliCommand([
    "build:marketplace",
    "--plugins-dir",
    pluginsDir,
    "--output",
    outputPath,
    ...extraArgs,
  ]);
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
    let pluginsDir: string;
    let outputPath: string;

    beforeEach(async () => {
      pluginsDir = path.join(projectDir, "dist", "plugins");
      outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });
      // One plugin, because a build with none is refused before an owner is ever written and
      // every case below is about the owner the manifest carries.
      await createPluginDir(pluginsDir, skillId("web-framework-react"), "React framework");
    });

    it('should parse string-form author "Name <email>"', async () => {
      await writeTestPackageJson(projectDir, {
        author: "Jane Doe <jane@example.com>",
      });

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error).toBeUndefined();
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("Jane Doe");
      expect(marketplace.owner.email).toBe("jane@example.com");
    });

    it("should parse object-form author { name, email }", async () => {
      await writeTestPackageJson(projectDir, {
        // Object-form author; the schema accepts strings or objects
        author: { name: "Jane Doe", email: "jane@example.com" },
      });

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error).toBeUndefined();
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("Jane Doe");
      expect(marketplace.owner.email).toBe("jane@example.com");
    });

    /**
     * Three spellings of an `author` that yields no owner name. They were three specs
     * asserting three different warnings over a manifest the command wrote anyway; the
     * command now refuses all three identically, so they are one condition with one
     * outcome and one case table.
     *
     * Written as whole package.json objects rather than as overrides because the first
     * case is the ABSENCE of the key, which an overrides object cannot spell under
     * `exactOptionalPropertyTypes`.
     */
    it.each([
      ["absent", PACKAGE_IDENTITY_WITHOUT_AUTHOR],
      [
        "an email with no name in front of it",
        { ...PACKAGE_IDENTITY_WITHOUT_AUTHOR, author: "<solo@example.com>" },
      ],
      ["empty", { ...PACKAGE_IDENTITY_WITHOUT_AUTHOR, author: "" }],
    ])("refuses to write a marketplace whose author is %s", async (_spelling, packageJson) => {
      await writeFile(path.join(projectDir, "package.json"), JSON.stringify(packageJson));

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain("no name could be read from 'author' in");
      expect(
        await fileExists(outputPath),
        "a refused build must leave no marketplace.json behind",
      ).toBe(false);
    });

    /**
     * The fourth field `marketplaceSchema` constrains, and the one that was not guarded.
     *
     * `packageJsonSchema` types `version` as a bare `z.string()`, and `generateMarketplace`
     * defaults it with `??`, which `""` is not — so an empty version passed straight through into
     * a manifest whose own reader requires `min(1)`. Written and then refused on read, which is
     * the shape the zero-plugin refusal closed for `plugins`.
     */
    it("refuses to write a marketplace whose version is empty", async () => {
      await writeTestPackageJson(projectDir, { version: "" });

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain("must have a version");
      expect(
        await fileExists(outputPath),
        "a manifest this CLI refuses to read back is one it must not write",
      ).toBe(false);
    });

    it('should parse plain-name string author "Name" with no email', async () => {
      await writeTestPackageJson(projectDir, {
        author: "Solo Name",
      });

      const { error, stderr } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error).toBeUndefined();
      // Warns because no email is parseable
      expect(stderr).toContain("no parseable email");
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("Solo Name");
      expect(marketplace.owner.email).toBeUndefined();
    });

    it('should parse string-form author with trailing URL "Name <email> (url)"', async () => {
      await writeTestPackageJson(projectDir, {
        author: "Jane Doe <jane@example.com> (https://jane.example.com)",
      });

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

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
        },
      });

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error).toBeUndefined();
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("Jane Doe");
      expect(marketplace.owner.email).toBe("jane@example.com");
    });
  });

  describe("basic execution", () => {
    it("should refuse a build with no plugins directory at all, naming the path it scanned", async () => {
      await writeTestPackageJson(projectDir);
      const defaultPluginsDir = path.join(projectDir, PLUGINS_DIST_PATH);

      const { error } = await runCliCommand(["build:marketplace"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(`No plugins found in ${defaultPluginsDir}`);
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
      expect(output).not.toContain(parseRefusal("--plugins-dir"));
    });

    it("should accept -p shorthand for plugins-dir", async () => {
      const pluginsPath = path.join(tempDir, "custom-plugins");

      const { error } = await runCliCommand(["build:marketplace", "-p", pluginsPath]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("-p"));
    });

    it("should accept --output flag with path", async () => {
      const outputPath = path.join(tempDir, "marketplace.json");

      const { error } = await runCliCommand(["build:marketplace", "--output", outputPath]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--output"));
    });

    it("should accept -o shorthand for output", async () => {
      const outputPath = path.join(tempDir, "marketplace.json");

      const { error } = await runCliCommand(["build:marketplace", "-o", outputPath]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("-o"));
    });

    it("should accept --verbose flag", async () => {
      const { error } = await runCliCommand(["build:marketplace", "--verbose"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--verbose"));
    });

    it("should accept -v shorthand for verbose", async () => {
      const { error } = await runCliCommand(["build:marketplace", "-v"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("-v"));
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      await writeTestPackageJson(projectDir);
    });

    /**
     * The two ways to reach a marketplace with nothing in it: a `--plugins-dir` that names no
     * directory, and one that names an empty directory. Both are the same mistake to make — the
     * flag points somewhere the plugins are not — and the refusal names the flag either way, since
     * neither a missing nor an empty directory is distinguishable from having built nothing yet.
     */
    it.each([
      ["names no directory at all", "/definitely/not/real/path/xyz"],
      ["names an empty directory", undefined],
    ])("should refuse when --plugins-dir %s", async (_spelling, absentDir) => {
      const pluginsPath = absentDir ?? path.join(projectDir, "empty-plugins");
      if (absentDir === undefined) await mkdir(pluginsPath, { recursive: true });

      const { error } = await runCliCommand(["build:marketplace", "--plugins-dir", pluginsPath]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(`No plugins found in ${pluginsPath}`);
      expect(error?.message).toContain("--plugins-dir");
    });

    it("should skip plugins with invalid plugin.json and not crash", async () => {
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      // Valid plugin
      await createPluginDir(pluginsDir, skillId("web-framework-react"), "React framework");

      // Invalid plugin: plugin.json exists but contains invalid JSON
      const invalidPluginDir = path.join(pluginsDir, "broken-plugin");
      const invalidManifestDir = path.join(invalidPluginDir, PLUGIN_MANIFEST_DIR);
      await mkdir(invalidManifestDir, { recursive: true });
      await writeFile(
        path.join(invalidManifestDir, PLUGIN_MANIFEST_FILE),
        "{ this is not valid json }",
      );

      const { stdout, error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 plugins");

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.plugins).toHaveLength(1);
      expect(firstElement(marketplace.plugins).name).toBe(skillId("web-framework-react"));
    });

    it("should skip plugins with missing required name field in plugin.json", async () => {
      const pluginsDir = path.join(projectDir, "dist", "plugins");
      const outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });

      // Valid plugin
      await createPluginDir(pluginsDir, skillId("api-framework-hono"), "Hono framework");

      // Invalid plugin: valid JSON but missing required 'name' field
      const invalidPluginDir = path.join(pluginsDir, "nameless-plugin");
      const invalidManifestDir = path.join(invalidPluginDir, PLUGIN_MANIFEST_DIR);
      await mkdir(invalidManifestDir, { recursive: true });
      await writeFile(
        path.join(invalidManifestDir, PLUGIN_MANIFEST_FILE),
        JSON.stringify({ description: "No name field", version: "1.0.0" }),
      );

      const { stdout, error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 plugins");

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.plugins).toHaveLength(1);
      expect(firstElement(marketplace.plugins).name).toBe(skillId("api-framework-hono"));
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
      await createPluginDir(pluginsDir, skillId("web-framework-react"), "React framework skills");

      const { stdout, error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 plugins");
      expect(await fileExists(outputPath)).toBe(true);

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.plugins).toHaveLength(1);
      expect(firstElement(marketplace.plugins).name).toBe(skillId("web-framework-react"));
      expect(firstElement(marketplace.plugins).description).toBe("React framework skills");
      expect(firstElement(marketplace.plugins).version).toBe("1.0.0");
    });

    it("should include marketplace identity from package.json in output", async () => {
      // Rewrite package.json with single-word values to match assertions
      const customName = "my-marketplace";
      await writeTestPackageJson(projectDir, {
        name: customName,
        version: "2.5.0",
        description: "test-marketplace-description",
        author: "TestOwner <owner@test.com>",
      });

      await createPluginDir(pluginsDir, namespacedId(customName, "web-test-a"), "Test plugin", {
        version: "0.1.0",
      });

      await runBuildMarketplace(pluginsDir, outputPath);

      const marketplace = await readMarketplaceJson(outputPath);

      expect(marketplace.name).toBe(customName);
      expect(marketplace.version).toBe("2.5.0");
      expect(marketplace.description).toBe("test-marketplace-description");
      expect(marketplace.owner.name).toBe("TestOwner");
      expect(marketplace.owner.email).toBe("owner@test.com");
      expect(marketplace.$schema).toBe("https://anthropic.com/claude-code/marketplace.schema.json");
    });

    it("should include all 5 plugins from a populated plugins directory", async () => {
      const plugins = [
        { name: skillId("web-framework-react"), description: "React framework" },
        { name: skillId("web-state-zustand"), description: "Zustand state management" },
        { name: skillId("web-styling-scss-modules"), description: "SCSS Modules styling" },
        { name: skillId("api-framework-hono"), description: "Hono API framework" },
        { name: skillId("api-database-drizzle"), description: "Drizzle ORM" },
      ];

      for (const plugin of plugins) {
        await createPluginDir(pluginsDir, plugin.name, plugin.description);
      }

      const { stdout, error } = await runBuildMarketplace(pluginsDir, outputPath);

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
      await createPluginDir(pluginsDir, skillId("web-state-zustand"), "Zustand");
      await createPluginDir(pluginsDir, skillId("api-framework-hono"), "Hono");
      await createPluginDir(pluginsDir, skillId("web-framework-react"), "React");

      await runBuildMarketplace(pluginsDir, outputPath);

      const marketplace = await readMarketplaceJson(outputPath);
      const names = marketplace.plugins.map((p) => p.name);

      expect(names).toStrictEqual([
        skillId("api-framework-hono"),
        skillId("web-framework-react"),
        skillId("web-state-zustand"),
      ]);
    });

    it("should preserve explicit categories from plugin manifests", async () => {
      await createPluginDir(pluginsDir, skillId("web-framework-react"), "React");
      await createPluginDir(pluginsDir, skillId("api-database-drizzle"), "Drizzle");
      await createPluginDir(
        pluginsDir,
        skillId("meta-methodology-anti-over-engineering"),
        "Anti over-engineering",
      );

      await runBuildMarketplace(pluginsDir, outputPath);

      const marketplace = await readMarketplaceJson(outputPath);

      const reactPlugin = marketplace.plugins.find(
        (p) => p.name === skillId("web-framework-react"),
      );
      const drizzlePlugin = marketplace.plugins.find(
        (p) => p.name === skillId("api-database-drizzle"),
      );
      const metaPlugin = marketplace.plugins.find(
        (p) => p.name === skillId("meta-methodology-anti-over-engineering"),
      );

      // Plugin manifests don't carry category — it comes from skill metadata.yaml
      expect(reactPlugin?.category).toBeUndefined();
      expect(drizzlePlugin?.category).toBeUndefined();
      expect(metaPlugin?.category).toBeUndefined();
    });

    it("should generate correct source paths referencing plugin directories", async () => {
      await createPluginDir(pluginsDir, skillId("web-framework-react"), "React");

      await runBuildMarketplace(pluginsDir, outputPath);

      const marketplace = await readMarketplaceJson(outputPath);
      const plugin = firstElement(marketplace.plugins);

      // Source should reference the plugin directory relative to plugin root
      expect(typeof plugin.source).toBe("string");
      expect(plugin.source).toContain(skillId("web-framework-react"));
    });

    it("should preserve author and keywords from plugin manifests", async () => {
      await createPluginDir(pluginsDir, skillId("web-framework-react"), "React framework", {
        author: { name: "@vince", email: "vince@example.com" },
        keywords: ["react", "framework", "web"],
      });

      await runBuildMarketplace(pluginsDir, outputPath);

      const marketplace = await readMarketplaceJson(outputPath);
      const plugin = firstElement(marketplace.plugins);

      expect(plugin.author?.name).toBe("@vince");
      expect(plugin.author?.email).toBe("vince@example.com");
      expect(plugin.keywords).toStrictEqual(["react", "framework", "web"]);
    });

    it("should use version from package.json", async () => {
      await writeTestPackageJson(projectDir, { version: "3.0.0" });

      await createPluginDir(pluginsDir, skillId("web-test-a"), "Test");

      await runBuildMarketplace(pluginsDir, outputPath);

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.version).toBe("3.0.0");
    });

    it("should overwrite existing marketplace.json on repeated builds", async () => {
      await createPluginDir(pluginsDir, skillId("web-test-a"), "Test");

      // First build with version 1.0.0
      await writeTestPackageJson(projectDir, { version: "1.0.0" });
      await runBuildMarketplace(pluginsDir, outputPath);

      const first = await readMarketplaceJson(outputPath);
      expect(first.version).toBe("1.0.0");
      expect(first.plugins).toHaveLength(1);

      // Add another plugin and rebuild with bumped version
      await createPluginDir(pluginsDir, skillId("api-framework-hono"), "Hono");
      await writeTestPackageJson(projectDir, { version: "1.1.0" });

      await runBuildMarketplace(pluginsDir, outputPath);

      const second = await readMarketplaceJson(outputPath);
      expect(second.version).toBe("1.1.0");
      expect(second.plugins).toHaveLength(2);
    });

    it("should skip directories without valid plugin.json manifests", async () => {
      // Valid plugin
      await createPluginDir(pluginsDir, skillId("web-framework-react"), "React");

      // Invalid: directory without .claude-plugin/plugin.json
      const invalidDir = path.join(pluginsDir, "not-a-plugin");
      await mkdir(invalidDir, { recursive: true });
      await writeFile(path.join(invalidDir, "README.md"), "# Not a plugin");

      await runBuildMarketplace(pluginsDir, outputPath);

      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.plugins).toHaveLength(1);
      expect(firstElement(marketplace.plugins).name).toBe(skillId("web-framework-react"));
    });

    it("should write nothing at all when the plugins directory is empty", async () => {
      // pluginsDir exists but is empty
      await writeTestPackageJson(projectDir, { name: "empty-marketplace" });

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(
        await fileExists(outputPath),
        "`marketplaceSchema.plugins` is `.min(1)`, so a manifest with none is one this CLI refuses to read back",
      ).toBe(false);
    });

    it("should write valid JSON with 2-space indentation and trailing newline", async () => {
      await createPluginDir(pluginsDir, skillId("web-test-a"), "Test");

      await runBuildMarketplace(pluginsDir, outputPath);

      const raw = await readFile(outputPath, "utf-8");

      // Valid JSON
      expect(() => JSON.parse(raw)).not.toThrow();

      // 2-space indentation
      expect(raw).toContain('  "name"');

      // Trailing newline
      expect(raw.endsWith("\n")).toBe(true);
    });

    it("should report plugin count and category breakdown in stdout", async () => {
      await createPluginDir(pluginsDir, skillId("web-framework-react"), "React");
      await createPluginDir(pluginsDir, skillId("api-framework-hono"), "Hono");

      const { stdout, error } = await runBuildMarketplace(pluginsDir, outputPath);

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
    });

    it("should override package.json name when --name is provided", async () => {
      // package.json has an npm scoped name, which is not a valid marketplace name
      const overrideName = "agents-inc-skills";
      await writeTestPackageJson(projectDir, { name: "@agents-inc/skills" });
      await createPluginDir(pluginsDir, namespacedId(overrideName, "web-test-a"), "Test");

      const { error } = await runBuildMarketplace(pluginsDir, outputPath, "--name", overrideName);

      expect(error).toBeUndefined();
      expect(await fileExists(outputPath)).toBe(true);
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.name).toBe(overrideName);
    });

    it("should use package.json name when --name is omitted", async () => {
      const packageName = "my-marketplace";
      await writeTestPackageJson(projectDir, { name: packageName });
      await createPluginDir(pluginsDir, namespacedId(packageName, "web-test-a"), "Test");

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error).toBeUndefined();
      expect(await fileExists(outputPath)).toBe(true);
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.name).toBe(packageName);
    });

    it("should error and write no file when --name contains a path separator", async () => {
      await writeTestPackageJson(projectDir, { name: "my-marketplace" });

      const { error } = await runBuildMarketplace(
        pluginsDir,
        outputPath,
        "--name",
        "@agents-inc/skills",
      );

      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("Invalid --name");
      expect(await fileExists(outputPath)).toBe(false);
    });
  });

  describe("skill id namespace", () => {
    let pluginsDir: string;
    let outputPath: string;

    beforeEach(async () => {
      pluginsDir = path.join(projectDir, "dist", "plugins");
      outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });
    });

    it("should refuse a skill id that does not carry the marketplace name", async () => {
      await writeTestPackageJson(projectDir);
      await createPluginDir(pluginsDir, "web-framework-react", "React framework");

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("web-framework-react");
      expect(error!.message).toContain(MARKETPLACE_NAME);
    });

    it("should name the id the refused skill should have carried", async () => {
      await writeTestPackageJson(projectDir);
      await createPluginDir(pluginsDir, "web-framework-react", "React framework");

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error!.message).toContain(skillId("web-framework-react"));
    });

    it("should write no marketplace.json when a skill id is refused", async () => {
      await writeTestPackageJson(projectDir);
      await createPluginDir(pluginsDir, "web-framework-react", "React framework");

      await runBuildMarketplace(pluginsDir, outputPath);

      expect(await fileExists(outputPath)).toBe(false);
    });

    it("should refuse every id outside the namespace in one run", async () => {
      await writeTestPackageJson(projectDir);
      await createPluginDir(pluginsDir, "web-framework-react", "React framework");
      await createPluginDir(pluginsDir, "api-framework-hono", "Hono framework");

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error!.message).toContain(skillId("web-framework-react"));
      expect(error!.message).toContain(skillId("api-framework-hono"));
    });

    it("should build when every skill id carries the marketplace name", async () => {
      await writeTestPackageJson(projectDir);
      await createPluginDir(pluginsDir, skillId("web-framework-react"), "React framework");
      await createPluginDir(pluginsDir, skillId("api-framework-hono"), "Hono framework");

      const { error } = await runBuildMarketplace(pluginsDir, outputPath);

      expect(error).toBeUndefined();
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.plugins.map((p) => p.name)).toStrictEqual([
        skillId("api-framework-hono"),
        skillId("web-framework-react"),
      ]);
    });

    it("should build the public catalogue's unprefixed ids under its own package", async () => {
      await writeTestPackageJson(projectDir, { name: PUBLIC_CATALOGUE_PACKAGE });
      await createPluginDir(pluginsDir, "web-framework-react", "React framework");

      const { error } = await runBuildMarketplace(
        pluginsDir,
        outputPath,
        "--name",
        PUBLIC_CATALOGUE_NAME,
      );

      expect(error).toBeUndefined();
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.name).toBe(PUBLIC_CATALOGUE_NAME);
      expect(firstElement(marketplace.plugins).name).toBe("web-framework-react");
    });
  });

  describe("reserved marketplace names", () => {
    let pluginsDir: string;
    let outputPath: string;

    beforeEach(async () => {
      pluginsDir = path.join(projectDir, "dist", "plugins");
      outputPath = path.join(projectDir, "marketplace.json");
      await mkdir(pluginsDir, { recursive: true });
    });

    it.each(RESERVED_MARKETPLACE_NAMES)(
      "should refuse '%s' as a name in package.json",
      async (reservedName) => {
        await writeTestPackageJson(projectDir, { name: reservedName });

        const { error } = await runBuildMarketplace(pluginsDir, outputPath);

        expect(error).toBeInstanceOf(Error);
        expect(error!.message).toContain(reservedName);
        expect(error!.message).toContain("reserved");
        expect(await fileExists(outputPath)).toBe(false);
      },
    );

    it.each(RESERVED_MARKETPLACE_NAMES)(
      "should refuse '%s' passed through --name",
      async (reservedName) => {
        await writeTestPackageJson(projectDir);

        const { error } = await runBuildMarketplace(pluginsDir, outputPath, "--name", reservedName);

        expect(error).toBeInstanceOf(Error);
        expect(error!.message).toContain(reservedName);
        expect(await fileExists(outputPath)).toBe(false);
      },
    );

    it("should refuse the public catalogue's name to a package that is not it", async () => {
      await writeTestPackageJson(projectDir, { name: "@acme/skills" });

      const { error } = await runBuildMarketplace(
        pluginsDir,
        outputPath,
        "--name",
        PUBLIC_CATALOGUE_NAME,
      );

      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("reserved");
      expect(await fileExists(outputPath)).toBe(false);
    });

    it("should still refuse 'external' to the public catalogue's own package", async () => {
      await writeTestPackageJson(projectDir, { name: PUBLIC_CATALOGUE_PACKAGE });

      const { error } = await runBuildMarketplace(pluginsDir, outputPath, "--name", "external");

      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toContain("reserved");
      expect(await fileExists(outputPath)).toBe(false);
    });
  });
});
