import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import {
  codexGlobalSkillsDir,
  runInitFromOnClaude,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  directoryExists,
  fileExists,
  flattenCliOutput,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  DIRS,
  doctorRow,
  EXIT_CODES,
  FILES,
  STEP_TEXT,
  TERMINAL_SIZE,
  TIMEOUTS,
} from "../pages/constants.js";
import { PROVIDERS, type Provider } from "../../src/cli/consts.js";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A project under a home holding a Claude and a Codex global installation, each carrying its own
 * skill no marketplace offers: doctor checks the project beside the global installation of its own
 * provider, the one it inherits, so it finds that installation's carried skill where it was copied.
 * Claude is the control, being also the provider a home holding both would otherwise be read as.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const EJECTED_AT_HOME = {
  install: "eject",
  scope: "global",
  assignments: { [WEB_DEV]: "lazy" },
} as const;

const EJECTED_INTO_THE_PROJECT = {
  install: "eject",
  scope: "project",
  assignments: { [API_DEV]: "lazy" },
} as const;

/** Non-exclusive, so the carried skill sits beside React without the one-skill rule. */
const EXTERNAL_CATEGORY = "web-tooling";

/** The ids are what the editor's `externalSkillId` mints for each name. */
const CARRIED = {
  claude: { name: "release-notes", id: "external-web-tooling-release-notes" },
  codex: { name: "changelog-writing", id: "external-web-tooling-changelog-writing" },
} as const satisfies Record<Provider, { name: string; id: string }>;

const GLOBAL_SEED_ID = {
  claude: "BothHmCl",
  codex: "BothHmCx",
} as const satisfies Record<Provider, string>;

const PROJECT_SEED_ID = "BothHmPj";

const INSTALL_WITH = {
  claude: runInitFromOnClaude,
  codex: runInitFromOnCodex,
} as const satisfies Record<Provider, typeof runInitFromOnClaude>;

const GLOBAL_SKILLS_DIR = {
  claude: skillsPath,
  codex: codexGlobalSkillsDir,
} as const satisfies Record<Provider, (home: string) => string>;

const SOURCE_FOLDER = {
  claude: DIRS.SOURCE_CLAUDE,
  codex: DIRS.SOURCE_CODEX,
} as const satisfies Record<Provider, string>;

const DOCTOR_RUNS = [
  {
    at: "with no terminal",
    run: async (project: ProjectHandle) => {
      const { exitCode, stdout } = await CLI.run(["doctor"], project);
      return { exitCode, said: stdout, prompt: undefined };
    },
  },
  {
    at: "at a wide terminal",
    run: async (project: ProjectHandle) => {
      const prompt = new InteractivePrompt(["doctor"], project.dir, {
        ...TERMINAL_SIZE.TALL,
        env: { HOME: project.globalHome },
      });
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
      return { exitCode, said: prompt.getOutput(), prompt };
    },
  },
] as const;

const EACH_PROVIDER_AT_EACH_TERMINAL = PROVIDERS.flatMap((provider) =>
  DOCTOR_RUNS.map((run) => ({ provider, ...run })),
);

function otherThan(provider: Provider): Provider[] {
  return PROVIDERS.filter((candidate) => candidate !== provider);
}

describe("doctor in a project under a home holding a Claude and a Codex global installation", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  function publishTheGlobalCarrying(provider: Provider): void {
    const carried = CARRIED[provider];
    store.publish(
      GLOBAL_SEED_ID[provider],
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill(EJECTED_AT_HOME),
          [carried.id]: buildSeedSkill(EJECTED_AT_HOME),
        },
        external: {
          [carried.id]: buildSeedExternalSkill({
            displayName: carried.name,
            categoryId: EXTERNAL_CATEGORY,
            path: `skills/${carried.name}`,
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" } },
      }),
    );
  }

  async function installBothAtHomeThenTheProjectOn(provider: Provider): Promise<ProjectHandle> {
    env = await createTestEnvironment({ permissions: false });
    const home = { dir: env.fakeHome, globalHome: env.fakeHome };
    const project = { dir: env.projectDir, globalHome: env.fakeHome };

    for (const atHome of PROVIDERS) {
      publishTheGlobalCarrying(atHome);
      const installed = await INSTALL_WITH[atHome](
        store,
        GLOBAL_SEED_ID[atHome],
        home,
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    }

    store.publish(
      PROJECT_SEED_ID,
      buildSeedPayload({
        skills: { [E2E_SKILL.hono.id]: buildSeedSkill(EJECTED_INTO_THE_PROJECT) },
        agents: { [API_DEV]: { scope: "project" } },
      }),
    );
    const installed = await INSTALL_WITH[provider](
      store,
      PROJECT_SEED_ID,
      project,
      E2E_SOURCE.sourceDir,
    );
    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);

    // Subject guards: each global's carried skill is only where its own provider copied it, and the
    // project's configuration carries its own provider's global, not the other one.
    for (const atHome of PROVIDERS) {
      expect(
        await fileExists(
          path.join(GLOBAL_SKILLS_DIR[atHome](env.fakeHome), CARRIED[atHome].id, FILES.SKILL_MD),
        ),
        `the ${atHome} global installation copied its carried skill into its own folder`,
      ).toBe(true);
      for (const other of otherThan(atHome)) {
        expect(
          await directoryExists(
            path.join(GLOBAL_SKILLS_DIR[other](env.fakeHome), CARRIED[atHome].id),
          ),
          `no ${other} folder holds a copy of the ${atHome} global's carried skill`,
        ).toBe(false);
      }
    }
    const projectConfig = await readTestFile(
      path.join(project.dir, SOURCE_FOLDER[provider], FILES.CONFIG_TS),
    );
    expect(projectConfig, `the ${provider} project carries its own provider's global`).toContain(
      CARRIED[provider].id,
    );
    for (const other of otherThan(provider)) {
      expect(
        projectConfig,
        `the ${provider} project carries nothing of the ${other} global`,
      ).not.toContain(CARRIED[other].id);
      expect(
        await directoryExists(path.join(project.dir, SOURCE_FOLDER[other])),
        `the project holds no ${other} installation`,
      ).toBe(false);
    }

    return project;
  }

  it.each(EACH_PROVIDER_AT_EACH_TERMINAL)(
    "checks the $provider project beside its own provider's global installation, exiting 0 $at",
    { timeout: TIMEOUTS.LIFECYCLE },
    async ({ provider, run }) => {
      const project = await installBothAtHomeThenTheProjectOn(provider);

      const doctor = await run(project);
      prompt = doctor.prompt;
      const { exitCode, said } = doctor;

      expect(said, "the global installation named is the one the project inherits").toContain(
        `The global installation is on ${SOURCE_FOLDER[provider]}/`,
      );
      expect(said, "the inherited global's carried skill is found where it was copied").toMatch(
        doctorRow(
          STEP_TEXT.DOCTOR_ROW_SKILLS_INSTALLED,
          STEP_TEXT.DOCTOR_STATUS_PASS,
          "3/3 eject-mode skills installed",
        ),
      );
      expect(said, "no row reports a skill missing").not.toContain("(not found");
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
    },
  );
});
