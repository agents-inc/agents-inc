import path from "path";
import { appendFile } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { runCodex, type CodexRun } from "../fixtures/codex.js";
import { codexProjectSkillsDir, runInitFromOnCodex } from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  cleanupTempDir,
  isClaudeCLIAvailable,
  loadConfigOrFail,
  readPluginVersions,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, SOURCE_PATHS, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/** Each source is private because building a new version mutates it. */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const PROJECT_PLUGIN = E2E_SKILL.react.id;
const GLOBAL_PLUGIN = E2E_SKILL.hono.id;
const EJECTED_SKILL = E2E_SKILL.vitest.id;

/** Codex installs plugins for the whole machine only, so its one plugin is a global one. */
const CODEX_PLUGIN = E2E_SKILL.react.id;

const CLAUDE_SEED_ID = "UpdPlug1";
const CODEX_SEED_ID = "UpdPlgCx";

/** What a first build gives every plugin, and what a build after a content change gives it. */
const INSTALLED_VERSION = "1.0.0";
const OFFERED_VERSION = "2.0.0";

const SOURCE_EDIT = "## A section added to the marketplace after installation";

/** Edits every named skill in the source, then rebuilds, so the marketplace offers a new version. */
async function offerANewVersionOf(
  fixture: E2EPluginSource,
  skillIds: readonly string[],
): Promise<void> {
  for (const skillId of skillIds) {
    await appendFile(
      path.join(fixture.sourceDir, SOURCE_PATHS.SKILLS_DIR, skillId, FILES.SKILL_MD),
      `\n\n${SOURCE_EDIT}\n`,
    );
  }
  for (const build of [
    ["build", "plugins"],
    ["build", "marketplace"],
  ]) {
    const built = await CLI.run(build, { dir: fixture.sourceDir });
    expect(built.exitCode, `${build.join(" ")} failed: ${built.output}`).toBe(EXIT_CODES.SUCCESS);
  }
}

