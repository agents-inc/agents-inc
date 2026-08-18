import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { EXIT_CODES } from "../../exit-codes";
import { renderAgentMd, renderMetadataYaml, renderSkillMd } from "../content-generators";
import { cliVersion, stampProvenanceMarker } from "../../agents/agent-provenance.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { buildAgentConfigs } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  LOCAL_SKILLS_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../../consts";

/** The installed pair a deleted configuration strands: one skill directory, one compiled agent. */
const ORPHANED_SKILL_ID = "web-framework-react";
const ORPHANED_AGENT_NAME = "web-developer";

/** A config file the loader cannot evaluate — present on disk, and describing nothing. */
const UNREADABLE_CONFIG = "export default {{{ not valid typescript";

/**
 * A skill directory in the shared `~/.claude/skills/` tree that this CLI did not put there.
 * `.claude/skills/` belongs to Claude Code, not to this installation.
 */
const FOREIGN_SKILL_DIR = "context7-mcp";

/**
 * An agent file in the shared `.claude/agents/` tree that this CLI did not compile. Its
 * counterpart claim is the provenance marker rather than `forkedFrom`, and it carries none —
 * which is the whole of what makes it somebody else's file.
 */
const FOREIGN_AGENT_NAME = "my-own-reviewer";

/**
 * The provenance block the copier stamps into every skill directory this CLI writes. With no
 * configuration left to name an id, it is the only claim an installed directory can carry — and
 * it is the same claim `uninstall` reads before removing anything.
 */
