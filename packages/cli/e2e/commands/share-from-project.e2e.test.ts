import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  isClaudeCLIAvailable,
  loadConfigOrFail,
  readCompiledAgents,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runEditUi,
  runInitFrom,
  runShare,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION, ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * `share` and `edit --ui` inside a project whose sub-agents are global must send the global rows
 * too, which live only in HOME's config.ts. The posted body is compared against the installed
 * payload, which is the assertion that carries the red in both specs. `share` needs plugins and the
 * Claude CLI; `edit --ui` runs on ejected skills anywhere.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const claudeAvailable = await isClaudeCLIAvailable();

function postedSkills(store: SeedConfigStore): unknown {
  const posted: { skills: unknown } = JSON.parse(
    firstElement(store.requests.filter((request) => request.method === "POST")).body,
  );
  return posted.skills;
}

describe("minting an id in a project that inherits sub-agents from HOME", () => {
  let store: SeedConfigStore;
  const environments: TestEnvironment[] = [];

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    await Promise.all(environments.splice(0).map((env) => cleanupTempDir(env.tempDir)));
  });

  async function takeEnvironment(): Promise<TestEnvironment> {
    const env = await createTestEnvironment({ permissions: false });
    environments.push(env);
    return env;
  }

  it("edit --ui hands the editor the curation of the sub-agents the project inherits", async () => {
    // Every sub-agent at the global default, so every row is in HOME's file alone.
    const skills = {
      [E2E_SKILL.react.id]: ejectedGlobalSkill(),
      [E2E_SKILL.vitest.id]: ejectedGlobalSkill({ assignments: { [WEB_DEV]: "preloaded" } }),
    };
    store.publish("Inherit2", buildSeedPayload({ v: PINNED_WIRE_VERSION, skills }));
    const origin = await takeEnvironment();
    const project = { dir: origin.projectDir, globalHome: origin.fakeHome };
    const installed = await runInitFrom(store, "Inherit2", project, E2E_SOURCE.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    const before = await readTreeSnapshot(origin.fakeHome);

    const opened = await runEditUi(store, project);

    expect(opened.exitCode, `edit --ui failed: ${opened.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(await readTreeSnapshot(origin.fakeHome)).toStrictEqual(before);
    // A missing row is a sub-agent the editor paints as a base agent.
    expect(
      postedSkills(store),
      "the payload the editor opens must carry the rows of the sub-agents the project inherits from HOME",
    ).toStrictEqual(skills);
  });
});

/** `share` carries plugins only, so this leg needs the built plugin source and the Claude CLI. */
describe.skipIf(!claudeAvailable)("sharing a project that inherits sub-agents from HOME", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  const environments: TestEnvironment[] = [];

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    await Promise.all(environments.splice(0).map((env) => cleanupTempDir(env.tempDir)));
  });

  async function takeEnvironment(): Promise<TestEnvironment> {
    const env = await createTestEnvironment({ permissions: false });
    environments.push(env);
    return env;
  }

  it(
    "share carries the inherited sub-agents' curation, so its id rebuilds both scopes",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // React's row goes to the project's file, Hono's to HOME's alone.
      const skills = {
        [E2E_SKILL.react.id]: buildSeedSkill({
          install: "plugin",
          scope: "global",
          assignments: { [WEB_DEV]: "lazy" },
        }),
        [E2E_SKILL.hono.id]: buildSeedSkill({
          install: "plugin",
          scope: "global",
          assignments: { [API_DEV]: "preloaded" },
        }),
      };
      store.publish(
        "Inherit1",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills,
          agents: { [WEB_DEV]: { scope: "project" } },
        }),
      );
      const origin = await takeEnvironment();
      const project = { dir: origin.projectDir, globalHome: origin.fakeHome };
      const installed = await runInitFrom(store, "Inherit1", project, fixture.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      store.reset();
      const before = await readTreeSnapshot(origin.fakeHome);

      const shared = await runShare(store, project);

      // Exit 0 with no terminal also proves it asked nothing.
      expect(shared.exitCode, `share failed: ${shared.output}`).toBe(EXIT_CODES.SUCCESS);
      // The project sits inside this HOME, so one snapshot covers both scopes.
      expect(await readTreeSnapshot(origin.fakeHome)).toStrictEqual(before);
      // Control: the project's own file keeps React's row.
      expect(
        postedSkills(store),
        "a share minted in a project must carry the rows of the sub-agents it inherits from HOME, not only its own",
      ).toStrictEqual(skills);

      const rebuilt = await takeEnvironment();
      const reinstalled = await runInitFrom(
        store,
        firstElement(store.minted),
        { dir: rebuilt.projectDir, globalHome: rebuilt.fakeHome },
        fixture.sourceDir,
      );
      expect(reinstalled.exitCode, `reinstall failed: ${reinstalled.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      expect((await loadConfigOrFail(rebuilt.fakeHome)).stack).toStrictEqual(
        (await loadConfigOrFail(origin.fakeHome)).stack,
      );
      expect((await loadConfigOrFail(rebuilt.projectDir)).stack).toStrictEqual(
        (await loadConfigOrFail(origin.projectDir)).stack,
      );

      // Rosters before bodies: `readCompiledAgents` answers `{}` for a missing directory.
      const originGlobalBodies = await readCompiledAgents(origin.fakeHome);
      const originProjectBodies = await readCompiledAgents(origin.projectDir);
      expect(Object.keys(originGlobalBodies)).toStrictEqual([`${API_DEV}.md`]);
      expect(Object.keys(originProjectBodies)).toStrictEqual([`${WEB_DEV}.md`]);
      expect(await readCompiledAgents(rebuilt.fakeHome)).toStrictEqual(originGlobalBodies);
      expect(await readCompiledAgents(rebuilt.projectDir)).toStrictEqual(originProjectBodies);
    },
  );
});
