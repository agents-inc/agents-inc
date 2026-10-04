import path from "path";
import { appendFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import {
  CHANGED_MARKER,
  DIRS,
  EXIT_CODES,
  FILES,
  REMOVED_MARKER,
  STEP_TEXT,
  TERMINAL_SIZE,
  TIMEOUTS,
} from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import type { DashboardSession } from "../pages/dashboard-session.js";
import type { SourcesStep } from "../pages/steps/sources-step.js";
import {
  createTestEnvironment,
  finishWizard,
  initGlobal,
  initGlobalWithEject,
  readSkillEntries,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import {
  pluginKeyFor,
  readPluginRegistrations,
  type PluginRegistration,
} from "../fixtures/plugin-install-state.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  isClaudeCLIAvailable,
  readCompiledAgents,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { EJECT_SOURCE } from "../../src/cli/consts.js";

/**
 * Journey 8 with a plugin on one side of the pair, or both: a project edit that drops the
 * project's half of a `[P][G]` skill removes the project's half and nothing else. The ejected
 * pair is `project-edit-removes-project-half-of-pair.e2e.test.ts`; this file is the other three
 * origin pairs, and the Sources step of the same drop.
 *
 * "Nothing else" is read off every place a global install lives: the global `config.ts` byte for
 * byte, `~/.claude/skills` as a tree snapshot (content and mtime), the compiled global agents,
 * `~/.claude/settings.json`, and the global plugin's user-scope record in Claude's registry, whose
 * timestamps move on any reinstall. The project's half is read off where it lives: its ejected
 * folder, or its project-scope registration and the project's `enabledPlugins`. And the run says
 * what it did, so the Changes block names the removal and announces no mode switch and no copy.
 *
 * Each pair is built the way a user builds it: a global install, then `init` in the project,
 * whose dashboard opens Edit over it, `s` on the skill, and the Sources step committing the
 * project row's install mode. That commit is the ALLOWED half of the last test here: the
 * project's own row takes the mode it is given, and each setup asserts it did. The drop is a
 * second edit pressing SPACE on the same row.
 *
 * `s` on the same row is the one route that DOES change the global install: it folds the project's
 * half into it, carrying the half's install mode to every project. So its tests are the counterparts
 * of the drops: a project plugin folded over a global copy must leave the global config, the
 * plugin registry and `~/.claude/skills` all saying plugin, rather than a user-scope registration
 * under a config that still says eject; and a project copy folded over a global plugin must leave
 * the project's own copy, edits included, as the global install, with the plugin unregistered.
 *
 * The last test is the Sources step of that drop. Once the project's half is dropped, the row
 * that remains is the GLOBAL install, which a project edit may not re-mode, so the walk that
 * commits Plugin on every editable row must find nothing to commit, and the global install must
 * come out of the run as it went in.
 *
 * Requires the Claude CLI: every plugin half is a real `claude plugin install`.
 */

const HONO = E2E_SKILL.hono;

/** A line the user adds to the project's own copy of the skill once it is installed. */
const PROJECT_COPY_EDIT_MARKER = "## Section added to the project's copy after installation";

const claudeAvailable = await isClaudeCLIAvailable();

type InstallMode = "local" | "plugin";

/** Everything the global install is, read before the drop and compared after it. */
type GlobalInstall = {
  config: string;
  skills: Record<string, TreeSnapshotEntry>;
  agents: Record<string, string>;
  settings: string;
  userRegistrations: PluginRegistration[];
};

describe.skipIf(!claudeAvailable)(
  "project edit drops the project half of a pair holding a plugin",
  () => {
    let source: E2EPluginSource;
    let dashboard: DashboardSession | undefined;
    let wizard: EditWizard | undefined;
    const tempDirs: string[] = [];

    beforeAll(async () => {
      source = await createE2EPluginSource();
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await cleanupFixture(source);
    });

    afterEach(async () => {
      await dashboard?.destroy();
      dashboard = undefined;
      await wizard?.destroy();
      wizard = undefined;
      await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
    });

    function honoPluginKey(): string {
      return pluginKeyFor(HONO.id, source.marketplaceName);
    }

    function originFor(mode: InstallMode): string {
      return mode === "local" ? EJECT_SOURCE : source.marketplaceName;
    }

    /**
     * A global install in `globalMode`, then the project's own copy of Hono in `projectMode`,
     * through `init`'s dashboard → Edit → `s` → the Sources step.
     */
    async function pairHono(globalMode: InstallMode, projectMode: InstallMode) {
      const env = await createTestEnvironment();
      tempDirs.push(env.tempDir);

      const global =
        globalMode === "local"
          ? await initGlobalWithEject(source, env.fakeHome)
          : await initGlobal(source, env.fakeHome);
      expect(global.exitCode, `global install failed: ${global.output}`).toBe(EXIT_CODES.SUCCESS);

      dashboard = await InitWizard.launchForDashboard({
        projectDir: env.projectDir,
        source,
        env: { HOME: env.fakeHome },
      });
      await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
      const build = await dashboard.selectEdit();
      await build.advanceDomain();
      await build.focusSkill(HONO.display);
      await build.toggleScopeOnFocusedSkill();
      const sources = await build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      if (projectMode === "local") {
        await sources.setAllLocal();
      } else {
        await sources.setAllPlugin();
      }
      const agents = await sources.advance();
      const paired = await finishWizard(await (await agents.acceptDefaults("edit")).confirm());
      await dashboard.destroy();
      dashboard = undefined;
      expect(paired.exitCode, `pairing failed: ${paired.output}`).toBe(EXIT_CODES.SUCCESS);

      expect(
        await readSkillEntries(env.projectDir, HONO.id),
        "the project's own row must take the install mode the Sources step committed on it",
      ).toStrictEqual([
        { id: HONO.id, scope: "global", origin: originFor(globalMode), excluded: true },
        { id: HONO.id, scope: "project", origin: originFor(projectMode) },
      ]);

      return env;
    }

    /** A project edit with SPACE pressed on Hono's `[P][G]` row, stopped on its Sources step. */
    async function dropHonoUpToSources(env: TestEnvironment): Promise<SourcesStep> {
      wizard = await EditWizard.launch({
        projectDir: env.projectDir,
        source,
        env: { HOME: env.fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      await wizard.build.advanceDomain();
      await wizard.build.focusSkill(HONO.display);
      await wizard.build.toggleFocusedSkill();
      const sources = await wizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      return sources;
    }

    /** Saves the edit and waits for the process to end, whatever it exits with. */
    async function saveEdit(sources: SourcesStep) {
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");
      return finishWizard(await confirm.confirmExpectingExit());
    }

    async function readGlobalInstall(home: string): Promise<GlobalInstall> {
      return {
        config: await readTestFile(configTsPath(home)),
        skills: await readTreeSnapshot(skillsPath(home)),
        agents: await readCompiledAgents(home),
        settings: await readTestFile(path.join(home, DIRS.CLAUDE, FILES.SETTINGS_JSON)),
        userRegistrations: (await readPluginRegistrations(home, honoPluginKey())).filter(
          (registration) => registration.scope === "user",
        ),
      };
    }

    /** The Changes block a drop owes: the project half's removal, and no mode switch or copy. */
    function expectOnlyTheRemovalReported(output: string): void {
      expect(output, "the drop must report the project half's removal").toContain(
        `${REMOVED_MARKER} ${HONO.display} [P]`,
      );
      expect(
        output,
        "a drop must not announce that the skill changed install mode — nothing was switched",
      ).not.toContain(`${CHANGED_MARKER} ${HONO.display}`);
      expect(output, "a drop must not announce a mode switch").not.toContain(
        STEP_TEXT.SWITCHING_SKILLS_SUFFIX,
      );
      expect(output, "a drop must not announce a copy").not.toContain(
        STEP_TEXT.COPIED_LOCAL_SKILLS_SUFFIX,
      );
    }

    async function expectProjectPluginHalfGone(env: TestEnvironment): Promise<void> {
      await expect({ dir: env.projectDir }).not.toHavePlugin(honoPluginKey());
      expect(
        (await readPluginRegistrations(env.fakeHome, honoPluginKey())).filter(
          (registration) => registration.scope === "project",
        ),
        "the project's plugin registration must be uninstalled",
      ).toStrictEqual([]);
    }

    async function expectProjectCopyGone(env: TestEnvironment): Promise<void> {
      expect(
        await directoryExists(path.join(skillsPath(env.projectDir), HONO.id)),
        "dropping the project half must remove the project's copy of the skill",
      ).toBe(false);
    }

    async function expectGlobalInstallUntouched(
      home: string,
      before: GlobalInstall,
    ): Promise<void> {
      const after = await readGlobalInstall(home);
      expect(after.config, "a project-scope drop must not rewrite the global config").toBe(
        before.config,
      );
      expect(
        after.skills,
        "a project-scope drop must not write into ~/.claude/skills",
      ).toStrictEqual(before.skills);
      expect(after.agents, "a project-scope drop must not rewrite the global agents").toStrictEqual(
        before.agents,
      );
      expect(after.settings, "a project-scope drop must not rewrite the global settings.json").toBe(
        before.settings,
      );
      expect(
        after.userRegistrations,
        "a project-scope drop must neither reinstall nor remove the global plugin",
      ).toStrictEqual(before.userRegistrations);
    }

    it(
      "drops a project plugin over a global plugin and leaves the global plugin registered as it was",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await pairHono("plugin", "plugin");
        const before = await readGlobalInstall(env.fakeHome);
        expect(
          before.userRegistrations.map((registration) => registration.scope),
          "the global plugin must be registered before the drop, or its survival is vacuous",
        ).toStrictEqual(["user"]);

        const dropped = await saveEdit(await dropHonoUpToSources(env));

        expect(dropped.exitCode, `drop output:\n${dropped.output}`).toBe(EXIT_CODES.SUCCESS);
        expectOnlyTheRemovalReported(dropped.output);
        expect(
          await readSkillEntries(env.projectDir, HONO.id),
          "dropping the project half must collapse the pair to the inherited global entry",
        ).toStrictEqual([{ id: HONO.id, scope: "global", origin: originFor("plugin") }]);
        await expectProjectPluginHalfGone(env);
        await expectGlobalInstallUntouched(env.fakeHome, before);
      },
    );

    it(
      "drops a project copy over a global plugin and exits as a success",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await pairHono("plugin", "local");
        const before = await readGlobalInstall(env.fakeHome);
        expect(
          before.userRegistrations.map((registration) => registration.scope),
          "the global plugin must be registered before the drop, or its survival is vacuous",
        ).toStrictEqual(["user"]);

        const dropped = await saveEdit(await dropHonoUpToSources(env));

        expect(dropped.exitCode, `drop output:\n${dropped.output}`).toBe(EXIT_CODES.SUCCESS);
        expectOnlyTheRemovalReported(dropped.output);
        expect(
          await readSkillEntries(env.projectDir, HONO.id),
          "dropping the project half must collapse the pair to the inherited global entry",
        ).toStrictEqual([{ id: HONO.id, scope: "global", origin: originFor("plugin") }]);
        await expectProjectCopyGone(env);
        await expectGlobalInstallUntouched(env.fakeHome, before);
      },
    );

    it(
      "drops a project plugin over a global copy without announcing a switch or a copy",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await pairHono("local", "plugin");
        const before = await readGlobalInstall(env.fakeHome);
        expect(
          Object.keys(before.skills),
          "the global copy must be on disk before the drop, or its survival is vacuous",
        ).toContain(path.join(HONO.id, FILES.SKILL_MD));

        const dropped = await saveEdit(await dropHonoUpToSources(env));

        expect(dropped.exitCode, `drop output:\n${dropped.output}`).toBe(EXIT_CODES.SUCCESS);
        expectOnlyTheRemovalReported(dropped.output);
        expect(
          await readSkillEntries(env.projectDir, HONO.id),
          "dropping the project half must collapse the pair to the inherited global entry",
        ).toStrictEqual([{ id: HONO.id, scope: "global", origin: originFor("local") }]);
        await expectProjectPluginHalfGone(env);
        await expectGlobalInstallUntouched(env.fakeHome, before);
      },
    );

    it(
      "folds a project plugin over a global copy into the global install with s, and every record of it says plugin",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await pairHono("local", "plugin");
        expect(
          Object.keys((await readGlobalInstall(env.fakeHome)).skills),
          "the global copy must be on disk before the fold, or its removal is vacuous",
        ).toContain(path.join(HONO.id, FILES.SKILL_MD));

        wizard = await EditWizard.launch({
          projectDir: env.projectDir,
          source,
          env: { HOME: env.fakeHome },
          ...TERMINAL_SIZE.TALL,
        });
        await wizard.build.advanceDomain();
        await wizard.build.focusSkill(HONO.display);
        await wizard.build.toggleScopeOnFocusedSkill();
        const sources = await wizard.build.passThroughAllDomainsGeneric();
        await sources.waitForReady();
        const folded = await saveEdit(sources);

        expect(folded.exitCode, `fold output:\n${folded.output}`).toBe(EXIT_CODES.SUCCESS);
        expect(
          await readSkillEntries(env.fakeHome, HONO.id),
          "the global config must record the plugin the fold registered for every project",
        ).toStrictEqual([{ id: HONO.id, scope: "global", origin: originFor("plugin") }]);
        expect(
          (await readPluginRegistrations(env.fakeHome, honoPluginKey())).map(
            (registration) => registration.scope,
          ),
          "the folded plugin is registered at user scope, and the project's own registration is gone",
        ).toStrictEqual(["user"]);
        expect(
          await directoryExists(path.join(skillsPath(env.fakeHome), HONO.id)),
          "a global plugin install keeps no ejected copy beside it",
        ).toBe(false);
        expect(
          await readSkillEntries(env.projectDir, HONO.id),
          "the project inherits the folded global entry",
        ).toStrictEqual([{ id: HONO.id, scope: "global", origin: originFor("plugin") }]);
      },
    );

    it(
      "folds a project copy over a global plugin into the global install with s, carrying the copy's edits and unregistering the plugin",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await pairHono("plugin", "local");
        const projectSkillMd = path.join(skillsPath(env.projectDir), HONO.id, FILES.SKILL_MD);
        await appendFile(projectSkillMd, `\n\n${PROJECT_COPY_EDIT_MARKER}\n`);
        const projectCopy = await readTestFile(projectSkillMd);
        expect(
          (await readPluginRegistrations(env.fakeHome, honoPluginKey())).map(
            (registration) => registration.scope,
          ),
          "the global plugin must be registered before the fold, or its removal is vacuous",
        ).toStrictEqual(["user"]);

        wizard = await EditWizard.launch({
          projectDir: env.projectDir,
          source,
          env: { HOME: env.fakeHome },
          ...TERMINAL_SIZE.TALL,
        });
        await wizard.build.advanceDomain();
        await wizard.build.focusSkill(HONO.display);
        await wizard.build.toggleScopeOnFocusedSkill();
        const sources = await wizard.build.passThroughAllDomainsGeneric();
        await sources.waitForReady();
        const folded = await saveEdit(sources);

        expect(folded.exitCode, `fold output:\n${folded.output}`).toBe(EXIT_CODES.SUCCESS);
        expect(
          await readSkillEntries(env.fakeHome, HONO.id),
          "the global config must record the Local mode the fold carried to every project",
        ).toStrictEqual([{ id: HONO.id, scope: "global", origin: originFor("local") }]);
        expect(
          await readTestFile(path.join(skillsPath(env.fakeHome), HONO.id, FILES.SKILL_MD)),
          "the global copy is the project's own, edits included, not a fresh one from the marketplace",
        ).toBe(projectCopy);
        expect(
          await readPluginRegistrations(env.fakeHome, honoPluginKey()),
          "the global plugin is unregistered, as switching it to Local does",
        ).toStrictEqual([]);
        expect(
          await directoryExists(path.join(skillsPath(env.projectDir), HONO.id)),
          "the folded project copy is moved, not left behind",
        ).toBe(false);
        expect(
          await readSkillEntries(env.projectDir, HONO.id),
          "the project inherits the folded global entry",
        ).toStrictEqual([{ id: HONO.id, scope: "global", origin: originFor("local") }]);
      },
    );

    it(
      "keeps the global row the drop leaves behind out of the project's reach on the Sources step",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await pairHono("local", "local");
        const before = await readGlobalInstall(env.fakeHome);

        const sources = await dropHonoUpToSources(env);
        // Every row a project edit may set, set to Plugin. The project's half is gone, so the
        // only Hono row left is the global install's, and a project edit may not re-mode it.
        await sources.setAllPlugin();
        const dropped = await saveEdit(sources);

        await expectGlobalInstallUntouched(env.fakeHome, before);
        expect(dropped.exitCode, `drop output:\n${dropped.output}`).toBe(EXIT_CODES.SUCCESS);
        expect(
          await readSkillEntries(env.projectDir, HONO.id),
          "the project must inherit the global copy as it is installed",
        ).toStrictEqual([{ id: HONO.id, scope: "global", origin: originFor("local") }]);
        await expectProjectCopyGone(env);
      },
    );
  },
);
