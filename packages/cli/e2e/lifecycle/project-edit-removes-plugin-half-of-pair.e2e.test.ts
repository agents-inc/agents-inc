import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import {
  CHANGED_MARKER,
  DIRS,
  FILES,
  REMOVED_MARKER,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  createTestEnvironment,
  readSkillEntries,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import { applyFromSeed, e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
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

const HONO = E2E_SKILL.hono;

const claudeAvailable = await isClaudeCLIAvailable();

type InstallMode = "local" | "plugin";

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
    let store: SeedConfigStore;
    const tempDirs: string[] = [];

    beforeAll(async () => {
      source = await createE2EPluginSource();
      store = await startSeedConfigStore();
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await store.close();
      await cleanupFixture(source);
    });

    afterEach(async () => {
      await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
    });

    function honoPluginKey(): string {
      return pluginKeyFor(HONO.id, source.marketplaceName);
    }

    function originFor(mode: InstallMode): string {
      return mode === "local" ? "eject" : source.marketplaceName;
    }

    function installOf(mode: InstallMode): "eject" | "plugin" {
      return mode === "local" ? "eject" : "plugin";
    }

    function globalStack(globalMode: InstallMode) {
      return e2eStackPayload({ install: installOf(globalMode) });
    }

    /** The project's own Hono, which no sub-agent carries: the global api-developer cannot. */
    async function pairHono(globalMode: InstallMode, projectMode: InstallMode) {
      const env = await createTestEnvironment();
      tempDirs.push(env.tempDir);

      await installFromSeed(
        store,
        "Global1",
        globalStack(globalMode),
        { dir: env.fakeHome, home: env.fakeHome },
        source.sourceDir,
      );
      await installFromSeed(
        store,
        "Paired1",
        e2eStackPayload({
          install: installOf(projectMode),
          projectSkills: [HONO.id],
          unassigned: [HONO.id],
        }),
        { dir: env.projectDir, home: env.fakeHome },
        source.sourceDir,
      );

      expect(
        await readSkillEntries(env.projectDir, HONO.id),
        "the project's own row must take the install mode it was given",
      ).toStrictEqual([
        { id: HONO.id, scope: "global", origin: originFor(globalMode), excluded: true },
        { id: HONO.id, scope: "project", origin: originFor(projectMode) },
      ]);

      return env;
    }

    function dropHono(env: TestEnvironment, globalMode: InstallMode) {
      return applyFromSeed(store, "Dropped1", globalStack(globalMode), {
        dir: env.projectDir,
        home: env.fakeHome,
      });
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

        const dropped = await dropHono(env, "plugin");

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

        const dropped = await dropHono(env, "plugin");

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

        const dropped = await dropHono(env, "local");

        expectOnlyTheRemovalReported(dropped.output);
        expect(
          await readSkillEntries(env.projectDir, HONO.id),
          "dropping the project half must collapse the pair to the inherited global entry",
        ).toStrictEqual([{ id: HONO.id, scope: "global", origin: originFor("local") }]);
        await expectProjectPluginHalfGone(env);
        await expectGlobalInstallUntouched(env.fakeHome, before);
      },
    );
  },
);
