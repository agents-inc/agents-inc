import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
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

const REACT = "web-framework-react";
const WEB_DEVELOPER: AgentName = "web-developer";

const singleSkillStack = {
  [WEB_DEVELOPER]: {
    "web-framework": [{ id: REACT, preloaded: true }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

describe("edit removes the only skill an agent references", () => {
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
        skills: buildSkillConfigs([REACT], { scope: "global", source: "eject" }),
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        domains: ["web"],
        selectedAgents: [WEB_DEVELOPER],
        stack: singleSkillStack,
      });
      await writeProjectConfig(globalHome, config);

      await createLocalSkill(globalHome, REACT, {
        description: "React framework for global-scope edit testing",
        metadata:
          `author: "@test"\ndisplayName: ${REACT}\ncategory: web-framework\nslug: react\n` +
          `cliDescription: "E2E test skill"\nusageGuidance: "Use when testing E2E scenarios"\n` +
          `contentHash: "b2c3d4e"\n`,
      });

      await createPermissionsFile(globalHome);

      // ================================================================
      // Phase 2: Run `cc edit` at global scope and deselect react entirely.
      // Setting projectDir === HOME makes cwd === GLOBAL_INSTALL_ROOT, so
      // the wizard edits ~/.claude-src/config.ts with authoritativeScope "all".
      // ================================================================

      const wizard = await EditWizard.launch({
        projectDir: globalHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: globalHome },
        rows: 60,
        cols: 120,
      });

      // react is currently selected — pressing Space deselects it. At global
      // scope the "global skills cannot be changed from project scope" guard
      // does not apply, so the deselect goes through.
      await wizard.build.selectSkill(REACT);

      const sources = await wizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // ================================================================
      // Phase 3: Assert on the post-edit config (structural load) AND the
      // filesystem.
      // ================================================================

      const loaded = await loadProjectConfigFromDir(globalHome);
      expect(loaded, "config.ts must exist at the global home after edit").not.toBeNull();
      if (!loaded) return;
      const finalConfig = loaded.config;

      // Sanity (already works): react is gone from the top-level skills roster.
      expect(finalConfig.skills.map((s) => s.id)).not.toContain(REACT);

      // Filesystem side: the removed eject skill's directory is deleted.
      const removedSkillDir = path.join(globalHome, DIRS.CLAUDE, DIRS.SKILLS, REACT);
      expect(
        await directoryExists(removedSkillDir),
        "removed skill's directory must be deleted from the global home",
      ).toBe(false);

      // The bug: the stack must not retain a reference to the removed skill.
      // web-framework was react's only category and react was web-developer's
      // only stack entry, so the whole web-developer stack should be gone.
      const webFrameworkAssignments = finalConfig.stack?.[WEB_DEVELOPER]?.["web-framework"];
      expect(
        webFrameworkAssignments,
        "web-developer stack must not retain the removed web-framework-react",
      ).toBeUndefined();
    },
  );
});
