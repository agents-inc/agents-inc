import path from "path";
import { mkdir, readdir, readFile, realpath, writeFile } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { runCliCommand } from "../helpers/cli-runner.js";
import { printAtWidth, standAtTerminal } from "../helpers/terminal-input.js";
import { directoryExists, fileExists } from "../test-fs-utils";
import { CONFIRM_INPUT_DELAY_MS, delay, KEY_N, KEY_Y } from "../test-constants";
import { useMockWorker } from "../helpers/mock-worker.js";
import { useClaudeStub } from "../helpers/claude-stub.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { readTestTsConfig, writeRawTestConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { readInstallTree } from "../helpers/golden-tree.js";
import { compactCliOutput, flattenCliOutput } from "../helpers/flatten-cli-output.js";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../factories/seed-factories.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import {
  buildSkillConfig,
  buildSkillConfigs,
  type FixtureProjectConfig,
} from "../helpers/skill-config-builders.js";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  TEST_MARKETPLACE_NAME,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { renderSkillMd, renderUnparseableMetadataYaml } from "../content-generators";
import { sa } from "../factories/skill-factories.js";
import { CLAUDE_DIR, STANDARD_DIRS, STANDARD_FILES } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import { loadInstalledConfig } from "../../configuration/index.js";
import { generateBlankGlobalConfigSource } from "../../configuration/config-writer";
import { generateBlankGlobalConfigTypesSource } from "../../configuration/config-types-writer";
import type { ProjectConfig } from "../../../types";

const SEED_ID = "Seed1";

/** Wide enough that no test-marketplace id wraps inside the panel, whose rows these specs pin. */
const PANEL_COLUMNS = 160;
const REACT = testMarketplaceSkillId("web-framework-react");
const HONO = testMarketplaceSkillId("api-framework-hono");
const VITEST = testMarketplaceSkillId("web-testing-vitest");
const CARRIED = "external-web-testing-brainstorming";

const READ_ONLY_FILE = 0o444;
const READ_WRITE_FILE = 0o644;

// Every run here goes through `dist/`, which no module mock reaches; the host spawns by name.
const claude = useClaudeStub();

const configFileAt = (root: string) =>
  path.join(root, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);
const typesFileAt = (root: string) =>
  path.join(root, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TYPES_TS);
