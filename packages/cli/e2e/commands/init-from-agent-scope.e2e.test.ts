import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  cleanupTempDir,
  ensureBinaryExists,
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
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES } from "../pages/constants.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";

/**
 * `init --from <id>`: where a shared configuration's sub-agents land.
 *
 * A scope on a sub-agent is not the same thing as a scope on a skill. A skill's scope decides which
 * `.claude/skills` directory holds its files; a sub-agent's decides which `.claude/agents`
 * directory holds its compiled `.md`, and therefore which projects can see it at all. One payload
 * can name both, independently, so each has to be asserted at its own destination.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

/**
 * A payload as the web app builds it.
 *
 * The version is a literal rather than the vendored `SEED_VERSION`, exactly as in the sibling
 * `--from` specs: this spec pins the wire contract, so it has to fail while the CLI is still on
 * the old one instead of following it.
 */
function seedPayload(skills: Record<string, unknown>, agents: Record<string, unknown> = {}) {
  return { v: 3, matrixVersion: "1.0.0", stackId: null, skills, agents };
}

/** One skill row, at its own (project) scope — the sub-agent's scope is the subject here. */
function skillEntry(overrides: Record<string, unknown> = {}) {
  return {
    // Eject, because the E2E source is local and has no marketplace — plugin mode legitimately
    // refuses that, which is its own (correct) error rather than anything this path controls.
    install: "eject",
    scope: "project",
    assignments: { [WEB_DEV]: "lazy" },
    ...overrides,
  };
}

describe("init --from <id>: sub-agent scope", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
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
      seedPayload(
        { [E2E_SKILL.react.id]: skillEntry() },
        // web-developer arrives through its assignment and names no scope, so it stays in the
        // project. api-developer travels globally with no skills of its own: the `agents` map is
        // the only place a configuration can say either thing.
        { [API_DEV]: { on: true, scope: "global" } },
      ),
    );

    const { exitCode } = await runInitFrom(
      store,
      "Scoped01",
      { dir: env.projectDir, globalHome: env.fakeHome },
      sourceDir,
    );
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // The project config inlines the global entry, so it shows both sub-agents — with the global
    // one still marked global rather than silently re-homed into the project.
    expect(await readAgentEntriesFor(env.projectDir, WEB_DEV)).toStrictEqual(
      buildAgentConfigs([WEB_DEV], { scope: "project" }),
    );
    expect(await readAgentEntriesFor(env.projectDir, API_DEV)).toStrictEqual(
      buildAgentConfigs([API_DEV], { scope: "global" }),
    );

    // The global config owns the global sub-agent and nothing else: a sub-agent's scope moves the
    // sub-agent, never the skills around it.
    const globalConfig = await loadConfigOrFail(env.fakeHome);
    expect(globalConfig.agents).toStrictEqual(buildAgentConfigs([API_DEV], { scope: "global" }));
    expect(globalConfig.skills).toStrictEqual([]);

    const projectConfig = await loadConfigOrFail(env.projectDir);
    expect(projectConfig.skills).toStrictEqual(buildSkillConfigs([E2E_SKILL.react.id]));

    // Exhaustive directory listings, not "contains": a sub-agent compiled into BOTH scopes would
    // satisfy a subset check at either one.
    expect(await listFiles(agentsPath(env.projectDir))).toStrictEqual([`${WEB_DEV}.md`]);
    expect(await listFiles(agentsPath(env.fakeHome))).toStrictEqual([`${API_DEV}.md`]);

    // Each file is a real compiled agent rather than an empty placeholder...
    await expect({ dir: env.projectDir }).toHaveCompiledAgent(WEB_DEV);
    await expect({ dir: env.fakeHome }).toHaveCompiledAgent(API_DEV);

    // ...and the globally-scoped one arrived bare. The positive half on web-developer proves this
    // fixture DOES inject skill ids into a compiled body, so the negative is a real absence rather
    // than a section that never renders.
    await expect({ dir: env.projectDir }).toHaveAgentDynamicSkills(WEB_DEV, {
      skillIds: [E2E_SKILL.react.id],
      hasActivationProtocol: true,
    });
    await expect({ dir: env.fakeHome }).toHaveAgentFrontmatter(API_DEV, { noSkills: true });
    await expect({ dir: env.fakeHome }).toHaveAgentDynamicSkills(API_DEV, {
      noSkillIds: [E2E_SKILL.react.id],
    });
  });
});
