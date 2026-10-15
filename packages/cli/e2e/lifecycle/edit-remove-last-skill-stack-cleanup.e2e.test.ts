import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { applyEditFrom } from "../fixtures/e2e-stack-seed.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  FORKED_FROM_METADATA,
  loadConfigOrFail,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * Regression: removing the last/only skill an agent's stack references must not
 * leave a stale reference behind in the `stack` property.
 *
 * Same area as D-220 per-agent stack curation. Mechanism (config generation +
 * merge): when the removed skill was the ONLY active skill across the whole
 * selection, `generateProjectConfigFromSkills` collapses `activeSkillsByCategory`
 * to empty and `buildStackForSelection` returns `undefined`, so the rebuilt
 * config omits the `stack` key entirely. `mergeConfigs` then cannot distinguish
 * "caller rebuilt an empty stack" from "caller never touched stack", so its
 * `newConfig.stack === undefined && existingConfig.stack` fallback resurrects the
 * OLD stack — including the just-removed skill.
 *
 * Reproduced here at global scope (HOME === project dir): the skill leaves
 * `skills[]` correctly but survives in `stack.web-developer.web-framework`.
 */

const singleSkillStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** The global configuration with react left out: its sub-agent on, holding nothing. */
const WITHOUT_REACT_ID = "NoReact2";

describe("edit removes the only skill an agent references", () => {
  let store: SeedConfigStore;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      WITHOUT_REACT_ID,
      buildSeedPayload({
        agents: { [E2E_AGENT["web-developer"].name]: { on: true, scope: "global" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });
  let globalHome: string | undefined;

  afterEach(async () => {
    if (globalHome) {
      await cleanupTempDir(globalHome);
      globalHome = undefined;
    }
  });

  it(
    "does not leave the removed skill behind in the stack property",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Seed a GLOBAL installation (HOME === project dir) where
      // web-framework-react is the ONLY skill and the ONLY entry in
      // web-developer's stack. Removing it collapses the whole selection to
      // empty, which is the trigger condition for the merge-fallback bug.
      // ================================================================

      globalHome = await createTempDir();

      const config = buildProjectConfig({
        name: "global-edit-test",
        marketplace: E2E_SOURCE.sourceDir,
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "global", origin: "eject" }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: singleSkillStack,
      });
      await writeProjectConfig(globalHome, config);

      // Fork provenance, so the round trip owns the copy and the apply may remove it.
      await createLocalSkill(globalHome, E2E_SKILL.react.id, {
        description: "React framework for global-scope edit testing",
        metadata: FORKED_FROM_METADATA,
      });

      await createPermissionsFile(globalHome);

      // ================================================================
      // Phase 2: Run `cc edit --from` at global scope with react left out.
      // Setting cwd === HOME makes it the global install root, so the apply
      // edits ~/.agents-inc/claude/config.ts with authoritativeScope "all".
      // ================================================================

      const result = await applyEditFrom(store, WITHOUT_REACT_ID, { dir: globalHome });
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);

      // ================================================================
      // Phase 3: Assert on the post-edit config (structural load) AND the
      // filesystem.
      // ================================================================

      const finalConfig = await loadConfigOrFail(globalHome);

      // Sanity (already works): react is gone from the top-level skills roster.
      expect(finalConfig.skills.map((s) => s.id)).not.toContain(E2E_SKILL.react.id);

      // Filesystem side: the removed eject skill's directory is deleted.
      const removedSkillDir = path.join(skillsPath(globalHome), E2E_SKILL.react.id);
      expect(
        await directoryExists(removedSkillDir),
        "removed skill's directory must be deleted from the global home",
      ).toBe(false);

      // The bug: the stack must not retain a reference to the removed skill.
      // web-framework was react's only category and react was web-developer's
      // only stack entry, so the whole web-developer stack should be gone.
      const webFrameworkAssignments =
        finalConfig.stack?.[E2E_AGENT["web-developer"].name]?.["web-framework"];
      expect(
        webFrameworkAssignments,
        "web-developer stack must not retain the removed web-framework-react",
      ).toBeUndefined();
    },
  );
});
