import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TEST_SOURCE_URL } from "../test-constants.js";
import path from "path";
import fs from "fs";
import { mkdir, writeFile, readFile } from "fs/promises";
import { missingArgsRefusal, parseRefusal, runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { fileExists, directoryExists } from "../test-fs-utils";
import { writeTestSkill, writeTestPluginManifest } from "../helpers/disk-writers.js";
import { createMockSkill } from "../factories/skill-factories.js";
import { createMockMatrix } from "../factories/matrix-factories.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { SKILLS } from "../test-fixtures";
import { AGENT_DEFS } from "../mock-data/mock-agents.js";
import { initializeMatrix } from "../../matrix/matrix-provider";
import {
  DEFAULT_BRANDING,
  STANDARD_FILES,
  STANDARD_DIRS,
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
} from "../../../consts";
import type {
  AgentScopeConfig,
  BrandingConfig,
  ProjectConfig,
  SkillConfig,
  SkillId,
} from "../../../types";
import { getCliInstalledPluginKeys } from "../../../commands/uninstall";
import { cliVersion, stampProvenanceMarker } from "../../agents/agent-provenance.js";
import { renderAgentMd } from "../content-generators.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { firstElement } from "../helpers/element-at.js";

vi.mock("../../../utils/exec.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../utils/exec.js")>()),
  claudePluginUninstall: vi.fn(),
  isClaudeCLIAvailable: vi.fn().mockResolvedValue(true),
}));

/**
 * The removal plan's compiled-agents item, the section header it sits under, and the statement
 * that stands beside it for the agent files this run leaves alone. Written out here rather than
 * imported from the command, so an assertion meant to hold a user-facing string still cannot move
 * with it. Both singular and plural forms are spelled out — the count is part of the claim.
 */
const PLAN_AGENTS_ITEM = "(CLI-compiled)";
const PLAN_CLI_MANAGED_SECTION = "CLI-managed files:";
const PLAN_AGENTS_KEPT_ONE = "Kept 1 agent in";
const PLAN_AGENTS_KEPT_TWO = "Kept 2 agents in";
const PLAN_AGENTS_KEPT_REASON = "no agents-inc marker";

/**
 * The three lines that say whether this run has a removal to make at all: the heading the plan is
 * printed under, the report that stands in its place when there is none, and the closing line that
 * claims the removal happened. Written out here for the same reason as the plan strings above.
 */
const PLAN_PREVIEW_HEADING = "The following will be removed:";
const NOTHING_TO_UNINSTALL = "Nothing to uninstall";
const UNINSTALL_COMPLETE = "Uninstall complete";

const TEST_PLUGIN_NAME = "test-plugin@marketplace";
const PLUGIN_SUBPATH = path.join(CLAUDE_DIR, "plugins", TEST_PLUGIN_NAME);
const TEST_SOURCE = TEST_SOURCE_URL;
const TEST_EXTRA_SOURCE = "github:acme-corp/skills";

/**
 * Two marketplace NAMES — what the plugin registry keys on — kept apart from the refs above so
 * an assertion cannot pass by matching the wrong one.
 */
const MARKETPLACE_NAME = "agents-inc";
const OTHER_MARKETPLACE_NAME = "custom-source";

/**
 * A `branding.name` a project config supplies, sharing no substring with
 * {@link DEFAULT_BRANDING.NAME} so neither half of a paired assertion can be satisfied by the
 * other's output.
 */
const WHITE_LABEL_NAME = "Northwind";

/** The preserved-directory warning, minus the name of the tool it says did not create it. */
function notCreatedBy(brandingName: string): string {
  return `not created by ${brandingName} CLI`;
}

/**
 * Creates a .claude-src/config.ts with source configuration.
 */
async function createProjectConfig(
  projectDir: string,
  options?: {
    marketplace?: string;
    marketplaceName?: string;
    extraSources?: Array<{ name: string; url: string }>;
    agents?: AgentScopeConfig[];
    skills?: SkillConfig[];
    branding?: BrandingConfig;
  },
): Promise<string> {
  const config: Record<string, unknown> = {
    marketplace: options?.marketplace ?? TEST_SOURCE,
  };

  if (options?.branding) {
    config.branding = options.branding;
  }

  if (options?.marketplaceName) {
    config.marketplaceName = options.marketplaceName;
  }

  if (options?.extraSources) {
    config.sources = options.extraSources;
  }

  if (options?.agents) {
    config.agents = options.agents;
  }

  if (options?.skills) {
    config.skills = options.skills;
  }

  return writeTestTsConfig(projectDir, config);
}

/**
 * Creates a plugin directory with the full settings.json-based discovery chain:
 * 1. Project .claude/settings.json with enabledPlugins
 * 2. Fake home ~/.claude/plugins/installed_plugins.json registry
 * 3. Plugin manifest at the install path (.claude-plugin/plugin.json)
 */
