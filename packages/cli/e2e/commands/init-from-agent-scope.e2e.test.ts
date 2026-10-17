import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import {
  agentsPath,
  cleanupTempDir,
  listFiles,
  loadConfigOrFail,
  readAgentEntriesFor,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION } from "../fixtures/seed-wire-contract.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES } from "../pages/constants.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * `init --from`: a sub-agent's scope decides which `.claude/agents` holds it, independently of its
 * skills' scope, so each is asserted at its own destination.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

describe("init --from <id>: sub-agent scope", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it("compiles a globally-scoped sub-agent into HOME and a project-scoped one into the project", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish(
      "Scoped01",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        // Eject: the local E2E source has no marketplace for plugins.
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        // web-developer is pinned into the project; api-developer names no scope, so it takes the
        // global default.
        agents: { [WEB_DEV]: { scope: "project" }, [API_DEV]: { on: true } },
      }),
    );

    const { exitCode } = await runInitFrom(
      store,
      "Scoped01",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // The project config inlines the global entry, still marked global.
    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], { scope: "project" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, API_DEV)).toStrictEqual(
      buildAgentConfigs([API_DEV], { scope: "global" }),
    );

    // A sub-agent's scope moves the sub-agent, never its skills.
    const globalConfig = await loadConfigOrFail(env.fakeHome);
    expect(globalConfig.agents).toStrictEqual(buildAgentConfigs([API_DEV], { scope: "global" }));
    expect(globalConfig.skills).toStrictEqual([]);

    const projectConfig = await loadConfigOrFail(env.projectDir);
    expect(projectConfig.skills).toStrictEqual(
      buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
    );

    // Exhaustive listings: a sub-agent compiled into both scopes would pass a subset check.
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${API_DEV}.md`]);

    await expect({ dir: env.projectDir }).toHaveCompiledAgent(WEB_DEV);
    await expect({ dir: env.fakeHome }).toHaveCompiledAgent(API_DEV);

    // The positive on web-developer proves this fixture renders skill ids, so the negative is a
    // real absence.
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(WEB_DEV, {
      skillIds: [E2E_SKILL.react.id],
    });
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(API_DEV, { noSkills: true });
    await expect({ dir: env.fakeHome }).toHaveAgentDynamicSkills(API_DEV, {
      noSkillIds: [E2E_SKILL.react.id],
    });

    // Each side's config pair must hold on its own; the skill-less side is where unions collapse.
    await expectFourSurfaces(env.projectDir, { globalHome: env.fakeHome });
    await expectFourSurfaces(env.fakeHome);
  });
});
