import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createTempDir, cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES } from "../pages/constants.js";

describe("help and version", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should display top-level help with --help flag", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("USAGE");
    expect(result.stdout).toContain("COMMANDS");
    expect(result.stdout).toContain("compile");
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("doctor");
    expect(result.stdout).toContain("validate");
    expect(result.stdout).toContain("config");
    expect(result.stdout).toContain("edit");
    expect(result.stdout).toContain("eject");
    expect(result.stdout).toContain("list");
  });

  it("should display compile-specific help", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["compile", "--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Compile agents");
    expect(result.stdout).toContain("--verbose");
    expect(result.stdout).toContain("--source");
  });

  it("should display init-specific help", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["init", "--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("USAGE");
  });

  it("should display doctor-specific help", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["doctor", "--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Diagnose");
    expect(result.stdout).not.toContain("--verbose");
    expect(result.stdout).not.toContain("--source");
  });

  it("should display validate-specific help", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["validate", "--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Validate");
    expect(result.stdout).not.toContain("--verbose");
    expect(result.stdout).not.toContain("--source");
    expect(result.stdout).not.toContain("--plugins");
    expect(result.stdout).not.toContain("--all");
  });

  it("should display help using 'help <command>' syntax", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["help", "compile"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Compile agents");
  });

  it("should display init help via 'help init' syntax", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["help", "init"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("USAGE");
    expect(result.stdout).toContain("--source");
  });

  it("should display edit help via 'help edit' syntax", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["help", "edit"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Edit skills");
    expect(result.stdout).toContain("USAGE");
    expect(result.stdout).toContain("--source");
  });

  it("should display edit-specific help with --help flag", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["edit", "--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Edit skills");
    expect(result.stdout).toContain("--refresh");
    expect(result.stdout).not.toContain("--agent-source");
  });

  it("should display search help via 'help search' syntax", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["help", "search"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Search the catalog");
    expect(result.stdout).toContain("USAGE");
  });

  it("should show error for help with unknown command", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["help", "nonexistent-command"], { dir: tempDir });

    // oclif shows an error when the command is not found
    expect(result.exitCode).not.toBe(EXIT_CODES.SUCCESS);
    expect(result.output).toContain("not found");
  });

  it("should display version with --version flag", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["--version"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toMatch(/@agents-inc\/cli\/\d+\.\d+\.\d+/);
  });

  it("should show error for unknown command", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["nonexistent-command"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.UNKNOWN_COMMAND);
    expect(result.output).toContain("is not a");
  });

  it("should show error for invalid flag on compile", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["compile", "--invalid-flag"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(result.output).toContain("Nonexistent flag");
  });
});
