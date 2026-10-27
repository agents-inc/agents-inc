import path from "path";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { printAtWidth, standAtTerminal } from "../helpers/terminal-input.js";
import { readTestTsConfig, writeTestTsConfig } from "../helpers/config-io.js";
import {
  buildSkillConfig,
  buildSkillConfigs,
  type FixtureProjectConfig,
} from "../helpers/skill-config-builders.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../factories/seed-factories.js";
import { createTestSkill } from "../factories/skill-factories.js";
import { renderMetadataYaml } from "../content-generators";
import { firstElement } from "../helpers/element-at.js";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  TEST_MARKETPLACE_NAME,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { CLAUDE_DIR, STANDARD_DIRS, STANDARD_FILES } from "../../../consts";
import { directoryExists, fileExists } from "../test-fs-utils";
import { EXIT_CODES } from "../../exit-codes";
import { hostAt } from "../../hosts/host-for.js";
import { delay, KEY_N, KEY_Y } from "../test-constants";

/**
 * The host is the seam: the real one runs `claude`. Imported from source so the module mock reaches
 * it; the load, copies, config write and compile run for real.
 */
vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../helpers/mock-plugin-host.js");
  const host = createMockPluginHost();
  return { hostAt: () => host, hostFor: () => host };
});

const { default: Edit } = await import("../../../commands/edit.js");
const { default: Init } = await import("../../../commands/init.js");

const REACT = testMarketplaceSkillId("web-framework-react");
const HONO = testMarketplaceSkillId("api-framework-hono");
const VITEST = testMarketplaceSkillId("web-testing-vitest");
const SEED_ID = "Next";
const PROMPT_READY_MS = 600;

/** Wide enough that no test-marketplace id wraps inside the panel, whose rows these specs pin. */
const PANEL_COLUMNS = 160;

/** Each command a spec here answers, run from source so the host mock reaches it. */
const RUN_FROM_SEED = {
  edit: () => Edit.run(["--from", SEED_ID], { root: CLI_ROOT }),
  init: () => Init.run(["--from", SEED_ID], { root: CLI_ROOT }),
};