async function createPluginDir(projectDir: string, fakeHome: string): Promise<string> {
  const pluginDir = path.join(projectDir, PLUGIN_SUBPATH);
  await mkdir(pluginDir, { recursive: true });

  // Create plugin manifest so getVerifiedPluginInstallPaths can verify the path
  await writeTestPluginManifest(
    pluginDir,
    { name: TEST_PLUGIN_NAME, version: "1.0.0" },
    { pretty: false },
  );

  // Create .claude/settings.json with enabled plugin
  const settingsPath = path.join(projectDir, CLAUDE_DIR, "settings.json");
  await writeFile(settingsPath, JSON.stringify({ enabledPlugins: { [TEST_PLUGIN_NAME]: true } }));

  // Use resolved (real) paths for registry entries because process.cwd()
  // resolves symlinks (e.g., /var -> /private/var on macOS) and the
  // uninstall command compares projectPath against process.cwd().
  const realProjectDir = fs.realpathSync(projectDir);
  const realPluginDir = path.join(realProjectDir, PLUGIN_SUBPATH);

  // Create global registry at fake home
  const registryDir = path.join(fakeHome, CLAUDE_DIR, "plugins");
  await mkdir(registryDir, { recursive: true });
  await writeFile(
    path.join(registryDir, "installed_plugins.json"),
    JSON.stringify({
      version: 1,
      plugins: {
        [TEST_PLUGIN_NAME]: [
          {
            scope: "project",
            projectPath: realProjectDir,
            installPath: realPluginDir,
            version: "1.0.0",
            installedAt: new Date().toISOString(),
          },
        ],
      },
    }),
  );

  return pluginDir;
}

/** Creates a skill with forkedFrom.source matching a configured source (CLI-installed) */
async function createCLISkill(
  skillsDir: string,
  skillId: SkillId,
  source = TEST_SOURCE,
): Promise<string> {
  return writeTestSkill(skillsDir, skillId, {
    extraMetadata: {
      displayName: skillId,
      forkedFrom: {
        skillId,
        contentHash: "abc1234",
        date: "2026-01-01",
        source,
      },
    },
  });
}

/** Creates a skill directory WITHOUT forkedFrom (user-created skill) */
async function createUserSkill(skillsDir: string, skillId: SkillId): Promise<string> {
  return writeTestSkill(skillsDir, skillId, {
    extraMetadata: { displayName: skillId },
  });
}

/** Creates a skill directory with no metadata.yaml at all */
async function createSkillWithoutMetadata(skillsDir: string, skillId: SkillId): Promise<string> {
  return writeTestSkill(skillsDir, skillId, {
    skipMetadata: true,
  });
}

/** Creates a user MCP server config in .claude/mcp.json */
async function createUserMcpConfig(claudeDir: string): Promise<string> {
  const mcpPath = path.join(claudeDir, "mcp.json");
  await writeFile(
    mcpPath,
    JSON.stringify({
      mcpServers: {
        "user-server": { command: "node", args: ["server.js"] },
      },
    }),
  );
  return mcpPath;
}

/** Creates a user settings.json in .claude/settings.json (without plugin references) */
async function createUserSettings(claudeDir: string): Promise<string> {
  const settingsPath = path.join(claudeDir, "settings.json");
  await writeFile(settingsPath, JSON.stringify({ userPreference: "dark-mode" }));
  return settingsPath;
}

/** Creates a user CLAUDE.md in .claude/CLAUDE.md */
async function createUserClaudeMd(claudeDir: string): Promise<string> {
  const claudeMdPath = path.join(claudeDir, STANDARD_FILES.CLAUDE_MD);
  await writeFile(claudeMdPath, "# Project Instructions\n\nUser project rules.");
  return claudeMdPath;
}

/** Creates `<projectDir>/.claude/skills/` (and .claude/) and returns the skills dir. */
async function createProjectSkillsDir(projectDir: string): Promise<string> {
  const skillsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
  await mkdir(skillsDir, { recursive: true });
  return skillsDir;
}

/**
 * Writes one agent file into `<projectDir>/.claude/agents/` and returns its path.
 * `compiled` stamps it with the provenance marker the compiler emits — the only thing
 * that says this CLI produced the file once the configuration naming it is gone.
 */
async function createAgentFile(
  projectDir: string,
  agentName: string,
  options: { compiled: boolean },
): Promise<string> {
  const agentsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
  await mkdir(agentsDir, { recursive: true });

  const rendered = renderAgentMd(agentName);
  const content = options.compiled ? stampProvenanceMarker(rendered, await cliVersion()) : rendered;

  const agentPath = path.join(agentsDir, `${agentName}.md`);
  await writeFile(agentPath, content);
  return agentPath;
}

