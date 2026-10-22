import path from "path";
import { chmod, mkdir, readdir, readFile, writeFile } from "fs/promises";
import { describe, it, expect, afterEach, beforeEach } from "vitest";

import { compileAgents } from "./compile-agents.js";
import { resolveInstallPaths } from "../../installation/index.js";
import { initializeMatrix } from "../../matrix/matrix-provider.js";
import type { AgentName, SkillScope } from "../../../types/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { renderAgentMd } from "../../__tests__/content-generators.js";
import { createMockSkillDefinition, sa } from "../../__tests__/factories/skill-factories.js";
import { CLI_ROOT } from "../../__tests__/helpers/cli-runner.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { buildSkillConfigs } from "../../__tests__/helpers/skill-config-builders.js";
import { EMPTY_MATRIX } from "../../__tests__/mock-data/mock-matrices.js";
import { SKILLS } from "../../__tests__/test-fixtures.js";
import {
  cleanupTempDir,
  createTempDir,
  directoryExists,
  fileExists,
} from "../../__tests__/test-fs-utils.js";

/** Read-only file in a writable directory, so cleanup still removes it. */
const READ_ONLY_FILE = 0o444;

/** Compiles the CLI's own sub-agents for real, against a configuration written to disk. */
describe("compileAgents", () => {
  let tempDir: string;
  let projectDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-compile-agents-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    outputDir = resolveInstallPaths(projectDir, "project").agentsDir;
    initializeMatrix(EMPTY_MATRIX);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  const filesIn = async (dir: string): Promise<string[]> =>
    (await directoryExists(dir)) ? (await readdir(dir)).toSorted() : [];

  const installConfig = (agents: ReturnType<typeof buildAgentConfigs>) =>
    writeTestTsConfig(projectDir, buildProjectConfig({ agents, skills: [] }));

  it("compiles the sub-agents it is asked for into the output folder, each rewritten", async () => {
    const result = await compileAgents({
      projectDir,
      sourcePath: CLI_ROOT,
      agents: ["pm"],
      outputDir,
    });

    expect(result).toStrictEqual({
      compiled: ["pm"],
      rewritten: ["pm"],
      failed: [],
      warnings: [],
    });
    expect(await filesIn(outputDir)).toStrictEqual(["pm.md"]);
  });

  it("writes into the project's own agents folder under its plugin root when no output folder is named", async () => {
    await compileAgents({ projectDir, sourcePath: CLI_ROOT, agents: ["pm"] });

    expect(await filesIn(path.join(projectDir, "agents"))).toStrictEqual(["pm.md"]);
  });

  it("counts a sub-agent it left byte-identical as compiled but not rewritten", async () => {
    const pass = () =>
      compileAgents({ projectDir, sourcePath: CLI_ROOT, agents: ["pm"], outputDir });
    await pass();

    expect(await pass()).toStrictEqual({
      compiled: ["pm"],
      rewritten: [],
      failed: [],
      warnings: [],
    });
  });

  it("reports a sub-agent it could not write, and names one no definition answers", async () => {
    await mkdir(path.join(outputDir, "pm.md"), { recursive: true });
    // Boundary cast: a name no definition answers lies outside the AgentName union.
    const unknown = "non-existent-agent-xyz" as AgentName;

    expect(
      await compileAgents({
        projectDir,
        sourcePath: CLI_ROOT,
        agents: ["pm", "web-developer", unknown],
        outputDir,
      }),
    ).toStrictEqual({
      compiled: ["web-developer"],
      rewritten: ["web-developer"],
      failed: ["pm"],
      warnings: [
        `Agent "${unknown}" not found in source definitions`,
        "Failed to compile pm: EISDIR: illegal operation on a directory, read",
      ],
    });
  });

  it("compiles a sub-agent with the skills it is handed", async () => {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs([SKILLS.react.id]),
        stack: { "web-developer": { "web-framework": [sa(SKILLS.react.id)] } },
      }),
    );

    await compileAgents({
      projectDir,
      sourcePath: CLI_ROOT,
      agents: ["web-developer"],
      skills: { [SKILLS.react.id]: createMockSkillDefinition(SKILLS.react.id) },
      outputDir,
    });

    expect(
      await readFile(path.join(outputDir, "web-developer.md"), "utf-8"),
      "the only definition of this skill is the one handed in, so a pass that dropped it compiles the sub-agent without it",
    ).toContain(SKILLS.react.id);
  });

  it("routes each sub-agent to the folder of the scope the caller's map gives it", async () => {
    await compileAgents({
      projectDir,
      sourcePath: CLI_ROOT,
      agents: ["pm", "web-developer"],
      agentScopeMap: new Map<AgentName, SkillScope>([
        ["pm", "global"],
        ["web-developer", "project"],
      ]),
      outputDir,
    });

    expect(await filesIn(resolveInstallPaths(home.dir, "global").agentsDir)).toStrictEqual([
      "pm.md",
    ]);
    expect(await filesIn(outputDir)).toStrictEqual(["web-developer.md"]);
  });

  describe("a scope-filtered pass", () => {
    it("compiles only the sub-agents the configuration places at its scope", async () => {
      await installConfig([
        ...buildAgentConfigs(["web-developer"]),
        ...buildAgentConfigs(["api-developer"], { scope: "global" }),
      ]);

      const result = await compileAgents({
        projectDir,
        sourcePath: CLI_ROOT,
        outputDir,
        scopeFilter: "project",
      });

      expect(result.compiled).toStrictEqual(["web-developer"]);
      expect(await filesIn(outputDir)).toStrictEqual(["web-developer.md"]);
      expect(await filesIn(resolveInstallPaths(home.dir, "global").agentsDir)).toStrictEqual([]);
    });

    it("compiles only the requested sub-agents that sit at its scope", async () => {
      await installConfig([
        ...buildAgentConfigs(["web-developer", "api-developer"]),
        ...buildAgentConfigs(["pm"], { scope: "global" }),
      ]);

      const result = await compileAgents({
        projectDir,
        sourcePath: CLI_ROOT,
        agents: ["web-developer", "pm"],
        outputDir,
        scopeFilter: "project",
      });

      expect(result.compiled).toStrictEqual(["web-developer"]);
      expect(await filesIn(outputDir)).toStrictEqual(["web-developer.md"]);
      expect(await filesIn(resolveInstallPaths(home.dir, "global").agentsDir)).toStrictEqual([]);
    });

    it("leaves out a sub-agent the configuration excludes", async () => {
      await installConfig([
        ...buildAgentConfigs(["web-developer"]),
        ...buildAgentConfigs(["api-developer"], { excluded: true }),
      ]);

      await compileAgents({ projectDir, sourcePath: CLI_ROOT, outputDir, scopeFilter: "project" });

      expect(await filesIn(outputDir)).toStrictEqual(["web-developer.md"]);
    });

    it("compiles the requested sub-agents when no configuration is installed", async () => {
      await compileAgents({
        projectDir,
        sourcePath: CLI_ROOT,
        agents: ["web-developer"],
        outputDir,
        scopeFilter: "project",
      });

      expect(await filesIn(outputDir)).toStrictEqual(["web-developer.md"]);
    });

    it("routes each sub-agent to the folder of the scope the configuration gives it", async () => {
      await installConfig(buildAgentConfigs(["pm"], { scope: "global" }));

      await compileAgents({ projectDir, sourcePath: CLI_ROOT, outputDir, scopeFilter: "global" });

      expect(await filesIn(resolveInstallPaths(home.dir, "global").agentsDir)).toStrictEqual([
        "pm.md",
      ]);
      expect(await filesIn(outputDir)).toStrictEqual([]);
    });
  });

  describe("stale-agent pruning", () => {
    const STALE_AGENT: AgentName = "api-developer";
    const KEPT_AGENT: AgentName = "web-developer";
    const HAND_AUTHORED_AGENT = "my-custom-agent";

    const seedOutputDir = async (names: string[]): Promise<void> => {
      await mkdir(outputDir, { recursive: true });
      for (const name of names) {
        await writeFile(path.join(outputDir, `${name}.md`), renderAgentMd(name));
      }
    };

    it("removes the output agents directory when the prune leaves nothing in it", async () => {
      await installConfig([]);
      await seedOutputDir([STALE_AGENT]);

      await compileAgents({ projectDir, sourcePath: CLI_ROOT, outputDir });

      expect(
        await fileExists(path.join(outputDir, `${STALE_AGENT}.md`)),
        "the stale compiled agent must be pruned",
      ).toBe(false);
      expect(
        await directoryExists(outputDir),
        "an emptied agents directory must not survive the prune",
      ).toBe(false);
    });

    it("keeps the output agents directory when a hand-authored agent survives the prune", async () => {
      await installConfig([]);
      await seedOutputDir([STALE_AGENT, HAND_AUTHORED_AGENT]);

      await compileAgents({ projectDir, sourcePath: CLI_ROOT, outputDir });

      expect(await fileExists(path.join(outputDir, `${STALE_AGENT}.md`))).toBe(false);
      expect(
        await fileExists(path.join(outputDir, `${HAND_AUTHORED_AGENT}.md`)),
        "a hand-authored agent is never pruned",
      ).toBe(true);
      expect(
        await directoryExists(outputDir),
        "a directory that still holds anything must never be deleted",
      ).toBe(true);
    });

    it("keeps the output agents directory when a compiled agent remains", async () => {
      await installConfig(buildAgentConfigs([KEPT_AGENT]));
      await seedOutputDir([KEPT_AGENT, STALE_AGENT]);

      await compileAgents({ projectDir, sourcePath: CLI_ROOT, outputDir });

      expect(await filesIn(outputDir)).toStrictEqual([`${KEPT_AGENT}.md`]);
    });

    it("keeps a sub-agent it failed to write rather than pruning it as stale", async () => {
      await seedOutputDir([KEPT_AGENT]);
      await chmod(path.join(outputDir, `${KEPT_AGENT}.md`), READ_ONLY_FILE);

      const result = await compileAgents({
        projectDir,
        sourcePath: CLI_ROOT,
        agents: [KEPT_AGENT],
        outputDir,
      });

      expect(result.failed).toStrictEqual([KEPT_AGENT]);
      expect(await filesIn(outputDir)).toStrictEqual([`${KEPT_AGENT}.md`]);
    });

    it("leaves the output agents directory untouched on a scope-filtered pass", async () => {
      await installConfig([]);
      await seedOutputDir([STALE_AGENT]);

      await compileAgents({ projectDir, sourcePath: CLI_ROOT, outputDir, scopeFilter: "project" });

      expect(
        await fileExists(path.join(outputDir, `${STALE_AGENT}.md`)),
        "a filtered pass sees one scope only and must delete nothing",
      ).toBe(true);
      expect(await directoryExists(outputDir)).toBe(true);
    });
  });
});
