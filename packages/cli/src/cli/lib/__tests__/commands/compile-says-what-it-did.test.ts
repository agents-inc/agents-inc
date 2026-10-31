import path from "path";
import { chmod, mkdir, readdir, readFile, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCliCommand } from "../helpers/cli-runner.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { compactCliOutput, flattenCliOutput } from "../helpers/flatten-cli-output.js";
import { readTestTsConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { readInstallTree } from "../helpers/golden-tree.js";
import { parseCompiledAgentSections } from "../helpers/compiled-agent-sections.js";
import { buildSkillConfig } from "../helpers/index.js";
import type { FixtureProjectConfig } from "../helpers/skill-config-builders.js";
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
import {
  CLAUDE_DIR,
  PLUGINS_SUBDIR,
  PROJECT_ROOT,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import { directoryExists, fileExists } from "../test-fs-utils";

/** What a compile writes at the root it compiles: its sub-agents, and config-types.ts. */
const COMPILE_OUTPUTS = [
  `${CLAUDE_DIR}/${STANDARD_DIRS.AGENTS}`,
  `.agents-inc/claude/${STANDARD_FILES.CONFIG_TYPES_TS}`,
];

const agentsDirAt = (root: string) => path.join(root, CLAUDE_DIR, STANDARD_DIRS.AGENTS);
const configTypesAt = (root: string) =>
  path.join(root, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TYPES_TS);

/** Every file under a root but a compile's outputs and the home's shared marketplace cache. */
function allButCompileOutputsAt(root: string) {
  return readInstallTree(root, { skip: [...COMPILE_OUTPUTS, ".cache"] });
}

async function compiledAt(root: string): Promise<string[]> {
  return (await directoryExists(agentsDirAt(root)))
    ? (await readdir(agentsDirAt(root))).sort()
    : [];
}

/** A root after a compile: everything it does not write, and the sub-agents it compiled. */
async function afterCompileAt(root: string) {
  return { rest: await allButCompileOutputsAt(root), compiled: await compiledAt(root) };
}

async function skillsCarriedBy(root: string, agent: string) {
  const compiled = await readFile(path.join(agentsDirAt(root), `${agent}.md`), "utf8");
  const { preloadedRefs, dynamicEntries } = parseCompiledAgentSections(compiled);
  return { preloadedRefs, dynamicEntries };
}

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

  /** Every file at home but the shared marketplace cache. */
  const homeNow = () => readInstallTree(fakeHome, { skip: [".cache"] });

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

  it("narrates each step of a project compile", async () => {
    const installedAt = await installProject(
      buildTestProjectConfig(["web-developer", "api-developer"], []),
    );
    const before = await allButCompileOutputsAt(installedAt);

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
        "",
      ].join("\n"),
    );
    expect(
      await afterCompileAt(installedAt),
      "both sub-agents are compiled, and nothing else in the project changes",
    ).toStrictEqual({ rest: before, compiled: ["api-developer.md", "web-developer.md"] });
    expect(await fileExists(configTypesAt(installedAt)), "config-types.ts is written").toBe(true);
    expect(await homeNow(), "a project compile writes nothing at home").toStrictEqual({
      files: {},
      emptyDirectories: [],
    });
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
    expect(
      await compiledAt(projectDir),
      "the agents it names are in the folder it names",
    ).toStrictEqual(["api-developer.md", "web-developer.md"]);
  });

  it("warns for a stack skill installed nowhere, but not for one the config excludes", async () => {
    const installedAt = await installProject(
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
    expect(await compiledAt(installedAt)).toStrictEqual(["web-developer.md"]);
    expect(
      await skillsCarriedBy(installedAt, "web-developer"),
      "web-developer is compiled without the missing skill and the excluded one",
    ).toStrictEqual({ preloadedRefs: [], dynamicEntries: [] });
  });

  it("warns that a global sub-agent cannot carry the project-scoped skill its stack names", async () => {
    const installedAt = await installProject(
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
      "Warning: Sub-agent 'web-developer' cannot carry project-scoped skill 'Valid' — global-scoped sub-agents only carry global-scoped skills.",
    );
    expect(flattenCliOutput(stderr)).toContain(
      "Warning: Sub-agent 'api-developer' cannot carry project-scoped skill 'Vitest' — global-scoped sub-agents only carry global-scoped skills.",
    );
    expect(await compiledAt(installedAt)).toStrictEqual([
      "api-developer.md",
      "web-developer.md",
      "web-tester.md",
    ]);
    expect(
      await skillsCarriedBy(installedAt, "web-developer"),
      "the global sub-agent is compiled without the project-scoped skill its stack names",
    ).toStrictEqual({ preloadedRefs: [], dynamicEntries: [] });
    expect(
      await skillsCarriedBy(installedAt, "web-tester"),
      "the project-scoped sub-agent carries it",
    ).toStrictEqual({
      preloadedRefs: [],
      dynamicEntries: [{ id: VALID_LOCAL_SKILL.id, invokeRef: VALID_LOCAL_SKILL.id }],
    });
  });

  it("names the project-scoped skill a global sub-agent cannot carry by the name its entry recorded", async () => {
    const recordedName = "House Tooling";
    await installProject(
      buildProjectConfig({
        skills: [
          buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project", displayName: recordedName }),
        ],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": { "web-tooling": [{ id: VALID_LOCAL_SKILL.id, preloaded: false }] },
        },
      }),
    );

    const { stderr } = await runCliCommand(["compile"]);

    expect(flattenCliOutput(stderr)).toBe(
      `Warning: Sub-agent 'web-developer' cannot carry project-scoped skill '${recordedName}' — global-scoped sub-agents only carry global-scoped skills.`,
    );
  });

  it("says nothing of scope for a project-scoped sub-agent carrying a project-scoped skill", async () => {
    const installedAt = await installProject(
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
    expect(await compiledAt(installedAt)).toStrictEqual(["web-tester.md"]);
    expect(await skillsCarriedBy(installedAt, "web-tester")).toStrictEqual({
      preloadedRefs: [],
      dynamicEntries: [{ id: VALID_LOCAL_SKILL.id, invokeRef: VALID_LOCAL_SKILL.id }],
    });
  });

  it("blames a global sub-agent for the project-scoped skill among the skills its stack names", async () => {
    const installedAt = await installProject(
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
      "Warning: Sub-agent 'web-developer' cannot carry project-scoped skill 'Valid' — global-scoped sub-agents only carry global-scoped skills.",
    );
    expect(flattenCliOutput(stderr)).not.toContain("project-scoped skill 'Vitest'");
    expect(await compiledAt(installedAt)).toStrictEqual(["web-developer.md"]);
    expect(
      await skillsCarriedBy(installedAt, "web-developer"),
      "the project-scoped skill is left out of the global sub-agent",
    ).toStrictEqual({ preloadedRefs: [], dynamicEntries: [] });
  });

  it("blames no global sub-agent carrying a global-scoped skill, or carrying nothing", async () => {
    const installedAt = await installProject(
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
    expect(await compiledAt(installedAt)).toStrictEqual([
      "api-developer.md",
      "web-developer.md",
      "web-tester.md",
    ]);
  });

  it("says only that there is nothing to recompile when no sub-agent is configured", async () => {
    const installedAt = await installProject(
      buildProjectConfig({
        skills: [buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project" })],
        agents: [],
      }),
    );
    const before = await allButCompileOutputsAt(installedAt);

    const { stdout } = await runCliCommand(["compile"]);

    expect(stdout).toContain(
      ["Recompiling agents...", "No agents to recompile", "Refreshed config-types.ts"].join("\n"),
    );
    expect(await afterCompileAt(installedAt), "no sub-agent is written").toStrictEqual({
      rest: before,
      compiled: [],
    });
    expect(await fileExists(configTypesAt(installedAt)), "config-types.ts is written").toBe(true);
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
    const installedAt = await installProject(
      buildProjectConfig({
        skills: [buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project" })],
        agents: [
          ...buildAgentConfigs(["web-developer", "web-tester"], { scope: "global" }),
          ...buildAgentConfigs(["api-developer"], { scope: "global", excluded: true }),
        ],
      }),
    );
    const homeBefore = await homeNow();

    const { stdout, error } = await runCliCommand(["compile"]);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "Recompiling agents...",
        "No agents to recompile",
        "2 agents are global-scoped — run 'npx agents-inc compile' from your home directory to recompile them.",
      ].join("\n"),
    );
    expect(
      await compiledAt(installedAt),
      "no global sub-agent is compiled into the project",
    ).toStrictEqual([]);
    expect(await homeNow(), "the global sub-agents are left to a compile from home").toStrictEqual(
      homeBefore,
    );
  });

  it("refuses to run with nothing installed here or at home", async () => {
    dirs = await createTestSource({ skills: [], agents: [] });
    process.chdir(dirs.projectDir);
    const before = { project: await readInstallTree(dirs.projectDir), home: await homeNow() };

    const { error } = await runCliCommand(["compile"]);

    expect(error?.message).toBe(
      "No installation found. Run 'npx agents-inc init' first to set up Agents Inc.",
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(
      { project: await readInstallTree(dirs.projectDir), home: await homeNow() },
      "a refused run writes nothing",
    ).toStrictEqual(before);
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
      const installedAt = await installProject(buildTestProjectConfig(["web-developer"], []));
      await installReactPluginGlobally();
      const homeBefore = await homeNow();

      const { stdout } = await runCliCommand(["compile"]);

      expect(stdout).toContain(
        "Discovering skills...\nDiscovered 2 skills (1 from plugins, 1 local)\n",
      );
      expect(await compiledAt(installedAt)).toStrictEqual(["web-developer.md"]);
      expect(await homeNow(), "the plugin and its registry are only read").toStrictEqual(
        homeBefore,
      );
    });

    it("says the skills came from plugins when none is installed locally", async () => {
      const source = await createTestSource({ skills: [], agents: [] });
      dirs = source;
      await writeTestTsConfig(source.projectDir, buildTestProjectConfig(["web-developer"], []));
      process.chdir(source.projectDir);
      await installReactPluginGlobally();
      const homeBefore = await homeNow();

      const { stdout } = await runCliCommand(["compile"]);

      expect(stdout).toContain("Discovering skills...\nDiscovered 1 skill from plugins\n");
      expect(await compiledAt(source.projectDir)).toStrictEqual(["web-developer.md"]);
      expect(await homeNow(), "the plugin and its registry are only read").toStrictEqual(
        homeBefore,
      );
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
      const before = await allButCompileOutputsAt(installedAt);

      const { stdout } = await runCliCommand(["compile"]);

      expect(stdout).toContain(
        "Discovering skills...\nDiscovered 2 skills (1 from plugins, 1 local)\n",
      );
      expect(await afterCompileAt(installedAt)).toStrictEqual({
        rest: before,
        compiled: ["web-developer.md"],
      });
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
      const before = await allButCompileOutputsAt(dirs.projectDir);

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
      expect(
        await afterCompileAt(dirs.projectDir),
        "the base agent is compiled, and the excluded one is not",
      ).toStrictEqual({ rest: before, compiled: ["web-developer.md"] });
    });

    it("skips a pass whose declared skills are on disk nowhere, and refuses the run", async () => {
      dirs = await createTestSource({ skills: [], agents: [] });
      await writeTestTsConfig(
        dirs.projectDir,
        buildTestProjectConfig(["web-developer"], ["web-framework-react"]),
      );
      process.chdir(dirs.projectDir);
      const before = await readInstallTree(dirs.projectDir);

      const { stdout, error } = await runCliCommand(["compile"]);

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
          "No skills found for project pass, skipping",
          "",
        ].join("\n"),
      );
      expect(error?.message).toBe(
        "No skills found. Run 'npx agents-inc init' to choose skills, or add your own under .claude/skills/.",
      );
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(
        await readInstallTree(dirs.projectDir),
        "a skipped pass writes nothing, config-types.ts included",
      ).toStrictEqual(before);
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
    const before = await readInstallTree(installedAt);

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
    expect(
      await readInstallTree(installedAt),
      "the refusal comes before anything is written",
    ).toStrictEqual(before);
  });

  it("says why it could not refresh config-types.ts when the catalogue would not load", async () => {
    const installedAt = await installProject({
      ...buildTestProjectConfig(["web-developer"], []),
      marketplace: path.join(tempDir, "marketplace-that-is-gone"),
    });
    const before = await allButCompileOutputsAt(installedAt);

    const { stderr } = await runCliCommand(["compile"]);

    expect(compactCliOutput(stderr)).toContain(
      compactCliOutput(
        `Warning: Could not refresh config-types.ts — type unions may be stale: no skills catalogue could be loaded for ${installedAt}`,
      ),
    );
    expect(await fileExists(configTypesAt(installedAt)), "config-types.ts is not written").toBe(
      false,
    );
    expect(await afterCompileAt(installedAt), "the agents are still compiled").toStrictEqual({
      rest: before,
      compiled: ["web-developer.md"],
    });
  });

  // Root writes through the mode bits, so the failures under test cannot happen there.
  describe.skipIf(process.getuid?.() === 0)("a write the file system refuses", () => {
    it("warns that config-types.ts could not be refreshed, with the cause, and still completes", async () => {
      const installedAt = await installProject(buildTestProjectConfig(["web-developer"], []));
      const sourceFolder = path.join(installedAt, ".agents-inc", "claude");
      const before = await allButCompileOutputsAt(installedAt);
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
        expect(await afterCompileAt(installedAt), "the agents are still compiled").toStrictEqual({
          rest: before,
          compiled: ["web-developer.md"],
        });
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
      const before = await allButCompileOutputsAt(installedAt);
      await chmod(agentsDir, 0o555);
      try {
        const { stdout, stderr } = await runCliCommand(["compile"]);

        expect(stdout).toContain(
          "Recompiling agents...\n0 project agents rewritten, 0 unchanged (2 failed)\n",
        );
        expect(flattenCliOutput(stderr)).toContain("web-developer");
        expect(flattenCliOutput(stderr)).toContain("api-developer");
        expect(
          await allButCompileOutputsAt(installedAt),
          "an agent it cannot write lands nowhere else, and nothing else changes",
        ).toStrictEqual(before);
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
    const installedAt = await installProject(
      buildProjectConfig({
        skills: [buildSkillConfig(VALID_LOCAL_SKILL.id, { scope: "project" })],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      }),
    );
    const homeBefore = await homeNow();

    const { stdout } = await runCliCommand(["compile", "--verbose"]);

    expect(stdout).toContain("No agents to recompile");
    expect(stdout).not.toContain("Compiled: ");
    expect(await compiledAt(installedAt), "it compiled none here").toStrictEqual([]);
    expect(await homeNow(), "and none at home").toStrictEqual(homeBefore);
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
      const homeBefore = await allButCompileOutputsAt(fakeHome);
      const unreachedBefore = await Promise.all(
        [codexProject, unloadable].map((root) => readInstallTree(root)),
      );

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
          "Registered projects: 1 recompiled",
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
      expect(
        await afterCompileAt(fakeHome),
        "the global sub-agent is compiled at home, and nothing else there changes",
      ).toStrictEqual({ rest: homeBefore, compiled: ["web-developer.md"] });
      expect(await compiledAt(projectDir), "the project it reached is recompiled").toStrictEqual([
        "api-developer.md",
      ]);
      const { skills, agents } = await readTestTsConfig<FixtureProjectConfig>(
        path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS),
      );
      expect(
        { skills, agents },
        "the project it reached keeps its own sub-agent beside the global one it inherits",
      ).toStrictEqual({
        skills: [],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["api-developer"], { scope: "project" }),
        ],
      });
      expect(
        await Promise.all([codexProject, unloadable].map((root) => readInstallTree(root))),
        "the projects it could not reach are left as they were",
      ).toStrictEqual(unreachedBefore);
      expect(await directoryExists(gone), "nothing is made where nothing was installed").toBe(
        false,
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
      const homeBefore = await allButCompileOutputsAt(fakeHome);
      const projectBefore = await readInstallTree(projectDir);

      const { stdout, stderr, error } = await runCliCommand(["compile"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        ["1 global agent rewritten, 0 unchanged", "Refreshed config-types.ts", "", "✓"].join("\n"),
      );
      expect(stderr).toBe("");
      expect(await afterCompileAt(fakeHome)).toStrictEqual({
        rest: homeBefore,
        compiled: ["web-developer.md"],
      });
      expect(await fileExists(configTypesAt(fakeHome)), "config-types.ts is written at home").toBe(
        true,
      );
      expect(
        await readInstallTree(projectDir),
        "the directory it runs from is left as it was",
      ).toStrictEqual(projectBefore);
    });

    it("compiles the global installation from a project that has none of its own", async () => {
      await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        }),
      );
      const homeBefore = await allButCompileOutputsAt(fakeHome);
      const projectBefore = await readInstallTree(projectDir);

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
      expect(
        await afterCompileAt(fakeHome),
        "the global sub-agent is compiled at home",
      ).toStrictEqual({ rest: homeBefore, compiled: ["web-developer.md"] });
      expect(await readInstallTree(projectDir), "nothing is written in the project").toStrictEqual(
        projectBefore,
      );
    });
  });
});
