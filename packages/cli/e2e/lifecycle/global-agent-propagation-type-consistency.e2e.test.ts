import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createPermissionsFile,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readActiveAgentNames } from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { applyEditFrom, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { readGeneratedUnionMembers } from "../../src/cli/lib/__tests__/helpers/generated-types.js";

/**
 * Global-agent propagation — the propagated config pair's value and type sides
 * must stay in lockstep in every registered project.
 *
 * `ProjectConfig` persists no flat selected-agent list. The selected set is
 * derived from the non-excluded `config.agents[]` rows via `activeAgentNames`
 * (`src/cli/lib/configuration/scope-predicates.ts`), and the emitted
 * `SelectedAgentName` union in `config-types.ts` is derived from those same
 * rows (`config-types-writer.ts`, reached through `regenerateConfigTypes` in
 * the gate's `writeProjectConfigPair`). Both halves of a project's pair are
 * written from the same effective config in the same call, so after a global
 * change fans out, a project's active agent rows and its `SelectedAgentName`
 * union must name the same set — drift between them is the regression this
 * spec pins.
 *
 * Setup (exercises the real CLI pipeline end-to-end):
 *   1. `init --from` at HOME of the stack without api-developer — the global
 *      agents rows (and the union they seed) start without it.
 *   2. Register Project B with `init --from` of the same configuration with
 *      web-developer at project scope, so the project owns a sub-agent and
 *      every skill stays global. B's rows inherit the narrow global set.
 *   3. Register Project A the same way.
 *   4. `edit --from` in Project A of the configuration WITH api-developer at
 *      global scope. From a project the global install is only added to, and
 *      api-developer is what it lacks, so it arrives globally and
 *      `propagateGlobalChangesToProjects` rewrites Project B's config pair.
 *
 * Assertion: after propagation, Project B's active agent rows (via
 * `activeAgentNames` over its `config.ts`) and its `SelectedAgentName` union
 * in `config-types.ts` must both include api-developer and must match as sets.
 */

const WEB_DEVELOPER_AGENT = "web-developer";
const API_DEVELOPER_AGENT = "api-developer";
const SELECTED_AGENT_ALIAS = "SelectedAgentName";

/** Phase 1: the stack at global scope, without api-developer. */
const GLOBAL_WITHOUT_API_ID = "Lockstp1";

/** Phases 2 and 3: the same, with web-developer in the project. */
const PROJECT_WEB_ID = "Lockstp2";

/** Phase 4: web-developer in the project, and api-developer at global scope. */
const PROJECT_WEB_GLOBAL_API_ID = "Lockstp3";

describe("global-agent propagation -- value and type sides stay in lockstep", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      GLOBAL_WITHOUT_API_ID,
      e2eStackPayload({ scope: "global", withoutAgents: [API_DEVELOPER_AGENT] }),
    );
    store.publish(
      PROJECT_WEB_ID,
      e2eStackPayload({
        scope: "global",
        withoutAgents: [API_DEVELOPER_AGENT],
        projectAgents: [WEB_DEVELOPER_AGENT],
      }),
    );
    store.publish(
      PROJECT_WEB_GLOBAL_API_ID,
      e2eStackPayload({ scope: "global", projectAgents: [WEB_DEVELOPER_AGENT] }),
    );
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "propagates a newly-globalized agent to both the agent rows AND the SelectedAgentName type of every registered project",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Build global install without api-developer, so the global
      // agent rows (and the `SelectedAgentName` union they seed) start
      // without it.
      // ================================================================
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome } = env;
      const projectADir = path.join(fakeHome, "project-A");
      const projectBDir = path.join(fakeHome, "project-B");

      await mkdir(projectADir, { recursive: true });
      await mkdir(projectBDir, { recursive: true });
      await createPermissionsFile(projectADir);
      await createPermissionsFile(projectBDir);

      const phase1 = await runInitFrom(
        store,
        GLOBAL_WITHOUT_API_ID,
        { dir: fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(phase1.exitCode, `Global init failed: ${phase1.output}`).toBe(EXIT_CODES.SUCCESS);

      const globalConfigPath = configTsPath(fakeHome);
      const globalTypesPath = configTypesTsPath(fakeHome);
      expect(await fileExists(globalConfigPath)).toBe(true);
      expect(await fileExists(globalTypesPath)).toBe(true);

      // Sanity: global starts WITHOUT api-developer. The set is the stack's
      // declared roster minus the one agent the configuration leaves out —
      // what matters here is that api-developer is absent
      // and that the value/type sides agree on the initial narrow set.
      const globalTypesPhase1 = await readTestFile(globalTypesPath);
      const globalSelectedPhase1 = await readActiveAgentNames(fakeHome);
      const globalTypeUnionPhase1 = readGeneratedUnionMembers(
        globalTypesPhase1,
        SELECTED_AGENT_ALIAS,
      );
      expect(globalSelectedPhase1).toContain(WEB_DEVELOPER_AGENT);
      expect(globalSelectedPhase1).not.toContain(API_DEVELOPER_AGENT);
      expect([...globalTypeUnionPhase1].sort()).toStrictEqual([...globalSelectedPhase1].sort());

      // ================================================================
      // Phase 2: Register Project B with web-developer at project scope
      // and every skill global, so Phase 4's promotion is the only global
      // change in play. B's stored agent rows inherit from the narrow
      // global verbatim.
      // ================================================================
      const projectBRegistration = await runInitFrom(
        store,
        PROJECT_WEB_ID,
        { dir: projectBDir, globalHome: fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(projectBRegistration.exitCode, "Project B registration should succeed").toBe(
        EXIT_CODES.SUCCESS,
      );

      const projectBConfigPath = configTsPath(projectBDir);
      const projectBTypesPath = configTypesTsPath(projectBDir);
      expect(await fileExists(projectBConfigPath)).toBe(true);
      expect(await fileExists(projectBTypesPath)).toBe(true);

      // Pre-condition: B starts without api-developer and the value/type
      // sides agree. The exact contents follow the stack's declared roster —
      // the invariant under test is symmetry and api-developer's absence,
      // not the specific composition.
      const projectBTypesBefore = await readTestFile(projectBTypesPath);
      const projectBSelectedBefore = await readActiveAgentNames(projectBDir);
      const projectBTypeUnionBefore = readGeneratedUnionMembers(
        projectBTypesBefore,
        SELECTED_AGENT_ALIAS,
      );
      expect(
        projectBSelectedBefore,
        "Project B's active agent rows must not contain api-developer before global promotion",
      ).not.toContain(API_DEVELOPER_AGENT);
      expect(
        projectBTypeUnionBefore,
        "Project B SelectedAgentName union must not contain api-developer before global promotion",
      ).not.toContain(API_DEVELOPER_AGENT);
      expect(
        [...projectBTypeUnionBefore].sort(),
        "Pre-condition: Project B value and type sides must be in lockstep before the promotion event",
      ).toStrictEqual([...projectBSelectedBefore].sort());

      // ================================================================
      // Phase 3: Register Project A the same way. Order matters only
      // because A's Phase-4 edit propagates to every registered project
      // that is NOT the current one — so B must be registered before
      // the promotion edit is run.
      // ================================================================
      const projectARegistration = await runInitFrom(
        store,
        PROJECT_WEB_ID,
        { dir: projectADir, globalHome: fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(projectARegistration.exitCode, "Project A registration should succeed").toBe(
        EXIT_CODES.SUCCESS,
      );

      // ================================================================
      // Phase 4: Promote api-developer to global via `cc edit --from` in
      // Project A. The apply adds a NEW global-scoped agent to global config
      // (via splitConfigByScope → mergeGlobalConfigs), triggering
      // `propagateGlobalChangesToProjects` for every other registered
      // project — specifically Project B.
      // ================================================================
      const projectBContentBefore = await readTestFile(projectBConfigPath);
      const phase4 = await applyEditFrom(store, PROJECT_WEB_GLOBAL_API_ID, {
        dir: projectADir,
        globalHome: fakeHome,
      });
      expect(phase4.exitCode, `Global edit failed: ${phase4.output}`).toBe(EXIT_CODES.SUCCESS);

      // Sanity: propagation must actually have rewritten B's config.ts
      // and the global config must actually have grown. Otherwise the
      // lockstep assertions below would be vacuous passes.
      const projectBContentAfter = await readTestFile(projectBConfigPath);
      expect(
        projectBContentAfter,
        "Pre-condition: propagation must rewrite Project B's config.ts after Phase 4",
      ).not.toStrictEqual(projectBContentBefore);

      const globalSelectedAfter = await readActiveAgentNames(fakeHome);
      expect(
        globalSelectedAfter,
        "Pre-condition: the global config's active agent rows must include api-developer after Phase 4",
      ).toContain(API_DEVELOPER_AGENT);

      // ================================================================
      // Phase 5: the assertion this spec exists for — the value AND type
      // sides of Project B's config must both carry api-developer.
      // ================================================================
      const projectBTypesAfter = await readTestFile(projectBTypesPath);

      const projectBSelectedAfter = await readActiveAgentNames(projectBDir);
      const projectBTypeUnionAfter = readGeneratedUnionMembers(
        projectBTypesAfter,
        SELECTED_AGENT_ALIAS,
      );

      // Value side: the active rows of config.ts::agents MUST contain api-developer.
      expect(
        projectBSelectedAfter,
        "Project B config.ts::agents must include an active api-developer row after global promotion",
      ).toContain(API_DEVELOPER_AGENT);
      expect(
        projectBSelectedAfter,
        "Project B config.ts::agents must still include an active web-developer row",
      ).toContain(WEB_DEVELOPER_AGENT);

      // Type side: config-types.ts::SelectedAgentName MUST contain api-developer.
      expect(
        projectBTypeUnionAfter,
        "Project B config-types.ts::SelectedAgentName must include api-developer after global promotion",
      ).toContain(API_DEVELOPER_AGENT);
      expect(
        projectBTypeUnionAfter,
        "Project B config-types.ts::SelectedAgentName must still include web-developer",
      ).toContain(WEB_DEVELOPER_AGENT);

      // Symmetry invariant: every active name in config.ts::agents must
      // appear in config-types.ts::SelectedAgentName, and vice versa.
      // Drift between the two writers is what this spec pins.
      expect(
        [...projectBTypeUnionAfter].sort(),
        `config.ts::agents (active) and config-types.ts::SelectedAgentName must match.
config.ts:       ${JSON.stringify([...projectBSelectedAfter].sort())}
config-types.ts: ${JSON.stringify([...projectBTypeUnionAfter].sort())}`,
      ).toStrictEqual([...projectBSelectedAfter].sort());
    },
  );
});
