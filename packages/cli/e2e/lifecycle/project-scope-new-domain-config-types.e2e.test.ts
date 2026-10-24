import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";

import {
  cleanupTempDir,
  configTypesTsPath,
  listFiles,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment, readAllSkillEntries } from "../fixtures/dual-scope-helpers.js";
import { installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { EJECT_SOURCE_NAME, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { typecheckGeneratedConfig } from "../helpers/type-check-probe.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/** The only category the fixture ships outside the `web` domain. */
const NEW_CATEGORY = "api-api";

/**
 * Verbatim: a `Category` degraded to `GlobalCategory`, to `string`, or missing `web-framework`
 * would each pass a membership check. The global pair is the control.
 */
const GLOBAL_CATEGORY_LINE = `export type Category = 'web-framework'`;
const GLOBAL_DOMAIN_LINE = `export type Domain = 'web'`;
const PROJECT_CATEGORY_LINE = `export type Category = GlobalCategory | 'api-api' | 'web-framework'`;
const PROJECT_DOMAIN_LINE = `export type Domain = GlobalDomain | 'api' | 'web'`;

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

/** Hono's project scope is the whole of the divergence. */
async function initReactGlobalHonoProject(
  store: SeedConfigStore,
  options: { fakeHome: string; projectDir: string },
): Promise<{ exitCode: number; output: string }> {
  return installFromSeed(
    store,
    "ReactGlobalHonoProject1",
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
    { dir: options.projectDir, home: options.fakeHome },
  );
}

describe("a project-scoped skill in a category the global install lacks widens the project's unions", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "extends GlobalCategory with the project-only category and leaves the global union without it",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      const install = await initReactGlobalHonoProject(store, {
        fakeHome,
        projectDir,
      });
      expect(install.exitCode, `Install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);

      // Otherwise the union assertions could hold over an install with nothing at project scope.
      expect(
        await readAllSkillEntries(fakeHome),
        "the global config must hold react alone — the divergence is that it never sees hono",
      ).toStrictEqual([
        {
          id: E2E_SKILL.react.id,
          scope: "global",
          origin: EJECT_SOURCE_NAME,
          displayName: E2E_SKILL.react.display,
        },
      ]);
      expect(
        await readAllSkillEntries(projectDir),
        "the project config must inline the global react row and own hono at project scope",
      ).toStrictEqual([
        {
          id: E2E_SKILL.react.id,
          scope: "global",
          origin: EJECT_SOURCE_NAME,
          displayName: E2E_SKILL.react.display,
        },
        {
          id: E2E_SKILL.hono.id,
          scope: "project",
          origin: EJECT_SOURCE_NAME,
          displayName: E2E_SKILL.hono.display,
        },
      ]);

      expect(
        await listFiles(skillsPath(fakeHome)),
        "react must be copied into the global skills dir and nothing else with it",
      ).toStrictEqual([E2E_SKILL.react.id]);
      expect(
        await listFiles(skillsPath(projectDir)),
        "hono must be copied into the project skills dir and nothing else with it",
      ).toStrictEqual([E2E_SKILL.hono.id]);

      const globalTypes = await readTestFile(configTypesTsPath(fakeHome));
      const projectTypes = await readTestFile(configTypesTsPath(projectDir));

      expect(
        globalTypes,
        "the global Category union must not name the project-only category — with it there, the project's extension proves nothing",
      ).toContain(GLOBAL_CATEGORY_LINE);
      expect(globalTypes).not.toContain(NEW_CATEGORY);
      expect(
        globalTypes,
        "the global Domain union names the domain of the one skill the global install holds",
      ).toContain(GLOBAL_DOMAIN_LINE);

      expect(
        projectTypes,
        "the project Category union must extend GlobalCategory with the category only its own scope holds",
      ).toContain(PROJECT_CATEGORY_LINE);
      expect(
        projectTypes,
        "the project Domain union must extend GlobalDomain with every domain the effective view derives",
      ).toContain(PROJECT_DOMAIN_LINE);

      // Independently of the text: unwidened unions make the written config.ts a type error.
      const typecheck = await typecheckGeneratedConfig(path.dirname(configTypesTsPath(projectDir)));
      expect(
        typecheck.exitCode,
        `The project pair must type-check against itself.\ntsc output:\n${typecheck.output || "(no diagnostics)"}`,
      ).toBe(EXIT_CODES.SUCCESS);
    },
  );
});