describe("uninstall command", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-uninstall-test-"));

    initializeMatrix(
      createMockMatrix(
        SKILLS.react,
        SKILLS.vue,
        SKILLS.zustand,
        SKILLS.hono,
        // Boundary casts: fictional skill IDs for testing uninstall scenarios
        createMockSkill("web-tooling-acme" as SkillId),
        createMockSkill("web-tooling-custom" as SkillId),
        createMockSkill("web-tooling-personal" as SkillId),
        createMockSkill("web-tooling-nometadata" as SkillId),
      ),
    );
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("flag validation", () => {
    it("should run without arguments", async () => {
      const { error } = await runCliCommand(["uninstall"]);

      const output = error?.message || "";
      expect(
        output,
        "uninstall detects its target from the cwd and declares no positional",
      ).not.toContain(missingArgsRefusal(1));
    });

    it("should accept --yes flag", async () => {
      const { error } = await runCliCommand(["uninstall", "--yes"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("--yes"));
    });

    it("should accept -y shorthand for yes", async () => {
      const { error } = await runCliCommand(["uninstall", "-y"]);

      const output = error?.message || "";
      expect(output).not.toContain(parseRefusal("-y"));
    });
  });

  describe("nothing to uninstall", () => {
    it("should show nothing to uninstall when project is empty", async () => {
      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      const output = stdout + stderr;
      expect(output).toContain("Nothing to uninstall");
    });

    it("should show not installed message", async () => {
      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      const output = stdout + stderr;
      expect(output).toContain("not installed");
    });
  });

  describe("config-based skill removal", () => {
    it("should remove skills with forkedFrom.source matching configured source", async () => {
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);

      const cliSkillDir = await createCLISkill(skillsDir, "web-framework-react");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(cliSkillDir)).toBe(false);
      expect(stdout).toContain("Removed 1 CLI-installed skill");
    });

    it("should preserve skills without forkedFrom (user-created)", async () => {
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);

      const userSkillDir = await createUserSkill(skillsDir, "web-tooling-custom" as SkillId);

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      const output = stdout + stderr;
      expect(await directoryExists(userSkillDir)).toBe(true);
      expect(output).toContain("Skipping 'web-tooling-custom'");
      expect(output).toContain("not created by");
    });

    /**
     * The one branded line `uninstall` prints that is neither its heading nor its sign-off. It
     * claims which tool did NOT write the directory being kept, so under a white label it has to
     * name the tool the user knows. Paired with the default below: the configured half alone
     * passes on a line hardcoded to the fixture, and the default half alone passes on wiring that
     * never landed.
     */
    it("should name the configured branding in the preserved-skill warning", async () => {
      await createProjectConfig(projectDir, { branding: { name: WHITE_LABEL_NAME } });
      const skillsDir = await createProjectSkillsDir(projectDir);
      await createUserSkill(skillsDir, "web-tooling-custom" as SkillId);

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      const output = stdout + stderr;
      expect(output).toContain(notCreatedBy(WHITE_LABEL_NAME));
      expect(output, "the configured name replaces the shipped one").not.toContain(
        DEFAULT_BRANDING.NAME,
      );
    });

    it("should name the shipped branding in the preserved-skill warning when none is configured", async () => {
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);
      await createUserSkill(skillsDir, "web-tooling-custom" as SkillId);

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      const output = stdout + stderr;
      expect(output).toContain(notCreatedBy(DEFAULT_BRANDING.NAME));
      expect(output).not.toContain(WHITE_LABEL_NAME);
    });

    it("should preserve skills without metadata.yaml", async () => {
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);

      const noMetaSkillDir = await createSkillWithoutMetadata(
        skillsDir,
        "web-tooling-nometadata" as SkillId,
      );

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      const output = stdout + stderr;
      expect(await directoryExists(noMetaSkillDir)).toBe(true);
      expect(output).toContain("Skipping 'web-tooling-nometadata'");
    });

    it("should remove CLI skills and skip user skills in mixed scenario", async () => {
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);

      const cliSkillDir = await createCLISkill(skillsDir, "web-framework-react");
      const userSkillDir = await createUserSkill(skillsDir, "web-tooling-custom" as SkillId);

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      const output = stdout + stderr;

      // CLI skill should be removed
      expect(await directoryExists(cliSkillDir)).toBe(false);
      expect(output).toContain("Removed 1 CLI-installed skill");

      // User skill should remain
      expect(await directoryExists(userSkillDir)).toBe(true);
      expect(output).toContain("Skipping 'web-tooling-custom'");
    });

    it("should remove multiple CLI skills", async () => {
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);

      await createCLISkill(skillsDir, "web-framework-react");
      await createCLISkill(skillsDir, "web-state-zustand");
      await createCLISkill(skillsDir, "api-framework-hono");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(stdout).toContain("Removed 3 CLI-installed skills");
    });

    it("should match skills against extra sources", async () => {
      await createProjectConfig(projectDir, {
        extraSources: [{ name: "acme", url: TEST_EXTRA_SOURCE }],
      });
      const skillsDir = await createProjectSkillsDir(projectDir);

      // Skill from primary source
      const primarySkillDir = await createCLISkill(skillsDir, "web-framework-react", TEST_SOURCE);
      // Skill from extra source
      const extraSkillDir = await createCLISkill(
        skillsDir,
        "web-tooling-acme" as SkillId,
        TEST_EXTRA_SOURCE,
      );
      // User skill
      const userSkillDir = await createUserSkill(skillsDir, "web-tooling-personal" as SkillId);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      // Both source-matched skills removed
      expect(await directoryExists(primarySkillDir)).toBe(false);
      expect(await directoryExists(extraSkillDir)).toBe(false);
      // User skill preserved
      expect(await directoryExists(userSkillDir)).toBe(true);
      expect(stdout).toContain("Removed 2 CLI-installed skills");
    });

    it("should handle legacy skills without source field in forkedFrom when config exists", async () => {
      // Legacy skill: has forkedFrom but no source field
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);

      // Create a legacy skill with forkedFrom but no source
      const legacySkillDir = await writeTestSkill(skillsDir, "web-framework-vue-composition-api", {
        extraMetadata: {
          displayName: "web-framework-vue-composition-api",
          forkedFrom: {
            skillId: "web-framework-vue-composition-api",
            contentHash: "def5678",
            date: "2026-01-01",
            // Note: no source field (legacy)
          },
        },
      });

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      // Legacy skill with forkedFrom but no source should still be removed when config exists
      expect(await directoryExists(legacySkillDir)).toBe(false);
      expect(stdout).toContain("Removed 1 CLI-installed skill");
    });
  });

  describe("agent removal", () => {
    it("should remove compiled agents listed in config", async () => {
      await createProjectConfig(projectDir, {
        agents: buildAgentConfigs(["web-developer"]),
      });
      const claudeDir = path.join(projectDir, CLAUDE_DIR);

      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "web-developer.md"), "# Web Developer Agent");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(agentsDir)).toBe(false);
      expect(stdout).toContain("Removed 1 compiled agent");
      // The control for the config-less case below. A config naming the agents is exactly what
      // makes their directory the CLI's to delete, so this is the state — and the only state —
      // in which the plan may promise it.
      expect(stdout).toContain(PLAN_CLI_MANAGED_SECTION);
      expect(stdout).toContain(PLAN_AGENTS_ITEM);
      expect(stdout).not.toContain(PLAN_AGENTS_KEPT_ONE);
    });

    it("should keep an unidentifiable agents directory and report nothing to uninstall", async () => {
      const claudeDir = path.join(projectDir, CLAUDE_DIR);

      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });
      const agentPath = path.join(agentsDir, "my-custom-agent.md");
      await writeFile(agentPath, "# Custom Agent");
      const agentBefore = await readFile(agentPath, "utf-8");

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);
      const output = stdout + stderr;

      expect(await directoryExists(agentsDir)).toBe(true);
      expect(await readFile(agentPath, "utf-8")).toBe(agentBefore);

      // The plan may not promise a removal the run then declines to make. Without a config
      // nothing says which agent files this CLI compiled, so every one of them is kept.
      expect(output).not.toContain(PLAN_AGENTS_ITEM);
      expect(output).not.toContain(PLAN_CLI_MANAGED_SECTION);

      // With that item gone the plan carries no removal at all, and these agents were the only
      // thing here. A heading over an empty list and a closing success line each report a removal
      // this run never makes, so neither may be printed — the run has nothing to uninstall.
      expect(output).not.toContain(PLAN_PREVIEW_HEADING);
      expect(output).toContain(NOTHING_TO_UNINSTALL);
      expect(output).not.toContain(UNINSTALL_COMPLETE);
    });

    it("should name the kept agents beside the removals it can still promise", async () => {
      const skillsDir = await createProjectSkillsDir(projectDir);
      const cliSkillDir = await createCLISkill(skillsDir, "web-framework-react");

      // Neither file carries the marker, so neither is this CLI's to delete — including the one
      // whose basename is an agent the CLI itself compiles.
      const builtInNamed = await createAgentFile(projectDir, AGENT_DEFS.webDev.name, {
        compiled: false,
      });
      const userNamed = await createAgentFile(projectDir, "my-custom-agent", { compiled: false });
      const builtInNamedBefore = await readFile(builtInNamed, "utf-8");
      const userNamedBefore = await readFile(userNamed, "utf-8");

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);
      const output = stdout + stderr;

      // Skills carry their own forked-from metadata, so they are identified without the config and
      // a plan is printed. That is the positive subject guard the two negatives below need: with no
      // plan on screen at all they would hold for free.
      expect(output).toContain(PLAN_PREVIEW_HEADING);
      expect(output).toContain(PLAN_CLI_MANAGED_SECTION);
      expect(output).not.toContain(PLAN_AGENTS_ITEM);
      expect(output).toContain(PLAN_AGENTS_KEPT_TWO);
      expect(output).toContain(PLAN_AGENTS_KEPT_REASON);

      // The plan and the run are one decision: what it promised is gone, what it named as kept is
      // byte-identical.
      expect(await directoryExists(cliSkillDir)).toBe(false);
      expect(await readFile(builtInNamed, "utf-8")).toBe(builtInNamedBefore);
      expect(await readFile(userNamed, "utf-8")).toBe(userNamedBefore);
    });

    /**
     * The marker is what lets a run with no configuration tell its own output from the user's.
     * One file carries it and goes; the other does not and stays — and the plan the user reads
     * before pressing `y` says both, as does the summary printed after.
     */
    it("should sweep the marked agents and keep the unmarked ones when no config can name them", async () => {
      const compiled = await createAgentFile(projectDir, AGENT_DEFS.webDev.name, {
        compiled: true,
      });
      const handWritten = await createAgentFile(projectDir, AGENT_DEFS.apiDev.name, {
        compiled: false,
      });
      const handWrittenBefore = await readFile(handWritten, "utf-8");

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);
      const output = stdout + stderr;

      expect(output).toContain(PLAN_PREVIEW_HEADING);
      expect(output).toContain(PLAN_CLI_MANAGED_SECTION);
      expect(output).toContain(PLAN_AGENTS_ITEM);
      expect(output).toContain(PLAN_AGENTS_KEPT_ONE);
      expect(output).toContain(PLAN_AGENTS_KEPT_REASON);
      expect(output).toContain("Removed 1 compiled agent");
      expect(output).toContain(UNINSTALL_COMPLETE);

      expect(await fileExists(compiled)).toBe(false);
      expect(await readFile(handWritten, "utf-8")).toBe(handWrittenBefore);
    });

    it("should only remove agents listed in config and preserve others", async () => {
      await createProjectConfig(projectDir, {
        agents: buildAgentConfigs(["web-developer"]),
      });
      const claudeDir = path.join(projectDir, CLAUDE_DIR);

      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "web-developer.md"), "# Web Developer Agent");
      await writeFile(path.join(agentsDir, "my-custom-agent.md"), "# Custom Agent");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(stdout).toContain("Removed 1 compiled agent");
      expect(await directoryExists(agentsDir)).toBe(true);
      expect(await fileExists(path.join(agentsDir, "web-developer.md"))).toBe(false);
      expect(await fileExists(path.join(agentsDir, "my-custom-agent.md"))).toBe(true);
    });
  });

  describe(".claude-src/ config manifest removal", () => {
    it("should remove the config manifest by default", async () => {
      await createProjectConfig(projectDir);
      const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      // config.ts was the only .claude-src content, so the emptied dir is removed too
      expect(await directoryExists(claudeSrcDir)).toBe(false);
      expect(stdout).toContain(`Removed ${CLAUDE_SRC_DIR}/`);
    });
  });

  describe("empty .claude/ cleanup", () => {
    it("should remove .claude/ if empty after cleanup", async () => {
      await createProjectConfig(projectDir);
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      await mkdir(claudeDir, { recursive: true });

      const skillsDir = path.join(claudeDir, STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
      await createCLISkill(skillsDir, "web-framework-react");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(claudeDir)).toBe(false);
      expect(stdout).toContain(`Removed ${CLAUDE_DIR}/`);
    });

    it("should not remove .claude/ if user content remains", async () => {
      await createProjectConfig(projectDir);
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      await mkdir(claudeDir, { recursive: true });

      const skillsDir = path.join(claudeDir, STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
      await createUserSkill(skillsDir, "web-tooling-custom" as SkillId);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(claudeDir)).toBe(true);
      expect(stdout).toContain("Kept .claude/ (contains user content)");
    });
  });

  describe("plugin removal", () => {
    it("should remove plugin directory", async () => {
      await createProjectConfig(projectDir, {
        skills: [{ id: "test-plugin" as SkillId, scope: "project", origin: "marketplace" }],
      });
      const pluginDir = await createPluginDir(projectDir, fakeHome);

      expect(await directoryExists(pluginDir)).toBe(true);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(pluginDir)).toBe(false);
      expect(stdout).toContain("Uninstalled 1 plugin");
    });

    it("should show what will be removed", async () => {
      await createProjectConfig(projectDir, {
        skills: [{ id: "test-plugin" as SkillId, scope: "project", origin: "marketplace" }],
      });
      await createPluginDir(projectDir, fakeHome);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(stdout).toContain("The following will be removed");
      expect(stdout).toContain("Plugins:");
    });

    it("should show uninstall complete message", async () => {
      await createProjectConfig(projectDir, {
        skills: [{ id: "test-plugin" as SkillId, scope: "project", origin: "marketplace" }],
      });
      await createPluginDir(projectDir, fakeHome);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(stdout).toContain(`${DEFAULT_BRANDING.NAME} has been uninstalled`);
      expect(stdout).toContain("Uninstall complete");
    });
  });

  describe("re-scoped plugin handling", () => {
    it("should match plugin keys using marketplace fallback when skill source differs", async () => {
      // Config has skill.origin = "re-scoped-source" but config.marketplaceName = "marketplace"
      // Plugin key in settings.json is "test-plugin@marketplace"
      // Without the marketplace fallback, the key won't match
      await createProjectConfig(projectDir, {
        marketplaceName: "marketplace",
        skills: [{ id: "test-plugin" as SkillId, scope: "project", origin: "re-scoped-source" }],
      });
      const pluginDir = await createPluginDir(projectDir, fakeHome);

      expect(await directoryExists(pluginDir)).toBe(true);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(pluginDir)).toBe(false);
      expect(stdout).toContain("Uninstalled 1 plugin");
    });

    it("should include marketplace variant keys for non-eject skills", () => {
      const config: Partial<ProjectConfig> = {
        marketplaceName: "agents-inc",
        skills: [
          firstElement(buildSkillConfigs(["web-framework-react"], { origin: "custom-source" })),
          firstElement(buildSkillConfigs(["web-state-zustand"], { scope: "global" })),
          firstElement(buildSkillConfigs(["api-framework-hono"], { origin: "agents-inc" })),
        ],
      };

      const keys = getCliInstalledPluginKeys(config);

      // Primary keys always present
      expect(keys.has("web-framework-react@custom-source")).toBe(true);
      expect(keys.has("web-state-zustand@eject")).toBe(true);
      expect(keys.has("api-framework-hono@agents-inc")).toBe(true);

      // Marketplace variant for non-eject skill whose origin differs from the marketplace name
      expect(keys.has("web-framework-react@agents-inc")).toBe(true);

      // No marketplace variant for eject skills
      expect(keys.has("web-state-zustand@agents-inc")).toBe(false);

      // No marketplace variant when the origin already matches the marketplace name
      // (only the primary key "api-framework-hono@agents-inc" exists, no duplicate)
      expect(keys.size).toBe(4);
    });

    /**
     * The registry key is `<id>@<marketplace NAME>` — the identity Claude Code registered the
     * plugin under. Once the ref moves onto `marketplace`, reading that field here would build
     * a key spelling a repository URL, which matches nothing and leaves the plugin installed.
     */
    it("builds the marketplace variant key from the marketplace name, not the ref", () => {
      const config = buildProjectConfig({
        marketplace: TEST_SOURCE_URL,
        marketplaceName: MARKETPLACE_NAME,
        skills: buildSkillConfigs(["web-framework-react"], { origin: OTHER_MARKETPLACE_NAME }),
      });

      const keys = getCliInstalledPluginKeys(config);

      expect(keys.has(`web-framework-react@${OTHER_MARKETPLACE_NAME}`)).toBe(true);
      expect(keys.has(`web-framework-react@${MARKETPLACE_NAME}`)).toBe(true);
      expect(
        keys.has(`web-framework-react@${TEST_SOURCE_URL}`),
        "a repository ref is not an identity the plugin registry knows",
      ).toBe(false);
    });

    it("should uninstall re-scoped plugins by trying both scopes", async () => {
      const execModule = await import("../../../utils/exec");
      const spy = vi.spyOn(execModule, "claudePluginUninstallBestEffort").mockResolvedValue();
      const cliSpy = vi.spyOn(execModule, "isClaudeCLIAvailable").mockResolvedValue(true);

      // Import the exported uninstallPlugins function
      const { uninstallPlugins: uninstallPluginsFn } = await import("../../../commands/uninstall");

      const pluginsDir = path.join(projectDir, CLAUDE_DIR, "plugins");
      await mkdir(pluginsDir, { recursive: true });
      const pluginPath = path.join(pluginsDir, "test-plugin@marketplace");
      await mkdir(pluginPath, { recursive: true });

      const config = buildProjectConfig({
        skills: [{ id: "test-plugin" as SkillId, scope: "project", origin: "marketplace" }],
      });

      const result = await uninstallPluginsFn(
        { kind: "plugins", pluginsDir, names: ["test-plugin@marketplace"] },
        config,
        projectDir,
      );

      expect(result.totalUninstalled).toBe(1);

      // Helper encapsulates the dual-scope attempt; assert primary scope passed for "project" config.
      expect(spy).toHaveBeenCalledWith("test-plugin@marketplace", "project", projectDir);

      spy.mockRestore();
      cliSpy.mockRestore();
    });

    it("should uninstall project-scoped plugin that was re-scoped from global during init", async () => {
      // Scenario: skill was originally global, re-scoped to project during init
      // Config says scope: "project" but plugin registry may have "user" scope entry
      // The marketplace name in config differs from the skill origin
      await createProjectConfig(projectDir, {
        marketplaceName: "marketplace",
        skills: [{ id: "test-plugin" as SkillId, scope: "project", origin: "custom-source" }],
      });
      const pluginDir = await createPluginDir(projectDir, fakeHome);

      expect(await directoryExists(pluginDir)).toBe(true);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      // Plugin should be detected via marketplace fallback key and removed
      expect(await directoryExists(pluginDir)).toBe(false);
      expect(stdout).toContain("Uninstalled 1 plugin");
    });

    it("should uninstall global-scoped plugin that was re-scoped from project during edit", async () => {
      // Scenario: skill was originally project, re-scoped to global during edit
      // Config says scope: "global" but plugin registry may have "project" scope entry
      const execModule = await import("../../../utils/exec");
      const spy = vi.spyOn(execModule, "claudePluginUninstallBestEffort").mockResolvedValue();
      const cliSpy = vi.spyOn(execModule, "isClaudeCLIAvailable").mockResolvedValue(true);

      const { uninstallPlugins: uninstallPluginsFn } = await import("../../../commands/uninstall");

      const pluginsDir = path.join(projectDir, CLAUDE_DIR, "plugins");
      await mkdir(pluginsDir, { recursive: true });
      const pluginPath = path.join(pluginsDir, "test-plugin@marketplace");
      await mkdir(pluginPath, { recursive: true });

      const config = buildProjectConfig({
        skills: [{ id: "test-plugin" as SkillId, scope: "global", origin: "marketplace" }],
      });

      const result = await uninstallPluginsFn(
        { kind: "plugins", pluginsDir, names: ["test-plugin@marketplace"] },
        config,
        projectDir,
      );

      expect(result.totalUninstalled).toBe(1);

      // Helper encapsulates the dual-scope attempt; assert primary scope passed for "global" config ("user" for plugins).
      expect(spy).toHaveBeenCalledWith("test-plugin@marketplace", "user", projectDir);

      spy.mockRestore();
      cliSpy.mockRestore();
    });
  });

  describe("user content preservation", () => {
    it("should preserve .claude/mcp.json during uninstall", async () => {
      await createProjectConfig(projectDir);
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      await mkdir(claudeDir, { recursive: true });
      const mcpPath = await createUserMcpConfig(claudeDir);

      const skillsDir = path.join(claudeDir, STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
      await createCLISkill(skillsDir, "web-framework-react");

      await runCliCommand(["uninstall", "--yes"]);

      expect(await fileExists(mcpPath)).toBe(true);
      const content = JSON.parse(await readFile(mcpPath, "utf-8"));
      expect(content.mcpServers["user-server"]).toStrictEqual({
        command: "node",
        args: ["server.js"],
      });
    });

    it("should preserve .claude/settings.json during uninstall", async () => {
      await createProjectConfig(projectDir);
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      await mkdir(claudeDir, { recursive: true });
      const settingsPath = await createUserSettings(claudeDir);

      await runCliCommand(["uninstall", "--yes"]);

      expect(await fileExists(settingsPath)).toBe(true);
      const content = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(content.userPreference).toBe("dark-mode");
    });

    it("should preserve .claude/CLAUDE.md during uninstall", async () => {
      await createProjectConfig(projectDir);
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      await mkdir(claudeDir, { recursive: true });
      const claudeMdPath = await createUserClaudeMd(claudeDir);

      await runCliCommand(["uninstall", "--yes"]);

      expect(await fileExists(claudeMdPath)).toBe(true);
      const content = await readFile(claudeMdPath, "utf-8");
      expect(content).toContain("User project rules");
    });

    it("should preserve user-created skills and user files together", async () => {
      await createProjectConfig(projectDir);
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      await mkdir(claudeDir, { recursive: true });

      const skillsDir = path.join(claudeDir, STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
      const cliSkillDir = await createCLISkill(skillsDir, "web-framework-react");
      const userSkillDir = await createUserSkill(skillsDir, "web-tooling-personal" as SkillId);
      const mcpPath = await createUserMcpConfig(claudeDir);
      const settingsPath = await createUserSettings(claudeDir);
      const claudeMdPath = await createUserClaudeMd(claudeDir);

      await runCliCommand(["uninstall", "--yes"]);

      // CLI artifact removed
      expect(await directoryExists(cliSkillDir)).toBe(false);

      // All user content preserved
      expect(await directoryExists(userSkillDir)).toBe(true);
      expect(await fileExists(mcpPath)).toBe(true);
      expect(await fileExists(settingsPath)).toBe(true);
      expect(await fileExists(claudeMdPath)).toBe(true);

      // .claude/ preserved because user content remains
      expect(await directoryExists(claudeDir)).toBe(true);
    });
  });

  describe("combined plugin and local removal", () => {
    it("should remove both plugins and CLI-managed local artifacts", async () => {
      await createProjectConfig(projectDir, {
        skills: [{ id: "test-plugin" as SkillId, scope: "project", origin: "marketplace" }],
      });
      const pluginDir = await createPluginDir(projectDir, fakeHome);
      const claudeDir = path.join(projectDir, CLAUDE_DIR);

      const skillsDir = path.join(claudeDir, STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
      const cliSkillDir = await createCLISkill(skillsDir, "web-framework-react");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(pluginDir)).toBe(false);
      expect(await directoryExists(cliSkillDir)).toBe(false);
      expect(stdout).toContain("Uninstalled 1 plugin");
      expect(stdout).toContain("Removed 1 CLI-installed skill");
    });

    it("should remove everything including the config manifest by default", async () => {
      await createProjectConfig(projectDir, {
        agents: buildAgentConfigs(["web-developer"]),
      });
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);

      const skillsDir = path.join(claudeDir, STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
      await createCLISkill(skillsDir, "web-framework-react");

      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "web-developer.md"), "# Agent");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(claudeDir)).toBe(false);
      expect(await directoryExists(claudeSrcDir)).toBe(false);
      expect(stdout).toContain("Removed 1 CLI-installed skill");
      expect(stdout).toContain("Removed 1 compiled agent");
      expect(stdout).toContain(`Removed ${CLAUDE_SRC_DIR}/`);
      expect(stdout).toContain(`Removed ${CLAUDE_DIR}/`);
    });
  });

  describe("global scope handling", () => {
    it("should not remove global-scoped skills when only global skills exist", async () => {
      // Config has global-scoped skills, but uninstall only looks at projectDir/.claude/skills/
      await createProjectConfig(projectDir, {
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      // Place the skill at the global location (~/.claude/skills/)
      const globalSkillsDir = path.join(fakeHome, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      await mkdir(globalSkillsDir, { recursive: true });
      await createCLISkill(globalSkillsDir, "web-framework-react");

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      // Global skills should be untouched — uninstall only operates on project dir
      expect(await directoryExists(globalSkillsDir)).toBe(true);
      expect(await directoryExists(path.join(globalSkillsDir, "web-framework-react"))).toBe(true);

      // No skills or agents are removed from the project directory (only the
      // config manifest is, which is expected by default).
      const output = stdout + stderr;
      expect(output).not.toContain("CLI-installed skill");
      expect(output).not.toContain("compiled agent");
    });

    it("should remove project-scoped skills without touching global-scoped skills", async () => {
      await createProjectConfig(projectDir, {
        skills: [
          firstElement(buildSkillConfigs(["web-framework-react"])),
          firstElement(buildSkillConfigs(["web-state-zustand"], { scope: "global" })),
        ],
      });

      // Project skill at projectDir/.claude/skills/
      const projectSkillsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      await mkdir(projectSkillsDir, { recursive: true });
      const projectSkillDir = await createCLISkill(projectSkillsDir, "web-framework-react");

      // Global skill at ~/.claude/skills/
      const globalSkillsDir = path.join(fakeHome, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      await mkdir(globalSkillsDir, { recursive: true });
      await createCLISkill(globalSkillsDir, "web-state-zustand");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      // Project skill should be removed
      expect(await directoryExists(projectSkillDir)).toBe(false);
      expect(stdout).toContain("Removed 1 CLI-installed skill");

      // Global skill should be untouched
      expect(await directoryExists(path.join(globalSkillsDir, "web-state-zustand"))).toBe(true);
    });
  });

  describe("global uninstall", () => {
    // Global uninstall is done by running cc uninstall from ~/.claude/ (or wherever
    // global config lives). No --global flag needed — the command uses process.cwd().
    it("should remove global artifacts when run from global dir", async () => {
      // The command uses process.cwd() as the project directory, so we must chdir
      // to fakeHome for global uninstall to find the right .claude/skills/.
      const globalSkillsDir = path.join(fakeHome, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      await mkdir(globalSkillsDir, { recursive: true });
      await createCLISkill(globalSkillsDir, "web-framework-react");

      await createProjectConfig(fakeHome, {
        skills: buildSkillConfigs(["web-framework-react"]),
      });

      process.chdir(fakeHome);
      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(stdout).toContain("Removed 1 CLI-installed skill");
      expect(await directoryExists(path.join(globalSkillsDir, "web-framework-react"))).toBe(false);
    });
  });
});
