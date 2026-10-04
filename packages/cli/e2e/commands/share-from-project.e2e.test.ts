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
 * `share` and `edit --ui` run inside a project whose sub-agents are global — the shape the wizard
 * installs by default, and the one every `init --from` run from a project leaves (journeys 23, 29
 * and 30). Both send everything — the global sub-agents with their skills — and ask nothing.
 *
 * The writer splits curation by scope: a global sub-agent's stack row is written to HOME's
 * `config.ts` and nowhere else, while the project's file inlines the global skill and sub-agent
 * entries without their rows. So a mint that reads the project's file alone drops every row naming
 * an inherited sub-agent — a skill only they load posts as `assignments: {}` — and the id it hands
 * back installs those sub-agents bare.
 *
 * `commands/share`, `commands/edit-ui` and both `lifecycle/share-round-trip-*` specs never see it,
 * because each of them mints AT HOME: a handle without `globalHome` runs with HOME set to its own
 * directory, and the lifecycle specs pass `globalHome: origin`. Here the project sits inside a
 * HOME of its own, as a real one does, and the posted body is compared against the payload that
 * was installed — which is the assertion that carries the red in both specs.
 *
 * `share` shares plugins only, so its leg installs plugins and needs the Claude CLI; `edit --ui`
 * still opens ejected skills, so its leg installs them and needs nothing. Both mint through the
 * one function, so the `edit --ui` leg is the half that runs wherever the Claude CLI does not.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const claudeAvailable = await isClaudeCLIAvailable();

/** The body the store was asked to mint, parsed. */
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

  /** A fresh HOME with an empty project inside it, cleaned up after the spec that took it. */
  async function takeEnvironment(): Promise<TestEnvironment> {
    const env = await createTestEnvironment({ permissions: false });
    environments.push(env);
    return env;
  }

  it("edit --ui hands the editor the curation of the sub-agents the project inherits", async () => {
    // What the editor's Install dialog leads to: an id installed with `init --from` from inside a
    // project, every sub-agent at the global default, so every row is in HOME's file alone.
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
    // The editor opens exactly this payload: a row missing here is a sub-agent it paints as a
    // base agent, and an apply back through `edit --from` compiles bare.
    expect(
      postedSkills(store),
      "the payload the editor opens must carry the rows of the sub-agents the project inherits from HOME",
    ).toStrictEqual(skills);
  });
});

/**
 * The `share` half, on plugins: a share carries nothing else. The marketplace is the built E2E
 * plugin source, and both installs hand their plugins to the Claude CLI.
 */
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
      // One sub-agent pinned into the project and the other left global, as the wizard leaves
      // them. React's row belongs to the project's web-developer and is written to the project's
      // file; Hono's belongs to the global api-developer and is written to HOME's file alone.
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

      // Exit 0 with no terminal attached is also the proof that it asked nothing.
      expect(shared.exitCode, `share failed: ${shared.output}`).toBe(EXIT_CODES.SUCCESS);
      // The project sits inside this HOME, so one snapshot covers both scopes: the id is a
      // reading of the installation, not a rewrite of it.
      expect(await readTreeSnapshot(origin.fakeHome)).toStrictEqual(before);
      // React's row is the control: the project's own file keeps it, so it travels either way.
      expect(
        postedSkills(store),
        "a share minted in a project must carry the rows of the sub-agents it inherits from HOME, not only its own",
      ).toStrictEqual(skills);

      // The other direction, into a HOME and project that have never seen any of it.
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

      // Each scope's roster is named before its bodies are compared: `readCompiledAgents` answers
      // `{}` for a directory that is not there, and two ends that compiled nothing would agree.
      const originGlobalBodies = await readCompiledAgents(origin.fakeHome);
      const originProjectBodies = await readCompiledAgents(origin.projectDir);
      expect(Object.keys(originGlobalBodies)).toStrictEqual([`${API_DEV}.md`]);
      expect(Object.keys(originProjectBodies)).toStrictEqual([`${WEB_DEV}.md`]);
      expect(await readCompiledAgents(rebuilt.fakeHome)).toStrictEqual(originGlobalBodies);
      expect(await readCompiledAgents(rebuilt.projectDir)).toStrictEqual(originProjectBodies);
    },
  );
});
