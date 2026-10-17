import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { CLI } from "../fixtures/cli.js";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  DIRS,
  E2E_MARKETPLACE_PREFIX,
  EXIT_CODES,
  FILES,
  SOURCE_PATHS,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  createTempDir,
  cleanupFixture,
  cleanupTempDir,
  compactCliOutput,
  createE2ESource,
  fileExists,
  flattenCliOutput,
  listFiles,
  readMarketplaceJson,
  readTreeSnapshot,
  renderConfigTs,
  writeTestPackageJson,
  writeTestPluginManifest,
  type E2ESource,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { E2E_MARKETPLACE_NAME, E2E_SKILL, E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../src/cli/consts.js";
import { entryAt, firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";

const SKILL_PLUGINS_COMPILED_LINE = `Compiled ${E2E_SKILL_IDS.length} skill plugins`;

/**
 * Outside the fixture skills' namespace, so publishing under it trips the namespace validator.
 * Keeps the E2E prefix so the stale-registration sweep still reaches it.
 */
const FOREIGN_MARKETPLACE_NAME = `${E2E_MARKETPLACE_PREFIX}other-marketplace`;

const RESERVED_MARKETPLACE_NAME = DEFAULT_PUBLIC_SOURCE_NAME;

/**
 * The fixture plugin's namespace, so `validateSkillIdNamespace` does not refuse before the refusal
 * under test.
 */
const FIXTURE_MARKETPLACE_NAME = `${E2E_MARKETPLACE_PREFIX}build-marketplace`;
const FIXTURE_PLUGIN_NAME = `${FIXTURE_MARKETPLACE_NAME}-web-framework-react`;

const MARKETPLACE_GENERATED_LINE = "Marketplace generated with 1 plugin!";

/**
 * `marketplaceSchema` refuses an empty `plugins` array, so one plugin is the minimum. Hand-written
 * to avoid compiling a fixture source.
 */
async function writeMarketplacePlugin(projectDir: string): Promise<void> {
  await writeTestPluginManifest(
    path.join(projectDir, SOURCE_PATHS.PLUGINS_DIST, FIXTURE_PLUGIN_NAME),
    {
      name: FIXTURE_PLUGIN_NAME,
      version: "1.0.0",
      description: "A plugin, so the marketplace has one",
    },
  );
}

describe("build commands", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  describe("build plugins", () => {
    // An empty source compiles nothing, leaving --output-dir and --verbose nothing to show.
    let source: E2ESource;

    beforeAll(async () => {
      source = await createE2ESource({ unbuilt: true });
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupFixture(source);
    });

    it("should display help text", async () => {
      tempDir = await createTempDir();

      const { exitCode, stdout } = await CLI.run(["build", "plugins", "--help"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Build skills and agents into standalone plugins");
    });

    it("should complete with zero plugins when no source directory exists", async () => {
      tempDir = await createTempDir();

      const { exitCode, stdout } = await CLI.run(["build", "plugins"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Compiling skill plugins");
      expect(stdout).toContain("Compiled 0 skill plugins");
      expect(stdout).toContain("Plugin compilation complete!");
    });

    it("should error when --skill references a nonexistent path", async () => {
      tempDir = await createTempDir();

      const { exitCode, output } = await CLI.run(
        ["build", "plugins", "--skill", "nonexistent-skill"],
        { dir: tempDir },
      );

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(output).toContain("Compilation failed");
    });

    it("should write every plugin into the directory --output-dir names", async () => {
      const customOutputDir = path.join(source.sourceDir, "custom-plugins");

      const { exitCode, stdout } = await CLI.run(
        ["build", "plugins", "--output-dir", customOutputDir],
        { dir: source.sourceDir },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(customOutputDir);
      expect(stdout).toContain("Plugin compilation complete!");
      expect((await listFiles(customOutputDir)).sort()).toStrictEqual([...E2E_SKILL_IDS].sort());
      expect(await listFiles(path.join(source.sourceDir, SOURCE_PATHS.PLUGINS_DIST))).toStrictEqual(
        [],
      );
    });

    it("should log per-skill compilation lines only under --verbose", async () => {
      const perSkillLinePrefix = `Compiling skill plugin: ${firstElement(E2E_SKILL_IDS)}`;
      // Its own output directory, so the sibling spec's default-directory assertion does not depend
      // on test order.
      const outputDir = path.join(source.sourceDir, "verbose-plugins");

      const quiet = await CLI.run(["build", "plugins", "--output-dir", outputDir], {
        dir: source.sourceDir,
      });
      const loud = await CLI.run(["build", "plugins", "--output-dir", outputDir, "--verbose"], {
        dir: source.sourceDir,
      });

      expect(quiet.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(loud.exitCode).toBe(EXIT_CODES.SUCCESS);
      // Both runs print the header; only the verbose per-skill line differs.
      expect(loud.stdout).toContain(perSkillLinePrefix);
      expect(quiet.stdout).not.toContain(perSkillLinePrefix);
      expect(quiet.stdout).toContain(SKILL_PLUGINS_COMPILED_LINE);
      expect(loud.stdout).toContain(SKILL_PLUGINS_COMPILED_LINE);
    });
  });

  describe("build marketplace", () => {
    it("should display help text", async () => {
      tempDir = await createTempDir();

      const { exitCode, stdout } = await CLI.run(["build", "marketplace", "--help"], {
        dir: tempDir,
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Generate marketplace.json from built plugins");
    });

    it("should error when package.json is missing", async () => {
      tempDir = await createTempDir();

      const { exitCode, output } = await CLI.run(["build", "marketplace"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(output).toContain("Missing package.json");
    });

    it("should refuse to write a marketplace with no plugins, naming the directory it scanned", async () => {
      tempDir = await createTempDir();
      await writeTestPackageJson(tempDir);
      const outputPath = path.join(tempDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR, "marketplace.json");

      const { exitCode, output } = await CLI.run(["build", "marketplace"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      const collapsed = output.replace(/›/g, " ").replace(/\s+/g, " ");
      expect(collapsed).toContain("No plugins found in");
      expect(collapsed).toContain(path.join(tempDir, SOURCE_PATHS.PLUGINS_DIST));
      expect(collapsed).toContain("--plugins-dir");
      expect(
        await fileExists(outputPath),
        "the schema this CLI reads with refuses an empty plugins array, so a file it would reject is not written",
      ).toBe(false);
    });

    it("should write output to a custom path with --output", async () => {
      tempDir = await createTempDir();
      await writeTestPackageJson(tempDir, { name: FIXTURE_MARKETPLACE_NAME });
      await writeMarketplacePlugin(tempDir);
      const customOutput = path.join(tempDir, "custom-marketplace.json");

      const { exitCode, stdout } = await CLI.run(
        ["build", "marketplace", "--output", customOutput],
        { dir: tempDir },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(customOutput);
      expect(stdout).toContain(MARKETPLACE_GENERATED_LINE);
      expect(await fileExists(customOutput)).toBe(true);

      const marketplace = await readMarketplaceJson(customOutput);
      expect(marketplace.plugins.map((plugin) => plugin.name)).toStrictEqual([FIXTURE_PLUGIN_NAME]);
    });

    it("should use marketplace name from package.json", async () => {
      tempDir = await createTempDir();
      await writeTestPackageJson(tempDir, {
        name: FIXTURE_MARKETPLACE_NAME,
        description: "Named marketplace",
      });
      await writeMarketplacePlugin(tempDir);
      const defaultOutputPath = path.join(
        tempDir,
        SOURCE_PATHS.PLUGIN_MANIFEST_DIR,
        "marketplace.json",
      );

      const { exitCode, stdout } = await CLI.run(["build", "marketplace"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(MARKETPLACE_GENERATED_LINE);

      const marketplace = await readMarketplaceJson(defaultOutputPath);
      expect(marketplace.name).toBe(FIXTURE_MARKETPLACE_NAME);
    });

    it("should refuse an email-only author, which yields no owner name", async () => {
      tempDir = await createTempDir();
      await writeTestPackageJson(tempDir, { author: "<solo@example.com>" });
      const outputPath = path.join(tempDir, "marketplace.json");

      const { exitCode, output } = await CLI.run(["build", "marketplace", "--output", outputPath], {
        dir: tempDir,
      });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      const collapsed = output.replace(/›/g, " ").replace(/\s+/g, " ");
      expect(collapsed).toContain("no name could be read from 'author' in");
      expect(await fileExists(outputPath)).toBe(false);
    });

    it("should parse object-form author with name+email+url", async () => {
      tempDir = await createTempDir();
      await writeTestPackageJson(tempDir, {
        name: FIXTURE_MARKETPLACE_NAME,
        author: {
          name: "Jane Doe",
          email: "jane@example.com",
          url: "https://jane.example.com",
        },
      });
      await writeMarketplacePlugin(tempDir);
      const outputPath = path.join(tempDir, "marketplace.json");

      const { exitCode } = await CLI.run(["build", "marketplace", "--output", outputPath], {
        dir: tempDir,
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("Jane Doe");
      expect(marketplace.owner.email).toBe("jane@example.com");
    });

    it("should refuse a reserved marketplace name before scanning anything", async () => {
      tempDir = await createTempDir();
      await writeTestPackageJson(tempDir, { name: RESERVED_MARKETPLACE_NAME });
      const outputPath = path.join(tempDir, "marketplace.json");

      const { exitCode, output } = await CLI.run(["build", "marketplace", "--output", outputPath], {
        dir: tempDir,
      });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      const collapsed = output.replace(/›/g, " ").replace(/\s+/g, " ");
      expect(collapsed).toContain(RESERVED_MARKETPLACE_NAME);
      expect(collapsed).toContain("reserved");
      expect(
        collapsed,
        "the build reads its name off package.json, and --name overrides it",
      ).toContain("Choose a name of your own: set package.json 'name', or pass --name.");
      expect(await fileExists(outputPath)).toBe(false);
    });

    describe("a repository published under a name its skills do not carry", () => {
      let source: E2ESource;
      let outputPath: string;

      beforeAll(async () => {
        source = await createE2ESource({ unbuilt: true });
        outputPath = path.join(source.sourceDir, "marketplace.json");
        const built = await CLI.run(["build", "plugins"], { dir: source.sourceDir });
        expect(built.exitCode, built.output).toBe(EXIT_CODES.SUCCESS);
        await writeTestPackageJson(source.sourceDir, { name: FOREIGN_MARKETPLACE_NAME });
      }, TIMEOUTS.SETUP);

      afterAll(async () => {
        await cleanupFixture(source);
      });

      it("should refuse the build, naming the offending id and the id it expected", async () => {
        const { exitCode, output } = await CLI.run(
          ["build", "marketplace", "--output", outputPath],
          { dir: source.sourceDir },
        );

        expect(exitCode).toBe(EXIT_CODES.ERROR);
        const collapsed = output.replace(/›/g, " ").replace(/\s+/g, " ");
        expect(collapsed).toContain(FOREIGN_MARKETPLACE_NAME);
        expect(collapsed).toContain(E2E_SKILL.react.id);
        expect(collapsed).toContain(`${FOREIGN_MARKETPLACE_NAME}-${E2E_SKILL.react.id}`);
        // A skill's id is the `name` in its SKILL.md, so that is the field to name.
        expect(collapsed, "the refusal must name the field a skill's id is read from").toContain(
          "Rename each skill directory and the 'name' in its SKILL.md",
        );
        expect(await fileExists(outputPath)).toBe(false);
      });

      it("should build the same plugins once published under the name they carry", async () => {
        await writeTestPackageJson(source.sourceDir, { name: E2E_MARKETPLACE_NAME });

        const { exitCode } = await CLI.run(["build", "marketplace", "--output", outputPath], {
          dir: source.sourceDir,
        });

        expect(exitCode).toBe(EXIT_CODES.SUCCESS);
        const marketplace = await readMarketplaceJson(outputPath);
        expect(marketplace.name).toBe(E2E_MARKETPLACE_NAME);
        expect(marketplace.plugins.map((plugin) => plugin.name).sort()).toStrictEqual(
          [...E2E_SKILL_IDS].sort(),
        );
      });
    });

    describe("a marketplace repository whose own config cannot be read", () => {
      // Not `tempDir`, which `afterEach` deletes: the two specs below share one repository's
      // history.
      let marketplaceDir: string;
      let manifestDir: string;
      let sourceRepoConfigPath: string;
      let previousBuild: Record<string, TreeSnapshotEntry>;

      /** A later release, so a write would change bytes. */
      const NEXT_VERSION = "0.2.0";

      beforeAll(async () => {
        marketplaceDir = await createTempDir();
        manifestDir = path.join(marketplaceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR);
        sourceRepoConfigPath = path.join(marketplaceDir, DIRS.SOURCE_ROOT, FILES.CONFIG_TS);
        await writeTestPackageJson(marketplaceDir, { name: FIXTURE_MARKETPLACE_NAME });
        await writeMarketplacePlugin(marketplaceDir);
        const built = await CLI.run(["build", "marketplace"], { dir: marketplaceDir });
        expect(built.exitCode, built.output).toBe(EXIT_CODES.SUCCESS);
        previousBuild = await readTreeSnapshot(manifestDir);

        await writeTestPackageJson(marketplaceDir, {
          name: FIXTURE_MARKETPLACE_NAME,
          version: NEXT_VERSION,
        });
        await mkdir(path.dirname(sourceRepoConfigPath), { recursive: true });
        await writeFile(sourceRepoConfigPath, renderUnparseableConfigTs());
      }, TIMEOUTS.SETUP);

      afterAll(async () => {
        await cleanupTempDir(marketplaceDir);
      });

      it("should refuse the build and leave the previous build's manifest and catalog as they were", async () => {
        const { exitCode, output } = await CLI.run(["build", "marketplace"], {
          dir: marketplaceDir,
        });

        expect(exitCode).toBe(EXIT_CODES.ERROR);
        expect(flattenCliOutput(output)).toContain(STEP_TEXT.CONFIG_LOAD_REASON);
        // Compacted: oclif breaks a long path mid-word.
        expect(
          compactCliOutput(output),
          "the refusal names the marketplace's own config",
        ).toContain(compactCliOutput(sourceRepoConfigPath));
        expect(
          Object.keys(previousBuild).sort(),
          "the previous build must have left both files, or an unchanged tree proves nothing",
        ).toStrictEqual([FILES.CATALOG_JSON, FILES.MARKETPLACE_JSON]);
        expect(
          await readTreeSnapshot(manifestDir),
          "a refused build writes nothing, so the manifest and the catalog still describe one build",
        ).toStrictEqual(previousBuild);
      });

      it("should rebuild the manifest and the catalog once the config can be read", async () => {
        await writeFile(
          sourceRepoConfigPath,
          renderConfigTs({ skillsDir: SOURCE_PATHS.SKILLS_DIR }),
        );

        const { exitCode, output } = await CLI.run(["build", "marketplace"], {
          dir: marketplaceDir,
        });

        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        const marketplace = await readMarketplaceJson(
          path.join(manifestDir, FILES.MARKETPLACE_JSON),
        );
        expect(marketplace.version).toBe(NEXT_VERSION);
        const rebuilt = await readTreeSnapshot(manifestDir);
        expect(
          entryAt(rebuilt, FILES.CATALOG_JSON).modifiedAtMs,
          "the catalog's bytes do not depend on the version, so only its mtime shows the rewrite",
        ).not.toBe(entryAt(previousBuild, FILES.CATALOG_JSON).modifiedAtMs);
      });
    });

    it("should error naming the missing field when package.json lacks 'version'", async () => {
      tempDir = await createTempDir();
      await writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "no-version", description: "Missing version" }),
      );

      const { exitCode, output } = await CLI.run(["build", "marketplace"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      // oclif wraps errors with ` › ` prefixes; collapse before asserting.
      const collapsed = output.replace(/›/g, " ").replace(/\s+/g, " ");
      expect(collapsed).toContain("missing required fields");
      expect(collapsed).toContain("version");
    });
  });
});
