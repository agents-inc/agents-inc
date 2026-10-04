import path from "path";
import { cp } from "fs/promises";
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
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../src/cli/consts.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";

/**
 * `share` end to end: the CLI turns the installation in this directory into a configuration the
 * store can hold, and hands back the id that installs it again.
 *
 * The claim worth proving here is the round trip, and it can only be proved by making it: install
 * a payload, share what was installed, then install the minted id into a second, untouched
 * directory and compare the two installations. A spec that only inspected the posted body would
 * pass on a payload the decoder cannot read.
 *
 * A share carries plugins only — `share-refuses-ejected.e2e.test.ts` owns the refusal of ejected
 * skills and the `edit --ui` that still opens them — so every installation shared here is a
 * plugin one. Where the spec only needs `share` to READ an installation, the configuration is
 * written as a plugin install records it, which needs no Claude CLI; the round trip installs real
 * plugins at both ends and needs one.
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

  /** A fresh directory, cleaned up after the spec that took it. Its own HOME, so its own scope. */
  async function takeTempDir(): Promise<string> {
    const dir = await createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  /** A plugin installation from the public catalogue, as its config.ts records it. */
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

  it("refuses a scope holding two source folders, without spending a write", async () => {
    const origin = await takeTempDir();
    await writePluginInstallation(origin);

    // The allowed half first, on the same installation: with one source folder it shares.
    const before = await runShare(store, { dir: origin });
    expect(before.exitCode, `share failed: ${before.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(store.minted).toHaveLength(1);

    // The rival: the same source folder under the retired name, which is what a summoner compiled
    // under the other layout leaves behind. Which of the two is read is the resolver's guess.
    await cp(path.join(origin, DIRS.SOURCE_CLAUDE), path.join(origin, DIRS.CLAUDE_SRC), {
      recursive: true,
    });
    store.reset();

    const { exitCode, output } = await runShare(store, { dir: origin });
    const said = flattenCliOutput(output);

    // `edit --ui` mints the same id from the same directory and already refuses here; an id
    // minted from whichever folder the resolver picked describes an installation nobody chose.
    expect(exitCode, `share must refuse a scope holding two source folders: ${said}`).toBe(
      EXIT_CODES.ERROR,
    );
    expect(said).toContain(STEP_TEXT.WRITE_REFUSED_RIVAL_FOLDERS);
    // The same refusal every write command makes, explanation and manual remedy included.
    expect(said).toContain(STEP_TEXT.RIVAL_FOLDERS_REFUSE_WRITES);
    expect(said).toContain(STEP_TEXT.RIVAL_FOLDERS_MANUAL_REMEDY);
    expect(store.requests).toStrictEqual([]);
  });

  it("refuses a directory with nothing installed, without spending a write", async () => {
    const empty = await takeTempDir();

    const { exitCode, output } = await runShare(store, { dir: empty });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain("No installation found");
    // An id for an empty configuration is a dead link, and minting one spends a write from the
    // scarce half of the store's free tier.
    expect(store.requests).toStrictEqual([]);
  });
});

/**
 * The round trip on real plugins, which hands both installs to the Claude CLI — so, like every
 * plugin-mode spec, it needs the binary. The marketplace is the built E2E plugin source, a
 * custom marketplace, which is the case a share has to NAME: the receiver is given no
 * `--marketplace` of its own, so the payload's ref is all it has.
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
      // A plugin from a custom marketplace installs only from that marketplace, so the payload
      // has to say which one.
      const posted: { marketplace?: string } = JSON.parse(firstElement(store.requests).body);
      expect(posted.marketplace).toBe(fixture.sourceDir);

      // The other direction, in a directory that has never seen any of this and is given no
      // marketplace: same skills at the same scopes, the same sub-agent roster, the same
      // per-agent curation, and the same plugins registered.
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
      // The preload split the original payload asked for survives both directions. A plugin skill
      // is preloaded under its plugin-qualified name, `<plugin>:<skill>`, and each skill is its
      // own plugin.
      await expect({ dir: rebuilt }).toHaveAgentFrontmatter(WEB_DEV, {
        exactSkills: [`${E2E_SKILL.vitest.id}:${E2E_SKILL.vitest.id}`],
      });

      // Both ENDS at four-surface strength: the comparisons above are origin-against-rebuild, so
      // two installations that are equally broken satisfy every one of them.
      await expectFourSurfaces(origin);
      await expectFourSurfaces(rebuilt);
    },
  );
});
