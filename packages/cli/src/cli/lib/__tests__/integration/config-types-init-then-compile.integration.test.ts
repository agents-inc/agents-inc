import path from "path";
import { mkdir, readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { STANDARD_FILES } from "../../../consts";
import { sourceFolderInUse } from "../../installation/install-layout.js";
import type { AgentName } from "../../../types";
import type { SourceLoadResult } from "../../loading/source-loader.js";
import { reconcileTypesFromDisk } from "../../config-gate/index.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { loadAgentDefs } from "../../operations/project/load-agent-defs.js";
import { writeProjectConfig } from "../../operations/project/write-project-config.js";
import {
  buildAgentConfigs,
  buildInstallSelection,
  initMatrixAndSource,
} from "../factories/config-factories.js";
import { readGeneratedUnion } from "../helpers/generated-types.js";
import { buildSkillConfigs } from "../helpers/skill-config-builders.js";
import { cleanupTestSource, createTestSource, type TestDirs } from "../fixtures/create-test-source";
import { DEFAULT_TEST_AGENTS } from "../mock-data/mock-agents";
import { FULLSTACK_TRIO_MATRIX } from "../mock-data/mock-matrices";
import { INIT_SKILL_IDS, INIT_TEST_SKILLS } from "../mock-data/mock-skills";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";

/** A sub-agent only the marketplace declares: the only shape in which the two rosters differ. */
const MARKETPLACE_ONLY_AGENT = "fixture-marketplace-only-agent";

/** Boundary cast: a marketplace's own sub-agent id is outside `AgentName`. */
const MARKETPLACE_AGENT_NAME = MARKETPLACE_ONLY_AGENT as AgentName;

/**
 * `init` and `compile` must emit the same `config-types.ts` when nothing moved in between. Held at
 * the file, not the loaders: one artefact with two producers.
 */
describe("config-types.ts written by init and refreshed by compile", () => {
  let source: TestDirs;
  let sourceResult: SourceLoadResult;
  let homeDir: string;
  let tempDir: string;
  let savedHome: string | undefined;

  function globalTypesPath(): string {
    return path.join(sourceFolderInUse(homeDir, "claude").dir, STANDARD_FILES.CONFIG_TYPES_TS);
  }

  beforeEach(async () => {
    tempDir = await createTempDir("cc-config-types-init-compile-");
    homeDir = path.join(tempDir, "home");
    await mkdir(homeDir, { recursive: true });
    // `vitest.setup.ts` spies `os.homedir()` to honour a HOME the test sets.
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
   * `writeProjectConfig` called as `init.tsx` calls it (no `agents` option). The two sub-agents
   * take different scopes so `SelectedAgentName` and `ProjectAgentName` cannot collapse unnoticed.
   */
  async function installAtHome(): Promise<void> {
    await writeProjectConfig({
      selection: buildInstallSelection(buildSkillConfigs(INIT_SKILL_IDS), {
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

  /** `compile`'s global pass, as `refreshConfigTypes` in `commands/compile.ts` runs it. */
  async function refreshAsCompileDoes(): Promise<void> {
    const loaded = await loadProjectConfigFromDir(homeDir, "claude");
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

  /** The control: with no marketplace sub-agent selected, either roster gives identical bytes. */
  it("carries the marketplace's own sub-agent, which is what the two rosters disagree about", async () => {
    await installAtHome();

    const emitted = await readFile(globalTypesPath(), "utf-8");

    expect(readGeneratedUnion(emitted, "AgentName")).toContain(MARKETPLACE_ONLY_AGENT);
  });

  /**
   * The emitted `stack` is keyed by `ProjectAgentName`, which makes assigning a project skill to a
   * global sub-agent a type error; so neither union may collapse into the other.
   */
  it("keeps SelectedAgentName and ProjectAgentName as separate unions across the refresh", async () => {
    await installAtHome();
    const afterInit = await readFile(globalTypesPath(), "utf-8");

    const loaded = await loadProjectConfigFromDir(homeDir, "claude");
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
    expect(selectedBefore).toBe(" 'fixture-marketplace-only-agent' | 'web-developer'");
    expect(projectBefore).toBe(" 'fixture-marketplace-only-agent'");
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
