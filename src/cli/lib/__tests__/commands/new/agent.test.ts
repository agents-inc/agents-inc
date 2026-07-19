import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { runCliCommand } from "../../helpers/cli-runner.js";
import { createTempDir, cleanupTempDir } from "../../test-fs-utils";
import { writeTestTsConfig } from "../../helpers/config-io.js";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { buildSourceConfig, buildAgentConfigs } from "../../factories/config-factories.js";
import { buildAgentPrompt } from "../../../../commands/new/agent";
import { CLAUDE_DIR, CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../../consts";
import { renderConfigTs } from "../../content-generators";
import { EXIT_CODES } from "../../../exit-codes";
import type { AgentName } from "../../../../types";

describe("buildAgentPrompt", () => {
  it("should include agent name in prompt", () => {
    const result = buildAgentPrompt("my-agent", "test purpose", "/output/dir");
    expect(result).toContain('"my-agent"');
  });

  it("should include purpose in prompt", () => {
    const result = buildAgentPrompt("my-agent", "Manages database migrations", "/output/dir");
    expect(result).toContain("Manages database migrations");
  });

  it("should include output directory in prompt", () => {
    const result = buildAgentPrompt("my-agent", "test purpose", "/output/dir");
    expect(result).toContain("/output/dir");
  });

  it("should include custom: true instruction", () => {
    const result = buildAgentPrompt("my-agent", "test purpose", "/output/dir");
    expect(result).toContain("`custom: true`");
    expect(result).toContain(STANDARD_FILES.AGENT_METADATA_YAML);
  });

  it("should include all required instructions", () => {
    const result = buildAgentPrompt("my-agent", "test purpose", "/output/dir");
    expect(result).toContain(STANDARD_FILES.AGENT_METADATA_YAML);
    expect(result).toContain("identity.md");
    expect(result).toContain("playbook.md");
    expect(result).toContain("output.md");
    expect(result).toContain("critical-requirements.md");
  });
});

// D-213: `cc new agent` is gated behind FEATURE_FLAGS.NEW_AGENT_COMMAND (default false).
// These tests exercise the CLI layer via runCliCommand, which loads the compiled
// dist bundle where the flag is inlined -- vi.mock cannot reach it (see
// todo/TODO-refactor.md R-01). Re-enable once D-213 is resolved and the flag
// flips back to true, or once feature-flags supports an env-var override.
describe.skip("new:agent command", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("new-agent-test-home-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  async function expectFlagAccepted(args: string[]): Promise<void> {
    const { error } = await runCliCommand(args);
    const output = error?.message || "";
    expect(output.toLowerCase()).not.toContain("unknown flag");
  }

  describe("argument validation", () => {
    it("should reject missing name argument", async () => {
      const { error } = await runCliCommand(["new:agent"]);

      // oclif should report missing required arg
      expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
    });

    it("should accept name argument without parsing error", async () => {
      // Command will proceed past arg parsing (may fail later at source/fetch)
      const { error } = await runCliCommand(["new:agent", "my-agent", "--purpose", "test"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("missing required arg");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });
  });

  describe("flag acceptance", () => {
    it("should accept --purpose flag without parsing error", async () => {
      await expectFlagAccepted([
        "new:agent",
        "my-agent",
        "--purpose",
        "Manages database migrations",
      ]);
    });

    it("should accept --source flag without parsing error", async () => {
      await expectFlagAccepted(["new:agent", "my-agent", "--source", "/some/path"]);
    });

    it("should accept -p shorthand for purpose flag", async () => {
      await expectFlagAccepted(["new:agent", "my-agent", "-p", "test purpose"]);
    });

    it("should accept -s shorthand for source flag (from base command)", async () => {
      await expectFlagAccepted(["new:agent", "my-agent", "-s", "/some/source"]);
    });
  });

  describe("error handling", () => {
    it("should pass arg and flag parsing with all flags combined", async () => {
      // Providing valid args/flags should not trigger parsing errors.
      // The command may still fail at runtime (e.g., claude CLI not found)
      // but should not fail with "unknown flag" or "missing required arg".
      const { error } = await runCliCommand(["new:agent", "test-agent", "--purpose", "testing"]);

      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unknown flag");
      expect(output.toLowerCase()).not.toContain("missing required arg");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should fail when agent-summoner meta-agent is not available", async () => {
      // In a fresh project without compiled agents, the command fails because
      // the agent-summoner meta-agent cannot be found at the expected locations.
      const { error } = await runCliCommand(["new:agent", "my-agent", "--purpose", "test purpose"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain("agent-summoner");
    });

    it("should fail with agent-summoner error regardless of .claude-src/ existence", async () => {
      // Without config — command fails trying to load meta-agent
      const { error: noConfigError } = await runCliCommand([
        "new:agent",
        "my-agent",
        "--purpose",
        "test",
      ]);

      // With config — should still fail at meta-agent loading
      await writeTestTsConfig(projectDir, buildSourceConfig({ skills: [] }));
      const { error: withConfigError } = await runCliCommand([
        "new:agent",
        "my-agent",
        "--purpose",
        "test",
      ]);

      // Both should fail — the agent-summoner is not present in either case
      expect(noConfigError?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(withConfigError?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("should accept --force flag without parsing error", async () => {
      await expectFlagAccepted(["new:agent", "my-agent", "--force", "--purpose", "test"]);
    });

    it("should accept -f shorthand for force flag", async () => {
      await expectFlagAccepted(["new:agent", "my-agent", "-f", "--purpose", "test"]);
    });
  });
});

/**
 * Creates a minimal installation for list-count tests: empty agents/skills
 * dirs plus a config.ts registering the given agents. Returns the agents dir.
 */
async function setupProjectWithAgents(
  projectDir: string,
  agentNames: AgentName[],
): Promise<string> {
  const claudeDir = path.join(projectDir, CLAUDE_DIR);
  const agentsDir = path.join(claudeDir, "agents");
  await mkdir(agentsDir, { recursive: true });
  await mkdir(path.join(claudeDir, "skills"), { recursive: true });

  const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);
  await mkdir(claudeSrcDir, { recursive: true });
  await writeFile(
    path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS),
    renderConfigTs({
      name: "test-project",
      agents: buildAgentConfigs(agentNames),
    }),
  );
  return agentsDir;
}

describe("agent visibility in list command", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-new-agent-list-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  it("should show no installation when project is empty", async () => {
    const { stdout } = await runCliCommand(["list"]);

    expect(stdout).toContain("No installation found");
  });

  it("should count agent .md files in .claude/agents/ directory", async () => {
    // Set up a minimal installation with agents
    const agentsDir = await setupProjectWithAgents(projectDir, ["web-developer"]);

    // Write agent files (simulating what the new:agent command would produce)
    await writeFile(
      path.join(agentsDir, "web-developer.md"),
      "# Web Developer\n\nBuilds web applications.",
    );

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    expect(stdout).toContain("Agents:  1");
  });

  it("should count multiple agents after additional agent files are created", async () => {
    // Set up installation
    const agentsDir = await setupProjectWithAgents(projectDir, ["web-developer", "api-developer"]);

    // Write two agent files
    await writeFile(
      path.join(agentsDir, "web-developer.md"),
      "# Web Developer\n\nBuilds web applications.",
    );
    await writeFile(path.join(agentsDir, "api-developer.md"), "# API Developer\n\nBuilds APIs.");

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    expect(stdout).toContain("Agents:  2");
  });

  it("should count a custom agent file as an agent in list output", async () => {
    // Set up installation with a custom agent (simulating new:agent output)
    const agentsDir = await setupProjectWithAgents(projectDir, ["web-developer"]);

    // Write existing agent
    await writeFile(
      path.join(agentsDir, "web-developer.md"),
      "# Web Developer\n\nBuilds web applications.",
    );

    // Verify initial count
    const { stdout: before } = await runCliCommand(["list"]);
    expect(before).toContain("Agents:  1");

    // Add a custom agent (simulating what new:agent creates via claude CLI)
    await writeFile(
      path.join(agentsDir, "db-migrator.md"),
      "# DB Migrator\n\nManages database migrations with rollback support.",
    );

    // Verify updated count
    const { stdout: after } = await runCliCommand(["list"]);
    expect(after).toContain("Agents:  2");
  });

  it("should not count non-.md files in agents directory", async () => {
    const agentsDir = await setupProjectWithAgents(projectDir, ["web-developer"]);

    // Write one real agent and one non-.md file
    await writeFile(
      path.join(agentsDir, "web-developer.md"),
      "# Web Developer\n\nBuilds web applications.",
    );
    await writeFile(
      path.join(agentsDir, "metadata.yaml"),
      "id: web-developer\ntitle: Web Developer",
    );

    const { stdout, error } = await runCliCommand(["list"]);

    expect(error).toBeUndefined();
    // Should only count .md files
    expect(stdout).toContain("Agents:  1");
  });
});
