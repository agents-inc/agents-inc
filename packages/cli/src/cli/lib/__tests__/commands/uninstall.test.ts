import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TEST_SOURCE_URL } from "../test-constants.js";
import path from "path";
import fs from "fs";
import { chmod, mkdir, writeFile, readFile, rm } from "fs/promises";
import {
  CLI_ROOT,
  missingArgsRefusal,
  parseRefusal,
  runCliCommand,
} from "../helpers/cli-runner.js";
import { captureOutput } from "@oclif/test";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { fileExists, directoryExists } from "../test-fs-utils";
import { writeTestSkill, writeTestPluginManifest } from "../helpers/disk-writers.js";
import { createMockSkill } from "../factories/skill-factories.js";
import { createMockMatrix } from "../factories/matrix-factories.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
  buildSourceConfig,
} from "../factories/config-factories.js";
import { buildSkillConfigs, type FixtureSkillConfig } from "../helpers/skill-config-builders.js";
import { SKILLS } from "../test-fixtures";
import { AGENT_DEFS } from "../mock-data/mock-agents.js";
import { initializeMatrix } from "../../matrix/matrix-provider";
import {
  DEFAULT_BRANDING,
  EJECT_SOURCE,
  STANDARD_FILES,
  STANDARD_DIRS,
  CLAUDE_DIR,
  PROVIDERS,
} from "../../../consts";
import { sourceFolderInUse } from "../../installation/install-layout.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import type { AgentScopeConfig, BrandingConfig, SkillId } from "../../../types";
import { hostAt } from "../../hosts/host-for.js";
import { stampProvenanceMarker } from "../../agents/agent-provenance.js";
import { renderAgentMd, renderConfigTsWithBigIntField } from "../content-generators.js";
import { writeRawTestConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { compactCliOutput, flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
import { renderUnparseableConfigTs } from "../factories/unloadable-config-factories.js";
import { delay, RENDER_DELAY_MS } from "../test-constants";
import { EXIT_CODES } from "../../exit-codes";
import { firstElement } from "../helpers/element-at.js";

vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

/** Loading the command through `dist/` comes before the prompt opens. */
const PROMPT_OPEN_TIMEOUT = { timeout: 10_000 };

/** Written out, not imported, so an assertion on user-facing text cannot move with it. */
const PLAN_AGENTS_KEPT_ONE = "Kept 1 agent in";
const PLAN_AGENTS_KEPT_TWO = "Kept 2 agents in";
const PLAN_AGENTS_KEPT_REASON = "no agents-inc marker";

/** Whether the run has a removal to make at all: the plan is the panel. */
const PLAN_PANEL = "│  Marketplace ";

/** A row the panel marks removed, under either column. */
function removedRow(name: string): string {
  return ` - ${name} `;
}
const NOTHING_TO_UNINSTALL = "Nothing to uninstall";
const UNINSTALL_COMPLETE = "Uninstall complete";

const TEST_PLUGIN_NAME = "test-plugin@marketplace";

/**
 * Printed per plugin really deregistered: the count is what a run observed, not what it planned.
 * Specs staging only a directory register nothing, so they assert its absence.
 */
const PLUGIN_COUNT_LINE = "Uninstalled 1 plugin";

const NOTHING_REGISTERED_TO_COUNT =
  "no host held a registration for the staged plugin, so a count claims a removal the run never observed";

/** Not a catalogue skill, so a config naming it is written as a plain string. */
const TEST_PLUGIN_SKILL = "test-plugin";
const PLUGIN_SUBPATH = path.join(CLAUDE_DIR, "plugins", TEST_PLUGIN_NAME);
const TEST_SOURCE = TEST_SOURCE_URL;
const TEST_EXTRA_SOURCE = "github:acme-corp/skills";

/** Registry keys, kept apart from the refs above so an assertion cannot match the wrong one. */
const MARKETPLACE_NAME = "agents-inc";
const OTHER_MARKETPLACE_NAME = "custom-source";

/** Shares no substring with the default name, so neither paired assertion fakes the other. */
const WHITE_LABEL_NAME = "Northwind";

/** Reads, and does not parse: an unclosed flow sequence. */
const UNPARSEABLE_METADATA = "displayName: [unclosed\n";

/** `skills` takes fixture ids too: the config is written to disk, so no cast is needed. */
async function createProjectConfig(
  projectDir: string,
  {
    marketplace = TEST_SOURCE,
    extraSources,
    ...fields
  }: {
    marketplace?: string;
    name?: string;
    marketplaceName?: string;
    extraSources?: Array<{ name: string; url: string }>;
    agents?: AgentScopeConfig[];
    skills?: FixtureSkillConfig[];
    branding?: BrandingConfig;
  } = {},
): Promise<string> {
  return writeTestTsConfig(
    projectDir,
    buildSourceConfig({
      marketplace,
      ...fields,
      ...(extraSources !== undefined && { sources: extraSources }),
    }),
  );
}

/** A plugin dir with the full discovery chain: settings.json, home registry, and manifest. */
async function createPluginDir(projectDir: string, fakeHome: string): Promise<string> {
  const pluginDir = path.join(projectDir, PLUGIN_SUBPATH);
  await mkdir(pluginDir, { recursive: true });

  await writeTestPluginManifest(
    pluginDir,
    { name: TEST_PLUGIN_NAME, version: "1.0.0" },
    { pretty: false },
  );

  const settingsPath = path.join(projectDir, CLAUDE_DIR, "settings.json");
  await writeFile(settingsPath, JSON.stringify({ enabledPlugins: { [TEST_PLUGIN_NAME]: true } }));

  // Real paths: process.cwd() resolves symlinks (/var -> /private/var on macOS).
  const realProjectDir = fs.realpathSync(projectDir);
  const realPluginDir = path.join(realProjectDir, PLUGIN_SUBPATH);

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

/** The copy's metadata.yaml names it as its source did, unless `recorded` says otherwise. */
async function createCLISkill(
  skillsDir: string,
  skillId: SkillId,
  source = TEST_SOURCE,
  recorded: { displayName?: string } = {},
): Promise<string> {
  return writeTestSkill(skillsDir, skillId, {
    extraMetadata: {
      ...recorded,
      forkedFrom: {
        skillId,
        contentHash: "abc1234",
        date: "2026-01-01",
        source,
      },
    },
  });
}

async function createUserSkill(skillsDir: string, skillId: SkillId): Promise<string> {
  return writeTestSkill(skillsDir, skillId, {
    extraMetadata: { displayName: skillId },
  });
}

async function createSkillWithoutMetadata(skillsDir: string, skillId: SkillId): Promise<string> {
  return writeTestSkill(skillsDir, skillId, {
    skipMetadata: true,
  });
}

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

async function createUserSettings(claudeDir: string): Promise<string> {
  const settingsPath = path.join(claudeDir, "settings.json");
  await writeFile(settingsPath, JSON.stringify({ userPreference: "dark-mode" }));
  return settingsPath;
}

async function createUserClaudeMd(claudeDir: string): Promise<string> {
  const claudeMdPath = path.join(claudeDir, STANDARD_FILES.CLAUDE_MD);
  await writeFile(claudeMdPath, "# Project Instructions\n\nUser project rules.");
  return claudeMdPath;
}

async function createProjectSkillsDir(projectDir: string): Promise<string> {
  const skillsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
  await mkdir(skillsDir, { recursive: true });
  return skillsDir;
}

/** `compiled` stamps the provenance marker, the CLI's only claim once the config is gone. */
async function createAgentFile(
  projectDir: string,
  agentName: string,
  options: { compiled: boolean },
): Promise<string> {
  const agentsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
  await mkdir(agentsDir, { recursive: true });

  const rendered = renderAgentMd(agentName);
  const content = options.compiled ? stampProvenanceMarker(rendered) : rendered;

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
      expect(output).not.toContain("Skipping");
    });

    /** Paired with the default below: either alone passes on a hardcoded or never-wired line. */
    it("should name the configured branding in what it prints", async () => {
      await createProjectConfig(projectDir, { branding: { name: WHITE_LABEL_NAME } });
      const skillsDir = await createProjectSkillsDir(projectDir);
      await createUserSkill(skillsDir, "web-tooling-custom" as SkillId);

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      const output = stdout + stderr;
      expect(stdout).toContain(`${WHITE_LABEL_NAME} has been uninstalled.`);
      expect(output, "the configured name replaces the shipped one").not.toContain(
        DEFAULT_BRANDING.NAME,
      );
    });

    it("should name the shipped branding in what it prints when none is configured", async () => {
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);
      await createUserSkill(skillsDir, "web-tooling-custom" as SkillId);

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      const output = stdout + stderr;
      expect(stdout).toContain("Agents Inc. has been uninstalled.");
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
      expect(output).not.toContain("Skipping");
    });

    it("should remove CLI skills and skip user skills in mixed scenario", async () => {
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);

      const cliSkillDir = await createCLISkill(skillsDir, "web-framework-react");
      const userSkillDir = await createUserSkill(skillsDir, "web-tooling-custom" as SkillId);

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      const output = stdout + stderr;

      expect(await directoryExists(cliSkillDir)).toBe(false);
      expect(output).toContain("Removed 1 CLI-installed skill");

      expect(await directoryExists(userSkillDir)).toBe(true);
      expect(output).not.toContain("Skipping");
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

      const primarySkillDir = await createCLISkill(skillsDir, "web-framework-react", TEST_SOURCE);
      const extraSkillDir = await createCLISkill(
        skillsDir,
        "web-tooling-acme" as SkillId,
        TEST_EXTRA_SOURCE,
      );
      const userSkillDir = await createUserSkill(skillsDir, "web-tooling-personal" as SkillId);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(primarySkillDir)).toBe(false);
      expect(await directoryExists(extraSkillDir)).toBe(false);
      expect(await directoryExists(userSkillDir)).toBe(true);
      expect(stdout).toContain("Removed 2 CLI-installed skills");
    });

    it("removes a skill whose forkedFrom names no source when a config exists", async () => {
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);

      const legacySkillDir = await writeTestSkill(skillsDir, "web-framework-vue-composition-api", {
        extraMetadata: {
          displayName: "web-framework-vue-composition-api",
          forkedFrom: {
            skillId: "web-framework-vue-composition-api",
            contentHash: "def5678",
            date: "2026-01-01",
          },
        },
      });

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

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
      // Control for the config-less case below: a config naming the agents makes them deletable.
      expect(stdout).toContain(removedRow("web-developer"));
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

      // Without a config nothing says which agent files this CLI compiled, so all are kept.
      expect(output).not.toContain(removedRow("my-custom-agent"));

      // With nothing to remove, neither the panel nor the success line may print.
      expect(output).not.toContain(PLAN_PANEL);
      expect(output).toContain(NOTHING_TO_UNINSTALL);
      expect(output).not.toContain(UNINSTALL_COMPLETE);
    });

    it("should name the kept agents beside the removals it can still promise", async () => {
      const skillsDir = await createProjectSkillsDir(projectDir);
      const cliSkillDir = await createCLISkill(skillsDir, "web-framework-react");

      // No marker, so neither is this CLI's, including the one named like a built-in agent.
      const builtInNamed = await createAgentFile(projectDir, AGENT_DEFS.webDev.name, {
        compiled: false,
      });
      const userNamed = await createAgentFile(projectDir, "my-custom-agent", { compiled: false });
      const builtInNamedBefore = await readFile(builtInNamed, "utf-8");
      const userNamedBefore = await readFile(userNamed, "utf-8");

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);
      const output = stdout + stderr;

      // Positive subject guard: skills carry their own provenance, so a plan is printed.
      expect(output).toContain(PLAN_PANEL);
      expect(output).toContain(removedRow("React ⏏"));
      expect(output).not.toContain(removedRow(AGENT_DEFS.webDev.name));
      expect(output).not.toContain(removedRow("my-custom-agent"));
      expect(output).toContain(PLAN_AGENTS_KEPT_TWO);
      expect(output).toContain(PLAN_AGENTS_KEPT_REASON);

      // What the plan promised is gone; what it kept is byte-identical.
      expect(await directoryExists(cliSkillDir)).toBe(false);
      expect(await readFile(builtInNamed, "utf-8")).toBe(builtInNamedBefore);
      expect(await readFile(userNamed, "utf-8")).toBe(userNamedBefore);
    });

    /** The marker tells this CLI's agents from the user's; the plan and summary say both. */
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

      expect(output).toContain(PLAN_PANEL);
      expect(output).toContain(removedRow(AGENT_DEFS.webDev.name));
      expect(output).not.toContain(removedRow(AGENT_DEFS.apiDev.name));
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

  describe("source-folder config manifest removal", () => {
    it("should remove the config manifest by default", async () => {
      await createProjectConfig(projectDir);
      const sourceFolder = sourceFolderInUse(projectDir, "claude").dir;

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      // The emptied provider folder goes, and so does the `.agents-inc/` parent.
      expect(await directoryExists(sourceFolder)).toBe(false);
      expect(await directoryExists(path.join(projectDir, ".agents-inc"))).toBe(false);
      expect(stdout).toContain("Removed .agents-inc/claude/");
      expect(stdout).toContain("Removed .agents-inc/");
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
        skills: buildSkillConfigs([TEST_PLUGIN_SKILL], { scope: "project", origin: "marketplace" }),
      });
      const pluginDir = await createPluginDir(projectDir, fakeHome);

      expect(await directoryExists(pluginDir)).toBe(true);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(pluginDir)).toBe(false);
      expect(stdout, NOTHING_REGISTERED_TO_COUNT).not.toContain(PLUGIN_COUNT_LINE);
    });

    it("should show the plugin it removes in the panel, as a skill with no local copy", async () => {
      await createProjectConfig(projectDir, {
        skills: buildSkillConfigs([TEST_PLUGIN_SKILL], { scope: "project", origin: "marketplace" }),
      });
      await createPluginDir(projectDir, fakeHome);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(stdout).toContain(PLAN_PANEL);
      expect(stdout).toContain(removedRow(TEST_PLUGIN_SKILL));
      expect(stdout).not.toContain(`${TEST_PLUGIN_SKILL} ⏏`);
    });

    it("should show uninstall complete message", async () => {
      await createProjectConfig(projectDir, {
        skills: buildSkillConfigs([TEST_PLUGIN_SKILL], { scope: "project", origin: "marketplace" }),
      });
      await createPluginDir(projectDir, fakeHome);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(stdout).toContain(`${DEFAULT_BRANDING.NAME} has been uninstalled`);
      expect(stdout).toContain("Uninstall complete");
    });
  });

  describe("re-scoped plugin handling", () => {
    it("should match plugin keys using marketplace fallback when skill source differs", async () => {
      // origin "re-scoped-source" vs marketplaceName "marketplace": only the fallback key matches.
      await createProjectConfig(projectDir, {
        marketplaceName: "marketplace",
        skills: buildSkillConfigs([TEST_PLUGIN_SKILL], {
          scope: "project",
          origin: "re-scoped-source",
        }),
      });
      const pluginDir = await createPluginDir(projectDir, fakeHome);

      expect(await directoryExists(pluginDir)).toBe(true);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(pluginDir)).toBe(false);
      expect(stdout, NOTHING_REGISTERED_TO_COUNT).not.toContain(PLUGIN_COUNT_LINE);
    });

    it("should uninstall project-scoped plugin that was re-scoped from global during init", async () => {
      // Originally global, re-scoped to project; the registry may hold a "user" entry.
      await createProjectConfig(projectDir, {
        marketplaceName: "marketplace",
        skills: buildSkillConfigs([TEST_PLUGIN_SKILL], {
          scope: "project",
          origin: "custom-source",
        }),
      });
      const pluginDir = await createPluginDir(projectDir, fakeHome);

      expect(await directoryExists(pluginDir)).toBe(true);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(pluginDir)).toBe(false);
      expect(stdout, NOTHING_REGISTERED_TO_COUNT).not.toContain(PLUGIN_COUNT_LINE);
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

      expect(await directoryExists(cliSkillDir)).toBe(false);

      expect(await directoryExists(userSkillDir)).toBe(true);
      expect(await fileExists(mcpPath)).toBe(true);
      expect(await fileExists(settingsPath)).toBe(true);
      expect(await fileExists(claudeMdPath)).toBe(true);

      expect(await directoryExists(claudeDir)).toBe(true);
    });
  });

  describe("combined plugin and local removal", () => {
    it("should remove both plugins and CLI-managed local artifacts", async () => {
      await createProjectConfig(projectDir, {
        skills: buildSkillConfigs([TEST_PLUGIN_SKILL], { scope: "project", origin: "marketplace" }),
      });
      const pluginDir = await createPluginDir(projectDir, fakeHome);
      const claudeDir = path.join(projectDir, CLAUDE_DIR);

      const skillsDir = path.join(claudeDir, STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
      const cliSkillDir = await createCLISkill(skillsDir, "web-framework-react");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(pluginDir)).toBe(false);
      expect(await directoryExists(cliSkillDir)).toBe(false);
      expect(stdout, NOTHING_REGISTERED_TO_COUNT).not.toContain(PLUGIN_COUNT_LINE);
      expect(stdout).toContain("Removed 1 CLI-installed skill");
    });

    it("should remove everything including the config manifest by default", async () => {
      await createProjectConfig(projectDir, {
        agents: buildAgentConfigs(["web-developer"]),
      });
      const claudeDir = path.join(projectDir, CLAUDE_DIR);
      const sourceFolder = sourceFolderInUse(projectDir, "claude").dir;

      const skillsDir = path.join(claudeDir, STANDARD_DIRS.SKILLS);
      await mkdir(skillsDir, { recursive: true });
      await createCLISkill(skillsDir, "web-framework-react");

      const agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "web-developer.md"), "# Agent");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(claudeDir)).toBe(false);
      expect(await directoryExists(sourceFolder)).toBe(false);
      expect(await directoryExists(path.join(projectDir, ".agents-inc"))).toBe(false);
      expect(stdout).toContain("Removed 1 CLI-installed skill");
      expect(stdout).toContain("Removed 1 compiled agent");
      expect(stdout).toContain("Removed .agents-inc/claude/");
      expect(stdout).toContain("Removed .agents-inc/");
      expect(stdout).toContain(`Removed ${CLAUDE_DIR}/`);
    });
  });

  describe("global scope handling", () => {
    it("should not remove global-scoped skills when only global skills exist", async () => {
      // Uninstall only looks at projectDir/.claude/skills/.
      await createProjectConfig(projectDir, {
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const globalSkillsDir = path.join(fakeHome, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      await mkdir(globalSkillsDir, { recursive: true });
      await createCLISkill(globalSkillsDir, "web-framework-react");

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(globalSkillsDir)).toBe(true);
      expect(await directoryExists(path.join(globalSkillsDir, "web-framework-react"))).toBe(true);

      // Only the config manifest is removed from the project directory.
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

      const projectSkillsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      await mkdir(projectSkillsDir, { recursive: true });
      const projectSkillDir = await createCLISkill(projectSkillsDir, "web-framework-react");

      const globalSkillsDir = path.join(fakeHome, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
      await mkdir(globalSkillsDir, { recursive: true });
      await createCLISkill(globalSkillsDir, "web-state-zustand");

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(await directoryExists(projectSkillDir)).toBe(false);
      expect(stdout).toContain("Removed 1 CLI-installed skill");

      expect(await directoryExists(path.join(globalSkillsDir, "web-state-zustand"))).toBe(true);
    });
  });

  describe("global uninstall", () => {
    // Global uninstall runs from the global dir; there is no --global flag.
    it("should remove global artifacts when run from global dir", async () => {
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

/** What a person reads from uninstall, word for word, and what the run left behind. */
describe("what uninstall says", () => {
  let tempDir: string;
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ tempDir, projectDir, fakeHome, cleanup } =
      await setupIsolatedHome("cc-uninstall-says-test-"));
    initializeMatrix(createMockMatrix(SKILLS.react, SKILLS.hono));
  });

  afterEach(async () => {
    await cleanup();
  });

  const HEADER = ["", "Agents Inc. Uninstall", ""];
  const ENDING = ["", "Agents Inc. has been uninstalled.", "", "✓ Uninstall complete!", "", ""];

  /** The panel at the width a headless run measures, written out so it cannot move with the product. */
  const PANEL_FRAME_TOP =
    "┌──────────────────────────────────────────────────────────────────────────────┐";
  const PANEL_HEADER_REST = [
    "│  Stack none                                                                  │",
    "│                                                                              │",
    "│  ──────────────────────────────────────────────────────────────────────────  │",
    "│                                                                              │",
  ];
  /** Removing no skill, it has none to name a marketplace for. */
  const PANEL_TOP = [
    PANEL_FRAME_TOP,
    "│  Marketplace Agents Inc                                                      │",
    ...PANEL_HEADER_REST,
  ];
  /** Every skill it removes is a copy, as `init` said of the same installation. */
  const PANEL_TOP_ALL_EJECTED = [
    PANEL_FRAME_TOP,
    "│  Marketplace All skills ejected                                              │",
    ...PANEL_HEADER_REST,
  ];
  const PANEL_COLUMNS_HEADING = [
    "│  Skills                                         │  Agents                    │",
    "│                                                 │                            │",
  ];
  const PANEL_BOTTOM =
    "└──────────────────────────────────────────────────────────────────────────────┘";
  const REMOVED_REACT_ALONE = [
    ...PANEL_COLUMNS_HEADING,
    "│   Project                                       │                            │",
    "│  - React ⏏                                      │                            │",
  ];
  const REMOVED_WEB_DEVELOPER_ALONE = [
    ...PANEL_COLUMNS_HEADING,
    "│                                                 │   Project                  │",
    "│                                                 │  - web-developer           │",
  ];

  /** A CLI skill and agent, a user's skill and agent beside them, and the config naming them. */
  async function installEjectedProject(): Promise<{ skillsDir: string; agentsDir: string }> {
    await createProjectConfig(projectDir, { agents: buildAgentConfigs(["web-developer"]) });
    const skillsDir = await createProjectSkillsDir(projectDir);
    await createCLISkill(skillsDir, "web-framework-react");
    await createUserSkill(skillsDir, "api-framework-hono");
    await createAgentFile(projectDir, "web-developer", { compiled: true });
    await createAgentFile(projectDir, "my-own", { compiled: false });
    return { skillsDir, agentsDir: path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS) };
  }

  it("shows the panel of what it removes, the config file it deletes and what it kept and why, then each removal and that it is done", async () => {
    const { agentsDir } = await installEjectedProject();
    const keptAgents = `Kept 1 agent in ${agentsDir}/ — no agents-inc marker, so this CLI did not compile it.`;

    const { stdout, stderr, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        ...PANEL_TOP_ALL_EJECTED,
        ...PANEL_COLUMNS_HEADING,
        "│   Project                                       │   Project                  │",
        "│  - React ⏏                                      │  - web-developer           │",
        PANEL_BOTTOM,
        `- ${path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
        "",
        keptAgents,
        "",
        "  Uninstalled skill 'web-framework-react'",
        "✓ Removed 1 CLI-installed skill",
        "  Uninstalled agent 'web-developer'",
        "✓ Removed 1 compiled agent",
        keptAgents,
        "✓ Removed .agents-inc/claude/",
        "✓ Removed .agents-inc/",
        "Kept .claude/ (contains user content)",
        ...ENDING,
      ].join("\n"),
    );
    expect(stderr).not.toContain("Skipping");
  });

  it("says there is nothing to uninstall, and that nothing changed", async () => {
    const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

    expect(stdout).toBe(
      [
        ...HEADER,
        "",
        "Agents Inc. is not installed in this project.",
        "",
        "No changes made.",
        "",
      ].join("\n"),
    );
    expect(flattenCliOutput(stderr)).toBe("Warning: Nothing to uninstall.");
  });

  it("counts several removals in the plural", async () => {
    await createProjectConfig(projectDir, {
      agents: buildAgentConfigs(["web-developer", "api-developer"]),
    });
    const skillsDir = await createProjectSkillsDir(projectDir);
    await createCLISkill(skillsDir, "web-framework-react");
    await createCLISkill(skillsDir, "api-framework-hono");
    await createAgentFile(projectDir, "web-developer", { compiled: true });
    await createAgentFile(projectDir, "api-developer", { compiled: true });

    const { stdout } = await runCliCommand(["uninstall", "--yes"]);

    expect(stdout).toContain("✓ Removed 2 CLI-installed skills\n");
    expect(stdout).toContain("✓ Removed 2 compiled agents\n");
    expect(stdout).toContain("✓ Removed .claude/\n");
  });

  it("removes a compiled agent the config no longer names, with the ones it names", async () => {
    await createProjectConfig(projectDir, {
      agents: [
        ...buildAgentConfigs(["web-developer"]),
        ...buildAgentConfigs(["api-developer"], { excluded: true }),
      ],
    });
    await createAgentFile(projectDir, "web-developer", { compiled: true });
    const excludedFile = await createAgentFile(projectDir, "api-developer", { compiled: true });

    const { stdout } = await runCliCommand(["uninstall", "--yes"]);

    expect(stdout).toContain("✓ Removed 2 compiled agents\n");
    expect(await fileExists(excludedFile)).toBe(false);
  });

  /** One line per removal, in the order the folder lists them, so each is pinned on its own. */
  it("removes a compiled agent the config never mentions, naming it beside the one the config names", async () => {
    await createProjectConfig(projectDir, { agents: buildAgentConfigs(["web-developer"]) });
    const namedFile = await createAgentFile(projectDir, "web-developer", { compiled: true });
    const unmentionedFile = await createAgentFile(projectDir, "api-developer", { compiled: true });

    const { stdout, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stdout).toContain("\n  Uninstalled agent 'api-developer'\n");
    expect(stdout).toContain("\n  Uninstalled agent 'web-developer'\n");
    expect(stdout).toContain("✓ Removed 2 compiled agents\n");
    expect(await fileExists(unmentionedFile)).toBe(false);
    expect(await fileExists(namedFile)).toBe(false);
  });

  it("says nothing of .claude/ when there was none", async () => {
    await createProjectConfig(projectDir, { agents: buildAgentConfigs(["web-developer"]) });

    const { stdout } = await runCliCommand(["uninstall", "--yes"]);

    expect(stdout).not.toContain(".claude/");
  });

  it("keeps the source folder that holds a file of the user's, saying it removed only the config", async () => {
    await createProjectConfig(projectDir, { agents: buildAgentConfigs(["web-developer"]) });
    const sourceFolder = sourceFolderInUse(projectDir, "claude").dir;
    await writeFile(path.join(sourceFolder, "notes.md"), "mine");

    const { stdout } = await runCliCommand(["uninstall", "--yes"]);

    expect(stdout).toContain("✓ Removed CLI config from .agents-inc/claude/\n");
    expect(stdout).not.toContain("✓ Removed .agents-inc/");
    expect(stdout).not.toContain("Kept .agents-inc/ (contains user content)");
  });

  it("keeps a source folder it holds no config in, saying it holds the user's content", async () => {
    await createAgentFile(projectDir, "web-developer", { compiled: true });
    const sourceFolder = sourceFolderInUse(projectDir, "claude").dir;
    await mkdir(sourceFolder, { recursive: true });
    await writeFile(path.join(sourceFolder, "notes.md"), "mine");

    const { stdout } = await runCliCommand(["uninstall", "--yes"]);

    expect(stdout).toContain("Kept .agents-inc/claude/ (contains user content)\n");
    expect(stdout).not.toContain("Removed CLI config from");
  });

  it("keeps .agents-inc/ when something of the user's sits beside the provider folder", async () => {
    await createProjectConfig(projectDir, { agents: buildAgentConfigs(["web-developer"]) });
    await writeFile(path.join(projectDir, ".agents-inc", "notes.md"), "mine");

    const { stdout } = await runCliCommand(["uninstall", "--yes"]);

    expect(stdout).toContain(
      "✓ Removed .agents-inc/claude/\nKept .agents-inc/ (contains user content)\n",
    );
  });

  it("removes the skills it installed where there was no provider folder, keeping no folder it never had", async () => {
    const skillsDir = await createProjectSkillsDir(projectDir);
    await createCLISkill(skillsDir, "web-framework-react");

    const { stdout, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        ...PANEL_TOP_ALL_EJECTED,
        ...REMOVED_REACT_ALONE,
        PANEL_BOTTOM,
        "",
        "  Uninstalled skill 'web-framework-react'",
        "✓ Removed 1 CLI-installed skill",
        "✓ Removed .claude/",
        ...ENDING,
      ].join("\n"),
    );
  });

  /** The catalogue this CLI ships knows React by another name, so only the copy's own can match. */
  it("names each copy it removes as that copy's metadata.yaml records it", async () => {
    const skillsDir = await createProjectSkillsDir(projectDir);
    await createCLISkill(skillsDir, "web-framework-react", TEST_SOURCE, {
      displayName: "Acme React",
    });

    const { stdout, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        ...PANEL_TOP_ALL_EJECTED,
        ...PANEL_COLUMNS_HEADING,
        "│   Project                                       │                            │",
        "│  - Acme React ⏏                                 │                            │",
        PANEL_BOTTOM,
        "",
      ].join("\n"),
    );
  });

  it("keeps a skill and an agent it did not make, and claims to have removed neither", async () => {
    await createProjectConfig(projectDir, { agents: buildAgentConfigs(["web-developer"]) });
    const skillsDir = await createProjectSkillsDir(projectDir);
    await createUserSkill(skillsDir, "api-framework-hono");
    const agentsDir = path.dirname(
      await createAgentFile(projectDir, "my-own", { compiled: false }),
    );
    const keptAgent = `Kept 1 agent in ${agentsDir}/ — no agents-inc marker, so this CLI did not compile it.`;

    const { stdout, stderr, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        ...PANEL_TOP,
        PANEL_BOTTOM,
        `- ${path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
        "",
        keptAgent,
        "",
        keptAgent,
        "✓ Removed .agents-inc/claude/",
        "✓ Removed .agents-inc/",
        "Kept .claude/ (contains user content)",
        ...ENDING,
      ].join("\n"),
    );
    expect(stderr).not.toContain("Skipping");
  });

  it("names no agents folder in the plan when the agents the config names have no file there, and tidies the empty one away", async () => {
    await createProjectConfig(projectDir, { agents: buildAgentConfigs(["web-developer"]) });
    const agentsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
    await mkdir(agentsDir, { recursive: true });

    const { stdout, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        ...PANEL_TOP,
        PANEL_BOTTOM,
        `- ${path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
        "",
        "✓ Removed .agents-inc/claude/",
        "✓ Removed .agents-inc/",
        "✓ Removed .claude/",
        ...ENDING,
      ].join("\n"),
    );
    expect(await directoryExists(path.join(projectDir, CLAUDE_DIR))).toBe(false);
  });

  it("tidies an empty agents folder away with the skills, rather than keeping .claude/ for it", async () => {
    const skillsDir = await createProjectSkillsDir(projectDir);
    await createCLISkill(skillsDir, "web-framework-react");
    await mkdir(path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.AGENTS));

    const { stdout, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        ...PANEL_TOP_ALL_EJECTED,
        ...REMOVED_REACT_ALONE,
        PANEL_BOTTOM,
        "",
        "  Uninstalled skill 'web-framework-react'",
        "✓ Removed 1 CLI-installed skill",
        "✓ Removed .claude/",
        ...ENDING,
      ].join("\n"),
    );
    expect(await directoryExists(path.join(projectDir, CLAUDE_DIR))).toBe(false);
  });

  it("names no skills folder in the plan when there is no skill in it, and tidies the empty one away", async () => {
    await createProjectConfig(projectDir);
    await createProjectSkillsDir(projectDir);

    const { stdout, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        ...PANEL_TOP,
        PANEL_BOTTOM,
        `- ${path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
        "",
        "✓ Removed .agents-inc/claude/",
        "✓ Removed .agents-inc/",
        "✓ Removed .claude/",
        ...ENDING,
      ].join("\n"),
    );
    expect(await directoryExists(path.join(projectDir, CLAUDE_DIR))).toBe(false);
  });

  it("tidies an empty skills folder away with the agents, rather than keeping .claude/ for it", async () => {
    // The panel names the agent it removes; the folder it held is what the cleanup below judges.
    await createAgentFile(projectDir, "web-developer", { compiled: true });
    await createProjectSkillsDir(projectDir);

    const { stdout, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        ...PANEL_TOP,
        ...REMOVED_WEB_DEVELOPER_ALONE,
        PANEL_BOTTOM,
        "",
        "  Uninstalled agent 'web-developer'",
        "✓ Removed 1 compiled agent",
        "✓ Removed .claude/",
        ...ENDING,
      ].join("\n"),
    );
    expect(await directoryExists(path.join(projectDir, CLAUDE_DIR))).toBe(false);
  });

  /** The refusal beside "removes the skills it installed where there was no provider folder". */
  it("says there is nothing to uninstall when the only skill there is the user's, keeping it", async () => {
    const skillDir = await createUserSkill(
      await createProjectSkillsDir(projectDir),
      "api-framework-hono",
    );
    const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);
    const metadataBefore = await readFile(metadataPath, "utf-8");

    const { stdout, stderr, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        "",
        "Agents Inc. is not installed in this project.",
        "",
        "No changes made.",
        "",
      ].join("\n"),
    );
    expect(flattenCliOutput(stderr)).toBe("Warning: Nothing to uninstall.");
    expect(await readFile(metadataPath, "utf-8")).toBe(metadataBefore);
  });

  it("refuses without a terminal to confirm at, and removes nothing", async () => {
    const { skillsDir } = await installEjectedProject();

    const { error } = await runCliCommand(["uninstall"]);

    expect(error?.message).toBe(
      "Uninstalling removes files, so it has to be confirmed — and there is no terminal here to confirm it at.\nRun 'npx agents-inc uninstall' from a terminal, or 'npx agents-inc uninstall --yes' to remove it without being asked.",
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(await directoryExists(path.join(skillsDir, "web-framework-react"))).toBe(true);
  });

  describe("at a terminal", () => {
    const terminal = standAtTerminal();

    it("cancels on a no, removing nothing", async () => {
      const { skillsDir } = await installEjectedProject();

      const run = runCliCommand(["uninstall"]);
      await delay(RENDER_DELAY_MS);
      terminal.input.push("n");
      const { stdout, error } = await run;

      expect(stdout).toContain("\n\nUninstall cancelled\n");
      expect(error?.oclif?.exit).toBe(EXIT_CODES.CANCELLED);
      expect(await directoryExists(path.join(skillsDir, "web-framework-react"))).toBe(true);
    });

    it("removes on a yes", async () => {
      const { skillsDir } = await installEjectedProject();

      const run = runCliCommand(["uninstall"]);
      await delay(RENDER_DELAY_MS);
      terminal.input.push("y");
      const { stdout, error } = await run;

      expect(error).toBeUndefined();
      expect(stdout).toContain("✓ Uninstall complete!");
      expect(await directoryExists(path.join(skillsDir, "web-framework-react"))).toBe(false);
    });

    /** Silent on zero: a count of none beside a plan that named one reads as a failure. */
    it("counts no agent when the one its plan named was gone by the yes", async () => {
      const { agentsDir } = await installEjectedProject();
      const keptAgents = `Kept 1 agent in ${agentsDir}/ — no agents-inc marker, so this CLI did not compile it.`;

      const run = runCliCommand(["uninstall"]);
      // A prompt takes the terminal raw before it paints, and the plan is made before it asks.
      await vi.waitFor(() => expect(terminal.input.isRaw).toBe(true), PROMPT_OPEN_TIMEOUT);
      await rm(path.join(agentsDir, "web-developer.md"));
      terminal.input.push("y");
      const { stdout, error } = await run;

      expect(error).toBeUndefined();
      expect(stdout, "the plan has to name the agent for its absence to be the subject").toContain(
        removedRow("web-developer"),
      );
      expect(stdout).toContain(
        ["✓ Removed 1 CLI-installed skill", keptAgents, "✓ Removed .agents-inc/claude/"].join("\n"),
      );
    });
  });

  it("warns that it could not read the config, and uninstalls what it can still identify", async () => {
    const configPath = await writeRawTestConfig(projectDir, renderUnparseableConfigTs());
    await createAgentFile(projectDir, "web-developer", { compiled: true });

    const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

    expect(compactCliOutput(stderr)).toContain(
      compactCliOutput(
        `Warning: Could not read the project config — plugins and compiled agents it lists may be left behind: Config at '${configPath}' could not be loaded`,
      ),
    );
    expect(stdout).toContain("✓ Removed 1 compiled agent\n");
  });

  it("warns that it could not update the global registry, and still completes", async () => {
    await createProjectConfig(projectDir, { agents: buildAgentConfigs(["web-developer"]) });
    await writeRawTestConfig(fakeHome, renderUnparseableConfigTs());

    const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

    expect(flattenCliOutput(stderr)).toContain(
      "Warning: Could not update the global project registry:",
    );
    expect(stdout).toContain("✓ Uninstall complete!");
  });

  // Root writes through the mode bits, so the failure under test cannot happen there.
  it.skipIf(process.getuid?.() === 0)(
    "says local files could not be removed, and why, when the file system refuses",
    async () => {
      const { skillsDir } = await installEjectedProject();
      await chmod(skillsDir, 0o555);
      try {
        const { stdout, error } = await runCliCommand(["uninstall", "--yes"]);

        expect(stdout).toContain("\nFailed to remove local files\n");
        expect(error?.message).toContain("EACCES");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      } finally {
        await chmod(skillsDir, 0o755);
      }
    },
  );

  /** The pair of the stop below: only a file that cannot be read stops the run. */
  it("keeps a skill whose metadata reads but does not parse as the user's, and removes the rest", async () => {
    const { skillsDir, agentsDir } = await installEjectedProject();
    const metadataPath = path.join(skillsDir, "api-framework-hono", STANDARD_FILES.METADATA_YAML);
    await writeFile(metadataPath, UNPARSEABLE_METADATA);

    const { stdout, stderr, error } = await runCliCommand(["uninstall", "--yes"]);

    expect(error).toBeUndefined();
    expect(stderr).toContain(`Warning: Invalid metadata.yaml at ${metadataPath}:`);
    expect(stdout).toContain("  Uninstalled skill 'web-framework-react'\n");
    expect(await directoryExists(path.join(skillsDir, "api-framework-hono"))).toBe(true);
    expect(await directoryExists(path.join(skillsDir, "web-framework-react"))).toBe(false);
    expect(await fileExists(path.join(agentsDir, "web-developer.md"))).toBe(false);
  });

  // Root reads through the mode bits, so the failure under test cannot happen there.
  it.skipIf(process.getuid?.() === 0)(
    "stops before the plan when it cannot read a skill's metadata, naming the file and the fix, and removes nothing",
    async () => {
      const { skillsDir, agentsDir } = await installEjectedProject();
      const metadataPath = path.join(skillsDir, "api-framework-hono", STANDARD_FILES.METADATA_YAML);
      const configPath = path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);
      await chmod(metadataPath, 0o000);
      try {
        const { stdout, error } = await runCliCommand(["uninstall", "--yes"]);

        expect(error?.message).toBe(
          `Cannot read ${metadataPath}, so uninstall cannot tell whether it made that skill. Fix the file's permissions, or move the skill out, and run uninstall again.`,
        );
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        expect(stdout).not.toContain(PLAN_PANEL);
        expect(await directoryExists(path.join(skillsDir, "web-framework-react"))).toBe(true);
        expect(await fileExists(path.join(agentsDir, "web-developer.md"))).toBe(true);
        expect(await fileExists(configPath)).toBe(true);
      } finally {
        await chmod(metadataPath, 0o644);
      }
    },
  );

  /**
   * A project is registered with its own provider's global only. Claude is the control, being also
   * the provider a home holding both would otherwise be read as.
   */
  describe("a project uninstall under a home holding a Claude and a Codex global installation", () => {
    it.each(PROVIDERS)(
      "takes the %s project off its own provider's global and leaves the other global alone",
      async (provider) => {
        const project = fs.realpathSync(projectDir);
        await mkdir(path.join(tempDir, "neighbour"), { recursive: true });
        const neighbour = fs.realpathSync(path.join(tempDir, "neighbour"));
        const projectConfigPath = await writeTestTsConfig(
          projectDir,
          buildProjectConfig({ name: "registered" }),
          sourceFolderInUse(projectDir, provider).relName,
        );
        for (const atHome of PROVIDERS) {
          await writeTestTsConfig(
            fakeHome,
            buildProjectConfig({
              name: `${atHome}-global`,
              skills: [],
              agents: [],
              projects: atHome === provider ? [project, neighbour] : [neighbour],
            }),
            sourceFolderInUse(fakeHome, atHome).relName,
          );
        }

        const { stdout, stderr, error } = await runCliCommand(["uninstall", "--yes"]);

        expect(error, stderr).toBeUndefined();
        expect(stdout).toContain("✓ Uninstall complete!\n");
        expect(await fileExists(projectConfigPath)).toBe(false);
        for (const atHome of PROVIDERS) {
          const loaded = await loadProjectConfigFromDir(fakeHome, atHome);
          expect(
            loaded?.config.projects,
            `the ${atHome} global's registered projects`,
          ).toStrictEqual([neighbour]);
        }
      },
    );
  });

  describe("a global uninstall with projects registered against it", () => {
    it("updates each registered project it can reach, and names each it cannot", async () => {
      const gone = path.join(tempDir, "gone");
      const codexProject = path.join(tempDir, "codex-project");
      await mkdir(codexProject, { recursive: true });
      await writeTestTsConfig(
        codexProject,
        buildProjectConfig({ name: "codex" }),
        ".agents-inc/codex",
      );
      await writeTestTsConfig(projectDir, buildProjectConfig({ name: "registered" }));
      await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          name: "global",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          projects: [gone, codexProject, projectDir],
        }),
      );
      process.chdir(fakeHome);

      const { stdout, stderr, error } = await runCliCommand(["uninstall", "--yes"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        "✓ Updated 1 registered project\nRegistered projects: 1 recompiled\n",
      );
      expect(compactCliOutput(stderr)).toContain(
        compactCliOutput(
          [
            `Warning: Skipped ${gone}: nothing is installed there any more.`,
            `Warning: Skipped ${codexProject}: it is another provider's installation.`,
          ].join(""),
        ),
      );
    });

    it("names a registered project whose config it cannot read, and claims no update", async () => {
      const unreadable = path.join(tempDir, "unreadable-project");
      await writeRawTestConfig(unreadable, renderUnparseableConfigTs());
      await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          name: "global",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          projects: [unreadable],
        }),
      );
      process.chdir(fakeHome);

      const { stdout, stderr, error } = await runCliCommand(["uninstall", "--yes"]);

      expect(error).toBeUndefined();
      expect(compactCliOutput(stderr)).toBe(
        compactCliOutput(
          `Warning: Could not update registered project at ${unreadable} — its config may still reference the uninstalled global content`,
        ),
      );
      expect(stdout).not.toContain("Updated");
    });

    it("warns that it could not update the registered projects when their catalogue cannot load, and still uninstalls", async () => {
      await writeTestTsConfig(projectDir, buildProjectConfig({ name: "registered" }));
      await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          name: "global",
          marketplace: path.join(tempDir, "no-such-marketplace"),
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          projects: [projectDir],
        }),
      );
      process.chdir(fakeHome);

      const { stdout, stderr, error } = await runCliCommand(["uninstall", "--yes"]);

      expect(error).toBeUndefined();
      expect(compactCliOutput(stderr)).toBe(
        compactCliOutput(
          `Warning: Could not update registered projects — their configs may still reference the uninstalled global content: Local marketplace not found: '${path.join(tempDir, "no-such-marketplace")}'`,
        ) +
          compactCliOutput(
            "Nothing is at that path, and a local marketplace must be a directory holding skills. Check it for a typo, or name a marketplace that exists: --marketplace github:agents-inc/skills",
          ),
      );
      expect(stdout).toContain("✓ Uninstall complete!");
    });

    it("warns that it could not update the registered projects when updating them fails, leaves them as they were, and still uninstalls", async () => {
      const projectConfigPath = await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ name: "registered" }),
      );
      const projectConfigBefore = await readFile(projectConfigPath, "utf-8");
      await writeRawTestConfig(
        fakeHome,
        renderConfigTsWithBigIntField(
          buildProjectConfig({
            name: "global",
            skills: [],
            agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
            projects: [projectDir],
          }),
          "note",
        ),
      );
      process.chdir(fakeHome);

      const { stdout, stderr, error } = await runCliCommand(["uninstall", "--yes"]);

      expect(error).toBeUndefined();
      expect(compactCliOutput(stderr)).toBe(
        compactCliOutput(
          "Warning: Could not update registered projects — their configs may still reference the uninstalled global content: Do not know how to serialize a BigInt",
        ),
      );
      expect(stdout).not.toContain("Updated");
      expect(stdout).toContain("✓ Uninstall complete!");
      expect(await readFile(projectConfigPath, "utf-8")).toBe(projectConfigBefore);
    });

    it("says nothing of registered projects when there are none", async () => {
      await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          name: "global",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        }),
      );
      process.chdir(fakeHome);

      const { stdout, stderr } = await runCliCommand(["uninstall", "--yes"]);

      expect(stdout).not.toContain("registered project");
      expect(stderr).not.toContain("registered project");
    });
  });
});

