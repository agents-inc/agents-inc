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
  compactCliOutput,
  directoryExists,
  fileExists,
  flattenCliOutput,
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
 * A folder holding no installation, under a home whose one installation carries a skill no
 * marketplace offers: doctor checks the installation the folder inherits under that installation's
 * own provider, so it finds the carried skill where that provider copied it and reads the
 * marketplace its configuration names. Claude is the control, being also the provider a folder
 * holding nothing would otherwise be read as.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const AT_HOME = { scope: "global" } as const;

const EJECTED_AT_HOME = {
  install: "eject",
  scope: "global",
  assignments: { [WEB_DEV]: "lazy" },
} as const;

/** Non-exclusive, so the carried skill sits beside React without the one-skill rule. */
const EXTERNAL_CATEGORY = "web-tooling";

const CARRIED_NAME = "release-notes";
const CARRIED_ID = "external-web-tooling-release-notes";

const SEED_ID = "InhrtGlb";

const INSTALL_AT_HOME = {
  claude: runInitFromOnClaude,
  codex: runInitFromOnCodex,
} as const satisfies Record<Provider, typeof runInitFromOnClaude>;

const GLOBAL_SKILLS_DIR = {
  claude: skillsPath,
  codex: codexGlobalSkillsDir,
} as const satisfies Record<Provider, (home: string) => string>;

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

describe("doctor in a folder holding no installation, under a global one carrying a skill no marketplace offers", () => {
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

  async function installAtHomeCarryingASkill(provider: Provider): Promise<ProjectHandle> {
    env = await createTestEnvironment({ permissions: false });
    const home = { dir: env.fakeHome, globalHome: env.fakeHome };
    store.publish(
      SEED_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill(EJECTED_AT_HOME),
          [CARRIED_ID]: buildSeedSkill(EJECTED_AT_HOME),
        },
        external: {
          [CARRIED_ID]: buildSeedExternalSkill({
            displayName: CARRIED_NAME,
            categoryId: EXTERNAL_CATEGORY,
            path: `skills/${CARRIED_NAME}`,
          }),
        },
        agents: { [WEB_DEV]: AT_HOME },
      }),
    );

    const installed = await INSTALL_AT_HOME[provider](store, SEED_ID, home, E2E_SOURCE.sourceDir);
    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);

    // Subject guards: the carried skill is only where this provider copied it, and the folder
    // doctor runs in holds no installation of its own.
    expect(
      await fileExists(
        path.join(GLOBAL_SKILLS_DIR[provider](env.fakeHome), CARRIED_ID, FILES.SKILL_MD),
      ),
      `the ${provider} installation copied the carried skill into its own global folder`,
    ).toBe(true);
    for (const other of PROVIDERS.filter((candidate) => candidate !== provider)) {
      expect(
        await directoryExists(path.join(GLOBAL_SKILLS_DIR[other](env.fakeHome), CARRIED_ID)),
        `no ${other} folder holds a copy of the carried skill`,
      ).toBe(false);
    }
    expect(
      await directoryExists(path.join(env.projectDir, DIRS.SOURCE_ROOT)),
      "the folder doctor runs in holds no installation",
    ).toBe(false);

    return { dir: env.projectDir, globalHome: env.fakeHome };
  }

  it.each(EACH_PROVIDER_AT_EACH_TERMINAL)(
    "checks the inherited $provider installation under its own provider, exiting 0 $at",
    { timeout: TIMEOUTS.LIFECYCLE },
    async ({ provider, run }) => {
      const project = await installAtHomeCarryingASkill(provider);

      const doctor = await run(project);
      prompt = doctor.prompt;
      const { exitCode, said } = doctor;

      // Compacted: the row runs past 120 columns, and the terminal breaks it inside the path.
      expect(compactCliOutput(said), "the inherited configuration is the one read").toContain(
        compactCliOutput(
          `${STEP_TEXT.DOCTOR_CONFIG_USING_GLOBAL} (~/${DIRS.SOURCE_ROOT}/${provider}/${FILES.CONFIG_TS})`,
        ),
      );
      expect(said, "every skill the inherited installation carries resolves").toMatch(
        doctorRow(
          STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED,
          STEP_TEXT.DOCTOR_STATUS_PASS,
          "2/2 skills found",
        ),
      );
      expect(said, "no row reports the carried skill missing").not.toContain(
        `${CARRIED_ID} (not found`,
      );
      expect(said, "the marketplace the inherited configuration names is the one read").toMatch(
        doctorRow(
          STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE,
          STEP_TEXT.DOCTOR_STATUS_PASS,
          STEP_TEXT.DOCTOR_SOURCE_LOCAL,
        ),
      );
      expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
    },
  );
});
