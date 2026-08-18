import path from "path";
import { writeFile } from "fs/promises";
import { CLI } from "../fixtures/cli.js";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { E2E_MARKETPLACE_PREFIX, EXIT_CODES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";
import {
  createTempDir,
  cleanupFixture,
  cleanupTempDir,
  createE2ESource,
  ensureBinaryExists,
  fileExists,
  listFiles,
  readMarketplaceJson,
  writeTestPackageJson,
  type E2ESource,
} from "../helpers/test-utils.js";
import { E2E_MARKETPLACE_NAME, E2E_SKILL, E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../src/cli/consts.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/** The summary line `build plugins` prints for every skill the E2E source carries. */
const SKILL_PLUGINS_COMPILED_LINE = `Compiled ${E2E_SKILL_IDS.length} skill plugins`;

/**
 * A name the fixture source's skills do NOT belong to. Their ids carry
 * {@link E2E_MARKETPLACE_NAME}, so publishing under this one is exactly the mistake
 * the namespace validator exists to catch. It keeps {@link E2E_MARKETPLACE_PREFIX}
 * so the stale-registration sweep would still reach it if a run ever published it.
 */
const FOREIGN_MARKETPLACE_NAME = `${E2E_MARKETPLACE_PREFIX}other-marketplace`;

/**
 * The public catalogue's implicit namespace — reserved, and no author's to take.
 * Taken from the constant that names the catalogue rather than spelled out, so the
 * two cannot drift apart into a test that reserves a name nothing else uses.
 */
const RESERVED_MARKETPLACE_NAME = DEFAULT_PUBLIC_SOURCE_NAME;

describe("build commands", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  describe("build plugins", () => {
    // A source with skills in it: an empty directory compiles zero plugins, and
    // with nothing compiled neither --output-dir nor --verbose has an observable
    // effect to assert.
    let source: E2ESource;

    beforeAll(async () => {
      source = await createE2ESource();
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
      // Echoing the path proves only that the flag was parsed. The plugins
      // landing there is the behaviour the flag exists for.
      expect((await listFiles(customOutputDir)).sort()).toStrictEqual([...E2E_SKILL_IDS].sort());
      expect(await listFiles(path.join(source.sourceDir, SOURCE_PATHS.PLUGINS_DIST))).toStrictEqual(
        [],
      );
    });

    it("should log per-skill compilation lines only under --verbose", async () => {
      const perSkillLinePrefix = `Compiling skill plugin: ${firstElement(E2E_SKILL_IDS)}`;
      // Its own output directory, so the sibling spec's assertion that the
      // default `dist/plugins` stayed empty does not depend on test order.
      const outputDir = path.join(source.sourceDir, "verbose-plugins");

      const quiet = await CLI.run(["build", "plugins", "--output-dir", outputDir], {
        dir: source.sourceDir,
      });
      const loud = await CLI.run(["build", "plugins", "--output-dir", outputDir, "--verbose"], {
        dir: source.sourceDir,
      });

      expect(quiet.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(loud.exitCode).toBe(EXIT_CODES.SUCCESS);
      // Both runs print the header, so the header cannot tell them apart. The
      // per-skill line is emitted through `verbose()` and is the only difference.
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

    it("should complete with zero plugins when no plugins directory exists", async () => {
      tempDir = await createTempDir();
      await writeTestPackageJson(tempDir);

      const { exitCode, stdout } = await CLI.run(["build", "marketplace"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Generating marketplace.json");
      expect(stdout).toContain("Found 0 plugins");
      expect(stdout).toContain("Marketplace generated with 0 plugins!");
    });

    it("should write output to a custom path with --output", async () => {
      tempDir = await createTempDir();
      await writeTestPackageJson(tempDir);
      const customOutput = path.join(tempDir, "custom-marketplace.json");

      const { exitCode, stdout } = await CLI.run(
        ["build", "marketplace", "--output", customOutput],
        { dir: tempDir },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(customOutput);
      expect(stdout).toContain("Marketplace generated with 0 plugins!");
      expect(await fileExists(customOutput)).toBe(true);

      const marketplace = await readMarketplaceJson(customOutput);
      expect(marketplace).toHaveProperty("plugins");
    });

    it("should use marketplace name from package.json", async () => {
      tempDir = await createTempDir();
      const customName = "my-custom-marketplace";
      await writeTestPackageJson(tempDir, {
        name: customName,
        description: "Named marketplace",
      });
      const defaultOutputPath = path.join(
        tempDir,
        SOURCE_PATHS.PLUGIN_MANIFEST_DIR,
        "marketplace.json",
      );

      const { exitCode, stdout } = await CLI.run(["build", "marketplace"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Marketplace generated with 0 plugins!");

      const marketplace = await readMarketplaceJson(defaultOutputPath);
      expect(marketplace.name).toBe(customName);
    });

    it("should parse email-only string author and emit empty owner.name with email", async () => {
      tempDir = await createTempDir();
      await writeTestPackageJson(tempDir, { author: "<solo@example.com>" });
      const outputPath = path.join(tempDir, "marketplace.json");

      const { exitCode } = await CLI.run(["build", "marketplace", "--output", outputPath], {
        dir: tempDir,
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      const marketplace = await readMarketplaceJson(outputPath);
      expect(marketplace.owner.name).toBe("");
      expect(marketplace.owner.email).toBe("solo@example.com");
    });

    it("should parse object-form author with name+email+url", async () => {
      tempDir = await createTempDir();
      await writeTestPackageJson(tempDir, {
        // Object-form author with URL; the schema accepts strings or objects
        author: {
          name: "Jane Doe",
          email: "jane@example.com",
          url: "https://jane.example.com",
        } as unknown as string,
      });
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
      expect(await fileExists(outputPath)).toBe(false);
    });

    describe("a repository published under a name its skills do not carry", () => {
      let source: E2ESource;
      let outputPath: string;

      beforeAll(async () => {
        source = await createE2ESource();
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

    it("should error naming the missing field when package.json lacks 'version'", async () => {
      tempDir = await createTempDir();
      // Write a package.json missing the required `version` field
      await writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "no-version", description: "Missing version" }),
      );

      const { exitCode, output } = await CLI.run(["build", "marketplace"], { dir: tempDir });

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      // oclif wraps error text across lines and inserts " › " prefix on each wrap;
      // strip wrap markers and collapse whitespace before asserting.
      const collapsed = output.replace(/›/g, " ").replace(/\s+/g, " ");
      expect(collapsed).toContain("missing required fields");
      expect(collapsed).toContain("version");
    });
  });
});
