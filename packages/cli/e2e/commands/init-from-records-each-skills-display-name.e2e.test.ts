import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  CODEX_SOURCE_REL,
  codexGlobalSkillsDir,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { pluginKeyFor } from "../fixtures/plugin-install-state.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2EPluginSource } from "../helpers/create-e2e-plugin-source.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTypesTsPath,
  fileExists,
  isClaudeCLIAvailable,
  listFiles,
  loadConfigOrFail,
  skillsPath,
} from "../helpers/test-utils.js";
import { typecheckGeneratedConfig } from "../helpers/type-check-probe.js";
import { EJECT_SOURCE_NAME, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `init --from` writes each skill's display name onto its config.ts entry, as the marketplace it
 * installs from names it, so that every later summary can name the skill without reading a
 * marketplace. The fixture's namespaced ids are in no catalogue the CLI ships, so only the
 * marketplace this run reads can have supplied the name. Each entry is loaded through the CLI's
 * own loader, so a name the writer leaves out and a name the loader drops redden alike.
 */

const claudeAvailable = await isClaudeCLIAvailable();

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const BOTH_SCOPES_ID = "NamedBoth1";
const PLUGIN_ID = "NamedPlug1";
const CODEX_ID = "NamedCdx01";

const REACT_COPY_AT_GLOBAL = {
  id: E2E_SKILL.react.id,
  scope: "global",
  origin: EJECT_SOURCE_NAME,
  displayName: E2E_SKILL.react.display,
};

const HONO_COPY_IN_THE_PROJECT = {
  id: E2E_SKILL.hono.id,
  scope: "project",
  origin: EJECT_SOURCE_NAME,
  displayName: E2E_SKILL.hono.display,
};

describe("init --from records each skill's display name on its config.ts entry", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      BOTH_SCOPES_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [WEB_DEV]: "preloaded" },
          }),
          [E2E_SKILL.hono.id]: buildSeedSkill({
            install: "eject",
            scope: "project",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "project" } },
      }),
    );
    store.publish(
      PLUGIN_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.hono.id]: buildSeedSkill({
            install: "plugin",
            scope: "project",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [API_DEV]: { scope: "project" } },
      }),
    );
    store.publish(
      CODEX_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" } },
      }),
    );
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "records the name on a copy at each scope, and each half of the pair still type-checks",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const project = { dir: env.projectDir, globalHome: env.fakeHome };

      const installed = await runInitFrom(store, BOTH_SCOPES_ID, project, E2E_SOURCE.sourceDir);

      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      expect(
        (await loadConfigOrFail(env.fakeHome)).skills,
        "the global config records the name of the copy it installed",
      ).toStrictEqual([REACT_COPY_AT_GLOBAL]);
      expect(
        (await loadConfigOrFail(env.projectDir)).skills,
        "the project config records its own copy's name and keeps the name on the global entry it inlines",
      ).toStrictEqual([REACT_COPY_AT_GLOBAL, HONO_COPY_IN_THE_PROJECT]);
      expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([E2E_SKILL.react.id]);
      expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([E2E_SKILL.hono.id]);

      for (const root of [env.fakeHome, env.projectDir]) {
        const typecheck = await typecheckGeneratedConfig(path.dirname(configTypesTsPath(root)));
        expect(
          typecheck.exitCode,
          `the config.ts written at ${root} must type-check against the config-types.ts beside it.\ntsc output:\n${typecheck.output || "(no diagnostics)"}`,
        ).toBe(EXIT_CODES.SUCCESS);
      }
    },
  );

  it.skipIf(!claudeAvailable)(
    "records the name on a plugin, beside the marketplace it came from",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      const fixture = await createE2EPluginSource();
      env = await createTestEnvironment({ permissions: false });
      const project = { dir: env.projectDir, globalHome: env.fakeHome };

      const installed = await runInitFrom(store, PLUGIN_ID, project, fixture.sourceDir);

      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      await expect({ dir: env.projectDir }).toHavePlugin(
        pluginKeyFor(E2E_SKILL.hono.id, fixture.marketplaceName),
      );
      expect(
        (await loadConfigOrFail(env.projectDir)).skills,
        "a plugin leaves no metadata.yaml behind, so its entry is the only place its name is kept",
      ).toStrictEqual([
        {
          id: E2E_SKILL.hono.id,
          scope: "project",
          origin: fixture.marketplaceName,
          displayName: E2E_SKILL.hono.display,
        },
      ]);
    },
  );

  it(
    "records the name on a Codex installation's config.ts as on Claude's",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createTestEnvironment();
      const home = { dir: env.fakeHome, globalHome: env.fakeHome };

      const installed = await runInitFromOnCodex(store, CODEX_ID, home, E2E_SOURCE.sourceDir);

      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
      // Subject guard: the config loaded below is Codex's.
      expect(await fileExists(path.join(env.fakeHome, CODEX_SOURCE_REL, FILES.CONFIG_TS))).toBe(
        true,
      );
      expect(await listFiles(codexGlobalSkillsDir(env.fakeHome))).toStrictEqual([
        E2E_SKILL.react.id,
      ]);
      expect(
        (await loadConfigOrFail(env.fakeHome)).skills,
        "Codex's config.ts takes the same entry from the same writer",
      ).toStrictEqual([REACT_COPY_AT_GLOBAL]);
    },
  );
});
