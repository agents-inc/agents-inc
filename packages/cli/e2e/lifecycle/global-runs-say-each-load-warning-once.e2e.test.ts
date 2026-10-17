import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, readActiveAgentNames } from "../fixtures/dual-scope-helpers.js";
import { applyEditFrom, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL, e2eSkillId } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  createLocalSkillIn,
  createPermissionsFile,
  flattenCliOutput,
  loadConfigOrFail,
  readCompiledAgents,
  readTreeSnapshot,
  renderUnparseableMetadataYaml,
  sourceFolderIn,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, SOURCE_PATHS, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import type { AgentName, ProjectConfig, SkillSlug } from "../../src/cli/types/index.js";

/**
 * A global `compile`, `edit --from` or `doctor` says each marketplace load warning once, however
 * many projects its fan-out reloads. Two projects, asserted as visited, and each run held to what
 * it does to the installation, so saying less cannot come from doing less.
 */

/** Unparseable metadata.yaml, selected by nobody. */
const BROKEN_SKILL_ID = e2eSkillId("web-broken-metadata");

const BROKEN_FILE = `${BROKEN_SKILL_ID}/${FILES.METADATA_YAML}`;

/** Named by the marketplace's own rules but not shipped: a health finding. */
const DANGLING_SLUG = "angular-standalone" satisfies SkillSlug;

const UNPARSEABLE_SAID = `${BROKEN_FILE}': ${STEP_TEXT.MARKETPLACE_METADATA_UNPARSEABLE}`;
const HEALTH_FINDING_SAID = `${STEP_TEXT.MATRIX_HEALTH_SAID} ${STEP_TEXT.UNRESOLVED_SLUG} '${DANGLING_SLUG}'`;

/** Copied into the global installation by hand, with no metadata.yaml. */
const STRAY_SKILL = "hand-copied-skill";

const STRAY_SAID = `'${DIRS.CLAUDE}/${DIRS.SKILLS}/${STRAY_SKILL}/' ${STEP_TEXT.INSTALLED_SKILL_METADATA_MISSING}`;

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const GLOBAL_STACK_ID = "Warn39G1";

/** API Developer in the project, so each project compiles its own. */
const PROJECT_AGENT_ID = "Warn39P1";

/** Without Web Developer, which every project inlines. */
const WITHOUT_WEB_DEV_ID = "Warn39E1";

const PROJECTS = ["project-one", "project-two"] as const;

const BOTH_PROJECTS_VISITED = `${STEP_TEXT.PROPAGATED_RECOMPILE} 0 registered projects, 2 ${STEP_TEXT.UNCHANGED}`;

type ScopeState = {
  config: ProjectConfig;
  activeAgents: AgentName[];
  compiled: Record<string, string>;
};

type EveryScope = { global: ScopeState; projects: ScopeState[] };

async function readScopeState(dir: string): Promise<ScopeState> {
  return {
    config: await loadConfigOrFail(dir),
    activeAgents: (await readActiveAgentNames(dir)).slice().sort(),
    compiled: await readCompiledAgents(dir),
  };
}

/** Not the whole of HOME, where oclif's update-check plugin also keeps its version cache. */
type InstalledTrees = {
  configPair: Record<string, TreeSnapshotEntry>;
  claude: Record<string, TreeSnapshotEntry>;
};

async function readInstalledTrees(dir: string): Promise<InstalledTrees> {
  return {
    configPair: await readTreeSnapshot(sourceFolderIn(dir)),
    claude: await readTreeSnapshot(path.join(dir, DIRS.CLAUDE)),
  };
}

function expectSaidOnce(said: string, fragment: string, output: string): void {
  expect(said).toContain(fragment);
  expect(said.indexOf(fragment), `said once, not once per load:\n${output}`).toBe(
    said.lastIndexOf(fragment),
  );
}

