import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { runCliCommand } from "../helpers/cli-runner.js";
import { printAtWidth, standAtTerminal } from "../helpers/terminal-input.js";
import { fileExists } from "../test-fs-utils";
import { CONFIRM_INPUT_DELAY_MS, delay, KEY_N, KEY_Y } from "../test-constants";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { readTestTsConfig, writeTestTsConfig } from "../helpers/config-io.js";
import { compactCliOutput, flattenCliOutput } from "../helpers/flatten-cli-output.js";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../factories/seed-factories.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { renderSkillMd, renderUnparseableMetadataYaml } from "../content-generators";
import { sa } from "../factories/skill-factories.js";
import { CLAUDE_DIR, STANDARD_FILES } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import type { ProjectConfig } from "../../../types";

const SEED_ID = "Seed1";

/** Wide enough that no test-marketplace id wraps inside the panel, whose rows these specs pin. */
const PANEL_COLUMNS = 160;
const REACT = testMarketplaceSkillId("web-framework-react");
const HONO = testMarketplaceSkillId("api-framework-hono");
const VITEST = testMarketplaceSkillId("web-testing-vitest");

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

  const projectConfigPath = () =>
    path.join(projectDir, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);

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
    expect(stdout).toContain(`│  + ${REACT} ⏏ `);
    expect(stdout).toContain(`│  + ${HONO} ⏏ `);
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

    const { error } = await initFrom();

    expect(error?.message).toBe(
      `Configuration '${SEED_ID}' contains no skills this catalog can install.`,
    );
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(await fileExists(projectConfigPath()), "a refusal writes nothing").toBe(false);
  });

  it("refuses to install over this project's own installation, naming it", async () => {
    const configPath = await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: "installed" }),
    );
    serve(buildSeedPayload({ skills: { [REACT]: ejected("project", "web-developer") } }));

    const { error } = await initFrom();

    expect(error?.message).toContain(`An installation already exists at ${configPath}.`);
    expect(error?.message).toContain(`'npx agents-inc edit --from ${SEED_ID}'`);
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
  });

  it("fails when the configuration cannot be fetched", async () => {
    const { error } = await runCliCommand([
      "init",
      "--from",
      "NoSuchId",
      "--marketplace",
      dirs.sourceDir,
    ]);

    expect(error?.message).toBe("No configuration found for id 'NoSuchId'.");
    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
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

    const { stdout } = await initFrom();

    expect(stdout).toContain(`│  • ${HONO} ⏏ `);
    expect(stdout).toContain("│  • api-developer ");
    expect(stdout).toContain(
      [
        "┘",
        "",
        "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
        `  skill ${HONO}`,
        "  sub-agent api-developer",
        "",
        "Installing 1 skill(s) across 2 sub-agent(s)",
      ].join("\n"),
    );
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

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain(`│  + ${REACT} ⏏ `);
    expect(stdout).toContain(`│  • ${HONO} ⏏ `);
    expect(stdout).toContain(` • ${VITEST} ⏏ `);
    expect(stdout).toContain("│  + web-developer ");
    expect(stdout).toContain("│  • api-developer ");
    expect(stdout).toContain("│  • web-tester ");
    expect(stdout).not.toContain(`+ ${HONO}`);
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
    expect(stdout).toContain(`│  • ${HONO} ⏏ `);
    expect(stdout).toContain(` + ${VITEST} ⏏ `);
    expect(stdout).toContain("│  ~ api-developer ");
    expect(stdout).toContain(
      [
        "┘",
        `~ api-developer (global): gains ${VITEST}`,
        "",
        "Added to sub-agents in the global install — each keeps everything it already has, since a project run only adds to the global install:",
        `  sub-agent api-developer: + ${VITEST}`,
        "",
        "Installing 1 skill(s) across 1 sub-agent(s)",
      ].join("\n"),
    );
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
    await writeTestTsConfig(fakeHome, buildProjectConfig({ name: "codex" }), ".agents-inc/codex");
    serve(
      buildSeedPayload({
        skills: { [HONO]: ejected("global", "api-developer") },
        agents: { "api-developer": { scope: "global" } },
      }),
    );

    const { stdout } = await initFrom();

    expect(stdout).toContain(
      [
        `Change them with 'npx agents-inc edit --from ${SEED_ID} --provider claude' from your home directory.`,
        "",
        "",
      ].join("\n"),
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

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "┘",
        "",
        "Kept as installed in the global install — this configuration states them differently or leaves them out, and a project run only adds to the global install:",
        `  skill ${HONO}`,
        "",
        "Installing 1 skill(s) across 2 sub-agent(s)",
      ].join("\n"),
    );
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

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain("Compiling agents...\nCompiled 1 agent\n");
    expect(await fileExists(path.join(fakeHome, CLAUDE_DIR, "agents", "api-developer.md"))).toBe(
      false,
    );
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
      `Warning: Skill '${REACT}' is assigned to no sub-agent — nothing will load it.`,
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

    const { stderr, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(compactCliOutput(stderr)).toContain(
      compactCliOutput(
        `Warning: Skipping local skill 'stray-skill': metadata.yaml at ${path.join(strayDir, STANDARD_FILES.METADATA_YAML)} does not describe it`,
      ),
    );
  });

  it("fails, naming the cause, when the marketplace it is pointed at cannot be loaded", async () => {
    const missing = path.join(dirs.tempDir, "no-such-marketplace");
    serve(
      buildSeedPayload({
        skills: { [REACT]: ejected("project", "web-developer") },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

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
  });

  it("writes the skills the configuration carries, and names them", async () => {
    const carried = "external-web-testing-brainstorming";
    serve(
      buildSeedPayload({
        skills: {
          [REACT]: ejected("project", "web-developer"),
          [carried]: ejected("project", "web-developer"),
        },
        external: { [carried]: buildSeedExternalSkill({ categoryId: "web-testing" }) },
        agents: { "web-developer": { scope: "project" } },
      }),
    );

    const { stdout, error } = await initFrom();

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      `\nWrote 1 skill(s) this configuration carries: ${carried}\nInstalling 2 skill(s) across 1 sub-agent(s)\n`,
    );
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
  });
});

describe("what init --from says at a terminal", () => {
  useMockWorker();
  const terminal = standAtTerminal();
  let projectDir: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  beforeEach(async () => {
    ({ projectDir, cleanup } = await setupIsolatedHome("cc-init-from-asks-test-"));
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
    const { stdout, error } = await answer(KEY_N);

    expect(stdout).toContain("Setup cancelled\n");
    expect(error?.oclif?.exit).toBe(EXIT_CODES.CANCELLED);
    expect(await fileExists(projectConfig())).toBe(false);
  });

  it("installs on a yes", async () => {
    const { error } = await answer(KEY_Y);

    expect(error).toBeUndefined();
    expect(await fileExists(projectConfig())).toBe(true);
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
