import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import {
  createTestEnvironment,
  finishWizard,
  initProjectWithProjectScopedAgent,
  readActiveAgentNames,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupTempDir,
  completeWithLocalSources,
  configTypesTsPath,
  createPermissionsFile,
  listFiles,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { readGeneratedUnion } from "../../src/cli/lib/__tests__/helpers/generated-types.js";
import type { AgentName } from "../../src/cli/types/index.js";

/**
 * Journey 7 — "a global edit propagates to every registered project" — driven
 * from an empty tree, which is the one thing its two existing specs cannot do:
 * both write the global config with `buildProjectConfig` + `writeProjectConfig`
 * before launching the edit, so the propagation they prove starts from a state
 * a fixture wrote rather than one the CLI produced.
 *
 * Every phase here is a real run of the binary against a directory holding
 * nothing:
 *
 *   A. `init` at HOME through the wizard — the global install, eject mode.
 *   B. `init` in an empty project, which finds the global install and opens the
 *      dashboard; the edit behind it moves ONE sub-agent to project scope, so
 *      the project owns something of its own to compile.
 *   C. the same again in a second empty project.
 *   D. `edit` at HOME, deselecting the global `web-developer` sub-agent.
 *
 * "Every registered project" is the claim, so it takes TWO of them: a run with
 * one project cannot tell a fan-out that visits every entry of `projects[]`
 * from one that stops after the first. Both are read at every surface, and the
 * DEPARTURE is what is asserted rather than only the arrival — the removed
 * sub-agent must be gone from each project's `agents[]`, gone from each
 * project's `SelectedAgentName`, and must never have left a compiled file in
 * either. Each claim is asserted before the edit as well, so none of the
 * negatives can hold for a project that never carried the sub-agent at all.
 */

/** The global sub-agent phase D removes. Its skills stay installed; only the sub-agent goes. */
const REMOVED_GLOBAL_AGENT = E2E_AGENT["web-developer"];

/**
 * The sub-agent each project moves to its own scope in phases B and C.
 *
 * A project that keeps everything at global scope compiles nothing of its own,
 * which would leave the compiled-file surface with no subject in either project
 * and the recompile half of the fan-out unobservable.
 */
const PROJECT_SCOPED_AGENT = E2E_AGENT["api-developer"];

/** What each project compiles throughout: its own sub-agent, and never the removed one. */
const OWN_AGENT_ONLY = [`${PROJECT_SCOPED_AGENT.name}.md`];

/** The alias each project's `config-types.ts` derives from its own `agents[]`. */
const SELECTED_AGENT_ALIAS = "SelectedAgentName";

const FIRST_PROJECT = "project-one";
const SECOND_PROJECT = "project-two";

/** One project's three local surfaces, read the same way before the edit and after it. */
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
  // An asserting lookup, not a default: a project whose generated types declare no alias at all
  // would answer `false` to both questions below and satisfy every negative for free.
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

/** The `agents[]` each project carries, labelled, for a whole-collection comparison. */
function agentRosters(
  surfaces: readonly ProjectSurfaces[],
): Pick<ProjectSurfaces, "project" | "activeAgents">[] {
  return surfaces.map(({ project, activeAgents }) => ({ project, activeAgents }));
}

/** What each project's `SelectedAgentName` names, labelled, in the same shape. */
function selectedAgentClaims(
  surfaces: readonly ProjectSurfaces[],
): Pick<ProjectSurfaces, "project" | "namesRemovedAgent" | "namesOwnAgent">[] {
  return surfaces.map(({ project, namesRemovedAgent, namesOwnAgent }) => ({
    project,
    namesRemovedAgent,
    namesOwnAgent,
  }));
}

/** What each project compiles, labelled, in the same shape. */
function compiledRosters(
  surfaces: readonly ProjectSurfaces[],
): Pick<ProjectSurfaces, "project" | "compiledAgents">[] {
  return surfaces.map(({ project, compiledAgents }) => ({ project, compiledAgents }));
}

describe("a global edit propagates to every registered project, from nothing", () => {
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

    // Phase A — the global install, through the wizard, into an empty HOME.
    const globalWizard = await InitWizard.launchInGlobal({
      projectDir: globalHome,
      ...TERMINAL_SIZE.TALL,
    });
    const globalInstall = await finishWizard(await completeWithLocalSources(globalWizard));
    expect(globalInstall.exitCode, `global install failed: ${globalInstall.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );

    // Phases B and C — two empty projects registered against that install.
    for (const dir of projectDirs) {
      const registration = await initProjectWithProjectScopedAgent(
        E2E_SOURCE,
        globalHome,
        dir,
        PROJECT_SCOPED_AGENT.display,
      );
      expect(registration.exitCode, `registering ${dir} failed: ${registration.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
    }

    registeredProjects = (await loadConfigOrFail(globalHome)).projects ?? [];
    beforeEdit = await Promise.all(projectDirs.map(readProjectSurfaces));

    // Phase D — the global edit, at HOME, deselecting one global sub-agent.
    const editWizard = await EditWizard.launchInGlobal({
      projectDir: globalHome,
      source: E2E_SOURCE,
      ...TERMINAL_SIZE.TALL,
    });
    try {
      const sources = await editWizard.build.passThroughAllDomainsGeneric();
      await sources.waitForReady();
      const agents = await sources.advance();
      await agents.toggleAgent(REMOVED_GLOBAL_AGENT.display);
      const confirm = await agents.advance("edit");
      const edit = await finishWizard(await confirm.confirm());
      editExitCode = edit.exitCode;
      editOutput = edit.output;
    } catch (error) {
      await editWizard.destroy();
      throw error;
    }

    afterEdit = await Promise.all(projectDirs.map(readProjectSurfaces));
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  // The fan-out reads `globalConfig.projects` and returns early when it is empty, so a run that
  // registered one project — or none — would leave every assertion below holding for a reason
  // that has nothing to do with propagation.
  it("registers both projects against the global install before the edit", () => {
    expect(
      registeredProjects.slice().sort(),
      "the global config must name both projects as the fan-out's targets",
    ).toStrictEqual([realpathSync(firstProjectDir), realpathSync(secondProjectDir)].sort());
  });

  it("completes the global-scope edit successfully", () => {
    expect(editExitCode, `the global edit must succeed: ${editOutput}`).toBe(EXIT_CODES.SUCCESS);
  });

  // Proof of execution, and the counts are the whole point: `reportPropagatedRecompile` prints
  // nothing at all when `propagated.updated` is empty, and the pair it prints counts the
  // projects it VISITED — rewritten plus unchanged. Both projects own a sub-agent that shares
  // no skill with the removed one, so both come back byte-identical and are reported as such; a
  // fan-out that stopped after the first project would say "1 unchanged" here.
  it("reports the fan-out visiting both registered projects", () => {
    expect(editOutput, "the edit must account for both registered projects").toContain(
      `${STEP_TEXT.PROPAGATED_RECOMPILE} 0 registered projects, 2 ${STEP_TEXT.UNCHANGED}`,
    );
  });

  // The departure on the config surface, in both projects at once. `toStrictEqual` over the
  // whole collection proves the removed name is gone AND that each project's own sub-agent
  // survived AND that nothing else appeared, none of which `arrayContaining` could. The
  // before-state is asserted in the same test, so the after-state cannot hold for a project
  // that never inlined the sub-agent in the first place.
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

  // The same departure on the generated surface. Read off the emitted alias rather than the
  // whole file: the removed name also appears in `AgentName`, which the project keeps, so a
  // whole-file negative could not fail. `namesOwnAgent` is the subject guard — it holds
  // throughout, so a union that had collapsed to nothing would fail here rather than satisfy
  // the negative for free.
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

  // The compiled surface. A global sub-agent compiles at HOME and never in a project, so the
  // claim here is that propagation never gave a project a file for the one it removed — and
  // that each project's own sub-agent is still compiled afterwards, which is what says the
  // recompile ran rather than the directory simply being left alone.
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

  // All four surfaces, at both scopes and in the bystander. The global scope is where the edit
  // ran; each project is somewhere it only reached by propagating, so a project whose config
  // now names a sub-agent its own generated types never learned — or compiles one its config no
  // longer declares — fails here while every listing above still passes.
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
