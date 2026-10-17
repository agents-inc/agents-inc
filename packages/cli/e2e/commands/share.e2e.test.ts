import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import {
  agentsPath,
  createTempDir,
  cleanupTempDir,
  flattenCliOutput,
  isClaudeCLIAvailable,
  listFiles,
  loadConfigOrFail,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  runInitFrom,
  runShare,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { CLI } from "../fixtures/cli.js";
import { PINNED_WIRE_VERSION } from "../fixtures/seed-wire-contract.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../src/cli/consts.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";

/**
 * `share` round trip: install, share, install the minted id into a fresh directory, compare. Shares
 * carry plugins only; where `share` only reads, the config is written as a plugin install records
 * it.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const claudeAvailable = await isClaudeCLIAvailable();

describe("share", () => {
  let store: SeedConfigStore;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /** Its own HOME, so its own scope. */
  async function takeTempDir(): Promise<string> {
    const dir = await createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  async function writePluginInstallation(dir: string): Promise<void> {
    await writeProjectConfig(
      dir,
      buildProjectConfig({
        name: "plugin-share",
        skills: buildSkillConfigs([E2E_SKILL.react.id], {
          scope: "global",
          origin: DEFAULT_PUBLIC_SOURCE_NAME,
        }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      }),
    );
  }

  it("identifies itself as the CLI, and posts to the collection rather than to an id", async () => {
    const origin = await takeTempDir();
    await writePluginInstallation(origin);

    await runShare(store, { dir: origin });

    expect(store.requests).toHaveLength(1);
    expect(firstElement(store.requests).method).toBe("POST");
    expect(firstElement(store.requests).url).toBe("/configs");
    expect(firstElement(store.requests).userAgent).toBe("agents-inc-cli");
  });

  it("refuses a directory with nothing installed, without spending a write", async () => {
    const empty = await takeTempDir();

    const { exitCode, output } = await runShare(store, { dir: empty });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain("No installation found");
    // An empty configuration's id is a dead link, and minting spends a scarce store write.
    expect(store.requests).toStrictEqual([]);
  });
});

/**
 * Real plugins need the Claude binary. A custom marketplace, so the payload's ref is all the
 * receiver has.
 */
describe.skipIf(!claudeAvailable)("share, with plugins installed at both ends", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  async function takeTempDir(): Promise<string> {
    const dir = await createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  it(
    "mints an id whose install, with no --marketplace, matches the installation it was minted from",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const origin = await takeTempDir();
      store.publish(
        "Plugin01",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "plugin",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [E2E_SKILL.vitest.id]: buildSeedSkill({
              install: "plugin",
              scope: "global",
              assignments: { [WEB_DEV]: "preloaded" },
            }),
          },
        }),
      );
      const installed = await runInitFrom(store, "Plugin01", { dir: origin }, fixture.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      store.reset();

      const shared = await runShare(store, { dir: origin });

      expect(shared.exitCode, `share failed: ${shared.output}`).toBe(EXIT_CODES.SUCCESS);
      expect(store.minted).toHaveLength(1);
      const mintedId = firstElement(store.minted);
      expect(shared.output).toContain(mintedId);
      // A custom marketplace's plugin installs only from it, so the payload must name it.
      const posted: { marketplace?: string } = JSON.parse(firstElement(store.requests).body);
      expect(posted.marketplace).toBe(fixture.sourceDir);

      const rebuilt = await takeTempDir();
      const reinstalled = await CLI.run(
        ["init", "--from", mintedId],
        { dir: rebuilt },
        { env: { AGENTS_INC_API_URL: store.url } },
      );
      expect(reinstalled.exitCode, `reinstall failed: ${reinstalled.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const before = await loadConfigOrFail(origin);
      const after = await loadConfigOrFail(rebuilt);
      expect(after.skills).toStrictEqual(before.skills);
      expect(after.agents).toStrictEqual(before.agents);
      expect(after.stack).toStrictEqual(before.stack);
      expect(await listFiles(agentsPath(rebuilt))).toStrictEqual(
        await listFiles(agentsPath(origin)),
      );
      for (const skillId of [E2E_SKILL.react.id, E2E_SKILL.vitest.id]) {
        const ref = buildMarketplacePluginRef(skillId, fixture.marketplaceName);
        await expect({ dir: rebuilt }).toHavePluginInRegistry(ref, "user");
        await expect({ dir: rebuilt }).toHavePlugin(ref);
      }
      // A plugin skill preloads as `<plugin>:<skill>`, one plugin per skill.
      await expect({ dir: rebuilt }).toHaveAgentFrontmatter(WEB_DEV, {
        exactSkills: [`${E2E_SKILL.vitest.id}:${E2E_SKILL.vitest.id}`],
      });

      // Both ends at full strength: two equally broken installs pass the comparisons above.
      await expectFourSurfaces(origin);
      await expectFourSurfaces(rebuilt);
    },
  );
});
