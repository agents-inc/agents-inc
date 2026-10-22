import path from "path";
import { mkdir, readdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recompilePropagatedProjectAgents } from "./recompile-project-agents.js";
import { resolveInstallPaths } from "../../installation/index.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import type { AgentName } from "../../../types/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { renderUnparseableConfigTs } from "../../__tests__/factories/unloadable-config-factories.js";
import { writeRawTestConfig, writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { cleanupTempDir, createTempDir, directoryExists } from "../../__tests__/test-fs-utils.js";

const NO_PAIR_REWRITTEN: ReadonlySet<string> = new Set();

/** Each registered project is recompiled for real, from the configuration written into it. */
describe("recompilePropagatedProjectAgents", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-propagated-recompile-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  async function projectWith(name: string, agents: AgentName[]): Promise<string> {
    const dir = path.join(tempDir, name);
    await mkdir(dir, { recursive: true });
    await writeTestTsConfig(
      dir,
      buildProjectConfig({ agents: buildAgentConfigs(agents), skills: [] }),
    );
    return dir;
  }

  const agentsDirOf = (dir: string): string => resolveInstallPaths(dir, "project").agentsDir;

  const agentFilesIn = async (dir: string): Promise<string[]> =>
    (await directoryExists(dir)) ? (await readdir(dir)).toSorted() : [];

  it("counts each project once by its outcome and keeps every failure's warning in order", async () => {
    const rewritten = await projectWith("rewritten", ["pm"]);
    const unchanged = await projectWith("unchanged", ["pm"]);
    await recompilePropagatedProjectAgents([unchanged], NO_PAIR_REWRITTEN);
    const partlyFailed = await projectWith("partly-failed", ["pm", "web-developer"]);
    await mkdir(path.join(agentsDirOf(partlyFailed), "pm.md"), { recursive: true });
    const unreadable = path.join(tempDir, "unreadable");
    await mkdir(unreadable, { recursive: true });
    await writeRawTestConfig(unreadable, renderUnparseableConfigTs());

    const summary = await recompilePropagatedProjectAgents(
      [rewritten, unchanged, partlyFailed, unreadable],
      NO_PAIR_REWRITTEN,
    );

    expect(summary).toStrictEqual({
      rewrittenCount: 1,
      unchangedCount: 1,
      failedCount: 2,
      warnings: [
        "Failed to compile pm: EISDIR: illegal operation on a directory, read",
        expect.stringContaining(`Could not recompile agents in ${unreadable}: `),
      ],
    });
    expect(
      summary.warnings[1],
      "the cause is the loader's own message, carried whole; its wording is the loader's to pin",
    ).toContain(`'${getProjectConfigPath(unreadable, "claude")}'`);
  });

  it("tells rewritten projects from unchanged ones by count", async () => {
    const unchanged = await projectWith("unchanged", ["pm"]);
    await recompilePropagatedProjectAgents([unchanged], NO_PAIR_REWRITTEN);
    const first = await projectWith("first", ["pm"]);
    const second = await projectWith("second", ["pm"]);

    expect(
      await recompilePropagatedProjectAgents([first, second, unchanged], NO_PAIR_REWRITTEN),
    ).toStrictEqual({
      rewrittenCount: 2,
      unchangedCount: 1,
      failedCount: 0,
      warnings: [],
    });
  });

  it("counts a project whose config pair was rewritten as rewritten, though its agents came back the same", async () => {
    const rewrittenPair = await projectWith("rewritten-pair", ["pm"]);
    await recompilePropagatedProjectAgents([rewrittenPair], NO_PAIR_REWRITTEN);
    const unchanged = await projectWith("unchanged", ["pm"]);
    await recompilePropagatedProjectAgents([unchanged], NO_PAIR_REWRITTEN);

    expect(
      await recompilePropagatedProjectAgents([rewrittenPair, unchanged], new Set([rewrittenPair])),
    ).toStrictEqual({
      rewrittenCount: 1,
      unchangedCount: 1,
      failedCount: 0,
      warnings: [],
    });
  });

  it("compiles each project's own sub-agents into its own agents folder, and no global one", async () => {
    const project = path.join(tempDir, "project");
    await mkdir(project, { recursive: true });
    await writeTestTsConfig(
      project,
      buildProjectConfig({
        agents: [
          ...buildAgentConfigs(["web-developer"]),
          ...buildAgentConfigs(["pm"], { scope: "global" }),
        ],
        skills: [],
      }),
    );

    await recompilePropagatedProjectAgents([project], NO_PAIR_REWRITTEN);

    expect(await agentFilesIn(agentsDirOf(project))).toStrictEqual(["web-developer.md"]);
    expect(await agentFilesIn(resolveInstallPaths(home.dir, "global").agentsDir)).toStrictEqual([]);
  });

  it("answers no projects with an empty summary", async () => {
    expect(await recompilePropagatedProjectAgents([], NO_PAIR_REWRITTEN)).toStrictEqual({
      rewrittenCount: 0,
      unchangedCount: 0,
      failedCount: 0,
      warnings: [],
    });
  });
});
