import path from "path";
import { mkdir, readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../consts";
import type { AgentName } from "../../../types";
import type { SourceLoadResult } from "../../loading/source-loader.js";
import { reconcileTypesFromDisk } from "../../config-gate/index.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { loadAgentDefs } from "../../operations/project/load-agent-defs.js";
import { writeProjectConfig } from "../../operations/project/write-project-config.js";
import {
  buildAgentConfigs,
  buildWizardResult,
  initMatrixAndSource,
} from "../factories/config-factories.js";
import { readGeneratedUnion } from "../helpers/generated-types.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { cleanupTestSource, createTestSource, type TestDirs } from "../fixtures/create-test-source";
import { DEFAULT_TEST_AGENTS } from "../mock-data/mock-agents";
import { FULLSTACK_TRIO_MATRIX } from "../mock-data/mock-matrices";
import { INIT_SKILL_IDS, INIT_TEST_SKILLS } from "../mock-data/mock-skills";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";

/**
 * A sub-agent this marketplace declares and the CLI does not — the only shape in which the two
 * rosters can be told apart. The E2E and unit fixtures both ship `web-developer` /
 * `api-developer`, which the CLI also ships, so every existing fixture is blind to this by
 * construction.
 */
const MARKETPLACE_ONLY_AGENT = "fixture-marketplace-only-agent";

/**
 * The same boundary cast `buildAgentGroups` in `components/wizard/step-agents.tsx` makes, and for
 * the same reason: a marketplace's own sub-agent id is genuinely outside `AgentName`, and the
 * wizard genuinely offers one — it reads the ids off `matrix.suggestedStacks` — so a selection
 * carrying one is a state a user can actually reach.
 */
const MARKETPLACE_AGENT_NAME = MARKETPLACE_ONLY_AGENT as AgentName;

/**
 * `init` writes `config-types.ts`, `compile` refreshes it from the config already on disk, and
 * nothing about the installation moved in between — so the two runs must produce the same file.
 *
 * They did not. `init` reached `config-types.ts` through `writeProjectConfig`, which loaded
 * CLI ∪ marketplace sub-agent definitions, and `compile` reached it through `loadAgentDefs`,
 * which loads the CLI's own. The emitted `AgentName` union asks each name whether the loaded
 * roster DECLARES it, so a marketplace sub-agent was a declared one on the way in and the user's
 * own on the way out: `init` emitted a flat union and `compile` rewrote it sectioned under
 * `// Custom`, with no edit between them and nothing telling the user which file was right.
 *
 * Held at the file rather than at the loaders: the defect is one artefact with two producers, so
 * the artefact is what is pinned.
 */
describe("config-types.ts written by init and refreshed by compile", () => {
  let source: TestDirs;
  let sourceResult: SourceLoadResult;
  let homeDir: string;
  let tempDir: string;
  let savedHome: string | undefined;

  /** The global pair's types half — where a home-directory install writes the standalone unions. */
  function globalTypesPath(): string {
    return path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TYPES_TS);
  }

  beforeEach(async () => {
    tempDir = await createTempDir("cc-config-types-init-compile-");
    homeDir = path.join(tempDir, "home");
    await mkdir(homeDir, { recursive: true });
    // `vitest.setup.ts` spies `os.homedir()` to honour a HOME a test sets itself, which is what
    // makes this the home directory for `isHomeDirectory` and for the gate's `globalPairPaths`.
    savedHome = process.env.HOME;
    process.env.HOME = homeDir;

    source = await createTestSource({
      skills: INIT_TEST_SKILLS,
      agents: [
        ...DEFAULT_TEST_AGENTS,
        {
          name: MARKETPLACE_ONLY_AGENT,
          title: "Fixture Marketplace Agent",
          description: "A sub-agent only this marketplace declares",
        },
      ],
    });
    sourceResult = initMatrixAndSource(FULLSTACK_TRIO_MATRIX, source.sourceDir);
  });

  afterEach(async () => {
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    await cleanupTestSource(source);
    await cleanupTempDir(tempDir);
  });

  /**
   * A home-directory install: one standalone `config-types.ts`, no import-and-extend project half
   * to route the sub-agent unions around. `writeProjectConfig` is `init`'s own producer, called
   * exactly as `init.tsx` calls it — with no `agents` option, which is the branch that loaded the
   * marketplace-aware roster.
   *
   * The two sub-agents take DIFFERENT scopes so `SelectedAgentName` and `ProjectAgentName` have
   * different memberships. With both at one scope the two unions are the same string, and an
   * emission that collapsed one into the other would satisfy every assertion below.
   */
  async function installAtHome(): Promise<void> {
    await writeProjectConfig({
      wizardResult: buildWizardResult(buildSkillConfigs(INIT_SKILL_IDS), {
        selectedAgents: ["web-developer", MARKETPLACE_AGENT_NAME],
        agentConfigs: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs([MARKETPLACE_AGENT_NAME], { scope: "project" }),
        ],
      }),
      sourceResult,
      projectDir: homeDir,
    });
  }

  /**
   * `compile`'s global pass, verbatim from `refreshConfigTypes` in `commands/compile.ts`: the
   * config on disk is the input, the matrix is reloaded, and the sub-agent roster comes from
   * `loadAgentDefs` — the value that pass also hands its compiler.
   */
  async function refreshAsCompileDoes(): Promise<void> {
    const loaded = await loadProjectConfigFromDir(homeDir);
    expect(loaded, "init must have written a config for the refresh to read").not.toBeNull();

    await reconcileTypesFromDisk(homeDir, loaded!.config, {
      matrix: sourceResult.matrix,
      agents: (await loadAgentDefs()).agents,
    });
  }

  it("is byte-identical after a refresh that changed nothing", async () => {
    await installAtHome();
    const afterInit = await readFile(globalTypesPath(), "utf-8");

    await refreshAsCompileDoes();
    const afterRefresh = await readFile(globalTypesPath(), "utf-8");

    expect(afterRefresh).toBe(afterInit);
  });

  /**
   * The control for the assertion above, and the reason it is not vacuous: a run that selected no
   * marketplace sub-agent would be byte-identical whichever roster each producer loaded.
   */
  it("carries the marketplace's own sub-agent, which is what the two rosters disagree about", async () => {
    await installAtHome();

    const emitted = await readFile(globalTypesPath(), "utf-8");

    expect(readGeneratedUnion(emitted, "AgentName")).toContain(MARKETPLACE_ONLY_AGENT);
  });

  /**
   * `SelectedAgentName` and `ProjectAgentName` are NOT interchangeable and neither may collapse
   * into the other: the emitted `stack` is keyed by `ProjectAgentName`, and that is what makes
   * assigning a project skill to a global sub-agent a type error in a hand-written `config.ts`.
   * Held with exact members rather than a count, and at both ends of the refresh.
   */
  it("keeps SelectedAgentName and ProjectAgentName as separate unions across the refresh", async () => {
    await installAtHome();
    const afterInit = await readFile(globalTypesPath(), "utf-8");

    const loaded = await loadProjectConfigFromDir(homeDir);
    const activeNames = (loaded?.config.agents ?? [])
      .filter((agent) => !agent.excluded)
      .map((agent) => agent.name);
    const projectScopedNames = (loaded?.config.agents ?? [])
      .filter((agent) => agent.scope === "project" && !agent.excluded)
      .map((agent) => agent.name);

    expect(activeNames).toStrictEqual([MARKETPLACE_AGENT_NAME, "web-developer"]);
    expect(projectScopedNames).toStrictEqual([MARKETPLACE_AGENT_NAME]);

    const selectedBefore = readGeneratedUnion(afterInit, "SelectedAgentName");
    const projectBefore = readGeneratedUnion(afterInit, "ProjectAgentName");
    expect(selectedBefore).toBe(' "fixture-marketplace-only-agent" | "web-developer"');
    expect(projectBefore).toBe(' "fixture-marketplace-only-agent"');
    expect(
      projectBefore,
      "the two unions must not be the same string, or a collapse of one into the other reads as green",
    ).not.toBe(selectedBefore);

    await refreshAsCompileDoes();
    const afterRefresh = await readFile(globalTypesPath(), "utf-8");

    expect(readGeneratedUnion(afterRefresh, "SelectedAgentName")).toBe(selectedBefore);
    expect(readGeneratedUnion(afterRefresh, "ProjectAgentName")).toBe(projectBefore);
  });
});
