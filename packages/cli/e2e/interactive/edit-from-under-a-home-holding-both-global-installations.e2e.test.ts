import path from "path";
import { readFile } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
  cleanupTempDir,
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
 * a home holding both would otherwise be read as.
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

function otherThan(provider: Provider): Provider[] {
  return PROVIDERS.filter((candidate) => candidate !== provider);
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

      // The project's own skills, with the joining skill added to the held global sub-agent.
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

      const prompt = new InteractivePrompt(["edit", "--from", EDITED_SEED_ID], env.projectDir, {
        env: { AGENTS_INC_API_URL: store.url, HOME: env.fakeHome },
      });
      try {
        await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
        await prompt.confirm();
        exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);
        output = prompt.getOutput();
      } finally {
        await prompt.destroy();
      }
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
