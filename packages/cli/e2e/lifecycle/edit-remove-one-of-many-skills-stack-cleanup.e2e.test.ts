import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  loadConfigOrFail,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

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

const multiSkillStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
    "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

describe("edit removes one of several skills an agent references", () => {
  let globalHome: string | undefined;

  afterEach(async () => {
    if (globalHome) {
      await cleanupTempDir(globalHome);
      globalHome = undefined;
    }
  });

  it(
    "drops only the removed skill's category, leaving the agent's other stack entries intact",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      globalHome = await createTempDir();

      const config = buildProjectConfig({
        name: "global-multi-edit-test",
        skills: buildSkillConfigs([E2E_SKILL.react.id, E2E_SKILL.vitest.id], {
          scope: "global",
          origin: "eject",
        }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: multiSkillStack,
      });
      await writeProjectConfig(globalHome, config);

      await createLocalSkill(globalHome, E2E_SKILL.react.id, {
        description: "React framework for global-scope multi-skill edit testing",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.react.display,
          category: "web-framework",
          slug: E2E_SKILL.react.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "b2c3d4e",
        }),
      });
      await createLocalSkill(globalHome, E2E_SKILL.vitest.id, {
        description: "Vitest testing framework for global-scope multi-skill edit testing",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.vitest.display,
          category: "web-testing",
          slug: E2E_SKILL.vitest.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "c3d4e5f",
        }),
      });

      await createPermissionsFile(globalHome);

      // Global-scope edit: deselect vitest only (react stays selected).
      const wizard = await EditWizard.launch({
        projectDir: globalHome,
        source: E2E_SOURCE,
        env: { HOME: globalHome },
        ...TERMINAL_SIZE.TALL,
      });

      // navigate to vitest and press Space (deselect)
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);

      const sources = await wizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
      await wizard.destroy();

      const finalConfig = await loadConfigOrFail(globalHome);

      // Top-level roster: vitest gone, react retained.
      expect(finalConfig.skills.map((s) => s.id)).not.toContain(E2E_SKILL.vitest.id);
      expect(finalConfig.skills.map((s) => s.id)).toContain(E2E_SKILL.react.id);

      // Stack: web-developer keeps web-framework/react, drops the web-testing
      // category (vitest was its only entry). No stale vitest reference survives.
      expect(finalConfig.stack?.[E2E_AGENT["web-developer"].name]).toStrictEqual({
        "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
      });
    },
  );
});
