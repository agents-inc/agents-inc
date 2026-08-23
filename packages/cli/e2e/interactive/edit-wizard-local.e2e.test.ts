import path from "path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  ensureBinaryExists,
  loadConfigOrFail,
  readCompiledAgents,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  TIMEOUTS,
  EXIT_CODES,
  REMOVED_MARKER,
  STEP_TEXT,
  TERMINAL_SIZE,
} from "../pages/constants.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import "../matchers/setup.js";

/**
 * E2E tests for the edit wizard in eject mode — skill add and remove.
 *
 * Eject mode differs from plugin mode:
 * - No `claude plugin install/uninstall` calls
 * - Skills are copied from the source directory to .claude/skills/
 * - Removal in eject mode updates config but does NOT delete skill files
 */

/**
 * The one sub-agent every project in this file is built with, as the compiled filename an
 * edit must leave behind. Named rather than counted: the parameterless
 * `toHaveCompiledAgents()` that stood at both sites below was already satisfied by the
 * agent stub `ProjectBuilder.editable` writes, so it could not tell an edit that
 * recompiled from one that wrote nothing at all.
 */
const COMPILED_AGENT_FILES = [`${E2E_AGENT["web-developer"].name}.md`];

describe("edit wizard — eject mode", () => {
  let sourceFixture: E2ESource;
  let wizard: EditWizard | undefined;
  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    sourceFixture = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(sourceFixture);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("add a skill during local edit", () => {
    it(
      "should update config with newly selected skill",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        // Create project with only web-framework-react. The E2E source also has
        // web-testing-vitest and web-state-zustand in the Web domain.
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        // Select the vitest skill by name
        await wizard.build.selectSkill(E2E_SKILL.vitest.display);

        // Navigate through remaining steps with explicit eject source selection
        const sources = await wizard.build.advanceToSources();
        await sources.waitForReady();
        await sources.setAllLocal();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;

        // The changes summary should list additions
        expect(rawOutput).toContain("Changes:");

        // Config should now include both skills
        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
          agents: ["web-developer"],
        });

        // Eject mode: skill must be physically copied to .claude/skills/
        await expect(result.project).toHaveSkillCopied(E2E_SKILL.vitest.id);

        // Compiled agent should contain the newly added skill
        await expect(result.project).toHaveCompiledAgentContent("web-developer", {
          contains: [E2E_SKILL.vitest.id],
        });
      },
    );

    it(
      "should show changes summary with added count",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        // Select an additional skill (selectSkill navigates to vitest by label).
        await wizard.build.selectSkill(E2E_SKILL.vitest.display);

        // Eject the newly-added skill — the source has no marketplace, so the
        // default plugin source would fail; setAllLocal ejects it instead.
        const sources = await wizard.build.advanceToSources();
        await sources.waitForReady();
        await sources.setAllLocal();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;

        // The "Changes:" section should list additions
        expect(rawOutput).toContain("Changes:");

        expect(Object.keys(await readCompiledAgents(result.project.dir)).sort()).toStrictEqual(
          COMPILED_AGENT_FILES,
        );
      },
    );

    it(
      "should recompile agents after adding a skill",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        // Select an additional skill (selectSkill navigates to vitest by label).
        await wizard.build.selectSkill(E2E_SKILL.vitest.display);

        // Eject the newly-added skill — the source has no marketplace, so the
        // default plugin source would fail; setAllLocal ejects it instead.
        const sources = await wizard.build.advanceToSources();
        await sources.waitForReady();
        await sources.setAllLocal();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        await expectPhaseSuccess(result, {
          compiledAgents: ["web-developer"],
        });
      },
    );
  });

  describe("remove a skill during local edit", () => {
    it(
      "should detect unresolvable skill as removed and complete edit",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        // The config claims 2 skills: web-framework-react (in the E2E source, and
        // installed) and web-styling-tailwind (in neither, and with no files on
        // disk). The wizard can resolve tailwind from nothing, so it drops it.
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id],
          unresolvableSkills: ["web-styling-tailwind"],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        // Navigate straight through without changing skills
        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;

        // The removal should be reported in the changes summary.
        expect(rawOutput).toContain("Changes:");
        expect(rawOutput).toContain("web-styling-tailwind");

        // Config should still reference the surviving skill.
        await expect(result.project).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });

        // The removed skill must NOT appear in compiled agent content
        await expect(result.project).toHaveCompiledAgentContent("web-developer", {
          notContains: ["web-styling-tailwind"],
        });
      },
    );

    /**
     * The removal of an unresolvable skill is REAL and is named with its reason.
     *
     * A skill the loaded source no longer carries never reaches the wizard's roster —
     * `populateFromSkillIds` skips it — so the merge drops its config entry like any other absent
     * owned entry. That drop is the one removal the user did not ask for, so `edit`'s Changes
     * block names the skill AND why it went. Its predecessor preserved the entry while announcing
     * it as removed, leaving `config.ts`, the summary and the compiled agent giving three answers
     * about one skill: an active `config.ts` entry with no `excluded` flag, a `- <skill>` line in
     * the Changes block, and no mention of it in the recompiled agent.
     *
     * The entry here is EJECT-sourced with no files written for it, so the reason names the
     * directory its skill is missing from rather than the marketplace, which never carried it
     * either. Which reason each kind of unresolvable entry earns is pinned on its own in
     * `edit-unresolvable-entry-removal-reasons.e2e.test.ts`.
     */
    it(
      "should remove an unresolvable skill and name the reason it went",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id],
          unresolvableSkills: ["web-styling-tailwind"],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;
        expect(rawOutput).toContain("Changes:");

        // The whole surviving skill list, read structurally: the unresolvable entry is gone.
        const config = await loadConfigOrFail(result.project.dir);
        expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);

        await expect(result.project).toHaveCompiledAgent("web-developer");

        // The scope tag is what makes this the command's own Changes block: the confirm step's
        // summary paints the same `- <name>` row without one.
        expect(rawOutput).toContain(`${REMOVED_MARKER} web-styling-tailwind [P]`);
        // ...and the reason, which is the whole point — this removal is the only one the user
        // never asked for, so it may not be reported as a bare `-` row. Anchored to the row's
        // own `[P] (`: the store warns "is not present in the loaded source" about the same
        // skill on the way in, so a bare fragment is satisfied by a line that is not this one.
        expect(rawOutput, "the removal of an unresolvable skill must say why it went").toContain(
          `${REMOVED_MARKER} web-styling-tailwind [P] (${STEP_TEXT.REMOVED_REASON_FILES_GONE}`,
        );
      },
    );

    it(
      "should recompile agents after removing a skill",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id],
          unresolvableSkills: ["web-styling-tailwind"],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        const result = await wizard.completeFromBuild();

        await expectPhaseSuccess(result, {
          compiledAgents: ["web-developer"],
        });
      },
    );

    it(
      "should preserve local skill files when source is unchanged during edit",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id],
          unresolvableSkills: ["web-styling-tailwind"],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        const result = await wizard.completeFromBuild();

        // The wizard preserves the saved source ("eject") from the existing config
        // when the user doesn't explicitly change it. No source migration is triggered,
        // so eject skill files remain intact.
        await expectPhaseSuccess(result, {
          copiedSkills: [E2E_SKILL.react.id],
          compiledAgents: [],
        });

        expect(Object.keys(await readCompiledAgents(result.project.dir)).sort()).toStrictEqual(
          COMPILED_AGENT_FILES,
        );
      },
    );
  });
});
