import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { TIMEOUTS, EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import {
  agentsPath,
  isClaudeCLIAvailable,
  cleanupTempDir,
  fileExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createTestEnvironment,
  readSkillEntries,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { applyEditFrom, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import type { SeedSkill } from "@workspace/matrix/seed";

/**
 * Dual-scope edit with mixed sources: a project's ejected skill switched to plugin. Requires the
 * Claude CLI.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const API_DEV = E2E_AGENT["api-developer"].name;

const PLUGIN_STACK_ID = "PlugStk2";

function projectHonoPayload(install: SeedSkill["install"]) {
  return buildSeedPayload({
    skills: {
      [E2E_SKILL.hono.id]: buildSeedSkill({
        install,
        scope: "project",
        assignments: { [API_DEV]: "preloaded" },
      }),
    },
    agents: { [API_DEV]: { scope: "project" } },
  });
}
const PROJECT_HONO_EJECT_ID = "ProjHon2";
const PROJECT_HONO_PLUGIN_ID = "ProjHon3";

describe.skipIf(!claudeAvailable)("dual-scope edit lifecycle -- mixed source coexistence", () => {
  let pluginFixture: E2EPluginSource;
  let pluginSourceTempDir: string;
  let store: SeedConfigStore;
  let tempDir: string;

  beforeAll(async () => {
    pluginFixture = await createE2EPluginSource();
    pluginSourceTempDir = pluginFixture.tempDir;
    store = await startSeedConfigStore();
    store.publish(PLUGIN_STACK_ID, e2eStackPayload({ scope: "global", install: "plugin" }));
    store.publish(PROJECT_HONO_EJECT_ID, projectHonoPayload("eject"));
    store.publish(PROJECT_HONO_PLUGIN_ID, projectHonoPayload("plugin"));
  }, TIMEOUTS.SETUP_DUAL);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  afterAll(async () => {
    await store.close();
    if (pluginSourceTempDir) await cleanupTempDir(pluginSourceTempDir);
  });

  async function installMixedSources(): Promise<TestEnvironment> {
    const env = await createTestEnvironment();
    tempDir = env.tempDir;

    const phaseA = await runInitFrom(
      store,
      PLUGIN_STACK_ID,
      { dir: env.fakeHome },
      pluginFixture.sourceDir,
    );
    expect(phaseA.exitCode, phaseA.output).toBe(EXIT_CODES.SUCCESS);

    const phaseB = await runInitFrom(
      store,
      PROJECT_HONO_EJECT_ID,
      { dir: env.projectDir, globalHome: env.fakeHome },
      pluginFixture.sourceDir,
    );
    expect(phaseB.exitCode, phaseB.output).toBe(EXIT_CODES.SUCCESS);
    return env;
  }

  it(
    "Edit detects source migration for locally-initialized skills with marketplace source",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await installMixedSources();

      const result = await applyEditFrom(store, PROJECT_HONO_PLUGIN_ID, {
        dir: projectDir,
        globalHome: fakeHome,
      });

      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      // The direction of the switch: a switch back to eject would also match a bare /switch/.
      const { output } = result;
      expect(output).toContain(STEP_TEXT.SWITCHING_SKILLS_SUFFIX);
      expect(output).toContain(STEP_TEXT.PLUGIN_NATIVE);
      expect(output).not.toContain(STEP_TEXT.EJECT_LOCAL_COPY);

      const localSkillPath = path.join(skillsPath(projectDir), E2E_SKILL.hono.id, FILES.SKILL_MD);
      expect(await fileExists(localSkillPath)).toBe(false);

      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          agents: ["web-developer"],
        },
        project: {
          skillIds: [E2E_SKILL.hono.id],
          agents: ["api-developer"],
        },
      });

      // Excluded global entries may legitimately keep `source: "eject"`.
      const projectHonoEntry = (await readSkillEntries(projectDir, E2E_SKILL.hono.id)).find(
        (entry) => entry.scope === "project",
      );
      expect(
        projectHonoEntry,
        "project-scoped api-framework-hono must exist in config",
      ).toBeDefined();
      expect(projectHonoEntry?.origin).not.toBe("eject");
    },
  );

  it(
    "Compiled agents reference both plugin and local skills correctly",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE, retry: 1 },
    async () => {
      const { fakeHome, projectDir } = await installMixedSources();

      // Under relevance-scoped assignment, never the api skill.
      const globalWebDevPath = path.join(agentsPath(fakeHome), "web-developer.md");
      expect(await fileExists(globalWebDevPath)).toBe(true);
      const webDevContent = await readTestFile(globalWebDevPath);
      expect(webDevContent).toContain(E2E_SKILL.react.id);
      expect(webDevContent).not.toContain(E2E_SKILL.hono.id);

      const projectApiDevPath = path.join(agentsPath(projectDir), "api-developer.md");
      expect(await fileExists(projectApiDevPath)).toBe(true);
      const apiDevContent = await readTestFile(projectApiDevPath);
      expect(apiDevContent).toContain(E2E_SKILL.hono.id);
      expect(apiDevContent).not.toContain(E2E_SKILL.react.id);
    },
  );
});
