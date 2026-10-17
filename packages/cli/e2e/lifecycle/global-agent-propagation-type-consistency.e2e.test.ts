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
 * After a global change fans out, a registered project's active agent rows and its
 * `SelectedAgentName` union must name the same set: api-developer promoted to global from project
 * A must reach both halves of project B's config pair.
 */

const WEB_DEVELOPER_AGENT = "web-developer";
const API_DEVELOPER_AGENT = "api-developer";
const SELECTED_AGENT_ALIAS = "SelectedAgentName";

const GLOBAL_WITHOUT_API_ID = "Lockstp1";

const PROJECT_WEB_ID = "Lockstp2";

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

      // Sanity: api-developer absent, and the two sides agree on the narrow set.
      const globalTypesPhase1 = await readTestFile(globalTypesPath);
      const globalSelectedPhase1 = await readActiveAgentNames(fakeHome);
      const globalTypeUnionPhase1 = readGeneratedUnionMembers(
        globalTypesPhase1,
        SELECTED_AGENT_ALIAS,
      );
      expect(globalSelectedPhase1).toContain(WEB_DEVELOPER_AGENT);
      expect(globalSelectedPhase1).not.toContain(API_DEVELOPER_AGENT);
      expect([...globalTypeUnionPhase1].sort()).toStrictEqual([...globalSelectedPhase1].sort());

      // Every skill global, so the later promotion is the only global change in play.
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

      // A's edit propagates to every OTHER registered project, so B must be registered first.
      const projectARegistration = await runInitFrom(
        store,
        PROJECT_WEB_ID,
        { dir: projectADir, globalHome: fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(projectARegistration.exitCode, "Project A registration should succeed").toBe(
        EXIT_CODES.SUCCESS,
      );

      const projectBContentBefore = await readTestFile(projectBConfigPath);
      const phase4 = await applyEditFrom(store, PROJECT_WEB_GLOBAL_API_ID, {
        dir: projectADir,
        globalHome: fakeHome,
      });
      expect(phase4.exitCode, `Global edit failed: ${phase4.output}`).toBe(EXIT_CODES.SUCCESS);

      // Propagation rewrote B and the global config grew, or the assertions below are vacuous.
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

      const projectBTypesAfter = await readTestFile(projectBTypesPath);

      const projectBSelectedAfter = await readActiveAgentNames(projectBDir);
      const projectBTypeUnionAfter = readGeneratedUnionMembers(
        projectBTypesAfter,
        SELECTED_AGENT_ALIAS,
      );

      expect(
        projectBSelectedAfter,
        "Project B config.ts::agents must include an active api-developer row after global promotion",
      ).toContain(API_DEVELOPER_AGENT);
      expect(
        projectBSelectedAfter,
        "Project B config.ts::agents must still include an active web-developer row",
      ).toContain(WEB_DEVELOPER_AGENT);

      expect(
        projectBTypeUnionAfter,
        "Project B config-types.ts::SelectedAgentName must include api-developer after global promotion",
      ).toContain(API_DEVELOPER_AGENT);
      expect(
        projectBTypeUnionAfter,
        "Project B config-types.ts::SelectedAgentName must still include web-developer",
      ).toContain(WEB_DEVELOPER_AGENT);

      expect(
        [...projectBTypeUnionAfter].sort(),
        `config.ts::agents (active) and config-types.ts::SelectedAgentName must match.
config.ts:       ${JSON.stringify([...projectBSelectedAfter].sort())}
config-types.ts: ${JSON.stringify([...projectBTypeUnionAfter].sort())}`,
      ).toStrictEqual([...projectBSelectedAfter].sort());
    },
  );
});
