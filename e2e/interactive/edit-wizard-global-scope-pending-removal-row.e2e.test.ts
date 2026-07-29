import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
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
import { UI_SYMBOLS } from "../../src/cli/consts.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * A saved skill deselected this session stays visible on the Sources tab as an
 * inert pending-removal row (`- <skill>`), so the user can see what saving is
 * about to remove — the project-scope behaviour covered by
 * edit-wizard-pending-removal-row.e2e.test.ts and
 * sources-overflow-pending-removal.e2e.test.ts.
 *
 * The same must hold when editing the GLOBAL install (HOME === cwd === the
 * install dir): deselecting a saved global skill drops it from the config
 * outright, so without a pending-removal row it disappears from the Sources tab
 * entirely while the confirm step still lists it with the red `-` marker.
 * `computeScopeDiff` — the confirm step's source of truth — has no global-scope
 * gate, so neither surface should.
 *
 * The deselection is proved by completing the edit and checking that the skill
 * left both config.ts and the global skills directory, so a failing marker
 * assertion is the vanished row and not a no-op deselection.
 */

describe("edit wizard — pending-removal row on the Sources tab in a global-scope edit", () => {
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
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (globalHome) {
      await cleanupTempDir(globalHome);
      globalHome = undefined;
    }
  });

  it(
    "keeps a deselected saved global skill visible as a pending-removal row",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // A GLOBAL installation: both skills are saved at global scope with their ejected copies
      // on disk, so the row that must survive the deselection is backed by a real install.
      globalHome = await createTempDir();

      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "global-edit-test",
          skills: buildSkillConfigs([E2E_SKILL.react.id, E2E_SKILL.vitest.id], {
            scope: "global",
            source: "eject",
          }),
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
          domains: ["web"],
          selectedAgents: [E2E_AGENT["web-developer"].name],
        }),
      );

      await createLocalSkill(globalHome, E2E_SKILL.react.id, {
        description: "React framework for global-scope edit testing",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.react.id,
          category: "web-framework",
          slug: E2E_SKILL.react.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "b2c3d4e",
        }),
      });
      await createLocalSkill(globalHome, E2E_SKILL.vitest.id, {
        description: "Vitest testing skill for global-scope edit testing",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.vitest.id,
          category: "web-testing",
          slug: E2E_SKILL.vitest.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "c3d4e5f",
        }),
      });
      await createPermissionsFile(globalHome);

      const removedSkillDir = path.join(skillsPath(globalHome), E2E_SKILL.vitest.id);
      const keptSkillDir = path.join(skillsPath(globalHome), E2E_SKILL.react.id);

      // Setup proof: the skill to deselect is genuinely installed on disk before the edit.
      expect(
        await directoryExists(removedSkillDir),
        "the ejected vitest skill directory must exist before the edit",
      ).toBe(true);

      // Edit the GLOBAL install: HOME === cwd === the install dir, so the wizard runs with
      // isEditingFromGlobalScope — nothing is inherited and nothing is locked.
      wizard = await EditWizard.launchInGlobal({
        projectDir: globalHome,
        source: { sourceDir, tempDir: sourceTempDir },
        ...TERMINAL_SIZE.TALL,
      });

      // Space on the focused skill deselects it: at global scope the "global skills cannot be
      // changed from project scope" guard does not apply.
      await wizard.build.selectSkill(E2E_SKILL.vitest.display);

      // Single web domain: advance straight to the Sources tab.
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();

      const frame = sources.getScreen();

      // Green guards: the Sources grid rendered its real content — the step header and the row
      // of the skill that stays installed — so an absent vitest row is the vanished-row bug and
      // not an empty grid.
      expect(frame).toContain(STEP_TEXT.SOURCES);
      expect(
        frame,
        `Sources grid must render the skill that stays installed. Screen:\n${frame}`,
      ).toContain(E2E_SKILL.react.display);

      // Deselection proof (also the required state-change verification): completing the edit
      // drops vitest from config.ts and deletes its ejected copy, while react keeps both.
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode, result.rawOutput).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      const configAfter = await loadConfigOrFail(globalHome);
      expect(
        configAfter.skills.map((sc) => sc.id).sort(),
        "config.ts must drop the deselected skill and keep the other one",
      ).toStrictEqual([E2E_SKILL.react.id]);
      expect(
        await directoryExists(removedSkillDir),
        "the deselected skill's ejected directory must be deleted from the global home",
      ).toBe(false);
      expect(
        await directoryExists(keptSkillDir),
        "the skill that stays selected must keep its ejected directory",
      ).toBe(true);

      // The deselected saved skill stays visible as a pending-removal row (removal marker),
      // exactly as a project-scope edit renders it. NO_COLOR strips the red in E2E, so the
      // marker is what a user and this assertion can see.
      expect(
        frame,
        `a deselected saved global skill must render as a pending-removal row. Screen:\n${frame}`,
      ).toContain(`${UI_SYMBOLS.REMOVED} ${E2E_SKILL.vitest.display}`);

      // Shape guards: a removal is not an addition, and a global-scope edit inherits nothing —
      // so no row, least of all this one, may render the "installed globally" lock.
      expect(
        frame,
        "a deselected skill must not render with the added marker on the Sources tab",
      ).not.toContain(`${UI_SYMBOLS.ADDED} ${E2E_SKILL.vitest.display}`);
      expect(
        frame,
        "a global-scope edit owns every row, so the Sources tab must render no lock",
      ).not.toContain(UI_SYMBOLS.LOCK);
    },
  );
});
