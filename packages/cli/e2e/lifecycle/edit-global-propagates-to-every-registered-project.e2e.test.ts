import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import { createTestEnvironment, readActiveAgentNames } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { applyEditFrom, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  configTypesTsPath,
  createPermissionsFile,
  flattenCliOutput,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  matchedAsWritten,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { readGeneratedUnion } from "../../src/cli/lib/__tests__/helpers/generated-types.js";
import type { AgentName } from "../../src/cli/types/index.js";

/** Two projects, so a fan-out that stops after the first is caught. */

/** Its skills stay installed; only the sub-agent goes. */
const REMOVED_GLOBAL_AGENT = E2E_AGENT["web-developer"];

/** Gives each project something of its own to compile, so the recompile is observable. */
const PROJECT_SCOPED_AGENT = E2E_AGENT["api-developer"];

const OWN_AGENT_ONLY = [`${PROJECT_SCOPED_AGENT.name}.md`];

const SELECTED_AGENT_ALIAS = "SelectedAgentName";

const FIRST_PROJECT = "project-one";
const SECOND_PROJECT = "project-two";

const GLOBAL_STACK_ID = "Fanout01";

const PROJECT_AGENT_ID = "Fanout02";

const WITHOUT_REMOVED_AGENT_ID = "Fanout03";

type ProjectSurfaces = {
  project: string;
  activeAgents: AgentName[];
  compiledAgents: string[];
  namesRemovedAgent: boolean;
  namesOwnAgent: boolean;
};

async function readProjectSurfaces(projectDir: string): Promise<ProjectSurfaces> {
  const generated = await readTestFile(configTypesTsPath(projectDir));
  const selectedAgents = readGeneratedUnion(generated, SELECTED_AGENT_ALIAS);
  // Asserting lookup: a missing alias would satisfy every negative below for free.
  if (selectedAgents === undefined) {
    throw new Error(`config-types.ts at ${projectDir} declares no ${SELECTED_AGENT_ALIAS} alias`);
  }

  return {
    project: path.basename(projectDir),
    activeAgents: (await readActiveAgentNames(projectDir)).slice().sort(),
    compiledAgents: await listFiles(agentsPath(projectDir)),
    namesRemovedAgent: selectedAgents.includes(REMOVED_GLOBAL_AGENT.name),
    namesOwnAgent: selectedAgents.includes(PROJECT_SCOPED_AGENT.name),
  };
}

function agentRosters(
  surfaces: readonly ProjectSurfaces[],
): Pick<ProjectSurfaces, "project" | "activeAgents">[] {
  return surfaces.map(({ project, activeAgents }) => ({ project, activeAgents }));
}

function selectedAgentClaims(
  surfaces: readonly ProjectSurfaces[],
): Pick<ProjectSurfaces, "project" | "namesRemovedAgent" | "namesOwnAgent">[] {
  return surfaces.map(({ project, namesRemovedAgent, namesOwnAgent }) => ({
    project,
    namesRemovedAgent,
    namesOwnAgent,
  }));
}

function compiledRosters(
  surfaces: readonly ProjectSurfaces[],
): Pick<ProjectSurfaces, "project" | "compiledAgents">[] {
  return surfaces.map(({ project, compiledAgents }) => ({ project, compiledAgents }));
}

describe("a global edit propagates to every registered project, from nothing", () => {
  let store: SeedConfigStore;
  let tempDir: string;

  let globalHome: string;
  let firstProjectDir: string;
  let secondProjectDir: string;

  let registeredProjects: string[];
  let beforeEdit: ProjectSurfaces[];
  let afterEdit: ProjectSurfaces[];
  let editExitCode: number;
  let editOutput: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(GLOBAL_STACK_ID, e2eStackPayload({ scope: "global" }));
    store.publish(
      PROJECT_AGENT_ID,
      e2eStackPayload({
        scope: "global",
        projectAgents: [PROJECT_SCOPED_AGENT.name],
      }),
    );
    store.publish(
      WITHOUT_REMOVED_AGENT_ID,
      e2eStackPayload({ scope: "global", withoutAgents: [REMOVED_GLOBAL_AGENT.name] }),
    );

    const environment = await createTestEnvironment();
    tempDir = environment.tempDir;
    globalHome = environment.fakeHome;
    firstProjectDir = path.join(globalHome, FIRST_PROJECT);
    secondProjectDir = path.join(globalHome, SECOND_PROJECT);
    const projectDirs = [firstProjectDir, secondProjectDir];
    for (const dir of projectDirs) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
    }

    const globalInstall = await runInitFrom(
      store,
      GLOBAL_STACK_ID,
      { dir: globalHome },
      E2E_SOURCE.sourceDir,
    );
    expect(globalInstall.exitCode, `global install failed: ${globalInstall.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );

    for (const dir of projectDirs) {
      const registration = await runInitFrom(
        store,
        PROJECT_AGENT_ID,
        { dir, globalHome },
        E2E_SOURCE.sourceDir,
      );
      expect(registration.exitCode, `registering ${dir} failed: ${registration.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
    }

    registeredProjects = (await loadConfigOrFail(globalHome)).projects ?? [];
    beforeEdit = await Promise.all(projectDirs.map(readProjectSurfaces));

    ({ exitCode: editExitCode, output: editOutput } = await applyEditFrom(
      store,
      WITHOUT_REMOVED_AGENT_ID,
      { dir: globalHome },
    ));

    afterEdit = await Promise.all(projectDirs.map(readProjectSurfaces));
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  // The fan-out returns early on an empty `projects`, so both must be registered first.
  it("registers both projects against the global install before the edit", () => {
    expect(
      registeredProjects.slice().sort(),
      "the global config must name both projects as the fan-out's targets",
    ).toStrictEqual([realpathSync(firstProjectDir), realpathSync(secondProjectDir)].sort());
  });

  it("completes the global-scope edit successfully", () => {
    expect(editExitCode, `the global edit must succeed: ${editOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  // Each registered project is recompiled; a fan-out that stopped after the first would say 1.
  it("reports the fan-out recompiling both registered projects", () => {
    expect(editOutput, "the edit must account for both registered projects").toContain(
      `${STEP_TEXT.PROPAGATED_RECOMPILE} 2 ${STEP_TEXT.PROPAGATED_RECOMPILED}\n`,
    );
  });

  it("names both registered projects the run recompiles", () => {
    const said = flattenCliOutput(editOutput);
    const named = (dir: string): RegExp =>
      new RegExp(
        `${matchedAsWritten(STEP_TEXT.SHARED_CONFIG_REGISTERED_RECOMPILED)}[\\s\\S]*${matchedAsWritten(realpathSync(dir))}`,
      );

    expect(said, "the confirm must name the first registered project").toMatch(
      named(firstProjectDir),
    );
    expect(said, "the confirm must name the second registered project").toMatch(
      named(secondProjectDir),
    );
  });

  it("drops the removed global sub-agent from every registered project's agents[]", () => {
    const bothCarried = [PROJECT_SCOPED_AGENT.name, REMOVED_GLOBAL_AGENT.name].sort();
    expect(
      agentRosters(beforeEdit),
      "both projects must start out inlining the global sub-agent beside their own",
    ).toStrictEqual([
      { project: FIRST_PROJECT, activeAgents: bothCarried },
      { project: SECOND_PROJECT, activeAgents: bothCarried },
    ]);

    expect(
      agentRosters(afterEdit),
      "every registered project must be left with its own sub-agent and no other",
    ).toStrictEqual([
      { project: FIRST_PROJECT, activeAgents: [PROJECT_SCOPED_AGENT.name] },
      { project: SECOND_PROJECT, activeAgents: [PROJECT_SCOPED_AGENT.name] },
    ]);
  });

  // Read off the alias: the removed name stays in `AgentName`, so a whole-file negative could
  // not fail.
  it("drops the removed global sub-agent from every registered project's SelectedAgentName", () => {
    expect(
      selectedAgentClaims(beforeEdit),
      `both projects' ${SELECTED_AGENT_ALIAS} must start out naming the global sub-agent`,
    ).toStrictEqual([
      { project: FIRST_PROJECT, namesRemovedAgent: true, namesOwnAgent: true },
      { project: SECOND_PROJECT, namesRemovedAgent: true, namesOwnAgent: true },
    ]);

    expect(
      selectedAgentClaims(afterEdit),
      `no project's ${SELECTED_AGENT_ALIAS} may still name the removed global sub-agent`,
    ).toStrictEqual([
      { project: FIRST_PROJECT, namesRemovedAgent: false, namesOwnAgent: true },
      { project: SECOND_PROJECT, namesRemovedAgent: false, namesOwnAgent: true },
    ]);
  });

  it("never leaves a registered project holding a file for the removed sub-agent", () => {
    const ownAgentOnly = [
      { project: FIRST_PROJECT, compiledAgents: OWN_AGENT_ONLY },
      { project: SECOND_PROJECT, compiledAgents: OWN_AGENT_ONLY },
    ];

    expect(
      compiledRosters(beforeEdit),
      "each project must compile only its own sub-agent before the edit",
    ).toStrictEqual(ownAgentOnly);

    expect(
      compiledRosters(afterEdit),
      "each project must still compile only its own sub-agent after the edit",
    ).toStrictEqual(ownAgentOnly);
  });

  it(
    "holds all four surfaces at the global scope and in both registered projects",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      await expectFourSurfaces(globalHome);
      await expectFourSurfaces(firstProjectDir, { globalHome });
      await expectFourSurfaces(secondProjectDir, { globalHome });
    },
  );
});
