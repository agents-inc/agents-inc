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
import {
  E2E_MARKETPLACE_NAME,
  EXIT_CODES,
  PUBLIC_MARKETPLACE_NAME,
  STEP_TEXT,
} from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import {
  buildSkillConfig,
  buildSkillConfigs,
} from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * `share` warns after the id when it will not install everywhere: the marketplace is a local
 * folder, or the shared skills span more than one marketplace. Installations are written as a
 * plugin install records them, since `share` only reads them.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const FIXTURE_ON_GITHUB = `github:agents-inc/${E2E_MARKETPLACE_NAME}`;

const ACME_MARKETPLACE = { name: "acme", ref: "github:acme/skills" } as const;
const ACME_SKILL_ID = "acme-web-testing-house-style";

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

  function postedPayload(): PostedPayload {
    return JSON.parse(firstElement(store.requests.filter((r) => r.method === "POST")).body);
  }

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
   * HOME records another marketplace and web-developer's row; the project's file inlines HOME's
   * entries beside its Acme skill.
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
    // After the id, so it reads as a note, not a failure.
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
    // Shared under the project's marketplace, so the global React plugin cannot install elsewhere.
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
    await writeTwoMarketplaceProject(env, { origin: PUBLIC_MARKETPLACE_NAME });

    const { exitCode, output } = await runShare(store, {
      dir: env.projectDir,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(output);

    expect(exitCode, `share failed: ${said}`).toBe(EXIT_CODES.SUCCESS);
    expect(postedPayload().marketplace).toBe(ACME_MARKETPLACE.ref);
    // The public catalogue is a marketplace too: given Acme's ref, its React plugin stays behind.
    expect(said, "the id names Acme alone, so the catalogue's skills stay behind").toContain(
      STEP_TEXT.SHARE_SKILLS_NOT_INSTALLED_ELSEWHERE,
    );
    expect(said).toContain(E2E_SKILL.react.id);
    expect(said).not.toContain(ACME_SKILL_ID);
  });
});
