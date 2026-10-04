import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  flattenCliOutput,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { createE2EPluginSource } from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runShare,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { E2E_MARKETPLACE_NAME, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../src/cli/consts.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import {
  buildSkillConfig,
  buildSkillConfigs,
} from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * What `share` says about the marketplace its id names. A payload names ONE marketplace, by the
 * ref `--marketplace` took, and the receiver installs from that one alone — so two shapes of
 * installation share an id that does not install everywhere, and `share` says so after the id
 * rather than refusing:
 *
 * - the marketplace is a folder on disk, so the id installs only where that folder exists;
 * - what is shared comes from more than one marketplace — a global installation from one and a
 *   project from another — so the skills from every marketplace but the one named stay behind.
 *   That is a stopgap until a payload can carry more than one marketplace.
 *
 * The installations are written as a plugin install records them rather than installed, because
 * `share` only reads them and a plugin install needs the Claude CLI. The two-marketplace shape is
 * also not one any command can make from scratch today: `init --marketplace` in a project under a
 * global installation opens the global's dashboard and ignores the flag. The project's file is
 * written as the writer leaves it — the global entries inlined beside the project's own, the
 * global sub-agents' rows in HOME's file alone.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** The fixture marketplace, published to GitHub rather than read from a folder. */
const FIXTURE_ON_GITHUB = `github:agents-inc/${E2E_MARKETPLACE_NAME}`;

/** A second custom marketplace, the one a project installs from, and the skill it ships. */
const ACME_MARKETPLACE = { name: "acme", ref: "github:acme/skills" } as const;
const ACME_SKILL_ID = "acme-web-testing-house-style";

/** What the store received as the mint, parsed. */
type PostedPayload = { marketplace?: string; skills: Record<string, unknown> };

describe("share names the marketplace its id installs from", () => {
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

  async function takeTempDir(): Promise<string> {
    const dir = await createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  async function takeEnvironment(): Promise<TestEnvironment> {
    const env = await createTestEnvironment({ permissions: false });
    tempDirs.push(env.tempDir);
    return env;
  }

  /** The one body the store was asked to mint. */
  function postedPayload(): PostedPayload {
    return JSON.parse(firstElement(store.requests.filter((r) => r.method === "POST")).body);
  }

  /** A plugin installation of the fixture marketplace, recording `marketplace` as its ref. */
  async function writeFixturePluginInstallation(dir: string, marketplace: string): Promise<void> {
    await writeProjectConfig(
      dir,
      buildProjectConfig({
        name: "marketplace-share",
        marketplace,
        marketplaceName: E2E_MARKETPLACE_NAME,
        skills: buildSkillConfigs([E2E_SKILL.react.id, E2E_SKILL.vitest.id], {
          scope: "global",
          origin: E2E_MARKETPLACE_NAME,
        }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      }),
    );
  }

  /**
   * A project installed from {@link ACME_MARKETPLACE} under a global installation whose React
   * plugin came from somewhere else: HOME's file records that marketplace and web-developer's
   * row, and the project's own file inlines HOME's entries beside its Acme skill.
   */
  async function writeTwoMarketplaceProject(
    env: TestEnvironment,
    global: { marketplace?: string; marketplaceName?: string; origin: string },
  ): Promise<void> {
    const inherited = {
      skills: [buildSkillConfig(E2E_SKILL.react.id, { scope: "global", origin: global.origin })],
      agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
    };
    await writeProjectConfig(
      env.fakeHome,
      buildProjectConfig({
        name: "global",
        ...(global.marketplace !== undefined && { marketplace: global.marketplace }),
        ...(global.marketplaceName !== undefined && { marketplaceName: global.marketplaceName }),
        ...inherited,
        stack: { [WEB_DEV]: { "web-framework": [sa(E2E_SKILL.react.id, true)] } },
      }),
    );
    await writeProjectConfig(
      env.projectDir,
      buildProjectConfig({
        name: "project",
        marketplace: ACME_MARKETPLACE.ref,
        marketplaceName: ACME_MARKETPLACE.name,
        skills: [
          ...inherited.skills,
          buildSkillConfig(ACME_SKILL_ID, { scope: "project", origin: ACME_MARKETPLACE.name }),
        ],
        agents: inherited.agents,
      }),
    );
  }

  it("shares an id naming a marketplace folder, then says it installs only where that folder exists", async () => {
    const { sourceDir } = await createE2EPluginSource();
    const origin = await takeTempDir();
    await writeFixturePluginInstallation(origin, sourceDir);

    const { exitCode, output } = await runShare(store, { dir: origin });
    const said = flattenCliOutput(output);

    expect(exitCode, `share failed: ${said}`).toBe(EXIT_CODES.SUCCESS);
    expect(postedPayload().marketplace).toBe(sourceDir);
    const mintedId = firstElement(store.minted);
    expect(said).toContain(mintedId);
    expect(said, "the id travels with a folder only this machine has").toContain(
      STEP_TEXT.SHARE_FOLDER_MARKETPLACE,
    );
    // After the id, so the line reads as a note about it rather than as a reason it failed.
    expect(said.indexOf(STEP_TEXT.SHARE_FOLDER_MARKETPLACE)).toBeGreaterThan(
      said.indexOf(mintedId),
    );
  });

  it("shares an id naming a GitHub marketplace without that warning", async () => {
    const origin = await takeTempDir();
    await writeFixturePluginInstallation(origin, FIXTURE_ON_GITHUB);

    const { exitCode, output } = await runShare(store, { dir: origin });
    const said = flattenCliOutput(output);

    expect(exitCode, `share failed: ${said}`).toBe(EXIT_CODES.SUCCESS);
    expect(postedPayload().marketplace).toBe(FIXTURE_ON_GITHUB);
    expect(said).not.toContain(STEP_TEXT.SHARE_FOLDER_MARKETPLACE);
    expect(said).not.toContain(STEP_TEXT.SHARE_SKILLS_NOT_INSTALLED_ELSEWHERE);
  });

  it("shares a project and a global from two custom marketplaces, naming the skills its id leaves behind", async () => {
    const env = await takeEnvironment();
    await writeTwoMarketplaceProject(env, {
      marketplace: FIXTURE_ON_GITHUB,
      marketplaceName: E2E_MARKETPLACE_NAME,
      origin: E2E_MARKETPLACE_NAME,
    });

    const { exitCode, output } = await runShare(store, {
      dir: env.projectDir,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(output);

    expect(exitCode, `share must share a setup from two marketplaces, and said: ${said}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    // Everything is shared, under the marketplace this project records; the global's React
    // plugin is the one the id cannot install anywhere else.
    const posted = postedPayload();
    expect(posted.marketplace).toBe(ACME_MARKETPLACE.ref);
    expect(Object.keys(posted.skills).sort()).toStrictEqual(
      [E2E_SKILL.react.id, ACME_SKILL_ID].sort(),
    );
    expect(said).toContain(STEP_TEXT.SHARE_SKILLS_NOT_INSTALLED_ELSEWHERE);
    expect(said).toContain(E2E_SKILL.react.id);
    expect(said).not.toContain(ACME_SKILL_ID);
  });

  it("shares a project from a custom marketplace under a global from the public catalogue, naming the catalogue's skills", async () => {
    const env = await takeEnvironment();
    await writeTwoMarketplaceProject(env, { origin: DEFAULT_PUBLIC_SOURCE_NAME });

    const { exitCode, output } = await runShare(store, {
      dir: env.projectDir,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(output);

    expect(exitCode, `share failed: ${said}`).toBe(EXIT_CODES.SUCCESS);
    expect(postedPayload().marketplace).toBe(ACME_MARKETPLACE.ref);
    // The public catalogue is a marketplace too: a receiver given Acme's ref loads Acme alone, so
    // the public React plugin is left behind exactly as a second custom marketplace's would be.
    expect(said, "the id names Acme alone, so the catalogue's skills stay behind").toContain(
      STEP_TEXT.SHARE_SKILLS_NOT_INSTALLED_ELSEWHERE,
    );
    expect(said).toContain(E2E_SKILL.react.id);
    expect(said).not.toContain(ACME_SKILL_ID);
  });
});
