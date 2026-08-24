import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  loadConfigOrFail,
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName } from "../../src/cli/types/index.js";
import type { FixtureStackAgentConfig } from "../helpers/test-utils.js";

/**
 * No-collateral-damage guard for the buildStackForSelection fix: an agent with
 * MULTIPLE stack categories, each holding one skill. Removing exactly one skill
 * from one category must delete only that category's entry and leave every other
 * (agent, category, skill) triple — including its preloaded flag — byte-identical.
 * Regression insurance that the merge/rebuild path is surgical, not a wholesale
 * stack rewrite.
 */

const multiCategoryStack = {
  [E2E_AGENT["web-developer"].name]: {
    "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
    "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
    "web-client-state": [{ id: E2E_SKILL.zustand.id, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

describe("edit removes exactly one skill from a multi-category agent stack", () => {
  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP);

  let globalHome: string | undefined;

  afterEach(async () => {
    if (globalHome) {
      await cleanupTempDir(globalHome);
      globalHome = undefined;
    }
  });

  it(
    "leaves every other stack triple byte-identical after removing one skill",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // ================================================================
      // Phase 1: Seed a GLOBAL installation (HOME === project dir) with three
      // web skills in three separate categories of web-developer's stack:
      //   web-framework   -> react   (preloaded)
      //   web-testing     -> vitest
      //   web-client-state-> zustand
      // ================================================================

      globalHome = await createTempDir();

      const config = buildProjectConfig({
        name: "surgical-edit-test",
        skills: buildSkillConfigs([E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id], {
          scope: "global",
          origin: "eject",
        }),
        agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
        selectedDomains: ["web"],
        stack: multiCategoryStack,
      });
      await writeProjectConfig(globalHome, config);

      await createLocalSkill(globalHome, E2E_SKILL.react.id, {
        description: "React framework",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.react.display,
          category: "web-framework",
          slug: E2E_SKILL.react.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "a1b2c3d",
        }),
      });
      await createLocalSkill(globalHome, E2E_SKILL.vitest.id, {
        description: "Vitest testing framework",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.vitest.display,
          category: "web-testing",
          slug: E2E_SKILL.vitest.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "a1b2c3d",
        }),
      });
      await createLocalSkill(globalHome, E2E_SKILL.zustand.id, {
        description: "Zustand state management",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.zustand.display,
          category: "web-client-state",
          slug: E2E_SKILL.zustand.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "a1b2c3d",
        }),
      });

      await createPermissionsFile(globalHome);

      // ================================================================
      // Phase 2: Run `cc edit` at global scope and deselect ONLY zustand.
      // react and vitest remain selected and untouched.
      // ================================================================

      const wizard = await EditWizard.launch({
        projectDir: globalHome,
        source: E2E_SOURCE,
        env: { HOME: globalHome },
        ...TERMINAL_SIZE.TALL,
      });

      await wizard.build.selectSkill(E2E_SKILL.zustand.display);

      const sources = await wizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // ================================================================
      // Phase 3: Assert the surviving stack is byte-identical to the prior
      // stack MINUS only the removed web-client-state entry.
      // ================================================================

      const finalConfig = await loadConfigOrFail(globalHome);

      // Top-level skills roster: zustand gone, react + vitest retained.
      const finalSkillIds = finalConfig.skills.map((s) => s.id);
      expect(finalSkillIds).not.toContain(E2E_SKILL.zustand.id);
      expect(finalSkillIds).toContain(E2E_SKILL.react.id);
      expect(finalSkillIds).toContain(E2E_SKILL.vitest.id);

      // Stack is the loader-normalized form: every assignment is
      // { id, preloaded }. Only the web-client-state category was removed;
      // web-framework (preloaded true) and web-testing (preloaded false) must
      // be exactly preserved, nothing reordered or re-flagged.
      const expectedWebDeveloperStack: FixtureStackAgentConfig = {
        "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
        "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: false }],
      };
      expect(
        finalConfig.stack?.[E2E_AGENT["web-developer"].name],
        "web-developer stack must equal the prior stack minus only the removed category",
      ).toStrictEqual(expectedWebDeveloperStack);

      // Filesystem side: only zustand's directory is deleted.
      const zustandDir = path.join(skillsPath(globalHome), E2E_SKILL.zustand.id);
      const reactDir = path.join(skillsPath(globalHome), E2E_SKILL.react.id);
      const vitestDir = path.join(skillsPath(globalHome), E2E_SKILL.vitest.id);
      expect(await directoryExists(zustandDir), "removed zustand dir must be deleted").toBe(false);
      expect(await directoryExists(reactDir), "react dir must be retained").toBe(true);
      expect(await directoryExists(vitestDir), "vitest dir must be retained").toBe(true);
    },
  );
});
