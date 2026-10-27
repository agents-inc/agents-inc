import path from "path";
import { writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { codexGlobalAgentsDir, codexProjectAgentsDir } from "../fixtures/codex-agent-roles.js";
import { runInitFromOnClaude, runInitFromOnCodex } from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  compactCliOutput,
  flattenCliOutput,
  listFiles,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import type { Provider } from "../../src/cli/consts.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `list` in a project under a home holding a Claude and a Codex global installation, each with a
 * sub-agent compiled in its own format. The listing counts the project's sub-agents in its own
 * provider's format and names the global agents folder of the installation the project inherits,
 * its own provider's. The config check `list` runs first reads that same global config: it refuses
 * when that one does not load, and lists when only the other provider's does not. Claude is the
 * control, being also the provider a home holding both would otherwise be read as.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const EVERY_PROVIDER = ["claude", "codex"] as const satisfies readonly Provider[];

const INSTALL_WITH = {
  claude: runInitFromOnClaude,
  codex: runInitFromOnCodex,
} as const satisfies Record<Provider, typeof runInitFromOnClaude>;

const SOURCE_FOLDER = {
  claude: DIRS.SOURCE_CLAUDE,
  codex: DIRS.SOURCE_CODEX,
} as const satisfies Record<Provider, string>;

const GLOBAL_AGENTS_DIR = {
  claude: agentsPath,
  codex: codexGlobalAgentsDir,
} as const satisfies Record<Provider, (home: string) => string>;

const PROJECT_AGENTS_DIR = {
  claude: agentsPath,
  codex: codexProjectAgentsDir,
} as const satisfies Record<Provider, (projectDir: string) => string>;

const AGENT_FILE_EXTENSION = {
  claude: ".md",
  codex: FILES.CODEX_AGENT_EXTENSION,
} as const satisfies Record<Provider, string>;

const GLOBAL_SEED_ID = "ListBthG";
const PROJECT_SEED_ID = "ListBthP";

const EJECTED_INTO_THE_PROJECT = {
  install: "eject",
  scope: "project",
  assignments: { [API_DEV]: "lazy" },
} as const;

/** One sub-agent at each scope, so a listing reading one folder too few or too many miscounts. */
const AGENTS_IN_THE_LISTING = 2;

function otherThan(provider: Provider): Provider[] {
  return EVERY_PROVIDER.filter((candidate) => candidate !== provider);
}

function agentFile(agent: string, provider: Provider): string {
  return `${agent}${AGENT_FILE_EXTENSION[provider]}`;
}

function configIn(root: string, provider: Provider): string {
  return path.join(root, SOURCE_FOLDER[provider], FILES.CONFIG_TS);
}

describe("list in a project under a home holding a Claude and a Codex global installation", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      GLOBAL_SEED_ID,
      buildSeedPayload({
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        agents: { [WEB_DEV]: { scope: "global" } },
      }),
    );
    store.publish(
      PROJECT_SEED_ID,
      buildSeedPayload({
        skills: { [E2E_SKILL.hono.id]: buildSeedSkill(EJECTED_INTO_THE_PROJECT) },
        agents: { [API_DEV]: { scope: "project" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function installBothAtHomeThenTheProjectOn(
    provider: Provider,
  ): Promise<{ home: string; project: ProjectHandle }> {
    env = await createTestEnvironment({ permissions: false });
    const home = env.fakeHome;
    const project = { dir: env.projectDir, globalHome: home };

    for (const atHome of EVERY_PROVIDER) {
      const installed = await INSTALL_WITH[atHome](
        store,
        GLOBAL_SEED_ID,
        { dir: home, globalHome: home },
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    }
    const installed = await INSTALL_WITH[provider](
      store,
      PROJECT_SEED_ID,
      project,
      E2E_SOURCE.sourceDir,
    );
    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);

    // Subject guards: each global holds its sub-agent in its own provider's format alone, and the
    // project holds its own in its provider's.
    for (const atHome of EVERY_PROVIDER) {
      expect(
        await listFiles(GLOBAL_AGENTS_DIR[atHome](home)),
        `the ${atHome} global installation compiled its sub-agent in its own format`,
      ).toStrictEqual([agentFile(WEB_DEV, atHome)]);
    }
    expect(
      await listFiles(PROJECT_AGENTS_DIR[provider](project.dir)),
      `the ${provider} project compiled its own sub-agent in its own format`,
    ).toStrictEqual([agentFile(API_DEV, provider)]);

    return { home, project };
  }

  /** The fault the config check refuses over: a global `config.ts` that does not parse. */
  async function breakTheGlobalConfigOf(provider: Provider, home: string): Promise<void> {
    await writeFile(configIn(home, provider), renderUnparseableConfigTs());
  }

  it.each(EVERY_PROVIDER)(
    "counts the %s project's sub-agents and names its own provider's global agents folder, not the other's",
    { timeout: TIMEOUTS.LIFECYCLE },
    async (provider) => {
      const { home, project } = await installBothAtHomeThenTheProjectOn(provider);

      const { exitCode, stdout } = await CLI.run(["list"], project);

      for (const other of otherThan(provider)) {
        expect(stdout, `nothing names the ${other} global's agents folder`).not.toContain(
          GLOBAL_AGENTS_DIR[other](home),
        );
      }
      // The run's stdout loses its final newline, so the blank line `list` ends on cannot close the
      // block; the end of the output does.
      const listingTail = [
        `  Agents:  ${AGENTS_IN_THE_LISTING}`,
        `  Config:  ${configIn(project.dir, provider)}`,
        `  Agents:  ${GLOBAL_AGENTS_DIR[provider](home)}`,
        `  Agents:  ${PROJECT_AGENTS_DIR[provider](project.dir)}`,
        "",
      ].join("\n");
      expect(
        stdout,
        "the count and the agents folders are the project's own and its inherited global's",
      ).toContain(listingTail);
      expect(stdout.endsWith(listingTail), "nothing is printed under the agents folders").toBe(
        true,
      );
      expect(exitCode, stdout).toBe(EXIT_CODES.SUCCESS);
    },
  );

  it.each(EVERY_PROVIDER)(
    "lists the %s project although the other provider's global config does not load",
    { timeout: TIMEOUTS.LIFECYCLE },
    async (provider) => {
      const { home, project } = await installBothAtHomeThenTheProjectOn(provider);
      for (const other of otherThan(provider)) await breakTheGlobalConfigOf(other, home);

      const { exitCode, output } = await CLI.run(["list"], project);

      for (const other of otherThan(provider)) {
        expect(
          compactCliOutput(output),
          `nothing names the ${other} global's config, which this project does not inherit`,
        ).not.toContain(compactCliOutput(configIn(home, other)));
      }
      expect(output, "the project's own installation is listed").toContain(
        `  Config:  ${configIn(project.dir, provider)}\n`,
      );
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    },
  );

  it.each(EVERY_PROVIDER)(
    "refuses to list the %s project when its own provider's global config does not load",
    { timeout: TIMEOUTS.LIFECYCLE },
    async (provider) => {
      const { home, project } = await installBothAtHomeThenTheProjectOn(provider);
      await breakTheGlobalConfigOf(provider, home);

      const { exitCode, output } = await CLI.run(["list"], project);

      expect(compactCliOutput(output), "the refusal names the inherited global's config").toContain(
        compactCliOutput(configIn(home, provider)),
      );
      expect(flattenCliOutput(output), "the refusal says which installation's config").toContain(
        STEP_TEXT.CONFIG_UNREADABLE_GLOBAL,
      );
      expect(output, "a refused run lists nothing").not.toContain(configIn(project.dir, provider));
      expect(exitCode, output).toBe(EXIT_CODES.ERROR);
    },
  );
});
