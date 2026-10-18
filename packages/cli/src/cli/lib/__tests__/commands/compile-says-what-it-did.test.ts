import path from "path";
import { chmod, mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { compactCliOutput, flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { buildSkillConfig } from "../helpers/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
  buildTestProjectConfig,
} from "../factories/config-factories.js";
import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { writeTestPluginManifest } from "../helpers/disk-writers.js";
import {
  buildProjectPluginInstallation,
  buildUserPluginInstallation,
  renderEnabledPluginsSettings,
  renderInstalledPluginsRegistry,
} from "../factories/plugin-registry-factories.js";
import { renderSkillMd, renderUnparseableMetadataYaml } from "../content-generators";
import { VALID_LOCAL_SKILL } from "../mock-data/mock-skills";
import { CLAUDE_DIR, PLUGINS_SUBDIR, PROJECT_ROOT, STANDARD_FILES } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";

/** Each line a run prints, in order: the progress a person watches, then where it all went. */
describe("what compile says", () => {
  let tempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs | undefined;

  beforeEach(async () => {
    ({ tempDir, fakeHome, projectDir, cleanup } = await setupIsolatedHome("cc-compile-says-test-"));
  });

  afterEach(async () => {
    if (dirs !== undefined) await cleanupTestSource(dirs);
    dirs = undefined;
    await cleanup();
  });

  async function installProject(config: Record<string, unknown>): Promise<string> {
    dirs = await createTestSource({
      skills: [],
      agents: [],
      localSkills: [VALID_LOCAL_SKILL],
      projectConfig: buildTestProjectConfig(["web-developer"], []),
      asPlugin: true,
    });
    await writeTestTsConfig(dirs.projectDir, config);
    process.chdir(dirs.projectDir);
    return dirs.projectDir;
  }

  it("narrates each step of a project compile, then the trust notice for what it wrote", async () => {
    const projectDir = await installProject(
      buildTestProjectConfig(["web-developer", "api-developer"], []),
    );

    const { stdout, error } = await runCliCommand(["compile"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        "Resolving marketplace...",
        "Marketplace: default",
        "Loading agent partials...",
        "Agent partials loaded",
        "",
        "Compiling project agents...",
        "",
        "Discovering skills...",
        "Discovered 1 local skill",
        "Recompiling agents...",
        "2 project agents rewritten, 0 unchanged",
        "Refreshed config-types.ts",
        "",
        "✓ Project compile complete!",
        "",
        `Claude Code runs a project sub-agent's completion gate (its Stop hook — the project's typecheck, unless the sub-agent declares its own) only once you trust the folder: open Claude Code in ${projectDir} and accept the trust prompt. Until then, 2 sub-agents' completion gates will not run, and nothing will say so.`,
        "",
      ].join("\n"),
    );
  });

  it("names the directories and the agents it compiled under --verbose", async () => {
    const projectDir = await installProject(
      buildTestProjectConfig(["web-developer", "api-developer"], []),
    );

    const { stdout } = await runCliCommand(["compile", "--verbose"]);

    expect(stdout).toContain(
      ["Agent partials loaded", `    Agents: ${path.join(PROJECT_ROOT, "src", "agents")}`].join(
        "\n",
      ),
    );
    expect(stdout).toContain(
      [
        "Compiling project agents...",
        "",
        `    Project: ${projectDir}`,
        `    Agents: ${path.join(projectDir, CLAUDE_DIR, "agents")}`,
      ].join("\n"),
    );
    expect(stdout).toContain(
      [
        "2 project agents rewritten, 0 unchanged",
        "    Compiled: web-developer, api-developer",
      ].join("\n"),
    );
  });

  it("warns for a stack skill installed nowhere, but not for one the config excludes", async () => {
    await installProject(
      buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: [
          buildSkillConfig("web-framework-react", { excluded: true }),
          buildSkillConfig("web-testing-vitest"),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      }),
    );

    const { stderr } = await runCliCommand(["compile"]);

    expect(flattenCliOutput(stderr)).toBe(
      "Warning: Skill 'web-testing-vitest' is configured but was not found — agents will be compiled without it.",
    );
  });

  it("warns that a global sub-agent cannot carry the project-scoped skill its stack names", async () => {
    await installProject(
      buildProjectConfig({
        skills: [
          buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project" }),
          buildSkillConfig("web-testing-vitest", { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["api-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-tester"], { scope: "project" }),
        ],
        stack: {
          "web-developer": { "web-tooling": [{ id: VALID_LOCAL_SKILL.id, preloaded: false }] },
          "api-developer": { "web-testing": [{ id: "web-testing-vitest", preloaded: false }] },
          "web-tester": { "web-tooling": [{ id: VALID_LOCAL_SKILL.id, preloaded: false }] },
        },
      }),
    );

    const { stderr } = await runCliCommand(["compile"]);

    expect(flattenCliOutput(stderr)).toContain(
      "Warning: Sub-agent 'web-developer' cannot carry project-scoped skill 'web-tooling-valid' — global-scoped sub-agents only carry global-scoped skills.",
    );
    expect(flattenCliOutput(stderr)).toContain(
      "Warning: Sub-agent 'api-developer' cannot carry project-scoped skill 'web-testing-vitest' — global-scoped sub-agents only carry global-scoped skills.",
    );
  });

  it("says nothing of scope for a project-scoped sub-agent carrying a project-scoped skill", async () => {
    await installProject(
      buildProjectConfig({
        skills: [buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project" })],
        agents: buildAgentConfigs(["web-tester"], { scope: "project" }),
        stack: {
          "web-tester": { "web-tooling": [{ id: VALID_LOCAL_SKILL.id, preloaded: false }] },
        },
      }),
    );

    const { stderr } = await runCliCommand(["compile"]);

    expect(stderr).toBe("");
  });

  it("blames a global sub-agent for the project-scoped skill among the skills its stack names", async () => {
    await installProject(
      buildProjectConfig({
        skills: [
          buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project" }),
          buildSkillConfig("web-testing-vitest", { scope: "global" }),
        ],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-tooling": [{ id: VALID_LOCAL_SKILL.id, preloaded: false }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      }),
    );

    const { stderr } = await runCliCommand(["compile"]);

    expect(flattenCliOutput(stderr)).toContain(
      "Warning: Sub-agent 'web-developer' cannot carry project-scoped skill 'web-tooling-valid' — global-scoped sub-agents only carry global-scoped skills.",
    );
    expect(flattenCliOutput(stderr)).not.toContain("project-scoped skill 'web-testing-vitest'");
  });

  it("blames no global sub-agent carrying a global-scoped skill, or carrying nothing", async () => {
    await installProject(
      buildProjectConfig({
        skills: [
          buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project" }),
          buildSkillConfig("web-testing-vitest", { scope: "global" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer", "api-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-tester"], { scope: "project" }),
        ],
        stack: {
          "web-developer": { "web-testing": [{ id: "web-testing-vitest", preloaded: false }] },
          "web-tester": { "web-tooling": [{ id: VALID_LOCAL_SKILL.id, preloaded: false }] },
        },
      }),
    );

    const { stderr } = await runCliCommand(["compile"]);

    expect(flattenCliOutput(stderr)).not.toContain("cannot carry");
  });

  it("says only that there is nothing to recompile when no sub-agent is configured", async () => {
    await installProject(
      buildProjectConfig({
        skills: [buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project" })],
        agents: [],
      }),
    );

    const { stdout } = await runCliCommand(["compile"]);

    expect(stdout).toContain(
      ["Recompiling agents...", "No agents to recompile", "Refreshed config-types.ts"].join("\n"),
    );
  });

  it("says there are no project agents to recompile and points at the global ones", async () => {
    // A global installation too, so the project pass leaves global sub-agents to it.
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        skills: [],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      }),
    );
    await installProject(
      buildProjectConfig({
        skills: [buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project" })],
        agents: [
          ...buildAgentConfigs(["web-developer", "web-tester"], { scope: "global" }),
          ...buildAgentConfigs(["api-developer"], { scope: "global", excluded: true }),
        ],
      }),
    );

    const { stdout, error } = await runCliCommand(["compile"]);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "Recompiling agents...",
        "No agents to recompile",
        "2 agents are global-scoped — run 'npx agents-inc compile' from your home directory to recompile them.",
      ].join("\n"),
    );
  });

  it("refuses to run with nothing installed here or at home", async () => {
    dirs = await createTestSource({ skills: [], agents: [] });
    process.chdir(dirs.projectDir);

    const { error } = await runCliCommand(["compile"]);

    expect(error?.message).toBe(
      "No installation found. Run 'npx agents-inc init' first to set up Agents Inc.",
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
  });

  describe("its count of the skills it discovered", () => {
    const PLUGIN_KEY = "web-framework-react@acme";

    /** A plugin carrying one skill, written where Claude would have installed it. */
    async function pluginAt(installPath: string): Promise<string> {
      await writeTestPluginManifest(installPath, { name: "web-framework-react", version: "1.0.0" });
      const skillDir = path.join(installPath, "skills", "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react"),
      );
      return installPath;
    }

    async function enablePluginIn(root: string): Promise<void> {
      await mkdir(path.join(root, CLAUDE_DIR), { recursive: true });
      await writeFile(
        path.join(root, CLAUDE_DIR, "settings.json"),
        renderEnabledPluginsSettings({ [PLUGIN_KEY]: true }),
      );
    }

    async function registerInstalls(installs: readonly unknown[]): Promise<void> {
      const pluginsRoot = path.join(fakeHome, CLAUDE_DIR, PLUGINS_SUBDIR);
      await mkdir(pluginsRoot, { recursive: true });
      await writeFile(
        path.join(pluginsRoot, "installed_plugins.json"),
        renderInstalledPluginsRegistry({ [PLUGIN_KEY]: installs }),
      );
    }

    async function installReactPluginGlobally(): Promise<void> {
      const userInstall = await pluginAt(
        path.join(tempDir, "cache", "user", "web-framework-react"),
      );
      await registerInstalls([buildUserPluginInstallation(userInstall)]);
      await enablePluginIn(fakeHome);
    }

    it("splits the count into plugin and local skills when both are installed", async () => {
      await installProject(buildTestProjectConfig(["web-developer"], []));
      await installReactPluginGlobally();

      const { stdout } = await runCliCommand(["compile"]);

      expect(stdout).toContain(
        "Discovering skills...\nDiscovered 2 skills (1 from plugins, 1 local)\n",
      );
    });

    it("says the skills came from plugins when none is installed locally", async () => {
      const source = await createTestSource({ skills: [], agents: [] });
      dirs = source;
      await writeTestTsConfig(source.projectDir, buildTestProjectConfig(["web-developer"], []));
      process.chdir(source.projectDir);
      await installReactPluginGlobally();

      const { stdout } = await runCliCommand(["compile"]);

      expect(stdout).toContain("Discovering skills...\nDiscovered 1 skill from plugins\n");
    });

    it("counts a plugin installed at both scopes once", async () => {
      const installedAt = await installProject(buildTestProjectConfig(["web-developer"], []));
      const userInstall = await pluginAt(
        path.join(tempDir, "cache", "user", "web-framework-react"),
      );
      const projectInstall = await pluginAt(
        path.join(tempDir, "cache", "project", "web-framework-react"),
      );
      await registerInstalls([
        buildUserPluginInstallation(userInstall),
        buildProjectPluginInstallation(projectInstall, installedAt),
      ]);
      await enablePluginIn(fakeHome);
      await enablePluginIn(installedAt);

      const { stdout } = await runCliCommand(["compile"]);

      expect(stdout).toContain(
        "Discovering skills...\nDiscovered 2 skills (1 from plugins, 1 local)\n",
      );
    });
  });

  describe("a pass with nothing to discover", () => {
    it("compiles the base agents of a config that declares no skill, and says so", async () => {
      dirs = await createTestSource({ skills: [], agents: [] });
      await writeTestTsConfig(
        dirs.projectDir,
        buildProjectConfig({
          skills: [],
          agents: [
            ...buildAgentConfigs(["web-developer"]),
            ...buildAgentConfigs(["api-developer"], { excluded: true }),
          ],
        }),
      );
      process.chdir(dirs.projectDir);

      const { stdout, error } = await runCliCommand(["compile"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        [
          "Compiling project agents...",
          "",
          "Discovering skills...",
          "No skills configured for project pass, compiling base agents",
          "Recompiling agents...",
          "1 project agent rewritten, 0 unchanged",
        ].join("\n"),
      );
    });

    it("skips a pass whose declared skills are on disk nowhere, and refuses the run", async () => {
      dirs = await createTestSource({ skills: [], agents: [] });
      await writeTestTsConfig(
        dirs.projectDir,
        buildTestProjectConfig(["web-developer"], ["web-framework-react"]),
      );
      process.chdir(dirs.projectDir);

      const { stdout, error } = await runCliCommand(["compile"]);

      expect(stdout).toContain(
        [
          "Compiling project agents...",
          "",
          "Discovering skills...",
          "No skills found for project pass, skipping",
          "",
        ].join("\n"),
      );
      expect(error?.message).toBe(
        "No skills found. Run 'npx agents-inc init' to choose skills, or add your own under .claude/skills/.",
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    });
  });

  it("refuses an installed skill whose metadata describes no skill, naming its file", async () => {
    const installedAt = await installProject(buildTestProjectConfig(["web-developer"], []));
    const metadataPath = path.join(
      installedAt,
      CLAUDE_DIR,
      "skills",
      VALID_LOCAL_SKILL.id,
      STANDARD_FILES.METADATA_YAML,
    );
    await writeFile(metadataPath, renderUnparseableMetadataYaml());

    const { stdout, error } = await runCliCommand(["compile"]);

    expect(stdout).toContain(
      `Discovering skills...\n  ${VALID_LOCAL_SKILL.id} — ${metadataPath}\n    `,
    );
    expect(error?.message).toBe(
      [
        `The metadata.yaml of '${VALID_LOCAL_SKILL.id}' does not describe that skill — the file and the reason are named above.`,
        "A skill this file cannot describe is skipped when config-types.ts is regenerated, so compiling it would write agents around a skill the generated types never carry.",
        "Fix the file, or delete the skill directory — 'npx agents-inc doctor' reports every skill in this state.",
      ].join("\n"),
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
  });

  it("says why it could not refresh config-types.ts when the catalogue would not load", async () => {
    const installedAt = await installProject({
      ...buildTestProjectConfig(["web-developer"], []),
      marketplace: path.join(tempDir, "marketplace-that-is-gone"),
    });

    const { stderr } = await runCliCommand(["compile"]);

    expect(compactCliOutput(stderr)).toContain(
      compactCliOutput(
        `Warning: Could not refresh config-types.ts — type unions may be stale: no skills catalogue could be loaded for ${installedAt}`,
      ),
    );
  });

  // Root writes through the mode bits, so the failures under test cannot happen there.
  describe.skipIf(process.getuid?.() === 0)("a write the file system refuses", () => {
    it("warns that config-types.ts could not be refreshed, with the cause, and still completes", async () => {
      const installedAt = await installProject(buildTestProjectConfig(["web-developer"], []));
      const sourceFolder = path.join(installedAt, ".agents-inc", "claude");
      await chmod(sourceFolder, 0o555);
      try {
        const { stdout, stderr, error } = await runCliCommand(["compile"]);

        expect(error).toBeUndefined();
        expect(compactCliOutput(stderr)).toContain(
          compactCliOutput(
            "Warning: Could not refresh config-types.ts — type unions may be stale: EACCES",
          ),
        );
        expect(stdout).not.toContain("Refreshed config-types.ts");
        expect(stdout).toContain("✓ Project compile complete!");
      } finally {
        await chmod(sourceFolder, 0o755);
      }
    });

    it("counts the agents it could not write and says why for each", async () => {
      const installedAt = await installProject(
        buildTestProjectConfig(["web-developer", "api-developer"], []),
      );
      const agentsDir = path.join(installedAt, CLAUDE_DIR, "agents");
      await mkdir(agentsDir, { recursive: true });
      // Not empty, or the prune of stale agents removes the folder before the write is tried.
      await writeFile(path.join(agentsDir, "notes.txt"), "the user's own file");
      await chmod(agentsDir, 0o555);
      try {
        const { stdout, stderr } = await runCliCommand(["compile"]);

        expect(stdout).toContain(
          "Recompiling agents...\n0 project agents rewritten, 0 unchanged (2 failed)\n",
        );
        expect(flattenCliOutput(stderr)).toContain("web-developer");
        expect(flattenCliOutput(stderr)).toContain("api-developer");
      } finally {
        await chmod(agentsDir, 0o755);
      }
    });
  });

  it("names no compiled agent under --verbose when it compiled none", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        skills: [],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      }),
    );
    await installProject(
      buildProjectConfig({
        skills: [buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project" })],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      }),
    );

    const { stdout } = await runCliCommand(["compile", "--verbose"]);

    expect(stdout).toContain("No agents to recompile");
    expect(stdout).not.toContain("Compiled: ");
  });

  describe("a global compile, with projects registered against it", () => {
    it("compiles at home, then names each registered project it could not reach", async () => {
      const gone = path.join(tempDir, "gone");
      const codexProject = path.join(tempDir, "codex-project");
      const unloadable = path.join(tempDir, "unloadable-project");
      await mkdir(codexProject, { recursive: true });
      await writeTestTsConfig(
        codexProject,
        buildTestProjectConfig(["web-developer"], []),
        ".agents-inc/codex",
      );
      await mkdir(unloadable, { recursive: true });
      await writeTestTsConfig(unloadable, {
        ...buildTestProjectConfig(["api-developer"], []),
        marketplace: path.join(tempDir, "marketplace-that-is-gone"),
      });
      await writeTestTsConfig(projectDir, buildTestProjectConfig(["api-developer"], []));
      await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          projects: [gone, codexProject, unloadable, projectDir],
        }),
      );
      process.chdir(fakeHome);

      const { stdout, stderr, error } = await runCliCommand(["compile"]);

      expect(error).toBeUndefined();
      expect(stdout).toBe(
        [
          "Resolving marketplace...",
          "Marketplace: default",
          "Loading agent partials...",
          "Agent partials loaded",
          "",
          "Compiling global agents...",
          "",
          "Discovering skills...",
          "No skills configured for global pass, compiling base agents",
          "Recompiling agents...",
          "1 global agent rewritten, 0 unchanged",
          "Refreshed config-types.ts",
          "Recompiled agents in 1 registered project, 0 unchanged",
          "",
          "✓ Global compile complete!",
          "",
          "",
        ].join("\n"),
      );
      expect(compactCliOutput(stderr)).toBe(
        compactCliOutput(
          [
            `Warning: Skipped ${gone}: nothing is installed there any more.`,
            `Warning: Skipped ${codexProject}: it is another provider's installation.`,
            `Warning: Skipped ${unloadable}: updating it failed.`,
          ].join(""),
        ),
      );
    });

    it("leaves the directory it runs from out of the global pass's reach", async () => {
      await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
          projects: [projectDir],
        }),
      );

      const { stdout, stderr, error } = await runCliCommand(["compile"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        ["1 global agent rewritten, 0 unchanged", "Refreshed config-types.ts", "", "✓"].join("\n"),
      );
      expect(stderr).toBe("");
    });

    it("compiles the global installation from a project that has none of its own", async () => {
      await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        }),
      );

      const { stdout, error } = await runCliCommand(["compile"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        [
          "Compiling global agents...",
          "",
          "Discovering skills...",
          "No skills configured for global pass, compiling base agents",
          "Recompiling agents...",
          "1 global agent rewritten, 0 unchanged",
        ].join("\n"),
      );
    });
  });
});
