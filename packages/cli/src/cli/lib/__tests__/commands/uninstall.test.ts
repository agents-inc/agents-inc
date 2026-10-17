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
import {
  buildAgentConfigs,
  buildProjectConfig,
  buildSourceConfig,
} from "../factories/config-factories.js";
import { buildSkillConfigs, type FixtureSkillConfig } from "../helpers/skill-config-builders.js";
import { SKILLS } from "../test-fixtures";
import { AGENT_DEFS } from "../mock-data/mock-agents.js";
import { initializeMatrix } from "../../matrix/matrix-provider";
import { DEFAULT_BRANDING, STANDARD_FILES, STANDARD_DIRS, CLAUDE_DIR } from "../../../consts";
import { sourceFolderInUse } from "../../installation/install-layout.js";
import type { AgentScopeConfig, BrandingConfig, ProjectConfig, SkillId } from "../../../types";
import { getCliInstalledPluginKeys } from "../../../commands/uninstall";
import { hostAt } from "../../hosts/host-for.js";
import { stampProvenanceMarker } from "../../agents/agent-provenance.js";
import { renderAgentMd } from "../content-generators.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { firstElement } from "../helpers/element-at.js";

vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

/** Written out, not imported, so an assertion on user-facing text cannot move with it. */
const PLAN_AGENTS_ITEM = "(CLI-compiled)";
const PLAN_CLI_MANAGED_SECTION = "CLI-managed files:";
const PLAN_AGENTS_KEPT_ONE = "Kept 1 agent in";
const PLAN_AGENTS_KEPT_TWO = "Kept 2 agents in";
const PLAN_AGENTS_KEPT_REASON = "no agents-inc marker";

/** Whether the run has a removal to make at all; written out for the same reason. */
const PLAN_PREVIEW_HEADING = "The following will be removed:";
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

/** `uninstallPlugins` takes a catalogue-typed config, so the fixture skill would need a cast. */
const CATALOGUE_PLUGIN_SKILL = "web-framework-react" satisfies SkillId;
const CATALOGUE_PLUGIN_NAME = `${CATALOGUE_PLUGIN_SKILL}@marketplace`;

/** Shares no substring with the default name, so neither paired assertion fakes the other. */
const WHITE_LABEL_NAME = "Northwind";

/** The preserved-directory warning, minus the name of the tool it says did not create it. */
function notCreatedBy(brandingName: string): string {
  return `not created by ${brandingName} CLI`;
}

