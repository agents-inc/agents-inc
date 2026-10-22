import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { mkdir } from "fs/promises";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  cleanupTempDir,
  configTsPath,
  createTempDir,
  fileExists,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";
import { applyFromSeed, e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SKILL, E2E_STACK_SKILL_IDS } from "../fixtures/expected-values.js";

/**
 * Plugin skills are referenced as `id:id`, eject skills as bare `id`: install intent is per skill,
 * never a project-level check.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "mixed-mode agents emit per-skill ref formats in compiled output",
  () => {
    let pluginSource: E2EPluginSource | undefined;
    let store: SeedConfigStore;

    beforeAll(async () => {
      pluginSource = await createE2EPluginSource();
      store = await startSeedConfigStore();
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await store.close();
      if (pluginSource) await cleanupTempDir(pluginSource.tempDir);
    });

    describe("init plugin then edit ONE skill to local: mixed compiled output", () => {
      let tempDir: string | undefined;

      afterEach(async () => {
        if (tempDir) {
          await cleanupTempDir(tempDir);
          tempDir = undefined;
        }
      });

      it(
        "web-developer.md frontmatter and body each carry the format dictated by the skill's own source",
        { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
        async () => {
          tempDir = await createTempDir();
          const projectDir = path.join(tempDir, "project");
          await mkdir(projectDir, { recursive: true });

          // A default-scope skill's source switch, so both phases run as the global install
          // (HOME === cwd).
          const site = { dir: projectDir, home: projectDir };
          await installFromSeed(
            store,
            "Plugins1",
            e2eStackPayload({ install: "plugin" }),
            site,
            pluginSource!.sourceDir,
          );

          await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
            skills: [`${E2E_SKILL.react.id}:${E2E_SKILL.react.id}`],
          });

          const editResult = await applyFromSeed(
            store,
            "ReactEject1",
            e2eStackPayload({
              pluginSkills: E2E_STACK_SKILL_IDS.filter((id) => id !== E2E_SKILL.react.id),
            }),
            site,
          );
          expect(editResult.output).toContain(STEP_TEXT.EDIT_SUCCESS);

          const configPath = configTsPath(projectDir);
          expect(await fileExists(configPath)).toBe(true);
          const configContent = await readTestFile(configPath);

          // The shared literal printer's shape: bare identifier key, single-quoted value.
          expect(configContent).toContain(`id: '${E2E_SKILL.react.id}'`);
          expect(configContent).toContain(`id: '${E2E_SKILL.zustand.id}'`);

          // Either scope tolerated, so the test does not depend on where the install routes.
          expect(configContent).toMatch(
            new RegExp(`id: '${E2E_SKILL.react.id}', scope: '(?:project|global)', origin: 'eject'`),
          );

          // The toggle was scoped to react.
          expect(configContent).toMatch(
            new RegExp(
              `id: '${E2E_SKILL.zustand.id}', scope: '(?:project|global)', origin: '${pluginSource!.marketplaceName}'`,
            ),
          );

          await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");

          // Only the framework skill is preloaded, so only it appears in frontmatter.
          await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
            skills: [E2E_SKILL.react.id],
          });

          await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
            notContains: [`${E2E_SKILL.react.id}:${E2E_SKILL.react.id}`],
          });

          // Post-init it was `id:id`, so this proves the recompile re-emitted rather than cached.

          // KNOWN GAP: settings.json plugin enablement for the un-toggled skills is not asserted;
          // it depends on which skills mode-migrator.ts considers "newly plugin".
          await expect({ dir: projectDir }).toHaveSkillCopied(E2E_SKILL.react.id);
        },
      );
    });
  },
);