const skillsDirAt = (root: string) => path.join(root, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
const agentsDirAt = (root: string) => path.join(root, CLAUDE_DIR, STANDARD_DIRS.AGENTS);

async function configuredAt(root: string) {
  const { skills, agents } = await readTestTsConfig<FixtureProjectConfig>(configFileAt(root));
  return { skills, agents };
}

async function entriesIn(dir: string): Promise<string[]> {
  return (await directoryExists(dir)) ? (await readdir(dir)).sort() : [];
}

/** What an install left at a root: its config's entries, its local copies, its compiled agents. */
async function installedAt(root: string) {
  return {
    ...(await configuredAt(root)),
    copies: await entriesIn(skillsDirAt(root)),
    compiled: await entriesIn(agentsDirAt(root)),
  };
}

/** An entry as the install records it, under the name its marketplace gives it. */
const copyEntry = (id: string, displayName: string, scope: "project" | "global" = "project") =>
  buildSkillConfig(id, { scope, origin: "eject", displayName });

/** Every file under the project and the home, the home's shared marketplace cache aside. */
async function treesUnder(projectDir: string, fakeHome: string) {
  return {
    project: await readInstallTree(projectDir),
    home: await readInstallTree(fakeHome, { skip: [".cache"] }),
  };
}

/**
 * `init --from` run whole, through `dist/`: the shared configuration is served by the mock worker,
 * the skills come from a test marketplace on disk, and every copy, write and compile is real.
 */
describe("what init --from says", () => {
  useMockWorker();
  printAtWidth(PANEL_COLUMNS);
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-init-from-says-test-"));
    dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
    // An existing grant keeps the permission notice out of the specs that are not about it.
    await grantPermissionsIn(projectDir);
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
    await cleanup();
  });

  async function grantPermissionsIn(root: string): Promise<void> {
    await mkdir(path.join(root, CLAUDE_DIR), { recursive: true });
    await writeFile(
      path.join(root, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] } }),
    );
  }

  function serve(payload: SeedPayload): void {
    configMockServer.use(storedConfigHandlerFor(SEED_ID, payload));
  }

  function ejected(scope: "project" | "global", agent: string) {
    return buildSeedSkill({ install: "eject", scope, assignments: { [agent]: "lazy" } });
  }

  function initFrom(...extra: string[]) {
    return runCliCommand(["init", "--from", SEED_ID, "--marketplace", dirs.sourceDir, ...extra]);
  }

  const reactAndACarriedSkill = () =>
    buildSeedPayload({
      skills: {
        [REACT]: ejected("project", "web-developer"),
        [CARRIED]: ejected("project", "web-developer"),
      },
      external: { [CARRIED]: buildSeedExternalSkill({ categoryId: "web-testing" }) },
      agents: { "web-developer": { scope: "project" } },
    });

  const aCarriedSkillAlone = () =>
    buildSeedPayload({
      skills: { [CARRIED]: ejected("project", "web-developer") },
      external: { [CARRIED]: buildSeedExternalSkill({ categoryId: "web-testing" }) },
      agents: { "web-developer": { scope: "project" } },
    });

  const projectConfigPath = () =>
    path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);
  const bothRoots = () => treesUnder(projectDir, fakeHome);

  it("shows the panel of what it installs where, then narrates the install and where each part went", async () => {
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          [HONO]: ejected("global", "api-developer"),
        },
        agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
      }),
    );

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout.startsWith(`Fetching configuration ${SEED_ID}...\n┌`)).toBe(true);
    expect(stdout).toContain("│  + React ⏏ ");
    expect(stdout).toContain("│  + Hono ⏏ ");
    expect(stdout).toContain("│  + web-developer ");
    expect(stdout).toContain("│  + api-developer ");
    expect(stdout).not.toContain("Into this project:");
    expect(stdout).toContain(
      [
        "┘",
        "",
        "Installing 2 skill(s) across 2 sub-agent(s)",
        "",
        "",
        "",
        "Selected 2 skills",
        "Install mode: Eject (local copy)",
        "Copying skills to local directory...",
        "Copied 2 skills (1 project, 1 global)",
        "",
        "Generating configuration...",
        "Configuration saved (2 agents)",
        "",
        "Compiling agents...",
        "Compiled 2 agents",
        "",
        "Agents Inc. initialized successfully!",
        "",
        "Skills copied to:",
        `  ${path.join(fakeHome, CLAUDE_DIR, "skills")}`,
        `    ${HONO}/`,
        "",
        "Skills copied to:",
        `  ${path.join(projectDir, CLAUDE_DIR, "skills")}`,
        `    ${REACT}/`,
        "",
        "Agents compiled to:",
        `  ${path.join(fakeHome, CLAUDE_DIR, "agents")}`,
        "    api-developer.md",
        "",
        "Agents compiled to:",
        `  ${path.join(projectDir, CLAUDE_DIR, "agents")}`,
        "    web-developer.md",
        "",
        "Configuration:",
        `  ${path.join(fakeHome, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
        `  ${path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
        "",
        "To customize agent-skill assignments:",
        "  1. Edit .agents-inc/claude/config.ts",
        "  2. Run 'npx agents-inc compile' to regenerate agents",
        "  3. 1 agent is global-scoped — run 'npx agents-inc compile' from your home directory to recompile it.",
        "",
        "",
      ].join("\n"),
    );
    expect(stdout.endsWith("recompile it.\n\n")).toBe(true);
    expect(
      await installedAt(fakeHome),
      "the global install holds Hono's copy and api-developer, compiled",
    ).toStrictEqual({
      skills: [copyEntry(HONO, "Hono", "global")],
      agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      copies: [HONO],
      compiled: ["api-developer.md"],
    });
    expect(
      await installedAt(projectDir),
      "the project holds React's copy and web-developer, compiled, beside the global entries",
    ).toStrictEqual({
      skills: [copyEntry(HONO, "Hono", "global"), copyEntry(REACT, "React")],
      agents: [
        ...buildAgentConfigs(["api-developer"], { scope: "global" }),
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
      ],
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });

  it("names the one folder a project-only install landed in, and both configs it wrote, with no global step", async () => {
    serve(
      buildSeedPayload({
        skills: { [REACT]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout } = await initFrom();

    expect(stdout).toContain(
      `Copied 1 skill to ${path.join(projectDir, CLAUDE_DIR, "skills")}/\n\n`,
    );
    expect(
      stdout.endsWith(
        [
          "Agents Inc. initialized successfully!",
          "",
          "Skills copied to:",
          `  ${path.join(projectDir, CLAUDE_DIR, "skills")}`,
          `    ${REACT}/`,
          "",
          "Agents compiled to:",
          `  ${path.join(projectDir, CLAUDE_DIR, "agents")}`,
          "    web-developer.md",
          "",
          "Configuration:",
          `  ${path.join(fakeHome, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
          `  ${path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
          "",
          "To customize agent-skill assignments:",
          "  1. Edit .agents-inc/claude/config.ts",
          "  2. Run 'npx agents-inc compile' to regenerate agents",
          "",
          "",
        ].join("\n"),
      ),
    ).toBe(true);
    expect(
      await installedAt(projectDir),
      "the project holds React's copy and web-developer, compiled",
    ).toStrictEqual({
      skills: [copyEntry(REACT, "React")],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
    expect(
      await installedAt(fakeHome),
      "the global config it names holds nothing, and nothing lands at home",
    ).toStrictEqual({ skills: [], agents: [], copies: [], compiled: [] });
  });

  it("points a global-only install at the global config and at compiling from home, naming both configs it wrote", async () => {
    serve(
      buildSeedPayload({
        skills: { [HONO]: ejected("global", "api-developer") },
        agents: { "api-developer": { scope: "global" } },
      }),
    );
    const globalConfig = path.join(fakeHome, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);

    const { stdout } = await initFrom();

    expect(stdout).toContain(`Copied 1 skill to ${path.join(fakeHome, CLAUDE_DIR, "skills")}/\n`);
    expect(
      stdout.endsWith(
        [
          "Configuration:",
          `  ${globalConfig}`,
          `  ${path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
          "",
          "To customize agent-skill assignments:",
          `  1. Edit ${globalConfig}`,
          "  2. 1 agent is global-scoped — run 'npx agents-inc compile' from your home directory to recompile it.",
          "",
          "",
        ].join("\n"),
      ),
    ).toBe(true);
    expect(
      await installedAt(fakeHome),
      "the global install holds Hono's copy and api-developer, compiled",
    ).toStrictEqual({
      skills: [copyEntry(HONO, "Hono", "global")],
      agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      copies: [HONO],
      compiled: ["api-developer.md"],
    });
    expect(
      await installedAt(projectDir),
      "the project config inherits the global entries, and the project holds no copy or agent",
    ).toStrictEqual({
      skills: [copyEntry(HONO, "Hono", "global")],
      agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      copies: [],
      compiled: [],
    });
  });

  it("at home, names the one skills and agents folder both scopes share", async () => {
    await grantPermissionsIn(fakeHome);
    process.chdir(fakeHome);
    serve(
      buildSeedPayload({
        skills: { [HONO]: ejected("global", "api-developer") },
        agents: { "api-developer": { scope: "global" } },
      }),
    );

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "Skills copied to:",
        `  ${path.join(fakeHome, CLAUDE_DIR, "skills")}`,
        `    ${HONO}/`,
        "",
        "Agents compiled to:",
        `  ${path.join(fakeHome, CLAUDE_DIR, "agents")}`,
        "    api-developer.md",
        "",
        "Configuration:",
        `  ${path.join(fakeHome, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
        "",
        "To customize agent-skill assignments:",
        "  1. Edit .agents-inc/claude/config.ts",
        "  2. Run 'npx agents-inc compile' to regenerate agents",
        "",
        "",
      ].join("\n"),
    );
    expect(
      await installedAt(fakeHome),
      "the one installation at home holds Hono's copy and api-developer, compiled",
    ).toStrictEqual({
      skills: [copyEntry(HONO, "Hono", "global")],
      agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      copies: [HONO],
      compiled: ["api-developer.md"],
    });
  });

  it("warns which skills the catalogue does not know, and installs the rest", async () => {
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          "web-framework-angular-standalone": ejected("project", "web-developer"),
        },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stderr, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(
      flattenCliOutput(stderr),
      "web-developer carries a skill the catalogue knows, so the warning does not name it",
    ).toBe(
      "Warning: Skipped 1 skill(s) this catalog does not know: web-framework-angular-standalone",
    );
    expect(
      await installedAt(projectDir),
      "the skill the catalogue knows is installed, and the one it does not is recorded nowhere",
    ).toStrictEqual({
      skills: [copyEntry(REACT, "React")],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });

  it("names the sub-agents it installs without a skill the catalogue does not know, which carried only that skill", async () => {
    const unknown = "web-framework-angular-standalone";
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          [unknown]: ejected("project", "api-developer"),
        },
        agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "project" } },
      }),
    );

    const { stderr, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(flattenCliOutput(stderr)).toBe(
      flattenCliOutput(
        [
          `Warning: Skipped 1 skill(s) this catalog does not know: ${unknown}`,
          `  sub-agent(s) installed without ${unknown}, carrying nothing else this catalog knows: api-developer`,
        ].join("\n"),
      ),
    );
    expect(
      (await readTestTsConfig<ProjectConfig>(projectConfigPath())).agents,
      "a sub-agent the configuration names stays though its only skill did not load",
    ).toStrictEqual(buildAgentConfigs(["api-developer", "web-developer"], { scope: "project" }));
    expect(await fileExists(path.join(projectDir, CLAUDE_DIR, "agents", "api-developer.md"))).toBe(
      true,
    );
    const { skills, copies, compiled } = await installedAt(projectDir);
    expect(
      { skills, copies, compiled },
      "React alone is installed, and both sub-agents are compiled",
    ).toStrictEqual({
      skills: [copyEntry(REACT, "React")],
      copies: [REACT],
      compiled: ["api-developer.md", "web-developer.md"],
    });
  });

  it("installs the sub-agents a configuration names when none of its skills installs, with the warning", async () => {
    const unknown = "web-framework-angular-standalone";
    serve(
      buildSeedPayload({
        skills: { [unknown]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stderr, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(flattenCliOutput(stderr)).toBe(
      flattenCliOutput(
        [
          `Warning: Skipped 1 skill(s) this catalog does not know: ${unknown}`,
          `  sub-agent(s) installed without ${unknown}, carrying nothing else this catalog knows: web-developer`,
        ].join("\n"),
      ),
    );
    const config = await readTestTsConfig<ProjectConfig>(projectConfigPath());
    expect({ skills: config.skills, agents: config.agents }).toStrictEqual({
      skills: [],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
    });
    expect(await fileExists(path.join(projectDir, CLAUDE_DIR, "agents", "web-developer.md"))).toBe(
      true,
    );
    const { copies, compiled } = await installedAt(projectDir);
    expect(
      { copies, compiled },
      "nothing is copied, and web-developer alone is compiled",
    ).toStrictEqual({ copies: [], compiled: ["web-developer.md"] });
  });

  it("refuses a configuration that names nothing this catalogue can install", async () => {
    serve(
      buildSeedPayload({
        skills: {
          "web-framework-angular-standalone": buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: {},
          }),
        },
      }),
    );
    const before = await bothRoots();

    const { error } = await initFrom();

    expect(error?.message).toBe(
      `Configuration '${SEED_ID}' contains no skills this catalog can install.`,
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(await fileExists(projectConfigPath()), "a refusal writes nothing").toBe(false);
    expect(
      await bothRoots(),
      "a refusal leaves the project and the home as they were",
    ).toStrictEqual(before);
  });

  it("refuses to install over this project's own installation, naming it", async () => {
    const configPath = await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: "installed" }),
    );
    serve(buildSeedPayload({ skills: { [REACT]: ejected("project", "web-developer") } }));
    const before = await bothRoots();

    const { error } = await initFrom();

    expect(error?.message).toContain(`An installation already exists at ${configPath}.`);
    expect(error?.message).toContain(`'npx agents-inc edit --from ${SEED_ID}'`);
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(await bothRoots(), "the installation it refuses is left as it was").toStrictEqual(
      before,
    );
  });

  it("fails when the configuration cannot be fetched", async () => {
    const before = await bothRoots();

    const { error } = await runCliCommand([
      "init",
      "--from",
      "NoSuchId",
      "--marketplace",
      dirs.sourceDir,
    ]);

    expect(error?.message).toBe("No configuration found for id 'NoSuchId'.");
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(await bothRoots(), "a failed fetch writes nothing").toStrictEqual(before);
  });

  it("installs from the marketplace the configuration names when no --marketplace is given", async () => {
    serve(
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: { [REACT]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { error } = await runCliCommand(["init", "--from", SEED_ID]);

    expect(error).toBeUndefined();
    const config = await readTestTsConfig<ProjectConfig>(
      path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS),
    );
    expect(config.marketplace).toBe(dirs.sourceDir);
    expect(
      await installedAt(projectDir),
      "React is installed from the marketplace the configuration names",
    ).toStrictEqual({
      skills: [copyEntry(REACT, "React")],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });

  it("says it merged with a config here that declared nothing yet", async () => {
    const configPath = await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: "empty", skills: [], agents: [] }),
    );
    serve(
      buildSeedPayload({
        skills: { [REACT]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout } = await initFrom();

    expect(stdout).toContain(
      `Generating configuration...\nMerged with existing config at ${configPath}\nConfiguration saved (1 agent)\n`,
    );
    expect(
      (await readTestTsConfig<FixtureProjectConfig>(configPath)).name,
      "the merge keeps the name the config here gave itself",
    ).toBe("empty");
    expect(
      await installedAt(projectDir),
      "the merged config holds what the configuration installed",
    ).toStrictEqual({
      skills: [copyEntry(REACT, "React")],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });

  it("shows the permission notice to a project that grants no permissions", async () => {
    // The notice is drawn at the width a headless run measures, not the panel's.
    Reflect.deleteProperty(process.stdout, "columns");
    await writeFile(path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON), "{}");
    serve(
      buildSeedPayload({
        skills: { [REACT]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout } = await initFrom();

    expect(stdout).toContain(
      [
        "│ Permission Notice                                                            │",
        "│ No permissions configured in .claude/settings.json                           │",
        "│ Agents will prompt for approval on each tool use.                            │",
      ].join("\n"),
    );
    expect(
      await readFile(path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON), "utf8"),
      "the notice grants nothing on the project's behalf",
    ).toBe("{}");
    expect(await installedAt(projectDir), "the install goes ahead beside the notice").toStrictEqual(
      {
        skills: [copyEntry(REACT, "React")],
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        copies: [REACT],
        compiled: ["web-developer.md"],
      },
    );
  });

  it("names the global entries it kept as installed rather than restate them", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      }),
    );
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          [HONO]: buildSeedSkill({
            install: "plugin",
            scope: "global",
            assignments: { "api-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
      }),
    );
    const globalBefore = await installedAt(fakeHome);

    const { stdout } = await initFrom();

    expect(
      await claude.changes(),
      "the global install already holds Hono, so nothing in Claude's setup changes",
    ).toStrictEqual([]);
    expect(stdout).toContain("│  • Hono ⏏ ");
    expect(stdout).toContain("│  • api-developer ");
    expect(stdout).toContain(
      [
        "┘",
        "",
        "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
        "  skill Hono",
        "  sub-agent api-developer",
        "",
        "Installing 1 skill(s) across 2 sub-agent(s)",
      ].join("\n"),
    );
    expect(
      await installedAt(fakeHome),
      "the global install keeps Hono as the copy it was, and api-developer, untouched",
    ).toStrictEqual(globalBefore);
    expect(
      await installedAt(projectDir),
      "the project installs React beside the global entries it inherits as they were",
    ).toStrictEqual({
      skills: [...buildSkillConfigs([HONO], { scope: "global" }), copyEntry(REACT, "React")],
      agents: [
        ...buildAgentConfigs(["api-developer"], { scope: "global" }),
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
      ],
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });

  it("lists the whole global install the project inherits, each entry unchanged under Global", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO, VITEST], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer", "web-tester"], { scope: "global" }),
      }),
    );
    serve(
      buildSeedPayload({
        skills: { [REACT]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );
    const globalBefore = await installedAt(fakeHome);

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain("│  + React ⏏ ");
    expect(stdout).toContain("│  • Hono ⏏ ");
    expect(stdout).toContain(" • Vitest ⏏ ");
    expect(stdout).toContain("│  + web-developer ");
    expect(stdout).toContain("│  • api-developer ");
    expect(stdout).toContain("│  • web-tester ");
    expect(stdout).not.toContain("+ Hono");
    expect(await installedAt(fakeHome), "the global install is left as it was").toStrictEqual(
      globalBefore,
    );
    expect(
      await installedAt(projectDir),
      "the project inherits every global entry unchanged, beside its own React",
    ).toStrictEqual({
      skills: [
        ...buildSkillConfigs([HONO, VITEST], { scope: "global" }),
        copyEntry(REACT, "React"),
      ],
      agents: [
        ...buildAgentConfigs(["api-developer", "web-tester"], { scope: "global" }),
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
      ],
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });

  it("marks a global sub-agent an arriving skill joins ~, with a line saying what it gains", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
        stack: { "api-developer": { "api-api": [sa(HONO)] } },
      }),
    );
    serve(
      buildSeedPayload({
        skills: {
          [HONO]: ejected("global", "api-developer"),
          [VITEST]: ejected("global", "api-developer"),
        },
        agents: { "api-developer": { scope: "global" } },
      }),
    );

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain("│  • Hono ⏏ ");
    expect(stdout).toContain(" + Vitest ⏏ ");
    expect(stdout).toContain("│  ~ api-developer ");
    expect(stdout).toContain(
      [
        "┘",
        "~ api-developer (global): gains Vitest",
        "",
        "Added to sub-agents in the global install — each keeps everything it already has, since a project run only adds to the global install:",
        "  sub-agent api-developer: + Vitest",
        "",
        "Installing 1 skill(s) across 1 sub-agent(s)",
      ].join("\n"),
    );
    expect(
      await installedAt(fakeHome),
      "the global install adds Vitest's copy beside Hono, and recompiles api-developer",
    ).toStrictEqual({
      skills: [
        ...buildSkillConfigs([HONO], { scope: "global" }),
        copyEntry(VITEST, "Vitest", "global"),
      ],
      agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      copies: [VITEST],
      compiled: ["api-developer.md"],
    });
    expect(
      (await loadInstalledConfig(fakeHome))?.config.stack,
      "api-developer keeps Hono and gains Vitest",
    ).toStrictEqual({ "api-developer": { "api-api": [sa(HONO)], "web-testing": [sa(VITEST)] } });
  });

  it("installs nothing new when every entry is already in the global install, says no count, and names the run from home that changes them", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      }),
    );
    serve(
      buildSeedPayload({
        skills: { [HONO]: ejected("global", "api-developer") },
        agents: { "api-developer": { scope: "global" } },
      }),
    );
    const globalBefore = await installedAt(fakeHome);

    const { stdout } = await initFrom();

    expect(stdout).toContain(
      [
        "┘",
        "",
        "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
        "  sub-agent api-developer",
        `Change them with 'npx agents-inc edit --from ${SEED_ID}' from your home directory.`,
        "",
        "",
      ].join("\n"),
    );
    expect(stdout).not.toContain("Installing ");
    expect(await installedAt(fakeHome), "the global install is left as it was").toStrictEqual(
      globalBefore,
    );
    expect(
      await installedAt(projectDir),
      "the project inherits the global entries, and copies or compiles nothing of its own",
    ).toStrictEqual({ ...globalBefore, copies: [], compiled: [] });
  });

  it("names Claude in the run from home that changes what it keeps, where home holds Codex beside it", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      }),
    );
    const codexConfig = await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({ name: "codex" }),
      ".agents-inc/codex",
    );
    serve(
      buildSeedPayload({
        skills: { [HONO]: ejected("global", "api-developer") },
        agents: { "api-developer": { scope: "global" } },
      }),
    );
    const globalBefore = await installedAt(fakeHome);
    const codexBefore = await readFile(codexConfig, "utf8");

    const { stdout } = await initFrom();

    expect(stdout).toContain(
      [
        `Change them with 'npx agents-inc edit --from ${SEED_ID} --provider claude' from your home directory.`,
        "",
        "",
      ].join("\n"),
    );
    expect(await installedAt(fakeHome), "the global install is left as it was").toStrictEqual(
      globalBefore,
    );
    expect(await readFile(codexConfig, "utf8"), "the Codex installation is left as it was").toBe(
      codexBefore,
    );
  });

  it("names a global skill it kept as installed, and no sub-agent when each is restated", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
        stack: { "api-developer": { "api-api": [sa(HONO)] } },
      }),
    );
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          [HONO]: buildSeedSkill({
            install: "plugin",
            scope: "global",
            assignments: { "api-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
      }),
    );
    const globalBefore = await installedAt(fakeHome);

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(
      await claude.changes(),
      "the global install already holds Hono, so nothing in Claude's setup changes",
    ).toStrictEqual([]);
    expect(stdout).toContain(
      [
        "┘",
        "",
        "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
        "  skill Hono",
        "",
        "Installing 1 skill(s) across 2 sub-agent(s)",
      ].join("\n"),
    );
    expect(
      await installedAt(fakeHome),
      "the global install keeps Hono as the copy it was, not the plugin this configuration states",
    ).toStrictEqual(globalBefore);
    expect(
      (await installedAt(projectDir)).copies,
      "React's is the one copy it makes",
    ).toStrictEqual([REACT]);
  });

  /** Recorded under a name the marketplace no longer gives it, with no copy here to name it. */
  it("names a global skill it kept as installed by the name the global install recorded, as the panel row does", async () => {
    const recordedName = "Acme Hono";
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], {
          scope: "global",
          origin: "eject",
          displayName: recordedName,
        }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
        stack: { "api-developer": { "api-api": [sa(HONO)] } },
      }),
    );
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          [HONO]: buildSeedSkill({
            install: "plugin",
            scope: "global",
            assignments: { "api-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
      }),
    );
    const globalBefore = await installedAt(fakeHome);

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(
      await claude.changes(),
      "the global install already holds Hono, so nothing in Claude's setup changes",
    ).toStrictEqual([]);
    expect(stdout, "the panel draws the global skill it keeps by its record").toContain(
      `│  • ${recordedName} ⏏ `,
    );
    expect(stdout, "the notice names the kept skill as the panel row above it does").toContain(
      [
        "┘",
        "",
        "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
        `  skill ${recordedName}`,
        "",
        "Installing 1 skill(s) across 2 sub-agent(s)",
      ].join("\n"),
    );
    expect(
      await installedAt(fakeHome),
      "the global install keeps Hono as recorded, not the plugin this configuration states",
    ).toStrictEqual(globalBefore);
    expect(
      await installedAt(projectDir),
      "the project inherits the global entries with the name each recorded, beside its own React",
    ).toStrictEqual({
      skills: [
        ...buildSkillConfigs([HONO], { scope: "global", displayName: recordedName }),
        copyEntry(REACT, "React"),
      ],
      agents: [
        ...buildAgentConfigs(["api-developer"], { scope: "global" }),
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
      ],
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });

  /** The pair of each spec here whose global install already holds Hono: here nothing holds it. */
  it("installs a global plugin skill the global install does not hold through Claude's CLI", async () => {
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          [HONO]: buildSeedSkill({
            install: "plugin",
            scope: "global",
            assignments: { "api-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
      }),
    );

    const { error } = await initFrom();

    expect(error).toBeUndefined();
    expect(
      await claude.changes(),
      "Claude's CLI registers the marketplace, then installs Hono for the user",
    ).toStrictEqual([
      `plugin marketplace add ${dirs.sourceDir}`,
      `plugin install ${HONO}@${TEST_MARKETPLACE_NAME} --scope user`,
    ]);
    const honoPlugin = buildSkillConfig(HONO, {
      scope: "global",
      origin: TEST_MARKETPLACE_NAME,
      displayName: "Hono",
    });
    expect(
      await installedAt(fakeHome),
      "the global install records Hono as the plugin, with no copy, and compiles api-developer",
    ).toStrictEqual({
      skills: [honoPlugin],
      agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      copies: [],
      compiled: ["api-developer.md"],
    });
    expect(
      await installedAt(projectDir),
      "the project holds React's copy and web-developer, beside the global plugin it inherits",
    ).toStrictEqual({
      skills: [honoPlugin, copyEntry(REACT, "React")],
      agents: [
        ...buildAgentConfigs(["api-developer"], { scope: "global" }),
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
      ],
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });

  it("names a global sub-agent it kept as installed, and no skill when each is restated", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
      }),
    );
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          [HONO]: ejected("global", "api-developer"),
        },
        agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
      }),
    );
    const globalBefore = await installedAt(fakeHome);

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "┘",
        "",
        "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
        "  sub-agent api-developer",
        "",
        "Installing 1 skill(s) across 2 sub-agent(s)",
      ].join("\n"),
    );
    expect(
      await installedAt(fakeHome),
      "the global install keeps api-developer as it was, carrying nothing it did not",
    ).toStrictEqual(globalBefore);
  });

  it("installs only what the global install does not already hold", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
        stack: { "api-developer": { "api-api": [sa(HONO)] } },
      }),
    );
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          [HONO]: ejected("global", "api-developer"),
        },
        agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
      }),
    );

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "Selected 1 skill",
        "Install mode: Eject (local copy)",
        "Copying skills to local directory...",
        `Copied 1 skill to ${path.join(projectDir, CLAUDE_DIR, "skills")}/`,
      ].join("\n"),
    );
    expect(
      (await installedAt(fakeHome)).copies,
      "Hono, which the global install holds, is not copied again",
    ).toStrictEqual([]);
    expect(
      await installedAt(projectDir),
      "the project installs React beside the global Hono it inherits",
    ).toStrictEqual({
      skills: [...buildSkillConfigs([HONO], { scope: "global" }), copyEntry(REACT, "React")],
      agents: [
        ...buildAgentConfigs(["api-developer"], { scope: "global" }),
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
      ],
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });

  it("recompiles only the project's sub-agents beside a global install it leaves as it was", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
        stack: { "api-developer": { "api-api": [sa(HONO)] } },
      }),
    );
    serve(
      buildSeedPayload({
        skills: { [REACT]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );
    const globalBefore = await installedAt(fakeHome);

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain("Compiling agents...\nCompiled 1 agent\n");
    expect(await fileExists(path.join(fakeHome, CLAUDE_DIR, "agents", "api-developer.md"))).toBe(
      false,
    );
    expect(await installedAt(fakeHome), "the global install is left as it was").toStrictEqual(
      globalBefore,
    );
    expect(
      (await installedAt(projectDir)).compiled,
      "web-developer is compiled here",
    ).toStrictEqual(["web-developer.md"]);
  });

  it("recompiles each project registered against the global install it adds to, and says so", async () => {
    const registered = path.join(dirs.tempDir, "registered");
    await writeTestTsConfig(registered, buildProjectConfig({ name: "registered" }));
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
        stack: { "api-developer": { "api-api": [sa(HONO)] } },
        projects: [registered],
      }),
    );
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          [VITEST]: ejected("global", "api-developer"),
        },
        agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
      }),
    );

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain("\nRegistered projects: 1 recompiled\n");
    expect(
      await installedAt(registered),
      "the registered project inherits Vitest, keeps its own entries, and is compiled",
    ).toStrictEqual({
      skills: [
        ...buildSkillConfigs([HONO], { scope: "global" }),
        copyEntry(VITEST, "Vitest", "global"),
        ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
      ],
      agents: [
        ...buildAgentConfigs(["api-developer"], { scope: "global" }),
        ...buildAgentConfigs(["web-developer"], { scope: "project" }),
      ],
      copies: [],
      compiled: ["web-developer.md"],
    });
  });

  it("installs a sub-agent on its own, with no skill", async () => {
    serve(
      buildSeedPayload({ skills: {}, agents: { "web-developer": { on: true, scope: "project" } } }),
    );

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain("Configuration saved (1 agent)\n");
    expect(await fileExists(path.join(projectDir, CLAUDE_DIR, "agents", "web-developer.md"))).toBe(
      true,
    );
    expect(
      await installedAt(projectDir),
      "web-developer is recorded and compiled, and no skill is",
    ).toStrictEqual({
      skills: [],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      copies: [],
      compiled: ["web-developer.md"],
    });
  });

  it("installs a skill no sub-agent carries, warns that nothing loads it, and points at the configs it wrote", async () => {
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: buildSeedSkill({ install: "eject", scope: "project", assignments: {} }),
        },
        agents: {},
      }),
    );

    const { stdout, stderr, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(flattenCliOutput(stderr)).toContain(
      "Warning: Skill 'React' is assigned to no sub-agent — nothing will load it.",
    );
    expect(
      stdout.endsWith(
        [
          "Configuration:",
          `  ${path.join(fakeHome, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
          `  ${path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)}`,
          "",
          "To customize agent-skill assignments:",
          "  1. Edit .agents-inc/claude/config.ts",
          "  2. Run 'npx agents-inc compile' to regenerate agents",
          "",
          "",
        ].join("\n"),
      ),
    ).toBe(true);
    expect(
      await installedAt(projectDir),
      "React is recorded and copied, and no sub-agent is compiled",
    ).toStrictEqual({
      skills: [copyEntry(REACT, "React")],
      agents: [],
      copies: [REACT],
      compiled: [],
    });
  });

  it("warns of a skill folder here whose metadata describes no skill, as the load found it", async () => {
    const strayDir = path.join(projectDir, CLAUDE_DIR, "skills", "stray-skill");
    await mkdir(strayDir, { recursive: true });
    await writeFile(path.join(strayDir, STANDARD_FILES.SKILL_MD), renderSkillMd("stray-skill"));
    await writeFile(
      path.join(strayDir, STANDARD_FILES.METADATA_YAML),
      renderUnparseableMetadataYaml(),
    );
    serve(
      buildSeedPayload({
        skills: { [REACT]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const strayBefore = await readInstallTree(strayDir);

    const { stderr, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(compactCliOutput(stderr)).toContain(
      compactCliOutput(
        `Warning: Skipping local skill 'stray-skill': metadata.yaml at ${path.join(strayDir, STANDARD_FILES.METADATA_YAML)} does not describe it`,
      ),
    );
    expect(await readInstallTree(strayDir), "the folder it skips is left as it was").toStrictEqual(
      strayBefore,
    );
    expect(
      await installedAt(projectDir),
      "React is installed beside the skipped folder, which no config entry names",
    ).toStrictEqual({
      skills: [copyEntry(REACT, "React")],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      copies: ["stray-skill", REACT],
      compiled: ["web-developer.md"],
    });
  });

  it("fails, naming the cause, when the marketplace it is pointed at cannot be loaded", async () => {
    const missing = path.join(dirs.tempDir, "no-such-marketplace");
    serve(
      buildSeedPayload({
        skills: { [REACT]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );
    const before = await bothRoots();

    const { error } = await runCliCommand(["init", "--from", SEED_ID, "--marketplace", missing]);

    expect(error?.message).toBe(
      [
        `Local marketplace not found: '${missing}'`,
        "",
        "Nothing is at that path, and a local marketplace must be a directory holding skills.",
        "",
        "Check it for a typo, or name a marketplace that exists:",
        "  --marketplace github:agents-inc/skills",
      ].join("\n"),
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(
      await fileExists(path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS)),
    ).toBe(false);
    expect(await bothRoots(), "a failed load writes nothing").toStrictEqual(before);
  });

  it("warns which sub-agents the catalogue does not know, and installs the rest", async () => {
    serve(
      buildSeedPayload({
        skills: { [REACT]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" }, "no-such-agent": { scope: "project" } },
      }),
    );

    const { stderr, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(flattenCliOutput(stderr)).toContain(
      "Warning: Skipped 1 unknown sub-agent(s): no-such-agent",
    );
    expect(
      await installedAt(projectDir),
      "the sub-agent the catalogue knows is installed, and the one it does not is recorded nowhere",
    ).toStrictEqual({
      skills: [copyEntry(REACT, "React")],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });

  it("writes the skills the configuration carries, and names them", async () => {
    serve(reactAndACarriedSkill());

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      "\nWrote 1 skill(s) this configuration carries: Brainstorming\nInstalling 2 skill(s) across 1 sub-agent(s)\n",
    );
    expect(
      await installedAt(projectDir),
      "the carried skill is installed beside React, each a local copy",
    ).toStrictEqual({
      skills: [copyEntry(REACT, "React"), copyEntry(CARRIED, "Brainstorming")],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      copies: [CARRIED, REACT],
      compiled: ["web-developer.md"],
    });
  });

  // Root writes through the mode bits, so the failures under test cannot happen there.
  describe.skipIf(process.getuid?.() === 0)("a write the file system refuses", () => {
    it("records each agent it could not compile, withholds the success line, and exits with failures", async () => {
      const agentsDir = path.join(projectDir, CLAUDE_DIR, "agents");
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, "notes.txt"), "the user's own file");
      const { chmod } = await import("fs/promises");
      await chmod(agentsDir, 0o555);
      serve(
        buildSeedPayload({
          skills: { [REACT]: ejected("project", "web-developer") },
          agents: { "web-developer": { scope: "project" } },
        }),
      );
      try {
        const { stdout, stderr, error } = await initFrom();

        expect(stdout).toContain("Compiling agents...\nCompiled 0 agents (1 failed)\n");
        expect(stdout).not.toContain("initialized successfully");
        expect(flattenCliOutput(stderr)).toContain("web-developer");
        expect(stdout).toContain("  1 sub-agent(s) did not compile: web-developer");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.COMPLETED_WITH_FAILURES);
        const { skills, agents, copies } = await installedAt(projectDir);
        expect(
          { skills, agents, copies },
          "the config and the copy are written before the compile fails",
        ).toStrictEqual({
          skills: [copyEntry(REACT, "React")],
          agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
          copies: [REACT],
        });
      } finally {
        await chmod(agentsDir, 0o755);
      }
    });

    it("fails with the cause when the configuration cannot be written", async () => {
      const sourceFolder = path.join(projectDir, ".agents-inc", "claude");
      await mkdir(sourceFolder, { recursive: true });
      const { chmod } = await import("fs/promises");
      await chmod(sourceFolder, 0o555);
      serve(
        buildSeedPayload({
          skills: { [REACT]: ejected("project", "web-developer") },
          agents: { "web-developer": { scope: "project" } },
        }),
      );
      try {
        const { error } = await initFrom();

        expect(error?.message).toContain("EACCES");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      } finally {
        await chmod(sourceFolder, 0o755);
      }
    });

    it("at home, leaves its config as it was and no copy when the types half cannot be written after the config half", async () => {
      await grantPermissionsIn(fakeHome);
      await writeRawTestConfig(fakeHome, generateBlankGlobalConfigSource());
      await writeFile(typesFileAt(fakeHome), generateBlankGlobalConfigTypesSource());
      const pairAt = async (root: string) => ({
        config: await readFile(configFileAt(root), "utf-8"),
        types: await readFile(typesFileAt(root), "utf-8"),
      });
      const pairBefore = await pairAt(fakeHome);
      const { chmod } = await import("fs/promises");
      await chmod(typesFileAt(fakeHome), READ_ONLY_FILE);
      process.chdir(fakeHome);
      serve(
        buildSeedPayload({
          skills: { [HONO]: ejected("global", "api-developer") },
          agents: { "api-developer": { scope: "global" } },
        }),
      );
      try {
        const { error } = await initFrom();

        expect(error?.message).toContain("EACCES");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      } finally {
        await chmod(typesFileAt(fakeHome), READ_WRITE_FILE);
      }
      expect(
        { pair: await pairAt(fakeHome), copies: await entriesIn(skillsDirAt(fakeHome)) },
        "a refused types half puts the config half back, so no config names a copy taken back",
      ).toStrictEqual({ pair: pairBefore, copies: [] });
    });

    describe("beside a global install", () => {
      const sourceFolder = () => path.join(projectDir, ".agents-inc", "claude");

      beforeEach(async () => {
        await writeTestTsConfig(
          fakeHome,
          buildProjectConfig({
            name: "global",
            skills: buildSkillConfigs([HONO], { scope: "global", origin: "eject" }),
            agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
            stack: { "api-developer": { "api-api": [sa(HONO)] } },
          }),
        );
        await mkdir(sourceFolder(), { recursive: true });
      });

      async function globalInstallAt(home: string) {
        const { projects } = await readTestTsConfig<FixtureProjectConfig>(configFileAt(home));
        return { ...(await installedAt(home)), registered: projects };
      }

      async function initFromUnwritable(payload: SeedPayload) {
        const { chmod } = await import("fs/promises");
        await chmod(sourceFolder(), 0o555);
        serve(payload);
        try {
          return await initFrom();
        } finally {
          await chmod(sourceFolder(), 0o755);
        }
      }

      const projectReact = () =>
        buildSeedPayload({
          skills: { [REACT]: ejected("project", "web-developer") },
          agents: { "web-developer": { scope: "project" } },
        });

      const projectReactAndGlobalVitest = () =>
        buildSeedPayload({
          skills: {
            [REACT]: ejected("project", "web-developer"),
            [VITEST]: ejected("global", "api-developer"),
          },
          agents: { "web-developer": { scope: "project" }, "api-developer": { scope: "global" } },
        });

      it("leaves no copy here, and the global install as it was, saying why, when the configuration cannot be written", async () => {
        const homeBefore = await globalInstallAt(fakeHome);

        const { error } = await initFromUnwritable(projectReact());

        expect(error?.message).toContain("EACCES");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        expect(
          {
            copies: await entriesIn(skillsDirAt(projectDir)),
            home: await globalInstallAt(fakeHome),
          },
          "a refused save leaves no copy here and the global install as it was",
        ).toStrictEqual({ copies: [], home: homeBefore });
      });

      it("leaves no copy at home either, and adds nothing to the global install, when the configuration cannot be written", async () => {
        const homeBefore = await globalInstallAt(fakeHome);

        const { error } = await initFromUnwritable(projectReactAndGlobalVitest());

        expect(error?.message).toContain("EACCES");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        expect(
          {
            copies: await entriesIn(skillsDirAt(projectDir)),
            home: await globalInstallAt(fakeHome),
          },
          "a refused save leaves no copy at either root and the global install as it was",
        ).toStrictEqual({ copies: [], home: homeBefore });
      });

      it("leaves no copy of a skill the configuration carries when the configuration cannot be written", async () => {
        const homeBefore = await globalInstallAt(fakeHome);

        const { error } = await initFromUnwritable(reactAndACarriedSkill());

        expect(error?.message).toContain("EACCES");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        expect(
          {
            copies: await entriesIn(skillsDirAt(projectDir)),
            home: await globalInstallAt(fakeHome),
          },
          "a refused save leaves neither the carried skill nor React here",
        ).toStrictEqual({ copies: [], home: homeBefore });
      });

      it("says, after the error, that it removed the skill the configuration carried, and nothing of copies, when it copied none", async () => {
        const homeBefore = await globalInstallAt(fakeHome);

        const { stdout, error } = await initFromUnwritable(aCarriedSkillAlone());

        expect(error?.message).toContain("EACCES");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        const ending =
          "Generating configuration...\n" +
          "Removed the 1 skill this configuration carried, since the configuration could not be saved\n";
        expect(stdout.slice(-ending.length), stdout).toBe(ending);
        expect(
          {
            projectConfig: await entriesIn(sourceFolder()),
            copies: await entriesIn(skillsDirAt(projectDir)),
            home: await globalInstallAt(fakeHome),
          },
          "the line is true: the carried skill is gone and nothing was saved",
        ).toStrictEqual({ projectConfig: [], copies: [], home: homeBefore });
      });

      it("says, after the error, that it removed the skill it copied and then the skill the configuration carried", async () => {
        const homeBefore = await globalInstallAt(fakeHome);

        const { stdout, error } = await initFromUnwritable(reactAndACarriedSkill());

        expect(error?.message).toContain("EACCES");
        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        const ending =
          "Generating configuration...\n" +
          "Removed the 1 skill it copied, since the configuration could not be saved\n" +
          "Removed the 1 skill this configuration carried, since the configuration could not be saved\n";
        expect(stdout.slice(-ending.length), stdout).toBe(ending);
        expect(
          {
            projectConfig: await entriesIn(sourceFolder()),
            copies: await entriesIn(skillsDirAt(projectDir)),
            home: await globalInstallAt(fakeHome),
          },
          "both lines are true: React and the carried skill are gone and nothing was saved",
        ).toStrictEqual({ projectConfig: [], copies: [], home: homeBefore });
      });

      it("leaves no project config and no copy, and the global install as it was, when the global configuration cannot be written", async () => {
        const homeBefore = await globalInstallAt(fakeHome);
        const { chmod } = await import("fs/promises");
        await chmod(configFileAt(fakeHome), READ_ONLY_FILE);
        serve(projectReactAndGlobalVitest());
        try {
          const { error } = await initFrom();

          expect(error?.message).toContain("EACCES");
          expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        } finally {
          await chmod(configFileAt(fakeHome), READ_WRITE_FILE);
        }
        expect(
          {
            projectConfig: await entriesIn(sourceFolder()),
            copies: await entriesIn(skillsDirAt(projectDir)),
            home: await globalInstallAt(fakeHome),
          },
          "the project's config pair, written before the global one, is taken back with the copies",
        ).toStrictEqual({ projectConfig: [], copies: [], home: homeBefore });
      });

      it("leaves no project config and no copy, and the global install as it was, when the global types cannot be written after the global config", async () => {
        await writeFile(typesFileAt(fakeHome), generateBlankGlobalConfigTypesSource());
        const homeBefore = await globalInstallAt(fakeHome);
        const { chmod } = await import("fs/promises");
        await chmod(typesFileAt(fakeHome), READ_ONLY_FILE);
        serve(projectReactAndGlobalVitest());
        try {
          const { error } = await initFrom();

          expect(error?.message).toContain("EACCES");
          expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        } finally {
          await chmod(typesFileAt(fakeHome), READ_WRITE_FILE);
        }
        expect(
          {
            projectConfig: await entriesIn(sourceFolder()),
            copies: await entriesIn(skillsDirAt(projectDir)),
            home: await globalInstallAt(fakeHome),
          },
          "a refused types half puts the global config half back, so home names no copy taken back",
        ).toStrictEqual({ projectConfig: [], copies: [], home: homeBefore });
      });

      it("keeps each copy it made, and registers the project at home, when the configuration is written", async () => {
        const homeBefore = await globalInstallAt(fakeHome);
        serve(projectReactAndGlobalVitest());

        const { error } = await initFrom();

        expect(error).toBeUndefined();
        expect(
          {
            copies: await entriesIn(skillsDirAt(projectDir)),
            home: await globalInstallAt(fakeHome),
          },
          "a written save keeps both copies, and home gains Vitest, the sub-agent it joins and the project",
        ).toStrictEqual({
          copies: [REACT],
          home: {
            ...homeBefore,
            skills: [...homeBefore.skills, copyEntry(VITEST, "Vitest", "global")],
            copies: [VITEST],
            compiled: ["api-developer.md"],
            registered: [await realpath(projectDir)],
          },
        });
      });
    });
  });
});

describe("what init --from says at a terminal", () => {
  useMockWorker();
  const terminal = standAtTerminal();
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-init-from-asks-test-"));
    dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
    await mkdir(path.join(projectDir, CLAUDE_DIR), { recursive: true });
    await writeFile(
      path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] } }),
    );
    configMockServer.use(
      storedConfigHandlerFor(
        SEED_ID,
        buildSeedPayload({
          skills: {
            [REACT]: buildSeedSkill({
              install: "eject",
              scope: "project",
              assignments: { "web-developer": "lazy" },
            }),
          },
          agents: { "web-developer": { scope: "project" } },
        }),
      ),
    );
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
    await cleanup();
  });

  const projectConfig = () =>
    path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);

  async function answer(key: string) {
    const run = runCliCommand(["init", "--from", SEED_ID, "--marketplace", dirs.sourceDir]);
    await delay(CONFIRM_INPUT_DELAY_MS * 5);
    terminal.input.push(key);
    return run;
  }

  it("asks before installing, and writes nothing on a no", async () => {
    const before = await treesUnder(projectDir, fakeHome);

    const { stdout, error } = await answer(KEY_N);

    expect(stdout).toContain("Setup cancelled\n");
    expect(error?.oclif?.exit).toBe(EXIT_CODES.CANCELLED);
    expect(await fileExists(projectConfig())).toBe(false);
    expect(
      await treesUnder(projectDir, fakeHome),
      "a no leaves the project and the home as they were",
    ).toStrictEqual(before);
  });

  it("installs on a yes", async () => {
    const { error } = await answer(KEY_Y);

    expect(error).toBeUndefined();
    expect(await fileExists(projectConfig())).toBe(true);
    expect(await installedAt(projectDir), "a yes installs what the panel listed").toStrictEqual({
      skills: [copyEntry(REACT, "React")],
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      copies: [REACT],
      compiled: ["web-developer.md"],
    });
  });
});

/** The routes that never install: each opens the editor, and says where and what comes next. */
describe("what init says on its way to the editor", () => {
  let projectDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-init-editor-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  it("points a bare init where nothing is installed at the editor", async () => {
    const { stdout, error } = await runCliCommand(["init"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        "Build it at http://localhost:5173/editor",
        "Then install what it gives you with 'npx agents-inc init --from <id>'.",
        "",
      ].join("\n"),
    );
  });

  it("opens the editor on the id --ui --from names", async () => {
    const { stdout } = await runCliCommand(["init", "--ui", "--from", "Abc123"]);

    expect(stdout).toBe(
      [
        "Open it at http://localhost:5173/editor/?fromId=Abc123",
        "To install it here instead, run 'npx agents-inc init --from Abc123'.",
        "",
      ].join("\n"),
    );
  });

  it("says to apply with edit where this project holds its own installation", async () => {
    await writeTestTsConfig(projectDir, buildProjectConfig({ name: "installed" }));

    const { stdout } = await runCliCommand(["init", "--ui"]);

    expect(stdout).toContain(
      "Then apply what it gives you with 'npx agents-inc edit --from <id>'.\n",
    );
  });

  it("says how to add a named marketplace from the editor", async () => {
    const { stdout } = await runCliCommand(["init", "--marketplace", "github:acme/skills"]);

    expect(stdout).toBe(
      [
        "Build it at http://localhost:5173/editor",
        "Add github:acme/skills from the editor's Marketplace button.",
        "Then install what it gives you with 'npx agents-inc init --from <id>'.",
        "",
      ].join("\n"),
    );
  });

  it("says a folder marketplace must reach GitHub before the editor can add it", async () => {
    const { stdout } = await runCliCommand(["init", "--marketplace", "./my-marketplace"]);

    expect(stdout).toContain(
      "./my-marketplace is a folder on this machine, which the editor cannot read — push it to GitHub, then add it from the editor's Marketplace button.\n",
    );
  });

  it("says how to add a marketplace URL from the editor", async () => {
    const { stdout, error } = await runCliCommand([
      "init",
      "--marketplace",
      "https://github.com/acme/skills",
    ]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        "Build it at http://localhost:5173/editor",
        "Add https://github.com/acme/skills from the editor's Marketplace button.",
        "Then install what it gives you with 'npx agents-inc init --from <id>'.",
        "",
      ].join("\n"),
    );
  });

  it("refuses a marketplace URL carrying a username or password before saying anything, and never shows them", async () => {
    const { stdout, stderr, error } = await runCliCommand([
      "init",
      "--marketplace",
      "https://user:hunter2@github.com/acme/skills",
    ]);

    expect(stdout).toBe("");
    expect(error?.message).toBe(
      [
        'The marketplace carries a username or password in its URL: "https://***@github.com/acme/skills"',
        "",
        "Credentials in a marketplace URL end up in config files, shared configurations and logs.",
        "For a private repository, set the GIGET_AUTH environment variable instead:",
        "  export GIGET_AUTH=ghp_your_github_token",
        "Examples:",
        "  --marketplace https://github.com/user/repo",
        "  --marketplace https://gitlab.company.com/team/skills",
      ].join("\n"),
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(stderr, "the password must reach no output").not.toContain("hunter2");
  });

  it("refuses a marketplace URL at a NAT64 local-use address before saying anything", async () => {
    const { stdout, error } = await runCliCommand([
      "init",
      "--marketplace",
      "http://[64:ff9b:1::7f00:1]/skills.tar.gz",
    ]);

    expect(stdout).toBe("");
    expect(error?.message).toBe(
      [
        'The marketplace points to a private or reserved IP address: "http://[64:ff9b:1::7f00:1]/skills.tar.gz"',
        "",
        "Marketplace URLs must not target private network addresses.",
        "Use a public hostname instead.",
        "Examples:",
        "  --marketplace https://github.com/user/repo",
        "  --marketplace https://gitlab.company.com/team/skills",
      ].join("\n"),
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
  });

  it.each([
    ["an empty", ""],
    ["an all-blank", "   "],
  ])("refuses %s marketplace before saying anything", async (_kind, marketplace) => {
    const { stdout, error } = await runCliCommand(["init", "--marketplace", marketplace]);

    expect(stdout).toBe("");
    expect(error?.message).toBe(
      "The marketplace cannot be empty. Provide a valid marketplace: a local directory path or a git repository URL (e.g., './my-skills' or 'https://github.com/user/repo')",
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
  });

  it("refuses --provider without --from, as a usage error", async () => {
    const { error } = await runCliCommand(["init", "--provider", "codex"]);

    expect(error?.message).toBe(
      "--provider names which installation to create and needs the configuration to create it from, so it is only meaningful beside --from. Build one at http://localhost:5173/editor, then run 'npx agents-inc init --from <id> --provider <provider>'.",
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.INVALID_ARGS);
  });
});
