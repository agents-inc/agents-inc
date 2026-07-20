import { CLI } from "../fixtures/cli.js";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
import {
  agentsPath,
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  directoryExists,
} from "../helpers/test-utils.js";
// D-213: `cc new agent` is gated behind FEATURE_FLAGS.NEW_AGENT_COMMAND (default false).
// E2E tests spawn the CLI binary as a separate process, so vi.mock cannot override
// the flag. Re-enable once D-213 is resolved and the flag flips back to true, or once
// the feature-flags module supports an env-var override that the E2E harness can set
// (see todo/TODO-refactor.md R-01).
describe.skip("new agent command", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("should display help text", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["new", "agent", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Create a new custom agent");
    expect(stdout).toContain("--purpose");
    expect(stdout).not.toContain("--non-interactive");
    expect(stdout).not.toContain("--refresh");
  });

  it("should error when no agent name is provided", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["new", "agent"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("Missing 1 required arg");
  });

  it("should log agent details when --purpose is provided", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(
      ["new", "agent", "test-agent", "--purpose", "A test agent"],
      { dir: tempDir },
    );

    // The command logs agent name and purpose before attempting to load the meta-agent.
    // In a fresh directory without a compiled agent-summoner, it fails at source resolution.
    expect(output).toContain("Agent name: test-agent");
    expect(output).toContain("Purpose: A test agent");
    expect(exitCode).toBe(EXIT_CODES.ERROR);
  });

  it("should include _custom directory in output path", async () => {
    tempDir = await createTempDir();

    const { output } = await CLI.run(["new", "agent", "my-agent", "--purpose", "My custom agent"], {
      dir: tempDir,
    });

    // The command logs "Output: <path>/.claude/agents/_custom" before trying
    // to load the meta-agent (which fails in a fresh directory).
    expect(output).toContain("Output:");
    expect(output).toContain("_custom");
  });

  it("should show --source flag in help output", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["new", "agent", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("--source");
  });

  it("should include purpose text verbatim in output", async () => {
    tempDir = await createTempDir();
    const purpose = "Manages database migrations with rollback support";

    const { output } = await CLI.run(["new", "agent", "db-migrator", "--purpose", purpose], {
      dir: tempDir,
    });

    // The command echoes the purpose exactly as provided.
    expect(output).toContain(`Purpose: ${purpose}`);
  });

  it("should log the output path as .claude/agents/_custom under the project dir", async () => {
    tempDir = await createTempDir();

    const { output } = await CLI.run(
      ["new", "agent", "path-test-agent", "--purpose", "Verify output path"],
      { dir: tempDir },
    );

    // The output path should be the project dir joined with .claude/agents/_custom
    const expectedSuffix = path.join(DIRS.CLAUDE, "agents", "_custom");
    expect(output).toContain(expectedSuffix);
  });

  it("should attempt to fetch agent-summoner from source", async () => {
    tempDir = await createTempDir();

    const { output } = await CLI.run(["new", "agent", "fetch-test", "--purpose", "Test fetching"], {
      dir: tempDir,
    });

    // The command logs "Fetching agent-summoner from source..." after printing agent details.
    expect(output).toContain("Fetching agent-summoner from source");
  });

  it("should error when agent-summoner is not found in source", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(
      ["new", "agent", "no-summoner", "--purpose", "Test missing summoner"],
      { dir: tempDir },
    );

    // In a fresh temp dir, the default source resolves but agent-summoner.md is
    // not compiled. The command errors with a message about the missing agent.
    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(output).toContain("agent-summoner");
  });

  it("should echo the exact agent name provided as argument", async () => {
    tempDir = await createTempDir();
    const agentName = "my-custom-assistant";

    const { output } = await CLI.run(["new", "agent", agentName, "--purpose", "Test name echo"], {
      dir: tempDir,
    });

    expect(output).toContain(`Agent name: ${agentName}`);
  });

  it("should not create _custom directory when meta-agent loading fails", async () => {
    tempDir = await createTempDir();

    await CLI.run(["new", "agent", "no-dir-agent", "--purpose", "Should not create dir"], {
      dir: tempDir,
    });

    // The _custom directory is only created by the claude CLI invocation, not by
    // the command itself. If meta-agent loading fails, no directory is created.
    const customDir = path.join(agentsPath(tempDir), "_custom", "no-dir-agent");
    expect(await directoryExists(customDir)).toBe(false);
  });

  it("should accept --purpose flag with short alias -p", async () => {
    tempDir = await createTempDir();

    const { output } = await CLI.run(
      ["new", "agent", "purpose-alias", "-p", "Short alias purpose"],
      { dir: tempDir },
    );

    expect(output).toContain("Purpose: Short alias purpose");
  });

  // BUG: The command accepts any string as agent name without validation.
  // Agent names with spaces or uppercase should be rejected since agents
  // are stored as directory names (e.g., .claude/agents/_custom/<name>/).
  // Currently the command passes the name straight through to the prompt.
  it.fails("should reject agent name with spaces", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(
      ["new", "agent", "my agent", "--purpose", "Test invalid name"],
      { dir: tempDir },
    );

    // Agent names are used as directory names, so spaces should be rejected.
    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toMatch(/invalid.*name/i);
  });

  it("should error when agent directory already exists", async () => {
    tempDir = await createTempDir();

    const agentName = "existing-agent";
    const agentDir = path.join(agentsPath(tempDir), "_custom", agentName);
    await mkdir(agentDir, { recursive: true });

    const { exitCode, output } = await CLI.run(
      ["new", "agent", agentName, "--purpose", "Test existing agent"],
      { dir: tempDir },
    );

    // The command should detect the existing agent directory and error out,
    // rather than silently proceeding to overwrite.
    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(output).toMatch(/already exists/i);
  });

  it("should overwrite existing agent with --force flag", async () => {
    tempDir = await createTempDir();

    const agentName = "force-agent";
    const agentDir = path.join(agentsPath(tempDir), "_custom", agentName);
    await mkdir(agentDir, { recursive: true });

    // Write a stub file so we can verify the directory existed before
    await writeFile(path.join(agentDir, FILES.METADATA_YAML), "name: force-agent\n");

    const { exitCode } = await CLI.run(
      ["new", "agent", agentName, "--force", "--purpose", "Overwrite test"],
      { dir: tempDir },
    );

    // With --force, the command should proceed even though the directory exists.
    // This test documents the expected behavior once --force is implemented.
    expect(exitCode).not.toBe(EXIT_CODES.INVALID_ARGS);
  });
});
