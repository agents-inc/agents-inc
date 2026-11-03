import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { GLOBAL_SKILLS_DIR, INSTALL_WITH } from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  directoryExists,
  fileExists,
  flattenCliOutput,
  listFiles,
} from "../helpers/test-utils.js";
import { doctorRow, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { PROVIDERS, type Provider } from "../../src/cli/consts.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/project-config.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A project install under a home already holding a global installation, naming no provider unless
 * it is Codex: the global skill it ejects is copied where the project's own provider reads its
 * global skills, the run names that folder, and doctor then finds the skill there. A Claude project
 * under a Codex home is the subject, since another provider's global never reaches a project; a
 * Codex project under a Codex home and a Claude project under a Claude home are the controls.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const AT_HOME = E2E_SKILL.hono.id;
const FROM_THE_PROJECT = E2E_SKILL.react.id;

const HOME_SEED_ID = "CopyHome";
const PROJECT_SEED_ID = "CopyProj";

const CASES = [
  {
    home: "codex",
    project: "claude",
    globalSkillFolders: { claude: [FROM_THE_PROJECT], codex: [AT_HOME] },
    globalConfigSkills: { claude: [FROM_THE_PROJECT], codex: [AT_HOME] },
    doctorInstalled: "1/1 eject-mode skill installed\n",
  },
  {
    home: "codex",
    project: "codex",
    globalSkillFolders: { claude: [], codex: [AT_HOME, FROM_THE_PROJECT].toSorted() },
    globalConfigSkills: { claude: null, codex: [AT_HOME, FROM_THE_PROJECT].toSorted() },
    doctorInstalled: "2/2 eject-mode skills installed\n",
  },
  {
    home: "claude",
    project: "claude",
    globalSkillFolders: { claude: [AT_HOME, FROM_THE_PROJECT].toSorted(), codex: [] },
    globalConfigSkills: { claude: [AT_HOME, FROM_THE_PROJECT].toSorted(), codex: null },
    doctorInstalled: "2/2 eject-mode skills installed\n",
  },
] as const satisfies readonly {
  home: Provider;
  project: Provider;
  // Sorted; `null` where the provider has no global configuration.
  globalSkillFolders: Record<Provider, readonly string[]>;
  globalConfigSkills: Record<Provider, readonly string[] | null>;
  doctorInstalled: string;
}[];

describe("init --from in a project under a home holding a global installation", () => {
  let store: SeedConfigStore;
  const envs: TestEnvironment[] = [];

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      HOME_SEED_ID,
      buildSeedPayload({
        skills: {
          [AT_HOME]: buildSeedSkill({ scope: "global", assignments: { [API_DEV]: "preloaded" } }),
        },
        agents: { [API_DEV]: { scope: "global" } },
      }),
    );
    store.publish(
      PROJECT_SEED_ID,
      buildSeedPayload({
        skills: {
          [FROM_THE_PROJECT]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await Promise.all(envs.map((env) => cleanupTempDir(env.tempDir)));
  });

  describe.each(CASES)(
    "onto $project, the home holding a $home installation",
    ({ home, project, globalSkillFolders, globalConfigSkills, doctorInstalled }) => {
      let env: TestEnvironment;
      let inProject: ProjectHandle;
      let stdout: string;

      beforeAll(async () => {
        env = await createTestEnvironment({ permissions: false });
        envs.push(env);

        const atHome = await INSTALL_WITH[home](
          store,
          HOME_SEED_ID,
          { dir: env.fakeHome, globalHome: env.fakeHome },
          E2E_SOURCE.sourceDir,
        );
        expect(atHome.exitCode, flattenCliOutput(atHome.output)).toBe(EXIT_CODES.SUCCESS);

        inProject = { dir: env.projectDir, globalHome: env.fakeHome };
        const installed = await INSTALL_WITH[project](
          store,
          PROJECT_SEED_ID,
          inProject,
          E2E_SOURCE.sourceDir,
        );
        expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
        stdout = installed.stdout;
      }, TIMEOUTS.LIFECYCLE);

      it("copies the global skill into the folder its own provider reads, and into no other", async () => {
        const folders = Object.fromEntries(
          await Promise.all(
            PROVIDERS.map(async (provider) => [
              provider,
              (await listFiles(GLOBAL_SKILLS_DIR[provider](env.fakeHome))).toSorted(),
            ]),
          ),
        );

        expect(
          folders,
          "each provider's global skills folder holds its own installation's copies only",
        ).toStrictEqual(globalSkillFolders);
        expect(
          await fileExists(
            path.join(GLOBAL_SKILLS_DIR[project](env.fakeHome), FROM_THE_PROJECT, FILES.SKILL_MD),
          ),
          `the copy is a whole skill where ${project} reads a global one`,
        ).toBe(true);
      });

      it("names that folder on the line saying where it copied", () => {
        expect(stdout).toContain(
          `${STEP_TEXT.COPIED_ONE_SKILL_TO} ${GLOBAL_SKILLS_DIR[project](env.fakeHome)}/\n`,
        );
      });

      it("names that folder under its closing copy heading, and the entry it lists is on disk", async () => {
        const named = GLOBAL_SKILLS_DIR[project](env.fakeHome);

        expect(stdout).toContain(
          [
            STEP_TEXT.SKILLS_COPIED_TO,
            `  ${named}`,
            `    ${FROM_THE_PROJECT}/`,
            "",
            STEP_TEXT.AGENTS_COMPILED_TO,
          ].join("\n"),
        );
        expect(
          await directoryExists(path.join(named, FROM_THE_PROJECT)),
          "a reader can cd into the folder the heading lists",
        ).toBe(true);
      });

      it("records the skill in its own provider's global configuration, and in no other", async () => {
        const configured = Object.fromEntries(
          await Promise.all(
            PROVIDERS.map(async (provider) => {
              const loaded = await loadProjectConfigFromDir(env.fakeHome, provider);
              const skills = loaded === null ? null : loaded.config.skills.map(({ id }) => id);
              return [provider, skills === null ? null : skills.toSorted()];
            }),
          ),
        );

        expect(configured).toStrictEqual(globalConfigSkills);
      });

      it(
        "leaves doctor finding every copied skill on disk",
        { timeout: TIMEOUTS.PLUGIN_TEST },
        async () => {
          const { exitCode, stdout: said } = await CLI.run(["doctor"], inProject);

          expect(said).toMatch(
            doctorRow(
              STEP_TEXT.DOCTOR_ROW_SKILLS_INSTALLED,
              STEP_TEXT.DOCTOR_STATUS_PASS,
              doctorInstalled,
            ),
          );
          expect(said, "no row reports a skill missing").not.toContain("(not found");
          expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
        },
      );
    },
  );
});
