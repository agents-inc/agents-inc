import { describe, it, expect } from "vitest";
import { runCliCommand } from "../helpers/cli-runner.js";

describe("help command", () => {
  describe("top-level help", () => {
    it("should show command listing", async () => {
      const { stdout } = await runCliCommand(["help"]);

      // oclif help outputs the list of available commands
      expect(stdout).toContain("COMMANDS");
    });

    it("should list known commands", async () => {
      const { stdout } = await runCliCommand(["help"]);

      expect(stdout).toContain("init");
      expect(stdout).toContain("edit");
      expect(stdout).toContain("compile");
      expect(stdout).toContain("search");
      expect(stdout).toContain("doctor");
      expect(stdout).toContain("list");
    });

    it("should list build topic", async () => {
      const { stdout } = await runCliCommand(["help"]);

      expect(stdout).toContain("build");
    });

    it("should exit with code 0", async () => {
      const { error } = await runCliCommand(["help"]);

      // Help completes without error
      expect(error).toBeUndefined();
    });
  });

  describe("help init", () => {
    it("should show init command help", async () => {
      const { stdout } = await runCliCommand(["help", "init"]);

      expect(stdout.toLowerCase()).toContain("init");
    });

    it("should show init command summary", async () => {
      const { stdout } = await runCliCommand(["help", "init"]);

      // Init command summary contains "Initialize"
      expect(stdout).toContain("Initialize");
    });
  });

  describe("help edit", () => {
    it("should show edit command help", async () => {
      const { stdout } = await runCliCommand(["help", "edit"]);

      expect(stdout.toLowerCase()).toContain("edit");
    });

    it("should show edit command summary", async () => {
      const { stdout } = await runCliCommand(["help", "edit"]);

      // Edit command summary contains "Edit skills"
      expect(stdout).toContain("Edit skills");
    });
  });

  describe("help compile", () => {
    it("should show compile command help", async () => {
      const { stdout } = await runCliCommand(["help", "compile"]);

      expect(stdout.toLowerCase()).toContain("compile");
    });

    it("should show compile command summary", async () => {
      const { stdout } = await runCliCommand(["help", "compile"]);

      // Compile command summary contains "Compile agents"
      expect(stdout).toContain("Compile agents");
    });
  });

  describe("help build", () => {
    it("should show build topic help", async () => {
      const { stdout } = await runCliCommand(["help", "build"]);

      expect(stdout.toLowerCase()).toContain("build");
    });

    it("should list build subcommands", async () => {
      const { stdout } = await runCliCommand(["help", "build"]);

      // build has subcommands: plugins, marketplace
      expect(stdout).toContain("plugins");
      expect(stdout).toContain("marketplace");
    });
  });

  describe("help search", () => {
    it("should show search command help", async () => {
      const { stdout } = await runCliCommand(["help", "search"]);

      expect(stdout.toLowerCase()).toContain("search");
    });

    it("should show search command summary", async () => {
      const { stdout } = await runCliCommand(["help", "search"]);

      expect(stdout).toContain("Search the catalog");
    });
  });

  describe("unknown command", () => {
    it("should error for unknown command", async () => {
      const { error, stderr } = await runCliCommand(["help", "nonexistent-command"]);

      // oclif should error when help is requested for a command that does not exist
      const hasError = error !== undefined;
      const hasStderrMessage =
        stderr.toLowerCase().includes("not found") ||
        stderr.toLowerCase().includes("command") ||
        error?.message?.toLowerCase().includes("not found") ||
        error?.message?.toLowerCase().includes("command");

      expect(hasError || hasStderrMessage).toBe(true);
    });
  });

  describe("--help flag on commands", () => {
    it("should show help when --help flag is used on init", async () => {
      const { stdout } = await runCliCommand(["init", "--help"]);

      expect(stdout).toContain("Initialize");
    });

    it("should show help when --help flag is used on compile", async () => {
      const { stdout } = await runCliCommand(["compile", "--help"]);

      expect(stdout).toContain("Compile agents");
    });

    it("should show help when --help flag is used on doctor", async () => {
      const { stdout } = await runCliCommand(["doctor", "--help"]);

      expect(stdout).toContain("Diagnose");
    });
  });
});
