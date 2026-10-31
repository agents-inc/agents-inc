import path from "path";
import { readFile } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import {
  codexGlobalSkillsDir,
  runInitFromOnClaude,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { codexGlobalAgentsDir } from "../fixtures/codex-agent-roles.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  claudeConfigDir,
  cleanupTempDir,
  codexHome,
  fileExists,
  flattenCliOutput,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { PROVIDERS, type Provider } from "../../src/cli/consts.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/project-config.js";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";

/**
 * `edit --from` in a project under a home holding a Claude and a Codex global installation, where
 * the configuration adds an ejected skill to the global sub-agent the project inherits: the skill is
 * copied into, recorded in and compiled for the project's own provider's global installation, and
 * the other installation is left exactly as it was. Claude is the control, being also the provider
 * a home holding both would otherwise be read as. Once `uninstall --provider` at home removes the
 * project's own provider's global, the same edit creates that provider's global installation and
 * still leaves the other's exactly as it was.
 *
 * CLI-984, CLI-991.
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
  claude: "BothEdCl",
  codex: "BothEdCx",
} as const satisfies Record<Provider, string>;

const PROJECT_SEED_ID = "BothEdPj";

const EDITED_SEED_ID = "BothEdEd";

/** The skill the edit adds to the inherited global sub-agent. */
const JOINING = E2E_SKILL.zustand.id;

const INSTALL_WITH = {
  claude: runInitFromOnClaude,
  codex: runInitFromOnCodex,
} as const satisfies Record<Provider, typeof runInitFromOnClaude>;

const SOURCE_FOLDER = {
  claude: DIRS.SOURCE_CLAUDE,
  codex: DIRS.SOURCE_CODEX,
} as const satisfies Record<Provider, string>;

const GLOBAL_SKILLS_DIR = {
  claude: skillsPath,
  codex: codexGlobalSkillsDir,
} as const satisfies Record<Provider, (home: string) => string>;

const GLOBAL_AGENTS_DIR = {
  claude: agentsPath,
  codex: codexGlobalAgentsDir,
} as const satisfies Record<Provider, (home: string) => string>;

const ROLE_FILE = {
  claude: `${WEB_DEV}.md`,
  codex: `${WEB_DEV}${FILES.CODEX_AGENT_EXTENSION}`,
} as const satisfies Record<Provider, string>;

/** Where each provider's host keeps everything of a global installation but its source folder. */
const HOST_ROOT = {
  claude: claudeConfigDir,
  codex: codexHome,
} as const satisfies Record<Provider, (home: string) => string>;

type GlobalOnDisk = {
  config: string;
  skills: Record<string, TreeSnapshotEntry>;
  agents: Record<string, TreeSnapshotEntry>;
};

async function readGlobalOnDisk(home: string, atHome: Provider): Promise<GlobalOnDisk> {
  return {
    config: await readTestFile(path.join(home, SOURCE_FOLDER[atHome], FILES.CONFIG_TS)),
    skills: await readTreeSnapshot(GLOBAL_SKILLS_DIR[atHome](home)),
    agents: await readTreeSnapshot(GLOBAL_AGENTS_DIR[atHome](home)),
  };
}

/** Every file of one provider's global installation: its source folder and its host's root. */
type GlobalFootprint = {
  source: Record<string, TreeSnapshotEntry>;
  host: Record<string, TreeSnapshotEntry>;
};

async function readGlobalFootprint(home: string, atHome: Provider): Promise<GlobalFootprint> {
  return {
    source: await readTreeSnapshot(path.join(home, SOURCE_FOLDER[atHome])),
    host: await readTreeSnapshot(HOST_ROOT[atHome](home)),
  };
}

function otherThan(provider: Provider): Provider[] {
  return PROVIDERS.filter((candidate) => candidate !== provider);
}

/** Both global installations at home, the project on `provider`, and the edit it is handed. */
async function installBothAtHomeThenTheProjectOn(
  store: SeedConfigStore,
  env: TestEnvironment,
  provider: Provider,
): Promise<void> {
  const home = { dir: env.fakeHome, globalHome: env.fakeHome };
  const project = { dir: env.projectDir, globalHome: env.fakeHome };

  for (const atHome of PROVIDERS) {
    const carried = CARRIED[atHome];
    store.publish(
      GLOBAL_SEED_ID[atHome],
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
    const installed = await INSTALL_WITH[atHome](
      store,
      GLOBAL_SEED_ID[atHome],
      home,
      E2E_SOURCE.sourceDir,
    );
    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
  }

  const projectSkills = {
    [E2E_SKILL.hono.id]: buildSeedSkill(EJECTED_INTO_THE_PROJECT),
  };
  store.publish(
    PROJECT_SEED_ID,
    buildSeedPayload({
      skills: projectSkills,
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

  // The project's own skills, with the joining skill added to a global sub-agent.
  store.publish(
    EDITED_SEED_ID,
    buildSeedPayload({
      skills: { ...projectSkills, [JOINING]: ejectedGlobalSkill() },
      agents: {
        [API_DEV]: { scope: "project" },
        [WEB_DEV]: { scope: "global" },
      },
    }),
  );
}

/** As a user removes one provider's global installation: `uninstall --provider` at home. */
async function uninstallTheGlobalOf(provider: Provider, home: string): Promise<void> {
  const uninstalled = await CLI.run(["uninstall", "--yes", "--provider", provider], {
    dir: home,
    globalHome: home,
  });
  expect(uninstalled.exitCode, flattenCliOutput(uninstalled.output)).toBe(EXIT_CODES.SUCCESS);
  expect(
    await fileExists(path.join(home, SOURCE_FOLDER[provider], FILES.CONFIG_TS)),
    `subject guard: the ${provider} global installation is gone`,
  ).toBe(false);
}

/** `edit --from` at a terminal in the project, confirming the configuration it is asked about. */
async function editFromAtATerminal(
  store: SeedConfigStore,
  env: TestEnvironment,
): Promise<{ output: string; exitCode: number }> {
  const prompt = new InteractivePrompt(["edit", "--from", EDITED_SEED_ID], env.projectDir, {
    env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
  });
  try {
    await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
    await prompt.confirm();
    const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
    return { output: prompt.getOutput(), exitCode };
  } finally {
    await prompt.destroy();
  }
}

describe.each(PROVIDERS)(
  "edit --from <id> in a %s project under a home holding a Claude and a Codex global installation, adding a skill to the inherited global sub-agent",
  (provider) => {
    let store: SeedConfigStore;
    let env: TestEnvironment;
    let othersBefore: Map<Provider, GlobalOnDisk>;
    let output: string;
    let exitCode: number;

    const ownRolePath = (): string =>
      path.join(GLOBAL_AGENTS_DIR[provider](env.fakeHome), ROLE_FILE[provider]);

    beforeAll(async () => {
      store = await startSeedConfigStore();
      env = await createTestEnvironment({ permissions: false });
      await installBothAtHomeThenTheProjectOn(store, env, provider);

      othersBefore = new Map(
        await Promise.all(
          otherThan(provider).map(
            async (other) => [other, await readGlobalOnDisk(env.fakeHome, other)] as const,
          ),
        ),
      );
      expect(
        await readFile(ownRolePath(), "utf-8"),
        "subject guard: the inherited sub-agent is compiled for its own provider without the skill",
      ).not.toContain(JOINING);

      ({ output, exitCode } = await editFromAtATerminal(store, env));
    }, TIMEOUTS.EXTENDED_LIFECYCLE);

    afterAll(async () => {
      await store.close();
      await cleanupTempDir(env.tempDir);
    });

    it("applies the configuration, naming the inherited global sub-agent it changed", () => {
      expect(output).toContain(`~ ${WEB_DEV} ${STEP_TEXT.EDIT_GLOBAL_SUB_AGENT_SKILLS_ADDED}`);
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    });

    it("records the skill on the sub-agent in the project's own provider's global configuration", async () => {
      const loaded = await loadProjectConfigFromDir(env.fakeHome, provider);
      if (!loaded) throw new Error(`no ${provider} global configuration at ${env.fakeHome}`);

      expect(
        loaded.config.skills.map((skill) => skill.id).toSorted(),
        "the global keeps what it carried and gains the joining skill",
      ).toStrictEqual([E2E_SKILL.react.id, CARRIED[provider].id, JOINING].toSorted());
      expect(loaded.config.stack).toStrictEqual({
        [WEB_DEV]: {
          "web-framework": [sa(E2E_SKILL.react.id)],
          [EXTERNAL_CATEGORY]: [sa(CARRIED[provider].id)],
          "web-client-state": [sa(JOINING)],
        },
      });
    });

    it("copies the skill into the project's own provider's global skills folder", async () => {
      expect(
        await fileExists(
          path.join(GLOBAL_SKILLS_DIR[provider](env.fakeHome), JOINING, FILES.SKILL_MD),
        ),
      ).toBe(true);
    });

    it("recompiles the inherited sub-agent for the project's own provider, with the skill it gained", async () => {
      expect(await readFile(ownRolePath(), "utf-8")).toContain(JOINING);
    });

    it("leaves the other provider's global installation exactly as it was", async () => {
      for (const [other, before] of othersBefore) {
        expect(
          await readGlobalOnDisk(env.fakeHome, other),
          `the ${other} global installation is untouched`,
        ).toStrictEqual(before);
      }
    });
  },
);

describe.each(PROVIDERS)(
  "edit --from <id> in a %s project once its provider's global installation is uninstalled at home, adding a skill to a global sub-agent",
  (provider) => {
    let store: SeedConfigStore;
    let env: TestEnvironment;
    let othersBefore: Map<Provider, GlobalFootprint>;
    let output: string;
    let exitCode: number;

    beforeAll(async () => {
      store = await startSeedConfigStore();
      env = await createTestEnvironment({ permissions: false });
      await installBothAtHomeThenTheProjectOn(store, env, provider);
      await uninstallTheGlobalOf(provider, env.fakeHome);

      othersBefore = new Map(
        await Promise.all(
          otherThan(provider).map(
            async (other) => [other, await readGlobalFootprint(env.fakeHome, other)] as const,
          ),
        ),
      );
      for (const [other, before] of othersBefore) {
        expect(
          Object.keys(before.source),
          `subject guard: the ${other} global installation stays at home`,
        ).toContain(FILES.CONFIG_TS);
        expect(
          Object.keys(before.host),
          `subject guard: the ${other} global installation keeps its compiled sub-agent`,
        ).toContain(path.join(DIRS.AGENTS, ROLE_FILE[other]));
      }

      ({ output, exitCode } = await editFromAtATerminal(store, env));
    }, TIMEOUTS.EXTENDED_LIFECYCLE);

    afterAll(async () => {
      await store.close();
      await cleanupTempDir(env.tempDir);
    });

    it("applies the configuration", () => {
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    });

    it("records the skill on the sub-agent in a new global configuration of the project's own provider", async () => {
      const loaded = await loadProjectConfigFromDir(env.fakeHome, provider);
      if (!loaded) throw new Error(`no ${provider} global configuration at ${env.fakeHome}`);

      expect(loaded.config.skills.map((skill) => skill.id)).toStrictEqual([JOINING]);
      expect(loaded.config.stack).toStrictEqual({
        [WEB_DEV]: { "web-client-state": [sa(JOINING)] },
      });
    });

    it("copies the skill into the project's own provider's global skills folder", async () => {
      expect(
        await fileExists(
          path.join(GLOBAL_SKILLS_DIR[provider](env.fakeHome), JOINING, FILES.SKILL_MD),
        ),
      ).toBe(true);
    });

    it("compiles the project's own provider's global sub-agent with the skill", async () => {
      expect(
        await readFile(
          path.join(GLOBAL_AGENTS_DIR[provider](env.fakeHome), ROLE_FILE[provider]),
          "utf-8",
        ),
      ).toContain(JOINING);
    });

    it("leaves the other provider's global installation exactly as it was", async () => {
      for (const [other, before] of othersBefore) {
        expect(
          await readGlobalFootprint(env.fakeHome, other),
          `the ${other} global installation is neither read into nor written`,
        ).toStrictEqual(before);
      }
    });
  },
);
