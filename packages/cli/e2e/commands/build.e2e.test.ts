import path from "path";
import { writeFile } from "fs/promises";
import { CLI } from "../fixtures/cli.js";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { EXIT_CODES, SOURCE_PATHS } from "../pages/constants.js";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  readMarketplaceJson,
  writeTestPackageJson,
} from "../helpers/test-utils.js";

describe("build commands", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  describe("build plugins", () => {
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

    it("should use a custom output directory with --output-dir", async () => {
      tempDir = await createTempDir();
      const customOutputDir = path.join(tempDir, "custom-plugins");

      const { exitCode, stdout } = await CLI.run(
        ["build", "plugins", "--output-dir", customOutputDir],
        { dir: tempDir },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(customOutputDir);
      expect(stdout).toContain("Plugin compilation complete!");
    });

    it("should accept --verbose flag", async () => {
      tempDir = await createTempDir();

      const { exitCode, stdout } = await CLI.run(["build", "plugins", "--verbose"], {
        dir: tempDir,
      });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("Compiling skill plugins");
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