async function registeredPlugins(home: string): Promise<Record<string, unknown[]>> {
  const registryPath = path.join(home, DIRS.CLAUDE, DIRS.PLUGINS, FILES.INSTALLED_PLUGINS_JSON);
  const registry: { plugins: Record<string, unknown[]> } = JSON.parse(
    await readTestFile(registryPath),
  );
  return registry.plugins;
}

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)(
  "update over Claude plugins whose marketplace has moved on",
  () => {
    let fixture: E2EPluginSource;
    let store: SeedConfigStore;
    let env: TestEnvironment;

    let updateRun: CLIResult;
    let projectPluginKey: string;
    let globalPluginKey: string;
    let ejectedSkillMdPath: string;
    let configuredSkills: Awaited<ReturnType<typeof loadConfigOrFail>>["skills"];
    let pluginsBefore: Record<string, unknown[]>;
    let pluginsAfter: Record<string, unknown[]>;
    let offeredVersions: Record<string, string | undefined>;
    let ejectedBefore: string;
    let ejectedAfter: string;
    let projectBefore: Awaited<ReturnType<typeof readTreeSnapshot>>;
    let projectAfter: Awaited<ReturnType<typeof readTreeSnapshot>>;

    beforeAll(async () => {
      fixture = await createE2EPluginSource({ owned: true });
      store = await startSeedConfigStore();
      env = await createTestEnvironment({ permissions: false });
      const project = { dir: env.projectDir, globalHome: env.fakeHome };
      projectPluginKey = pluginKeyFor(PROJECT_PLUGIN, fixture.marketplaceName);
      globalPluginKey = pluginKeyFor(GLOBAL_PLUGIN, fixture.marketplaceName);
      ejectedSkillMdPath = path.join(skillsPath(env.projectDir), EJECTED_SKILL, FILES.SKILL_MD);

      store.publish(
        CLAUDE_SEED_ID,
        buildSeedPayload({
          skills: {
            [PROJECT_PLUGIN]: buildSeedSkill({
              install: "plugin",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [GLOBAL_PLUGIN]: buildSeedSkill({
              install: "plugin",
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [EJECTED_SKILL]: buildSeedSkill({
              install: "eject",
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "project" } },
        }),
      );
      const installed = await runInitFrom(store, CLAUDE_SEED_ID, project, fixture.sourceDir);
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      configuredSkills = (await loadConfigOrFail(env.projectDir)).skills;
      pluginsBefore = await registeredPlugins(env.fakeHome);
      ejectedBefore = await readTestFile(ejectedSkillMdPath);

      await offerANewVersionOf(fixture, [PROJECT_PLUGIN, GLOBAL_PLUGIN, EJECTED_SKILL]);
      offeredVersions = await readPluginVersions(fixture.pluginsDir, [
        PROJECT_PLUGIN,
        GLOBAL_PLUGIN,
      ]);

      projectBefore = await readTreeSnapshot(env.projectDir);
      updateRun = await CLI.run(["update"], project);
      projectAfter = await readTreeSnapshot(env.projectDir);
      pluginsAfter = await registeredPlugins(env.fakeHome);
      ejectedAfter = await readTestFile(ejectedSkillMdPath);
    }, TIMEOUTS.LIFECYCLE);

    afterAll(async () => {
      await store.close();
      await cleanupTempDir(fixture.tempDir);
      await cleanupTempDir(env.tempDir);
    });

    it("moves each installed plugin to the version its marketplace now offers, at the scope it was installed at", () => {
      expect(updateRun.exitCode, `update failed: ${updateRun.output}`).toBe(EXIT_CODES.SUCCESS);

      // The project's config names both plugins with their own scope, so one run reaches both.
      expect(configuredSkills).toContainEqual(
        expect.objectContaining({
          id: PROJECT_PLUGIN,
          scope: "project",
          origin: fixture.marketplaceName,
        }),
      );
      expect(configuredSkills).toContainEqual(
        expect.objectContaining({
          id: GLOBAL_PLUGIN,
          scope: "global",
          origin: fixture.marketplaceName,
        }),
      );
      expect(offeredVersions).toStrictEqual({
        [PROJECT_PLUGIN]: OFFERED_VERSION,
        [GLOBAL_PLUGIN]: OFFERED_VERSION,
      });
      expect(Object.keys(pluginsBefore).sort()).toStrictEqual(
        [projectPluginKey, globalPluginKey].sort(),
      );
      expect(pluginsBefore).toMatchObject({
        [projectPluginKey]: [{ scope: "project", version: INSTALLED_VERSION }],
        [globalPluginKey]: [{ scope: "user", version: INSTALLED_VERSION }],
      });

      expect(
        Object.keys(pluginsAfter).sort(),
        "an update installs nothing the installation did not already hold",
      ).toStrictEqual(Object.keys(pluginsBefore).sort());
      expect(
        pluginsAfter,
        "each plugin moves at the scope it holds; one scope for both leaves the other at its old version",
      ).toMatchObject({
        [projectPluginKey]: [{ scope: "project", version: OFFERED_VERSION }],
        [globalPluginKey]: [{ scope: "user", version: OFFERED_VERSION }],
      });
    });

    it("leaves the ejected copy, and everything else in the project, byte-identical", async () => {
      expect(
        await readTestFile(
          path.join(fixture.sourceDir, SOURCE_PATHS.SKILLS_DIR, EJECTED_SKILL, FILES.SKILL_MD),
        ),
        "the source edit must have landed, or nothing was at risk",
      ).toContain(SOURCE_EDIT);
      expect(
        ejectedAfter,
        "the ejected SKILL.md is the user's copy — updating the plugins must not carry the source edit into it",
      ).toBe(ejectedBefore);
      expect(ejectedAfter).not.toContain(SOURCE_EDIT);

      expect(Object.keys(projectBefore)).toContain(
        path.relative(env.projectDir, ejectedSkillMdPath),
      );
      expect(projectAfter).toStrictEqual(projectBefore);
    });

    it("says it refreshed the listing and updated each plugin", () => {
      expect(updateRun.output).toContain(
        `${STEP_TEXT.UPDATE_MARKETPLACE_REFRESHED} ${fixture.marketplaceName}`,
      );
      expect(updateRun.output).toContain(`Updated plugin ${projectPluginKey}`);
      expect(updateRun.output).toContain(`Updated plugin ${globalPluginKey}`);
      expect(updateRun.output).toContain(STEP_TEXT.UPDATE_EJECTED_OWNED);
    });
  },
);

describe("update over a Codex plugin whose marketplace has moved on", () => {
  let fixture: E2EPluginSource;
  let store: SeedConfigStore;
  let env: TestEnvironment;

  let updateRun: CLIResult;
  let pluginKey: string;
  let ejectedSkillMdPath: string;
  let listedBefore: CodexRun;
  let listedAfter: CodexRun;
  let offeredVersions: Record<string, string | undefined>;
  let ejectedBefore: string;
  let ejectedAfter: string;
  let projectBefore: Awaited<ReturnType<typeof readTreeSnapshot>>;
  let projectAfter: Awaited<ReturnType<typeof readTreeSnapshot>>;

  beforeAll(async () => {
    fixture = await createE2EPluginSource({ owned: true });
    store = await startSeedConfigStore();
    env = await createTestEnvironment({ permissions: false });
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    pluginKey = pluginKeyFor(CODEX_PLUGIN, fixture.marketplaceName);
    ejectedSkillMdPath = path.join(
      codexProjectSkillsDir(env.projectDir),
      EJECTED_SKILL,
      FILES.SKILL_MD,
    );

    store.publish(
      CODEX_SEED_ID,
      buildSeedPayload({
        skills: {
          [CODEX_PLUGIN]: buildSeedSkill({
            install: "plugin",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [EJECTED_SKILL]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
    const installed = await runInitFromOnCodex(store, CODEX_SEED_ID, project, fixture.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    listedBefore = await runCodex(env.fakeHome, ["plugin", "list"], env.projectDir);
    ejectedBefore = await readTestFile(ejectedSkillMdPath);

    await offerANewVersionOf(fixture, [CODEX_PLUGIN, EJECTED_SKILL]);
    offeredVersions = await readPluginVersions(fixture.pluginsDir, [CODEX_PLUGIN]);

    projectBefore = await readTreeSnapshot(env.projectDir);
    updateRun = await CLI.run(["update"], project);
    projectAfter = await readTreeSnapshot(env.projectDir);
    listedAfter = await runCodex(env.fakeHome, ["plugin", "list"], env.projectDir);
    ejectedAfter = await readTestFile(ejectedSkillMdPath);
  }, TIMEOUTS.LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(fixture.tempDir);
    await cleanupTempDir(env.tempDir);
  });

  it("moves the installed plugin to the version its marketplace now offers", () => {
    expect(updateRun.exitCode, `update failed: ${updateRun.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(offeredVersions).toStrictEqual({ [CODEX_PLUGIN]: OFFERED_VERSION });

    expect(listedBefore.exitCode, listedBefore.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(listedBefore.json).toMatchObject([
      { installed: [{ pluginId: pluginKey, version: INSTALLED_VERSION }] },
    ]);
    expect(listedAfter.exitCode, listedAfter.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(listedAfter.json).toMatchObject([
      { installed: [{ pluginId: pluginKey, version: OFFERED_VERSION }] },
    ]);
  });

  it("leaves the ejected copy, and everything else in the project, byte-identical", () => {
    expect(
      ejectedAfter,
      "the ejected SKILL.md is the user's copy — updating the plugins must not carry the source edit into it",
    ).toBe(ejectedBefore);
    expect(ejectedAfter).not.toContain(SOURCE_EDIT);

    expect(Object.keys(projectBefore)).toContain(path.relative(env.projectDir, ejectedSkillMdPath));
    expect(projectAfter).toStrictEqual(projectBefore);
  });

  it("says it updated the plugin", () => {
    expect(updateRun.output).toContain(
      `${STEP_TEXT.UPDATE_MARKETPLACE_REFRESHED} ${fixture.marketplaceName}`,
    );
    expect(updateRun.output).toContain(`Updated plugin ${pluginKey}`);
  });
});
