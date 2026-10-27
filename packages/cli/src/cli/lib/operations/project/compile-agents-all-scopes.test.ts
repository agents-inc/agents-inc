import path from "path";
import { mkdir, readdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { compileAgentsAllScopes } from "./compile-agents-all-scopes.js";
import { buildAgentScopeMap, resolveInstallPaths } from "../../installation/index.js";
import { agentCodec, agentsDir } from "../../installation/install-layout.js";
import { initializeMatrix } from "../../matrix/matrix-provider.js";
import { PROVIDERS, sourceDirName, type Provider } from "../../../consts.js";
import type { AgentName, ProjectConfig } from "../../../types/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { renderAgentMd } from "../../__tests__/content-generators.js";
import { CLI_ROOT } from "../../__tests__/helpers/cli-runner.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { EMPTY_MATRIX } from "../../__tests__/mock-data/mock-matrices.js";
import { cleanupTempDir, createTempDir, directoryExists } from "../../__tests__/test-fs-utils.js";

const GLOBAL_CONFIG = buildProjectConfig({
  agents: buildAgentConfigs(["pm"], { scope: "global" }),
  skills: [],
});

/** A project's config.ts inlines the global rows it inherits. */
const PROJECT_CONFIG = buildProjectConfig({
  agents: [...GLOBAL_CONFIG.agents, ...buildAgentConfigs(["web-developer"])],
  skills: [],
});

describe("compileAgentsAllScopes", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-compile-all-scopes-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    initializeMatrix(EMPTY_MATRIX);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  const agentFilesAt = async (root: string, scope: "global" | "project"): Promise<string[]> => {
    const { agentsDir } = resolveInstallPaths(root, scope);
    return (await directoryExists(agentsDir)) ? (await readdir(agentsDir)).toSorted() : [];
  };

  const compileFor = (dir: string, config: ProjectConfig) =>
    compileAgentsAllScopes({
      projectDir: dir,
      sourcePath: CLI_ROOT,
      skills: {},
      agentScopeMap: buildAgentScopeMap(config),
    });

  it("compiles the home installation in one pass that owns its agents folder, pruning what is stale", async () => {
    await writeTestTsConfig(home.dir, GLOBAL_CONFIG);
    const { agentsDir } = resolveInstallPaths(home.dir, "global");
    await mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, "api-developer.md"), renderAgentMd("api-developer"));

    const result = await compileFor(home.dir, GLOBAL_CONFIG);

    expect(result.compiled).toStrictEqual(["pm"]);
    expect(await agentFilesAt(home.dir, "global")).toStrictEqual(["pm.md"]);
  });

  /**
   * Each global installation holds a sub-agent the other does not, so which one was read is
   * visible. Claude is the control, being also the provider a home holding both is read as.
   */
  describe("in a project under a home holding a Claude and a Codex global installation", () => {
    const GLOBAL_AGENT_OF = {
      claude: "pm",
      codex: "reviewer",
    } as const satisfies Record<Provider, AgentName>;

    const globalConfigOf = (provider: Provider): ProjectConfig =>
      buildProjectConfig({
        agents: buildAgentConfigs([GLOBAL_AGENT_OF[provider]], {
          scope: "global",
        }),
        skills: [],
      });

    const projectConfigOf = (provider: Provider): ProjectConfig =>
      buildProjectConfig({
        agents: [...globalConfigOf(provider).agents, ...buildAgentConfigs(["web-developer"])],
        skills: [],
      });

    const roleFile = (provider: Provider, agent: AgentName): string =>
      `${agent}${agentCodec(provider).extension}`;

    const filesIn = async (dir: string): Promise<string[]> =>
      (await directoryExists(dir)) ? (await readdir(dir)).toSorted() : [];

    beforeEach(() => {
      vi.stubEnv("CODEX_HOME", "");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it.each(PROVIDERS)(
      "compiles a %s project's global sub-agents from, and for, its own provider's global installation",
      async (provider) => {
        for (const atHome of PROVIDERS) {
          await writeTestTsConfig(home.dir, globalConfigOf(atHome), sourceDirName(atHome));
        }
        await writeTestTsConfig(projectDir, projectConfigOf(provider), sourceDirName(provider));
        const ownGlobalAgent = GLOBAL_AGENT_OF[provider];

        const result = await compileFor(projectDir, projectConfigOf(provider));

        expect(result).toStrictEqual({
          compiled: [ownGlobalAgent, "web-developer"],
          rewritten: [ownGlobalAgent, "web-developer"],
          failed: [],
          warnings: [],
        });
        expect(await filesIn(agentsDir(provider, "global", home.dir))).toStrictEqual([
          roleFile(provider, ownGlobalAgent),
        ]);
        for (const other of PROVIDERS.filter((atHome) => atHome !== provider)) {
          expect(
            await filesIn(agentsDir(other, "global", home.dir)),
            `nothing is compiled into the ${other} global installation`,
          ).toStrictEqual([]);
        }
        expect(await filesIn(agentsDir(provider, "project", projectDir))).toStrictEqual([
          roleFile(provider, "web-developer"),
        ]);
      },
    );
  });

  it("compiles a project's global sub-agents into the home folder and its own into the project, global first", async () => {
    await writeTestTsConfig(home.dir, GLOBAL_CONFIG);
    await writeTestTsConfig(projectDir, PROJECT_CONFIG);

    const result = await compileFor(projectDir, PROJECT_CONFIG);

    expect(result).toStrictEqual({
      compiled: ["pm", "web-developer"],
      rewritten: ["pm", "web-developer"],
      failed: [],
      warnings: [],
    });
    expect(await agentFilesAt(home.dir, "global")).toStrictEqual(["pm.md"]);
    expect(await agentFilesAt(projectDir, "project")).toStrictEqual(["web-developer.md"]);
  });
});