/**
 * Plugin removal goes through the host, mocked above for the source modules, so these run the
 * command from source rather than through `dist/`, which the module mock cannot reach.
 */
describe("what uninstall says of plugins", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-uninstall-plugins-test-"));
    initializeMatrix(createMockMatrix(SKILLS.react, SKILLS.hono));
  });

  afterEach(async () => {
    vi.mocked(hostAt(projectDir).listPlugins).mockResolvedValue([]);
    vi.mocked(hostAt(projectDir).uninstallPlugin).mockResolvedValue("removed");
    vi.mocked(hostAt(projectDir).isAvailable).mockResolvedValue(true);
    await cleanup();
  });

  /** A plugin directory per name, each listed by the host as enabled and on disk. */
  async function installPlugins(names: readonly string[]): Promise<string> {
    const pluginsDir = path.join(projectDir, CLAUDE_DIR, "plugins");
    const listed = [];
    for (const name of names) {
      const installPath = path.join(pluginsDir, name);
      await writeTestPluginManifest(installPath, { name, version: "1.0.0" }, { pretty: false });
      listed.push({ pluginKey: name, installPath, enabled: true });
    }
    vi.mocked(hostAt(projectDir).listPlugins).mockResolvedValue(listed);
    return pluginsDir;
  }

  async function runUninstall(): Promise<Awaited<ReturnType<typeof captureOutput>>> {
    const { default: Uninstall } = await import("../../../commands/uninstall");
    return captureOutput(() => Uninstall.run(["--yes"], { root: CLI_ROOT }), { print: false });
  }

  it("names each plugin the host removed, then counts them", async () => {
    await createProjectConfig(projectDir, {
      skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"], {
        scope: "project",
        origin: "marketplace",
      }),
    });
    await installPlugins(["web-framework-react@marketplace", "api-framework-hono@marketplace"]);

    const { stdout } = await runUninstall();

    expect(stdout).toContain(
      [
        "Uninstalling plugins...",
        "  Uninstalled plugin 'web-framework-react@marketplace'",
        "  Uninstalled plugin 'api-framework-hono@marketplace'",
        "✓ Uninstalled 2 plugins",
      ].join("\n"),
    );
  });

  it("counts one plugin in the singular", async () => {
    await createProjectConfig(projectDir, {
      skills: buildSkillConfigs(["web-framework-react"], {
        scope: "project",
        origin: "marketplace",
      }),
    });
    await installPlugins(["web-framework-react@marketplace"]);

    const { stdout } = await runUninstall();

    expect(stdout).toContain(
      "Uninstalling plugins...\n  Uninstalled plugin 'web-framework-react@marketplace'\n✓ Uninstalled 1 plugin\n",
    );
  });

  /** Named, so the config's own defaulting warnings leave the removal's alone on stderr. */
  async function configureTwoPlugins(): Promise<string> {
    await createProjectConfig(projectDir, {
      name: "two-plugins",
      skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"], {
        scope: "project",
        origin: "marketplace",
      }),
    });
    return installPlugins(["web-framework-react@marketplace", "api-framework-hono@marketplace"]);
  }

  it("says it could not unregister each plugin when the host's CLI is missing, and still removes its folder", async () => {
    const pluginsDir = await configureTwoPlugins();
    vi.mocked(hostAt(projectDir).isAvailable).mockResolvedValue(false);
    const uninstallPlugin = vi.mocked(hostAt(projectDir).uninstallPlugin);
    uninstallPlugin.mockClear();

    const { stdout, stderr, error } = await runUninstall();

    expect(flattenCliOutput(stderr)).toBe(
      [
        "Warning: Could not unregister plugin 'web-framework-react@marketplace': Claude CLI not found, so it stays registered. Install Claude Code first: https://claude.ai/code",
        "Warning: Could not unregister plugin 'api-framework-hono@marketplace': Claude CLI not found, so it stays registered. Install Claude Code first: https://claude.ai/code",
      ].join(" "),
    );
    expect(error).toBeUndefined();
    expect(uninstallPlugin).not.toHaveBeenCalled();
    expect(
      stdout,
      "with no host to ask, no removal was observed, so none is named or counted",
    ).toContain("Uninstalling plugins...\n✓ Removed .agents-inc/claude/\n");
    expect(await directoryExists(path.join(pluginsDir, "web-framework-react@marketplace"))).toBe(
      false,
    );
    expect(await directoryExists(path.join(pluginsDir, "api-framework-hono@marketplace"))).toBe(
      false,
    );
  });

  /** The pair of the above: a warning printed on every run fails here. */
  it("says nothing about unregistering when the host removed the plugins", async () => {
    await configureTwoPlugins();

    const { stdout, stderr } = await runUninstall();

    expect(stderr).not.toContain("Could not unregister");
    expect(stdout).toContain("✓ Uninstalled 2 plugins\n");
  });

  it("prints no count when the host removed none of them", async () => {
    await createProjectConfig(projectDir, {
      skills: buildSkillConfigs(["web-framework-react"], {
        scope: "project",
        origin: "marketplace",
      }),
    });
    await installPlugins(["web-framework-react@marketplace"]);
    vi.mocked(hostAt(projectDir).uninstallPlugin).mockResolvedValue("absent");

    const { stdout } = await runUninstall();

    expect(stdout).toContain("Uninstalling plugins...\n✓ Removed .agents-inc/claude/\n");
  });

  it("leaves a plugin the config does not name, or names only as excluded, alone", async () => {
    await createProjectConfig(projectDir, {
      skills: [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "marketplace" }),
        ...buildSkillConfigs(["api-framework-hono"], {
          scope: "project",
          origin: "marketplace",
          excluded: true,
        }),
      ],
    });
    const pluginsDir = await installPlugins([
      "web-framework-react@marketplace",
      "api-framework-hono@marketplace",
      "someone-elses@marketplace",
    ]);

    const { stdout } = await runUninstall();

    expect(stdout).toContain(removedRow("React"));
    expect(stdout).not.toContain(removedRow("Hono"));
    expect(stdout).not.toContain("someone-elses");
    expect(await directoryExists(path.join(pluginsDir, "api-framework-hono@marketplace"))).toBe(
      true,
    );
    expect(await directoryExists(path.join(pluginsDir, "someone-elses@marketplace"))).toBe(true);
  });

  describe("on a host that shares plugins machine-wide", () => {
    beforeEach(() => {
      Object.assign(hostAt(projectDir), { installsProjectScopedPlugins: false });
    });

    afterEach(() => {
      Object.assign(hostAt(projectDir), { installsProjectScopedPlugins: true });
    });

    it("leaves the plugins alone when uninstalling a project", async () => {
      await createProjectConfig(projectDir, {
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "marketplace",
        }),
      });
      const pluginsDir = await installPlugins(["web-framework-react@marketplace"]);

      const { stdout } = await runUninstall();

      expect(stdout).toContain("│  • React ");
      expect(stdout).not.toContain(removedRow("React"));
      expect(await directoryExists(path.join(pluginsDir, "web-framework-react@marketplace"))).toBe(
        true,
      );
    });

    it("removes them when uninstalling the global installation", async () => {
      await createProjectConfig(fakeHome, {
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "marketplace",
        }),
      });
      process.chdir(fakeHome);
      projectDir = fakeHome;
      await installPlugins(["web-framework-react@marketplace"]);

      const { stdout } = await runUninstall();

      expect(stdout).toContain("│   Global ");
      expect(stdout).toContain(removedRow("React"));
    });
  });

  describe("on a Codex installation", () => {
    beforeEach(() => {
      Object.assign(hostAt(projectDir), { provider: "codex", installsProjectScopedPlugins: false });
    });

    afterEach(() => {
      Object.assign(hostAt(projectDir), { provider: "claude", installsProjectScopedPlugins: true });
    });

    /** The global installation: Codex shares plugins machine-wide, so only it plans one. */
    it("names Codex's CLI, and how to put it on PATH, when it cannot unregister a plugin", async () => {
      await writeTestTsConfig(
        fakeHome,
        buildSourceConfig({
          marketplace: TEST_SOURCE,
          name: "codex-global",
          skills: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "marketplace",
          }),
        }),
        sourceFolderInUse(fakeHome, "codex").relName,
      );
      process.chdir(fakeHome);
      projectDir = fakeHome;
      await installPlugins(["web-framework-react@marketplace"]);
      vi.mocked(hostAt(projectDir).isAvailable).mockResolvedValue(false);

      const { stderr, error } = await runUninstall();

      expect(flattenCliOutput(stderr)).toBe(
        "Warning: Could not unregister plugin 'web-framework-react@marketplace': Codex CLI not found, so it stays registered. Install the '@openai/codex' package first, so that 'codex' is on PATH",
      );
      expect(error).toBeUndefined();
    });
  });

  // Root writes through the mode bits, so the failure under test cannot happen there.
  it.skipIf(process.getuid?.() === 0)(
    "says the plugin uninstall failed, and why, when a plugin's folder cannot be removed",
    async () => {
      await createProjectConfig(projectDir, {
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: "marketplace",
        }),
      });
      const pluginsDir = await installPlugins(["web-framework-react@marketplace"]);
      await chmod(pluginsDir, 0o555);
      try {
        const { stdout, error } = await runUninstall();

        expect(stdout).toContain("Uninstalling plugins...\nPlugin uninstall failed\n");
        expect(error?.message).toContain("EACCES");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      } finally {
        await chmod(pluginsDir, 0o755);
      }
    },
  );

  /**
   * The registry key is the marketplace's NAME: the ref would spell a URL and match nothing, and an
   * ejected skill's namesake plugin is someone else's.
   */
  it("removes a plugin filed under its own origin or the marketplace's name, leaving a saved copy's namesake alone", async () => {
    await createProjectConfig(projectDir, {
      marketplace: TEST_SOURCE_URL,
      marketplaceName: MARKETPLACE_NAME,
      skills: [
        ...buildSkillConfigs(["web-framework-react"], {
          scope: "project",
          origin: OTHER_MARKETPLACE_NAME,
        }),
        ...buildSkillConfigs(["api-framework-hono"], {
          scope: "project",
          origin: MARKETPLACE_NAME,
        }),
        ...buildSkillConfigs(["web-state-zustand"], { scope: "project", origin: EJECT_SOURCE }),
      ],
    });
    const pluginsDir = await installPlugins([
      `web-framework-react@${OTHER_MARKETPLACE_NAME}`,
      `web-framework-react@${MARKETPLACE_NAME}`,
      `api-framework-hono@${MARKETPLACE_NAME}`,
      `web-state-zustand@${MARKETPLACE_NAME}`,
    ]);

    const { stdout } = await runUninstall();

    expect(stdout).toContain(removedRow("React"));
    expect(stdout).toContain(removedRow("Hono"));
    expect(stdout).not.toContain(removedRow("Zustand"));
    expect(stdout).toContain(
      [
        "Uninstalling plugins...",
        `  Uninstalled plugin 'web-framework-react@${OTHER_MARKETPLACE_NAME}'`,
        `  Uninstalled plugin 'web-framework-react@${MARKETPLACE_NAME}'`,
        `  Uninstalled plugin 'api-framework-hono@${MARKETPLACE_NAME}'`,
        "✓ Uninstalled 3 plugins",
      ].join("\n"),
    );
    expect(
      await directoryExists(path.join(pluginsDir, `web-state-zustand@${MARKETPLACE_NAME}`)),
    ).toBe(true);
  });

  describe("the scopes a plugin is swept at", () => {
    /** A re-scoped plugin is filed under its install scope, so every scope is swept. */
    async function sweptScopes(
      skills: FixtureSkillConfig[],
      names: string[],
    ): Promise<Array<[string, string, string]>> {
      await createProjectConfig(projectDir, { skills });
      await installPlugins(names);
      const uninstallPlugin = vi.mocked(hostAt(projectDir).uninstallPlugin);
      uninstallPlugin.mockClear();

      await runUninstall();

      return uninstallPlugin.mock.calls.map(([ref, scope, dir]) => [ref, scope, dir]);
    }

    it("sweeps each plugin at its own skill's scope first", async () => {
      const swept = await sweptScopes(
        [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "marketplace" }),
          ...buildSkillConfigs(["api-framework-hono"], { scope: "project", origin: "marketplace" }),
        ],
        ["web-framework-react@marketplace", "api-framework-hono@marketplace"],
      );

      expect(
        swept,
        "one scope alone leaves a re-scoped plugin registered, and the wrong scope first removes the one the config does not name",
      ).toStrictEqual([
        ["web-framework-react@marketplace", "global", projectDir],
        ["web-framework-react@marketplace", "project", projectDir],
        ["api-framework-hono@marketplace", "project", projectDir],
        ["api-framework-hono@marketplace", "global", projectDir],
      ]);
    });

    it("sweeps only the plugin scopes the host offers, when the skill's own is not one", async () => {
      const host = hostAt(projectDir);
      const offered = host.offeredPlacements;
      Object.assign(host, {
        offeredPlacements: [
          { mode: "plugin", scope: "global" },
          { mode: "eject", scope: "global" },
          { mode: "eject", scope: "project" },
        ],
      });
      try {
        const swept = await sweptScopes(
          buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "marketplace" }),
          ["web-framework-react@marketplace"],
        );

        expect(swept).toStrictEqual([["web-framework-react@marketplace", "global", projectDir]]);
      } finally {
        Object.assign(host, { offeredPlacements: offered });
      }
    });
  });
});
