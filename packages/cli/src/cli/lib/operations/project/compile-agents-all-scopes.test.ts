import path from "path";
import { mkdir, readdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compileAgentsAllScopes } from "./compile-agents-all-scopes.js";
import { buildAgentScopeMap, resolveInstallPaths } from "../../installation/index.js";
import { initializeMatrix } from "../../matrix/matrix-provider.js";
import type { ProjectConfig } from "../../../types/index.js";
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