describe("a global run says each warning once, however many projects are registered", () => {
  let marketplace: E2ESource;
  let store: SeedConfigStore;
  let tempDir: string;
  let globalHome: string;
  let projectDirs: string[];

  async function readEveryScope(): Promise<EveryScope> {
    return {
      global: await readScopeState(globalHome),
      projects: await Promise.all(projectDirs.map(readScopeState)),
    };
  }

  beforeAll(async () => {
    marketplace = await createE2ESource({
      relationships: {
        discourages: [
          {
            skills: [E2E_SKILL.react.slug, DANGLING_SLUG],
            reason: "A rule naming a skill not shipped",
          },
        ],
      },
    });
    await createLocalSkillIn(
      path.join(marketplace.sourceDir, SOURCE_PATHS.SKILLS_DIR),
      BROKEN_SKILL_ID,
      {
        description: "Shipped with a broken metadata.yaml",
        metadata: renderUnparseableMetadataYaml(),
      },
    );

    store = await startSeedConfigStore();
    store.publish(GLOBAL_STACK_ID, e2eStackPayload({ scope: "global" }));
    store.publish(PROJECT_AGENT_ID, e2eStackPayload({ scope: "global", projectAgents: [API_DEV] }));
    store.publish(
      WITHOUT_WEB_DEV_ID,
      e2eStackPayload({ scope: "global", withoutAgents: [WEB_DEV] }),
    );

    const environment = await createTestEnvironment();
    tempDir = environment.tempDir;
    globalHome = environment.fakeHome;
    projectDirs = PROJECTS.map((name) => path.join(globalHome, name));

    const globalInstall = await runInitFrom(
      store,
      GLOBAL_STACK_ID,
      { dir: globalHome },
      marketplace.sourceDir,
    );
    expect(globalInstall.exitCode, `global install failed: ${globalInstall.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );

    for (const dir of projectDirs) {
      await mkdir(dir, { recursive: true });
      await createPermissionsFile(dir);
      const registration = await runInitFrom(
        store,
        PROJECT_AGENT_ID,
        { dir, globalHome },
        marketplace.sourceDir,
      );
      expect(registration.exitCode, `registering ${dir} failed: ${registration.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
    }

    await createLocalSkillIn(path.join(globalHome, DIRS.CLAUDE, DIRS.SKILLS), STRAY_SKILL);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(marketplace);
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("registers both projects, so a global run fans out to two", async () => {
    expect(((await loadConfigOrFail(globalHome)).projects ?? []).slice().sort()).toStrictEqual(
      projectDirs.map((dir) => realpathSync(dir)).sort(),
    );
  });

  describe("compile at HOME", () => {
    let before: EveryScope;
    let after: EveryScope;
    let run: { exitCode: number; output: string };
    let said: string;

    beforeAll(async () => {
      before = await readEveryScope();
      run = await CLI.run(["compile"], { dir: globalHome }, { env: { HOME: globalHome } });
      said = flattenCliOutput(run.output);
      after = await readEveryScope();
    }, TIMEOUTS.LIFECYCLE);

    it("succeeds, having fanned out to both projects", () => {
      expect(run.exitCode, `compile at HOME failed: ${run.output}`).toBe(EXIT_CODES.SUCCESS);
      expect(said, "the fan-out reached both projects").toContain(BOTH_PROJECTS_VISITED);
    });

    it("says the unparseable file once", () => {
      expectSaidOnce(said, UNPARSEABLE_SAID, run.output);
    });

    it("says the marketplace's health finding once", () => {
      expectSaidOnce(said, HEALTH_FINDING_SAID, run.output);
    });

    it("says the global skill with no metadata.yaml once", () => {
      expectSaidOnce(said, STRAY_SAID, run.output);
    });

    it("leaves every scope's config as it was", () => {
      expect(after.global.config).toStrictEqual(before.global.config);
      expect(after.projects.map((project) => project.config)).toStrictEqual(
        before.projects.map((project) => project.config),
      );
    });

    it("recompiles the global sub-agents to the same files, and leaves each project's as they were", () => {
      expect(
        Object.keys(before.global.compiled).sort(),
        "both sub-agents compile at HOME",
      ).toStrictEqual([`${API_DEV}.md`, `${WEB_DEV}.md`]);
      expect(
        before.projects.map((project) => Object.keys(project.compiled)),
        "each project compiles its own sub-agent",
      ).toStrictEqual([[`${API_DEV}.md`], [`${API_DEV}.md`]]);

      expect(after.global.compiled).toStrictEqual(before.global.compiled);
      expect(after.projects.map((project) => project.compiled)).toStrictEqual(
        before.projects.map((project) => project.compiled),
      );
    });
  });

  describe("edit --from at HOME, leaving Web Developer out", () => {
    let before: EveryScope;
    let after: EveryScope;
    let run: { exitCode: number; output: string };
    let said: string;

    beforeAll(async () => {
      before = await readEveryScope();
      run = await applyEditFrom(store, WITHOUT_WEB_DEV_ID, { dir: globalHome });
      said = flattenCliOutput(run.output);
      after = await readEveryScope();
    }, TIMEOUTS.LIFECYCLE);

    it("succeeds, having fanned out to both projects", () => {
      expect(run.exitCode, `edit --from at HOME failed: ${run.output}`).toBe(EXIT_CODES.SUCCESS);
      expect(said, "the fan-out reached both projects").toContain(BOTH_PROJECTS_VISITED);
    });

    it("says the unparseable file once", () => {
      expectSaidOnce(said, UNPARSEABLE_SAID, run.output);
    });

    it("says the marketplace's health finding once", () => {
      expectSaidOnce(said, HEALTH_FINDING_SAID, run.output);
    });

    it("says the global skill with no metadata.yaml once", () => {
      expectSaidOnce(said, STRAY_SAID, run.output);
    });

    it("drops Web Developer from the global config and from every project's, and keeps every skill", () => {
      expect(before.global.activeAgents).toStrictEqual([API_DEV, WEB_DEV]);
      expect(before.projects.map((project) => project.activeAgents)).toStrictEqual([
        [API_DEV, WEB_DEV],
        [API_DEV, WEB_DEV],
      ]);

      expect(after.global.activeAgents).toStrictEqual([API_DEV]);
      expect(after.projects.map((project) => project.activeAgents)).toStrictEqual([
        [API_DEV],
        [API_DEV],
      ]);
      expect(after.global.config.skills, "only the sub-agent goes").toStrictEqual(
        before.global.config.skills,
      );
    });

    it("removes Web Developer's compiled file at HOME and leaves each project's sub-agent as it was", () => {
      expect(after.global.compiled).toStrictEqual({
        [`${API_DEV}.md`]: before.global.compiled[`${API_DEV}.md`],
      });
      expect(after.projects.map((project) => project.compiled)).toStrictEqual(
        before.projects.map((project) => project.compiled),
      );
    });
  });

  describe("doctor at HOME", () => {
    let before: InstalledTrees[];
    let after: InstalledTrees[];
    let run: { exitCode: number; output: string };
    let said: string;

    beforeAll(async () => {
      before = await Promise.all([globalHome, ...projectDirs].map(readInstalledTrees));
      run = await CLI.run(["doctor"], { dir: globalHome }, { env: { HOME: globalHome } });
      said = flattenCliOutput(run.output);
      after = await Promise.all([globalHome, ...projectDirs].map(readInstalledTrees));
    }, TIMEOUTS.LIFECYCLE);

    it("validates the marketplace and loads it for the reachability row", () => {
      expect(said, "doctor validated the marketplace").toContain(STEP_TEXT.DOCTOR_ROW_MARKETPLACES);
      expect(said, "and loaded it for the reachability row").toContain(
        STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE,
      );
    });

    it("says the unparseable file once", () => {
      expectSaidOnce(said, UNPARSEABLE_SAID, run.output);
    });

    it("says the marketplace's health finding once", () => {
      expectSaidOnce(said, HEALTH_FINDING_SAID, run.output);
    });

    it("writes nothing at any scope", () => {
      expect(
        before.map((trees) => [
          FILES.CONFIG_TS in trees.configPair,
          `agents/${API_DEV}.md` in trees.claude,
        ]),
        "every scope snapshotted is an installation, so an absent tree cannot pass for an unchanged one",
      ).toStrictEqual([
        [true, true],
        [true, true],
        [true, true],
      ]);
      expect(after).toStrictEqual(before);
    });
  });
});