const CLI_PROVENANCE = {
  skillId: ORPHANED_SKILL_ID,
  contentHash: "abc1234",
  date: "2026-01-01",
};

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

    it("should name a config that loads and declares nothing rather than calling it missing", async () => {
      await writeTestTsConfig(projectDir, {
        name: "declares-nothing",
        skills: [],
        agents: [],
      });

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).toContain("declares no skills and no agents");
      expect(output, "the file is on disk and it loaded — it is not missing").not.toContain(
        "config.ts not found",
      );
      expect(output).toContain("Nothing is configured yet");
    });

    it("should run the operational rows on an empty config instead of skipping them", async () => {
      await writeTestTsConfig(projectDir, {
        name: "declares-nothing",
        skills: [],
        agents: [],
      });

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output, "the rows below claimed a valid config was invalid").not.toContain(
        "Skipped (config invalid)",
      );
      expect(output).toContain("No skills configured");
      expect(output).toContain("No agents configured");
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

      // Stale .md file from before exclusion. It carries real frontmatter because a
      // compile wrote it — a bare heading is content doctor rejects before it ever
      // reaches the orphan check.
      await writeFile(
        path.join(agentsDir, "web-developer.md"),
        renderAgentMd("web-developer", "Excluded agent content."),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // Excluded project agent .md should be flagged as orphan
      expect(output).toContain("orphaned agent file");
      expect(output).toContain("web-developer.md (not in config)");
    });
  });

  /**
   * The row's other verdict. With no configuration at all, ownership is not
   * unknown — it is settled, and the answer is that nothing owns any of it.
   */
  describe("orphans check with no configuration", () => {
    /**
     * An installed skill and a compiled agent, both valid enough to clear the content layer.
     * Each carries the claim its own kind can make with no configuration left to name it: the
     * skill its `forkedFrom` block, the agent the marker the compiler stamps into every file.
     */
    async function installContentWithoutConfig(): Promise<void> {
      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, ORPHANED_SKILL_ID);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd(ORPHANED_SKILL_ID),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({
          displayName: ORPHANED_SKILL_ID,
          category: "web-framework",
          slug: "react",
          cliDescription: "React JavaScript framework",
          usageGuidance: "Use React for building component-based UIs",
          contentHash: "b2c3d4e",
          forkedFrom: CLI_PROVENANCE,
        }),
      );

      await writeAgentFileForTest(ORPHANED_AGENT_NAME, { compiled: true });
    }

    /** A bare directory in the shared skills tree, of the shape another tool leaves behind. */
    async function installForeignSkillDir(): Promise<void> {
      await mkdir(path.join(projectDir, LOCAL_SKILLS_PATH, FOREIGN_SKILL_DIR), {
        recursive: true,
      });
    }

    /** An agent file in the shared agents tree that this CLI did not compile — no marker. */
    async function installForeignAgentFile(): Promise<void> {
      await writeAgentFileForTest(FOREIGN_AGENT_NAME, { compiled: false });
    }

    async function writeAgentFileForTest(
      agentName: string,
      options: { compiled: boolean },
    ): Promise<void> {
      const agentsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });
      const rendered = renderAgentMd(agentName, "Stranded agent content.");
      await writeFile(
        path.join(agentsDir, `${agentName}.md`),
        options.compiled ? stampProvenanceMarker(rendered, await cliVersion()) : rendered,
      );
    }

    it("names every installed skill and agent when no config declares them", async () => {
      await installContentWithoutConfig();

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      expect(output).toContain("no configuration declares them");
      expect(output).toContain(ORPHANED_SKILL_ID);
      expect(output).toContain(`${ORPHANED_AGENT_NAME}.md`);
      expect(output, "the row that names them cannot also report itself skipped").not.toMatch(
        /No Orphans\s+-\s+Skipped/,
      );
      expect(output).toContain("Nothing declares the files above");
    });

    it("keeps the skip when there is no config and nothing installed", async () => {
      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // An empty directory with no configuration is the state `init` exists for,
      // not a stranded one — there is nothing for a configuration to have owned.
      expect(output).toMatch(/No Orphans\s+-\s+Skipped/);
      expect(output).not.toContain("no configuration declares them");
    });

    it("counts only the directories carrying provenance when a foreign one sits beside them", async () => {
      await installContentWithoutConfig();
      await installForeignSkillDir();

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // The count is the assertion, not the absence of the name: the content layer names the
      // foreign directory in the same report, so `not.toContain` on it would be vacuous either
      // way. Two skill directories are on disk and exactly one of them is this CLI's.
      expect(
        output,
        "the row offers files for removal — it must count only what `uninstall` would remove",
      ).toContain("1 skill and 1 agent installed here, and no configuration declares them");
      expect(output).toContain(ORPHANED_SKILL_ID);
    });

    it("keeps the skip when the only thing installed is a directory this CLI did not install", async () => {
      await installForeignSkillDir();

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // `uninstall` refuses a directory carrying no provenance, so a row that offered this one
      // for removal would be the CLI contradicting itself across two of its own screens.
      expect(output).toMatch(/No Orphans\s+-\s+Skipped/);
      expect(output).not.toContain("no configuration declares them");
      expect(output).not.toContain("Nothing declares the files above");

      // Stepped over is not unmentioned. The content layer names it in the same run, so the
      // directory is accounted for rather than silently dropped.
      expect(output).toContain(FOREIGN_SKILL_DIR);
      expect(output).toContain("not installed by this CLI");
    });

    it("counts only the agent files carrying the marker when a hand-written one sits beside them", async () => {
      await installContentWithoutConfig();
      await installForeignAgentFile();

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // The count, for the same reason the skills half asserts on it: the content layer walks
      // every agent file in the same run, so a `not.toContain` on the hand-written name would
      // hold either way. Two agent files are on disk and exactly one of them is this CLI's.
      expect(
        output,
        "the row offers files for removal — it must count only what `uninstall` would remove",
      ).toContain("1 skill and 1 agent installed here, and no configuration declares them");
      expect(output).toContain(`${ORPHANED_AGENT_NAME}.md`);
    });

    it("keeps the skip when the only thing installed is an agent this CLI did not compile", async () => {
      await installForeignAgentFile();

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // `uninstall` with no configuration removes the marker-carrying agents and keeps the rest,
      // so a row that offered this one for removal would be the CLI contradicting itself.
      expect(output).toMatch(/No Orphans\s+-\s+Skipped/);
      expect(output).not.toContain("no configuration declares them");
    });

    it("still stands down for a config that exists and cannot be read", async () => {
      await installContentWithoutConfig();
      const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);
      await mkdir(claudeSrcDir, { recursive: true });
      await writeFile(path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS), UNREADABLE_CONFIG);

      const { stdout, error } = await runCliCommand(["doctor"]);
      const output = stdout + (error?.message || "");

      // Absent and unreadable are different states with different remedies. Only
      // the first settles ownership; the second is a content finding that gates
      // the whole operational layer, this row included.
      expect(output).toContain("exists but could not be loaded");
      expect(output).toContain("Skipped — fix the content errors above first");
      expect(output).not.toContain("no configuration declares them");
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

      // Create the skill files on disk. Both halves are written: an ejected skill
      // with no metadata.yaml is invalid content, and doctor stops at the content
      // layer before it reaches the eject-mode disk check under test here.
      const skillDir = path.join(projectDir, LOCAL_SKILLS_PATH, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react"),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({
          displayName: "web-framework-react",
          category: "web-framework",
          slug: "react",
          cliDescription: "React JavaScript framework",
          usageGuidance: "Use React for building component-based UIs",
          contentHash: "b2c3d4e",
        }),
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
        skills: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
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
