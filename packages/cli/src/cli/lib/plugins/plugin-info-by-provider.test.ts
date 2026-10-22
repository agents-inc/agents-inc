/**
 * The installations a bare `init` describes, one per provider, each counted in its own folders and
 * its own agent format. Real configs under a fake home; folder names are literals so the assertions
 * cannot move with the product's constants.
 */

import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getInstallationsByProvider, type ProviderInstallation } from "./plugin-info.js";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../consts.js";
import { buildAgentConfigs, buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { useFakeHome } from "../__tests__/helpers/isolated-home.js";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";

const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";
const CLAUDE_AGENTS_REL = ".claude/agents";
const CODEX_AGENTS_REL = ".codex/agents";

const MARKETPLACE = "github:agents-inc/skills";

const EJECTED_PAIR = buildProjectConfig({
  skills: buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
    origin: EJECT_SOURCE,
  }),
  agents: buildAgentConfigs(["web-developer"]),
});

const PLUGIN_ONE = buildProjectConfig({
  skills: buildSkillConfigs(["api-framework-hono"], { origin: DEFAULT_PUBLIC_SOURCE_NAME }),
  agents: buildAgentConfigs(["api-developer"]),
  marketplace: MARKETPLACE,
});

const DECLARING_NOTHING = buildProjectConfig({ skills: [], agents: [] });

describe("getInstallationsByProvider", () => {
  let tempDir: string;
  let project: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-installations-by-provider-");
    project = path.join(tempDir, "project");
    await mkdir(project, { recursive: true });
    vi.stubEnv("CODEX_HOME", "");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  // After the hook that creates the directory, which the fake home lives in.
  const home = useFakeHome(() => tempDir);

  async function plantAgentFiles(root: string, folder: string, names: string[]): Promise<void> {
    const dir = path.join(root, ...folder.split("/"));
    await mkdir(dir, { recursive: true });
    await Promise.all(names.map((name) => writeFile(path.join(dir, name), "")));
  }

  it("describes each provider a project holds, each counted in its own folders and format", async () => {
    await writeTestTsConfig(project, EJECTED_PAIR, CLAUDE_SOURCE_REL);
    await writeTestTsConfig(project, PLUGIN_ONE, CODEX_SOURCE_REL);
    await plantAgentFiles(project, CLAUDE_AGENTS_REL, ["web-developer.md", "notes.toml"]);
    await plantAgentFiles(project, CODEX_AGENTS_REL, ["api-developer.toml", "readme.md"]);

    expect(await getInstallationsByProvider(project)).toStrictEqual([
      { provider: "claude", mode: "eject", skillCount: 2, agentCount: 1 },
      { provider: "codex", mode: "plugin", skillCount: 1, agentCount: 1, marketplace: MARKETPLACE },
    ] satisfies ProviderInstallation[]);
  });

  it("counts a project installation's agents at both scopes, and leaves out the global one beside it", async () => {
    await writeTestTsConfig(home.dir, PLUGIN_ONE, CODEX_SOURCE_REL);
    await writeTestTsConfig(project, EJECTED_PAIR, CLAUDE_SOURCE_REL);
    await plantAgentFiles(home.dir, CLAUDE_AGENTS_REL, ["api-developer.md"]);
    await plantAgentFiles(project, CLAUDE_AGENTS_REL, ["web-developer.md"]);

    expect(await getInstallationsByProvider(project)).toStrictEqual([
      { provider: "claude", mode: "eject", skillCount: 2, agentCount: 2 },
    ] satisfies ProviderInstallation[]);
  });

  it("describes the global installations where the project holds none, counting global agents only", async () => {
    await writeTestTsConfig(home.dir, PLUGIN_ONE, CODEX_SOURCE_REL);
    await plantAgentFiles(home.dir, CODEX_AGENTS_REL, ["api-developer.toml"]);
    await plantAgentFiles(project, CODEX_AGENTS_REL, ["web-developer.toml"]);

    expect(await getInstallationsByProvider(project)).toStrictEqual([
      { provider: "codex", mode: "plugin", skillCount: 1, agentCount: 1, marketplace: MARKETPLACE },
    ] satisfies ProviderInstallation[]);
  });

  it("leaves out a config that declares nothing, and describes the provider beside it", async () => {
    await writeTestTsConfig(project, DECLARING_NOTHING, CLAUDE_SOURCE_REL);
    await writeTestTsConfig(project, EJECTED_PAIR, CODEX_SOURCE_REL);

    expect(await getInstallationsByProvider(project)).toStrictEqual([
      { provider: "codex", mode: "eject", skillCount: 2, agentCount: 0 },
    ] satisfies ProviderInstallation[]);
  });
});
