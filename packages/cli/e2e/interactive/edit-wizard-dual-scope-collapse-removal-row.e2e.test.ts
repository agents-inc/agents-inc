import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  listFiles,
  readTestFile,
  renderMetadataYaml,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE, UI_SYMBOLS } from "../../src/cli/consts.js";
import { STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";

/**
 * A skill installed at BOTH scopes whose project copy is dropped this session
 * (the `s` collapse of a `[P][G]` pair back to `[G]`) empties its PROJECT slot:
 * saving deletes the project copy while the global install survives. Removal is
 * a property of the `(id, scope)` slot, not of the id, so the Sources tab must
 * show the skill TWICE — the surviving locked global row plus an inert
 * pending-removal row under Project — exactly as the confirm step already
 * prints it (`-` at Project, `•` at Global).
 *
 * Today the Sources tab asks "is this id in the config anywhere?" when deciding
 * what is pending removal, so the surviving global entry masks the emptied
 * project slot and only the locked row renders — no `-` appears at all.
 *
 * Fixture note: the global entry is marketplace-sourced on purpose. A project
 * EJECT entry over a global EJECT install cannot be collapsed at all —
 * `wouldOverwriteGlobalEject` refuses the `s` press with a toast — so an
 * eject/eject pair would make this scenario unreachable rather than failing on
 * the render.
 *
 * Read-only session: the wizard is aborted, so config.ts and the project skills
 * directory must come out byte-for-byte unchanged.
 */

describe("edit wizard — pending-removal row when a dual-scope skill collapses to global", () => {
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

  let tempDir: string | undefined;
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  it(
    "keeps the emptied project slot of a collapsed dual-scope skill visible as a pending-removal row",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // react is installed at BOTH scopes: a marketplace install at global scope plus a local
      // project copy overriding it. vitest is the untouched project skill that keeps the Sources
      // grid populated (and gives the grid a focusable row).
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "dual-scope-collapse-test",
          source: sourceDir,
          skills: [
            ...buildSkillConfigs([E2E_SKILL.react.id, E2E_SKILL.vitest.id], {
              scope: "project",
              source: EJECT_SOURCE,
            }),
            ...buildSkillConfigs([E2E_SKILL.react.id], {
              scope: "global",
              source: DEFAULT_PUBLIC_SOURCE_NAME,
            }),
          ],
          agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "project" }),
          selectedDomains: ["web"],
        }),
      );

      await createLocalSkill(projectDir, E2E_SKILL.react.id, {
        description: "React framework for dual-scope collapse testing",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.react.id,
          category: "web-framework",
          slug: E2E_SKILL.react.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "b2c3d4e",
        }),
      });
      await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
        description: "Vitest testing skill for dual-scope collapse testing",
        metadata: renderMetadataYaml({
          displayName: E2E_SKILL.vitest.id,
          category: "web-testing",
          slug: E2E_SKILL.vitest.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "c3d4e5f",
        }),
      });

      // Setup proof: react genuinely occupies BOTH slots before the edit, so the row that must
      // survive the collapse is backed by a real dual-scope install and not a single entry.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.react.id),
        "react must be saved at both project and global scope before the edit",
      ).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", source: DEFAULT_PUBLIC_SOURCE_NAME },
        { id: E2E_SKILL.react.id, scope: "project", source: EJECT_SOURCE },
      ]);

      const configBefore = await readTestFile(configTsPath(projectDir));
      const skillDirsBefore = (await listFiles(skillsPath(projectDir))).sort();

      wizard = await EditWizard.launchInProject({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        ...TERMINAL_SIZE.TALL,
      });

      await wizard.build.focusSkill(E2E_SKILL.react.display);
      // The live active entry is the project copy — the badge shows the scope the session owns,
      // not the inherited global install behind it.
      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "react must start as the project-scoped half of the dual-scope install",
      ).toStrictEqual(["P"]);

      // `s` is the sole dual-scope toggle: P→G drops the project override and falls back to the
      // global install. Proof-of-execution — without the badge flip the press was swallowed (or
      // refused by a guard) and the Sources assertions below would pass or fail vacuously.
      await wizard.build.toggleScopeOnFocusedSkill();
      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "`s` must collapse the pair to global-only, emptying react's project slot",
      ).toStrictEqual(["G"]);

      // Single web domain: advance straight to the Sources tab.
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();

      // Captured on the Sources grid's own frame, with no navigation key in between: the processed
      // buffer is repainted in place rather than accumulated, so a row state a later frame
      // overwrites is unrecoverable. Focus does not matter to the assertions — the marker occupies
      // a fixed two-column cell with one space before the name on every row, focused or not.
      const frame = sources.getScreen();

      // Green guards: the Sources grid rendered its real content — the step header, the untouched
      // project row, and react's surviving global row with its lock — so a missing removal marker
      // below is the masked-slot bug, not an empty or wrong grid.
      expect(frame).toContain(STEP_TEXT.SOURCES);
      expect(
        frame,
        `Sources grid must render the untouched project skill. Screen:\n${frame}`,
      ).toContain(E2E_SKILL.vitest.display);
      expect(frame, `react's surviving global row must stay locked. Screen:\n${frame}`).toContain(
        `${UI_SYMBOLS.LOCK} ${E2E_SKILL.react.display}`,
      );

      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);
      wizard = undefined;

      // Abort saved nothing: config.ts and the project skills directory are untouched. Asserted
      // before the marker assertion so the read-only guarantee is verified on every run.
      expect(
        await readTestFile(configTsPath(projectDir)),
        "aborting a scope-collapse preview must not rewrite config.ts",
      ).toBe(configBefore);
      expect(
        (await listFiles(skillsPath(projectDir))).sort(),
        "aborting a scope-collapse preview must not add or remove skill directories",
      ).toStrictEqual(skillDirsBefore);

      // The contract: the emptied project slot stays visible as a pending-removal row, so the user
      // sees that saving deletes the project copy. NO_COLOR strips the red in E2E, so the marker is
      // what a user and this assertion can see. The locked row above carries the lock instead, so
      // this `- ` can only be the project row — the skill renders twice, once per scope.
      expect(
        frame,
        `the emptied project slot must render as a pending-removal row. Screen:\n${frame}`,
      ).toContain(`${UI_SYMBOLS.REMOVED} ${E2E_SKILL.react.display}`);

      // Shape guard: collapsing a dual-scope skill removes a slot, it never adds one.
      expect(
        frame,
        "a collapsed dual-scope skill must not render with the added marker on the Sources tab",
      ).not.toContain(`${UI_SYMBOLS.ADDED} ${E2E_SKILL.react.display}`);
    },
  );
});
