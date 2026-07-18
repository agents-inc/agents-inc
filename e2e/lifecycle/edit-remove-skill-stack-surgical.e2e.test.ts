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
 * No-collateral-damage guard for the buildStackForSelection fix: an agent with
 * MULTIPLE stack categories, each holding one skill. Removing exactly one skill
 * from one category must delete only that category's entry and leave every other
 * (agent, category, skill) triple — including its preloaded flag — byte-identical.
 * Regression insurance that the merge/rebuild path is surgical, not a wholesale
 * stack rewrite.
 */

const REACT = "web-framework-react";
const VITEST = "web-testing-vitest";
const ZUSTAND = "web-state-zustand";
const WEB_DEVELOPER: AgentName = "web-developer";

const multiCategoryStack = {
  [WEB_DEVELOPER]: {
    "web-framework": [{ id: REACT, preloaded: true }],
    "web-testing": [{ id: VITEST, preloaded: false }],
    "web-client-state": [{ id: ZUSTAND, preloaded: false }],
  },
} satisfies Partial<Record<AgentName, StackAgentConfig>>;

const skillMetadata = (id: string, category: string, slug: string): string =>
  `author: "@test"\ndisplayName: ${id}\ncategory: ${category}\nslug: ${slug}\n` +
  `cliDescription: "E2E test skill"\nusageGuidance: "Use when testing E2E scenarios"\n` +
  `contentHash: "a1b2c3d"\n`;

describe("edit removes exactly one skill from a multi-category agent stack", () => {
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
    "leaves every other stack triple byte-identical after removing one skill",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 0 },
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
        skills: buildSkillConfigs([REACT, VITEST, ZUSTAND], { scope: "global", source: "eject" }),
        agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
        domains: ["web"],
        selectedAgents: [WEB_DEVELOPER],
        stack: multiCategoryStack,
      });
      await writeProjectConfig(globalHome, config);

      await createLocalSkill(globalHome, REACT, {
        description: "React framework",
        metadata: skillMetadata(REACT, "web-framework", "react"),
      });
      await createLocalSkill(globalHome, VITEST, {
        description: "Vitest testing framework",
        metadata: skillMetadata(VITEST, "web-testing", "vitest"),
      });
      await createLocalSkill(globalHome, ZUSTAND, {
        description: "Zustand state management",
        metadata: skillMetadata(ZUSTAND, "web-client-state", "zustand"),
      });

      await createPermissionsFile(globalHome);

      // ================================================================
      // Phase 2: Run `cc edit` at global scope and deselect ONLY zustand.
      // react and vitest remain selected and untouched.
      // ================================================================

      const wizard = await EditWizard.launch({
        projectDir: globalHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: globalHome },
        rows: 60,
        cols: 120,
      });

      await wizard.build.selectSkill(ZUSTAND);

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

      const loaded = await loadProjectConfigFromDir(globalHome);
      expect(loaded, "config.ts must exist at the global home after edit").not.toBeNull();
      if (!loaded) return;
      const finalConfig = loaded.config;

      // Top-level skills roster: zustand gone, react + vitest retained.
      const finalSkillIds = finalConfig.skills.map((s) => s.id);
      expect(finalSkillIds).not.toContain(ZUSTAND);
      expect(finalSkillIds).toContain(REACT);
      expect(finalSkillIds).toContain(VITEST);

      // Stack is the loader-normalized form: every assignment is
      // { id, preloaded }. Only the web-client-state category was removed;
      // web-framework (preloaded true) and web-testing (preloaded false) must
      // be exactly preserved, nothing reordered or re-flagged.
      const expectedWebDeveloperStack: StackAgentConfig = {
        "web-framework": [{ id: REACT, preloaded: true }],
        "web-testing": [{ id: VITEST, preloaded: false }],
      };
      expect(
        finalConfig.stack?.[WEB_DEVELOPER],
        "web-developer stack must equal the prior stack minus only the removed category",
      ).toStrictEqual(expectedWebDeveloperStack);

      // Filesystem side: only zustand's directory is deleted.
      const zustandDir = path.join(globalHome, DIRS.CLAUDE, DIRS.SKILLS, ZUSTAND);
      const reactDir = path.join(globalHome, DIRS.CLAUDE, DIRS.SKILLS, REACT);
      const vitestDir = path.join(globalHome, DIRS.CLAUDE, DIRS.SKILLS, VITEST);
      expect(await directoryExists(zustandDir), "removed zustand dir must be deleted").toBe(false);
      expect(await directoryExists(reactDir), "react dir must be retained").toBe(true);
      expect(await directoryExists(vitestDir), "vitest dir must be retained").toBe(true);
    },
  );
});
