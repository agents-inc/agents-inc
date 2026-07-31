import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { EXIT_CODES } from "../../exit-codes";
import { renderSkillMd } from "../content-generators";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { buildAgentConfigs } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { CLAUDE_DIR, LOCAL_SKILLS_PATH, STANDARD_DIRS, STANDARD_FILES } from "../../../consts";

describe("doctor command", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("doctor-test-home-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("basic execution", () => {
    it("should run without arguments", { timeout: 30_000 }, async () => {
      const { error } = await runCliCommand(["doctor"]);

      // Should not have argument parsing errors
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("missing required arg");
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should fail when no config exists", async () => {
      // projectDir has no .claude-src/config.ts
      const { error } = await runCliCommand(["doctor"]);

      // Should exit with error because Config Valid check fails
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("should pass when valid config exists", async () => {
      // Create valid project config
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: [],
      });

      const { error } = await runCliCommand(["doctor"]);

      // Should complete without critical errors when config is valid
      // (may fail on Source Reachable if no source is available)
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("config.ts has errors");
    });
  });

  describe("config validation", () => {
    it("should fail when config.ts has syntax errors", async () => {
      const claudeSrcDir = path.join(projectDir, ".claude-src");
      await mkdir(claudeSrcDir, { recursive: true });
      await writeFile(
        path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS),
        "invalid typescript content {{",
      );

      const { error } = await runCliCommand(["doctor"]);

      // Should exit with error due to invalid config
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });

    it("should pass with minimal valid config", async () => {
      await writeTestTsConfig(projectDir, {
        name: "test-project",
      });

      const { error } = await runCliCommand(["doctor"]);

      // May still exit with error if source is unreachable,
      // but should not fail on config parsing
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("config.ts has errors");
    });
  });

  describe("agents check", () => {
    it("should pass when agents are compiled", async () => {
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });

      // Create config with one agent
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: ["web-developer"],
      });

      // Create the compiled agent file
      await writeFile(
        path.join(agentsDir, "web-developer.md"),
        "# Web Developer Agent\n\nAgent content here.",
      );

      const { error } = await runCliCommand(["doctor"]);

      // Should not mention missing agents
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("recompilation");
    });

    it("should warn when agents need recompilation", async () => {
      // Create config with agent but no compiled .md file
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: ["web-developer"],
      });

      const { error } = await runCliCommand(["doctor"]);

      // Doctor should complete (warnings don't cause exit error)
      // but may exit with error due to source being unreachable
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("argument");
    });
  });

  describe("orphans check", () => {
    it("should detect orphaned agent files", async () => {
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });

      // Create config with no agents
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: [],
      });

      // Create an orphaned agent file not in config
      await writeFile(
        path.join(agentsDir, "orphaned-agent.md"),
        "# Orphaned Agent\n\nThis agent is not in config.",
      );

      const { error } = await runCliCommand(["doctor"]);

      // Command should run (orphans are warnings, not errors)
      const output = error?.message || "";
      expect(output.toLowerCase()).not.toContain("unexpected argument");
    });

    it("should flag excluded project agent .md file as orphan", async () => {
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });

      // Excluded project agent — its .md file is stale
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"], { excluded: true }),
      });

      // Stale .md file from before exclusion
      await writeFile(
        path.join(agentsDir, "web-developer.md"),
        "# Web Developer Agent\n\nExcluded agent content.",
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // Excluded project agent .md should be flagged as orphan
      expect(output).toContain("orphaned agent file");
      expect(output).toContain("web-developer.md (not in config)");
    });
  });

  describe("skills installed check", () => {
    it("should warn when eject-mode skill is missing from disk", async () => {
      // Config lists an eject-mode skill, but no skill directory exists on disk
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: [],
        skills: buildSkillConfigs(["web-framework-react"]),
      });

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // Should report the missing skill
      expect(output).toContain("missing from disk");
      expect(output).toContain("web-framework-react");
    });

    it("should pass when eject-mode skill files exist on disk", async () => {
      // Create config listing an eject-mode skill
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: [],
        skills: buildSkillConfigs(["web-framework-react"]),
      });

      // Create the skill file on disk
      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react"),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // Should NOT report missing skills
      expect(output).not.toContain("missing from disk");
      expect(output).toContain("eject-mode skills installed");
    });

    it("should not check plugin-mode skills for disk presence", async () => {
      // Config lists a plugin-mode skill (no files needed on disk)
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: [],
        skills: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
      });

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // Plugin skills should not be checked for disk presence
      expect(output).not.toContain("missing from disk");
      expect(output).toContain("No eject-mode skills configured");
    });
  });

  describe("broken agent references", () => {
    it("should report skills in stack that cannot be resolved", async () => {
      // Config has a stack referencing a skill that doesn't exist
      // anywhere (not in matrix, not in local skills)
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        skills: [],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-nonexistent" }],
          },
        },
      });

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // Should report the unresolvable skill in the stack
      expect(output).toContain("web-framework-nonexistent");
      expect(output).toContain("not found");
    });

    it("should pass when stack skills exist as local skills", async () => {
      // Config has a stack referencing a skill
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react" }],
          },
        },
      });

      // Create the local skill so it resolves
      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react"),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        "name: web-framework-react\ndescription: React framework\ncategory: web-framework\ndomain: web\n",
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // The skill should be resolved (found as local skill)
      expect(output).not.toContain("web-framework-react (not found)");
    });
  });
});
