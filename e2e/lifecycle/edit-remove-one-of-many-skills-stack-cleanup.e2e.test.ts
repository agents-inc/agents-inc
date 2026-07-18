import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/index.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName, StackAgentConfig } from "../../src/cli/types/index.js";

/**
 * Regression guard (sibling to `edit-remove-last-skill-stack-cleanup.e2e.test.ts`).
 *
 * That test covers the EDGE case: removing the ONLY skill an agent references,
 * which collapses the whole selection to empty and exercised the `{}`-vs-
 * `undefined` merge-fallback bug (fixed in 0.141.7).
 *
 * This test covers the NON-edge case the D-233/D-240 cluster raised as a
 * suspected second gap: at global scope, removing just ONE of SEVERAL skills an
 * agent references (leaving the others active). Empirically this path is CLEAN —
 * `generateProjectConfigFromSkills` rebuilds the stack from the remaining active
 * skills only, and `mergeConfigs` full-replaces `stack` (never resurrecting the
 * removed entry). This guard pins that behavior so a future regression in the
 * stack-rebuild or merge path is caught. It is GREEN on current code — the
 * suspected "global stack retains the removed skill" bug does NOT reproduce via
 * the pure global-only removal path.
 *
 * Seeded at global scope (HOME === project dir): web-developer references react
 * (web-framework, preloaded) AND vitest (web-testing). Removing vitest must drop
 * ONLY web-testing from the stack, leaving web-framework/react intact.
 */

const REACT = "web-framework-react";
const VITEST = "web-testing-vitest";
const WEB_DEVELOPER: AgentName = "web-developer";

const multiSkillStack = {
  [WEB_DEVELOPER]: {
    "web-framework": [{ id: REACT, preloaded: true }],
    "web-testing": [{ id: VITEST, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

describe("edit removes one of several skills an agent references", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let globalHome: string | undefined;

  afterEach(async () => {
    if (globalHome) {
      await cleanupTempDir(globalHome);
      globalHome = undefined;
    }
  });

  it(
    "drops only the removed skill's category, leaving the agent's other stack entries intact",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 0 },
    async () => {
      globalHome = await createTempDir();

      const config = buildProjectConfig({
        name: "global-multi-edit-test",
        skills: buildSkillConfigs([REACT, VITEST], { scope: "global", source: "eject" }),
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        domains: ["web"],
        selectedAgents: [WEB_DEVELOPER],
        stack: multiSkillStack,
      });
      await writeProjectConfig(globalHome, config);

      await createLocalSkill(globalHome, REACT, {
        description: "React framework for global-scope multi-skill edit testing",
        metadata:
          `author: "@test"\ndisplayName: ${REACT}\ncategory: web-framework\nslug: react\n` +
          `cliDescription: "E2E test skill"\nusageGuidance: "Use when testing E2E scenarios"\n` +
          `contentHash: "b2c3d4e"\n`,
      });
      await createLocalSkill(globalHome, VITEST, {
        description: "Vitest testing framework for global-scope multi-skill edit testing",
        metadata:
          `author: "@test"\ndisplayName: ${VITEST}\ncategory: web-testing\nslug: vitest\n` +
          `cliDescription: "E2E test skill"\nusageGuidance: "Use when testing E2E scenarios"\n` +
          `contentHash: "c3d4e5f"\n`,
      });

      await createPermissionsFile(globalHome);

      // Global-scope edit: deselect vitest only (react stays selected).
      const wizard = await EditWizard.launch({
        projectDir: globalHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: globalHome },
        rows: 60,
        cols: 120,
      });

      await wizard.build.selectSkill(VITEST); // navigate to vitest and press Space (deselect)

      const sources = await wizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
      await wizard.destroy();

      const loaded = await loadProjectConfigFromDir(globalHome);
      expect(loaded, "config.ts must exist at the global home after edit").not.toBeNull();
      if (!loaded) return;
      const finalConfig = loaded.config;

      // Top-level roster: vitest gone, react retained.
      expect(finalConfig.skills.map((s) => s.id)).not.toContain(VITEST);
      expect(finalConfig.skills.map((s) => s.id)).toContain(REACT);

      // Stack: web-developer keeps web-framework/react, drops the web-testing
      // category (vitest was its only entry). No stale vitest reference survives.
      expect(finalConfig.stack?.[WEB_DEVELOPER]).toStrictEqual({
        "web-framework": [{ id: REACT, preloaded: true }],
      });
    },
  );
});
