import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Provider } from "../../../consts.js";
import type { PluginHost } from "../../hosts/plugin-host.js";

// One host per provider, each listing only what that provider installed; the door picks by
// provider as the real one does. No other export is passed through, so nothing reaches a real host.
vi.mock("../../hosts/host-for.js", async () => {
  const { createMockPluginHost } = await import("../../__tests__/helpers/mock-plugin-host.js");
  const { providerInUse } = await import("../../installation/install-layout.js");
  const hosts: Record<Provider, PluginHost> = {
    claude: createMockPluginHost({ provider: "claude" }),
    codex: createMockPluginHost({ provider: "codex" }),
  };
  return {
    hostFor: (provider: Provider) => hosts[provider],
    hostAt: (root: string) => hosts[providerInUse(root)],
  };
});

import { discoverInstalledSkills } from "./discover-skills.js";
import { hostFor } from "../../hosts/host-for.js";
import { setVerbose } from "../../../utils/logger.js";
import { skillsDir } from "../../installation/install-layout.js";
import { initializeMatrix } from "../../matrix/matrix-provider.js";
import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { createMockMatrix } from "../../__tests__/factories/matrix-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { writeTestPluginManifest, writeTestSkill } from "../../__tests__/helpers/disk-writers.js";
import { useFakeHome } from "../../__tests__/helpers/isolated-home.js";
import { silenceConsole } from "../../__tests__/helpers/silence-console.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { SKILLS } from "../../__tests__/test-fixtures.js";
import { PROVIDERS, sourceDirName } from "../../../consts.js";
import type { SkillId } from "../../../types/index.js";
import { typedKeys } from "../../../utils/typed-object.js";

/**
 * A project under a home holding a Claude and a Codex global installation inherits only its own
 * provider's: the global skills it discovers, copied in and plugin alike, are that installation's.
 * Each global holds skills the other does not, so which one was read is visible. Claude is the
 * control, being also the provider a home holding both would otherwise be read as.
 *
 * CLI-984.
 */

const GLOBAL_COPIED_IN = {
  claude: SKILLS.react.id,
  codex: SKILLS.zustand.id,
} as const satisfies Record<Provider, SkillId>;

const GLOBAL_PLUGIN = {
  claude: SKILLS.vitest.id,
  codex: SKILLS.hono.id,
} as const satisfies Record<Provider, SkillId>;

describe("discoverInstalledSkills in a project under a home holding a Claude and a Codex global installation", () => {
  const consoleSpies = silenceConsole(["log"]);
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv("CODEX_HOME", "");
    setVerbose(true);
    tempDir = await createTempDir("cc-discover-home-holding-both-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    initializeMatrix(createMockMatrix(SKILLS.react, SKILLS.hono, SKILLS.zustand, SKILLS.vitest));
  });

  afterEach(async () => {
    setVerbose(false);
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  /** Each global installation copies in one skill and installs another as a plugin. */
  async function installBothAtHomeThenTheProjectOn(provider: Provider): Promise<void> {
    await writeTestTsConfig(projectDir, buildProjectConfig(), sourceDirName(provider));

    for (const atHome of PROVIDERS) {
      await writeTestTsConfig(home.dir, buildProjectConfig(), sourceDirName(atHome));
      await writeTestSkill(skillsDir(atHome, "global", home.dir), GLOBAL_COPIED_IN[atHome]);

      const pluginId = GLOBAL_PLUGIN[atHome];
      const installPath = path.join(tempDir, "plugin-cache", atHome, pluginId);
      await writeTestPluginManifest(installPath, { name: pluginId });
      await writeTestSkill(path.join(installPath, "skills"), pluginId);
      const installed = {
        pluginKey: `${pluginId}@test-marketplace`,
        installPath,
        enabled: true,
      };
      vi.mocked(hostFor(atHome).listPlugins).mockImplementation((root) =>
        Promise.resolve(root === home.dir ? [installed] : []),
      );
    }
  }

  it.each(PROVIDERS)(
    "discovers the global skills a %s project inherits from its own provider's installation only",
    async (provider) => {
      await installBothAtHomeThenTheProjectOn(provider);

      const { allSkills, unusableMetadata, ...counts } = await discoverInstalledSkills(projectDir);

      expect(typedKeys<SkillId>(allSkills).toSorted()).toStrictEqual(
        [GLOBAL_COPIED_IN[provider], GLOBAL_PLUGIN[provider]].toSorted(),
      );
      expect(counts).toStrictEqual({
        totalSkillCount: 2,
        pluginSkillCount: 1,
        globalPluginSkillCount: 1,
        globalLocalSkillCount: 1,
      });
      expect(unusableMetadata).toStrictEqual([]);
      expect(consoleSpies.log).toHaveBeenCalledWith(
        `    Found 1 global local skills from ${skillsDir(provider, "global", home.dir)}`,
      );
    },
  );
});
