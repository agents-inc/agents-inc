import { describe, it, expect, afterEach } from "vitest";
import { createTempDir, cleanupTempDir } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES } from "../pages/constants.js";

/**
 * Why every help screen is asserted NOT to advertise the old spelling. Pre-1.0 ships no
 * compatibility shims, so `--source` is gone rather than aliased — help that still names it
 * is help that teaches a flag the parser refuses.
 */
const WITHDRAWN_FLAG_REASON = "--source was withdrawn, not aliased, so no help screen names it";

describe("help and version", () => {
  let tempDir: string;

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
    expect(
      result.stdout,
      "doctor absorbed validate's content passes — two commands for one question is the bug",
    ).not.toContain("validate");
    expect(result.stdout).toContain("config");
    expect(result.stdout).toContain("edit");
    expect(result.stdout).toContain("eject");
    expect(result.stdout).toContain("list");
    expect(
      result.stdout,
      "the import family is gone, so no topic may still advertise it",
    ).not.toMatch(/^\s+import\s/m);
    expect(result.stdout, "the new topic is back, carrying marketplace alone").toMatch(
      /^\s+new\s/m,
    );
  });

  it("should display compile-specific help", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["compile", "--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Compile agents");
    expect(result.stdout).toContain("--verbose");
    expect(
      result.stdout,
      "a recompile reads the marketplace its config records, so there is nothing to point it at",
    ).not.toContain("--marketplace");
    expect(result.stdout, WITHDRAWN_FLAG_REASON).not.toContain("--source");
  });

  it("should display init-specific help", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["init", "--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("init");
    expect(result.stdout).toContain("USAGE");
    expect(result.stdout).toContain("--marketplace");
    expect(result.stdout, WITHDRAWN_FLAG_REASON).not.toContain("--source");
  });

  it("should display doctor-specific help", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["doctor", "--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Diagnose");
    expect(result.stdout).not.toContain("--verbose");
    expect(result.stdout).not.toContain("--marketplace");
    expect(result.stdout, WITHDRAWN_FLAG_REASON).not.toContain("--source");
  });

  it("should no longer resolve validate as a command", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["validate"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.UNKNOWN_COMMAND);
    expect(result.output).toContain("is not a");
  });

  it("should no longer resolve import skill as a command", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["import", "skill"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.UNKNOWN_COMMAND);
    expect(result.output, "the third-party import path was withdrawn, not disabled").toContain(
      "import skill is not a",
    );
  });

  it("should resolve no new subcommand but marketplace", async () => {
    tempDir = await createTempDir();

    for (const subcommand of ["skill", "agent"]) {
      const result = await CLI.run(["new", subcommand], { dir: tempDir });

      expect(result.exitCode, `new ${subcommand}`).toBe(EXIT_CODES.UNKNOWN_COMMAND);
      expect(
        result.output,
        `new ${subcommand} was deleted, so it must not resolve at all`,
      ).toContain(`new ${subcommand} is not a`);
    }
  });

  it("should display new marketplace help, which names no marketplace flag", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["new", "marketplace", "--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Scaffold a marketplace");
    expect(result.stdout).toContain("USAGE");
    expect(
      result.stdout,
      "the name is the subject of this command, so it is an argument rather than a flag",
    ).not.toContain("--marketplace");
    expect(result.stdout, WITHDRAWN_FLAG_REASON).not.toContain("--source");
    expect(
      result.stdout,
      "a scaffold that overwrites an author's own files is the destructive half of a silent fallback",
    ).not.toContain("--force");
  });

  // `help <cmd>` is a routing claim, not a content one. Three `it`s previously ran
  // `help compile` / `help init` / `help edit` and re-asserted substrings their
  // `<cmd> --help` siblings already assert — which cannot tell the two entry points
  // apart, because any command printing the same word satisfies both. Identity of
  // the whole output is what "routes to the same place" means.
  it("should route 'help <command>' to the same output as '<command> --help'", async () => {
    tempDir = await createTempDir();

    for (const command of ["compile", "init", "edit"]) {
      const viaFlag = await CLI.run([command, "--help"], { dir: tempDir });
      const viaHelp = await CLI.run(["help", command], { dir: tempDir });

      expect(viaFlag.exitCode, `${command} --help`).toBe(EXIT_CODES.SUCCESS);
      expect(viaHelp.exitCode, `help ${command}`).toBe(EXIT_CODES.SUCCESS);
      expect(viaHelp.stdout, `help ${command} must equal ${command} --help`).toBe(viaFlag.stdout);
    }
  });

  it("should display edit-specific help with --help flag", async () => {
    tempDir = await createTempDir();
    const result = await CLI.run(["edit", "--help"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("Edit skills");
    expect(result.stdout).toContain("USAGE");
    expect(
      result.stdout,
      "naming a marketplace is init's decision, so edit offers the catalogue config.ts names",
    ).not.toContain("--marketplace");
    expect(result.stdout, WITHDRAWN_FLAG_REASON).not.toContain("--source");
    expect(result.stdout, "every load revalidates, so there is nothing to force").not.toContain(
      "--refresh",
    );
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
    expect(result.stdout).toMatch(/agents-inc\/\d+\.\d+\.\d+/);
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
