import path from "path";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../utils/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/logger")>()),
  verbose: vi.fn(),
}));

import { filterExcludedEntries, recompileAgents } from "./agent-recompiler";
import { verbose } from "../../utils/logger";
import { loadAllAgents } from "../loading";
import { resolveInstallPaths } from "../installation/install-base-dir";
import { initializeMatrix } from "../matrix/matrix-provider";
import { CLI_ROOT } from "../__tests__/helpers/cli-runner";
import {
  cleanupTestDirs,
  createTestDirs,
  type PluginTestDirs,
} from "../__tests__/helpers/test-dir-setup";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { writeTestTsConfig } from "../__tests__/helpers/config-io";
import { buildAgentConfigs, buildProjectConfig } from "../__tests__/factories/config-factories";
import { sa } from "../__tests__/factories/skill-factories";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders";
import { fileExists } from "../__tests__/test-fs-utils";
import { SKILLS } from "../__tests__/test-fixtures";
import { VITEST_REACT_HONO_MATRIX } from "../__tests__/mock-data/mock-matrices";

const AGENT_NAME = "[a-z-]+";

/** Where a Codex installation's config sits under a project; a literal, as a person types it. */
const CODEX_INSTALLATION_FOLDER = ".agents-inc/codex";

/** What a recompile pass reports, routes and leaves out, read off the files it writes. */
describe("recompileAgents reports", () => {
  let testDirs: PluginTestDirs;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDirs = await createTestDirs("cc-recompiler-report-");
    initializeMatrix(VITEST_REACT_HONO_MATRIX);
  });

  afterEach(async () => {
    await cleanupTestDirs(testDirs);
  });

  const home = useFakeHome(() => testDirs.tempDir);

  it("says which sub-agents the configuration names", async () => {
    await writeTestTsConfig(
      testDirs.projectDir,
      buildProjectConfig({ agents: buildAgentConfigs(["pm", "web-developer"]), skills: [] }),
    );

    await recompileAgents({
      pluginDir: testDirs.pluginDir,
      sourcePath: CLI_ROOT,
      projectDir: testDirs.projectDir,
    });

    expect(verbose).toHaveBeenCalledWith("Using agents from config: pm, web-developer");
  });

  it("compiles every sub-agent the source defines into an output folder nothing else names", async () => {
    const outputDir = path.join(testDirs.tempDir, "output");
    const sourceAgents = Object.keys(await loadAllAgents(CLI_ROOT));

    const result = await recompileAgents({
      pluginDir: testDirs.pluginDir,
      sourcePath: CLI_ROOT,
      outputDir,
    });

    expect(result.compiled.toSorted()).toStrictEqual(sourceAgents.toSorted());
    expect(await fileExists(path.join(outputDir, "pm.md"))).toBe(true);
    // The source is globbed, so its order is the filesystem's: the line is matched by shape.
    expect(verbose).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `^Using all available agents from source: ${AGENT_NAME}(, ${AGENT_NAME}){${sourceAgents.length - 1}}$`,
        ),
      ),
    );
    expect(verbose).toHaveBeenCalledWith(
      `Recompiling ${sourceAgents.length} agents in ${outputDir}`,
    );
  });

  it("says how many sub-agents it recompiles into the plugin", async () => {
    await recompileAgents({ pluginDir: testDirs.pluginDir, sourcePath: CLI_ROOT, agents: ["pm"] });

    expect(verbose).toHaveBeenCalledWith(`Recompiling 1 agents in ${testDirs.pluginDir}`);
  });

  it("says nothing about an empty pass", async () => {
    await recompileAgents({ pluginDir: testDirs.pluginDir, sourcePath: CLI_ROOT });

    expect(verbose).not.toHaveBeenCalledWith(expect.stringContaining("Recompiling"));
  });

  it("counts a sub-agent rewritten once, and unchanged on an identical second pass", async () => {
    const pass = () =>
      recompileAgents({ pluginDir: testDirs.pluginDir, sourcePath: CLI_ROOT, agents: ["pm"] });

    expect(await pass()).toStrictEqual({
      compiled: ["pm"],
      rewritten: ["pm"],
      failed: [],
      warnings: [],
    });
    expect(verbose).toHaveBeenCalledWith(`  Rewrote: pm (project -> ${testDirs.agentsDir})`);

    expect(await pass()).toStrictEqual({
      compiled: ["pm"],
      rewritten: [],
      failed: [],
      warnings: [],
    });
    expect(verbose).toHaveBeenLastCalledWith(`  Unchanged: pm (project -> ${testDirs.agentsDir})`);
  });

  it("reports a sub-agent it could not write, naming the cause", async () => {
    await mkdir(path.join(testDirs.agentsDir, "pm.md"));

    expect(
      await recompileAgents({
        pluginDir: testDirs.pluginDir,
        sourcePath: CLI_ROOT,
        agents: ["pm"],
      }),
    ).toStrictEqual({
      compiled: [],
      rewritten: [],
      failed: ["pm"],
      warnings: ["Failed to compile pm: EISDIR: illegal operation on a directory, read"],
    });
  });

  it("rewrites a compiled sub-agent whose file no longer matches", async () => {
    const compiledPath = path.join(testDirs.agentsDir, "pm.md");
    await writeFile(compiledPath, "a stale compile");

    const result = await recompileAgents({
      pluginDir: testDirs.pluginDir,
      sourcePath: CLI_ROOT,
      agents: ["pm"],
    });

    expect(result.rewritten).toStrictEqual(["pm"]);
    expect(await readFile(compiledPath, "utf-8")).not.toBe("a stale compile");
  });

  it("leaves an unchanged compiled sub-agent's file untouched, its mtime included", async () => {
    const pass = () =>
      recompileAgents({ pluginDir: testDirs.pluginDir, sourcePath: CLI_ROOT, agents: ["pm"] });
    const compiledPath = path.join(testDirs.agentsDir, "pm.md");
    await pass();
    const before = (await stat(compiledPath)).mtimeMs;

    await pass();

    expect((await stat(compiledPath)).mtimeMs).toBe(before);
  });

  it("compiles no sub-agent the project's Codex installation does not carry", async () => {
    await writeTestTsConfig(
      testDirs.projectDir,
      buildProjectConfig({ agents: buildAgentConfigs(["agent-summoner", "pm"]), skills: [] }),
      CODEX_INSTALLATION_FOLDER,
    );

    const result = await recompileAgents({
      pluginDir: testDirs.pluginDir,
      sourcePath: CLI_ROOT,
      projectDir: testDirs.projectDir,
      agents: ["agent-summoner", "pm"],
    });

    expect(result.compiled).toStrictEqual(["pm"]);
  });

  it("writes a sub-agent the scope map routes globally into the home's agents folder", async () => {
    const globalAgentsDir = resolveInstallPaths(home.dir, "global").agentsDir;

    await recompileAgents({
      pluginDir: testDirs.pluginDir,
      sourcePath: CLI_ROOT,
      agents: ["pm"],
      agentScopeMap: new Map([["pm", "global"]]),
    });

    expect(await fileExists(path.join(globalAgentsDir, "pm.md"))).toBe(true);
    expect(await fileExists(path.join(testDirs.agentsDir, "pm.md"))).toBe(false);
  });
});

describe("filterExcludedEntries", () => {
  it("drops excluded skills and sub-agents, and an excluded skill's stack assignments", () => {
    const config = buildProjectConfig({
      skills: [
        ...buildSkillConfigs([SKILLS.react.id]),
        ...buildSkillConfigs([SKILLS.vitest.id], { scope: "global", excluded: true }),
      ],
      agents: [
        ...buildAgentConfigs(["web-developer"]),
        ...buildAgentConfigs(["pm"], { scope: "global", excluded: true }),
      ],
      stack: {
        "web-developer": {
          "web-framework": [sa(SKILLS.react.id)],
          "web-testing": [sa(SKILLS.vitest.id)],
        },
      },
    });

    expect(filterExcludedEntries(config)).toStrictEqual({
      ...config,
      skills: buildSkillConfigs([SKILLS.react.id]),
      agents: buildAgentConfigs(["web-developer"]),
      stack: { "web-developer": { "web-framework": [sa(SKILLS.react.id)], "web-testing": [] } },
    });
  });

  it("leaves a configuration with no stack without one", () => {
    const config = buildProjectConfig({ skills: buildSkillConfigs([SKILLS.react.id]) });

    expect(Object.keys(filterExcludedEntries(config))).not.toContain("stack");
  });
});