describe("what edit --from says of plugins", () => {
  useMockWorker();
  const terminal = standAtTerminal();
  printAtWidth(PANEL_COLUMNS);
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-edit-from-plugins-test-"));
    dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
    await mkdir(path.join(projectDir, CLAUDE_DIR), { recursive: true });
    await writeFile(
      path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] } }),
    );
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
    await cleanup();
  });

  async function installPlugins(skillIds: string[], origin = TEST_MARKETPLACE_NAME): Promise<void> {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        marketplace: dirs.sourceDir,
        marketplaceName: TEST_MARKETPLACE_NAME,
        skills: buildSkillConfigs(skillIds, { scope: "project", origin }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        stack: {
          "web-developer": Object.fromEntries(
            skillIds.map((id) => [
              id.includes("hono") ? "api-api" : "web-framework",
              [{ id, preloaded: false }],
            ]),
          ),
        },
      }),
    );
  }

  function serve(payload: SeedPayload): void {
    configMockServer.use(storedConfigHandlerFor(SEED_ID, payload));
  }

  const configFileAt = (root: string) =>
    path.join(root, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS);
  const skillsDirAt = (root: string) => path.join(root, CLAUDE_DIR, STANDARD_DIRS.SKILLS);

  async function configuredSkills(root: string) {
    return (await readTestTsConfig<FixtureProjectConfig>(configFileAt(root))).skills;
  }

  /** A project entry as the apply records it, under the name its marketplace gives it. */
  const pluginEntry = (id: string, displayName: string) =>
    buildSkillConfig(id, { scope: "project", origin: TEST_MARKETPLACE_NAME, displayName });
  const copyEntry = (id: string, displayName: string) =>
    buildSkillConfig(id, { scope: "project", origin: "eject", displayName });

  /** The host is a mock: no plugin reaches disk, so what it was asked is the plugin side's state. */
  function hostCalls() {
    const host = hostAt(projectDir);
    return {
      installed: vi.mocked(host.installPlugin).mock.calls,
      removed: vi.mocked(host.uninstallPlugin).mock.calls,
    };
  }

  const atProject = (id: string) => [`${id}@${TEST_MARKETPLACE_NAME}`, "project", projectDir];

  /** So a spec reads its own apply's host calls, not those of the run that set it up. */
  function forgetHostCalls(): void {
    vi.mocked(hostAt(projectDir).installPlugin).mockClear();
    vi.mocked(hostAt(projectDir).uninstallPlugin).mockClear();
  }

  /** Captures what the run prints, answering Ink's write callbacks, and answers the confirm. */
  async function applyAnswered(key: string, command: keyof typeof RUN_FROM_SEED = "edit") {
    const chunks: string[] = [];
    const painted = vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest) => {
      chunks.push(String(chunk));
      const onWritten = rest.find((argument) => typeof argument === "function");
      if (onWritten !== undefined) queueMicrotask(() => onWritten());
      return true;
    });
    try {
      const run = RUN_FROM_SEED[command]().then(
        () => undefined,
        (error: Error & { oclif?: { exit?: number } }) => error,
      );
      await delay(PROMPT_READY_MS);
      terminal.input.push(key);
      const error = await run;
      return { stdout: chunks.join(""), error };
    } finally {
      painted.mockRestore();
    }
  }

  function onWebDeveloper(skillIds: string[], install: "eject" | "plugin"): SeedPayload {
    return buildSeedPayload({
      marketplace: dirs.sourceDir,
      skills: Object.fromEntries(
        skillIds.map((id) => [
          id,
          buildSeedSkill({ install, scope: "project", assignments: { "web-developer": "lazy" } }),
        ]),
      ),
      agents: { "web-developer": { scope: "project" } },
    });
  }

  it("switches a plugin to a local copy and removes a plugin the configuration drops", async () => {
    await installPlugins([REACT, HONO]);
    serve(onWebDeveloper([REACT], "eject"));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "Changes:",
        "  - Hono [P]",
        `  ~ React (${TEST_MARKETPLACE_NAME} → Eject)`,
        "  ~ web-developer (agent: skills reassigned)",
        "",
        "Switching 1 skill(s) to Eject (local copy)",
        "Copied 1 local skill(s)",
        "Removed 1 plugin(s)",
        "1 agent rewritten, 0 unchanged",
      ].join("\n"),
    );
    expect(
      await configuredSkills(projectDir),
      "the applied config holds React as a local copy and drops Hono's entry",
    ).toStrictEqual([copyEntry(REACT, "React")]);
    expect(await readdir(skillsDirAt(projectDir)), "React's is the one local copy").toStrictEqual([
      REACT,
    ]);
    expect(hostCalls(), "React's plugin goes with the switch, Hono's with the drop").toStrictEqual({
      installed: [],
      removed: [atProject(REACT), atProject(HONO)],
    });
  });

  /**
   * The line under the panel names a plugin it removes as `init --from` recorded it: the record,
   * else the marketplace's name, else the id. React stays; the other plugin goes.
   */
  describe("the name it gives a plugin the configuration drops", () => {
    /** An id this test marketplace does not offer, as a plugin from another marketplace is. */
    const OFFERED_NOWHERE_HERE = "api-framework-hono";
    const RECORDED_NAME = "Acme Hono";
    /** The name only this marketplace's metadata.yaml gives Hono. */
    const MARKETPLACE_NAME_FOR_HONO = "Market Hono";

    async function installReactBeside(
      dropped: ReturnType<typeof buildSkillConfigs>,
    ): Promise<void> {
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          marketplace: dirs.sourceDir,
          marketplaceName: TEST_MARKETPLACE_NAME,
          skills: [
            ...buildSkillConfigs([REACT], { scope: "project", origin: TEST_MARKETPLACE_NAME }),
            ...dropped,
          ],
          agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
          stack: {
            "web-developer": {
              "web-framework": [{ id: REACT, preloaded: false }],
              "api-api": dropped.map(({ id }) => ({ id, preloaded: false })),
            },
          },
        }),
      );
    }

    it("names a plugin its marketplace no longer offers by the name its install recorded", async () => {
      await installReactBeside(
        buildSkillConfigs([OFFERED_NOWHERE_HERE], {
          scope: "project",
          origin: TEST_MARKETPLACE_NAME,
          displayName: RECORDED_NAME,
        }),
      );
      serve(onWebDeveloper([REACT], "plugin"));

      const { stdout, error } = await applyAnswered(KEY_Y);

      expect(error).toBeUndefined();
      expect(
        stdout,
        "the panel draws the plugin it drops by the name its install recorded, beside the one it keeps",
      ).toContain(`│  • React                                           - ${RECORDED_NAME} `);
      expect(
        stdout,
        "the marketplace cannot name the plugin it drops, so only the install's record can",
      ).toContain(`\nChanges:\n  - ${RECORDED_NAME} [P]\n`);
      expect(stdout).not.toContain(`- ${OFFERED_NOWHERE_HERE}`);
      expect(
        await configuredSkills(projectDir),
        "the applied config drops the plugin's entry and keeps React's",
      ).toStrictEqual([pluginEntry(REACT, "React")]);
      expect(
        hostCalls(),
        "the host is asked to remove the dropped plugin, by the id its install recorded",
      ).toStrictEqual({ installed: [], removed: [atProject(OFFERED_NOWHERE_HERE)] });
    });

    async function nameHonoInTheMarketplace(): Promise<void> {
      const namedHono = firstElement(
        inTestMarketplace([
          createTestSkill("api-framework-hono", "Lightweight web framework for the edge", {
            displayName: MARKETPLACE_NAME_FOR_HONO,
          }),
        ]),
      );
      await writeFile(
        path.join(dirs.skillsDir, namedHono.category, namedHono.id, STANDARD_FILES.METADATA_YAML),
        renderMetadataYaml({
          author: namedHono.author,
          category: namedHono.category,
          contentHash: "abc1234",
          displayName: namedHono.displayName,
          domain: namedHono.domain,
          slug: namedHono.slug,
        }),
      );
    }

    /** The sub-agent's line ends the block the confirm follows; nothing else sits between. */
    function losesLine(name: string): string {
      return ["┘", `~ web-developer: loses ${name}`, "", "Apply this configuration?"].join("\n");
    }

    it("names a plugin whose install recorded no name by the name its marketplace gives it", async () => {
      await nameHonoInTheMarketplace();
      await installReactBeside(
        buildSkillConfigs([HONO], { scope: "project", origin: TEST_MARKETPLACE_NAME }),
      );
      serve(onWebDeveloper([REACT], "plugin"));

      const { stdout, error } = await applyAnswered(KEY_Y);

      expect(error).toBeUndefined();
      expect(stdout).toContain(`\nChanges:\n  - ${MARKETPLACE_NAME_FOR_HONO} [P]\n`);
      expect(
        stdout,
        "with no record, the sub-agent's line names what it loses as the marketplace does",
      ).toContain(losesLine(MARKETPLACE_NAME_FOR_HONO));
      expect(
        await configuredSkills(projectDir),
        "the applied config drops Hono's entry and keeps React's",
      ).toStrictEqual([pluginEntry(REACT, "React")]);
      expect(hostCalls(), "the host is asked to remove Hono's plugin, and no other").toStrictEqual({
        installed: [],
        removed: [atProject(HONO)],
      });
    });

    it("names the plugin a sub-agent loses by the name its install recorded, where its marketplace no longer offers it", async () => {
      await installReactBeside(
        buildSkillConfigs([OFFERED_NOWHERE_HERE], {
          scope: "project",
          origin: TEST_MARKETPLACE_NAME,
          displayName: RECORDED_NAME,
        }),
      );
      serve(onWebDeveloper([REACT], "plugin"));
      const projectConfigBefore = await readFile(configFileAt(projectDir), "utf8");
      expect(
        await fileExists(configFileAt(fakeHome)),
        "this installation has no global config",
      ).toBe(false);

      const { stdout, error } = await applyAnswered(KEY_N);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.CANCELLED);
      expect(
        await readFile(configFileAt(projectDir), "utf8"),
        "a declined apply leaves the project config as it was",
      ).toBe(projectConfigBefore);
      expect(
        await fileExists(configFileAt(fakeHome)),
        "a declined apply writes no global config",
      ).toBe(false);
      expect(
        vi.mocked(hostAt(projectDir).uninstallPlugin),
        "a declined apply leaves installed the plugin it would drop",
      ).not.toHaveBeenCalled();
      expect(
        stdout,
        "the sub-agent's line names the plugin it loses as the panel row above it does",
      ).toContain(losesLine(RECORDED_NAME));
    });

    it("names the plugin a sub-agent loses by the name its install recorded, over the name its marketplace gives it now", async () => {
      await nameHonoInTheMarketplace();
      await installReactBeside(
        buildSkillConfigs([HONO], {
          scope: "project",
          origin: TEST_MARKETPLACE_NAME,
          displayName: RECORDED_NAME,
        }),
      );
      serve(onWebDeveloper([REACT], "plugin"));

      const { stdout, error } = await applyAnswered(KEY_Y);

      expect(error).toBeUndefined();
      expect(stdout, "the panel names the plugin it drops by its record").toContain(
        `\nChanges:\n  - ${RECORDED_NAME} [P]\n`,
      );
      expect(
        stdout,
        "the record outranks the marketplace's name on the sub-agent's line as in the panel",
      ).toContain(losesLine(RECORDED_NAME));
      const appliedConfig = await readTestTsConfig<FixtureProjectConfig>(configFileAt(projectDir));
      expect(
        appliedConfig.skills.map((skill) => skill.id),
        "the applied config drops Hono's entry and keeps React's",
      ).toStrictEqual([REACT]);
      expect(
        vi.mocked(hostAt(projectDir).uninstallPlugin).mock.calls,
        "the host is asked to remove Hono's plugin, and no other",
      ).toStrictEqual([[`${HONO}@${TEST_MARKETPLACE_NAME}`, "project", projectDir]]);
    });
  });

  /** A project run holds a global entry whole, so its record outlives a rename in the marketplace. */
  it("names a global plugin a project sub-agent gains by the name the global install recorded", async () => {
    const recordedName = "Acme Vitest";
    const globalVitest = buildSkillConfigs([VITEST], {
      scope: "global",
      origin: TEST_MARKETPLACE_NAME,
      displayName: recordedName,
    });
    const onEachSide = { marketplace: dirs.sourceDir, marketplaceName: TEST_MARKETPLACE_NAME };
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({ ...onEachSide, name: "global", skills: globalVitest, agents: [] }),
    );
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        ...onEachSide,
        skills: [
          ...globalVitest,
          ...buildSkillConfigs([REACT], { scope: "project", origin: TEST_MARKETPLACE_NAME }),
        ],
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        stack: { "web-developer": { "web-framework": [{ id: REACT, preloaded: false }] } },
      }),
    );
    serve(
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: {
          [REACT]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { "web-developer": "lazy" },
          }),
          [VITEST]: buildSeedSkill({
            install: "plugin",
            scope: "global",
            assignments: { "web-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "project" } },
      }),
    );
    const configFiles = [projectDir, fakeHome].map((root) =>
      path.join(root, ".agents-inc", "claude", STANDARD_FILES.CONFIG_TS),
    );
    const configsBefore = await Promise.all(configFiles.map((file) => readFile(file, "utf8")));

    const { stdout, error } = await applyAnswered(KEY_N);

    expect(error?.oclif?.exit).toBe(EXIT_CODES.CANCELLED);
    expect(
      await Promise.all(configFiles.map((file) => readFile(file, "utf8"))),
      "a declined apply leaves both configs as they were",
    ).toStrictEqual(configsBefore);
    expect(stdout, "the panel draws the held global plugin by its record").toContain(
      ` • ${recordedName} `,
    );
    expect(
      stdout,
      "the sub-agent's line names the plugin it gains as the panel row does",
    ).toContain(
      ["┘", `~ web-developer: gains ${recordedName}`, "", "Apply this configuration?"].join("\n"),
    );
  });

  it("names the local copy a switch to a plugin overwrites before asking, then installs the plugin", async () => {
    await installPlugins([REACT]);
    serve(onWebDeveloper([REACT], "eject"));
    expect((await applyAnswered(KEY_Y)).error).toBeUndefined();
    const reactCopy = path.join(skillsDirAt(projectDir), REACT);
    expect(await directoryExists(reactCopy), "the first apply leaves React a local copy").toBe(
      true,
    );
    forgetHostCalls();
    serve(onWebDeveloper([REACT], "plugin"));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(" ↻ React ");
    expect(stdout).not.toContain("↻ React ⏏");
    expect(stdout).toContain("┘\n\nApply this configuration?\n");
    expect(stdout).toContain(
      [
        "Changes:",
        `  ~ React (Eject → ${TEST_MARKETPLACE_NAME})`,
        "",
        "Switching 1 skill(s) to Plugin (native install)",
        "Installing skill plugins...",
        `  Installed ${REACT}@${TEST_MARKETPLACE_NAME}`,
        "Installed 1 skill plugin",
        "",
        "",
      ].join("\n"),
    );
    expect(
      await configuredSkills(projectDir),
      "the applied config holds React as its marketplace's plugin",
    ).toStrictEqual([pluginEntry(REACT, "React")]);
    expect(await directoryExists(reactCopy), "the plugin replaces the local copy").toBe(false);
    expect(hostCalls(), "the host installs React's plugin and removes nothing").toStrictEqual({
      installed: [atProject(REACT)],
      removed: [],
    });
  });

  it("installs a plugin the configuration adds", async () => {
    await installPlugins([REACT]);
    serve(onWebDeveloper([REACT, HONO], "plugin"));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      "Changes:\n  + Hono [P]\n  ~ web-developer (agent: skills reassigned)\n\n",
    );
    expect(stdout).toContain(`  Installed ${HONO}@${TEST_MARKETPLACE_NAME}\n`);
    expect(
      await configuredSkills(projectDir),
      "the applied config adds Hono as a plugin beside React",
    ).toStrictEqual([pluginEntry(REACT, "React"), pluginEntry(HONO, "Hono")]);
    expect(hostCalls(), "the host installs Hono's plugin, and only that").toStrictEqual({
      installed: [atProject(HONO)],
      removed: [],
    });
  });

  it("copies only the skill it adds as a local copy, installing the one it adds as a plugin", async () => {
    await installPlugins([REACT]);
    const onWebDeveloperAs = (install: "eject" | "plugin") =>
      buildSeedSkill({ install, scope: "project", assignments: { "web-developer": "lazy" } });
    serve(
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: {
          [REACT]: onWebDeveloperAs("plugin"),
          [HONO]: onWebDeveloperAs("plugin"),
          [VITEST]: onWebDeveloperAs("eject"),
        },
        agents: { "web-developer": { scope: "project" } },
      }),
    );
    const skillFile = (id: string) =>
      path.join(projectDir, CLAUDE_DIR, "skills", id, STANDARD_FILES.SKILL_MD);

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(`  Installed ${HONO}@${TEST_MARKETPLACE_NAME}\n`);
    expect(stdout).toContain("\nCopied 1 local skill(s)\n");
    expect(await fileExists(skillFile(VITEST))).toBe(true);
    expect(await fileExists(skillFile(HONO))).toBe(false);
    expect(
      await configuredSkills(projectDir),
      "the applied config adds Hono as a plugin and Vitest as a local copy",
    ).toStrictEqual([
      pluginEntry(REACT, "React"),
      pluginEntry(HONO, "Hono"),
      copyEntry(VITEST, "Vitest"),
    ]);
    expect(hostCalls(), "the host installs the plugin it adds, and not the copy").toStrictEqual({
      installed: [atProject(HONO)],
      removed: [],
    });
  });

  it("names a source by its display label in the change it lists", async () => {
    await installPlugins([REACT], "public");
    serve(onWebDeveloper([REACT], "eject"));

    const { stdout } = await applyAnswered(KEY_Y);

    expect(stdout).toContain("  ~ React (Public → Eject)\n");
    expect(
      await configuredSkills(projectDir),
      "the applied config holds React as a local copy",
    ).toStrictEqual([copyEntry(REACT, "React")]);
    expect(await readdir(skillsDirAt(projectDir)), "React's is the one local copy").toStrictEqual([
      REACT,
    ]);
    expect(
      hostCalls(),
      "the switch removes React's plugin, addressed through this installation's marketplace",
    ).toStrictEqual({ installed: [], removed: [atProject(REACT)] });
  });

  /** React a global plugin for web-developer; the project's own config adds Hono for api-developer. */
  async function installReactGloballyBesideAProjectHono(): Promise<void> {
    const globalReact = buildSkillConfigs([REACT], {
      scope: "global",
      origin: TEST_MARKETPLACE_NAME,
    });
    const globalAgents = buildAgentConfigs(["web-developer"], { scope: "global" });
    const globalStack = { "web-developer": { "web-framework": [{ id: REACT, preloaded: false }] } };
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({
        name: "global",
        marketplace: dirs.sourceDir,
        marketplaceName: TEST_MARKETPLACE_NAME,
        skills: globalReact,
        agents: globalAgents,
        stack: globalStack,
      }),
    );
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        marketplace: dirs.sourceDir,
        marketplaceName: TEST_MARKETPLACE_NAME,
        skills: [
          ...globalReact,
          ...buildSkillConfigs([HONO], { scope: "project", origin: TEST_MARKETPLACE_NAME }),
        ],
        agents: [...globalAgents, ...buildAgentConfigs(["api-developer"], { scope: "project" })],
        stack: { ...globalStack, "api-developer": { "api-api": [{ id: HONO, preloaded: false }] } },
      }),
    );
  }

  function onApiDeveloper(installs: Record<string, "eject" | "plugin">): SeedPayload {
    return buildSeedPayload({
      marketplace: dirs.sourceDir,
      skills: Object.fromEntries(
        Object.entries(installs).map(([id, install]) => [
          id,
          buildSeedSkill({ install, scope: "project", assignments: { "api-developer": "lazy" } }),
        ]),
      ),
      agents: { "api-developer": { scope: "project" } },
    });
  }

  it("names a skill copied into the project beside its global plugin once, as a project add", async () => {
    await installReactGloballyBesideAProjectHono();
    const globalSkillsBefore = await configuredSkills(fakeHome);
    serve(onApiDeveloper({ [REACT]: "eject", [HONO]: "plugin" }));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      ["Changes:", "  + React [P]", "  ~ api-developer (agent: skills reassigned)", "", ""].join(
        "\n",
      ),
    );
    expect(
      await fileExists(path.join(projectDir, CLAUDE_DIR, "skills", REACT, STANDARD_FILES.SKILL_MD)),
    ).toBe(true);
    expect(
      await configuredSkills(projectDir),
      "the project adds its own copy of React and holds the global plugin's entry, masked",
    ).toStrictEqual([
      buildSkillConfig(REACT, { scope: "global", origin: TEST_MARKETPLACE_NAME, excluded: true }),
      pluginEntry(HONO, "Hono"),
      copyEntry(REACT, "React"),
    ]);
    expect(
      await configuredSkills(fakeHome),
      "a project apply leaves the global config's skills as they were",
    ).toStrictEqual(globalSkillsBefore);
    expect(hostCalls(), "the global plugin stays, and nothing is installed").toStrictEqual({
      installed: [],
      removed: [],
    });
  });

  it("says it copies a skill into the project beside its global plugin, rather than switching it", async () => {
    await installReactGloballyBesideAProjectHono();
    const globalSkillsBefore = await configuredSkills(fakeHome);
    serve(onApiDeveloper({ [REACT]: "eject", [HONO]: "plugin" }));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain("\nCopying 1 skill into this project (the global plugin stays)\n");
    expect(stdout).not.toContain("Switching 1 skill(s) to Eject (local copy)");
    expect(
      await configuredSkills(projectDir),
      "the project adds its own copy of React and holds the global plugin's entry, masked",
    ).toStrictEqual([
      buildSkillConfig(REACT, { scope: "global", origin: TEST_MARKETPLACE_NAME, excluded: true }),
      pluginEntry(HONO, "Hono"),
      copyEntry(REACT, "React"),
    ]);
    expect(await readdir(skillsDirAt(projectDir)), "React's is the one local copy").toStrictEqual([
      REACT,
    ]);
    expect(
      await configuredSkills(fakeHome),
      "a project apply leaves the global config's skills as they were",
    ).toStrictEqual(globalSkillsBefore);
    expect(hostCalls(), "the global plugin stays, and nothing is installed").toStrictEqual({
      installed: [],
      removed: [],
    });
  });

  it("says which skill it copies beside its global plugin and which it switches, counting each", async () => {
    await installReactGloballyBesideAProjectHono();
    const globalSkillsBefore = await configuredSkills(fakeHome);
    serve(onApiDeveloper({ [REACT]: "eject", [HONO]: "eject" }));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "",
        "Switching 1 skill(s) to Eject (local copy)",
        "Copying 1 skill into this project (the global plugin stays)",
        "Copied 2 local skill(s)",
        "1 agent rewritten, 0 unchanged",
      ].join("\n"),
    );
    expect(
      await configuredSkills(projectDir),
      "the project holds both as local copies, and the global plugin's entry, masked",
    ).toStrictEqual([
      buildSkillConfig(REACT, { scope: "global", origin: TEST_MARKETPLACE_NAME, excluded: true }),
      copyEntry(HONO, "Hono"),
      copyEntry(REACT, "React"),
    ]);
    expect(
      (await readdir(skillsDirAt(projectDir))).sort(),
      "each has its local copy in the project",
    ).toStrictEqual([HONO, REACT]);
    expect(
      await configuredSkills(fakeHome),
      "a project apply leaves the global config's skills as they were",
    ).toStrictEqual(globalSkillsBefore);
    expect(
      hostCalls(),
      "Hono's project plugin goes with its switch; React's global plugin stays",
    ).toStrictEqual({ installed: [], removed: [atProject(HONO)] });
  });

  const globalReactCopy = () => path.join(fakeHome, CLAUDE_DIR, STANDARD_DIRS.SKILLS, REACT);

  /** React a global local copy, made by an `init --from` at home; the project's own init adds Hono. */
  async function installReactGloballyAsACopyBesideAProjectHono(
    honoInstall: "eject" | "plugin",
  ): Promise<void> {
    process.chdir(fakeHome);
    serve(
      buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: {
          [REACT]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { "web-developer": "lazy" },
          }),
        },
        agents: { "web-developer": { scope: "global" } },
      }),
    );
    expect((await applyAnswered(KEY_Y, "init")).error).toBeUndefined();
    expect(await directoryExists(globalReactCopy())).toBe(true);
    process.chdir(projectDir);
    serve(onApiDeveloper({ [HONO]: honoInstall }));
    expect((await applyAnswered(KEY_Y, "init")).error).toBeUndefined();
  }

  it("says it installs a skill as a plugin in this project beside its global copy, rather than switching it", async () => {
    await installReactGloballyAsACopyBesideAProjectHono("plugin");
    const globalSkillsBefore = await configuredSkills(fakeHome);
    forgetHostCalls();
    serve(onApiDeveloper({ [REACT]: "plugin", [HONO]: "plugin" }));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      "\nInstalling 1 skill as a plugin in this project (the global copy stays)\n",
    );
    expect(stdout).not.toContain("Switching 1 skill(s) to Plugin (native install)");
    expect(await directoryExists(globalReactCopy())).toBe(true);
    // Subject guard for the absence below: the confirm was painted.
    expect(stdout).toContain("Apply this configuration?");
    expect(stdout, "the global copy stays, so nothing of it is overwritten").not.toContain("↻");
    expect(
      await configuredSkills(projectDir),
      "the project adds React as its own plugin and holds the global copy's entry, masked",
    ).toStrictEqual([
      buildSkillConfig(REACT, {
        scope: "global",
        origin: "eject",
        displayName: "React",
        excluded: true,
      }),
      pluginEntry(HONO, "Hono"),
      pluginEntry(REACT, "React"),
    ]);
    expect(
      await configuredSkills(fakeHome),
      "a project apply leaves the global config's skills as they were",
    ).toStrictEqual(globalSkillsBefore);
    expect(await directoryExists(skillsDirAt(projectDir)), "the project has no local copy").toBe(
      false,
    );
    expect(
      hostCalls(),
      "the host installs React's plugin in this project once, and removes nothing",
    ).toStrictEqual({ installed: [atProject(REACT)], removed: [] });
  });

  it("asks the host once for a plugin it installs beside its global copy", async () => {
    await installReactGloballyAsACopyBesideAProjectHono("plugin");
    forgetHostCalls();
    serve(onApiDeveloper({ [REACT]: "plugin", [HONO]: "plugin" }));

    expect((await applyAnswered(KEY_Y)).error).toBeUndefined();

    expect(
      hostCalls().installed,
      "the switch installs React's plugin in this project, and nothing asks for it again",
    ).toStrictEqual([atProject(REACT)]);
  });

  it("says which skill it installs as a plugin beside its global copy and which it switches, counting each", async () => {
    await installReactGloballyAsACopyBesideAProjectHono("eject");
    const honoCopy = path.join(skillsDirAt(projectDir), HONO);
    expect(await directoryExists(honoCopy), "the project's init leaves Hono a local copy").toBe(
      true,
    );
    const globalSkillsBefore = await configuredSkills(fakeHome);
    forgetHostCalls();
    serve(onApiDeveloper({ [REACT]: "plugin", [HONO]: "plugin" }));

    const { stdout, error } = await applyAnswered(KEY_Y);

    expect(error).toBeUndefined();
    expect(stdout).toContain(
      [
        "",
        "Switching 1 skill(s) to Plugin (native install)",
        "Installing 1 skill as a plugin in this project (the global copy stays)",
        "Installing skill plugins...",
      ].join("\n"),
    );
    expect(
      await configuredSkills(projectDir),
      "the project holds both as plugins, and the global copy's entry, masked",
    ).toStrictEqual([
      buildSkillConfig(REACT, {
        scope: "global",
        origin: "eject",
        displayName: "React",
        excluded: true,
      }),
      pluginEntry(HONO, "Hono"),
      pluginEntry(REACT, "React"),
    ]);
    expect(
      await configuredSkills(fakeHome),
      "a project apply leaves the global config's skills as they were",
    ).toStrictEqual(globalSkillsBefore);
    expect(await directoryExists(globalReactCopy()), "the global copy stays").toBe(true);
    expect(await directoryExists(honoCopy), "Hono's plugin replaces its local copy").toBe(false);
    expect(
      hostCalls(),
      "the host installs each plugin in this project once, and removes nothing",
    ).toStrictEqual({ installed: [atProject(REACT), atProject(HONO)], removed: [] });
  });
});
