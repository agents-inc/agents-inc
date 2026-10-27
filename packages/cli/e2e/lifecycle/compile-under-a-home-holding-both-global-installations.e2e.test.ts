import path from "path";
import { writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import {
  codexGlobalSkillsDir,
  runInitFromOnClaude,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
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
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { PROVIDERS, type Provider } from "../../src/cli/consts.js";
import { renderUnparseableMetadataYaml } from "../../src/cli/lib/__tests__/content-generators.js";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A project under a home holding a Claude and a Codex global installation, each carrying its own
 * skill no marketplace offers: `compile` reads the global installation the project inherits, its
 * own provider's, and nothing of the other. So a skill whose metadata describes nothing stops the
 * project's compile when it sits in that installation, and not when it sits in the other. Claude
 * is the control, being also the provider a home holding both would otherwise be read as.
 *
 * CLI-984.
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
  codex: {
    name: "changelog-writing",
    id: "external-web-tooling-changelog-writing",
  },
} as const satisfies Record<Provider, { name: string; id: string }>;

const GLOBAL_SEED_ID = {
  claude: "BothCmCl",
  codex: "BothCmCx",
} as const satisfies Record<Provider, string>;

const PROJECT_SEED_ID = "BothCmPj";

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

/** Mirrors the verbose line `compile` writes for the global copied-in scope it discovered. */
function globalSkillsReadFrom(dir: string): string {
  return `global local skills from ${dir}`;
}

function otherThan(provider: Provider): Provider[] {
  return PROVIDERS.filter((candidate) => candidate !== provider);
}

describe("compile in a project under a home holding a Claude and a Codex global installation", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
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

  async function installBothAtHomeThenTheProjectOn(
    provider: Provider,
  ): Promise<{ project: ProjectHandle; home: string }> {
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
        skills: {
          [E2E_SKILL.hono.id]: buildSeedSkill(EJECTED_INTO_THE_PROJECT),
        },
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
        await fileExists(carriedMetadataPath(atHome)),
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

    return { project, home: env.fakeHome };
  }

  function carriedMetadataPath(atHome: Provider): string {
    if (!env) throw new Error("no test environment: install one first");
    return path.join(
      GLOBAL_SKILLS_DIR[atHome](env.fakeHome),
      CARRIED[atHome].id,
      FILES.METADATA_YAML,
    );
  }

  /** The fault `compile` refuses over: an installed skill whose metadata describes nothing. */
  async function breakTheCarriedSkillOf(atHome: Provider): Promise<void> {
    await writeFile(carriedMetadataPath(atHome), renderUnparseableMetadataYaml());
  }

  it.each(PROVIDERS)(
    "reads the %s project's inherited global from its own provider's installation, and nothing of the other",
    { timeout: TIMEOUTS.LIFECYCLE },
    async (provider) => {
      const { project, home } = await installBothAtHomeThenTheProjectOn(provider);

      const { exitCode, output } = await CLI.run(["compile", "--verbose"], project);

      expect(
        output,
        "the global copied-in skills are read from the installation the project inherits",
      ).toContain(globalSkillsReadFrom(GLOBAL_SKILLS_DIR[provider](home)));
      for (const other of otherThan(provider)) {
        expect(output, `nothing is read from the ${other} global's skills`).not.toContain(
          GLOBAL_SKILLS_DIR[other](home),
        );
        expect(output, `nothing is read from the ${other} global's configuration`).not.toContain(
          path.join(home, SOURCE_FOLDER[other]),
        );
      }
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    },
  );

  it.each(PROVIDERS)(
    "refuses to compile the %s project over a skill in its own global installation whose metadata describes nothing",
    { timeout: TIMEOUTS.LIFECYCLE },
    async (provider) => {
      const { project } = await installBothAtHomeThenTheProjectOn(provider);
      await breakTheCarriedSkillOf(provider);

      const { exitCode, output } = await CLI.run(["compile"], project);

      expect(flattenCliOutput(output), "the refusal says what is wrong with the file").toContain(
        STEP_TEXT.COMPILE_METADATA_UNUSABLE,
      );
      expect(output, "the refusal names the inherited global's skill").toContain(
        carriedMetadataPath(provider),
      );
      expect(output, "a refused compile does not claim completion").not.toContain(
        STEP_TEXT.COMPILE_COMPLETE,
      );
      expect(exitCode, output).toBe(EXIT_CODES.ERROR);
    },
  );

  it.each(PROVIDERS)(
    "compiles the %s project although the other provider's global holds a skill whose metadata describes nothing",
    { timeout: TIMEOUTS.LIFECYCLE },
    async (provider) => {
      const { project } = await installBothAtHomeThenTheProjectOn(provider);
      for (const other of otherThan(provider)) await breakTheCarriedSkillOf(other);

      const { exitCode, output } = await CLI.run(["compile"], project);

      expect(output, "the project's compile completes").toContain(STEP_TEXT.COMPILE_COMPLETE);
      for (const other of otherThan(provider)) {
        expect(output, `nothing names the ${other} global's broken skill`).not.toContain(
          CARRIED[other].id,
        );
      }
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    },
  );
});