/** `skills` takes fixture ids too: the config is written to disk, so no cast is needed. */
async function createProjectConfig(
  projectDir: string,
  {
    marketplace = TEST_SOURCE,
    extraSources,
    ...fields
  }: {
    marketplace?: string;
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
      expect(output).toContain("Skipping 'web-tooling-custom'");
      expect(output).toContain("not created by");
    });

    /** Paired with the default below: either alone passes on a hardcoded or never-wired line. */
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

      expect(await directoryExists(cliSkillDir)).toBe(false);
      expect(output).toContain("Removed 1 CLI-installed skill");

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

    it("should handle legacy skills without source field in forkedFrom when config exists", async () => {
      await createProjectConfig(projectDir);
      const skillsDir = await createProjectSkillsDir(projectDir);

      const legacySkillDir = await writeTestSkill(skillsDir, "web-framework-vue-composition-api", {
        extraMetadata: {
          displayName: "web-framework-vue-composition-api",
          forkedFrom: {
            skillId: "web-framework-vue-composition-api",
            contentHash: "def5678",
            date: "2026-01-01",
            // No source field (legacy).
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

      // Without a config nothing says which agent files this CLI compiled, so all are kept.
      expect(output).not.toContain(PLAN_AGENTS_ITEM);
      expect(output).not.toContain(PLAN_CLI_MANAGED_SECTION);

      // With nothing to remove, neither the heading nor the success line may print.
      expect(output).not.toContain(PLAN_PREVIEW_HEADING);
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
      expect(output).toContain(PLAN_PREVIEW_HEADING);
      expect(output).toContain(PLAN_CLI_MANAGED_SECTION);
      expect(output).not.toContain(PLAN_AGENTS_ITEM);
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

    it("should show what will be removed", async () => {
      await createProjectConfig(projectDir, {
        skills: buildSkillConfigs([TEST_PLUGIN_SKILL], { scope: "project", origin: "marketplace" }),
      });
      await createPluginDir(projectDir, fakeHome);

      const { stdout } = await runCliCommand(["uninstall", "--yes"]);

      expect(stdout).toContain("The following will be removed");
      expect(stdout).toContain("Plugins:");
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

      expect(keys.has("web-framework-react@custom-source")).toBe(true);
      expect(keys.has("web-state-zustand@eject")).toBe(true);
      expect(keys.has("api-framework-hono@agents-inc")).toBe(true);

      expect(keys.has("web-framework-react@agents-inc")).toBe(true);

      expect(keys.has("web-state-zustand@agents-inc")).toBe(false);

      // No duplicate when the origin already matches the marketplace name.
      expect(keys.size).toBe(4);
    });

    /** The registry key uses the marketplace name; the ref would spell a URL and match nothing. */
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
      const uninstallPlugin = vi.mocked(hostAt(projectDir).uninstallPlugin);
      uninstallPlugin.mockClear();

      const { uninstallPlugins: uninstallPluginsFn } = await import("../../../commands/uninstall");

      const pluginsDir = path.join(projectDir, CLAUDE_DIR, "plugins");
      await mkdir(pluginsDir, { recursive: true });
      const pluginPath = path.join(pluginsDir, CATALOGUE_PLUGIN_NAME);
      await mkdir(pluginPath, { recursive: true });

      const config = buildProjectConfig({
        skills: buildSkillConfigs([CATALOGUE_PLUGIN_SKILL], {
          scope: "project",
          origin: "marketplace",
        }),
      });

      const result = await uninstallPluginsFn(
        { kind: "plugins", pluginsDir, names: [CATALOGUE_PLUGIN_NAME] },
        config,
        projectDir,
      );

      expect(result.totalUninstalled).toBe(1);

      // A re-scoped plugin is filed under its install scope, so every scope is swept.
      expect(
        uninstallPlugin.mock.calls.map(([ref, scope, dir]) => [ref, scope, dir]),
        "one scope alone leaves a re-scoped plugin registered, and the wrong scope first removes the one the config does not name",
      ).toStrictEqual([
        [CATALOGUE_PLUGIN_NAME, "project", projectDir],
        [CATALOGUE_PLUGIN_NAME, "global", projectDir],
      ]);
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

    it("should uninstall global-scoped plugin that was re-scoped from project during edit", async () => {
      // Originally project, re-scoped to global; the registry may hold a "project" entry.
      const uninstallPlugin = vi.mocked(hostAt(projectDir).uninstallPlugin);
      uninstallPlugin.mockClear();

      const { uninstallPlugins: uninstallPluginsFn } = await import("../../../commands/uninstall");

      const pluginsDir = path.join(projectDir, CLAUDE_DIR, "plugins");
      await mkdir(pluginsDir, { recursive: true });
      const pluginPath = path.join(pluginsDir, CATALOGUE_PLUGIN_NAME);
      await mkdir(pluginPath, { recursive: true });

      const config = buildProjectConfig({
        skills: buildSkillConfigs([CATALOGUE_PLUGIN_SKILL], {
          scope: "global",
          origin: "marketplace",
        }),
      });

      const result = await uninstallPluginsFn(
        { kind: "plugins", pluginsDir, names: [CATALOGUE_PLUGIN_NAME] },
        config,
        projectDir,
      );

      expect(result.totalUninstalled).toBe(1);

      // A global entry is asked at global scope first, then the project scope is swept too.
      expect(
        uninstallPlugin.mock.calls.map(([ref, scope, dir]) => [ref, scope, dir]),
        "with the order reversed this passes while removing the registration the config does not name first",
      ).toStrictEqual([
        [CATALOGUE_PLUGIN_NAME, "global", projectDir],
        [CATALOGUE_PLUGIN_NAME, "project", projectDir],
      ]);
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
      // The command uses process.cwd(), so chdir to fakeHome.
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
